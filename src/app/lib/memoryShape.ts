import { baseForm, isArtifactForm, superRadius, type ArtifactCategory, type ArtifactForm, type SuperParams } from "./superformula";
import { ASSESSMENT_VERSION, isAssessment, type MemoryAssessment } from "../../../shared/memory-assessment.mjs";
export type { MemoryAssessment } from "../../../shared/memory-assessment.mjs";
export const MAPPING_VERSION = "memory-form-v3";
export const MEMORY_FAMILIES = ["shell", "bowl", "tower", "floral"] as const;
export type MemoryShapeFamily = typeof MEMORY_FAMILIES[number];
export const FAMILY_LABELS: Record<MemoryShapeFamily, string> = { shell: "shell · 贝", bowl: "bowl · 碗", tower: "tower · 塔", floral: "floral · 花" };
export const SHARPNESS_RULE = { pain: 0.7, disruption: 0.3, comfort: 0.15 } as const;

/**
 * The map is the user's own: eighteen kept vessel shapes placed by hand on the
 * two axes (outward 0 inward … 1 outward; sharpness 0 rounded … 1 sharp).
 * Measured on their meshes, the placements read as:
 *
 * - outward follows the profile. Outward forms have many profile flares (side m
 *   13–20: the bowls' rims, the flowers' tiers), rims wider than the waist, and
 *   lopsided lobe halves (n2 ≠ n3 in the cross-section); inward forms are
 *   closed and near-spherical, the profile with few lobes (side m 0–8).
 * - sharpness follows the protrusions. Sharp forms reach farther past their mean
 *   radius (max/mean radius, horizontal reach) and carry more cross-section
 *   lobes; rounded forms fill more of their bounding sphere.
 *
 * A point on the map takes the form of its nearest anchor (a seed may pick
 * among anchors nearly as near), then moves the rest of the way along the two
 * trends fitted to the anchors: the profile's m by the outward slope, and the
 * radius raised to a power k (n1 / k) so the protrusions deepen or soften by
 * the sharpness slope. At an anchor's own place the form is that anchor's.
 * The map's lower-left "07" is read as Y-06 (Y-07 is the spool among the
 * bowls), and its "15" as the sphere Y-20 that replaced it.
 */
export interface MapAnchor { id: string; outward: number; sharpness: number; form: ArtifactForm }
const P = (m: number, n1: number, n2: number, n3: number, a = 1, b = 1): SuperParams => ({ m, n1, n2, n3, a, b });
const anchor = (id: string, outward: number, sharpness: number, top: SuperParams, side: SuperParams, category: ArtifactCategory = "hybrid"): MapAnchor =>
  ({ id, outward, sharpness, form: { category, top, side } });
