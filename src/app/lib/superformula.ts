/*
 * Gielis' superformula — the mesh of every memory artifact.
 *
 *   r(φ) = ( |cos(mφ/4) / a|^n2 + |sin(mφ/4) / b|^n3 )^(−1/n1)
 *
 * a and b default to 1, which is the curve every sampled category draws.
 *
 * Two evaluations make a solid (the spherical product): r1 over longitude
 * draws the top-down cross-section, r2 over latitude the side profile.
 * three.js is y-up, so the profile stands along y:
 *
 *   x = r1(θ)·cos θ · r2(φ)·cos φ
 *   z = r1(θ)·sin θ · r2(φ)·cos φ
 *   y = r2(φ)·sin φ
 *
 * Longitude runs 0 → 2π rather than −π → π. Every closed form draws the same
 * surface either way; only this way does a non-integer m leave the curve open
 * at the seam, which is what the torn category is for.
 *
 * An artifact is first assigned a category, then each parameter deviates from
 * that category's sample config without leaving the category's range. The
 * ranges are the ones in superformula_3d_categories.md.
 *
 * No three.js here: scripts/check-superformula.mjs loads this file on its own.
 */

export interface SuperParams {
  /** Rotational symmetry — lobes or corners. 0 is a circle; a non-integer leaves the curve open. */
  m: number;
  /** Inflation: below 1 pinches the sides into spikes, large values push toward a convex polygon. */
  n1: number;
  /** The two halves of each lobe. Equal is symmetric; ~1 straight, ~2 smooth, large flat-sided. */
  n2: number;
  n3: number;
  /** Scales the cosine half. Absent is 1, the curve the categories draw. */
  a?: number;
  /** Scales the sine half. Absent is 1. */
  b?: number;
}

export const ARTIFACT_CATEGORIES = [
  "sphere",
  "roundedBox",
  "sharpCube",
  "diamond",
  "cylinder",
  "prism",
  "star",
  "flower",
  "urchin",
  "gear",
  "hybrid",
  "torn",
] as const;

export type ArtifactCategory = (typeof ARTIFACT_CATEGORIES)[number];

/** The whole of an artifact's shape — small enough to carry in location.state. */
export interface ArtifactForm {
  category: ArtifactCategory;
  /** Set 1 — r1 over longitude: the top-down cross-section. */
  top: SuperParams;
  /** Set 2 — r2 over latitude: the side profile. */
  side: SuperParams;
  /** Hybrids only: the categories the two sets were drawn from. */
  hybridOf?: [ArtifactCategory, ArtifactCategory];
  /** Optional radial / vertical proportions for the semantic families; applied before normalization. */
  proportion?: { radial: number; vertical: number };
}

/* ───────── categories ───────── */

interface ParamRange {
  min: number;
  max: number;
  /** The category's sample config — where the deviation starts. */
  base: number;
  /** Exponents span orders of magnitude, so they deviate on a log scale. */
  log?: boolean;
  /** integer closes the curve; even closes it when n2 ≠ n3; fractional keeps it open. */
  step?: "integer" | "even" | "fractional";
}

interface SetRange {
  m: ParamRange;
  n1: ParamRange;
  /** "n1" / "n2": the exponent is tied to that one rather than drawn on its own. */
  n2: ParamRange | "n1";
  n3: ParamRange | "n1" | "n2";
  /** Smallest gap kept between n2 and n3, so the lobes stay lopsided. */
  apart?: number;
}

export interface CategorySpec {
  label: string;
  /** One range per set; more than one is a choice between variants. */
  top: SetRange[];
  side: SetRange[];
}

const fixed = (value: number): ParamRange => ({ min: value, max: value, base: value });
const span = (
  min: number,
  max: number,
  base: number,
  options: Pick<ParamRange, "log" | "step"> = {},
): ParamRange => ({ min, max, base, ...options });
/** n1 = n2 = n3 */
const tied = (m: ParamRange, n: ParamRange): SetRange => ({ m, n1: n, n2: "n1", n3: "n1" });

const LOG = { log: true } as const;
const INTEGER = { step: "integer" } as const;

/** m = 0: a circle, whatever the exponents. */
const ROUND = tied(fixed(0), fixed(1));
/** m = 4 with n1 = n2 = n3 = 2 is also a circle. Held to a soft band around 2
    so a blob can lean a little toward a cushion or a pebble. */
