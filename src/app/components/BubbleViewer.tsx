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
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  ARTIFACT_TILT,
  MODEL_SPACE,
  easeSoftMorph,
  fitArtifact,
} from "./SceneViewer";
import { useArtifactGeometry } from "../hooks/useArtifactGeometry";
import {
  ArtifactForm,
  ArtifactMesh,
  DEFAULT_ARTIFACT_FORM,
  computeMeshNormals,
  formKey,
  getArtifactMesh,
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
import {
  PROJECTED_PHOTO_FUNCTION,
  PROJECTED_PHOTO_UNIFORMS,
  createProjectedPhotoUniforms,
} from "../lib/projectedPhotoLight";
import {
  UNDERWATER_FORM_FUNCTION,
  UNDERWATER_FORM_UNIFORMS,
  createUnderwaterFormUniforms,
  underwaterTime,
} from "../lib/underwaterLight";
import { UnderwaterBackdrop } from "./UnderwaterBackdrop";

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
varying vec3 vPhotoProjectPos;

void main() {
  vPhotoProjectPos = normalize(position);
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
uniform vec3 uInterior;
uniform float uTransmit;
uniform float uRoughness;
uniform float uReflectivity;
uniform float uTransparency;
uniform float uFog;
uniform vec3 uFogColor;
uniform float uMetalness;
uniform int uLightCount;
uniform vec3 uLightPos[8];
uniform vec3 uLightColor[8];
uniform float uLightIntensity[8];
uniform float uLightKind[8];
uniform vec3 uAmbientColor;
// Where the light rig's origin sits in this scene; lights are placed around it.
uniform vec3 uOrigin;
uniform float uReveal;
${PROJECTED_PHOTO_UNIFORMS}
${UNDERWATER_FORM_UNIFORMS}

varying vec3 vNormalW;
varying vec3 vViewDirW;
varying vec3 vWorldPos;
${PROJECTED_PHOTO_FUNCTION}
${UNDERWATER_FORM_FUNCTION}

// A soft studio seen in polished metal: bright overhead, a dim band just
// below the horizon, a paler floor beneath, and two broad windows at the sides.
vec3 metalReflection(vec3 r) {
  float up = smoothstep(-.04, .5, r.y);
  float down = smoothstep(-.24, -.85, r.y);
  float tone = .24 + up * .7 + down * .38;
  tone += pow(max(dot(r, normalize(vec3(-.72, .32, .62))), 0.0), 5.0) * .42;
  tone += pow(max(dot(r, normalize(vec3(.78, .26, .58))), 0.0), 7.0) * .3;
  return vec3(min(tone, 1.04)) * vec3(.985, .99, 1.0);
}

void main() {
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(vViewDirW);
  vec3 local = vWorldPos - uOrigin;
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
  // Face-on: looking through the volume. Grazing: the film, not the dye.
  float trans = pow(clamp(1.0 - facing, 0.0, 1.0), 1.2);

  vec3 col = mix(uCoreColor, uRimColor, rim);
  float alpha = mix(coreAlpha, rimAlpha, rim);
  col = mix(col, uInterior, trans * uTransmit * 0.58);
  alpha = clamp(alpha + trans * uTransmit * 0.15, 0.0, 1.0);

  // Thin bright ring just inside the silhouette — the soap-film highlight.
  float film = pow(clamp(facing, 0.0, 1.0), filmPower) * filmGain;
  col += vec3(film);
  alpha = clamp(alpha + film * 0.35, 0.0, 1.0);

  // Under water the fill falls off away from the beam, so the form has a lit
  // side and a shaded one instead of a uniform glow.
  col += uAmbientColor * mix(1.0, .55, uUnderwater);

  vec3 specAccum = vec3(0.0);
  vec3 diffAccum = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    if (i >= uLightCount) break;
    float kind = uLightKind[i];
    vec3 L;
    float atten = 1.0;
    if (kind < 0.5) {
      vec3 toL = uLightPos[i] - local;
      float d = length(toL);
      L = toL / max(d, 0.001);
      atten = 1.0 / (1.0 + 0.12 * d + 0.02 * d * d);
    } else if (kind < 1.5) {
      // Directional: LightRig aims at the origin, so L ≈ normalize(position).
      L = normalize(uLightPos[i]);
    } else {
      vec3 toL = uLightPos[i] - local;
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
  // Under water the beam is the key light; the rig's own glints step back.
  specAccum *= mix(1.0, .5, uUnderwater);
  diffAccum *= mix(1.0, .6, uUnderwater);
  col += diffAccum + specAccum;
  if (uUnderwater > 0.001) {
    vec3 beam = underwaterBeam(n, v, facing) * uUnderwater;
    col += beam;
    alpha = clamp(alpha + dot(beam, vec3(.333)) * .22, 0.0, 1.0);
  }
  // Metal mirrors the surroundings rather than glowing, but stays partly
  // see-through so the form keeps its lightness.
  if (uMetalness > 0.001) {
    vec3 env = metalReflection(reflect(-v, n));
    col = mix(col, env, uMetalness * (.7 + .3 * pow(facing, 2.0)));
    alpha = mix(alpha, .56 + .32 * pow(facing, 1.5), uMetalness * .85);
  }
  vec3 projection = projectedPhotoLight(n);
  // Light areas pass through; dark areas in the print withhold some of the
  // existing fill. Without that subtraction the pale bubble washes the image
  // into an unstructured white glow at the Canvas hand-off.
  float projectedMass = max(projection.r, max(projection.g, projection.b));
  float footprint = smoothstep(.008, .055, projectedMass);
  col = col * (1.0 - footprint * uProjectionStrength * .48) + projection * 1.28;
  alpha = clamp(alpha + length(specAccum) * 0.18, 0.0, 1.0);
  alpha = clamp(alpha + length(projection) * .05, 0.0, 1.0);

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

  gl_FragColor = vec4(col, alpha * uReveal);
}`;

/* ───────── motion tuning ───────── */

/** Slow, non-repeating drift on all three axes — floating in water. */
const DRIFT_AMPLITUDE = 0.05;
const DRIFT_FREQ: [number, number, number] = [0.13, 0.17, 0.11];
const DRIFT_PHASE: [number, number, number] = [0.0, 1.7, 3.4];
/** Same auto-rotate rate as the glass variant. */
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
  coreColor: string;
  rimColor: string;
  interiorColor: string;
  transmit: number;
  roughness: number;
  reflectivity: number;
  transparency: number;
  fog: number;
  metalness?: number;
  photoTexture?: THREE.Texture | null;
  projectedPhotoTexture?: THREE.Texture | null;
  projectionStrength: number;
  photoFilter: MemoryPhotoFilter;
  /** Explicit photo visibility. Undefined preserves the legacy morph-driven fade. */
  photoFade?: number;
  lightEditMode?: boolean;
  lights: EditableLight[];
  ambients: AmbientFill[];
  onBounds?: (box: THREE.Box3, sphere: THREE.Sphere) => void;
  /** Lit by the beam from the surface rather than only the editable rig. */
  underwater?: boolean;
  /** World position of the form's centre when it isn't the scene origin. */
  origin?: THREE.Vector3;
  /** Two-finger turning of the form; off when another scene hosts it. */
  userSpin?: boolean;
  /** For hosts that drive reveal, projection, or underwater amount per frame. */
  materialRef?: React.MutableRefObject<THREE.ShaderMaterial | null>;
  renderOrder?: number;
}

export function BubbleModel({
  form,
  autoRotate,
  morphProgress,
  fitTargetSize,
  coreColor,
  rimColor,
  interiorColor,
  transmit,
  roughness,
  reflectivity,
  transparency,
  fog,
  metalness = DEFAULT_BUBBLE_MATERIAL.metalness,
  photoTexture = null,
  projectedPhotoTexture = null,
  projectionStrength,
  photoFilter,
  photoFade,
  lightEditMode = false,
  lights,
  ambients,
  onBounds,
  underwater = false,
  origin,
  userSpin = true,
  materialRef,
  renderOrder = 0,
}: BubbleModelProps) {
  const { geometry, rest } = useArtifactGeometry(form);
  // Made once with the props of the first render; the effects below keep
  // every uniform current.
  const material = useMemo(() => {
    const lightUniforms = createBubbleLightUniforms();
    fillBubbleLightUniforms(lightUniforms, lights, ambients);
    return new THREE.ShaderMaterial({
      vertexShader: BUBBLE_VERT,
      fragmentShader: BUBBLE_FRAG,
      uniforms: {
        uCoreColor: { value: new THREE.Color(coreColor) },
        uRimColor: { value: new THREE.Color(rimColor) },
        uInterior: { value: new THREE.Color(interiorColor) },
        uTransmit: { value: transmit },
        uRoughness: { value: roughness },
        uReflectivity: { value: reflectivity },
        uTransparency: { value: transparency },
        uFog: { value: fog },
        uFogColor: { value: new THREE.Color(BUBBLE_FOG_COLOR) },
        uMetalness: { value: metalness },
        uOrigin: { value: new THREE.Vector3() },
        uReveal: { value: 1 },
        ...createProjectedPhotoUniforms(projectedPhotoTexture),
        ...createUnderwaterFormUniforms(underwater ? 1 : 0),
        ...lightUniforms,
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /** KeyShot-style geometry view: a flat gray stand-in. */
  const editMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: "#8d8e94", side: THREE.DoubleSide }),
    [],
  );
  useEffect(
    () => () => {
      material.dispose();
      editMaterial.dispose();
    },
    [material, editMaterial],
  );
  useLayoutEffect(() => {
    if (!materialRef) return;
    materialRef.current = material;
    return () => {
      materialRef.current = null;
    };
  }, [material, materialRef]);
  useEffect(() => {
    material.uniforms.uUnderwater.value = underwater ? 1 : 0;
  }, [material, underwater]);
  useEffect(() => {
    (material.uniforms.uOrigin.value as THREE.Vector3).copy(origin ?? new THREE.Vector3());
  }, [material, origin]);
  const { scene, mesh } = useMemo(() => {
    const mesh = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(geometry, material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    const scene = new THREE.Group();
    scene.add(mesh);
    return { scene, mesh };
  }, [geometry, material]);
  useLayoutEffect(() => {
    mesh.renderOrder = renderOrder;
  }, [mesh, renderOrder]);

  const groupRef = useRef<THREE.Group>(null!);
  // Starts from the page clock so a form handed between canvases keeps its drift.
  const clock = useRef(underwaterTime());
  /** World units per mesh unit — the wave is sized in world units. */
  const worldPerLocalRef = useRef(1);
  const morphRef = useRef(morphProgress);
  const photoMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const photoFilterRef = useRef(photoFilter);
  photoFilterRef.current = photoFilter;
  const photoFadeRef = useRef(photoFade);
  photoFadeRef.current = photoFade;
  const lightEditRef = useRef(lightEditMode);
  lightEditRef.current = lightEditMode;
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
    if (lightEditMode || !userSpin) return;
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
  }, [gl, lightEditMode, userSpin]);

  useLayoutEffect(() => {
    const fit = fitArtifact(rest, fitTargetSize);
    scene.scale.setScalar(fit.scale);
    worldPerLocalRef.current = fit.scale;
    waveBasisRef.current = null;
    onBounds?.(fit.box, fit.sphere);
  }, [scene, rest, fitTargetSize]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const u = material.uniforms;
    (u.uCoreColor.value as THREE.Color).set(coreColor);
    (u.uRimColor.value as THREE.Color).set(rimColor);
    (u.uInterior.value as THREE.Color).set(interiorColor);
    u.uTransmit.value = transmit;
  }, [material, coreColor, rimColor, interiorColor, transmit]);

  useEffect(() => {
    const u = material.uniforms;
    u.uRoughness.value = roughness;
    u.uReflectivity.value = reflectivity;
    u.uTransparency.value = transparency;
    u.uFog.value = fog;
    u.uMetalness.value = metalness;
  }, [material, roughness, reflectivity, transparency, fog, metalness]);

  useEffect(() => {
    material.uniforms.uProjectedPhoto.value = projectedPhotoTexture;
    material.uniforms.uProjectionStrength.value =
      projectedPhotoTexture ? projectionStrength : 0;
  }, [material, projectedPhotoTexture, projectionStrength]);

  useEffect(() => {
    fillBubbleLightUniforms(
      material.uniforms as unknown as ReturnType<typeof createBubbleLightUniforms>,
      lights,
      ambients,
    );
  }, [material, lights, ambients]);

  // Light editing swaps in the gray stand-in and holds the form at the origin.
  useLayoutEffect(() => {
    mesh.material = lightEditMode ? editMaterial : material;
    if (lightEditMode) groupRef.current?.position.set(0, 0, 0);
  }, [mesh, material, editMaterial, lightEditMode]);

  // The photo rides on the growth sphere and shares the geometry, so it
  // follows every vertex the form writes. Not while editing lights.
  useEffect(() => {
    if (!photoTexture || lightEditMode) return;
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
  }, [scene, mesh, geometry, rest, photoTexture, lightEditMode]);

  useEffect(() => {
    applyMemoryPhotoFilter(photoMaterialRef.current, photoFilter);
  }, [photoFilter]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const editing = lightEditRef.current;

    if (!editing) {
      clock.current += delta;
      const t = clock.current;
      groupRef.current.position.set(drift(t, 0), drift(t, 1), drift(t, 2));
      if (autoRotate && !userSpinningRef.current) {
        groupRef.current.rotation.y += delta * ROTATE_RATE;
      }
    }
    // Page clock: the light through the photograph keeps its phase across canvases.
    material.uniforms.uProjectionTime.value = underwaterTime();

    const t = clock.current;
    const formBlend = easeSoftMorph(Math.min(1, Math.max(0, morphRef.current)));
    const wpl = worldPerLocalRef.current || 1;
    const amp = editing ? 0 : WAVE_AMPLITUDE / wpl;
    const waveT = amp > 0 ? t : 0;

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
      if (amp > 0) {
        // Standing wave: the surrounding liquid nudging the film, pushed out
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
      } else {
        out.set(base);
      }
      computeMeshNormals(out, rest.index, normal.array as Float32Array);
      position.needsUpdate = true;
      normal.needsUpdate = true;
      w.version = s.version;
      w.amp = amp;
      w.waveT = waveT;
    }

    if (!editing) {
      setMemoryPhotoFade(photoMaterialRef.current, photoFade ?? 1 - formBlend);
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

const WRAP_FILM_VERT = /* glsl */ `
  uniform float uProgress;
  uniform float uAspect;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    float fall = smoothstep(0.0, .58, uProgress);
    float wrap = smoothstep(.46, 1.0, uProgress);
    float width = 2.75;
    float height = width / max(.65, uAspect);
    vec2 q = uv - .5;

    // Still a flexible sheet while it descends from the surface.
    float air = sin(q.x * 5.2 + uProgress * 5.0) * cos(q.y * 3.7 - uProgress * 3.0);
    vec3 sheet = vec3(
      q.x * width,
      mix(3.35, 1.15, fall) + q.y * height * .82,
      .28 + q.y * height * .56 + air * .18 * (1.0 - fall)
    );

    // The centre meets first; the outer film follows around the sphere.
    float radial = length(q) / .7071;
    float localWrap = smoothstep(.48 + radial * .18, 1.0, uProgress);
    float theta = q.x * 2.55;
    float phi = q.y * min(2.15, 2.55 / max(.7, uAspect));
    float r = 1.29;
    vec3 sphere = vec3(
      sin(theta) * cos(phi),
      sin(phi),
      cos(theta) * cos(phi)
    ) * r;
    vec3 p = mix(sheet, sphere, localWrap);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const WRAP_FILM_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uPhoto;
  uniform float uProgress;
  varying vec2 vUv;
  void main() {
    vec3 photo = texture2D(uPhoto, vUv).rgb;
    photo = (photo - .5) * 1.28 + .5;
    float rim = smoothstep(0.0, .045, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
    float fade = 1.0 - smoothstep(.82, 1.0, uProgress);
    gl_FragColor = vec4(clamp(photo, 0.0, 1.0), rim * fade * .9);
  }
`;

function WrappingPhotoFilm({
  texture,
  progress,
}: {
  texture: THREE.Texture;
  progress: number;
}) {
  const image = texture.image as { width?: number; height?: number } | undefined;
  const aspect = image?.width && image?.height ? image.width / image.height : 1.5;
  const uniforms = useMemo(() => ({
    uPhoto: { value: texture },
    uProgress: { value: progress },
    uAspect: { value: aspect },
  }), [texture, aspect]);
  useEffect(() => {
    uniforms.uProgress.value = progress;
  }, [uniforms, progress]);
  if (progress <= 0 || progress >= 1) return null;
  return (
    <group rotation-x={ARTIFACT_TILT}>
      <mesh renderOrder={12} frustumCulled={false}>
        <planeGeometry args={[1, 1, 40, 32]} />
        <shaderMaterial transparent depthWrite={false} depthTest={false}
          side={THREE.DoubleSide} vertexShader={WRAP_FILM_VERT}
          fragmentShader={WRAP_FILM_FRAG} uniforms={uniforms} />
      </mesh>
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
  /** Near-transparent interior tint. */
  coreColor?: string;
  /** Silhouette tint — this is what reads as "bubble edge". */
  rimColor?: string;
  /** Pale color that seeps through the volume (face-on), not the film. */
  interiorColor?: string;
  /** 0 = no interior wash; 1 = faint transmitted hue. */
  transmit?: number;
  roughness?: number;
  reflectivity?: number;
  transparency?: number;
  /** Distance mist toward the water midtone (0 = none). */
  fog?: number;
  /** 0 = glass bubble; 1 = soft polished metal, still partly see-through. */
  metalness?: number;
  /**
   * Water behind the bubble: light at the top, deep at the bottom. Defaults to
   * transparent so a full-page gradient can show through without a seam.
   */
  backgroundGradient?: string;
  /** Optional memory photo wrapped on the sphere; fades out as the form grows. */
  memoryPhotoUrl?: string;
  /** CSS-like grading on the photo overlay only — does not touch the bubble film. */
  photoFilter?: MemoryPhotoFilter;
  /** Explicit photo visibility. Undefined preserves the legacy morph-driven fade. */
  photoFade?: number;
  /** Light refracted through the same photograph before it reaches the form. */
  projectionStrength?: number;
  /** 0 = on the surface, 1 = transferred to the form overlay. */
  photoWrapProgress?: number;
  /**
   * 1 = current clear bubble (no frost). 0 = glass-default frost (canvasBlurPx 6).
   * Hidden while the light geometry editor is open.
   */
  vividness?: number;
  /** Set the form in the underwater stage: beam, caustics, motes. */
  underwater?: boolean;
  /** sRGB hex the underwater stage leans toward (the chosen feeling). */
  underwaterTint?: string | null;
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
  roughness: 0,
  reflectivity: 0.2,
  transparency: 0.9,
  fog: 0,
  metalness: 0.35,
};

// Slightly darker than the water behind it, so the body reads as glass
// rather than as milk on a light background. Same cool-neutral family as
// the home field (#ededee / #9b9ba3).
export const DEFAULT_BUBBLE_TINT = {
  coreColor: "#8a8c94",
  rimColor: "#3a3c44",
  interiorColor: "#e8e9ee",
};

export const BUBBLE_CAMERA_FOV = 45;

function cameraFitForRadius(radius: number, constrainedViewport: boolean) {
  const r = Math.max(0.001, radius);
  const fovRad = (BUBBLE_CAMERA_FOV * Math.PI) / 180;
  const margin = constrainedViewport ? 1.35 : 1.25;
  const z = (r / Math.sin(fovRad / 2)) * margin;
  return { z, near: Math.max(0.01, z - r * 2.5), far: z + r * 6 };
}

export const bubbleFitTargetSize = (constrainedViewport = false) =>
  constrainedViewport ? 2.2 : 2.5;

/** Where BubbleViewer's camera settles for a form — known before the first frame. */
export function bubbleCameraFit(form: ArtifactForm, constrainedViewport = false) {
  const fit = fitArtifact(getArtifactMesh(form), bubbleFitTargetSize(constrainedViewport));
  return cameraFitForRadius(fit.sphere.radius, constrainedViewport);
}

/* ───────── main ───────── */

export function BubbleViewer({
  form = DEFAULT_ARTIFACT_FORM,
  className = "",
  style = {},
  autoRotate = true,
  morphProgress = 1,
  ready: readyProp,
  constrainedViewport = false,
  coreColor = DEFAULT_BUBBLE_TINT.coreColor,
  rimColor = DEFAULT_BUBBLE_TINT.rimColor,
  interiorColor = DEFAULT_BUBBLE_TINT.interiorColor,
  transmit = 0,
  roughness = DEFAULT_BUBBLE_MATERIAL.roughness,
  reflectivity = DEFAULT_BUBBLE_MATERIAL.reflectivity,
  transparency = DEFAULT_BUBBLE_MATERIAL.transparency,
  fog = DEFAULT_BUBBLE_MATERIAL.fog,
  metalness = DEFAULT_BUBBLE_MATERIAL.metalness,
  backgroundGradient = "transparent",
  memoryPhotoUrl,
  photoFilter = MEMORY_PHOTO_FILTER_DEFAULTS,
  photoFade,
  projectionStrength = 0,
  photoWrapProgress = 0,
  vividness = 1,
  underwater = false,
  underwaterTint = null,
  lightEditMode = false,
  lights = DEFAULT_BUBBLE_LIGHTS,
  onLightsChange,
  ambients = DEFAULT_BUBBLE_AMBIENTS,
  selectedLightId = null,
  onSelectLight,
  transformMode = "translate",
}: BubbleViewerProps) {
  const fitTargetSize = bubbleFitTargetSize(constrainedViewport);

  const ready = readyProp !== undefined ? readyProp : true;
  const controlsRef = useRef<any>(null);
  const [fitCam, setFitCam] = useState<{
    z: number;
    near: number;
    far: number;
  } | null>(null);
  const [gizmoDragging, setGizmoDragging] = useState(false);
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
  // The first frame already stands where the fit will put it, so a form
  // handed over from another canvas doesn't change size on arrival.
  const firstCam = useMemo(
    () => bubbleCameraFit(form, constrainedViewport),
    [formId, constrainedViewport], // eslint-disable-line react-hooks/exhaustive-deps
  );

  function handleBounds(_box: THREE.Box3, sphere: THREE.Sphere) {
    const next = cameraFitForRadius(sphere.radius, constrainedViewport);
    setFitCam((prev) => {
      // Keep an already-settled camera when only the wrap photo changes.
      if (prev) return prev;
      return next;
    });
  }

  const containerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    position: "relative",
    background: backgroundGradient,
    ...style,
  };

  const modelShared = {
    form,
    autoRotate: autoRotate && !lightEditMode,
    morphProgress,
    fitTargetSize,
    coreColor,
    rimColor,
    interiorColor,
    transmit,
    roughness,
    reflectivity,
    transparency,
    fog,
    metalness,
    photoFilter,
    photoFade,
    projectedPhotoTexture: photoTexture,
    projectionStrength,
    lightEditMode,
    lights,
    ambients,
    onBounds: handleBounds,
    underwater: underwater && !lightEditMode,
  };

  if (!ready) return <div className={className} style={containerStyle} />;

  return (
    <div className={className} style={containerStyle}>
      <Canvas
        camera={{
          position: [0, 0, (fitCam ?? firstCam).z],
          fov: BUBBLE_CAMERA_FOV,
          near: (fitCam ?? firstCam).near,
          far: (fitCam ?? firstCam).far,
        }}
        style={{
          background: lightEditMode ? "#c8c8c8" : "transparent",
          touchAction: "none",
        }}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ gl }) => {
          if (!lightEditMode) gl.setClearColor(0x000000, 0);
        }}
        onPointerMissed={() => {
          if (lightEditMode) onSelectLight?.(null);
        }}
      >
        <FitCamera fitCam={fitCam} controlsRef={controlsRef} />
        {underwater && !lightEditMode && <UnderwaterBackdrop tint={underwaterTint} />}
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
            <PhotoTextureLoader
              key={memoryPhotoUrl}
              url={memoryPhotoUrl}
              onReady={onPhotoReady}
            />
          ) : null}
          <BubbleModel
            key={formId}
            {...modelShared}
            photoTexture={photoTexture}
          />
          {photoTexture && (
            <WrappingPhotoFilm texture={photoTexture} progress={photoWrapProgress} />
          )}
        </Suspense>
        <OrbitControls
          ref={controlsRef}
          enableZoom={lightEditMode}
          enablePan={lightEditMode}
          enableRotate={lightEditMode}
          autoRotate={false}
          enabled={lightEditMode && !gizmoDragging}
        />
      </Canvas>
      {!lightEditMode && (
        <FrostOverlay canvasBlurPx={vividnessToBlurPx(vividness)} />
      )}
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
