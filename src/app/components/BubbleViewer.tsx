import React, { useRef, useEffect, useMemo, useState, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  MODEL_PATHS,
  assignUnifiedSpherePose,
  easeSoftMorph,
  readFormRestPose,
} from "./SceneViewer";
import {
  MemoryPhotoTexture,
  attachMemoryPhotoOverlay,
  buildPhotoUv,
  createMemoryPhotoMaterial,
  detachMemoryPhotoOverlays,
  setMemoryPhotoFade,
  setPhotoUvAttribute,
} from "./MemoryPhotoLayer";
import { LightRig } from "./LightRig";
import {
  AmbientFill,
  DEFAULT_BUBBLE_AMBIENTS,
  DEFAULT_BUBBLE_LIGHTS,
  EditableLight,
  TransformMode,
  createBubbleLightUniforms,
  fillBubbleLightUniforms,
} from "../lib/sceneLights";

/*
 * BubbleViewer — the 'bubble' rendering variant of the form-grow step.
 *
 * A soap bubble suspended in water. Base look is a fresnel shader (transparent
 * core, dark rim) plus a CSS water gradient. Editable lights from the geometry
 * view add Lambert fill and soap-film specular, so moving gizmos retunes the
 * environment without touching the glass SceneViewer rig.
 */

/* ───────── shader ───────── */

const BUBBLE_VERT = `
varying vec3 vNormalW;
varying vec3 vViewDirW;
varying vec3 vWorldPos;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewDirW = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}`;

const BUBBLE_FRAG = `
precision highp float;

uniform vec3 uCoreColor;
uniform vec3 uRimColor;
uniform float uRoughness;
uniform float uReflectivity;
uniform float uTransparency;
uniform float uFog;
uniform vec3 uFogColor;
uniform int uLightCount;
uniform vec3 uLightPos[8];
uniform vec3 uLightColor[8];
uniform float uLightIntensity[8];
uniform float uLightKind[8];
uniform vec3 uAmbientColor;

varying vec3 vNormalW;
varying vec3 vViewDirW;
varying vec3 vWorldPos;

void main() {
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(vViewDirW);
  // Facing the camera → 0; grazing the silhouette → 1.
  float facing = 1.0 - abs(dot(n, v));

  // Defaults (0.35 / 0.55 / 0.85) reconstruct the previous hardcoded look.
  float rimPower = mix(3.3, 1.3, uRoughness);
  float filmPower = mix(20.0, 3.0, uRoughness);
  float specPower = mix(58.0, 6.0, uRoughness);
  float filmGain = 0.73 * uReflectivity;
  float specMix = 1.25 * uReflectivity;
  float rimLMix = 0.64 * uReflectivity;
  float coreAlpha = mix(0.40, 0.012, uTransparency);
  float rimAlpha = mix(1.0, 0.95, uTransparency);

  float rim = pow(clamp(facing, 0.0, 1.0), rimPower);

  vec3 col = mix(uCoreColor, uRimColor, rim);
  float alpha = mix(coreAlpha, rimAlpha, rim);

  // Thin bright ring just inside the silhouette — the soap-film highlight.
  float film = pow(clamp(facing, 0.0, 1.0), filmPower) * filmGain;
  col += vec3(film);
  alpha = clamp(alpha + film * 0.35, 0.0, 1.0);

  col += uAmbientColor;

  vec3 specAccum = vec3(0.0);
  vec3 diffAccum = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    if (i >= uLightCount) break;
    float kind = uLightKind[i];
    vec3 L;
    float atten = 1.0;
    if (kind < 0.5) {
      vec3 toL = uLightPos[i] - vWorldPos;
      float d = length(toL);
      L = toL / max(d, 0.001);
      atten = 1.0 / (1.0 + 0.12 * d + 0.02 * d * d);
    } else if (kind < 1.5) {
      // Directional: LightRig aims at the origin, so L ≈ normalize(position).
      L = normalize(uLightPos[i]);
    } else {
      vec3 toL = uLightPos[i] - vWorldPos;
      float d = length(toL);
      L = toL / max(d, 0.001);
      atten = 1.0 / (1.0 + 0.06 * d);
    }
    float ndotl = max(dot(n, L), 0.0);
    vec3 lc = uLightColor[i] * uLightIntensity[i] * atten;
    diffAccum += lc * ndotl * 0.14;
    vec3 H = normalize(L + v);
    float spec = pow(max(dot(n, H), 0.0), specPower);
    float rimL = pow(clamp(facing, 0.0, 1.0), 3.0) * ndotl;
    specAccum += lc * (spec * specMix + rimL * rimLMix);
  }
  col += diffAccum + specAccum;
  alpha = clamp(alpha + length(specAccum) * 0.18, 0.0, 1.0);

  // Distance fog toward the water midtone + a little milky facing haze.
  if (uFog > 0.001) {
    float dist = length(cameraPosition - vWorldPos);
    float density = uFog * 0.62;
    float fogDist = 1.0 - exp(-density * max(0.0, dist - 0.9));
    float fogFacing = facing * uFog * 0.35;
    float fogAmount = clamp(fogDist + fogFacing, 0.0, 1.0);
    col = mix(col, uFogColor, fogAmount);
    // Soften sharp specular in the mist; lift body so it reads as haze.
    alpha = clamp(mix(alpha, max(alpha, 0.22), fogAmount * 0.55), 0.0, 1.0);
  }

  gl_FragColor = vec4(col, alpha);
}`;

