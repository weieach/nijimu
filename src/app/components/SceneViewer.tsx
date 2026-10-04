import React, {
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  Suspense,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import * as THREE from "three";
import { getShapeBuildEvolvePhase } from "../hooks/useOscillatingEvolve";
import { useArtifactGeometry } from "../hooks/useArtifactGeometry";
import {
  ArtifactForm,
  ArtifactMesh,
  DEFAULT_ARTIFACT_FORM,
  computeMeshNormals,
  formKey,
} from "../lib/superformula";
import {
  MemoryPhotoTexture,
  attachMemoryPhotoOverlay,
  buildPhotoUv,
  createMemoryPhotoMaterial,
  detachMemoryPhotoOverlays,
  setMemoryPhotoFade,
  setPhotoUvAttribute,
} from "./MemoryPhotoLayer";
import { FrostOverlay } from "./FrostOverlay";

// Glass material presets — 5 warmth choices (cool → warm)
export interface MaterialPreset {
  id: string;
  matColor: string;
  matAttenuationColor: string;
  matSheenColor: string;
}

export const MATERIAL_PRESETS: MaterialPreset[] = [
  {
    id: "neutral",
    matColor: "#d8dce0",
    matAttenuationColor: "#b8bcc4",
    matSheenColor: "#b0c4d0",
  },
  {
    id: "purple",
    matColor: "#E5CCE5",
    matAttenuationColor: "#BEA8C8",
    matSheenColor: "#B0BCEA",
  },
  {
    id: "blue",
    matColor: "#C4C7EC",
    matAttenuationColor: "#9A9AB4",
    matSheenColor: "#898B8E",
  },
  {
    id: "green",
    matColor: "#B4E9EB",
    matAttenuationColor: "#98C3C4",
    matSheenColor: "#90DEE1",
  },
  {
    id: "red",
    matColor: "#F7E8E8",
    matAttenuationColor: "#D2B7B7",
    matSheenColor: "#F0DADA",
  },
];

// Derive a darkened hex colour for fallback attenuation / sheen
export function scaledHex(hex: string, factor: number): string {
  if (!hex.startsWith("#") || hex.length < 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const clamp = (v: number) =>
    Math.min(255, Math.max(0, Math.round(v * factor)));
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g)
    .toString(16)
    .padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`;
}

// ─── Artifact framing ───────────────────────────────────────────────────────

/**
 * A superformula form carries most of itself in its top-down cross-section —
 * a star's arms, a flower's petals — and the profile stands along y, so seen
 * level the camera would only ever get the edge. The artifact leans its top
 * toward the camera and turns about its own axis.
 */
export const ARTIFACT_TILT = 0;

/** The form is the whole model, so photo UVs read straight off its sphere. */
export const MODEL_SPACE = new THREE.Matrix4();

/** Uniform scale that fits a form to `fitTargetSize`, and the box it then fills. */
export function fitArtifact(rest: ArtifactMesh, fitTargetSize: number) {
  const maxDim = Math.max(...rest.size);
  // Guard: a degenerate form must never push the camera inside it.
  const scale = Math.min(Math.max(fitTargetSize / maxDim, 0.02), 50);
  const half = new THREE.Vector3(...rest.size).multiplyScalar(scale / 2);
  const box = new THREE.Box3(half.clone().negate(), half);
  return { scale, box, sphere: box.getBoundingSphere(new THREE.Sphere()) };
}

// ─── 3D Model ────────────────────────────────────────────────────────────────

interface ModelProps {
  form: ArtifactForm;
  matColor: string;
  matAttenuationColor: string;
  matSheenColor: string;
  autoRotate: boolean;
  floatAmplitude?: number;
  /** Carousel: settle the bob at center while navigating; undefined keeps legacy motion. */
  recenterFloat?: boolean;
  fluidity?: number;
  evolve?: number;
  bumpAmount?: number;
  bumpSpike?: number;
  density?: number;
  matOpacity?: number;
  /** Normalized max bounding-box dimension after centering (smaller = more zoom-out in frame). */
  fitTargetSize?: number;
  /** When true, evolve breathing/env motion is driven inside useFrame (shape-build oscillation). */
  oscillatingEvolve?: boolean;
  /** Hold a fixed pose: the internal clock stops advancing, so every frame
      renders the same image. For artifacts parked on screen — without it a
      canvas that only renders now and then animates in visible jerks. */
  still?: boolean;
  /** Start the pose clock at the page's own elapsed time instead of zero, so
      the same artifact mounted on a second screen carries on turning and
      drifting from where the first one left it rather than snapping to rest. */
  sharedClock?: boolean;
  /**
   * Manual morph weight: 0 = sphere rest pose, 1 = form rest pose.
   * Ignored while `introMorph` is animating internally.
   */
  morphProgress?: number;
  /** Play sphere→form morph once on mount (slow organic growth). */
  introMorph?: boolean;
  /** Duration in seconds for introMorph. */
  introMorphDuration?: number;
  /** Called after center/scale is applied, so camera can fit. */
  onBounds?: (box: THREE.Box3, sphere: THREE.Sphere) => void;
  /** Memory photo overlay; fades as the form grows. */
  photoTexture?: THREE.Texture | null;
}

/** Slow rise, soft settle — reads more like growth than a snap morph. */
function easeOrganicGrowth(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  // Quintic in-out: long quiet start, gentle middle, soft landing.
  return x < 0.5
    ? 16 * x * x * x * x * x
    : 1 - Math.pow(-2 * x + 2, 5) / 2;
}

/** Mild cubic ease for gesture-driven morph — mostly linear, soft ends. */
export function easeSoftMorph(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  const eased = x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  // Blend toward linear so it stays responsive.
  return x * 0.55 + eased * 0.45;
}

const GLASS = {
  transmission: 0.94,
  thickness: 3,
  roughness: 0.1,
  metalness: 0.4,
  ior: 1.45,
  envMapIntensity: 0.88,
  attenuationDistance: 0.55,
  sheenRoughness: 0.35,
};

/** The glass's body opacity everywhere an artifact is shown as itself. */
export const ARTIFACT_GLASS_OPACITY = 0.4;

/**
 * The one glass every artifact is made of — the gallery's, the revisit
 * pages', and the memory still being made. Attenuation and sheen follow the
 * tint unless a preset names them.
 */
export function createArtifactGlassMaterial(
  matColor: string,
  matOpacity = ARTIFACT_GLASS_OPACITY,
  matAttenuationColor = scaledHex(matColor, 0.85),
  matSheenColor = scaledHex(matColor, 0.9),
): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    ...GLASS,
    color: new THREE.Color(matColor),
    transparent: true,
    opacity: matOpacity,
    side: THREE.DoubleSide,
    attenuationColor: new THREE.Color(matAttenuationColor),
    sheenColor: new THREE.Color(matSheenColor),
  });
}

/** Retint without a program rebuild — the colours are uniforms. */
export function tintArtifactGlass(
  material: THREE.MeshPhysicalMaterial,
  matColor: string,
  matOpacity = ARTIFACT_GLASS_OPACITY,
  matAttenuationColor = scaledHex(matColor, 0.85),
  matSheenColor = scaledHex(matColor, 0.9),
): void {
  material.color.set(matColor);
  material.opacity = matOpacity;
  material.attenuationColor.set(matAttenuationColor);
  material.sheenColor.set(matSheenColor);
}

/** The light the glass is seen in, wherever it is seen. */
export function ArtifactLighting() {
  return (
    <>
      <ambientLight intensity={5} color="#758FDF" />
      <ambientLight intensity={2} color="#989BE8" />
      <directionalLight position={[6, 14, 8]} intensity={4.5} color="#ffffff" />
      <directionalLight position={[-5, 2, -3]} intensity={0.1} color="#758FDF" />
      <pointLight position={[-4, 2, 3]} intensity={1.75} color="#e2cece" distance={90} decay={0.1} />
      <pointLight position={[3, -1, 2]} intensity={1.45} color="#b0a8c4" distance={90} decay={0.1} />
      <pointLight position={[0, 4, -2]} intensity={1.15} color="#b0d0cc" distance={90} decay={0.1} />
      <Environment preset="city" environmentIntensity={1.5} />
    </>
  );
}

/**
 * Bump-texture coordinates per mesh unit. Forms are normalised to ±1, and at
 * the texture step's densities (150–500) raw coordinates would ripple faster
 * than the grid samples them — blotches, not texture. At this scale even 500
 * keeps four vertices to a ripple on the coarsest grid (128 around).
 */
const BUMP_SPACE = 0.065;
/** Fluidity wave: spatial frequency per mesh unit (sampled on the settled form). */
const WAVE_SPATIAL = 2.5;

/**
 * Sphere→form growth plus the bump texture — everything about the surface
 * that doesn't move with time. Bumps push out along the settled form's normals.
 */
function writeStaticPose(
  out: Float32Array,
  rest: ArtifactMesh,
  blend: number,
  bump: number,
  bumpSpike: number,
  density: number,
): void {
  const form = rest.positions;
  const sph = rest.sphere;
  const norms = rest.normals;
  const k = density * BUMP_SPACE;
  const exponent = 1.0 - bumpSpike * 0.98;
  for (let i = 0; i < form.length; i += 3) {
    const ox = form[i];
    const oy = form[i + 1];
    const oz = form[i + 2];
    let px = sph[i] + (ox - sph[i]) * blend;
    let py = sph[i + 1] + (oy - sph[i + 1]) * blend;
    let pz = sph[i + 2] + (oz - sph[i + 2]) * blend;
    if (bump > 0) {
      const raw =
        (Math.sin(ox * k) * Math.cos(oy * k) +
          Math.sin(oy * k) * Math.cos(oz * k) +
          Math.sin(oz * k) * Math.cos(ox * k)) /
        3;
      if (raw > 0) {
        const amount = Math.pow(raw, exponent) * bump * 0.25;
        px += norms[i] * amount;
        py += norms[i + 1] * amount;
        pz += norms[i + 2] * amount;
      }
    }
    out[i] = px;
    out[i + 1] = py;
    out[i + 2] = pz;
  }
}

/** sin/cos of every vertex's wave phase, so the per-frame wave needs no trig per vertex. */
function buildWaveBasis(rest: ArtifactMesh): Float32Array {
  const form = rest.positions;
  const basis = new Float32Array((form.length / 3) * 4);
  for (let i = 0, b = 0; i < form.length; i += 3, b += 4) {
    basis[b] = Math.sin(form[i] * WAVE_SPATIAL);
    basis[b + 1] = Math.cos(form[i] * WAVE_SPATIAL);
    basis[b + 2] = Math.sin(form[i + 2] * WAVE_SPATIAL);
    basis[b + 3] = Math.cos(form[i + 2] * WAVE_SPATIAL);
  }
  return basis;
}

function Model({
  form,
  matColor,
  matAttenuationColor,
  matSheenColor,
  autoRotate,
  floatAmplitude = 0.08,
  recenterFloat,
  fluidity = 0,
  evolve = 0,
  bumpAmount = 0,
  bumpSpike = 0,
  density = 200,
  matOpacity = 0.1,
  fitTargetSize = 2.5,
  oscillatingEvolve = false,
  still = false,
  sharedClock = false,
  morphProgress = 1,
  introMorph = false,
  introMorphDuration = 5.5,
  onBounds,
  photoTexture = null,
}: ModelProps) {
  const { geometry, rest } = useArtifactGeometry(form);
  const material = useMemo(
    () => createArtifactGlassMaterial(matColor, matOpacity, matAttenuationColor, matSheenColor),
    [], // eslint-disable-line react-hooks/exhaustive-deps -- tints follow below
  );
  useEffect(() => () => material.dispose(), [material]);
  const { scene, mesh } = useMemo(() => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    const scene = new THREE.Group();
    scene.add(mesh);
    return { scene, mesh };
  }, [geometry, material]);

  const { scene: threeScene } = useThree();
  const groupRef = useRef<THREE.Group>(null!);
  /** Angle the form holds beyond the shared clock, so pausing and resuming the
   *  auto-turn is continuous instead of a jump to the clock's own angle. */
  const spinOffsetRef = useRef(0);
  // Seeded from the page clock when the pose has to continue across a route
  // change; the artifact then starts mid-motion rather than at rest.
  const clock = useRef(sharedClock ? performance.now() / 1000 : 0);
  const floatClock = useRef(0);
  const photoMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const morphRef = useRef(introMorph ? 0 : morphProgress);
  const introMorphRef = useRef(introMorph);
  const introDurationRef = useRef(introMorphDuration);
  const oscillatingEvolveRef = useRef(oscillatingEvolve);
  useLayoutEffect(() => {
    oscillatingEvolveRef.current = oscillatingEvolve;
  }, [oscillatingEvolve]);
  const stillRef = useRef(still);
  useLayoutEffect(() => {
    stillRef.current = still;
  }, [still]);
  useLayoutEffect(() => {
    introMorphRef.current = introMorph;
    introDurationRef.current = introMorphDuration;
    if (introMorph) morphRef.current = 0;
  }, [introMorph, introMorphDuration]);
  useLayoutEffect(() => {
    if (!introMorphRef.current) morphRef.current = morphProgress;
  }, [morphProgress]);

  /**
   * The vertices are rewritten only when the pose actually changes. A settled
   * artifact with no fluidity — a parked carousel neighbour, a still preview —
   * costs nothing per frame. `staticRef` holds growth + bumps (pose null =
   * the settled form as built); `writtenRef` is what the geometry holds now.
   */
  const staticRef = useRef({
    blend: 1,
    bump: 0,
    spike: 0,
    density: 0,
    version: 0,
    pose: null as Float32Array | null,
  });
  const writtenRef = useRef({ version: 0, fluid: 0, waveT: 0 });
  const waveBasisRef = useRef<Float32Array | null>(null);

  // Center/scale the form and report bounds for the camera fit.
  useLayoutEffect(() => {
    const fit = fitArtifact(rest, fitTargetSize);
    scene.scale.setScalar(fit.scale);
    onBounds?.(fit.box, fit.sphere);
  }, [scene, rest, fitTargetSize]); // eslint-disable-line react-hooks/exhaustive-deps

  // Memory photo wrapped on the growth sphere; it shares the geometry, so it
  // follows every vertex the form writes.
  useEffect(() => {
    if (!photoTexture) return;
    setPhotoUvAttribute(geometry, buildPhotoUv(rest.sphere, MODEL_SPACE));
    const photoMaterial = createMemoryPhotoMaterial(
      photoTexture,
      1 - easeSoftMorph(morphRef.current),
    );
    photoMaterialRef.current = photoMaterial;
    attachMemoryPhotoOverlay(mesh, photoMaterial);
    return () => {
      detachMemoryPhotoOverlays(scene);
      photoMaterial.dispose();
      photoMaterialRef.current = null;
    };
  }, [scene, mesh, geometry, rest, photoTexture]);

  // Tints are uniforms — no program rebuild, so no needsUpdate.
  useLayoutEffect(() => {
    tintArtifactGlass(material, matColor, matOpacity, matAttenuationColor, matSheenColor);
  }, [material, matColor, matAttenuationColor, matSheenColor, matOpacity]);

  useFrame((_, rawDelta) => {
    if (!groupRef.current) return;
    // A canvas that draws on demand hands back the whole gap since its last
    // frame, which would jump the motion rather than continue it.
    const delta = Math.min(rawDelta, 1 / 30);
    if (!stillRef.current) clock.current += delta;
    const t = clock.current;

    // Evolve: read oscillation from ref so useFrame never keeps a stale prop closure.
    const osc = oscillatingEvolveRef.current;
    const e = osc ? getShapeBuildEvolvePhase() * 0.6 : evolve;
    // Shape-build: only subtle breathing (env motion carries most of the “evolve” feel).
    const breathAmp = osc ? 0.028 : 0.08;

    // Environment rotation (evolve)
    if (threeScene.environment) {
      const envRot = (threeScene as any).environmentRotation;
      if (!envRot) (threeScene as any).environmentRotation = new THREE.Euler(0, 0, 0);
      if (e > 0) {
        const freq = 1.0 + e * 2.0;
        const freqEnv = freq / 1.2;
        const amp = e * Math.PI;
        (threeScene as any).environmentRotation.set(
          amp * Math.sin(t * freqEnv + 1),
          amp * Math.sin(t * freqEnv + 0.5),
          amp * Math.sin(t * freqEnv + 2),
        );
      } else {
        (threeScene as any).environmentRotation.set(0, 0, 0);
      }
    }

    // Float, auto-rotate, subtle tilt (tilt follows float — still when amplitude is 0)
    if (recenterFloat === undefined) {
      groupRef.current.position.y = Math.sin(t) * floatAmplitude;
      groupRef.current.rotation.z = floatAmplitude > 0 ? Math.sin(t * 0.3) * 0.015 : 0;
    } else {
      // Keep the rotation/morph clock intact. Only the levitation resets when
      // the carousel moves, so revisiting a memory never resumes a frozen lift.
      if (recenterFloat) floatClock.current = 0;
      else if (!stillRef.current) floatClock.current += delta;
      const blend = stillRef.current ? 1 : 1 - Math.exp(-14 * delta);
      const y = recenterFloat ? 0 : Math.sin(floatClock.current) * floatAmplitude;
      const tilt = recenterFloat || floatAmplitude === 0 ? 0 : Math.sin(floatClock.current * 0.3) * 0.015;
      groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, y, blend);
      groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, tilt, blend);
    }
    // read off the clock rather than accumulated, so a seeded clock hands the
    // turn over mid-rotation (see `sharedClock`). The offset is what keeps that
    // from being destructive: assigning the bare clock angle meant any pause —
    // a drag, a remount, a prop flip — snapped the form to wherever the clock
    // had got to. While the turn is held, the offset tracks the angle the form
    // is actually at, so resuming continues from there instead of jumping.
    if (autoRotate && !stillRef.current) {
      groupRef.current.rotation.y = t * 0.16 + spinOffsetRef.current;
    } else {
      spinOffsetRef.current = groupRef.current.rotation.y - t * 0.16;
    }

    // Vertex effects: quiet sphere→form growth + late fluidity/bump settle-in.
    // Advance intro morph inside the render loop (no React setState per frame).
    if (introMorphRef.current && morphRef.current < 1) {
      const dur = Math.max(0.05, introDurationRef.current);
      morphRef.current = Math.min(1, morphRef.current + delta / dur);
    }
    const mt = Math.min(1, Math.max(0, morphRef.current));
    // Intro: slow organic; gesture: nearly linear with a touch of ease.
    const formBlend = introMorphRef.current
      ? easeOrganicGrowth(mt)
      : easeSoftMorph(mt);
    setMemoryPhotoFade(photoMaterialRef.current, 1 - formBlend);
    // Keep surface detail quiet until the body has mostly emerged.
    const detailGain = mt < 0.62 ? 0 : Math.pow((mt - 0.62) / 0.38, 2);
    const fluid = fluidity * 0.6 * detailGain;
    const bump = bumpAmount > 1e-9 && detailGain > 1e-4 ? bumpAmount * detailGain : 0;
    const waveT = fluid > 0 ? t : 0;

    const s = staticRef.current;
    if (
      s.blend !== formBlend ||
      s.bump !== bump ||
      (bump > 0 && (s.spike !== bumpSpike || s.density !== density))
    ) {
      s.pose ??= new Float32Array(rest.positions.length);
      writeStaticPose(s.pose, rest, formBlend, bump, bumpSpike, density);
      s.blend = formBlend;
      s.bump = bump;
      s.spike = bumpSpike;
      s.density = density;
      s.version++;
    }

    const w = writtenRef.current;
    if (w.version !== s.version || w.fluid !== fluid || w.waveT !== waveT) {
      const position = geometry.attributes.position as THREE.BufferAttribute;
      const normal = geometry.attributes.normal as THREE.BufferAttribute;
      const out = position.array as Float32Array;
      const base = s.pose ?? rest.positions;
      if (fluid > 0) {
        // sin(a + b) and cos(c + d) expanded, so only these four are per frame
        const basis = (waveBasisRef.current ??= buildWaveBasis(rest));
        const sinB = Math.sin(t * fluid * 3);
        const cosB = Math.cos(t * fluid * 3);
        const sinD = Math.sin(t * fluid * 2);
        const cosD = Math.cos(t * fluid * 2);
        const amp = 0.08 * fluid;
        for (let i = 0, b = 0; i < out.length; i += 3, b += 4) {
          const wave =
            (basis[b] * cosB + basis[b + 1] * sinB) *
            (basis[b + 3] * cosD - basis[b + 2] * sinD) *
            amp;
          out[i] = base[i];
          out[i + 1] = base[i + 1] + wave;
          out[i + 2] = base[i + 2];
        }
      } else {
        out.set(base);
      }
      computeMeshNormals(out, rest.index, normal.array as Float32Array);
      position.needsUpdate = true;
      normal.needsUpdate = true;
      w.version = s.version;
      w.fluid = fluid;
      w.waveT = waveT;
    }

    // Evolve: breathe the whole model (group), not the mesh.
    if (e > 0) {
      const freq = 1.0 + e * 2.0;
      const breath = 1 + Math.sin(t * freq) * breathAmp;
      groupRef.current.scale.setScalar(breath);
    } else {
      groupRef.current.scale.set(1, 1, 1);
    }
  });

  return (
    <group rotation-x={ARTIFACT_TILT}>
      <group ref={groupRef}>
        <primitive object={scene} />
      </group>
    </group>
  );
}

// ─── Parked canvases ─────────────────────────────────────────────────────────

/**
 * frameloop="demand" draws only when something asks it to, and a parked
 * artifact has to be asked more than once: the environment map, the camera fit
 * and the first vertex pass in `Model` each land later than the form itself.
 * So we ask a few times, thinly spread — a dense burst of frames across six
 * parked canvases stalls the swing that put them there.
 * Mounted inside the Suspense boundary, so the schedule starts once the model
 * (and any photo it wears) is actually there; after it, the canvas holds its
 * last frame for free.
 */
const DEMAND_DRAW_DELAYS_MS = [60, 160, 340, 700, 1200, 1900];

function DemandFrames() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
    const timers = DEMAND_DRAW_DELAYS_MS.map((ms) =>
      window.setTimeout(invalidate, ms),
    );
    return () => timers.forEach(clearTimeout);
  }, [invalidate]);
  return null;
}

// ─── Fallback while loading ───────────────────────────────────────────────────

function Loader() {
  return (
    <mesh>
      <sphereGeometry args={[0.3, 16, 16]} />
      <meshBasicMaterial color="#aaaaaa" wireframe />
    </mesh>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SceneViewerProps {
  /** The artifact's superformula form. */
  form?: ArtifactForm;
  className?: string;
  style?: React.CSSProperties;
  autoRotate?: boolean;
  onAutoRotateChange?: (value: boolean) => void;
  canvasBlurPx?: number;
  matOpacity?: number;
  fluidity?: number;
  evolve?: number;
  bumpAmount?: number;
  bumpSpike?: number;
  density?: number;
  ready?: boolean;
  /** Preserve render resolution while a parent grows from a tiny ink pointer. */
  measureUnscaled?: boolean;
  /** Tighter framing for small fixed viewports (cards, connect flow, thumbnails). */
  constrainedViewport?: boolean;
  /** Camera distance as a multiple of the model's bounding sphere — lower
      fills more of the frame. Overrides the constrainedViewport default. */
  frameMargin?: number;
  /** "demand" renders only when something changes; for artifacts that are
      parked on screen (gallery neighbours) it costs almost nothing. */
  frameloop?: "always" | "demand";
  /** Hold one fixed pose instead of animating. Pair it with frameloop="demand":
      a canvas that draws intermittently would otherwise show its motion in
      lurches. */
  still?: boolean;
  /** Carry the pose across a route change: the clock starts at the page's own
      elapsed time, so an artifact remounted on the next screen keeps turning
      from where it was instead of snapping back to rest. */
  sharedClock?: boolean;
  /** Legacy: colour passed as raw hex for the glass tint + rect area lights */
  rectAreaLightColors?: {
    color1?: string;
    color2?: string;
    matColor?: string;
  };
  /** New: index into MATERIAL_PRESETS (0-4). Takes priority over rectAreaLightColors. */
  matPresetIndex?: number;
  /** Shape-build flow: 10s oscillating evolve inside the render loop (env + subtle scale). */
  shapeBuildOscillatingEvolve?: boolean;
  /** Vertical bob amplitude; 0 = still. */
  floatAmplitude?: number;
  /** Reset levitation while moving between carousel seats, without resetting rotation. */
  recenterFloat?: boolean;
  /**
   * Morph weight 0–1 (sphere→form). Default 1 = settled form (other pages unchanged).
   * Prefer `introMorph` for one-shot archive entrance.
   */
  morphProgress?: number;
  /** Archive/revisit: play sphere→form organic growth morph once on mount. */
  introMorph?: boolean;
  introMorphDuration?: number;
  /** Optional memory photo wrapped on the sphere; fades out as the form grows. */
  memoryPhotoUrl?: string;
  /** Scroll / pinch zoom. Off on the carousel so the wheel steps memories. */
  enableZoom?: boolean;
  /** Two-finger / right-drag pan. */
  enablePan?: boolean;
}

// ─── Main Scene ───────────────────────────────────────────────────────────────

export function SceneViewer({
  form = DEFAULT_ARTIFACT_FORM,
  className = "",
  style = {},
  autoRotate: autoRotateProp,
  onAutoRotateChange,
  canvasBlurPx = 6,
  matOpacity = 0.4,
  fluidity = 0,
  evolve = 0,
  bumpAmount = 0,
  bumpSpike = 0,
  density = 200,
  ready: readyProp,
  measureUnscaled = false,
  constrainedViewport = false,
  frameMargin,
  frameloop = "always",
  still = false,
  sharedClock = false,
  rectAreaLightColors,
  matPresetIndex,
  shapeBuildOscillatingEvolve = false,
  floatAmplitude = 0.08,
  recenterFloat,
  morphProgress = 1,
  introMorph = false,
  introMorphDuration = 5.5,
  memoryPhotoUrl,
  enableZoom = true,
  enablePan = false,
}: SceneViewerProps) {
  // Camera settings calibrated so fitTargetSize fills ~60-65% of viewport height
  // (whole shape visible with breathing room). Formula: cameraZ = fitTargetSize / (2*tan(fov/2) * 0.65)
  const fitTargetSize = constrainedViewport ? 2.2 : 2.5;
  const cameraFov = 45;
  const cameraZ = constrainedViewport ? 4.2 : 4.8;
  const orbitMin = constrainedViewport ? 2 : 2;
  const orbitMax = constrainedViewport ? 12 : 12;

  const [autoRotateInternal, setAutoRotateInternal] = useState(true);
  /* Once the artifact has been turned by hand it belongs to the hand: the idle
     spin stops for good rather than dragging the view back out from under it.
     This is tracked separately from `autoRotate` because most callers pass that
     in as a prop, and a state setter can't talk them out of it. */
  const [grabbed, setGrabbed] = useState(false);
  /** Set the first time the viewer orbits, and never cleared: from then on the
   *  angle belongs to them, so neither the auto-turn nor a re-fit may move it. */
  const userTurnedRef = useRef(false);
  const autoRotate =
    (autoRotateProp !== undefined ? autoRotateProp : autoRotateInternal) &&
    !grabbed &&
    !userTurnedRef.current;
  const setAutoRotate = onAutoRotateChange ?? setAutoRotateInternal;

  const [isDragging, setIsDragging] = useState(false);

  const ready = readyProp !== undefined ? readyProp : true;

  // Shape-build flow: never use the `evolve` prop for motion — Model uses getShapeBuildEvolvePhase() in useFrame.
  const modelStaticEvolveScaled = shapeBuildOscillatingEvolve ? 0 : evolve * 0.6;

  // Resolve material colours: matPresetIndex → full preset, else fall back to
  // rectAreaLightColors.matColor with auto-derived attenuation/sheen.
  const preset =
    matPresetIndex !== undefined
      ? (MATERIAL_PRESETS[matPresetIndex] ?? MATERIAL_PRESETS[0])
      : null;

  const matColor =
    preset?.matColor ??
    rectAreaLightColors?.matColor ??
    MATERIAL_PRESETS[0].matColor;
  const matAttenuationColor =
    preset?.matAttenuationColor ?? scaledHex(matColor, 0.85);
  const matSheenColor = preset?.matSheenColor ?? scaledHex(matColor, 0.9);

  // Clamp deformation inputs so random past-memory shapes never "tear" geometry.
  const safeFluidity = Math.max(0, Math.min(1, fluidity));
  const safeEvolve = Math.max(0, Math.min(1, modelStaticEvolveScaled));
  const safeBumpAmount = Math.max(0, Math.min(0.15, bumpAmount));
  const safeBumpSpike = Math.max(0, Math.min(1, bumpSpike));
  const safeDensity = Math.max(80, Math.min(500, density));

  const controlsRef = useRef<any>(null);
  const [fitCam, setFitCam] = useState<{
    z: number;
    near: number;
    far: number;
  } | null>(null);

  function handleBounds(_box: THREE.Box3, sphere: THREE.Sphere) {
    const r = Math.max(0.001, sphere.radius);
    // Fit to vertical FOV with a little breathing room.
    const fovRad = (cameraFov * Math.PI) / 180;
    const margin = frameMargin ?? (constrainedViewport ? 1.35 : 1.25);
    const z = (r / Math.sin(fovRad / 2)) * margin;
    const near = Math.max(0.01, z - r * 2.5);
    const far = z + r * 6;
    // A fresh object on every bounds report re-runs the fit effect, which used
    // to re-seat the camera. Keep the identity when the numbers have not moved.
    setFitCam((prev) =>
      prev &&
      Math.abs(prev.z - z) < 1e-4 &&
      Math.abs(prev.near - near) < 1e-4 &&
      Math.abs(prev.far - far) < 1e-4
        ? prev
        : { z, near, far },
    );
  }

  function FitControlsTarget() {
    const { camera } = useThree();
    useEffect(() => {
      if (!fitCam) return;
      // Re-fitting is about distance, not direction. Once the viewer has turned
      // the form, keep their angle and only push the camera out to the new
      // radius; seating it back on +Z threw the turn away.
      if (userTurnedRef.current && camera.position.lengthSq() > 1e-6) {
        camera.position.setLength(fitCam.z);
      } else {
        camera.position.set(0, 0, fitCam.z);
      }
      (camera as THREE.PerspectiveCamera).near = fitCam.near;
      (camera as THREE.PerspectiveCamera).far = fitCam.far;
      camera.updateProjectionMatrix();
      if (controlsRef.current) {
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.update();
      }
    }, [camera, fitCam]);
    return null;
  }

  const containerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    position: "relative",
    zIndex: 1,
    cursor: isDragging ? "grabbing" : "grab",
    ...style,
    /* Nothing is shown until the camera has been fitted to the form. The first
       frames are drawn at the default distance, and since the fit only arrives
       from the model's own effect, letting them paint pops the artifact a step
       larger or smaller. Parked (demand) canvases show it worst: they redraw on
       a schedule that straddles the fit, so the jump lands well into whatever
       entrance was playing. */
    visibility: fitCam ? undefined : "hidden",
  };

  // A new form (or switching the intro on) mounts a fresh Model, so its
  // clocks and pose caches start over with the geometry.
  const modelKey = `${formKey(form)}-${introMorph ? "intro" : "static"}`;
  const modelProps: ModelProps = {
    form,
    matColor,
    matAttenuationColor,
    matSheenColor,
    autoRotate,
    floatAmplitude,
    recenterFloat,
    fluidity: safeFluidity,
    evolve: safeEvolve,
    oscillatingEvolve: shapeBuildOscillatingEvolve,
    still,
    sharedClock,
    bumpAmount: safeBumpAmount,
    bumpSpike: safeBumpSpike,
    density: safeDensity,
    matOpacity,
    fitTargetSize,
    morphProgress,
    introMorph,
    introMorphDuration,
    onBounds: handleBounds,
  };

  // Don't mount the Canvas until the parent signals ready (avoids iframe conflicts)
  if (!ready) return <div className={className} style={containerStyle} />;

  return (
    <div className={className} style={containerStyle}>
      <Canvas
        resize={{ offsetSize: measureUnscaled }}
        frameloop={frameloop}
        camera={{
          position: [0, 0, fitCam?.z ?? cameraZ],
          fov: cameraFov,
          near: fitCam?.near ?? 0.1,
          far: fitCam?.far ?? 100,
        }}
        style={{ background: "transparent" }}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        flat={false}
        linear={false}
        onPointerDown={() => setIsDragging(true)}
        onPointerUp={() => setIsDragging(false)}
        onPointerLeave={() => setIsDragging(false)}
      >
        <FitControlsTarget />
        <ArtifactLighting />
        <Suspense fallback={<Loader />}>
          {memoryPhotoUrl ? (
            <MemoryPhotoTexture url={memoryPhotoUrl}>
              {(photoTexture) => (
                <Model key={modelKey} {...modelProps} photoTexture={photoTexture} />
              )}
            </MemoryPhotoTexture>
          ) : (
            <Model key={modelKey} {...modelProps} />
          )}
          {frameloop === "demand" && <DemandFrames />}
        </Suspense>
        <OrbitControls
          ref={controlsRef}
          enableZoom={enableZoom}
          enablePan={enablePan}
          minDistance={orbitMin}
          maxDistance={orbitMax}
          autoRotate={false}
          onStart={() => {
            userTurnedRef.current = true;
            setGrabbed(true);
            setAutoRotate(false);
          }}
        />
      </Canvas>

      <FrostOverlay canvasBlurPx={canvasBlurPx} />
    </div>
  );
}
