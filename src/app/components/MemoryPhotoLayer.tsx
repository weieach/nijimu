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

varying vec2 vPhotoUv;
varying vec3 vNormalW;
varying vec3 vViewDirW;

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

  gl_FragColor = vec4(tex.rgb, alpha);
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
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: PHOTO_VERT,
    fragmentShader: PHOTO_FRAG,
    uniforms: {
      uPhoto: { value: texture },
      uBaseOpacity: { value: MEMORY_PHOTO_DEFAULTS.baseOpacity },
      uFade: { value: fade },
      uEdgeInner: { value: MEMORY_PHOTO_DEFAULTS.edgeInner },
      uEdgeOuter: { value: MEMORY_PHOTO_DEFAULTS.edgeOuter },
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
