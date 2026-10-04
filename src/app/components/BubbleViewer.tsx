import React, {
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  Suspense,
  useCallback,
} from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  ARTIFACT_TILT,
  ArtifactLighting,
  MODEL_SPACE,
  createArtifactGlassMaterial,
  easeSoftMorph,
  fitArtifact,
  tintArtifactGlass,
} from "./SceneViewer";
import { useArtifactGeometry } from "../hooks/useArtifactGeometry";
import {
  ArtifactForm,
  ArtifactMesh,
  DEFAULT_ARTIFACT_FORM,
  computeMeshNormals,
  formKey,
} from "../lib/superformula";
import {
  configureMemoryPhotoTexture,
  applyMemoryPhotoFilter,
  attachMemoryPhotoOverlay,
  buildPhotoUv,
  createMemoryPhotoMaterial,
  detachMemoryPhotoOverlays,
  MEMORY_PHOTO_FILTER_DEFAULTS,
  setMemoryPhotoFade,
  setPhotoUvAttribute,
  type MemoryPhotoFilter,
} from "./MemoryPhotoLayer";
import { FrostOverlay, vividnessToBlurPx } from "./FrostOverlay";
import { COLOR_PALETTE } from "../lib/colors";
import {
  ARTIFACT_LENS,
  PITCH_REST,
  artifactOffsetY,
  descentEase,
  eyeInArtifactFrame,
  eyePitch,
} from "../lib/underwater";

/*
 * BubbleViewer — the memory while it is still being made.
 *
 * The form is drawn in the very glass the gallery shows finished memories in
 * (SceneViewer's material and light rig), so what grows under the water is
 * what will later hang on the rim. What this viewer adds is the water around
 * it: the slow drift and standing wave of something suspended in liquid, the
 * eye sinking down to meet it on arrival, and two-finger turning.
 */

/* ───────── motion tuning ───────── */

/** Slow, non-repeating drift on all three axes — floating in water. */
const DRIFT_AMPLITUDE = 0.05;
const DRIFT_FREQ: [number, number, number] = [0.13, 0.17, 0.11];
const DRIFT_PHASE: [number, number, number] = [0.0, 1.7, 3.4];
/** How far below the page's middle the form sits under water, as a share of its height. */
const UNDERWATER_DROP = 0.08;
/** Same auto-rotate rate as the gallery. */
const ROTATE_RATE = 0.16;
/** Two-finger pitch clamp — about ±40°, like a gentle Rhino orbit stop. */
const USER_TILT_MAX = Math.PI * 0.22;
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

/* ───────── model ───────── */

/**
 * sin/cos of each vertex's three wave phases, sampled in world-equivalent
 * units so the wavelength doesn't depend on the fit scale. The standing wave
 * then needs no trig per vertex per frame.
 */
function buildWaveBasis(rest: ArtifactMesh, worldPerLocal: number): Float32Array {
  const form = rest.positions;
  const basis = new Float32Array((form.length / 3) * 6);
  for (let i = 0, b = 0; i < form.length; i += 3, b += 6) {
    for (let axis = 0; axis < 3; axis++) {
      const phase = form[i + axis] * worldPerLocal * WAVE_SPATIAL[axis];
      basis[b + axis * 2] = Math.sin(phase);
      basis[b + axis * 2 + 1] = Math.cos(phase);
    }
  }
  return basis;
}

interface BubbleModelProps {
  form: ArtifactForm;
  autoRotate: boolean;
  morphProgress: number;
  fitTargetSize: number;
  matColor: string;
  photoTexture?: THREE.Texture | null;
  photoFilter: MemoryPhotoFilter;
  /** Explicit photo visibility. Undefined preserves the legacy morph-driven fade. */
  photoFade?: number;
  onBounds?: (box: THREE.Box3, sphere: THREE.Sphere) => void;
  underwater?: UnderwaterLight | null;
}

