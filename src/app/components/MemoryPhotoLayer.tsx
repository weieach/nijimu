import { useLayoutEffect, type ReactNode } from "react";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";

/*
 * Transparent photo overlay for the form-grow sphere.
 *
 * UV is baked from the sphere rest pose (front-hemisphere projection), so the
 * image wraps with a mild fisheye and stays painted on the surface as the mesh
 * morphs. Soft circular edges + overall alpha + morph-driven fade live in the
 * fragment shader. The overlay shares the host mesh's geometry so vertex
 * updates stay in one place.
 */

export const MEMORY_PHOTO_OVERLAY_NAME = "__nijimuPhotoOverlay";

export const MEMORY_PHOTO_DEFAULTS = {
  baseOpacity: 0.48,
  edgeInner: 0.35,
  edgeOuter: 0.52,
  uvScale: 1,
};

/** Live CSS-like grading on the photo overlay. Identity except opacity. */
export type MemoryPhotoFilter = {
  brightness: number;
  contrast: number;
  saturate: number;
  /** 0–1 maps to a full hue rotation. */
  hue: number;
  /** Wash a hue onto luminance — how a B&W print picks up color. */
  colorize: number;
  /**
   * Strength of the packed blue-hour feeling grade (0 = original, 1 = full).
   * Shadows go navy, highlights pale cyan, exposure drops a little.
   */
  feeling: number;
  opacity: number;
};

export const MEMORY_PHOTO_FILTER_DEFAULTS: MemoryPhotoFilter = {
  brightness: 1,
  contrast: 1,
  saturate: 1,
  hue: 0,
  colorize: 0,
  feeling: 0,
  opacity: MEMORY_PHOTO_DEFAULTS.baseOpacity,
};

const PHOTO_VERT = `
varying vec2 vPhotoUv;
varying vec3 vNormalW;
varying vec3 vViewDirW;

void main() {
  vPhotoUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewDirW = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}`;

const PHOTO_FRAG = `
precision highp float;

uniform sampler2D uPhoto;
uniform float uBaseOpacity;
uniform float uFade;
uniform float uEdgeInner;
uniform float uEdgeOuter;
uniform float uBrightness;
uniform float uContrast;
uniform float uSaturate;
uniform float uHue;
uniform float uColorize;
uniform float uFeeling;

varying vec2 vPhotoUv;
varying vec3 vNormalW;
varying vec3 vViewDirW;

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// Packed dusk grade: cool temperature, navy shadows, cyan highlights,
// a little magenta in the mids, slightly underexposed.
vec3 blueHourGrade(vec3 rgb) {
  rgb *= 0.84;
  rgb = (rgb - 0.5) * 1.18 + 0.46;

  rgb.r *= 0.74;
  rgb.g *= 0.86;
  rgb.b = min(1.0, rgb.b * 1.22 + 0.07);

  float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 shadowTint = vec3(0.06, 0.12, 0.30);
  vec3 highlightTint = vec3(0.70, 0.86, 0.96);
  vec3 split = mix(shadowTint, highlightTint, smoothstep(0.12, 0.72, luma));
  rgb = mix(rgb, split, 0.42);

  float mid = smoothstep(0.18, 0.42, luma) * (1.0 - smoothstep(0.48, 0.78, luma));
  rgb.r += 0.045 * mid;
  rgb.b += 0.035 * mid;

  rgb = max(rgb, vec3(0.02, 0.045, 0.11));
  return clamp(rgb, 0.0, 1.0);
}

vec3 gradePhoto(vec3 rgb) {
  rgb *= uBrightness;
  rgb = (rgb - 0.5) * uContrast + 0.5;
  float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  rgb = mix(vec3(luma), rgb, uSaturate);
  if (abs(uHue) > 0.0005) {
    vec3 hsv = rgb2hsv(clamp(rgb, 0.0, 1.0));
    hsv.x = fract(hsv.x + uHue);
    rgb = hsv2rgb(hsv);
  }
  if (uColorize > 0.001) {
    float washLuma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
    vec3 wash = hsv2rgb(vec3(fract(uHue), mix(0.28, 0.72, uColorize), washLuma));
    rgb = mix(rgb, wash, uColorize);
  }
  if (uFeeling > 0.001) {
    rgb = mix(rgb, blueHourGrade(rgb), clamp(uFeeling, 0.0, 1.0));
  }
  return clamp(rgb, 0.0, 1.0);
}

void main() {
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(vViewDirW);
  float facing = abs(dot(n, v));

  vec4 tex = texture2D(uPhoto, vPhotoUv);
  float r = distance(vPhotoUv, vec2(0.5));
  float edge = 1.0 - smoothstep(uEdgeInner, uEdgeOuter, r);
  edge *= smoothstep(0.15, 0.55, facing);

  float alpha = tex.a * uBaseOpacity * edge * uFade;
  if (alpha < 0.004) discard;

  gl_FragColor = vec4(gradePhoto(tex.rgb), alpha);
}`;

