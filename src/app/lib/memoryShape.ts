import { baseForm, isArtifactForm, type ArtifactForm, type SuperParams } from "./superformula";
import { ASSESSMENT_VERSION, isAssessment, type MemoryAssessment } from "../../../shared/memory-assessment.mjs";
export type { MemoryAssessment } from "../../../shared/memory-assessment.mjs";
export const MAPPING_VERSION = "memory-form-v1";
export const MEMORY_FAMILIES = ["shell", "bowl", "tower", "floral"] as const;
export type MemoryShapeFamily = typeof MEMORY_FAMILIES[number];
export const FAMILY_LABELS: Record<MemoryShapeFamily, string> = { shell: "shell · 贝", bowl: "bowl · 碗", tower: "tower · 塔", floral: "floral · 花" };
export const SHARPNESS_RULE = { pain: 0.7, disruption: 0.3, comfort: 0.15 } as const;
/**
 * Derivation for a=b=1, n2=n3=n:
 * r(0)=1 and r(pi/m)=2^((n/2 - 1)/n1).
 * n<2 digs valleys between ribs; reducing n1 deepens those valleys.
 * n>2 bulges between the axes; n=2 stays circular, whatever m/n1.
 * Longitude m counts ribs/petals; latitude m distributes flares or tiers.
 * Keep m even and n2=n3 so these are closed, symmetric, star-shaped surfaces.
 * These are artistic silhouettes, not literal hollow bowls or spiral shells.
 * Full-strength presets vary exponents only +/-6%, with 4/6/8 radial ribs for
 * shell/floral. Radial/vertical proportion is an explicit post-formula scale.
 * The old twelve-category random generator and its ranges remain untouched.
 */