/** The water around the form, when it grows under a surface. */
export interface UnderwaterLight {
  /** 0 = the eye has just gone under; 1 = settled level with the form. */
  descentRef: React.RefObject<number>;
  /** The picture resting on the surface — drawn by the backdrop behind the form. */
  imageUrl?: string;
  imageAspect?: number;
  /** 0 = shape, ½ = distance, 1 = feeling: how far the memory has come. */
  stage?: number;
  reducedMotion?: boolean;
  /** The form rises with the eye — held where it sits in view — instead of
   *  keeping its depth while the eye moves. */
  carried?: boolean;
}

function BubbleModel({
  form,
  autoRotate,
  morphProgress,
  fitTargetSize,
  matColor,
  photoTexture = null,
  photoFilter,
  photoFade,
  onBounds,
  underwater = null,
}: BubbleModelProps) {
  const { geometry, rest } = useArtifactGeometry(form);
  // Made once; the tint effect below keeps it current.
  const material = useMemo(() => createArtifactGlassMaterial(matColor), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => material.dispose(), [material]);
  const { scene, mesh } = useMemo(() => {
    const mesh = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(geometry, material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    const scene = new THREE.Group();
    scene.add(mesh);
    return { scene, mesh };
  }, [geometry, material]);

  const groupRef = useRef<THREE.Group>(null!);
  const carryRef = useRef<THREE.Group>(null);
  const clock = useRef(0);
  /** World units per mesh unit — the wave is sized in world units. */
  const worldPerLocalRef = useRef(1);
  const morphRef = useRef(morphProgress);
  const photoMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const photoFilterRef = useRef(photoFilter);
  photoFilterRef.current = photoFilter;
  const photoFadeRef = useRef(photoFade);
  photoFadeRef.current = photoFade;
  /** Growth pose (null = the settled form as built) and what the geometry holds now. */
  const staticRef = useRef({ blend: 1, version: 0, pose: null as Float32Array | null });
  const writtenRef = useRef({ version: 0, amp: 0, waveT: 0 });
  const waveBasisRef = useRef<Float32Array | null>(null);
  /** Pauses auto-spin while the user turns the model with two fingers. */
  const userSpinningRef = useRef(false);
  const resumeSpinTimerRef = useRef<number | null>(null);
  const { gl } = useThree();

  useEffect(() => {
    morphRef.current = morphProgress;
  }, [morphProgress]);

  // Two-finger (trackpad scroll / touch) turns the model itself — yaw + limited pitch.
  useEffect(() => {
    const el = gl.domElement;

    const markSpinning = () => {
      userSpinningRef.current = true;
      if (resumeSpinTimerRef.current !== null) {
        window.clearTimeout(resumeSpinTimerRef.current);
      }
      resumeSpinTimerRef.current = window.setTimeout(() => {
        userSpinningRef.current = false;
        resumeSpinTimerRef.current = null;
      }, 480);
    };

    const spinModel = (dx: number, dy: number) => {
      const g = groupRef.current;
      if (!g) return;
      g.rotation.y += dx;
      g.rotation.x = Math.max(
        -USER_TILT_MAX,
        Math.min(USER_TILT_MAX, g.rotation.x + dy),
      );
      markSpinning();
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Natural trackpad scroll: finger right → deltaX < 0; the surface follows.
      const sens = 0.0028;
      spinModel(e.deltaX * sens, e.deltaY * sens);
    };

    let twoFinger = false;
    let lastX = 0;
    let lastY = 0;
    const mid = (touches: TouchList) => ({
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    });

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        twoFinger = true;
        const m = mid(e.touches);
        lastX = m.x;
        lastY = m.y;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!twoFinger || e.touches.length !== 2) return;
      e.preventDefault();
      const m = mid(e.touches);
      const sens = 0.008;
      spinModel(-(m.x - lastX) * sens, -(m.y - lastY) * sens);
      lastX = m.x;
      lastY = m.y;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) twoFinger = false;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      if (resumeSpinTimerRef.current !== null) {
        window.clearTimeout(resumeSpinTimerRef.current);
        resumeSpinTimerRef.current = null;
      }
      userSpinningRef.current = false;
    };
  }, [gl]);

  useLayoutEffect(() => {
    const fit = fitArtifact(rest, fitTargetSize);
    scene.scale.setScalar(fit.scale);
    worldPerLocalRef.current = fit.scale;
    waveBasisRef.current = null;
    onBounds?.(fit.box, fit.sphere);
  }, [scene, rest, fitTargetSize]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    tintArtifactGlass(material, matColor);
  }, [material, matColor]);

  // The photo rides on the growth sphere and shares the geometry, so it
  // follows every vertex the form writes.
  useEffect(() => {
    if (!photoTexture) return;
    setPhotoUvAttribute(geometry, buildPhotoUv(rest.sphere, MODEL_SPACE));
    const photoMaterial = createMemoryPhotoMaterial(
      photoTexture,
      photoFadeRef.current ?? 1 - easeSoftMorph(morphRef.current),
      photoFilterRef.current,
    );
    photoMaterialRef.current = photoMaterial;
    attachMemoryPhotoOverlay(mesh, photoMaterial);
    return () => {
      detachMemoryPhotoOverlays(scene);
      photoMaterial.dispose();
      photoMaterialRef.current = null;
    };
  }, [scene, mesh, geometry, rest, photoTexture]);

  useEffect(() => {
    applyMemoryPhotoFilter(photoMaterialRef.current, photoFilter);
  }, [photoFilter]);

  const underwaterRef = useRef(underwater);
  underwaterRef.current = underwater;

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    clock.current += delta;
    const t = clock.current;
    groupRef.current.position.set(drift(t, 0), drift(t, 1), drift(t, 2));
    if (autoRotate && !userSpinningRef.current) {
      groupRef.current.rotation.y += delta * ROTATE_RATE;
    }

    // Under a surface the eye sinks toward the form, so until it has settled
    // the form sits higher in the frame, rising into view from below.
    // Carried, it turns with the eye's pitch instead, so it holds its place
    // and its face in view while the water swings past behind it.
    const water = underwaterRef.current;
    if (water) {
      const d = descentEase(water.descentRef.current ?? 1);
      if (water.carried) {
        if (carryRef.current) carryRef.current.rotation.x = eyePitch(d) - PITCH_REST;
      } else {
        groupRef.current.position.y += artifactOffsetY(d, ARTIFACT_LENS.cameraZ);
        if (carryRef.current) carryRef.current.rotation.x = 0;
      }
    }

    const formBlend = easeSoftMorph(Math.min(1, Math.max(0, morphRef.current)));
    const wpl = worldPerLocalRef.current || 1;
    const amp = WAVE_AMPLITUDE / wpl;
    const waveT = t;

    const s = staticRef.current;
    if (s.blend !== formBlend) {
      const form = rest.positions;
      const sph = rest.sphere;
      const pose = (s.pose ??= new Float32Array(form.length));
      for (let i = 0; i < form.length; i++) pose[i] = sph[i] + (form[i] - sph[i]) * formBlend;
      s.blend = formBlend;
      s.version++;
    }

    const w = writtenRef.current;
    if (w.version !== s.version || w.amp !== amp || w.waveT !== waveT) {
      const position = geometry.attributes.position as THREE.BufferAttribute;
      const normal = geometry.attributes.normal as THREE.BufferAttribute;
      const out = position.array as Float32Array;
      const base = s.pose ?? rest.positions;
      // Standing wave: the surrounding liquid nudging the glass, pushed out
      // along the settled form's normals. sin(a + b) expanded per axis.
      const basis = (waveBasisRef.current ??= buildWaveBasis(rest, wpl));
      const norms = rest.normals;
      const s0 = Math.sin(t * WAVE_TEMPORAL[0]);
      const c0 = Math.cos(t * WAVE_TEMPORAL[0]);
      const s1 = Math.sin(t * WAVE_TEMPORAL[1]);
      const c1 = Math.cos(t * WAVE_TEMPORAL[1]);
      const s2 = Math.sin(t * WAVE_TEMPORAL[2]);
      const c2 = Math.cos(t * WAVE_TEMPORAL[2]);
      for (let i = 0, b = 0; i < out.length; i += 3, b += 6) {
        const wave =
          (basis[b] * c0 + basis[b + 1] * s0) *
          (basis[b + 2] * c1 + basis[b + 3] * s1) *
          (basis[b + 4] * c2 + basis[b + 5] * s2) *
          amp;
        out[i] = base[i] + norms[i] * wave;
        out[i + 1] = base[i + 1] + norms[i + 1] * wave;
        out[i + 2] = base[i + 2] + norms[i + 2] * wave;
      }
      computeMeshNormals(out, rest.index, normal.array as Float32Array);
      position.needsUpdate = true;
      normal.needsUpdate = true;
      w.version = s.version;
      w.amp = amp;
      w.waveT = waveT;
    }

    setMemoryPhotoFade(photoMaterialRef.current, photoFade ?? 1 - formBlend);
  });

  return (
    <group ref={carryRef}>
      <group rotation-x={ARTIFACT_TILT}>
        <group ref={groupRef}>
          <primitive object={scene} />
        </group>
      </group>
    </group>
  );
}