export function configureMemoryPhotoTexture(tex: THREE.Texture): THREE.Texture {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Load a photo inside a Canvas / Suspense boundary and hand the texture down. */
export function MemoryPhotoTexture({
  url,
  children,
}: {
  url: string;
  children: (texture: THREE.Texture) => ReactNode;
}) {
  const texture = useLoader(THREE.TextureLoader, url);
  useLayoutEffect(() => {
    configureMemoryPhotoTexture(texture);
  }, [texture]);
  return <>{children(texture)}</>;
}

/**
 * Front-hemisphere UV from sphere rest positions.
 * Model-space +Z faces the default camera, so x/y become the photo plane
 * (center bulge = the wrap's fisheye).
 */
export function buildPhotoUv(
  sphereLocal: Float32Array,
  localToModel: THREE.Matrix4,
  uvScale = MEMORY_PHOTO_DEFAULTS.uvScale,
): Float32Array {
  const count = sphereLocal.length / 3;
  const uv = new Float32Array(count * 2);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.set(
      sphereLocal[i * 3],
      sphereLocal[i * 3 + 1],
      sphereLocal[i * 3 + 2],
    ).applyMatrix4(localToModel);
    const len = v.length() || 1e-6;
    uv[i * 2] = (v.x / len) * 0.5 * uvScale + 0.5;
    uv[i * 2 + 1] = (v.y / len) * 0.5 * uvScale + 0.5;
  }
  return uv;
}

export function setPhotoUvAttribute(
  geom: THREE.BufferGeometry,
  uv: Float32Array,
): void {
  geom.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

export function createMemoryPhotoMaterial(
  texture: THREE.Texture,
  fade = 1,
  filter: MemoryPhotoFilter = MEMORY_PHOTO_FILTER_DEFAULTS,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: PHOTO_VERT,
    fragmentShader: PHOTO_FRAG,
    uniforms: {
      uPhoto: { value: texture },
      uBaseOpacity: { value: filter.opacity },
      uFade: { value: fade },
      uEdgeInner: { value: MEMORY_PHOTO_DEFAULTS.edgeInner },
      uEdgeOuter: { value: MEMORY_PHOTO_DEFAULTS.edgeOuter },
      uBrightness: { value: filter.brightness },
      uContrast: { value: filter.contrast },
      uSaturate: { value: filter.saturate },
      uHue: { value: filter.hue },
      uColorize: { value: filter.colorize },
      uFeeling: { value: filter.feeling },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.FrontSide,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });
}

export function attachMemoryPhotoOverlay(
  mesh: THREE.Mesh,
  material: THREE.ShaderMaterial,
): THREE.Mesh {
  const overlay = new THREE.Mesh(mesh.geometry, material);
  overlay.name = MEMORY_PHOTO_OVERLAY_NAME;
  overlay.userData.hostUuid = mesh.uuid;
  overlay.frustumCulled = false;
  overlay.castShadow = false;
  overlay.receiveShadow = false;
  overlay.renderOrder = 10;
  overlay.position.copy(mesh.position);
  overlay.quaternion.copy(mesh.quaternion);
  overlay.scale.copy(mesh.scale);
  // Sit just outside the glass so transmission doesn't swallow the print.
  overlay.scale.multiplyScalar(1.012);
  if (mesh.parent) mesh.parent.add(overlay);
  else mesh.add(overlay);
  return overlay;
}

export function detachMemoryPhotoOverlays(root: THREE.Object3D): void {
  const toRemove: THREE.Object3D[] = [];
  root.traverse((child) => {
    if (child.name === MEMORY_PHOTO_OVERLAY_NAME) toRemove.push(child);
  });
  toRemove.forEach((child) => child.parent?.remove(child));
}

export function setMemoryPhotoFade(
  material: THREE.ShaderMaterial | null,
  fade: number,
): void {
  if (!material) return;
  material.uniforms.uFade.value = Math.min(1, Math.max(0, fade));
}

export function applyMemoryPhotoFilter(
  material: THREE.ShaderMaterial | null,
  filter: MemoryPhotoFilter,
): void {
  if (!material) return;
  const u = material.uniforms;
  u.uBaseOpacity.value = filter.opacity;
  u.uBrightness.value = filter.brightness;
  u.uContrast.value = filter.contrast;
  u.uSaturate.value = filter.saturate;
  u.uHue.value = filter.hue;
  u.uColorize.value = filter.colorize;
  u.uFeeling.value = filter.feeling;
}
