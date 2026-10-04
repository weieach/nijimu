import { useEffect, useMemo, useRef, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  ARTIFACT_LENS,
  POND_SURFACE_GLSL,
  SURFACE_ABOVE,
  UNDERWATER_GLSL,
  createUnderwaterUniforms,
  descentEase,
  eyeDepth,
  eyePitch,
  loadSheetTexture,
  setUnderwaterStage,
} from "../lib/underwater";

/*
 * The water behind the artifact, seen from beneath the surface: the surface
 * itself overhead as a bright, moving ceiling with light gathered along its
 * folds; the picture resting on it, lit through like stained glass; soft
 * shafts slanting down and thinning with depth; the body of the water going
 * dark below. One full-screen shader, sharing its light with the artifact.
 */

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  ${UNDERWATER_GLSL}
  ${POND_SURFACE_GLSL}
  uniform vec3 uCam;
  uniform float uPitch;
  uniform float uAspect;
  uniform float uTanHalf;
  varying vec2 vUv;

  // The pond's own palette, from underneath: the paper sky it sits under, the
  // water a shade below it, and the body of the water a few shades deeper
  // still. No colour of its own — the same grey-green, only further in.
  const vec3 SKY = vec3(.888, .902, .897);
  const vec3 SHALLOW = SKY * vec3(.80, .84, .84);
  const vec3 DEEP = SKY * vec3(.56, .62, .63);
  const float FOLD_SCALE = 0.42;

  void main() {
    vec2 ndc = vUv * 2.0 - 1.0;
    vec3 dir = normalize(vec3(ndc.x * uAspect * uTanHalf, ndc.y * uTanHalf, -1.0));
    float cp = cos(uPitch), sp = sin(uPitch);
    dir = vec3(dir.x, dir.y * cp - dir.z * sp, dir.y * sp + dir.z * cp);

    float camDepth = -uCam.y;
    float sunk = smoothstep(0.0, SURFACE_ABOVE_F, camDepth);
    // The body of the water: deeper looking down, and a shade darker the
    // further the eye has sunk from the light.
    vec3 body = mix(SHALLOW, DEEP, smoothstep(0.05, -0.55, dir.y));
    body *= mix(1.0, 0.86, sunk);
    // Just under the surface its folds would fill the whole frame; keep them
    // readable there and let them open out as the eye sinks away from them.
    float foldScale = FOLD_SCALE * mix(2.4, 1.0, smoothstep(0.3, SURFACE_ABOVE_F, camDepth));

    vec3 color = body;
    float ceilingAt = -1.0;
    if (dir.y > 0.002) {
      // Toward the horizon the ceiling runs out to unreadable distances; hold
      // the sample within reach and let the haze do the rest.
      ceilingAt = -uCam.y / max(dir.y, 0.04);
      vec3 s = uCam + dir * ceilingAt;
      // The pond as the pond draws itself — swell, sun path, ribbons — shaded
      // for an eye mirrored across the water, so this is that surface from
      // beneath: the same glistening, the same folds, in the same places.
      float detail = exp(-ceilingAt * 0.12);
      vec3 mirrorEye = vec3(uCam.x, -uCam.y, uCam.z);
      vec3 ceiling = pondSurface(s.xz, mirrorEye, detail, 2.2, normalize(vec3(0.0, .7, -1.0)), 1.6);
      // Straight overhead the sky comes through a little more.
      float window = smoothstep(0.1, 0.95, dir.y);
      ceiling = mix(ceiling, SKY, window * 0.18);
      // The slower folds of light gathered on the surface, faint on top of it.
      float soften = exp(-ceilingAt * 0.04);
      float folds = mix(0.45, uwFolds(s.xz * foldScale, uTime), soften);
      ceiling += SKY * (folds - 0.45) * 0.07;
      vec4 sheet = uwSheetAt(s.xz, uGhost);
      ceiling = mix(ceiling, ceiling * sheet.rgb, sheet.a * 0.6);
      float haze = 1.0 - exp(-ceilingAt * 0.028) * smoothstep(0.0, 0.05, dir.y);
      color = mix(ceiling, body, haze);
    }

    // Shafts: the light on the surface, followed faintly down into the water,
    // thinner the deeper it goes. Where it came through the picture it carries
    // the last of the picture's colour with it.
    float reach = ceilingAt > 0.0 ? min(ceilingAt, 12.0) : 12.0;
    float jitter = uwHash(gl_FragCoord.xy);
    vec3 rays = vec3(0.0);
    const int STEPS = 8;
    for (int i = 0; i < STEPS; i++) {
      float f = (float(i) + jitter) / float(STEPS);
      float t = 0.2 + f * reach;
      vec3 p = uCam + dir * t;
      rays += uwLightAt(p, 0.0, foldScale, 0.13, 1.0) * exp(-t * 0.07);
    }
    rays /= float(STEPS);
    // Gathered where the surface light is strongest, so the shafts read as
    // shafts and not as a general lift.
    rays = pow(max(rays, 0.0), vec3(1.4));
    color += rays * SKY * 1.1;

    // The same paper grain as the pond above.
    color += (uwHash(gl_FragCoord.xy + fract(uTime) * 7.0) - 0.5) * 0.017;
    gl_FragColor = vec4(color, 1.0);
  }