export const MAP_ANCHORS: MapAnchor[] = [
  anchor("Y-01", 0.46, 0.27, P(8, 1.7, 6.4, 1.3, 1.2, 0.5), P(0, 0.1, 3.3, 0.1, 1.25, 1.05)),
  anchor("Y-02", 0.17, 0.95, P(6, 4.1, 7.3, 7.3), P(5, 0.789, 0.2, 0.2)),
  anchor("Y-03", 0.23, 0.5, P(10, 1.506, 1.033, 0.88, 1.55, 0.95), P(3.95, 0.969, 0.573, 2.197)),
  anchor("Y-04", 0.13, 0.61, P(8, 1, 1, 1), P(4.3, 1, 1, 1)),
  anchor("Y-05", 0.28, 0.33, P(8, 0.3, 1.6, 2.3, 1.1, 1), P(0, 0.3, 5, 2.3, 1.1, 1.2)),
  anchor("Y-06", 0.29, 0.74, P(8, 20, 6.3, 9.5, 1.35, 0.55), P(7.8, 1.5, 0.2, 0.6, 1.3, 0.7)),
  anchor("Y-07", 0.62, 0.3, P(0, 0.1, 0.1, 1, 0.95, 0.95), P(13.3, 1.6, 0.5, 8.3, 1.35, 1.4)),
  anchor("Y-08", 0.14, 0.27, P(16, 20, 6.3, 3.3, 1.45, 0.75), P(2.6, 0.7, 0.1, 0.7, 0.85, 1.25)),
  anchor("Y-09", 0.47, 0.14, P(0.4, 1.7, 0.1, 5.5, 0.9, 0.9), P(1.4, 0.6, 0.3, 0.4, 0.5, 0.5)),
  anchor("Y-10", 0.5, 0.46, P(6, 3, 0.9, 1.9, 1, 1.1), P(12.2, 7.9, 17.3, 2.4, 1.3, 0.85)),
  anchor("Y-11", 0.09, 0.88, P(7, 0.2, 1.7, 1.7), P(9.2, 4.8, 20, 1.9, 1.3, 0.8)),
  anchor("Y-12", 0.87, 0.95, P(20.9, 4.034, 6.4, 1.3, 1.2, 0.5), P(20.3, 0.805, 0.994, 9.386, 1.5, 0.65)),
  anchor("Y-13", 0.5, 0.6, P(20.9, 4.034, 6.4, 1.3, 1.2, 0.5), P(4.3, 0.805, 0.994, 9.386, 1.5, 0.65)),
  anchor("Y-14", 0.02, 0.18, P(7.9, 4.734, 8.975, 1.377, 1.15, 0.5), P(7.75, 3.309, 2.645, 1.933, 1.3, 0.65)),
  anchor("Y-16", 0.66, 0.68, P(9, 0.558, 0.558, 0.558), P(10.15, 0.603, 2.022, 0.156), "urchin"),
  anchor("Y-17", 0.74, 0.22, P(7.3, 16.586, 17.235, 0.3), P(19.05, 0.495, 0.717, 0.156), "urchin"),
  anchor("Y-18", 0.78, 0.82, P(14.25, 7.551, 7.948, 0.863, 1.35, 0.85), P(19.05, 0.495, 0.731, 0.254), "urchin"),
  anchor("Y-20", 0, 0.05, P(0, 0.47, 1.734, 0.95, 1.1, 1), P(0, 0.915, 1.825, 1.825), "flower"),
];
/** Where each family's card is drawn: the middle of its quadrant. */
export const FAMILY_CENTERS: Record<MemoryShapeFamily, { outward: number; sharpness: number }> = {
  shell: { outward: 0.25, sharpness: 0.25 }, bowl: { outward: 0.75, sharpness: 0.25 },
  tower: { outward: 0.25, sharpness: 0.75 }, floral: { outward: 0.75, sharpness: 0.75 },
};
export const FAMILY_NOTES: Record<MemoryShapeFamily, string> = {
  shell: "a closed, gathered body; the profile barely lobes",
  bowl: "a soft waist under flared rims; many profile flares",
  tower: "a few deep points held close to the body",
  floral: "many lobes and tiers reaching out",
};

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
  /** The map anchor the form was taken from; null for the neutral sphere. */
  anchor: string | null;
  form: ArtifactForm;
  model?: string;
}
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const round = (v: number) => Math.round(v * 10000) / 10000;
/** Seeded variation is local to a neighbourhood of the map; it never chooses the family. */
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

/* ───────── the trends, fitted to the anchors ───────── */

