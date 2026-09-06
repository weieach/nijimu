import {
  AmbientFill,
  DEFAULT_BUBBLE_AMBIENTS,
  DEFAULT_BUBBLE_LIGHTS,
  EditableLight,
} from "./sceneLights";

const KEY = "nijimu.formDraft.v1";

const FALLBACK_MATERIAL = {
  roughness: 0.35,
  reflectivity: 0.55,
  transparency: 0.85,
  fog: 0,
};

export type FormDraft = {
  modelPath: string;
  morphProgress: number;
  bubbleMaterial: typeof FALLBACK_MATERIAL;
  lights: EditableLight[];
  ambients: AmbientFill[];
};

export function saveFormDraft(draft: FormDraft): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // private mode
  }
}

export function loadFormDraft(): FormDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FormDraft>;
    if (typeof parsed.modelPath !== "string") return null;
    return {
      modelPath: parsed.modelPath,
      morphProgress:
        typeof parsed.morphProgress === "number" ? parsed.morphProgress : 0,
      bubbleMaterial: {
        ...FALLBACK_MATERIAL,
        ...parsed.bubbleMaterial,
      },
      lights: Array.isArray(parsed.lights) ? parsed.lights : DEFAULT_BUBBLE_LIGHTS,
      ambients: Array.isArray(parsed.ambients)
        ? parsed.ambients
        : DEFAULT_BUBBLE_AMBIENTS,
    };
  } catch {
    return null;
  }
}

export function clearFormDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // private mode
  }
}

export function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