/* ───────── props ───────── */

export interface BubbleViewerProps {
  /** The artifact's superformula form. */
  form?: ArtifactForm;
  className?: string;
  style?: React.CSSProperties;
  autoRotate?: boolean;
  /** 0 = sphere, 1 = settled form. */
  morphProgress?: number;
  ready?: boolean;
  constrainedViewport?: boolean;
  /** The glass tint — the same `matColor` the gallery gives a memory. */
  matColor?: string;
  /**
   * Water behind the form. Defaults to transparent so a full-page backdrop
   * can show through without a seam.
   */
  backgroundGradient?: string;
  /** Optional memory photo wrapped on the sphere; fades out as the form grows. */
  memoryPhotoUrl?: string;
  /** CSS-like grading on the photo overlay only — does not touch the glass. */
  photoFilter?: MemoryPhotoFilter;
  /** Explicit photo visibility. Undefined preserves the legacy morph-driven fade. */
  photoFade?: number;
  /** 1 = clear; 0 = fully frosted (the distance step's fading). */
  vividness?: number;
  /** When set, the form grows under a water surface and the eye sinks to it. */
  underwater?: UnderwaterLight | null;
}

export const BUBBLE_BACKGROUND =
  "linear-gradient(180deg, #ededee 0%, #c8c9ce 46%, #9a9ba3 100%)";

