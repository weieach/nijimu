import { ArtifactForm, isArtifactForm } from "./superformula";

// v3: the glass is the gallery's now; only the form and its growth are kept.
const KEY = "nijimu.formDraft.v3";

export type FormDraft = {
  form: ArtifactForm;
  morphProgress: number;
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
    if (!isArtifactForm(parsed.form)) return null;
    return {
      form: parsed.form,
      morphProgress:
        typeof parsed.morphProgress === "number" ? parsed.morphProgress : 0,
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