/* ───────── motion tuning ───────── */

/** Slow, non-repeating drift on all three axes — floating in water. */
const DRIFT_AMPLITUDE = 0.05;
const DRIFT_FREQ: [number, number, number] = [0.13, 0.17, 0.11];
const DRIFT_PHASE: [number, number, number] = [0.0, 1.7, 3.4];
/** Same auto-rotate rate as the glass variant. */
const ROTATE_RATE = 0.16;
/** Standing wave: large-scale, slow, barely visible. */
const WAVE_AMPLITUDE = 0.012;
const WAVE_SPATIAL: [number, number, number] = [3.4, 4.7, 5.9];
const WAVE_TEMPORAL: [number, number, number] = [0.42, 0.61, 0.83];

/** Sum of two out-of-phase sines — smoother and less periodic than one. */
function drift(t: number, axis: 0 | 1 | 2): number {
  const f = DRIFT_FREQ[axis];
  const p = DRIFT_PHASE[axis];
  return (
    (Math.sin(t * f * Math.PI * 2 + p) * 0.65 +
      Math.sin(t * f * Math.PI * 2 * 1.61 + p * 1.7) * 0.35) *
    DRIFT_AMPLITUDE
  );
}

/* ───────── morph targets ───────── */

interface MorphPart {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  /** Pristine GLB vertices, mesh-local. */
  form: Float32Array;
  /** Matching sphere pose, mesh-local. */
  sphere: Float32Array;
  /** Form-pose normals, used to push the standing wave outward. */
  normals: Float32Array;
}

/* ───────── model ───────── */

interface BubbleModelProps {
  modelPath: string;
  autoRotate: boolean;
  morphProgress: number;
  fitTargetSize: number;
  coreColor: string;
  rimColor: string;
  roughness: number;
  reflectivity: number;
  transparency: number;
  fog: number;
  photoTexture?: THREE.Texture | null;
  lightEditMode?: boolean;
  lights: EditableLight[];
  ambients: AmbientFill[];
  onBounds?: (box: THREE.Box3, sphere: THREE.Sphere) => void;
}