/** Farthest point over mean distance of the solid, sampled coarsely — how far it reaches past its body. */
function reachOf(form: ArtifactForm) {
  const pts: number[] = [];
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 1; i < 48; i++) {
    const phi = -Math.PI / 2 + (i / 48) * Math.PI, r2 = superRadius(phi, form.side);
    for (let j = 0; j < 96; j++) {
      const theta = (j / 96) * Math.PI * 2, r1 = superRadius(theta, form.top);
      const p = [r1 * Math.cos(theta) * r2 * Math.cos(phi), r2 * Math.sin(phi), r1 * Math.sin(theta) * r2 * Math.cos(phi)];
      for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], p[a]); hi[a] = Math.max(hi[a], p[a]); }
      pts.push(...p);
    }
  }
  const c = lo.map((l, a) => (l + hi[a]) / 2);
  let sum = 0, max = 0;
  for (let k = 0; k < pts.length; k += 3) {
    const d = Math.hypot(pts[k] - c[0], pts[k + 1] - c[1], pts[k + 2] - c[2]);
    sum += d; if (d > max) max = d;
  }
  return max / (sum / (pts.length / 3) || 1);
}
/** Least squares y ≈ b0 + bOut·outward + bSharp·sharpness over the anchors. */
function fit(ys: number[]) {
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], v = [0, 0, 0];
  MAP_ANCHORS.forEach((a, i) => {
    const x = [1, a.outward, a.sharpness];
    for (let r = 0; r < 3; r++) { v[r] += x[r] * ys[i]; for (let c = 0; c < 3; c++) M[r][c] += x[r] * x[c]; }
  });
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]]; [v[c], v[p]] = [v[p], v[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k < 3; k++) M[r][k] -= f * M[c][k];
      v[r] -= f * v[c];
    }
  }
  const [b0, bOut, bSharp] = v.map((x, i) => x / M[i][i]);
  return { b0: round(b0), bOut: round(bOut), bSharp: round(bSharp) };
}
const ANCHOR_REACH = MAP_ANCHORS.map((a) => reachOf(a.form));
/** What moves with each axis, per unit of the map: profile flares with outward, reach with sharpness. */
export const MAP_TRENDS = {
  sideM: fit(MAP_ANCHORS.map((a) => a.form.side.m)),
  reach: fit(ANCHOR_REACH),
};
/** The farthest a point moves an anchor: a few profile lobes, the radius's power within reason. */
const SIDE_SHIFT_MAX = 3;
const K_RANGE = [0.6, 1.5] as const;
/**
 * The seed's room around an anchor. Exponents and a/b vary by a factor e^±amount
 * (.18 ≈ ×0.84…1.2); the profile's m by ± that many lobes. The cross-section's m
 * is left alone so a closed seam stays closed, and n2 = n3 stays equal.
 */
export const VARIATION = { exponent: 0.18, aspect: 0.08, profile: 1.2 };

