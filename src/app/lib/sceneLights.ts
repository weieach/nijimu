/** Editable scene lights for the bubble-page geometry view. */

import * as THREE from "three";

export type EditableLightKind = "point" | "area" | "directional";

export type TransformMode = "translate" | "rotate" | "scale";

export type EditableLight = {
  id: string;
  kind: EditableLightKind;
  position: [number, number, number];
  rotation: [number, number, number];
  /** Point: scale.x drives distance. Area: scale.x/y = width/height. */
  scale: [number, number, number];
  color: string;
  intensity: number;
};

export type AmbientFill = {
  id: string;
  color: string;
  intensity: number;
};

export const BUBBLE_MAX_LIGHTS = 8;

/** Tuned defaults from geometry-view screenshots (dir 4.35 / fill 2.85). */
export const DEFAULT_BUBBLE_LIGHTS: EditableLight[] = [
  {
    id: "dir-key",
    kind: "directional",
    position: [1.35, 2.15, 1.7],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: "#ffffff",
    intensity: 4.35,
  },
  {
    id: "pt-fill",
    kind: "point",
    position: [-1.55, 0.55, 1.45],
    rotation: [0, 0, 0],
    scale: [6, 6, 6],
    color: "#d4d8e4",
    intensity: 2.85,
  },
];

export const DEFAULT_BUBBLE_AMBIENTS: AmbientFill[] = [
  { id: "amb-water", color: "#c8c9ce", intensity: 0.4 },
];

/** @deprecated Glass lights live hardcoded in SceneViewer; kept as an alias. */
export const DEFAULT_EDITABLE_LIGHTS = DEFAULT_BUBBLE_LIGHTS;
/** @deprecated Use DEFAULT_BUBBLE_AMBIENTS. */
export const DEFAULT_AMBIENT_FILLS = DEFAULT_BUBBLE_AMBIENTS;

export type BubbleLightUniforms = {
  uLightCount: { value: number };
  uLightPos: { value: THREE.Vector3[] };
  uLightColor: { value: THREE.Color[] };
  uLightIntensity: { value: number[] };
  uLightKind: { value: number[] };
  uAmbientColor: { value: THREE.Color };
};

export function createBubbleLightUniforms(): BubbleLightUniforms {
  return {
    uLightCount: { value: 0 },
    uLightPos: {
      value: Array.from(
        { length: BUBBLE_MAX_LIGHTS },
        () => new THREE.Vector3(),
      ),
    },
    uLightColor: {
      value: Array.from({ length: BUBBLE_MAX_LIGHTS }, () => new THREE.Color()),
    },
    uLightIntensity: { value: new Array(BUBBLE_MAX_LIGHTS).fill(0) },
    uLightKind: { value: new Array(BUBBLE_MAX_LIGHTS).fill(0) },
    uAmbientColor: { value: new THREE.Color(0, 0, 0) },
  };
}

/**
 * Pack editable lights into the bubble shader uniforms.
 * Ambient is pre-multiplied and scaled so the 0–10 sliders stay usable.
 */
export function fillBubbleLightUniforms(
  uniforms: BubbleLightUniforms,
  lights: EditableLight[],
  ambients: AmbientFill[],
) {
  const count = Math.min(lights.length, BUBBLE_MAX_LIGHTS);
  uniforms.uLightCount.value = count;
  for (let i = 0; i < BUBBLE_MAX_LIGHTS; i++) {
    const l = lights[i];
    if (!l) {
      uniforms.uLightPos.value[i].set(0, 0, 0);
      uniforms.uLightColor.value[i].setRGB(0, 0, 0);
      uniforms.uLightIntensity.value[i] = 0;
      uniforms.uLightKind.value[i] = 0;
      continue;
    }
    uniforms.uLightPos.value[i].set(...l.position);
    uniforms.uLightColor.value[i].set(l.color);
    uniforms.uLightIntensity.value[i] = l.intensity;
    uniforms.uLightKind.value[i] =
      l.kind === "point" ? 0 : l.kind === "directional" ? 1 : 2;
  }

  const amb = new THREE.Color(0, 0, 0);
  for (const a of ambients) {
    amb.add(new THREE.Color(a.color).multiplyScalar(a.intensity * 0.22));
  }
  uniforms.uAmbientColor.value.copy(amb);
}

export function pointDistanceFromScale(scale: [number, number, number]): number {
  return Math.max(0.5, Math.abs(scale[0]) * 10);
}

export function areaSizeFromScale(scale: [number, number, number]): {
  width: number;
  height: number;
} {
  return {
    width: Math.max(0.15, Math.abs(scale[0])),
    height: Math.max(0.15, Math.abs(scale[1])),
  };
}

export function createPointLight(
  overrides?: Partial<Omit<EditableLight, "kind">>,
): EditableLight {
  return {
    id: `pt-${Date.now().toString(36)}`,
    kind: "point",
    position: [2, 3, 4],
    rotation: [0, 0, 0],
    scale: [6, 6, 6],
    color: "#ffffff",
    intensity: 1.5,
    ...overrides,
  };
}

export function createAreaLight(
  overrides?: Partial<Omit<EditableLight, "kind">>,
): EditableLight {
  return {
    id: `area-${Date.now().toString(36)}`,
    kind: "area",
    position: [0, 4, 3],
    rotation: [-0.6, 0, 0],
    scale: [2.5, 2.5, 1],
    color: "#ffffff",
    intensity: 2,
    ...overrides,
  };
}