function BubbleModel({
  modelPath,
  autoRotate,
  morphProgress,
  fitTargetSize,
  coreColor,
  rimColor,
  roughness,
  reflectivity,
  transparency,
  fog,
  photoTexture = null,
  lightEditMode = false,
  lights,
  ambients,
  onBounds,
}: BubbleModelProps) {
  const { scene: sharedScene } = useGLTF(modelPath);
  // useGLTF hands out one shared Object3D; SceneViewer mounts the same one, and
  // an Object3D can only have a single parent — without a clone, toggling
  // variants detaches the model from whichever viewer mounted first.
  const scene = useMemo(() => sharedScene.clone(true), [sharedScene]);
  const groupRef = useRef<THREE.Group>(null!);
  const clock = useRef(0);
  /** One entry per mesh — these GLBs are multi-part, all of them must morph. */
  const partsRef = useRef<MorphPart[]>([]);
  /**
   * World units per mesh-local unit. The GLBs are authored at wildly different
   * scales, so the wave must be expressed in world units and converted back.
   */
  const worldPerLocalRef = useRef(1);
  const morphRef = useRef(morphProgress);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const photoMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const editMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const lightEditRef = useRef(lightEditMode);
  lightEditRef.current = lightEditMode;
  const prevEditRef = useRef<boolean | null>(null);

  useEffect(() => {
    morphRef.current = morphProgress;
  }, [morphProgress]);

  useEffect(() => {
    scene.position.set(0, 0, 0);
    scene.rotation.set(0, 0, 0);
    scene.scale.set(1, 1, 1);

    const box = new THREE.Box3().setFromObject(scene);
    const center = new THREE.Vector3();
    box.getCenter(center);
    scene.position.sub(center);

    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      const desiredScale = fitTargetSize / maxDim;
      scene.scale.setScalar(Math.min(Math.max(desiredScale, 0.02), 50));
      worldPerLocalRef.current = scene.scale.x;
    }

    if (onBounds) {
      const finalBox = new THREE.Box3().setFromObject(scene);
      const finalSphere = new THREE.Sphere();
      finalBox.getBoundingSphere(finalSphere);
      onBounds(finalBox, finalSphere);
    }

    const lightUniforms = createBubbleLightUniforms();
    fillBubbleLightUniforms(lightUniforms, lights, ambients);
    const material = new THREE.ShaderMaterial({
      vertexShader: BUBBLE_VERT,
      fragmentShader: BUBBLE_FRAG,
      uniforms: {
        uCoreColor: { value: new THREE.Color(coreColor) },
        uRimColor: { value: new THREE.Color(rimColor) },
        uRoughness: { value: roughness },
        uReflectivity: { value: reflectivity },
        uTransparency: { value: transparency },
        uFog: { value: fog },
        uFogColor: { value: new THREE.Color(BUBBLE_FOG_COLOR) },
        ...lightUniforms,
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    materialRef.current = material;

    const parts: MorphPart[] = [];
    const matrices: THREE.Matrix4[] = [];
    scene.updateMatrixWorld(true);
    const sceneInverse = new THREE.Matrix4().copy(scene.matrixWorld).invert();
    scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      mesh.material = material;
      mesh.castShadow = false;
      mesh.receiveShadow = false;

      // Read the rest pose from the shared geometry, then animate a private
      // copy so the two variants never overwrite each other's vertices.
      const shared = mesh.geometry as THREE.BufferGeometry;
      if (!shared.attributes.normal) shared.computeVertexNormals();
      const formPos = readFormRestPose(shared);

      const geom = shared.clone();
      mesh.geometry = geom;
      const attr = geom.attributes.position;
      (attr.array as Float32Array).set(formPos);
      attr.needsUpdate = true;
      geom.computeVertexNormals();

      parts.push({
        mesh,
        geometry: geom,
        form: formPos,
        sphere: new Float32Array(formPos.length),
        normals: Float32Array.from(
          geom.attributes.normal.array as Float32Array,
        ),
      });
      matrices.push(
        new THREE.Matrix4().multiplyMatrices(sceneInverse, mesh.matrixWorld),
      );
    });
    assignUnifiedSpherePose(parts, matrices);
    partsRef.current = parts;

    let photoMaterial: THREE.ShaderMaterial | null = null;
    if (photoTexture && !lightEditRef.current) {
      photoMaterial = createMemoryPhotoMaterial(
        photoTexture,
        1 - easeSoftMorph(morphRef.current),
      );
      photoMaterialRef.current = photoMaterial;
      parts.forEach((part, i) => {
        setPhotoUvAttribute(part.geometry, buildPhotoUv(part.sphere, matrices[i]));
        attachMemoryPhotoOverlay(part.mesh, photoMaterial!);
      });
    }

    return () => {
      detachMemoryPhotoOverlays(scene);
      photoMaterial?.dispose();
      photoMaterialRef.current = null;
      editMaterialRef.current?.dispose();
      editMaterialRef.current = null;
      material.dispose();
      materialRef.current = null;
      parts.forEach((p) => p.geometry.dispose());
      partsRef.current = [];
    };
  }, [modelPath, scene, fitTargetSize, photoTexture]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = materialRef.current;
    if (!m) return;
    (m.uniforms.uCoreColor.value as THREE.Color).set(coreColor);
    (m.uniforms.uRimColor.value as THREE.Color).set(rimColor);
  }, [coreColor, rimColor]);

  useEffect(() => {
    const m = materialRef.current;
    if (!m) return;
    m.uniforms.uRoughness.value = roughness;
    m.uniforms.uReflectivity.value = reflectivity;
    m.uniforms.uTransparency.value = transparency;
    m.uniforms.uFog.value = fog;
  }, [roughness, reflectivity, transparency, fog]);

  useEffect(() => {
    const m = materialRef.current;
    if (!m) return;
    fillBubbleLightUniforms(
      m.uniforms as unknown as ReturnType<typeof createBubbleLightUniforms>,
      lights,
      ambients,
    );
  }, [lights, ambients]);

  useEffect(() => {
    const parts = partsRef.current;
    const prev = prevEditRef.current;
    prevEditRef.current = lightEditMode;

    if (lightEditMode) {
      detachMemoryPhotoOverlays(scene);
      editMaterialRef.current?.dispose();
      const gray = new THREE.MeshBasicMaterial({
        color: "#8d8e94",
        side: THREE.DoubleSide,
      });
      editMaterialRef.current = gray;
      parts.forEach((p) => {
        p.mesh.material = gray;
      });
      if (groupRef.current) groupRef.current.position.set(0, 0, 0);
      return;
    }

    if (prev !== true) return;

    editMaterialRef.current?.dispose();
    editMaterialRef.current = null;
    const shader = materialRef.current;
    if (shader) {
      parts.forEach((p) => {
        p.mesh.material = shader;
      });
    }
    if (photoTexture) {
      if (!photoMaterialRef.current) {
        photoMaterialRef.current = createMemoryPhotoMaterial(
          photoTexture,
          1 - easeSoftMorph(morphRef.current),
        );
      }
      parts.forEach((p) => {
        attachMemoryPhotoOverlay(p.mesh, photoMaterialRef.current!);
      });
    }
  }, [lightEditMode, photoTexture, scene]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const editing = lightEditRef.current;

    if (!editing) {
      clock.current += delta;
      const t = clock.current;
      groupRef.current.position.set(drift(t, 0), drift(t, 1), drift(t, 2));
      if (autoRotate) groupRef.current.rotation.y += delta * ROTATE_RATE;
    }

    const t = clock.current;
    const mt = Math.min(1, Math.max(0, morphRef.current));
    const formBlend = easeSoftMorph(mt);
    const wpl = worldPerLocalRef.current || 1;
    const waveAmpLocal = editing ? 0 : WAVE_AMPLITUDE / wpl;

    for (const part of partsRef.current) {
      const pos = part.geometry.attributes.position;
      if (!pos) continue;
      const form = part.form;
      const sph = part.sphere;
      const norms = part.normals;
      const arr = pos.array as Float32Array;

      for (let i = 0; i < pos.count; i++) {
        const i3 = i * 3;
        const sx = sph[i3];
        const sy = sph[i3 + 1];
        const sz = sph[i3 + 2];
        const ox = form[i3];
        const oy = form[i3 + 1];
        const oz = form[i3 + 2];

        // Standing wave: the surrounding liquid nudging the film. Sampled in
        // world-equivalent coordinates so the wavelength is scale-independent.
        const wave =
          waveAmpLocal === 0
            ? 0
            : Math.sin(ox * wpl * WAVE_SPATIAL[0] + t * WAVE_TEMPORAL[0]) *
              Math.sin(oy * wpl * WAVE_SPATIAL[1] + t * WAVE_TEMPORAL[1]) *
              Math.sin(oz * wpl * WAVE_SPATIAL[2] + t * WAVE_TEMPORAL[2]) *
              waveAmpLocal;

        arr[i3] = sx + (ox - sx) * formBlend + norms[i3] * wave;
        arr[i3 + 1] = sy + (oy - sy) * formBlend + norms[i3 + 1] * wave;
        arr[i3 + 2] = sz + (oz - sz) * formBlend + norms[i3 + 2] * wave;
      }
      pos.needsUpdate = true;
      part.geometry.computeVertexNormals();
    }

    if (!editing) setMemoryPhotoFade(photoMaterialRef.current, 1 - formBlend);
  });

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  );
}