/** The tint a memory has before it is given a feeling — the gallery's first seat. */
export const DEFAULT_ARTIFACT_TINT = COLOR_PALETTE[0].color;

/* ───────── main ───────── */

export function BubbleViewer({
  form = DEFAULT_ARTIFACT_FORM,
  className = "",
  style = {},
  autoRotate = true,
  morphProgress = 1,
  ready: readyProp,
  constrainedViewport = false,
  matColor = DEFAULT_ARTIFACT_TINT,
  backgroundGradient = "transparent",
  memoryPhotoUrl,
  photoFilter = MEMORY_PHOTO_FILTER_DEFAULTS,
  photoFade,
  vividness = 1,
  underwater = null,
}: BubbleViewerProps) {
  const fitTargetSize = constrainedViewport ? 2.2 : 2.5;
  const cameraFov = 45;
  const cameraZ = constrainedViewport ? 4.2 : 4.8;

  const ready = readyProp !== undefined ? readyProp : true;
  const [fitCam, setFitCam] = useState<{
    z: number;
    near: number;
    far: number;
  } | null>(null);
  const [photoTexture, setPhotoTexture] = useState<THREE.Texture | null>(null);
  const onPhotoReady = useCallback((texture: THREE.Texture) => {
    setPhotoTexture(texture);
  }, []);

  useEffect(() => {
    if (!memoryPhotoUrl) setPhotoTexture(null);
  }, [memoryPhotoUrl]);

  const formId = formKey(form);
  useEffect(() => {
    setFitCam(null);
  }, [formId]);

  function handleBounds(_box: THREE.Box3, sphere: THREE.Sphere) {
    const r = Math.max(0.001, sphere.radius);
    const fovRad = (cameraFov * Math.PI) / 180;
    const margin = constrainedViewport ? 1.35 : 1.25;
    const z = (r / Math.sin(fovRad / 2)) * margin;
    setFitCam((prev) => {
      // Keep an already-settled camera when only the wrap photo changes.
      if (prev) return prev;
      return { z, near: Math.max(0.01, z - r * 2.5), far: z + r * 6 };
    });
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
        style={{ background: "transparent", touchAction: "none" }}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      >
        <FitCamera fitCam={fitCam} underwater={underwater} />
        <ArtifactLighting />
        <Suspense fallback={null}>
          {memoryPhotoUrl ? (
            <PhotoTextureLoader
              key={memoryPhotoUrl}
              url={memoryPhotoUrl}
              onReady={onPhotoReady}
            />
          ) : null}
          <BubbleModel
            key={formId}
            form={form}
            autoRotate={autoRotate}
            morphProgress={morphProgress}
            fitTargetSize={fitTargetSize}
            matColor={matColor}
            photoFilter={photoFilter}
            photoFade={photoFade}
            onBounds={handleBounds}
            underwater={underwater}
            photoTexture={photoTexture}
          />
        </Suspense>
      </Canvas>
      <FrostOverlay canvasBlurPx={vividnessToBlurPx(vividness)} />
    </div>
  );
}

