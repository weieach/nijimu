import * as THREE from "three";
import { Water } from "three/examples/jsm/objects/Water2.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { currentFlowData, windNormalData } from "./windField";

export const LAKE_CAMERA = { height: 6.6, distance: 11, targetZ: -7, fov: 44 } as const;

function map(data: Uint8Array, size: number) {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

const rippleGLSL = /* glsl */ `
  uniform float lakeTime;
  uniform vec4 lakeDrops[8];
  varying vec3 lakeWorld;
  float dropHeight(vec2 p) {
    float height = 0.0;
    for (int i = 0; i < 8; i++) {
      if (lakeDrops[i].w < .001) continue;
      float age = max(0.0, lakeTime - lakeDrops[i].z);
      // Use the same current and swell as the water, rather than an isolated
      // circular ridge. The impulse stretches and disperses with the surface.
      vec2 current = texture2D(tFlowMap, p * .0091).rg * 2.0 - 1.0;
      vec2 swell = texture2D(tNormalMap0, p * .14 + vec2(.009, -.004) * lakeTime).rg - .5;
      vec2 q = p - lakeDrops[i].xy - current * age * .11;
      q += swell * .34 * min(age, 2.0);
      float radius = length(q);
      float width = .38 + age * .065;
      float front = (radius - age * .78) / width;
      // A dispersing displaced-water pulse, not a constant-frequency sine train.
      float pulse = (1.0 - front * front) * exp(-front * front * .5);
      height += pulse * .055 * exp(-age * .22) * lakeDrops[i].w;
    }
    return height;
  }
`;

/** Three's flow-map/reflection/refraction engine, with local wind spectra and
 * a short dispersive impulse superimposed on the continuously moving water.
 * The owning Canvas's frame clock controls flow, including reduced motion. */
export function createFlowLake() {
  const normal0 = map(windNormalData(256, 9047), 256);
  const normal1 = map(windNormalData(256, 5180), 256);
  const flowMap = map(currentFlowData(64), 64);
  const geometry = new THREE.PlaneGeometry(2000, 2000);
  const water = new Water(geometry, {
    color: "#e3e8df", normalMap0: normal0, normalMap1: normal1, flowMap,
    textureWidth: 512, textureHeight: 512,
    reflectivity: .24, flowSpeed: 0, scale: 1,
  });
  water.rotation.x = -Math.PI / 2;
  water.position.z = -900;
  const material = water.material;
  material.uniforms.lakeTime = { value: 0 };
  material.uniforms.lakeDrops = { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)) };
  material.vertexShader = material.vertexShader
    .replace("varying vec3 vToEye;", "varying vec3 vToEye;\nvarying vec3 lakeWorld;")
    .replace("vToEye = cameraPosition - worldPosition.xyz;", "lakeWorld = worldPosition.xyz;\nvUv = lakeWorld.xz * .14;\nvToEye = cameraPosition - worldPosition.xyz;");
  material.fragmentShader = material.fragmentShader
    .replace("void main() {", `${rippleGLSL}\nvoid main() {`)
    .replace("texture2D( tFlowMap, vUv )", "texture2D( tFlowMap, vUv * .065 )")
    .replace("// sample normal maps", /* glsl */ `
      // Advect a broad swell continuously, with small eddies bending it. The
      // two flow-map phases alone only crossfade a stationary repeating tile.
      vec2 lakeUV = vUv * scale + vec2(.009, -.004) * lakeTime;
      vec2 bend = texture2D(tNormalMap1, lakeUV * .23 - vec2(.003, .002) * lakeTime).rg - .5;
      lakeUV += bend * .19;
      float height = dropHeight(lakeWorld.xz);
      vec2 slope = vec2(height - dropHeight(lakeWorld.xz + vec2(.04, 0)),
        height - dropHeight(lakeWorld.xz + vec2(0, .04))) / .04;
      // A drop primarily bends the existing reflected wave pattern. Only a
      // small part becomes an extra normal, avoiding an embossed ring/tube.
      lakeUV += slope * .17;
      float lakeDistance = length(vToEye);
      float distantBlur = smoothstep(18.0, 85.0, lakeDistance);
      // sample normal maps`)
    .replaceAll("( vUv * scale )", "lakeUV")
    .replace("lakeUV + flow * flowMapOffset0 )", "lakeUV + flow * flowMapOffset0, distantBlur * 3.0 )")
    .replace("lakeUV + flow * flowMapOffset1 )", "lakeUV + flow * flowMapOffset1, distantBlur * 3.0 )")
    .replace("// calculate the fresnel term", /* glsl */ `
      normal.xz *= .78 * (1.0 - distantBlur * .7);
      normal = normalize(normal + vec3(slope.x, 0.0, slope.y) * .42);
      // calculate the fresnel term`)
    .replace("vec2 uv = coord.xy + coord.z * normal.xz * 0.05;", "vec2 uv = coord.xy + normal.xz * .065;")
    .replace("#include <tonemapping_fragment>", /* glsl */ `
      vec3 reflected = reflect(-toEye, normal);
      vec3 sun = normalize(vec3(-.65, .9, -1.1));
      float glint = pow(max(0.0, dot(reflected, sun)), 110.0);
      gl_FragColor.rgb += vec3(.7, .72, .7) * glint * .28;
      // Borrow the photograph's luminance, not its blue hue: pearl highlights
      // and gray-green troughs retain the lake's original restrained palette.
      float silver = dot(gl_FragColor.rgb, vec3(.2126, .7152, .0722));
      gl_FragColor.rgb = mix(vec3(silver), gl_FragColor.rgb, .04)
        * vec3(.94, 1.025, .97) + vec3(.085, .105, .092);
      float distanceMist = smoothstep(18.0, 105.0, lakeDistance);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(.72, .76, .73), distanceMist * .84);
      #include <tonemapping_fragment>`);

  const sky = new Sky();
  sky.scale.setScalar(10000);
  sky.material.uniforms.sunPosition.value.set(-.65, .9, -1.1);
  sky.material.uniforms.turbidity.value = 4.5;
  sky.material.uniforms.rayleigh.value = .75;
  sky.material.uniforms.mieCoefficient.value = .004;
  sky.material.uniforms.mieDirectionalG.value = .8;
  // The installed Sky supports soft clouds, reflected by Water2's offscreen camera.
  if (sky.material.uniforms.cloudCoverage) {
    sky.material.uniforms.cloudCoverage.value = .55;
    sky.material.uniforms.cloudDensity.value = .65;
  }

  const bed = new THREE.Mesh(new THREE.PlaneGeometry(2200, 2200), new THREE.MeshBasicMaterial({ color: "#526b60" }));
  bed.rotation.x = -Math.PI / 2;
  bed.position.set(0, -5, -900);
  const scene = new THREE.Group();
  scene.add(sky, bed, water);

  return {
    scene,
    drops: material.uniforms.lakeDrops.value as THREE.Vector4[],
    update(time: number) {
      material.uniforms.lakeTime.value = time;
      // Water2 blends two staggered advection phases, hiding each phase reset.
      const phase = (time * .012) % .15;
      material.uniforms.config.value.x = phase;
      material.uniforms.config.value.y = (phase + .075) % .15;
      if (sky.material.uniforms.time) sky.material.uniforms.time.value = time;
    },
    dispose() {
      // Texture.renderTarget is public in the installed Three version (r183).
      // Release the Water2 captures as well as the maps/meshes on route exit.
      for (const name of ["tReflectionMap", "tRefractionMap"]) {
        const texture = material.uniforms[name].value as THREE.Texture & { renderTarget?: THREE.WebGLRenderTarget };
        texture.renderTarget?.dispose();
      }
      normal0.dispose(); normal1.dispose(); flowMap.dispose();
      geometry.dispose(); material.dispose();
      sky.geometry.dispose(); sky.material.dispose();
      bed.geometry.dispose(); bed.material.dispose();
    },
  };
}