`.replace(/SURFACE_ABOVE_F/g, SURFACE_ABOVE.toFixed(2));

function Water({ imageUrl, imageAspect, descentRef, reducedMotion, stage }: {
  imageUrl?: string;
  imageAspect: number;
  descentRef: RefObject<number>;
  reducedMotion: boolean;
  stage: number;
}) {
  const { size } = useThree();
  const time = useRef(0);
  const stageShown = useRef(stage);
  const uniforms = useMemo<Record<string, THREE.IUniform>>(() => ({
    ...createUnderwaterUniforms(),
    uCam: { value: new THREE.Vector3(0, -SURFACE_ABOVE, ARTIFACT_LENS.cameraZ) },
    uPitch: { value: eyePitch(1) },
    uAspect: { value: 1 },
    uTanHalf: { value: Math.tan(THREE.MathUtils.degToRad(ARTIFACT_LENS.fov / 2)) },
  }), []);

  useEffect(() => loadSheetTexture(uniforms, imageUrl, imageAspect), [uniforms, imageUrl, imageAspect]);

  useFrame((_, delta) => {
    if (!document.hidden && !reducedMotion) time.current += Math.min(delta, 0.05);
    uniforms.uTime.value = time.current;
    uniforms.uAspect.value = size.width / Math.max(1, size.height);
    const d = descentEase(descentRef.current ?? 1);
    const pitch = eyePitch(d);
    (uniforms.uCam.value as THREE.Vector3).set(0, -eyeDepth(d), ARTIFACT_LENS.cameraZ * Math.cos(pitch));
    uniforms.uPitch.value = pitch;
    stageShown.current += (stage - stageShown.current) * (1 - Math.exp(-1.6 * Math.min(delta, 0.05)));
    setUnderwaterStage(uniforms, stageShown.current);
  });

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial vertexShader={vertexShader} fragmentShader={fragmentShader} uniforms={uniforms} depthTest={false} depthWrite={false} />
    </mesh>
  );
}

export function UnderwaterScene({ imageUrl, imageAspect = 4 / 3, descentRef, reducedMotion = false, stage = 0 }: {
  imageUrl?: string;
  imageAspect?: number;
  /** 0 = just under the surface; 1 = settled at the artifact's level. */
  descentRef: RefObject<number>;
  reducedMotion?: boolean;
  /** 0 = shape, ½ = distance, 1 = feeling: the picture overhead fading as it arrives on the form. */
  stage?: number;
}) {
  return (
    <Canvas
      // Everything here is soft by nature; drawn at well under device
      // resolution it costs a fraction and reads the same once stretched.
      dpr={0.6}
      gl={{ antialias: false, alpha: false, depth: false, stencil: false }}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      <Water imageUrl={imageUrl} imageAspect={imageAspect} descentRef={descentRef} reducedMotion={reducedMotion} stage={stage} />
    </Canvas>
  );
}