const BLOB = tied(fixed(4), span(1.6, 2.6, 2, LOG));
/** m = 4, high n: a hard-cornered square — the cylinder's and prism's profile. */
const squared = (base: number) => tied(fixed(4), span(10, 50, base, LOG));
const FLOWER: SetRange = {
  m: span(5, 12, 7, INTEGER),
  n1: span(0.15, 0.4, 0.2, LOG),
  n2: span(1.5, 2, 1.7),
  n3: "n2",
};
const GEAR: SetRange = {
  m: span(4, 12, 6, { step: "even" }),
  n1: span(0.5, 2, 1, LOG),
  n2: span(1, 8, 7, LOG),
  n3: span(4, 15, 8, LOG),
  apart: 1,
};

/*
 * n1 below 0.15 makes razor-thin, self-intersecting surfaces, so the spiky
 * ranges start there rather than at the reference's 0.1. A star's arms thin
 * the same way as n2 drops — below ~0.25 they are needles that vanish under
 * the frost — so the star keeps to the upper part of its range.
 */
export const CATEGORY_SPECS: Record<Exclude<ArtifactCategory, "hybrid">, CategorySpec> = {
  sphere: { label: "sphere", top: [ROUND, BLOB], side: [ROUND, BLOB] },
  roundedBox: {
    label: "rounded box",
    top: [tied(fixed(4), span(3, 8, 4, LOG))],
    side: [tied(fixed(4), span(3, 8, 4, LOG))],
  },
  sharpCube: { label: "sharp cube", top: [squared(20)], side: [squared(20)] },
  diamond: {
    label: "diamond",
    top: [tied(fixed(4), span(0.8, 1.2, 1))],
    side: [tied(fixed(4), span(0.8, 1.2, 1))],
  },
  cylinder: { label: "cylinder", top: [ROUND], side: [squared(20)] },
  prism: {
    label: "prism",
    top: [tied(span(3, 8, 6, INTEGER), span(10, 50, 20, LOG))],
    side: [squared(20)],
  },
  star: {
    label: "star",
    top: [{ m: span(3, 8, 5, INTEGER), n1: span(0.2, 0.5, 0.3, LOG), n2: span(0.25, 1, 0.3, LOG), n3: "n2" }],
    side: [{ m: span(0, 2, 1), n1: span(0.2, 0.5, 0.3, LOG), n2: span(0.25, 1, 0.3, LOG), n3: "n2" }],
  },
  flower: { label: "flower", top: [FLOWER], side: [FLOWER] },
  urchin: {
    label: "urchin",
    top: [tied(span(8, 20, 12, INTEGER), span(0.2, 0.6, 0.5, LOG))],
    side: [tied(span(8, 20, 12, INTEGER), span(0.2, 0.6, 0.5, LOG))],
  },
  // the side is a disc, or the same lopsided lobes again for a lumpy solid
  gear: { label: "gear", top: [GEAR], side: [squared(10), GEAR] },
  torn: {
    label: "torn",
    top: [{
      m: span(2.5, 12.5, 7.3, { step: "fractional" }),
      n1: span(0.15, 1, 0.2, LOG),
      n2: span(1, 4, 1.7, LOG),
      n3: "n2",
    }],
    side: [FLOWER],
  },
};

export const CATEGORY_LABELS: Record<ArtifactCategory, string> = {
  ...Object.fromEntries(
    Object.entries(CATEGORY_SPECS).map(([id, spec]) => [id, spec.label]),
  ),
  hybrid: "hybrid",
} as Record<ArtifactCategory, string>;

/** A hybrid's two sets come from two different categories. Torn is left out:
    an open seam belongs to its own category. */
export const HYBRID_SOURCES = ARTIFACT_CATEGORIES.filter(
  (c): c is Exclude<ArtifactCategory, "hybrid" | "torn"> => c !== "hybrid" && c !== "torn",
);

/** How often each category is assigned. Even, for now. */
const CATEGORY_WEIGHTS: Record<ArtifactCategory, number> = {
  sphere: 1,
  roundedBox: 1,
  sharpCube: 1,
  diamond: 1,
  cylinder: 1,
  prism: 1,
  star: 1,
  flower: 1,
  urchin: 1,
  gear: 1,
  hybrid: 1,
  torn: 1,
};

