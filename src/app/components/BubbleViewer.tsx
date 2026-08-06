import React, { useRef, useEffect, useMemo, useState, Suspense } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  MODEL_PATHS,
  buildSphereRestPose,
  easeSoftMorph,
  readFormRestPose,
} from "./SceneViewer";

/*
 * BubbleViewer — the 'bubble' rendering variant of the form-grow step.
 *
 * A soap bubble suspended in water: no lights, no environment map. The look
 * comes entirely from a fresnel shader (transparent core, dark rim), a
 * top-light / bottom-dark CSS gradient behind the transparent canvas, a slow
 * three-axis drift, and a very small standing wave rippling the surface.
 */

/* ───────── shader ───────── */

const BUBBLE_VERT = `
varying vec3 vNormalW;
varying vec3 vViewDirW;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewDirW = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}`;

const BUBBLE_FRAG = `
precision highp float;

uniform vec3 uCoreColor;
uniform vec3 uRimColor;
uniform float uCoreAlpha;
uniform float uRimAlpha;
uniform float uRimPower;
uniform float uFilmPower;
uniform float uFilmGain;

varying vec3 vNormalW;
varying vec3 vViewDirW;

void main() {
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(vViewDirW);
  // Facing the camera → 0; grazing the silhouette → 1.
  float facing = 1.0 - abs(dot(n, v));
  float rim = pow(clamp(facing, 0.0, 1.0), uRimPower);

  vec3 col = mix(uCoreColor, uRimColor, rim);
  float alpha = mix(uCoreAlpha, uRimAlpha, rim);

  // Thin bright ring just inside the silhouette — the soap-film highlight.
  float film = pow(clamp(facing, 0.0, 1.0), uFilmPower) * uFilmGain;
  col += vec3(film);
  alpha = clamp(alpha + film * 0.35, 0.0, 1.0);

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
  geometry: THREE.BufferGeometry;
  /** Pristine GLB vertices, mesh-local. */
  form: Float32Array;
  /** Matching sphere pose, mesh-local. */
  sphere: Float32Array;
  /** Form-pose normals, used to push the standing wave outward. */
  normals: Float32Array;
}

/**
 * One sphere for the whole model, not one per mesh: every part's vertices are
 * lifted into model space, projected onto a single shared sphere, then brought
 * back into each mesh's local space.
 */
function assignUnifiedSpherePose(
  parts: MorphPart[],
  matrices: THREE.Matrix4[],
): void {
  const total = parts.reduce((n, p) => n + p.form.length, 0);
  const modelSpace = new Float32Array(total);
  const v = new THREE.Vector3();

  let offset = 0;
  parts.forEach((part, pi) => {
    const m = matrices[pi];
    for (let i = 0; i < part.form.length; i += 3) {
      v.set(part.form[i], part.form[i + 1], part.form[i + 2]).applyMatrix4(m);
      modelSpace[offset + i] = v.x;
      modelSpace[offset + i + 1] = v.y;
      modelSpace[offset + i + 2] = v.z;
    }
    offset += part.form.length;
  });

  const sphereModelSpace = buildSphereRestPose(modelSpace);

  offset = 0;
  parts.forEach((part, pi) => {
    const inv = new THREE.Matrix4().copy(matrices[pi]).invert();
    for (let i = 0; i < part.form.length; i += 3) {
      v.set(
        sphereModelSpace[offset + i],
        sphereModelSpace[offset + i + 1],
        sphereModelSpace[offset + i + 2],
      ).applyMatrix4(inv);
      part.sphere[i] = v.x;
      part.sphere[i + 1] = v.y;
      part.sphere[i + 2] = v.z;
    }
    offset += part.form.length;
  });
}

/* ───────── model ───────── */

interface BubbleModelProps {
  modelPath: string;
  autoRotate: boolean;
  morphProgress: number;
  fitTargetSize: number;
  coreColor: string;
  rimColor: string;
  onBounds?: (box: THREE.Box3, sphere: THREE.Sphere) => void;
}

function BubbleModel({
  modelPath,
  autoRotate,
  morphProgress,
  fitTargetSize,
  coreColor,
  rimColor,
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

    const material = new THREE.ShaderMaterial({
      vertexShader: BUBBLE_VERT,
      fragmentShader: BUBBLE_FRAG,
      uniforms: {
        uCoreColor: { value: new THREE.Color(coreColor) },
        uRimColor: { value: new THREE.Color(rimColor) },
        // Multi-part meshes render double-sided, so shells stack and alpha
        // accumulates — the core has to stay near-invisible per layer.
        uCoreAlpha: { value: 0.07 },
        uRimAlpha: { value: 1.0 },
        uRimPower: { value: 2.6 },
        uFilmPower: { value: 14.0 },
        uFilmGain: { value: 0.4 },
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

    return () => {
      material.dispose();
      materialRef.current = null;
      parts.forEach((p) => p.geometry.dispose());
      partsRef.current = [];
    };
  }, [modelPath, scene, fitTargetSize]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = materialRef.current;
    if (!m) return;
    (m.uniforms.uCoreColor.value as THREE.Color).set(coreColor);
    (m.uniforms.uRimColor.value as THREE.Color).set(rimColor);
  }, [coreColor, rimColor]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    clock.current += delta;
    const t = clock.current;

    // Three-axis drift instead of a fixed vertical bob.
    groupRef.current.position.set(drift(t, 0), drift(t, 1), drift(t, 2));
    if (autoRotate) groupRef.current.rotation.y += delta * ROTATE_RATE;

    const mt = Math.min(1, Math.max(0, morphRef.current));
    const formBlend = easeSoftMorph(mt);
    const wpl = worldPerLocalRef.current || 1;
    const waveAmpLocal = WAVE_AMPLITUDE / wpl;

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
          Math.sin(ox * wpl * WAVE_SPATIAL[0] + t * WAVE_TEMPORAL[0]) *
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
  /**
   * Water behind the bubble: light at the top, deep at the bottom. Defaults to
   * transparent so a full-page gradient can show through without a seam.
   */
  backgroundGradient?: string;
}

export const BUBBLE_BACKGROUND =
  "linear-gradient(180deg, #ededee 0%, #c8c9ce 46%, #9a9ba3 100%)";

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
  backgroundGradient = "transparent",
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
        style={{ background: "transparent" }}
        gl={{ antialias: true, alpha: true }}
      >
        <FitCamera fitCam={fitCam} controlsRef={controlsRef} />
        <Suspense fallback={null}>
          <BubbleModel
            key={modelPath}
            modelPath={modelPath}
            autoRotate={autoRotate}
            morphProgress={morphProgress}
            fitTargetSize={fitTargetSize}
            coreColor={coreColor}
            rimColor={rimColor}
            onBounds={handleBounds}
          />
        </Suspense>
        <OrbitControls
          ref={controlsRef}
          enableZoom
          enablePan={false}
          autoRotate={false}
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
