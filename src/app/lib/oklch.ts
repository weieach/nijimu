/** OKLCH helpers — sample a muted full-hue field, convert for CSS and Three. */

import type { AmbientFill, EditableLight } from "./sceneLights";

export type Oklch = { l: number; c: number; h: number };

/** Soft field: hue across X, lightness down Y, chroma kept low. */
export const FIELD = {
  lTop: 0.998,
  lBottom: 0.851,
  cMin: 0.032,
  cMax: 0.118,
};

export const DEFAULT_OKLCH: Oklch = { l: 0.92, c: 0.05, h: 248 };

export function sampleField(u: number, v: number): Oklch {
  const x = clamp01(u);
  const y = clamp01(v);
  const l = FIELD.lTop + (FIELD.lBottom - FIELD.lTop) * y;
  const c = FIELD.cMin + (FIELD.cMax - FIELD.cMin) * y;
  return { l, c, h: x * 360 };
}

export function oklchCss({ l, c, h }: Oklch): string {
  return `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h.toFixed(2)})`;
}

export function oklchToHex(ok: Oklch): string {
  const { r, g, b } = oklchToSrgb(ok);
  return rgbToHex(r, g, b);
}

/** Darker rim for the bubble silhouette — same hue, less light. */
export function rimFromOklch(ok: Oklch): string {
  return oklchToHex({
    l: clamp(ok.l * 0.46, 0.18, 0.42),
    c: Math.min(ok.c * 1.1 * 0.6, 0.07),
    h: ok.h,
  });
}

/** Mesh tint: same hue as the wash, 40% less saturated, kept light. */
export function meshCoreFromOklch(ok: Oklch): string {
  return oklchToHex({
    l: clamp(ok.l * 0.9, 0.52, 0.84),
    c: Math.min(ok.c * 1.7 * 0.6, 0.12),
    h: ok.h,
  });
}

function wrapHue(h: number): number {
  return ((h % 360) + 360) % 360;
}

/** Light that seeps through the glass volume — pale, same hue as the wash. */
export function interiorFromOklch(ok: Oklch): string {
  return oklchToHex({
    l: 0.91,
    c: Math.min(Math.max(ok.c, 0.036) * 1.05, 0.08),
    h: ok.h,
  });
}

/** Pale key / fill / rim hexes — colored light, not dye. */
export function washLightHex(ok: Oklch, role: "key" | "fill" | "rim"): string {
  if (role === "key") {
    return oklchToHex({
      l: 0.97,
      c: Math.min(ok.c * 0.42, 0.038),
      h: ok.h,
    });
  }
  if (role === "fill") {
    return oklchToHex({
      l: 0.91,
      c: Math.min(ok.c * 0.7, 0.058),
      h: wrapHue(ok.h + 16),
    });
  }
  return oklchToHex({
    l: 0.86,
    c: Math.min(ok.c * 0.88, 0.072),
    h: wrapHue(ok.h - 20),
  });
}

/** Recolor the grow-step lights with the wash; positions stay put. */
export function lightsFromWash(ok: Oklch, base: EditableLight[]): EditableLight[] {
  const next = base
    .filter((l) => l.id !== "pt-rim")
    .map((l) => {
      if (l.kind === "directional") return { ...l, color: washLightHex(ok, "key") };
      if (l.kind === "point") return { ...l, color: washLightHex(ok, "fill") };
      return { ...l, color: washLightHex(ok, "rim") };
    });
  next.push({
    id: "pt-rim",
    kind: "point",
    position: [0.9, 1.15, -1.7],
    rotation: [0, 0, 0],
    scale: [5, 5, 5],
    color: washLightHex(ok, "rim"),
    intensity: 2.15,
  });
  return next.slice(0, 8);
}

export function ambientsFromWash(ok: Oklch): AmbientFill[] {
  return [
    {
      id: "amb-wash",
      color: oklchToHex({
        l: 0.93,
        c: Math.min(ok.c * 0.55, 0.048),
        h: ok.h,
      }),
      intensity: 0.44,
    },
  ];
}

/**
 * Water-page wash tinted by the pick. Chroma stays tiny so the shift
 * reads as weather, not a color change.
 */
export function ambientBackground(ok: Oklch): string {
  // 30% of the first wash — a hint of weather, not a room tint.
  const c = Math.min(ok.c * 0.42, 0.034) * 0.3;
  const h = ok.h;
  return [
    `radial-gradient(ellipse 78% 58% at 50% 40%, ${oklchCss({ l: 0.93, c: c * 1.15, h })} 0%, transparent 70%)`,
    `linear-gradient(180deg, ${oklchCss({ l: 0.952, c: c * 0.5, h })} 0%, ${oklchCss({ l: 0.86, c: c * 0.82, h })} 48%, ${oklchCss({ l: 0.78, c: c, h })} 100%)`,
  ].join(", ");
}

export function uvFromOklch(ok: Oklch): { u: number; v: number } {
  const span = FIELD.lTop - FIELD.lBottom;
  return {
    u: ((ok.h % 360) + 360) % 360 / 360,
    v: clamp01((FIELD.lTop - ok.l) / (span || 1)),
  };
}

function oklchToSrgb({ l, c, h }: Oklch): { r: number; g: number; b: number } {
  const hr = (h * Math.PI) / 180;
  return oklabToSrgb(l, c * Math.cos(hr), c * Math.sin(hr));
}

/** Björn Ottosson OKLab → sRGB. */
function oklabToSrgb(L: number, a: number, b: number): { r: number; g: number; b: number } {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return {
    r: linearToSrgb(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

function linearToSrgb(c: number): number {
  const x = clamp(c, 0, 1);
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) =>
    Math.round(clamp(v, 0, 1) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