/* ───────── props ───────── */

export interface BubbleViewerProps {
  modelPath?: string;
  className?: string;
  style?: React.CSSProperties;
  autoRotate?: boolean;
  /** 0 = sphere, 1 = settled form. */
  morphProgress?: number;
  ready?: boolean;
  constrainedViewport?: boolean;
  /** Near-transparent interior tint. */
  coreColor?: string;
  /** Silhouette tint — this is what reads as "bubble edge". */
  rimColor?: string;
  roughness?: number;
  reflectivity?: number;
  transparency?: number;
  /** Distance mist toward the water midtone (0 = none). */
  fog?: number;
  /**
   * Water behind the bubble: light at the top, deep at the bottom. Defaults to
   * transparent so a full-page gradient can show through without a seam.
   */
  backgroundGradient?: string;
  /** Optional memory photo wrapped on the sphere; fades out as the form grows. */
  memoryPhotoUrl?: string;
  /** KeyShot-style geometry view: gray mesh + light helpers. */
  lightEditMode?: boolean;
  lights?: EditableLight[];
  onLightsChange?: (lights: EditableLight[]) => void;
  ambients?: AmbientFill[];
  selectedLightId?: string | null;
  onSelectLight?: (id: string | null) => void;
  transformMode?: TransformMode;
}

