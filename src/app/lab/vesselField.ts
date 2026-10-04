import { carouselFrame } from "../lib/carouselLayout";
import type { SeatPlace } from "../lib/galleryOverride";

/*
 * The field: the gallery's memories hung in the air by distance rather than
 * along the years — some near and large, some far and small, the far ones
 * hazed — and the way a seat travels between its place on the curve and its
 * place in the field. Pure functions of a camera and a share; the preview
 * (VesselGalleryPreview) keeps the clock, the camera and each seat's share,
 * and hands the gallery the blended place through GalleryOverride.adjustSeat.
 */

export interface FieldPlace {
  /** Where the memory sits on the page at the eye's rest, as fractions of the view from its centre. */
  sx: number;
  sy: number;
  /** How deep; FIELD_FOCAL deep is the apex's own size. */
  z: number;
}

/**
 * Ten places. The near ones frame the view and the deep ones gather toward
 * the middle, as a field of stars does; the band where the caption falls
 * (below the centre) is left to small, far things. Memories take these in
 * `FIELD_ORDER`, so a place is a memory's own and does not change when
 * another is picked.
 */
export const FIELD_PLACES: FieldPlace[] = [
  { sx: -0.36, sy: -0.24, z: 1.00 },
  { sx: 0.33, sy: 0.13, z: 1.00 },
  { sx: -0.22, sy: 0.24, z: 1.35 },
  { sx: 0.08, sy: -0.26, z: 1.60 },
  { sx: 0.38, sy: -0.22, z: 1.80 },
  { sx: -0.05, sy: 0.05, z: 1.50 },
  { sx: -0.38, sy: 0.06, z: 2.40 },
  { sx: 0.20, sy: 0.00, z: 2.90 },
  { sx: 0.40, sy: 0.34, z: 2.60 },
  { sx: -0.12, sy: -0.38, z: 3.30 },
];
/** Which place the i-th seated memory takes (a fixed shuffle, so the near places are not all the oldest). */
export const FIELD_ORDER = [3, 0, 7, 1, 9, 5, 2, 8, 4, 6];

/** The apex's own distance: a seat this deep is the apex's size. */
export const FIELD_FOCAL = 1.15;

export interface FieldCamera {
  /** Across and up, in fractions of the view (the parallax). */
  x: number;
  y: number;
  /** Forward into the field (the dolly), 0 at rest. */
  z: number;
}

/** How far the eye may back out of or lean into the field: in to where the near ones have passed and the far ones are at hand. */
export const DOLLY_MIN = -0.5;
export const DOLLY_MAX = 1.0;
/** Where the eye stands as the field forms: a little back, coming forward into it. */
export const DOLLY_IN = -0.35;
/** How much deeper a memory that was not on the curve begins, surfacing into its place. */
export const SURFACE_FROM = 1.6;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export interface FieldSeat extends SeatPlace {
  /** The seat's distance from the eye. */
  depth: number;
  haze: number;
  order: number;
}

/**
 * A place in the field, seen from the camera: a pinhole projection for its
 * size and position; its distance sets the haze (the vessel's own, from the
 * lab's distance step), a little softness and a fading; what comes right up
 * to the eye softens and goes. `hover` 0…1 brings a memory a hair nearer
 * and clearer under the pointer.
 */
export function fieldSeat(place: FieldPlace, cam: FieldCamera, viewport: { w: number; h: number }, hover = 0): FieldSeat {
  const frame = carouselFrame(viewport.w, viewport.h);
  const depth = place.z - cam.z;
  // a seat that has passed the eye is gone (nearFade) — its size stops growing so the hidden canvas stays small
  const near = Math.max(depth, 0.3);
  const scale = (FIELD_FOCAL / near) * (1 + 0.05 * hover);
  const x = 0.5 + (place.sx * place.z - cam.x) / near;
  const y = frame.apexY / viewport.h + (place.sy * place.z - cam.y) / near;
  const haze = clamp01((depth - 1.4) / 1.9) * (1 - 0.4 * hover);
  const nearFade = smoothstep(0.2, 0.55, depth);
  const nearBlur = 3 * clamp01((0.8 - depth) / 0.45);
  return {
    x: x * viewport.w,
    y: y * viewport.h,
    size: frame.size * scale,
    scale,
    opacity: (1 - 0.3 * haze) * nearFade,
    blurPx: (1.4 * Math.pow(haze, 1.6) + nearBlur) / scale,
    haze,
    order: Math.round((6 - depth) * 100),
    depth,
  };
}

/** The same place, deeper and not yet seen — where a memory that had no seat on the curve surfaces from. */
export function surfacingSeat(place: FieldPlace, cam: FieldCamera, viewport: { w: number; h: number }): FieldSeat {
  const deep = fieldSeat(place, { ...cam, z: cam.z - SURFACE_FROM }, viewport);
  return { ...deep, opacity: 0, haze: 1 };
}

/**
 * The flight's easing: it lifts off at once and spends the second half
 * settling — a smoothstep eased out again, so nothing snaps at either end
 * and the way into place is long.
 */
export function easeFlight(t: number) {
  const u = clamp01(t);
  const s = u * u * (3 - 2 * u);
  return s * (2 - s);
}

/**
 * A seat between its two places, `share` 0 on the curve and 1 in the field.
 * The path is an arc, not the chord — bowed upward (toward the outside of the
 * view when the way is steep), by a fifth of the way plus a little, varied by
 * `variant` 0…1 so the seats do not move as one — along which the size
 * changes in log space and swells a hair at the middle, as a thing does that
 * comes a little nearer as it crosses. A small sway with the direction of
 * travel; the haze belongs to the field and comes late and leaves early.
 */
export function blendSeat(
  from: FieldSeat, to: FieldSeat, share: number, viewport: { w: number; h: number }, variant: number, direction: 1 | -1,
): FieldSeat {
  if (share <= 0) return from;
  if (share >= 1) return to;
  const e = share;
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  let nx = 0, ny = 0;
  if (len > 1e-3) {
    nx = -dy / len; ny = dx / len;
    if (Math.abs(dy) > Math.abs(dx)) {
      const away = Math.sign((from.x + to.x) * 0.5 - viewport.w * 0.5) || 1;
      if (Math.sign(nx) !== away) { nx = -nx; ny = -ny; }
    } else if (ny > 0) { nx = -nx; ny = -ny; }
  }
  const bow = (0.2 * len + 0.04 * viewport.h) * (0.8 + 0.4 * variant);
  const cx = (from.x + to.x) * 0.5 + nx * bow;
  const cy = (from.y + to.y) * 0.5 + ny * bow;
  const a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, c = e * e;
  const swell = 1 + 0.07 * Math.sin(Math.PI * e);
  const scale = Math.exp(lerp(Math.log(Math.max(from.scale, 1e-3)), Math.log(Math.max(to.scale, 1e-3)), e)) * swell;
  const hazeShare = Math.pow(e, 1.4);
  return {
    x: a * from.x + b * cx + c * to.x,
    y: a * from.y + b * cy + c * to.y,
    scale,
    size: lerp(from.size, to.size, e) * swell,
    opacity: lerp(from.opacity, to.opacity, e),
    blurPx: lerp(from.blurPx, to.blurPx, e),
    haze: lerp(from.haze, to.haze, hazeShare),
    rotate: direction * (Math.sign(dx) || 1) * 4 * Math.sin(Math.PI * e) * (0.7 + 0.6 * variant),
    order: Math.round(lerp(from.order, to.order, e)),
    depth: lerp(from.depth, to.depth, e),
  };
}