function PhotoTextureLoader({
  url,
  onReady,
}: {
  url: string;
  onReady: (texture: THREE.Texture) => void;
}) {
  const texture = useLoader(THREE.TextureLoader, url);
  useLayoutEffect(() => {
    configureMemoryPhotoTexture(texture);
    onReady(texture);
  }, [texture, onReady]);
  return null;
}

function FitCamera({
  fitCam,
  underwater,
}: {
  fitCam: { z: number; near: number; far: number } | null;
  underwater?: UnderwaterLight | null;
}) {
  const { camera, size } = useThree();
  const underwaterRef = useRef(underwater);
  underwaterRef.current = underwater;
  const lowered = !!underwater;
  useEffect(() => {
    if (!fitCam || !camera) return;
    camera.position.set(0, 0, fitCam.z);
    (camera as THREE.PerspectiveCamera).near = fitCam.near;
    (camera as THREE.PerspectiveCamera).far = fitCam.far;
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0, 0);
  }, [camera, fitCam]);

  // The form sits below the middle of the page, clear of the step's words.
  // The lens window slides rather than the form moving, so the fit and the
  // eye's line to the surface stay as they are.
  useEffect(() => {
    const lens = camera as THREE.PerspectiveCamera;
    if (!lens.isPerspectiveCamera) return;
    if (lowered) {
      lens.setViewOffset(size.width, size.height, 0, -size.height * UNDERWATER_DROP, size.width, size.height);
    } else {
      lens.clearViewOffset();
    }
    return () => lens.clearViewOffset();
  }, [camera, size.width, size.height, lowered]);

  // Under water the eye is the backdrop's eye: a little below the form and
  // pitched up at it, so the form sits in the same perspective as the surface.
  useFrame(() => {
    const water = underwaterRef.current;
    if (!water) return;
    const d = descentEase(water.descentRef.current ?? 1);
    eyeInArtifactFrame(d, fitCam?.z ?? ARTIFACT_LENS.cameraZ, camera.position);
    camera.lookAt(0, 0, 0);
  });
  return null;
}