/* ───────── sampling ───────── */

type Rand = () => number;

/** How far a deviation may travel from the sample config toward the edge of
    its range — 1 is all the way. The draw is triangular, so most artifacts
    stay near the sample and a few reach the edges. */
const DEVIATION = 1;

const round3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function deviate(range: ParamRange, rand: Rand): number {
  const { min, max, base } = range;
  if (min === max) return min;
  const u = (rand() + rand() - 1) * DEVIATION;
  let value: number;
  if (range.log) {
    const b = Math.log(base);
    value = Math.exp(u < 0 ? b + u * (b - Math.log(min)) : b + u * (Math.log(max) - b));
  } else {
    value = u < 0 ? base + u * (base - min) : base + u * (max - base);
  }
  if (range.step === "integer") value = Math.round(value);
  else if (range.step === "even") value = 2 * Math.round(value / 2);
  else if (range.step === "fractional") {
    // keep well clear of a whole number, or the tear closes up
    const whole = Math.floor(value);
    value = whole + 0.2 + 0.6 * (value - whole);
  }
  return round3(clamp(value, min, max));
}

function sampleSet(variants: SetRange[], rand: Rand): SuperParams {
  const range = variants.length === 1 ? variants[0] : variants[Math.floor(rand() * variants.length)];
  const m = deviate(range.m, rand);
  const n1 = deviate(range.n1, rand);
  const n2 = range.n2 === "n1" ? n1 : deviate(range.n2, rand);
  let n3 = range.n3 === "n1" ? n1 : range.n3 === "n2" ? n2 : deviate(range.n3, rand);
  if (range.apart && typeof range.n3 === "object" && Math.abs(n2 - n3) < range.apart) {
    const above = n2 + range.apart;
    n3 = round3(above <= range.n3.max ? above : Math.max(range.n3.min, n2 - range.apart));
  }
  return { m, n1, n2, n3 };
}

function baseSet(variants: SetRange[]): SuperParams {
  const range = variants[0];
  const n1 = range.n1.base;
  const n2 = range.n2 === "n1" ? n1 : range.n2.base;
  const n3 = range.n3 === "n1" ? n1 : range.n3 === "n2" ? n2 : range.n3.base;
  return { m: range.m.base, n1, n2, n3 };
}

function pickCategory(rand: Rand): ArtifactCategory {
  const total = ARTIFACT_CATEGORIES.reduce((sum, c) => sum + CATEGORY_WEIGHTS[c], 0);
  let at = rand() * total;
  for (const c of ARTIFACT_CATEGORIES) {
    at -= CATEGORY_WEIGHTS[c];
    if (at < 0) return c;
  }
  return ARTIFACT_CATEGORIES[ARTIFACT_CATEGORIES.length - 1];
}

function sampleHybrid(rand: Rand): ArtifactForm {
  for (let tries = 0; ; tries++) {
    const topFrom = HYBRID_SOURCES[Math.floor(rand() * HYBRID_SOURCES.length)];
    const others = HYBRID_SOURCES.filter((c) => c !== topFrom);
    const sideFrom = others[Math.floor(rand() * others.length)];
    const top = sampleSet(CATEGORY_SPECS[topFrom].top, rand);
    const side = sampleSet(CATEGORY_SPECS[sideFrom].side, rand);
    // two circles make a ball, not a hybrid
    if (top.m === 0 && side.m === 0 && tries < 8) continue;
    return { category: "hybrid", top, side, hybridOf: [topFrom, sideFrom] };
  }
}

