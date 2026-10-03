import { useEffect, useMemo } from "react";
import * as THREE from "three";
import {
  ArtifactForm,
  ArtifactMesh,
  formKey,
  getArtifactMesh,
} from "../lib/superformula";

export interface ArtifactGeometry {
  geometry: THREE.BufferGeometry;
  /** The cached rest data the geometry was made from. Shared — never write to it. */
  rest: ArtifactMesh;
}

/**
 * A geometry of the viewer's own for a form. The mesh data is built once per
 * form and cached; each viewer then animates its own positions and normals,
 * so they are copied, while the index is only ever read and is shared.
 */
export function createArtifactGeometry(form: ArtifactForm): ArtifactGeometry {
  const rest = getArtifactMesh(form);
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(new THREE.BufferAttribute(rest.index, 1));
  geometry.setAttribute("position", new THREE.BufferAttribute(rest.positions.slice(), 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(rest.normals.slice(), 3));
  // Set up front so three never walks the vertices to find them; the margin
  // covers the growth sphere and the surface ripples.
  const half = new THREE.Vector3(...rest.size).multiplyScalar(0.5 * 1.25);
  geometry.boundingBox = new THREE.Box3(half.clone().negate(), half);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), rest.radius * 1.25);
  return { geometry, rest };
}

export function useArtifactGeometry(form: ArtifactForm): ArtifactGeometry {
  const key = formKey(form);
  // keyed on the parameters, not the object: callers often rebuild the form
  // object on every render
  const artifact = useMemo(() => createArtifactGeometry(form), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => artifact.geometry.dispose(), [artifact]);
  return artifact;
}

/**
 * Build forms ahead of time while the page is idle, so an artifact swinging
 * into view never spends its first frame on the formula.
 */
export function warmArtifactMeshes(forms: ArtifactForm[]): () => void {
  if (forms.length === 0) return () => {};
  const run = () => forms.forEach((form) => getArtifactMesh(form));
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(run, { timeout: 600 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(run, 32);
  return () => window.clearTimeout(id);
}