export const BUBBLE_BACKGROUND =
  "linear-gradient(180deg, #ededee 0%, #c8c9ce 46%, #9a9ba3 100%)";

/** Mid water tint — fog mixes toward this so the mist matches the page. */
export const BUBBLE_FOG_COLOR = "#c8c9ce";

/** Slider defaults reconstruct the previous hardcoded fresnel look. */
export const DEFAULT_BUBBLE_MATERIAL = {
  roughness: 0.35,
  reflectivity: 0.55,
  transparency: 0.85,
  fog: 0,
};

/* ───────── main ───────── */

export function BubbleViewer({
  modelPath = MODEL_PATHS[0],
  className = "",
  style = {},
  autoRotate = true,
  morphProgress = 1,
  ready: readyProp,
  constrainedViewport = false,
  // Slightly darker than the water behind it, so the body reads as glass
  // rather than as milk on a light background. Same cool-neutral family as
  // the home field (#ededee / #9b9ba3).
  coreColor = "#8a8c94",
  rimColor = "#3a3c44",
  roughness = DEFAULT_BUBBLE_MATERIAL.roughness,
  reflectivity = DEFAULT_BUBBLE_MATERIAL.reflectivity,
  transparency = DEFAULT_BUBBLE_MATERIAL.transparency,
  fog = DEFAULT_BUBBLE_MATERIAL.fog,
  backgroundGradient = "transparent",
  memoryPhotoUrl,
  lightEditMode = false,
  lights = DEFAULT_BUBBLE_LIGHTS,
  onLightsChange,
  ambients = DEFAULT_BUBBLE_AMBIENTS,
  selectedLightId = null,
  onSelectLight,
  transformMode = "translate",
}: BubbleViewerProps) {
  const fitTargetSize = constrainedViewport ? 2.2 : 2.5;
  const cameraFov = 45;
  const cameraZ = constrainedViewport ? 4.2 : 4.8;

  const ready = readyProp !== undefined ? readyProp : true;
  const controlsRef = useRef<any>(null);
  const [fitCam, setFitCam] = useState<{
    z: number;
    near: number;
    far: number;
  } | null>(null);
  const [gizmoDragging, setGizmoDragging] = useState(false);

  function handleBounds(_box: THREE.Box3, sphere: THREE.Sphere) {
    const r = Math.max(0.001, sphere.radius);
    const fovRad = (cameraFov * Math.PI) / 180;
    const margin = constrainedViewport ? 1.35 : 1.25;
    const z = (r / Math.sin(fovRad / 2)) * margin;
    setFitCam({ z, near: Math.max(0.01, z - r * 2.5), far: z + r * 6 });
  }

  const containerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    position: "relative",
    background: backgroundGradient,
    ...style,
  };

  const modelShared = {
    modelPath,
    autoRotate: autoRotate && !lightEditMode,
    morphProgress,
    fitTargetSize,
    coreColor,
    rimColor,
    roughness,
    reflectivity,
    transparency,
    fog,
    lightEditMode,
    lights,
    ambients,
    onBounds: handleBounds,
  };

  if (!ready) return <div className={className} style={containerStyle} />;

  return (
    <div className={className} style={containerStyle}>
      <Canvas
        camera={{
          position: [0, 0, fitCam?.z ?? cameraZ],
          fov: cameraFov,
          near: fitCam?.near ?? 0.1,
          far: fitCam?.far ?? 100,
        }}
        style={{ background: lightEditMode ? "#c8c8c8" : "transparent" }}
        gl={{ antialias: true, alpha: true }}
        onPointerMissed={() => {
          if (lightEditMode) onSelectLight?.(null);
        }}
      >
        <FitCamera fitCam={fitCam} controlsRef={controlsRef} />
        {lightEditMode && (
          <LightRig
            lights={lights}
            ambients={ambients}
            editMode
            selectedId={selectedLightId}
            transformMode={transformMode}
            onSelect={(id) => onSelectLight?.(id)}
            onChangeLight={(next) => {
              onLightsChange?.(
                lights.map((l) => (l.id === next.id ? next : l)),
              );
            }}
            onDragging={setGizmoDragging}
          />
        )}
        <Suspense fallback={null}>
          {memoryPhotoUrl ? (
            <MemoryPhotoTexture url={memoryPhotoUrl}>
              {(photoTexture) => (
                <BubbleModel
                  key={modelPath}
                  {...modelShared}
                  photoTexture={photoTexture}
                />
              )}
            </MemoryPhotoTexture>
          ) : (
            <BubbleModel key={modelPath} {...modelShared} />
          )}
        </Suspense>
        <OrbitControls
          ref={controlsRef}
          enableZoom
          enablePan={lightEditMode}
          autoRotate={false}
          enabled={!gizmoDragging}
        />
      </Canvas>
    </div>
  );
}

function FitCamera({
  fitCam,
  controlsRef,
}: {
  fitCam: { z: number; near: number; far: number } | null;
  controlsRef: React.MutableRefObject<any>;
}) {
  const { camera } = useThree();
  useEffect(() => {
    if (!fitCam || !camera) return;
    camera.position.set(0, 0, fitCam.z);
    (camera as THREE.PerspectiveCamera).near = fitCam.near;
    (camera as THREE.PerspectiveCamera).far = fitCam.far;
    camera.updateProjectionMatrix();
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  }, [camera, fitCam, controlsRef]);
  return null;
}