/** FNV-1a — a memory id to a seed. */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): Rand {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A new artifact: a category, then a deviation inside it. A seed makes the
 * same form every time; a category skips the draw and deviates inside that one.
 */
export function createArtifactForm(
  options: { seed?: string; category?: ArtifactCategory } = {},
): ArtifactForm {
  const rand = options.seed === undefined ? Math.random : mulberry32(hashString(options.seed));
  const category = options.category ?? pickCategory(rand);
  if (category === "hybrid") return sampleHybrid(rand);
  const spec = CATEGORY_SPECS[category];
  return { category, top: sampleSet(spec.top, rand), side: sampleSet(spec.side, rand) };
}

/** A curated memory's form, the same on every screen and every visit. */
export function formForMemory(id: string): ArtifactForm {
  return createArtifactForm({ seed: `form|${id}` });
}

/** The category's sample config, with no deviation. */
export function baseForm(category: ArtifactCategory): ArtifactForm {
  if (category === "hybrid") {
    // the reference's star prism
    return {
      category,
      top: baseSet(CATEGORY_SPECS.star.top),
      side: baseSet(CATEGORY_SPECS.sharpCube.side),
      hybridOf: ["star", "sharpCube"],
    };
  }
  const spec = CATEGORY_SPECS[category];
  return { category, top: baseSet(spec.top), side: baseSet(spec.side) };
}

/** What a viewer draws when nothing handed it a form. */
export const DEFAULT_ARTIFACT_FORM: ArtifactForm = baseForm("sphere");

/* ───────── validation / identity ───────── */

const isScale = (v: unknown) => v === undefined || (typeof v === "number" && Number.isFinite(v) && v > 0);

function isParams(value: unknown): value is SuperParams {
  const p = value as SuperParams | null;
  return (
    !!p &&
    typeof p === "object" &&
    [p.m, p.n1, p.n2, p.n3].every((v) => typeof v === "number" && Number.isFinite(v)) &&
    p.m >= 0 &&
    p.n1 > 0 &&
    p.n2 > 0 &&
    p.n3 > 0 &&
    isScale(p.a) &&
    isScale(p.b)
  );
}

export function isArtifactForm(value: unknown): value is ArtifactForm {
  const form = value as ArtifactForm | null;
  return (
    !!form &&
    typeof form === "object" &&
    (ARTIFACT_CATEGORIES as readonly string[]).includes(form.category) &&
    isParams(form.top) &&
    isParams(form.side) &&
    (form.proportion === undefined || (!!form.proportion &&
      [form.proportion.radial, form.proportion.vertical].every(v => Number.isFinite(v) && v >= 0.5 && v <= 1.5)))
  );
}

/**
 * The form the create flow is carrying. The recording step hands it on as
 * `shape.form`; the shape steps carry it as `form`.
 */
export function formFromState(state: unknown): ArtifactForm | null {
  const s = state as { form?: unknown; shape?: { form?: unknown } } | null;
  if (isArtifactForm(s?.form)) return s.form;
  if (isArtifactForm(s?.shape?.form)) return s.shape.form;
  return null;
}

const paramsKey = (p: SuperParams) => `${p.m},${p.n1},${p.n2},${p.n3},${p.a ?? 1},${p.b ?? 1}`;

/** Two forms with the same key draw the same mesh. */
export function formKey(form: ArtifactForm): string {
  return `${paramsKey(form.top)}/${paramsKey(form.side)}` + (form.proportion ? `/scale:${form.proportion.radial},${form.proportion.vertical}` : "");
}

/** e.g. "flower · (7, 0.21, 1.72, 1.72) / (7, 0.19, 1.66, 1.66)" */
export function describeForm(form: ArtifactForm): string {
  const n = (v: number) => String(Math.round(v * 100) / 100);
  const set = (p: SuperParams) => {
    const core = [n(p.m), n(p.n1), n(p.n2), n(p.n3)];
    if ((p.a ?? 1) !== 1 || (p.b ?? 1) !== 1) core.push(n(p.a ?? 1), n(p.b ?? 1));
    return `(${core.join(", ")})`;
  };
  const label = form.hybridOf
    ? `hybrid of ${CATEGORY_LABELS[form.hybridOf[0]]} / ${CATEGORY_LABELS[form.hybridOf[1]]}`
    : CATEGORY_LABELS[form.category];
  return `${label} · ${set(form.top)} / ${set(form.side)}` + (form.proportion ? ` · radial ${n(form.proportion.radial)} / vertical ${n(form.proportion.vertical)}` : "");
}

/* ───────── mesh ───────── */

/** Where a spike's radius stops: small n1 sends r toward infinity. */
const R_MAX = 50;
const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;

export function superRadius(angle: number, p: SuperParams): number {
  const t = (p.m * angle) / 4;
  const a = p.a ?? 1;
  const b = p.b ?? 1;
  const sum = Math.pow(Math.abs(Math.cos(t)) / a, p.n2) + Math.pow(Math.abs(Math.sin(t)) / b, p.n3);
  const r = Math.pow(sum, -1 / p.n1);
  // also catches NaN and the Infinity of an empty sum
  return r < R_MAX ? r : R_MAX;
}

/** A curve meets itself after a full turn when its lobes tile the circle. */
export function closesAround(p: SuperParams): boolean {
  return Number.isInteger(p.m) && (p.n2 === p.n3 || p.m % 2 === 0);
}

/** Spikier, many-lobed sets need more samples or their tips come out jagged.
    The floor keeps the bump texture (SceneViewer) above its sampling limit. */
function segmentsFor(p: SuperParams, base: number, perLobe: number, min: number, max: number) {
  const sharp = p.n1 < 1 ? 1.5 : 1;
  return clamp(Math.ceil((base + perLobe * p.m * sharp) / 8) * 8, min, max);
}

export interface ArtifactMesh {
  /** The settled form: centred on its bounding box, largest |coordinate| = 1. Read only. */
  positions: Float32Array;
  /** The same vertices on a sphere of the form's mean radius — where growth starts. Read only. */
  sphere: Float32Array;
  /** Normals of `positions`. Read only. */
  normals: Float32Array;
  index: Uint16Array | Uint32Array;
  /** Bounding-box size of the settled form. */
  size: [number, number, number];
  /** Farthest vertex of either pose from the origin. */
  radius: number;
  vertexCount: number;
}

/**
 * A latitude/longitude grid. The poles are single vertices, and the seam
 * column is shared when the cross-section closes; an open one (torn) gets its
 * own seam column so the tear stays a tear.
 */
export function buildArtifactMesh(form: ArtifactForm): ArtifactMesh {
  const { top, side } = form;
  const lon = segmentsFor(top, 48, 12, 128, 224);
  const lat = segmentsFor(side, 32, 8, 64, 128);
  const closed = closesAround(top);
  const columns = closed ? lon : lon + 1;
  const rings = lat - 1;
  const vertexCount = rings * columns + 2;

  const colX = new Float64Array(columns);
  const colZ = new Float64Array(columns);
  const dirX = new Float64Array(columns);
  const dirZ = new Float64Array(columns);
  for (let j = 0; j < columns; j++) {
    const theta = (j / lon) * TAU;
    const r = superRadius(theta, top);
    dirX[j] = Math.cos(theta);
    dirZ[j] = Math.sin(theta);
    colX[j] = r * dirX[j];
    colZ[j] = r * dirZ[j];
  }
  const ringW = new Float64Array(rings);
  const ringY = new Float64Array(rings);
  const dirW = new Float64Array(rings);
  const dirY = new Float64Array(rings);
  for (let i = 0; i < rings; i++) {
    const phi = -HALF_PI + ((i + 1) / lat) * Math.PI;
    const r = superRadius(phi, side);
    dirW[i] = Math.cos(phi);
    dirY[i] = Math.sin(phi);
    ringW[i] = r * dirW[i];
    ringY[i] = r * dirY[i];
  }

  const positions = new Float32Array(vertexCount * 3);
  const sphere = new Float32Array(vertexCount * 3);
  const poleR = superRadius(HALF_PI, side);
  const north = vertexCount - 1;
  positions[1] = -poleR;
  sphere[1] = -1;
  positions[north * 3 + 1] = poleR;
  sphere[north * 3 + 1] = 1;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < columns; j++) {
      const v3 = (1 + i * columns + j) * 3;
      positions[v3] = colX[j] * ringW[i];
      positions[v3 + 1] = ringY[i];
      positions[v3 + 2] = colZ[j] * ringW[i];
      sphere[v3] = dirX[j] * dirW[i];
      sphere[v3 + 1] = dirY[i];
      sphere[v3 + 2] = dirZ[j] * dirW[i];
    }
  }

  // Proportions are part of the saved form and cache identity, never a viewer-only scale.
  if (form.proportion) {
    for (let k = 0; k < positions.length; k += 3) {
      positions[k] *= form.proportion.radial;
      positions[k + 1] *= form.proportion.vertical;
      positions[k + 2] *= form.proportion.radial;
    }
  }

  // Centre on the bounding box and normalise for display.
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < positions.length; k += 3) {
    for (let a = 0; a < 3; a++) {
      const v = positions[k + a];
      if (v < lo[a]) lo[a] = v;
      if (v > hi[a]) hi[a] = v;
    }
  }
  const centre = lo.map((l, a) => (l + hi[a]) / 2);
  const half = Math.max((hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, (hi[2] - lo[2]) / 2) || 1;
  let meanR = 0;
  let maxR = 0;
  for (let k = 0; k < positions.length; k += 3) {
    const x = (positions[k] - centre[0]) / half;
    const y = (positions[k + 1] - centre[1]) / half;
    const z = (positions[k + 2] - centre[2]) / half;
    positions[k] = x;
    positions[k + 1] = y;
    positions[k + 2] = z;
    const r = Math.sqrt(x * x + y * y + z * z);
    meanR += r;
    if (r > maxR) maxR = r;
  }
  meanR /= vertexCount;
  for (let k = 0; k < sphere.length; k++) sphere[k] *= meanR;

  const triangles = 2 * lon * rings;
  const index = vertexCount < 65536 ? new Uint16Array(triangles * 3) : new Uint32Array(triangles * 3);
  const at = (i: number, j: number) => 1 + i * columns + (closed ? j % columns : j);
  let t = 0;
  for (let j = 0; j < lon; j++) {
    index[t++] = 0;
    index[t++] = at(0, j);
    index[t++] = at(0, j + 1);
  }
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < lon; j++) {
      const a = at(i, j);
      const b = at(i, j + 1);
      const c = at(i + 1, j + 1);
      const d = at(i + 1, j);
      index[t++] = a;
      index[t++] = c;
      index[t++] = b;
      index[t++] = a;
      index[t++] = d;
      index[t++] = c;
    }
  }
  for (let j = 0; j < lon; j++) {
    index[t++] = north;
    index[t++] = at(rings - 1, j + 1);
    index[t++] = at(rings - 1, j);
  }

  const normals = new Float32Array(vertexCount * 3);
  computeMeshNormals(positions, index, normals);

  return {
    positions,
    sphere,
    normals,
    index,
    size: [(hi[0] - lo[0]) / half, (hi[1] - lo[1]) / half, (hi[2] - lo[2]) / half],
    radius: Math.max(maxR, meanR),
    vertexCount,
  };
}