export interface MapForm { form: ArtifactForm; anchor: string }
/** The form at a point on the map: the nearest anchor's, carried the rest of the way along the trends. */
export function formAt(outward: number, sharpness: number, seed: string): MapForm {
  const o = clamp(outward), s = clamp(sharpness);
  const rand = random(`${MAPPING_VERSION}|${seed}|${o.toFixed(4)}|${s.toFixed(4)}`);
  const ds = MAP_ANCHORS.map((a) => Math.hypot(a.outward - o, a.sharpness - s));
  const nearest = Math.min(...ds);
  const near = MAP_ANCHORS.map((a, i) => ({ a, i, d: ds[i] })).filter(({ d }) => d <= nearest + 0.06);
  const weights = near.map(({ d }) => 1 / (d + 0.03) ** 2);
  let pick = rand() * weights.reduce((x, y) => x + y, 0), chosen = near[0];
  for (let i = 0; i < near.length; i++) { pick -= weights[i]; if (pick <= 0) { chosen = near[i]; break; } }
  const { a, i } = chosen;
  const dOut = o - a.outward, dSharp = s - a.sharpness;
  // sharpness: r → r^k (n1 → n1/k), so the protrusions deepen or soften toward the reach the trend asks for
  const reach = ANCHOR_REACH[i];
  const wanted = Math.max(1.02, reach + MAP_TRENDS.reach.bSharp * dSharp);
  const k = Math.log(reach) < 0.02 ? 1 : clamp(Math.log(wanted) / Math.log(reach), K_RANGE[0], K_RANGE[1]);
  // outward: the profile gains or loses flares; a circular profile (m < 1) has none to move
  const shift = clamp(MAP_TRENDS.sideM.bOut * dOut, -SIDE_SHIFT_MAX, SIDE_SHIFT_MAX);
  const vary = (amount: number) => Math.exp((rand() * 2 - 1) * amount);
  const set = (p: SuperParams, m: number): SuperParams => {
    const n2 = p.n2 * vary(VARIATION.exponent);
    const out: SuperParams = { ...p, m: round(m), n1: round((p.n1 / k) * vary(VARIATION.exponent)), n2: round(n2), n3: round(p.n2 === p.n3 ? n2 : p.n3 * vary(VARIATION.exponent)) };
    // a = b = 1 stays symmetric; an anchor already uneven may be more or less so
    if ((p.a ?? 1) !== 1 || (p.b ?? 1) !== 1) { out.a = round((p.a ?? 1) * vary(VARIATION.aspect)); out.b = round((p.b ?? 1) * vary(VARIATION.aspect)); }
    return out;
  };
  const top = set(a.form.top, a.form.top.m);
  const profile = (rand() * 2 - 1) * VARIATION.profile;
  const side = set(a.form.side, a.form.side.m >= 1 ? clamp(Math.round((a.form.side.m + shift + profile) * 20) / 20, 1, 24) : a.form.side.m);
  return { form: { category: a.form.category, top, side }, anchor: a.id };
}
/** The form drawn for a family's card: the middle of its quadrant. */
export function familyForm(family: MemoryShapeFamily, seed: string): ArtifactForm {
  const c = FAMILY_CENTERS[family];
  return formAt(c.outward, c.sharpness, `${seed}|${family}`).form;
}
export function assignMemoryShape(assessment: MemoryAssessment | null, seed: string, source: MemoryAssignment["source"] = "api", model?: string, transcript = ""): MemoryAssignment {
  const usable = assessment && isAssessment(assessment) && !assessment.insufficientEvidence;
  const coordinates = usable ? assessmentCoordinates(assessment) : { outward: 0.5, sharpness: 0.5 };
  const weights = familyWeights(coordinates.outward, coordinates.sharpness);
  const ranked = MEMORY_FAMILIES.slice().sort((a,b) => weights[b]-weights[a]);
  const margin = weights[ranked[0]] - weights[ranked[1]];
  // The family is a label for the quadrant; near a tie there is none, though the map still gives a form.
  const family = usable && margin > 0.025 ? ranked[0] : null;
  const mapped = usable ? formAt(coordinates.outward, coordinates.sharpness, seed) : null;
  return { version: MAPPING_VERSION, assessmentVersion: ASSESSMENT_VERSION, seed, transcriptKey: transcriptKey(transcript), source: usable ? source : "fallback", family,
    assessment: assessment && isAssessment(assessment) ? assessment : null, coordinates, weights,
    anchor: mapped ? mapped.anchor : null,
    form: mapped ? mapped.form : baseForm("sphere"), ...(model ? { model } : {}) };
}
export function isMemoryAssignment(value: unknown, transcript: string): value is MemoryAssignment {
  const a = value as MemoryAssignment | null;
  if (!a || a.version !== MAPPING_VERSION || a.assessmentVersion !== ASSESSMENT_VERSION || typeof a.seed !== "string" || a.transcriptKey !== transcriptKey(transcript) || !["api","manual","fallback"].includes(a.source)) return false;
  if (a.assessment !== null && !isAssessment(a.assessment, a.source === "manual" ? undefined : transcript)) return false;
  if (!isArtifactForm(a.form)) return false;
  const expected = assignMemoryShape(a.assessment, a.seed, a.source, a.model, transcript);
  return JSON.stringify(expected) === JSON.stringify(a);
}