export const FAMILY_PATTERNS = {
  shell: { top: { m: 6, n1: 0.9, n2: 1.45, n3: 1.45 }, side: { m: 2, n1: 0.8, n2: 1.25, n3: 1.25 }, radial: 0.95, vertical: 1.05, note: "soft ribs gathered over a domed body" },
  bowl: { top: { m: 4, n1: 2, n2: 2, n3: 2 }, side: { m: 6, n1: 1.8, n2: 3.8, n3: 3.8 }, radial: 1.15, vertical: 0.9, note: "smooth cross-section; the profile flares around a waist" },
  tower: { top: { m: 4, n1: 0.75, n2: 1.25, n3: 1.25 }, side: { m: 8, n1: 0.65, n2: 0.85, n3: 0.85 }, radial: 0.75, vertical: 1.25, note: "gathered cross-section; pinched latitude bands make tiers" },
  floral: { top: { m: 6, n1: 0.32, n2: 0.5, n3: 0.5 }, side: { m: 2, n1: 0.55, n2: 0.9, n3: 0.9 }, radial: 1.15, vertical: 0.9, note: "deep radial valleys leave outward-reaching petals" },
} satisfies Record<MemoryShapeFamily, { top: SuperParams; side: SuperParams; radial: number; vertical: number; note: string }>;
export interface MemoryAssignment {
  version: typeof MAPPING_VERSION;
  assessmentVersion: string;
  seed: string;
  transcriptKey: string;
  source: "api" | "manual" | "fallback";
  family: MemoryShapeFamily | null;
  assessment: MemoryAssessment | null;
  coordinates: { outward: number; sharpness: number };
  weights: Record<MemoryShapeFamily, number>;
  form: ArtifactForm;
  model?: string;
}
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const round = (v: number) => Math.round(v * 10000) / 10000;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Seeded variation is local to a family; it never chooses the family. */
function random(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h += 0x6d2b79f5; let t = Math.imul(h ^ h >>> 15, h | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
/** Revision identity only, not a cryptographic signature. Never sent as a substitute for text. */
export function transcriptKey(transcript: string) {
  let h = 2166136261;
  for (let i = 0; i < transcript.length; i++) h = Math.imul(h ^ transcript.charCodeAt(i), 16777619);
  return `${transcript.length}:${(h >>> 0).toString(16)}`;
}
export function assessmentCoordinates(a: MemoryAssessment) {
  return { outward: (a.orientation + 1) / 2, sharpness: clamp(Math.max(a.intensity, SHARPNESS_RULE.pain * a.discomfort + SHARPNESS_RULE.disruption * a.disruption) - SHARPNESS_RULE.comfort * a.comfort) };
}
export function familyWeights(outward: number, sharpness: number) {
  const o = clamp(outward), s = clamp(sharpness);
  return { shell: (1-o)*(1-s), bowl: o*(1-s), tower: (1-o)*s, floral: o*s };
}
/** At a boundary the form contracts toward a rounded transition, rather than flipping full-strength families. */
export function familyForm(family: MemoryShapeFamily, seed: string, strength = 1): ArtifactForm {
  const p = FAMILY_PATTERNS[family], rand = random(`${MAPPING_VERSION}|${seed}|${family}`);
  const t = clamp(strength);
  const varied = (n: number) => n * (0.94 + rand() * 0.12);
  const makeSet = (s: SuperParams, top: boolean): SuperParams => {
    const m = top && (family === "shell" || family === "floral") ? [4, 6, 8][Math.floor(rand()*3)] : s.m;
    // n2=n3: closed seams at all chosen lobe counts. No arbitrary exponent mixing.
    const n = round(lerp(2, varied(s.n2), t));
    return { m, n1: round(lerp(2, varied(s.n1), t)), n2: n, n3: n };
  };
  const top = makeSet(p.top, true), side = makeSet(p.side, false);
  // A bowl's longitude stays circular; all of its opening is in the profile.
  if (family === "bowl") Object.assign(top, { m: 4, n1: 2, n2: 2, n3: 2 });
  return { category: "hybrid", top, side, proportion: { radial: round(lerp(1, p.radial, t)), vertical: round(lerp(1, p.vertical, t)) } };
}
export function assignMemoryShape(assessment: MemoryAssessment | null, seed: string, source: MemoryAssignment["source"] = "api", model?: string, transcript = ""): MemoryAssignment {
  const usable = assessment && isAssessment(assessment) && !assessment.insufficientEvidence;
  const coordinates = usable ? assessmentCoordinates(assessment) : { outward: 0.5, sharpness: 0.5 };
  const weights = familyWeights(coordinates.outward, coordinates.sharpness);
  const ranked = MEMORY_FAMILIES.slice().sort((a,b) => weights[b]-weights[a]);
  const margin = weights[ranked[0]] - weights[ranked[1]];
  const family = usable && margin > 0.025 ? ranked[0] : null;
  // Bounded families fade to their circular n=2 state near either axis.
  const strength = Math.sqrt(clamp(margin / 0.65));
  return { version: MAPPING_VERSION, assessmentVersion: ASSESSMENT_VERSION, seed, transcriptKey: transcriptKey(transcript), source: usable ? source : "fallback", family,
    assessment: assessment && isAssessment(assessment) ? assessment : null, coordinates, weights,
    form: family ? familyForm(family, seed, strength) : baseForm("sphere"), ...(model ? { model } : {}) };
}
export function isMemoryAssignment(value: unknown, transcript: string): value is MemoryAssignment {
  const a = value as MemoryAssignment | null;
  if (!a || a.version !== MAPPING_VERSION || a.assessmentVersion !== ASSESSMENT_VERSION || typeof a.seed !== "string" || a.transcriptKey !== transcriptKey(transcript) || !["api","manual","fallback"].includes(a.source)) return false;
  if (a.assessment !== null && !isAssessment(a.assessment, a.source === "manual" ? undefined : transcript)) return false;
  if (!isArtifactForm(a.form)) return false;
  const expected = assignMemoryShape(a.assessment, a.seed, a.source, a.model, transcript);
  return JSON.stringify(expected) === JSON.stringify(a);
}