/**
 * Area-weighted vertex normals, straight on typed arrays — the viewers rerun
 * this whenever they move the vertices, so it stays off three's per-vertex
 * Vector3 path.
 */
export function computeMeshNormals(
  positions: ArrayLike<number>,
  index: ArrayLike<number>,
  out: Float32Array,
): void {
  out.fill(0);
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t] * 3;
    const b = index[t + 1] * 3;
    const c = index[t + 2] * 3;
    const abx = positions[b] - positions[a];
    const aby = positions[b + 1] - positions[a + 1];
    const abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a];
    const acy = positions[c + 1] - positions[a + 1];
    const acz = positions[c + 2] - positions[a + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    out[a] += nx;
    out[a + 1] += ny;
    out[a + 2] += nz;
    out[b] += nx;
    out[b + 1] += ny;
    out[b + 2] += nz;
    out[c] += nx;
    out[c + 1] += ny;
    out[c + 2] += nz;
  }
  for (let k = 0; k < out.length; k += 3) {
    const len = Math.sqrt(out[k] * out[k] + out[k + 1] * out[k + 1] + out[k + 2] * out[k + 2]);
    if (len > 1e-12) {
      out[k] /= len;
      out[k + 1] /= len;
      out[k + 2] /= len;
    }
  }
}

/* ───────── cache ───────── */

/** Built meshes, most recently used last. Sixteen curated memories plus a
    visit's worth of new ones fit; anything older is rebuilt on demand. */
const MESH_CACHE_LIMIT = 32;
const meshCache = new Map<string, ArtifactMesh>();

export function getArtifactMesh(form: ArtifactForm): ArtifactMesh {
  const key = formKey(form);
  const hit = meshCache.get(key);
  if (hit) {
    meshCache.delete(key);
    meshCache.set(key, hit);
    return hit;
  }
  const built = buildArtifactMesh(form);
  meshCache.set(key, built);
  if (meshCache.size > MESH_CACHE_LIMIT) {
    const oldest = meshCache.keys().next().value;
    if (oldest !== undefined) meshCache.delete(oldest);
  }
  return built;
}
