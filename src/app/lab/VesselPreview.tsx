import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CHROME_GRAY } from "../lib/colors";
import { META, NOTE_SIZE, SANS, SERIF, TITLE } from "../lib/theme";
import { TextButton } from "../components/TextButton";
import { FILM_LOOK_DEFAULT, FILM_LOOK_GLSL, filmLookUniforms, prepareFilmPhoto, setFilmLook, type FilmLook } from "../lib/filmLook";
import { SHEET_GLSL, STOCKS, STRIP_FACE_GLSL, STRIP_GLSL, STRIP_MM, createEdgePrint, setStock, sheetUniforms, stockHex } from "./filmStrip";
import { createArtifactGeometry } from "../hooks/useArtifactGeometry";
import {
  ARTIFACT_CATEGORIES, CATEGORY_LABELS, computeMeshNormals, createArtifactForm, describeForm, type ArtifactCategory, type ArtifactForm,
} from "../lib/superformula";
import photoA from "../../assets/memory-photo.jpg";
import photoB from "../../assets/memory-photo-02.png";

/*
 * Lab: the memory as a glass vessel, with the film tucked inside. A still
 * life of the end state under a new idea — one form of thin, almost clear
 * glass, and pressed loosely along its inner wall the 35mm strip from the
 * film lab, carrying the photo. Nothing moves but a slow turn — the eye's,
 * walking round the still life while the form, the key and the room stay put,
 * so the light on it changes as it would; hold to stop it, drag across to
 * turn it yourself, up and down to look down on the form or up at it from
 * under the table (the "camera" group: pitch, distance, turn; ?pitch= to
 * open there). The photo is a thing inside the glass, not a map on its
 * surface. Sliders down the right; "copy values" puts them on the clipboard
 * as VESSEL_TUNE_DEFAULT would be written; "make this the default" keeps them
 * on this machine (localStorage) so the lab opens with them from then on
 * (`vesselDefaults`), "back to the built-in default" forgets them.
 *
 * Five layers, outside to inside, each doing one thing: the glass shell
 * (Fresnel rim, uneven thickness, frost in two or three patches); the gap
 * (air pockets where the sheet touches the wall); the
 * sheet (the film lab's strip on the curved wall, a fold or two, one end
 * lifting); the image (the photo as dye through filmLook, deeper than the
 * film lab has it, bled at one corner; mirrored and dimmer from behind); and
 * one key light behind-above, shared by glass and sheet. One diffuser per
 * stack: the glass softens, so the sheet is clearer and harder-edged here.
 *
 * The sheet has two builds, switched in the panel (?sheet=pressed|draped):
 * pressed is the glass's own wall as a decal (arc, band, lift, fold scale);
 * draped is its own cloth — a strip of true mm hung from one place on the
 * wall, pressed for `contact` mm, then peeling toward the inside over `sag`
 * by `peel` degrees, curling across and twisting, settled as soft cloth
 * against the wall with `gap` of air (buildDrapedSheet, the "drape" knob
 * group; `soft` is its bending stiffness, 0 crisp), and drawn as gauze or
 * soaked paper rather than film (the "feel" group: sheer, furred edge,
 * sheen, gloss, grain — neutral when pressed).
 *
 * ?morph= (0–1) sets how far the form has grown from its sphere (the "form"
 * group's knob; its categories redraw the form as the shape step's picker
 * does), ?frost= the strength the frost knob opens at, ?form= the seed the
 * form is drawn from, ?category= its category, ?yaw= the turn it opens at in degrees (180 is
 * the far face), ?turn= the turn speed (0 holds it still), ?photo=0|1 the
 * bundled still, or an image URL, ?glass=frost the first glass look (the
 * refracting one is the default), ?show=glass|sheet one layer alone,
 * ?sheet=pressed the wall-relief sheet (draped is the default), ?face=glass the
 * strip turned over so its picture side faces the wall (inside is the default),
 * ?haze= (0–1) how far the memory has receded — the "distance" knob group: the
 * photo blurs (mip bias), the frame softens (a post blur), the cut and the rim
 * lines let go, the whole fades toward the air, a mist of six shells stands
 * off the glass so the outline is a gradient rather than a line, and the edge
 * is luminous — the "glow" group: a pale band inside the silhouette of the
 * glass and of every shell (one halo, breathing and flickering by
 * `hazeMove`), streaks of light that run along one edge at a time and fade
 * behind themselves (`streakN` and the rest), and a bloom in the post pass
 * that lets the lights spill past the edge (`hazeBloom`).
 */

const PHOTOS = [photoA, photoB];

const PARAMS = new URLSearchParams(window.location.search);
const unitParam = (key: string, fallback: number) => {
  const v = Number(PARAMS.get(key));
  return PARAMS.has(key) && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
};
const MORPH = unitParam("morph", 0.6);
const FORM_SEED = PARAMS.get("form") ?? "vessel";
const CATEGORY = (ARTIFACT_CATEGORIES as readonly string[]).includes(PARAMS.get("category") ?? "")
  ? (PARAMS.get("category") as ArtifactCategory) : undefined;
/** The turn the form opens at, degrees; 0 faces the strip, 180 shows its far face. */
const YAW = ((Number(PARAMS.get("yaw")) || 0) * Math.PI) / 180;
/** The turn speed the lab opens at, rad/s; ?turn=0 holds it still for a comparison. */
const TURN = PARAMS.has("turn") && Number.isFinite(Number(PARAMS.get("turn"))) ? Math.max(0, Number(PARAMS.get("turn"))) : 0.06;
/** The view's elevation, degrees: 0 is level with the form, positive looks down on
    it, negative up at it from under the table (the table and its reflection fade
    as the eye goes under). The opening one is ?pitch=, else the still life's 4°. */
export const PITCH_MIN = -35, PITCH_MAX = 85;
const PITCH = PARAMS.has("pitch") && Number.isFinite(Number(PARAMS.get("pitch")))
  ? Math.min(PITCH_MAX, Math.max(PITCH_MIN, Number(PARAMS.get("pitch")))) : 4;

export interface VesselTune {
  // glass
  // form
  morph: number;
  // glass
  frostPatches: number; frostSize: number; frostStrength: number; rim: number; thickness: number;
  // sheet
  inset: number; arc: number; band: number; lift: number; foldScale: number; stock: number;
  stockThick: number; stockThin: number; wear: number; backFace: number; holeRim: number;
  holeSize: number; holeWidth: number; holeFade: number;
  // drape (the second sheet: its own cloth, hung from the wall)
  sheetSize: number; anchorAngle: number; anchorHeight: number; tilt: number; contact: number;
  sag: number; peel: number; curl: number; twist: number; gap: number; soft: number;
  // feel (the draped sheet's material: gauze or soaked paper rather than film)
  sheer: number; softRim: number; sheen: number; gloss: number; grain: number;
  // dye
  dyeLift: number; dyeContrast: number; dyeShoulder: number; dyeSaturation: number; dyeGrain: number;
  dyeSoft: number; dyeExposure: number; dyeLeak: number; photoOpacity: number; bleed: number;
  mono: number; negative: number;
  // refraction (the second glass look)
  envAbove: number; envBelow: number; horizon: number; horizonSoft: number;
  bend: number; glassSoft: number; bodyAlpha: number; thickDark: number; highlight: number;
  // light
  keyAzimuth: number; keyElevation: number; keyIntensity: number;
  // camera (the eye orbits the form; the light stays in the room)
  pitch: number; distance: number; turn: number;
  // scene
  ground: number; warmth: number;
  // distance (the distance step: time blurs the edges — the whole thing recedes into the air)
  haze: number; hazeBlur: number; hazePhoto: number; hazeMist: number; hazeSpread: number; hazeWash: number; hazeEdge: number;
  hazeGlow: number; hazeBloom: number; hazeMove: number;
  // the glow's light: the halo under the streaks, and the streaks that run along the edges
  glowBase: number;
  streakN: number; streakGain: number; streakSpeed: number; streakTail: number; streakHead: number;
  streakLife: number; streakDuty: number; streakRound: number; streakUp: number; streakFlicker: number;
}

/** The two glass looks: frost patches on a toned shell, or the frame behind refracted. */
export type GlassMode = "frost" | "refract";
const GLASS_MODE: GlassMode = PARAMS.get("glass") === "frost" ? "frost" : "refract";
/** Which layers are drawn, to judge the vessel and the sheet apart before together. */
export type Show = "both" | "glass" | "sheet";
const SHOW: Show = PARAMS.get("show") === "glass" || PARAMS.get("show") === "sheet" ? (PARAMS.get("show") as Show) : "both";
/** The two sheets: pressed along the wall (the glass inset, a relief of folds), or
    draped — its own cloth, hung from a line of contact, curling away from the wall. */
export type SheetMode = "pressed" | "draped";
const SHEET_MODE: SheetMode = PARAMS.get("sheet") === "pressed" ? "pressed" : "draped";
/** Which side of the sheet carries the emulsion — the near face (sharp, lit, the
    picture the right way round): facing the inside of the vessel, or turned
    over to face the glass wall. */
export type SheetFace = "inside" | "glass";
const SHEET_FACE: SheetFace = PARAMS.get("face") === "glass" ? "glass" : "inside";

/** What the lab opens with. */
export const VESSEL_TUNE_DEFAULT: VesselTune = {
  morph: MORPH,
  frostPatches: 2, frostSize: 1.25, frostStrength: unitParam("frost", GLASS_MODE === "refract" ? 0.15 : 0.4), rim: 0.38, thickness: 0.3,
  inset: 0.92, arc: 211, band: 1.2, lift: 0.048, foldScale: 1.7, stock: 0,
  stockThick: 0.6, stockThin: 0.4, wear: 1.16, backFace: 0.44, holeRim: 0.55,
  holeSize: 1, holeWidth: 1, holeFade: 0,
  sheetSize: 2.26, anchorAngle: 180, anchorHeight: 1.0, tilt: 2, contact: 30.5,
  sag: 21, peel: 69, curl: 0.35, twist: 15, gap: 0.03, soft: 0.7,
  sheer: 0.92, softRim: 0.2, sheen: 0.31, gloss: 0.43, grain: 0.04,
  dyeLift: 0.06, dyeContrast: 0.96, dyeShoulder: 0.5, dyeSaturation: 0.9, dyeGrain: 0.03,
  dyeSoft: 0.45, dyeExposure: 0.01, dyeLeak: 0.72, photoOpacity: 0.83, bleed: 0.53,
  mono: 0, negative: 0,
  envAbove: 1, envBelow: 0.84, horizon: 0.06, horizonSoft: 0.35,
  bend: 0.75, glassSoft: 0.64, bodyAlpha: 0.85, thickDark: 0.21, highlight: 0.34,
  keyAzimuth: -32, keyElevation: 64, keyIntensity: 1.08,
  pitch: PITCH, distance: 9, turn: TURN,
  ground: 0.5, warmth: 0.4,
  haze: unitParam("haze", 0), hazeBlur: 7, hazePhoto: 2.6, hazeMist: 0.5, hazeSpread: 0.16, hazeWash: 0.5, hazeEdge: 0.85,
  hazeGlow: 0.5, hazeBloom: 0.6, hazeMove: 0.6,
  glowBase: 0.5,
  streakN: 3, streakGain: 1.6, streakSpeed: 0.35, streakTail: 1.4, streakHead: 0.18,
  streakLife: 9, streakDuty: 0.6, streakRound: 0.3, streakUp: 0.4, streakFlicker: 0.35,
};

/* ───────── the backdrop, as the page and the canvas both draw it ───────── */

const mixHex = (a: string, b: string, t: number) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return [ch(16), ch(8), ch(0)] as const;
};
const rgb = (c: readonly [number, number, number]) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
const hexRgb = (hex: string): readonly [number, number, number] => {
  const p = parseInt(hex.slice(1), 16);
  return [((p >> 16) & 255) / 255, ((p >> 8) & 255) / 255, (p & 255) / 255];
};
/** The refraction look's room: the colour above the horizon and the colour
    below it, each at its lightness knob, leaning warmer with `warmth`. White
    at a lightness is the grey the room began as. */
export interface Room { above: string; below: string }
export const ROOM_DEFAULT: Room = { above: "#b3b3b3", below: "#ffffff" };

/* ───────── the user's own default ───────── */

/** What the panel can set and keep as its own default: the knobs and the look's modes. */
export interface VesselDefaults {
  tune: VesselTune;
  mode: GlassMode;
  sheetMode: SheetMode;
  face: SheetFace;
  room: Room;
}
const DEFAULTS_KEY = "nijimu.vessel.defaults";
/* "make this the default" keeps the panel's settling on this machine
   (localStorage), and the lab opens with it from then on in place of
   VESSEL_TUNE_DEFAULT and the mode constants — "copy values" is still how a
   settling goes into the source for everyone. A ?param named on the URL wins
   over the kept value, as it does over the code's. */
const PARAM_KEYS: [keyof VesselTune, string][] = [
  ["morph", "morph"], ["frostStrength", "frost"], ["pitch", "pitch"], ["turn", "turn"], ["haze", "haze"],
];
function readKept(): Partial<VesselDefaults> | null {
  try {
    const raw = window.localStorage.getItem(DEFAULTS_KEY);
    return raw ? (JSON.parse(raw) as Partial<VesselDefaults>) : null;
  } catch { return null; }
}
let kept: Partial<VesselDefaults> | null = typeof window === "undefined" ? null : readKept();
/** The defaults the lab opens with: the kept ones where they exist, the code's otherwise. */
export function vesselDefaults(): VesselDefaults {
  const tune = { ...VESSEL_TUNE_DEFAULT };
  if (kept?.tune) {
    for (const k of Object.keys(VESSEL_TUNE_DEFAULT) as (keyof VesselTune)[]) {
      const v = (kept.tune as Partial<VesselTune>)[k];
      if (typeof v === "number" && Number.isFinite(v)) tune[k] = v;
    }
    for (const [k, p] of PARAM_KEYS) if (PARAMS.has(p)) tune[k] = VESSEL_TUNE_DEFAULT[k];
  }
  return {
    tune,
    mode: PARAMS.has("glass") ? GLASS_MODE : kept?.mode ?? GLASS_MODE,
    sheetMode: PARAMS.has("sheet") ? SHEET_MODE : kept?.sheetMode ?? SHEET_MODE,
    face: PARAMS.has("face") ? SHEET_FACE : kept?.face ?? SHEET_FACE,
    room: kept?.room ?? ROOM_DEFAULT,
  };
}
export function keepVesselDefaults(d: VesselDefaults) {
  kept = d;
  try { window.localStorage.setItem(DEFAULTS_KEY, JSON.stringify(d)); } catch { /* storage refused — kept for this visit only */ }
}
export function forgetVesselDefaults() {
  kept = null;
  try { window.localStorage.removeItem(DEFAULTS_KEY); } catch { /* nothing to remove */ }
}
export const hasKeptDefaults = () => kept !== null;
const envColor = (hex: string, l: number, warmth: number): readonly [number, number, number] => {
  const tint = [0.975 + 0.045 * warmth, 1, 1.02 - 0.045 * warmth];
  const c = hexRgb(hex);
  return [0, 1, 2].map((i) => Math.round(Math.min(1, c[i] * l * tint[i]) * 255)) as unknown as readonly [number, number, number];
};
/* Where a ray at the horizon's slope lands on screen follows from the camera
   (looking at the form's middle from `distance` away at `pitch`, fov 18). */
export const LOOK_Y = -0.05;
export const FOV = 18;
const HALF_TAN = Math.tan((FOV / 2) * (Math.PI / 180));

export interface Backdrop { stops: [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]]; at: [number, number] }
/** The film lab's paper, leaning warmer with the knob; or the refraction look's room. */
export function backdropFor(t: VesselTune, mode: GlassMode, room: Room): Backdrop {
  if (mode === "refract") {
    const above = envColor(room.above, t.envAbove, t.warmth), below = envColor(room.below, t.envBelow, t.warmth);
    // the eye pitched down by p sees a level ray p above the screen's centre
    const centre = 0.5 - (Math.asin(Math.max(-1, Math.min(1, t.horizon))) + (t.pitch * Math.PI) / 180) / (2 * HALF_TAN);
    const soft = t.horizonSoft / (2 * HALF_TAN);
    return { stops: [above, above, below], at: [Math.max(0, centre - soft), Math.min(1, centre + soft)] };
  }
  const w = t.warmth;
  return { stops: [mixHex("#ededE8", "#efebe6", w), mixHex("#e4e6e3", "#e8e4df", w), mixHex("#d6dcd9", "#ddd8d2", w)], at: [0.5, 1] };
}
const backdropCss = ({ stops, at }: Backdrop) =>
  `linear-gradient(${rgb(stops[0])}, ${rgb(stops[1])} ${(at[0] * 100).toFixed(1)}%, ${rgb(stops[2])} ${(at[1] * 100).toFixed(1)}%)`;

/** The air: the colour a thing at a distance fades toward — the frame behind the
    form's upper half, 0–1. */
export function airOf({ stops }: Backdrop): readonly [number, number, number] {
  return [0, 1, 2].map((i) => (stops[0][i] + stops[1][i]) / 510) as unknown as readonly [number, number, number];
}
export const airFor = (t: VesselTune, mode: GlassMode, room: Room) => airOf(backdropFor(t, mode, room));

/** The film lab's look with the vessel's dye knobs written over it. At a distance
    the picture is softer, flatter and paler — the diffusion goes toward 1 with the
    photo blur, the tone fades with the wash. */
export function lookFor(t: VesselTune): FilmLook {
  const blur = Math.min(1, (t.haze * t.hazePhoto) / 2), fade = t.haze * t.hazeWash;
  return {
    ...FILM_LOOK_DEFAULT,
    bloom: 0.3 + t.haze * 0.3, halation: 0.1, mottle: 0.25, vignette: 0.1,
    lift: t.dyeLift + fade * 0.1, contrast: t.dyeContrast * (1 - fade * 0.35), shoulder: t.dyeShoulder,
    saturation: t.dyeSaturation * (1 - fade * 0.4),
    grain: t.dyeGrain, soft: t.dyeSoft + (1 - t.dyeSoft) * blur, exposure: t.dyeExposure, leak: t.dyeLeak,
  };
}

/* ───────── geometry ───────── */

const easeMorph = (m: number) => m * m * (3 - 2 * m);
export const smooth01 = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };
export const hash2 = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

export interface Glass {
  geometry: THREE.BufferGeometry;
  positions: Float32Array;
  normals: Float32Array;
  index: ArrayLike<number>;
  lo: number;
  hi: number;
}

/** The form grown to `morph` from its sphere, as the descent writes it. */
export function buildGlass(form: ArtifactForm, morph: number): Glass {
  const { geometry, rest } = createArtifactGeometry(form);
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
  const positions = pos.array as Float32Array;
  const e = easeMorph(morph);
  for (let i = 0; i < positions.length; i++) positions[i] = rest.sphere[i] + (rest.positions[i] - rest.sphere[i]) * e;
  pos.needsUpdate = true;
  const nrm = geometry.getAttribute("normal") as THREE.BufferAttribute;
  const normals = nrm.array as Float32Array;
  computeMeshNormals(positions, rest.index, normals);
  nrm.needsUpdate = true;
  let lo = Infinity, hi = -Infinity;
  for (let k = 1; k < positions.length; k += 3) { lo = Math.min(lo, positions[k]); hi = Math.max(hi, positions[k]); }
  return { geometry, positions, normals, index: rest.index, lo, hi };
}

/* How far the sheet stands off the wall at a point of the strip, 0–1, in mm
   space: a fold or two where a slow noise rises past a threshold, and one
   short end lifting away, most at one corner. The seed picks the end. */
function liftAt(mx: number, my: number, foldScale: number, seed: number): number {
  const fold = vnoise(mx * 0.055 * foldScale + seed * 1.7, my * 0.08 * foldScale - seed);
  const f = smooth01((fold - 0.58) / 0.42);
  const sx = mx * (hash2(seed, 2.3) < 0.5 ? 1 : -1);
  const end = smooth01((sx - 9) / 14);
  const corner = 0.45 + 0.55 * smooth01((my + 6) / 23.5);
  return Math.min(1, f * 0.55 + end * end * corner);
}

export interface Sheet { geometry: THREE.BufferGeometry; arc: number; yScale: number; mmAttr: boolean }

/** The inner shell: the glass inset, mapped cylindrically to the strip's mm,
    displaced inward where the sheet lifts, with the rest position, the lift
    and the crease (how steep the lift is) carried as attributes. */
export function buildSheet(glass: Glass, inset: number, arcDeg: number, band: number, lift: number, foldScale: number, seed: number): Sheet {
  const { positions, normals, index } = glass;
  const n = positions.length;
  const out = new Float32Array(n);
  const rest = new Float32Array(n);
  const liftA = new Float32Array(n / 3);
  const crease = new Float32Array(n / 3);
  const arc = (arcDeg * Math.PI) / 180;
  // mm per unit along the arc, from the shell's mean radius through its middle band
  const mid = (glass.lo + glass.hi) * 0.5, span = (glass.hi - glass.lo) * inset;
  let rSum = 0, rCount = 0;
  for (let k = 0; k < n; k += 3) {
    if (Math.abs(positions[k + 1] * inset - mid) < span * 0.2) { rSum += Math.hypot(positions[k], positions[k + 2]) * inset; rCount++; }
  }
  const rMean = rCount ? rSum / rCount : 1;
  const xScale = STRIP_MM.length / arc;
  const yScale = xScale / rMean / band;
  const e = 0.6;
  for (let v = 0, k = 0; k < n; v++, k += 3) {
    const x = positions[k] * inset, y = positions[k + 1] * inset, z = positions[k + 2] * inset;
    rest[k] = x; rest[k + 1] = y; rest[k + 2] = z;
    const mx = Math.atan2(x, z) * xScale, my = y * yScale;
    const l = liftAt(mx, my, foldScale, seed);
    const gx = (liftAt(mx + e, my, foldScale, seed) - liftAt(mx - e, my, foldScale, seed)) / (2 * e);
    const gy = (liftAt(mx, my + e, foldScale, seed) - liftAt(mx, my - e, foldScale, seed)) / (2 * e);
    liftA[v] = l;
    crease[v] = Math.min(1, Math.max(0, (Math.hypot(gx, gy) - 0.12) * 5));
    const d = lift * l;
    out[k] = x - normals[k] * d;
    out[k + 1] = y - normals[k + 1] * d;
    out[k + 2] = z - normals[k + 2] * d;
  }
  const nrm = new Float32Array(n);
  computeMeshNormals(out, index, nrm);
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(new THREE.BufferAttribute(index as Uint16Array | Uint32Array, 1));
  geometry.setAttribute("position", new THREE.BufferAttribute(out, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  geometry.setAttribute("aRest", new THREE.BufferAttribute(rest, 3));
  geometry.setAttribute("aLift", new THREE.BufferAttribute(liftA, 1));
  geometry.setAttribute("aCrease", new THREE.BufferAttribute(crease, 1));
  geometry.setAttribute("aMm", new THREE.BufferAttribute(new Float32Array((n / 3) * 2), 2));
  geometry.boundingSphere = glass.geometry.boundingSphere;
  return { geometry, arc, yScale, mmAttr: false };
}

/* ───────── the draped sheet ───────── */

/** The wall as a radius per direction, binned from the glass's own vertices, so a
    point can be asked how far out it may go: the form is star-shaped about its
    centre (the superformula is radial), so inside is |p| < wallR(dir). */
function buildWallMap(glass: Glass): (x: number, y: number, z: number) => number {
  const LON = 96, LAT = 48;
  const sum = new Float64Array(LON * LAT), count = new Float64Array(LON * LAT);
  const p = glass.positions;
  for (let k = 0; k < p.length; k += 3) {
    const x = p[k], y = p[k + 1], z = p[k + 2];
    const r = Math.hypot(x, y, z);
    if (r < 1e-6) continue;
    const i = Math.min(LON - 1, Math.floor(((Math.atan2(x, z) + Math.PI) / (2 * Math.PI)) * LON));
    const j = Math.min(LAT - 1, Math.floor(((Math.asin(Math.max(-1, Math.min(1, y / r))) + Math.PI / 2) / Math.PI) * LAT));
    sum[i + j * LON] += r;
    count[i + j * LON]++;
  }
  const map = new Float64Array(LON * LAT);
  for (let c = 0; c < map.length; c++) map[c] = count[c] ? sum[c] / count[c] : NaN;
  // bins no vertex fell in (the poles, the coarse forms) take the mean of their filled neighbours
  for (let pass = 0; pass < LON; pass++) {
    let holes = 0;
    for (let j = 0; j < LAT; j++) for (let i = 0; i < LON; i++) {
      const c = i + j * LON;
      if (!Number.isNaN(map[c])) continue;
      holes++;
      let s = 0, n = 0;
      for (const nb of [((i + 1) % LON) + j * LON, ((i - 1 + LON) % LON) + j * LON, j > 0 ? i + (j - 1) * LON : -1, j < LAT - 1 ? i + (j + 1) * LON : -1]) {
        if (nb >= 0 && !Number.isNaN(map[nb])) { s += map[nb]; n++; }
      }
      if (n) map[c] = s / n;
    }
    if (!holes) break;
  }
  // soften the map a little: the cloth is soft, so it need not know every facet of the wall
  const tmp = new Float64Array(map.length);
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < LAT; j++) for (let i = 0; i < LON; i++) {
      let s = 0, n = 0;
      for (let dj = -1; dj <= 1; dj++) {
        const jj = j + dj;
        if (jj < 0 || jj >= LAT) continue;
        for (let di = -1; di <= 1; di++) { s += map[((i + di + LON) % LON) + jj * LON]; n++; }
      }
      tmp[i + j * LON] = s / n;
    }
    map.set(tmp);
  }
  return (x, y, z) => {
    const r = Math.hypot(x, y, z) || 1;
    const fi = ((Math.atan2(x, z) + Math.PI) / (2 * Math.PI)) * LON - 0.5;
    const fj = Math.min(LAT - 1, Math.max(0, ((Math.asin(Math.max(-1, Math.min(1, y / r))) + Math.PI / 2) / Math.PI) * LAT - 0.5));
    const i0 = Math.floor(fi), j0 = Math.floor(fj);
    const tx = fi - i0, ty = fj - j0;
    const ia = ((i0 % LON) + LON) % LON, ib = (ia + 1) % LON;
    const ja = j0, jb = Math.min(LAT - 1, j0 + 1);
    const a = map[ia + ja * LON] * (1 - tx) + map[ib + ja * LON] * tx;
    const b = map[ia + jb * LON] * (1 - tx) + map[ib + jb * LON] * tx;
    return a * (1 - ty) + b * ty;
  };
}

type V3 = [number, number, number];
const v3norm = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const v3cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const v3dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** Rotate v (perpendicular to the unit axis) about the axis by angle. */
const v3turn = (v: V3, axis: V3, angle: number): V3 => {
  const c = Math.cos(angle), s = Math.sin(angle), x = v3cross(axis, v);
  return [v[0] * c + x[0] * s, v[1] * c + x[1] * s, v[2] * c + x[2] * s];
};

export interface Drape {
  sheetSize: number; anchorAngle: number; anchorHeight: number; tilt: number; contact: number;
  sag: number; peel: number; curl: number; twist: number; gap: number; soft: number;
}

/**
 * The other sheet: a cloth of its own, not the wall's relief. A grid in the
 * strip's mm is hung from a point on the inner wall (anchorAngle around the
 * axis, anchorHeight up it); turned by tilt (0 hangs the picture upright from
 * its long edge, 90 hangs the strip from one end as film dries). Its spine
 * runs down the wall, pressed, for `contact` mm, then peels: the direction
 * turns from the wall's tangent toward the inside by `peel` degrees over
 * `sag` mm, and the frame twists about the spine. Across the spine the sheet
 * curls (`curl`, signed, toward or away from the wall), flat where pressed.
 * Then it is settled as soft cloth (see the settle below): the grid keeps
 * its mm spacing loosely, the wall is met with a blurred correction, the
 * sheet is smoothed each pass by `soft`, and nothing ends up through the
 * glass. Where it curves differently from the wall it only touches along a
 * line, and the air between is the point. aLift carries that air; aMm the
 * place on the strip, so the face is drawn as in the film lab.
 */
export function buildDrapedSheet(glass: Glass, inset: number, d: Drape): Sheet {
  const wallR = buildWallMap(glass);
  const rIn = (x: number, y: number, z: number) => wallR(x, y, z) * inset;
  const k = d.sheetSize / STRIP_MM.length;
  const t = (d.tilt * Math.PI) / 180, ct = Math.cos(t), st = Math.sin(t);
  const hu = STRIP_MM.length / 2, hw = STRIP_MM.width / 2;
  const halfA = hw * Math.abs(ct) + hu * Math.abs(st);
  const halfB = hu * Math.abs(ct) + hw * Math.abs(st);
  const A = 2 * halfA;
  const th = (d.anchorAngle * Math.PI) / 180;
  const hx = Math.sin(th), hz = Math.cos(th);
  const h: V3 = [hx, 0, hz];
  const yLo = glass.lo * inset, yHi = glass.hi * inset;
  const y0 = yLo + d.anchorHeight * (yHi - yLo);
  // the point of the inner wall at height y, out along h
  const wallAt = (y: number): V3 => {
    const yy = Math.min(yHi - 1e-3, Math.max(yLo + 1e-3, y));
    let a = 0, b = 4;
    for (let i = 0; i < 30; i++) {
      const m = (a + b) / 2;
      if (Math.hypot(m, yy) < rIn(m * hx, yy, m * hz)) a = m; else b = m;
    }
    return [a * hx, yy, a * hz];
  };

  // the spine, tabulated every half millimetre down the sheet
  const STEP = 0.5;
  const N = Math.ceil(A / STEP) + 2;
  const contact = Math.min(d.contact, A);
  const S: V3[] = [], T: V3[] = [], Nn: V3[] = [], B: V3[] = [];
  let nc = 0;
  for (; nc < N && nc * STEP <= contact; nc++) S.push(wallAt(y0 - nc * STEP * k));
  for (let i = 0; i < nc; i++) {
    const p0 = S[Math.max(0, i - 1)], p1 = S[Math.min(nc - 1, i + 1)];
    let tg: V3 = nc > 1 ? v3norm([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]) : [0, -1, 0];
    if (nc === 1) { const q = wallAt(y0 - k); tg = v3norm([q[0] - S[0][0], q[1] - S[0][1], q[2] - S[0][2]]); }
    const away: V3 = [-hx, 0, -hz];
    const dt = v3dot(away, tg);
    const nn = v3norm([away[0] - tg[0] * dt, away[1] - tg[1] * dt, away[2] - tg[2] * dt]);
    T.push(tg); Nn.push(nn); B.push(v3cross(nn, tg));
  }
  const Tc = T[nc - 1], Nc = Nn[nc - 1];
  const peel = (d.peel * Math.PI) / 180, twist = (d.twist * Math.PI) / 180;
  const free = Math.max(1e-3, A - contact);
  for (let i = nc; i < N; i++) {
    const s = i * STEP - contact;
    const beta = peel * smooth01(s / Math.max(1e-3, d.sag));
    const cb = Math.cos(beta), sb = Math.sin(beta);
    const dir: V3 = [Tc[0] * cb + Nc[0] * sb, Tc[1] * cb + Nc[1] * sb, Tc[2] * cb + Nc[2] * sb];
    let nn: V3 = [-Tc[0] * sb + Nc[0] * cb, -Tc[1] * sb + Nc[1] * cb, -Tc[2] * sb + Nc[2] * cb];
    const prev = S[i - 1];
    S.push([prev[0] + dir[0] * STEP * k, prev[1] + dir[1] * STEP * k, prev[2] + dir[2] * STEP * k]);
    const tau = twist * smooth01(s / free);
    nn = v3turn(nn, dir, tau);
    T.push(dir); Nn.push(nn); B.push(v3cross(nn, dir));
  }

  // the grid: about a millimetre a cell, so the folds are curves and not polylines
  const NU = 96, NW = 48;
  const count = NU * NW;
  const pos = new Float32Array(count * 3);
  const mm = new Float32Array(count * 2);
  const along = new Float32Array(count);
  for (let iw = 0, v = 0; iw < NW; iw++) {
    const w = -hw + (iw / (NW - 1)) * STRIP_MM.width;
    for (let iu = 0; iu < NU; iu++, v++) {
      const u = -hu + (iu / (NU - 1)) * STRIP_MM.length;
      const a = -w * ct + u * st + halfA;
      const b = u * ct + w * st;
      mm[v * 2] = u; mm[v * 2 + 1] = w;
      along[v] = a;
      const fi = Math.min(N - 1.001, Math.max(0, a / STEP));
      const i0 = Math.floor(fi), f = fi - i0;
      const lerp3 = (arr: V3[]): V3 => [arr[i0][0] + (arr[i0 + 1][0] - arr[i0][0]) * f, arr[i0][1] + (arr[i0 + 1][1] - arr[i0][1]) * f, arr[i0][2] + (arr[i0 + 1][2] - arr[i0][2]) * f];
      const sp = lerp3(S), bb = v3norm(lerp3(B)), nn = v3norm(lerp3(Nn));
      const s = Math.max(0, a - contact);
      const curlOff = d.curl * (b / halfB) * (b / halfB) * halfB * k * smooth01(s / Math.max(1e-3, d.sag));
      pos[v * 3] = sp[0] + bb[0] * b * k + nn[0] * curlOff;
      pos[v * 3 + 1] = sp[1] + bb[1] * b * k + nn[1] * curlOff;
      pos[v * 3 + 2] = sp[2] + bb[2] * b * k + nn[2] * curlOff;
    }
  }

  // settle, as soft cloth: the grid keeps its spacing loosely; the wall is met
  // with a correction that is blurred across the sheet before it is applied,
  // so a lobe of the glass bows the cloth over a width instead of printing a
  // kink; and each pass a Taubin smooth (a Laplacian step and a slightly
  // larger step back, so the sheet does not shrink) stands in for the bending
  // stiffness that keeps gauze or soaked paper in rounded folds. `soft` is how
  // much of that smoothing; 0 is the crisp version.
  const du = (STRIP_MM.length / (NU - 1)) * k, dw = (STRIP_MM.width / (NW - 1)) * k, dd = Math.hypot(du, dw);
  const edges: [number, number, number][] = [];
  for (let iw = 0; iw < NW; iw++) for (let iu = 0; iu < NU; iu++) {
    const v = iu + iw * NU;
    if (iu + 1 < NU) edges.push([v, v + 1, du]);
    if (iw + 1 < NW) edges.push([v, v + NU, dw]);
    if (iu + 1 < NU && iw + 1 < NW) { edges.push([v, v + NU + 1, dd]); edges.push([v + 1, v + NU, dd]); }
  }
  // how firmly a row is pressed: 1 along `contact`, easing off over a few millimetres after
  const press = new Float32Array(count);
  const pressFade = Math.max(3, d.sag * 0.5);
  for (let v = 0; v < count; v++) press[v] = 1 - smooth01((along[v] - contact) / pressFade);

  const air = new Float32Array(count);
  const radius = new Float32Array(count);
  const corr = new Float32Array(count), blurred = new Float32Array(count);
  const blur = (src: Float32Array, dst: Float32Array) => {
    for (let iw = 0; iw < NW; iw++) for (let iu = 0; iu < NU; iu++) {
      let s = 0, n = 0;
      for (let dj = -1; dj <= 1; dj++) {
        const jw = iw + dj;
        if (jw < 0 || jw >= NW) continue;
        for (let di = -1; di <= 1; di++) {
          const ju = iu + di;
          if (ju < 0 || ju >= NU) continue;
          s += src[ju + jw * NU]; n++;
        }
      }
      dst[iu + iw * NU] = s / n;
    }
  };
  const hold = (gain: number, spread: number) => {
    for (let v = 0; v < count; v++) {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      const r = Math.hypot(x, y, z) || 1e-6;
      const lim = rIn(x, y, z);
      const inside = Math.min(r, lim - d.gap);
      radius[v] = r;
      corr[v] = inside + (lim - inside) * press[v] - r;
    }
    for (let i = 0; i < spread; i++) { blur(corr, blurred); corr.set(blurred); }
    for (let v = 0; v < count; v++) {
      const f = (radius[v] + corr[v] * gain) / radius[v];
      pos[v * 3] *= f; pos[v * 3 + 1] *= f; pos[v * 3 + 2] *= f;
    }
  };
  const nb: Int32Array[] = [];
  for (let iw = 0; iw < NW; iw++) for (let iu = 0; iu < NU; iu++) {
    const list: number[] = [];
    if (iu > 0) list.push(iu - 1 + iw * NU);
    if (iu + 1 < NU) list.push(iu + 1 + iw * NU);
    if (iw > 0) list.push(iu + (iw - 1) * NU);
    if (iw + 1 < NW) list.push(iu + (iw + 1) * NU);
    nb.push(Int32Array.from(list));
  }
  const next = new Float32Array(count * 3);
  const laplace = (step: number) => {
    for (let v = 0; v < count; v++) {
      const list = nb[v];
      let ax = 0, ay = 0, az = 0;
      for (let i = 0; i < list.length; i++) { const q = list[i]; ax += pos[q * 3]; ay += pos[q * 3 + 1]; az += pos[q * 3 + 2]; }
      const inv = 1 / list.length;
      // the pressed rows belong to the wall, not to the cloth's own curve
      const s = step * (1 - press[v] * 0.85);
      next[v * 3] = pos[v * 3] + (ax * inv - pos[v * 3]) * s;
      next[v * 3 + 1] = pos[v * 3 + 1] + (ay * inv - pos[v * 3 + 1]) * s;
      next[v * 3 + 2] = pos[v * 3 + 2] + (az * inv - pos[v * 3 + 2]) * s;
    }
    pos.set(next);
  };
  const soft = Math.min(1, Math.max(0, d.soft));
  const lambda = 0.6 * soft, mu = -(lambda + 0.03 * soft);
  const spread = 1 + Math.round(soft * 3);
  hold(1, spread);
  for (let it = 0; it < 24; it++) {
    for (const [p, q, rest] of edges) {
      const dx = pos[q * 3] - pos[p * 3], dy = pos[q * 3 + 1] - pos[p * 3 + 1], dz = pos[q * 3 + 2] - pos[p * 3 + 2];
      const len = Math.hypot(dx, dy, dz) || 1e-6;
      const c = ((len - rest) / len) * 0.4 * 0.5;
      pos[p * 3] += dx * c; pos[p * 3 + 1] += dy * c; pos[p * 3 + 2] += dz * c;
      pos[q * 3] -= dx * c; pos[q * 3 + 1] -= dy * c; pos[q * 3 + 2] -= dz * c;
    }
    if (lambda > 0) { laplace(lambda); laplace(mu); }
    hold(0.7, spread);
  }
  // last: nothing through the glass, whatever the smoothing left
  for (let v = 0; v < count; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const r = Math.hypot(x, y, z) || 1e-6;
    const lim = rIn(x, y, z);
    const target = Math.min(r, lim - d.gap * (1 - press[v]) * 0.5);
    const f = target / r;
    pos[v * 3] = x * f; pos[v * 3 + 1] = y * f; pos[v * 3 + 2] = z * f;
    air[v] = Math.min(1, Math.max(0, (lim - target) / 0.08));
  }

  const index = new Uint16Array((NU - 1) * (NW - 1) * 6);
  for (let iw = 0, o = 0; iw < NW - 1; iw++) for (let iu = 0; iu < NU - 1; iu++) {
    const v = iu + iw * NU;
    index[o++] = v; index[o++] = v + 1; index[o++] = v + NU + 1;
    index[o++] = v; index[o++] = v + NU + 1; index[o++] = v + NU;
  }
  const nrm = new Float32Array(count * 3);
  computeMeshNormals(pos, index, nrm);
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  geometry.setAttribute("aRest", new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute("aLift", new THREE.BufferAttribute(air, 1));
  geometry.setAttribute("aCrease", new THREE.BufferAttribute(new Float32Array(count), 1));
  geometry.setAttribute("aMm", new THREE.BufferAttribute(mm, 2));
  geometry.boundingSphere = glass.geometry.boundingSphere;
  return { geometry, arc: 1, yScale: 1, mmAttr: true };
}

/* ───────── shaders ───────── */

/* Shared by glass and sheet: a mirrored copy under the ground fades with its
   depth below the table (uReflect is its strength, which may be 0 once the eye
   has gone under the table; the thing itself carries −1). */
const REFLECT_GLSL = /* glsl */ `
  uniform float uReflect;
  uniform float uGroundY;
  float reflectFade(vec3 world) {
    return uReflect >= 0.0 ? uReflect * (1.0 - smoothstep(0.0, 1.3, uGroundY - world.y)) : 1.0;
  }
`;

export const sheetVertex = /* glsl */ `
  attribute vec3 aRest;
  attribute float aLift;
  attribute float aCrease;
  attribute vec2 aMm;
  varying vec3 vRest;
  varying float vLift;
  varying float vCrease;
  varying vec2 vMm;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  void main() {
    vRest = aRest;
    vLift = aLift;
    vCrease = aCrease;
    vMm = aMm;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/* The strip on the inner wall. Its place on the strip comes from where the
   fragment sits around the form's axis and up its height; outside the torn
   outline it is discarded, as the descent's film is. Then the film lab's
   face, and what only the vessel adds: the dye bled past one corner, creases
   reading whiter, air pockets where the sheet touches the wall, one key
   light that the sheet is mostly lit through, and the far face. */
export const sheetFragment = /* glsl */ `
  ${STRIP_GLSL}
  ${FILM_LOOK_GLSL}
  ${SHEET_GLSL}
  ${STRIP_FACE_GLSL}
  ${REFLECT_GLSL}
  uniform sampler2D uPhoto;
  uniform sampler2D uEdgePrint;
  uniform float uImageAspect;
  uniform float uSeed;
  uniform float uArc;
  uniform float uYScale;
  uniform float uWear;
  uniform float uBackFace;
  uniform float uBleed;
  uniform float uMmAttr;
  uniform float uFlip;
  uniform float uSheer;
  uniform float uSoftRim;
  uniform float uSheen;
  uniform float uGloss;
  uniform float uGrain;
  uniform vec3 uKey;
  uniform float uKeyIntensity;
  /* distance (each already scaled by the haze): the photo seen through that many more
     mip levels, the edges letting go (the cut feathers out over millimetres), and
     the whole sheet fading toward the air's colour */
  uniform float uHazePhoto;
  uniform float uHazeEdge;
  uniform float uHazeWash;
  uniform vec3 uAir;
  varying vec3 vRest;
  varying float vLift;
  varying float vCrease;
  varying vec2 vMm;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  void main() {
    // pressed: the place on the strip from where the fragment sits around the axis;
    // draped: the cloth carries its own mm
    float theta = atan(vRest.x, vRest.z + 1e-6);
    vec2 mm = uMmAttr > .5 ? vMm : vec2(theta * STRIP.x / uArc, vRest.y * uYScale);
    // uFlip turns the strip over: the emulsion faces the other side, so that side
    // gets the near face (sharp, lit) and reads the picture the right way round
    bool facing = gl_FrontFacing != (uFlip > .5);
    if (uFlip > .5) mm.x = -mm.x;
    float d = stripTornOutline(mm, uSeed);
    float dh = stripHole(mm);
    float alpha = stripCoverage(mm, uSeed, d, dh, uWear * (1.0 + uHazeEdge * 4.0));
    if (alpha < .01) discard;

    // the window, and one corner where the dye has bled past it into the stock
    float inFrame = sheetWindow(mm, uSeed);
    vec2 corner = WINDOW * vec2(sign(fract(uSeed * .37) - .5), sign(fract(uSeed * .61) - .5));
    float toCorner = length(mm - corner) + (filmNoise(mm * .45 + uSeed * 8.0) - .5) * 7.0;
    inFrame = max(inFrame, (1.0 - smoothstep(2.0, 9.0, toCorner)) * uBleed);

    float bias = (facing ? 0.0 : 1.6) + uHazePhoto;
    vec3 color;
    float a;
    stripFace(mm, uSeed, d, dh, inFrame, uPhoto, uImageAspect, bias, uEdgePrint, 1.45, color, a);

    // creases read whiter; where the sheet lies on the wall, a trapped pocket of air is a shade lighter
    color += vCrease * .10;
    a += vCrease * .10;
    float pocket = smoothstep(.72, .92, filmNoise(mm * .3 + uSeed * 9.0)) * (1.0 - smoothstep(0.0, .25, vLift));
    color += pocket * .045;
    a -= pocket * .08;

    // one key, behind-above: the sheet is lit mostly through, so it is brightest where the light comes through it
    vec3 n = normalize(vNormalW);
    vec3 eye = normalize(cameraPosition - vWorld);
    if (dot(n, eye) < 0.0) n = -n;
    float through = max(0.0, dot(-n, uKey));
    float on = max(0.0, dot(n, uKey));
    color *= .9 + (.16 * through + .05 * on) * uKeyIntensity;
    // film has a hard little highlight; gauze has almost none (uGloss), and instead a
    // broad velvet light where the key grazes the weave (uSheen)
    color += pow(max(0.0, dot(reflect(-eye, n), uKey)), 24.0) * .07 * uGloss * uKeyIntensity;
    float graze = 1.0 - abs(dot(n, eye));
    color += uSheen * graze * graze * (.5 + .5 * dot(n, uKey)) * .14 * uKeyIntensity;
    // at a grazing edge the weave thins: lighter, and letting more through, so the
    // outline furs instead of drawing a line
    float fres = graze * graze * graze;
    color = mix(color, vec3(.97, .965, .955), uSoftRim * fres * .6);
    a *= 1.0 - uSoftRim * fres * .55;

    if (!facing) {
      // the far face: the same image mirrored, dimmer, softer (the bias above), a touch cooler
      color = mix(vec3(.80, .82, .84), color, uBackFace) * vec3(.975, .99, 1.015);
      a *= .85;
    }
    // at a distance the sheet recedes into the air: its colour goes toward the air's, its dye thins
    color = mix(color, uAir, uHazeWash * .55);
    a *= 1.0 - uHazeWash * .3;
    // a fine screen-space grain, so the flats are not plastic
    float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - .5;
    color += grain * uGrain;
    gl_FragColor = vec4(color, alpha * clamp(a * uSheer, 0.0, 1.0) * reflectFade(vWorld));
  }
`;

export const glassVertex = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewW;
  varying vec3 vModel;
  varying vec3 vWorld;
  varying vec3 vCentre;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vModel = position;
    vWorld = world.xyz;
    vCentre = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewW = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/* What both glass looks share: the uniforms, the noise, the frost in two or
   three soft patches (breath on a cold window, placed by the seed). */
const GLASS_COMMON_GLSL = /* glsl */ `
  ${REFLECT_GLSL}
  uniform vec3 uKey;
  uniform float uKeyIntensity;
  uniform float uRim;
  uniform float uFrostN;
  uniform float uFrostSize;
  uniform float uFrostStrength;
  uniform float uThickness;
  uniform float uSeed;
  uniform float uWarmth;
  uniform vec3 uPatch[3];
  /* distance (each already scaled by the haze): the view through the glass smeared
     further, the rim lines and the gathering of alpha at the silhouette letting go,
     the body fading toward the air; and the mist that stands off the glass. */
  uniform float uHazePhoto;
  uniform float uHazeEdge;
  uniform float uHazeWash;
  uniform float uHazeMist;
  uniform float uHazeSpread;
  uniform float uHazeGlow;
  uniform vec3 uAir;
  /* the glow's life: seconds, how much the halo itself moves (0 is still), and
     how much of the halo is there at all under the streaks */
  uniform float uTime;
  uniform float uGlowMove;
  uniform float uGlowBase;
  /* the streaks: runners of light along the form's edges — how many, how bright,
     their speed (rad/s), the tail they leave (rad) and the soft front, how long
     one lives (s) and for what part of that it is lit, the chance one runs round
     the form itself rather than round the silhouette, the chance it runs up or
     down one lobe, and how much it flickers along its length */
  uniform float uStreakN;
  uniform float uStreakGain;
  uniform float uStreakSpeed;
  uniform float uStreakTail;
  uniform float uStreakHead;
  uniform float uStreakLife;
  uniform float uStreakDuty;
  uniform float uStreakRound;
  uniform float uStreakUp;
  uniform float uStreakFlicker;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  varying vec3 vModel;
  varying vec3 vWorld;
  varying vec3 vCentre;
  float gHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float gNoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(gHash(i), gHash(i + vec3(1, 0, 0)), f.x), mix(gHash(i + vec3(0, 1, 0)), gHash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(gHash(i + vec3(0, 0, 1)), gHash(i + vec3(1, 0, 1)), f.x), mix(gHash(i + vec3(0, 1, 1)), gHash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  /* The illumination at a distance: a pale band of light just inside a surface's
     silhouette — as a long exposure under water leaves a body's edge luminous —
     brighter on the side the key is on, 0…1 before uHazeGlow. The band is a
     bump in facing (dot(n, v)) peaking well inside the silhouette: facing goes
     as the square root of the distance to the edge on screen, so a band set
     near 0 is a one-pixel line and one peaking around .3 is a soft swell some
     way in — wide enough that the mist shells' bands overlap and sum to one
     halo instead of a ring each. width (0…1, the outer shells) pushes the peak
     in and lets it run further.
     It is alive, by uGlowMove: a breath over eight seconds that swells the band
     outward as it brightens; a flow — light moving along the edge, as caustics
     wander over a body under water — from a noise field drifting slowly round
     the form; and a shimmer, finer and quicker and faint, so it flickers
     rather than pulses. All of it is a function of the clock, nothing is
     stored, and at 0 it is the still band.
     Over that, the streaks (streaksAt): the light running along one edge at a
     time and fading behind itself. */
  const float PI2 = 6.2831853;
  float wrapAngle(float a) { return mod(a + 3.14159265, PI2) - 3.14159265; }
  /* A comet along its path: s is the signed distance from the head along the
     path, positive ahead. A short soft front, and behind it a tail that fades
     as it is left — exp, so it never quite ends. */
  float comet(float s) { return s > 0.0 ? exp(-s / max(uStreakHead, .01)) : exp(s / max(uStreakTail, .01)); }
  /* The streaks. Each runner has a life of its own length (uStreakLife, varied),
     lit for uStreakDuty of it and rising and dying softly inside that; every
     life starts from a new place, in a new direction, on a path chosen by the
     seed — round the silhouette as seen (theta, the angle on screen about the
     form's centre, so it is always on the edge), round the form itself (phi,
     the model's azimuth: it goes behind and comes back), or up or down the form
     (psi, the elevation) within a window of azimuth, so one lobe's edge lights
     and not the others. Where a point lies on the path relative to the head
     gives the comet; a slow noise along the length makes it flicker. Nothing
     is stored: all of it is read off the clock. */
  float streaksAt(float theta, float phi, float psi) {
    float sum = 0.0;
    for (int i = 0; i < 8; i++) {
      if (float(i) >= uStreakN) break;
      float fi = float(i) * 3.7 + uSeed * 11.0;
      float period = uStreakLife * (.7 + .6 * gHash(vec3(fi, 1.3, 2.7)));
      float tt = uTime / period + gHash(vec3(fi, 5.1, .4));
      float life = floor(tt), u = fract(tt);
      if (u > uStreakDuty) continue;
      float p = u / max(uStreakDuty, .01);
      float env = smoothstep(0.0, .18, p) * (1.0 - smoothstep(.55, 1.0, p));
      // this life's draw: where it starts, which way, how fast, which path
      float h0 = gHash(vec3(fi, life, 4.4)), h1 = gHash(vec3(fi, life, 8.8)), h2 = gHash(vec3(fi, life, 2.2));
      float h3 = gHash(vec3(fi, life, 6.6)), h4 = gHash(vec3(fi, life, 9.9));
      float dir = h1 < .5 ? -1.0 : 1.0;
      float speed = uStreakSpeed * (.7 + .6 * h2);
      float head = h0 * PI2 + dir * speed * u * period;
      float along, window = 1.0;
      if (h3 < uStreakUp) {
        along = psi;
        // up or down: start from the bottom or the top, and stay on one side of the form
        head = -dir * 3.0 + dir * speed * 2.0 * u * period;
        window = 1.0 - smoothstep(.45, 1.3, abs(wrapAngle(phi - h4 * PI2)));
      } else if (h4 < uStreakRound) {
        along = phi;
      } else {
        along = theta;
      }
      float s = wrapAngle(along - head) * dir;
      float c = comet(s) * env * window;
      // a flicker along the trail, slow and uneven, so the light is not one smooth comet
      c *= 1.0 - uStreakFlicker * .8 * gNoise(vec3(along * 2.5, uTime * .6 + fi, psi * 1.5));
      sum += c;
    }
    return sum;
  }
  float glowAt(float facing, vec3 n, float width) {
    float m = uGlowMove;
    float breath = sin(uTime * 0.785); // 2π / 8 s
    float peak = mix(.3, .45, width) + m * .05 * breath;
    float band = smoothstep(0.0, peak, facing) * (1.0 - smoothstep(peak, mix(.8, 1.0, width) + m * .06 * breath, facing));
    // where the surface is seen nearly edge-on (a flat top from eye level) the band
    // is only a pixel or two wide and the nested shells draw as stacked rings; the
    // derivative of facing says how wide the band is on screen, and it lets go
    // below a few pixels. Measured on the smooth normal: the mist's facing is
    // flat per triangle near the edge, and its derivative would cut the band
    // along every triangle's edge.
    float smoothFacing = max(0.0, dot(n, normalize(vViewW)));
    band *= 1.0 - smoothstep(.06, .2, fwidth(smoothFacing));
    float lit = .6 + .6 * smoothstep(-.4, 1.0, dot(n, uKey)) * uKeyIntensity;
    float flow = gNoise(vModel * 1.9 + vec3(uTime * .09, uTime * .05, -uTime * .07) + uSeed);
    float shimmer = gNoise(vModel * 5.5 + vec3(0.0, uTime * .7, uTime * .4) + uSeed * 3.0);
    float life = 1.0 + m * (.14 * breath + .7 * (flow - .5) + .3 * (shimmer - .5));
    float halo = uGlowBase * max(0.0, life);
    float streak = 0.0;
    if (uStreakN > .5 && uStreakGain > 0.0) {
      // the point's angle on screen about the form's centre, and its azimuth and elevation on the form
      vec3 d = mat3(viewMatrix) * (vWorld - vCentre);
      float theta = atan(d.y, d.x);
      float phi = atan(vModel.z, vModel.x);
      vec3 md = normalize(vModel);
      float psi = asin(clamp(md.y, -1.0, 1.0)) * 2.0;
      streak = streaksAt(theta, phi, psi) * uStreakGain;
    }
    return band * lit * uHazeGlow * (halo + streak);
  }
  /* What the glow is made of: whiter than the air, a touch cool. */
  vec3 glowColor() { return mix(vec3(1.0, 1.0, 1.0), uAir, .25) * vec3(.985, 1.0, 1.01); }
  // how much frost sits here, 0–1
  float frostAt(vec3 dir) {
    float breath = 0.0;
    for (int i = 0; i < 3; i++) {
      if (float(i) < uFrostN - .5) {
        float dd = length(dir - uPatch[i]) + (gNoise(vModel * 3.0 + float(i) * 7.0 + uSeed) - .5) * .35;
        breath += 1.0 - smoothstep(uFrostSize * .25, uFrostSize * .6, dd);
      }
    }
    return clamp(breath, 0.0, 1.0) * uFrostStrength * (.7 + .3 * gNoise(vModel * 9.0 - uSeed));
  }
`;

/* Thin clear glass, from the descent's formFragment: the rim is light and
   the facing surface nearly disappears. Its thickness is not quite even, so
   the rim is heavier in places; the frost patches; one soft highlight from
   the key. */
export const glassFragment = /* glsl */ `
  ${GLASS_COMMON_GLSL}
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(vViewW);
    if (dot(n, v) < 0.0) n = -n;
    float facing = max(0.0, dot(n, v));
    float fresnel = pow(1.0 - facing, 2.4);
    float thickness = mix(1.0, .55 + .9 * gNoise(vModel * 1.6 + uSeed), uThickness);
    // against the paper the rim is a cool grey, as the landing blobs are; the body a paler one
    vec3 rimColor = mix(vec3(.64, .69, .72), vec3(.70, .68, .66), uWarmth);
    vec3 body = mix(vec3(.84, .87, .88), vec3(.87, .86, .85), uWarmth);
    vec3 color = mix(body, rimColor, fresnel);
    float alpha = (.09 + .6 * fresnel * uRim) * thickness;
    // at a distance the edge lets go: the alpha no longer gathers at the silhouette
    alpha = mix(alpha, .2 * thickness, uHazeEdge * .6);

    vec3 dir = normalize(vModel);
    float frost = frostAt(dir);
    vec3 milk = vec3(.885, .90, .905) * (.95 + .07 * n.y);
    color = mix(color, milk, frost * .85);
    alpha = mix(alpha, .5 + .3 * fresnel, frost);

    float spec = pow(max(0.0, dot(reflect(-v, n), uKey)), 28.0) * .28 * uKeyIntensity * (1.0 - uHazeEdge);
    color += spec;
    alpha += spec * .7;
    color = mix(color, uAir, uHazeWash * .5);
    alpha *= 1.0 - uHazeWash * .25;
    // the luminous edge
    float glow = glowAt(facing, n, 0.0);
    color = mix(color, glowColor(), clamp(glow * .6, 0.0, 1.0));
    alpha += glow * .4;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0) * reflectFade(vWorld));
  }
`;

/* The other look: softness from refraction, not frost (after two glass drops
   on a white table against black). The glass has no tone of its own; it
   shows what is behind it, refracted and smeared. What is behind it is the
   frame itself — the backdrop, the table, the sheet inside — drawn first to
   a target (tScene); the facing surface then samples that frame displaced
   along its own normal, the way a solid body pulls the view in toward its
   axis and turns it over at the edge, and smeared by thickness. Thick parts
   darken (the drops' feet). The rim follows the live bubble form: a dark
   line just inside the silhouette, a thin bright film ring inside that where
   the surface turns toward a large soft key, no pow(…, 40) spot. Frost stays
   to its patches and may go to zero. The sheet inside is what the facing side
   mostly refracts, so its lightness shows through as a pale wash. */
export const glassRefractFragment = /* glsl */ `
  ${GLASS_COMMON_GLSL}
  uniform sampler2D tScene;
  uniform vec2 uResolution;
  uniform float uEnvAbove;
  uniform float uEnvBelow;
  uniform vec3 uAboveColor;
  uniform vec3 uBelowColor;
  uniform float uHorizon;
  uniform float uHorizonSoft;
  uniform float uBend;
  uniform float uGlassSoft;
  uniform float uBodyAlpha;
  uniform float uThickDark;
  uniform float uHighlight;
  // the room as the shader knows it, for what the surface reflects at a grazing angle
  vec3 env(float y) {
    float t = smoothstep(uHorizon - uHorizonSoft, uHorizon + uHorizonSoft, y);
    vec3 tint = mix(vec3(.975, 1.0, 1.02), vec3(1.02, 1.0, .975), uWarmth);
    return mix(uBelowColor * uEnvBelow, uAboveColor * uEnvAbove, t) * tint;
  }
  // the frame behind, smeared over a small radius. Carries the frame's alpha too:
  // where the frame is empty (a transparent canvas, no backdrop drawn) the glass
  // shows the room instead of black
  vec4 behind(vec2 uv, float radius) {
    vec2 r = vec2(radius * uResolution.y / uResolution.x, radius);
    vec4 c = texture2D(tScene, uv) * 2.0;
    c += texture2D(tScene, uv + vec2(r.x, 0.0));
    c += texture2D(tScene, uv - vec2(r.x, 0.0));
    c += texture2D(tScene, uv + vec2(0.0, r.y));
    c += texture2D(tScene, uv - vec2(0.0, r.y));
    c += texture2D(tScene, uv + r * .7);
    c += texture2D(tScene, uv - r * .7);
    c += texture2D(tScene, uv + vec2(r.x, -r.y) * .7);
    c += texture2D(tScene, uv - vec2(r.x, -r.y) * .7);
    return c / 10.0;
  }
  void main() {
    // the far wall is drawn too, quieter; the view leaves the glass there and
    // bends back the other way
    // (not gl_FrontFacing: three flips the winding for a BackSide material,
    // so the far wall would pass as facing)
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(vViewW);
    float back = dot(n, v) < 0.0 ? 1.0 : 0.0;
    if (back > .5) n = -n;
    float facing = max(0.0, dot(n, v));
    float g = 1.0 - facing;
    float fresnel = pow(g, 2.4);
    float uneven = mix(1.0, .55 + .9 * gNoise(vModel * 1.6 + uSeed), uThickness);
    // a walled vessel: the eye looks through the most glass at the silhouette,
    // where the wall turns edge-on, and low down where the glass gathers to stand
    float low = smoothstep(.3, -.6, vModel.y);
    float thick = clamp(mix(g, 1.0, .6 * low), 0.0, 1.0) * uneven;

    // where this fragment sits on the frame, and where the glass bends the view to:
    // along the surface normal as the eye sees it, hardly at all face-on, more
    // toward the edge, so what is behind is drawn in toward the axis
    vec2 suv = gl_FragCoord.xy / uResolution;
    vec3 nv = normalize((viewMatrix * vec4(n, 0.0)).xyz);
    vec2 shift = -nv.xy * uBend * (.004 + .05 * g * g) * vec2(uResolution.y / uResolution.x, 1.0);
    // the far wall sits behind the sheet, so it must not bend the sheet: no shift there
    shift *= 1.0 - back;
    // at a distance the view through the glass is smeared a little further everywhere
    float smear = uGlassSoft * (.002 + .05 * thick * thick) + uHazePhoto * .004;
    vec4 frame = behind(clamp(suv + shift, .002, .998), smear);
    vec3 body = mix(env(0.0), frame.rgb / max(frame.a, 1e-3), frame.a);
    // the feet: the glass is thickest low down where it stands
    float foot = smoothstep(.25, 1.0, thick) * (.35 + .65 * low) * mix(1.0, .5, back);
    body *= 1.0 - uThickDark * .7 * foot * (1.0 - uHazeWash);
    // at a grazing angle the surface reflects the room instead
    vec3 refl = env(reflect(-v, n).y);
    float mirror = pow(g, 4.0) * uRim * .6 * (1.0 - uHazeEdge * .7);
    vec3 color = mix(body, refl, mirror);
    // the live bubble's rim: a dark line just inside the silhouette (its rimPower
    // 3.3) — here the frame itself, darkened, so it still reads as glass
    float rimLine = pow(g, 3.3) * uRim * (1.0 - uHazeEdge * .85);
    color = mix(color, body * .55, rimLine * .5);
    // the view is fully through the glass; what the alpha carries is how much the
    // glass itself asserts over the frame — more toward the edge, and in the feet
    float alpha = uBodyAlpha * mix(.35, 1.0, g * g) * uneven + uThickDark * .25 * foot + rimLine * .35 + mirror * .5;
    // at a distance the edge lets go: the alpha no longer gathers at the silhouette,
    // so the outline is left to the mist outside it
    alpha = mix(alpha, uBodyAlpha * .5 * uneven, uHazeEdge * .6);

    vec3 dir = normalize(vModel);
    float frost = frostAt(dir);
    vec3 milk = vec3(.885, .90, .905) * (.95 + .07 * n.y);
    color = mix(color, milk, frost * .85);
    alpha = mix(alpha, .5 + .3 * fresnel, frost);

    // the bubble's film ring: a thin bright line just inside the silhouette (its
    // filmPower 20), where the surface turns toward a large soft key
    float film = pow(g, 20.0) * (1.0 - smoothstep(.93, 1.0, g));
    float toward = smoothstep(-.4, .8, dot(n, uKey));
    float line = film * toward * uHighlight * uKeyIntensity * mix(1.0, .3, back) * (1.0 - uHazeEdge);
    color += line * .9;
    alpha += line * .6;
    alpha *= mix(1.0, .55, back);
    // and the body fades toward the air
    color = mix(color, uAir, uHazeWash * .5);
    alpha *= 1.0 - uHazeWash * .25;
    // the luminous edge, on the facing wall
    float glow = glowAt(1.0 - g, n, 0.0) * (1.0 - back);
    color = mix(color, glowColor(), clamp(glow * .6, 0.0, 1.0));
    alpha += glow * .4;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0) * reflectFade(vWorld));
  }
`;

/* The mist: what gives the outline its softness at a distance. Six copies of
   the glass stand off it along its normals, each a little further out
   (uShell 0…1 → .2…1 of the reach), drawn as a pale veil the air's colour that
   is thickest looking through the middle of each shell and thins to nothing at
   its own edge — so the silhouette is no longer a line but a gradient reaching
   past the glass, uneven as breath is. The shells also carry the glow, each a
   band at its own edge weaker than the one inside it: six is enough that the
   bands overlap on screen and sum to one halo (three left three rings). Drawn
   over the glass, facing side only. Alpha carries the haze: nothing is drawn
   at 0. */
export const mistVertex = /* glsl */ `
  uniform float uHazeSpread;
  uniform float uShell;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  varying vec3 vModel;
  varying vec3 vWorld;
  varying vec3 vCentre;
  void main() {
    vec3 p = position + normal * uHazeSpread * mix(.2, 1.0, uShell);
    vec4 world = modelMatrix * vec4(p, 1.0);
    vModel = position;
    vWorld = world.xyz;
    vCentre = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewW = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
export const mistFragment = /* glsl */ `
  ${GLASS_COMMON_GLSL}
  uniform float uShell;
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(vViewW);
    // A shell swollen along smooth normals is not quite parallel to the glass where
    // the form creases, so its real silhouette falls where the smooth normal still
    // faces the eye a little — and the band, cut there, drew a hard contour round
    // every shell. Near the edge the facing is taken from the surface as drawn
    // (its screen-space derivatives), which does reach 0 at the silhouette.
    vec3 nFlat = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    float flatFacing = abs(dot(nFlat, v));
    float facing = mix(flatFacing, max(0.0, dot(n, v)), smoothstep(.1, .4, flatFacing));
    // flat through the middle, thinning to nothing toward the shell's own edge; the outer shells thin sooner
    float body = pow(smoothstep(0.0, .75, facing), 1.0 + uShell);
    // the fog drifts slowly round the form with the glow's movement
    vec3 drift = vec3(uTime * .03, uTime * .02, 0.0) * uGlowMove;
    float uneven = .6 + .64 * (gNoise(vModel * 1.3 + uSeed + uShell * 5.0 + drift) * .7 + gNoise(vModel * 3.6 - uSeed - drift) * .3);
    vec3 milk = uAir * (.97 + .05 * max(0.0, dot(n, uKey)) * uKeyIntensity) + .015;
    float alpha = uHazeMist * .2 * body * uneven * mix(1.0, .5, uShell);
    // each shell carries the luminous band toward its own edge — wider and fainter on
    // the outer shells — so together they are a halo graded outward from the glass
    float glow = glowAt(facing, n, uShell) * .5 * pow(1.0 - uShell * .92, 1.3) * (.8 + .2 * uneven);
    vec3 color = mix(milk, glowColor(), clamp(glow * 1.2, 0.0, 1.0));
    alpha += glow * .55;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0) * reflectFade(vWorld));
  }
`;
/** Where each shell stands, 0 nearest the glass. */
export const MIST_SHELLS = [0, 0.2, 0.4, 0.6, 0.8, 1] as const;

/* The frame behind everything, drawn in the canvas so the glass can refract
   it: three stops down the screen (the paper), or two meeting at a soft
   horizon (the room). Linear between stops, as the page's own gradient is. */
export const backdropVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`;
const backdropFragment = /* glsl */ `
  uniform vec3 uStop0;
  uniform vec3 uStop1;
  uniform vec3 uStop2;
  uniform float uAt1;
  uniform float uAt2;
  varying vec2 vUv;
  void main() {
    float t = 1.0 - vUv.y;
    vec3 c = t < uAt1
      ? mix(uStop0, uStop1, clamp(t / max(uAt1, 1e-4), 0.0, 1.0))
      : mix(uStop1, uStop2, clamp((t - uAt1) / max(uAt2 - uAt1, 1e-4), 0.0, 1.0));
    gl_FragColor = vec4(c, 1.0);
  }
`;

/* The copy: the target to the screen, as it is. */
export const blitFragment = /* glsl */ `
  uniform sampler2D tScene;
  varying vec2 vUv;
  void main() { gl_FragColor = texture2D(tScene, vUv); }
`;

/* The softness at a distance: the finished frame blurred, once across and once
   down (a 13-tap Gaussian, sigma 2.5 taps, uStep one tap in uv). The backdrop
   is a gradient and the ground is already soft, so only the vessel changes. */
const BLUR_TAPS_GLSL = /* glsl */ `
  uniform sampler2D tScene;
  uniform vec2 uStep;
  varying vec2 vUv;
  const float W0 = .161, W1 = .1486, W2 = .1169, W3 = .0784, W4 = .0448, W5 = .0217, W6 = .0090;
  vec4 blur13(vec2 uv) {
    vec4 c = texture2D(tScene, uv) * W0;
    c += (texture2D(tScene, uv + uStep) + texture2D(tScene, uv - uStep)) * W1;
    c += (texture2D(tScene, uv + uStep * 2.0) + texture2D(tScene, uv - uStep * 2.0)) * W2;
    c += (texture2D(tScene, uv + uStep * 3.0) + texture2D(tScene, uv - uStep * 3.0)) * W3;
    c += (texture2D(tScene, uv + uStep * 4.0) + texture2D(tScene, uv - uStep * 4.0)) * W4;
    c += (texture2D(tScene, uv + uStep * 5.0) + texture2D(tScene, uv - uStep * 5.0)) * W5;
    c += (texture2D(tScene, uv + uStep * 6.0) + texture2D(tScene, uv - uStep * 6.0)) * W6;
    return c;
  }
`;
const blurFragment = /* glsl */ `
  ${BLUR_TAPS_GLSL}
  void main() { gl_FragColor = blur13(vUv); }
`;

/* The bleed at a distance, as a long exposure leaves a body's brights spilling
   past its edge: what is lighter than the backdrop behind it (the stock, the
   highlights, the glow) is taken out, blurred wide — once across here, once
   down in the composite — and added back over the soft frame. The backdrop
   is known (the same stops the backdrop quad draws), so on a pale frame the
   bleed still belongs to the vessel and not to the paper. */
const bloomExtractFragment = /* glsl */ `
  ${BLUR_TAPS_GLSL}
  uniform vec3 uStop0;
  uniform vec3 uStop1;
  uniform vec3 uStop2;
  uniform float uAt1;
  uniform float uAt2;
  vec3 backdropAt(vec2 uv) {
    float t = 1.0 - uv.y;
    return t < uAt1
      ? mix(uStop0, uStop1, clamp(t / max(uAt1, 1e-4), 0.0, 1.0))
      : mix(uStop1, uStop2, clamp((t - uAt1) / max(uAt2 - uAt1, 1e-4), 0.0, 1.0));
  }
  vec3 excess(vec2 uv) {
    vec3 c = texture2D(tScene, uv).rgb, b = backdropAt(uv);
    float over = dot(c - b, vec3(.2126, .7152, .0722));
    // a soft knee, so only what is clearly lighter than the air behind it bleeds
    return max(c - b, 0.0) * smoothstep(.02, .12, over);
  }
  void main() {
    vec3 c = excess(vUv) * W0;
    c += (excess(vUv + uStep) + excess(vUv - uStep)) * W1;
    c += (excess(vUv + uStep * 2.0) + excess(vUv - uStep * 2.0)) * W2;
    c += (excess(vUv + uStep * 3.0) + excess(vUv - uStep * 3.0)) * W3;
    c += (excess(vUv + uStep * 4.0) + excess(vUv - uStep * 4.0)) * W4;
    c += (excess(vUv + uStep * 5.0) + excess(vUv - uStep * 5.0)) * W5;
    c += (excess(vUv + uStep * 6.0) + excess(vUv - uStep * 6.0)) * W6;
    gl_FragColor = vec4(c, 1.0);
  }
`;
const bloomCompositeFragment = /* glsl */ `
  ${BLUR_TAPS_GLSL}
  uniform sampler2D tBase;
  uniform float uBloom;
  void main() {
    vec4 base = texture2D(tBase, vUv);
    vec3 bleed = blur13(vUv).rgb * vec3(.985, 1.0, 1.01);
    // screened in, not added: the lights go toward white and do not clip
    gl_FragColor = vec4(1.0 - (1.0 - base.rgb) * (1.0 - clamp(bleed * uBloom, 0.0, 1.0)), base.a);
  }
`;

/* The table: a faint contact shadow and a tone under the object that fades
   out, so it has a place without a drawn horizon. */
const groundVertex = /* glsl */ `
  varying vec2 vLocal;
  uniform float uSize;
  void main() {
    vLocal = position.xy * uSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const groundFragment = /* glsl */ `
  uniform float uGround;
  uniform float uWarmth;
  uniform float uRadius;
  varying vec2 vLocal;
  void main() {
    float r = length(vLocal / (uRadius * vec2(1.1, .85)));
    float shadow = (1.0 - smoothstep(.3, 1.5, r)) * .16;
    float table = (1.0 - smoothstep(1.0, 4.5, length(vLocal))) * .035;
    vec3 shade = mix(vec3(.60, .63, .66), vec3(.66, .63, .60), uWarmth);
    gl_FragColor = vec4(shade, (shadow + table) * uGround);
  }
`;

/* ───────── the scene ───────── */

export const photoLoader = new THREE.TextureLoader();

/** Unexposed stock until the photo arrives. */
export const BLANK_PHOTO = (() => {
  const texture = new THREE.DataTexture(new Uint8Array([236, 239, 239, 255]), 1, 1);
  texture.needsUpdate = true;
  return texture;
})();

/** Directions on the form for the frost patches, from the seed. */
export function seedDirections(seed: number, count: number, salt: number): THREE.Vector3[] {
  return Array.from({ length: count }, (_, i) => {
    const u = hash2(seed * 3.1 + i, salt), v = hash2(seed * 1.7 - i, salt + 4.2);
    const phi = u * Math.PI * 2, y = (v - 0.5) * 1.5;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    return new THREE.Vector3(Math.sin(phi) * r, y, Math.cos(phi) * r);
  });
}

export function keyFrom(azimuthDeg: number, elevationDeg: number): THREE.Vector3 {
  const az = (azimuthDeg * Math.PI) / 180, el = (elevationDeg * Math.PI) / 180;
  // behind-above: azimuth 0 is straight behind the form from the camera's side
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}

/* ───────── the uniforms, for this lab and for anything else drawing the vessel ───────── */

/** One sheet material's uniforms (the film look, the stock, the strip, the feel, the key). */
export function createSheetUniformSet(edgePrint: THREE.Texture) {
  return {
    ...filmLookUniforms(),
    uFilmSeed: { value: 0 },
    ...sheetUniforms(),
    uPhoto: { value: BLANK_PHOTO as THREE.Texture },
    uEdgePrint: { value: edgePrint },
    uImageAspect: { value: 1.5 },
    uSeed: { value: 0 },
    uArc: { value: 1 },
    uYScale: { value: 1 },
    uWear: { value: 1 },
    uBackFace: { value: 1 },
    uBleed: { value: 0 },
    uMmAttr: { value: 0 },
    uFlip: { value: 0 },
    uSheer: { value: 1 },
    uSoftRim: { value: 0 },
    uSheen: { value: 0 },
    uGloss: { value: 1 },
    uGrain: { value: 0 },
    uKey: { value: new THREE.Vector3() },
    uKeyIntensity: { value: 1 },
    uReflect: { value: 0 },
    uGroundY: { value: 0 },
    uHazePhoto: { value: 0 },
    uHazeEdge: { value: 0 },
    uHazeWash: { value: 0 },
    uAir: { value: new THREE.Vector3(0.9, 0.9, 0.9) },
  };
}
export type SheetUniformSet = ReturnType<typeof createSheetUniformSet>;

/** One glass material's uniforms, for either look; tScene is the refraction pass's target. */
export function createGlassUniformSet(scene: THREE.Texture) {
  return {
    uKey: { value: new THREE.Vector3() },
    uKeyIntensity: { value: 1 },
    uRim: { value: 1 },
    uFrostN: { value: 0 },
    uFrostSize: { value: 1 },
    uFrostStrength: { value: 0 },
    uThickness: { value: 0 },
    uSeed: { value: 0 },
    uWarmth: { value: 0 },
    uPatch: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
    uEnvAbove: { value: 0 },
    uEnvBelow: { value: 1 },
    uAboveColor: { value: new THREE.Color(1, 1, 1) },
    uBelowColor: { value: new THREE.Color(1, 1, 1) },
    uHorizon: { value: 0 },
    uHorizonSoft: { value: 0.1 },
    uBend: { value: 0 },
    uGlassSoft: { value: 0 },
    uBodyAlpha: { value: 0 },
    uThickDark: { value: 0 },
    uHighlight: { value: 0 },
    tScene: { value: scene },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uReflect: { value: 0 },
    uGroundY: { value: 0 },
    uHazePhoto: { value: 0 },
    uHazeEdge: { value: 0 },
    uHazeWash: { value: 0 },
    uHazeMist: { value: 0 },
    uHazeSpread: { value: 0 },
    uHazeGlow: { value: 0 },
    uAir: { value: new THREE.Vector3(0.9, 0.9, 0.9) },
    uTime: { value: 0 },
    uGlowMove: { value: 0 },
    uGlowBase: { value: 1 },
    uStreakN: { value: 0 },
    uStreakGain: { value: 0 },
    uStreakSpeed: { value: 0 },
    uStreakTail: { value: 1 },
    uStreakHead: { value: 0.1 },
    uStreakLife: { value: 8 },
    uStreakDuty: { value: 0.5 },
    uStreakRound: { value: 0 },
    uStreakUp: { value: 0 },
    uStreakFlicker: { value: 0 },
  };
}
export type GlassUniformSet = ReturnType<typeof createGlassUniformSet>;

export interface SheetWrite {
  tune: VesselTune; seed: number; sheet: Sheet; sheetMode: SheetMode; face: SheetFace;
  key: THREE.Vector3; edgePrint: THREE.Texture; groundY: number;
  /** −1 for the thing itself; a reflection's strength otherwise. */
  reflect: number;
  /** What the sheet fades toward at a distance (`airFor`). */
  air: readonly [number, number, number];
}
/** The knobs written into a sheet's uniforms. */
export function writeSheetUniforms(u: SheetUniformSet, w: SheetWrite) {
  const { tune, seed, sheet } = w;
  const stock = STOCKS[Math.min(STOCKS.length - 1, Math.max(0, Math.round(tune.stock)))];
  // the distance, as the shader takes it: each part already scaled by the haze
  const edge = tune.haze * tune.hazeEdge;
  setFilmLook(u, lookFor(tune));
  setStock(u, stock);
  u.uFilmSeed.value = seed;
  u.uSeed.value = seed;
  u.uPhotoOpacity.value = tune.photoOpacity;
  u.uStockThick.value = tune.stockThick;
  u.uStockThin.value = tune.stockThin;
  u.uHoleRim.value = tune.holeRim * (1 - edge);
  // the knobs say how much perforation is left; the shader takes how much is gone
  u.uHoleShrink.value.set(1 - tune.holeSize * tune.holeWidth, 1 - tune.holeSize);
  // at a distance the perforations are a mark, not a cut
  u.uHoleFade.value = tune.holeFade + (1 - tune.holeFade) * edge;
  u.uMono.value = tune.mono;
  u.uNegative.value = tune.negative;
  u.uArc.value = sheet.arc;
  u.uYScale.value = sheet.yScale;
  u.uWear.value = tune.wear / 1.6;
  u.uBackFace.value = tune.backFace;
  u.uBleed.value = tune.bleed;
  u.uMmAttr.value = sheet.mmAttr ? 1 : 0;
  u.uFlip.value = w.face === "glass" ? 1 : 0;
  // the feel belongs to the draped sheet; the pressed film keeps its own look
  const draped = w.sheetMode === "draped";
  const softRim = draped ? tune.softRim : 0;
  u.uSheer.value = draped ? tune.sheer : 1;
  // at a distance the furred edge comes to both sheets, and the film's hard highlight goes
  u.uSoftRim.value = softRim + (1 - softRim) * edge * 0.6;
  u.uSheen.value = draped ? tune.sheen : 0;
  u.uGloss.value = (draped ? tune.gloss : 1) * (1 - edge);
  u.uGrain.value = draped ? tune.grain : 0;
  u.uKey.value.copy(w.key);
  u.uKeyIntensity.value = tune.keyIntensity;
  u.uReflect.value = w.reflect;
  u.uGroundY.value = w.groundY;
  u.uEdgePrint.value = w.edgePrint;
  u.uHazePhoto.value = tune.haze * tune.hazePhoto;
  u.uHazeEdge.value = edge;
  u.uHazeWash.value = tune.haze * tune.hazeWash;
  u.uAir.value.set(w.air[0], w.air[1], w.air[2]);
}

export interface GlassWrite {
  tune: VesselTune; seed: number; key: THREE.Vector3; patches: THREE.Vector3[]; room: Room; groundY: number; reflect: number;
  /** What the glass fades toward at a distance, and the mist's colour (`airFor`). */
  air: readonly [number, number, number];
}
/** The knobs written into a glass's uniforms. */
export function writeGlassUniforms(u: GlassUniformSet, w: GlassWrite) {
  const { tune } = w;
  u.uHazePhoto.value = tune.haze * tune.hazePhoto;
  u.uHazeEdge.value = tune.haze * tune.hazeEdge;
  u.uHazeWash.value = tune.haze * tune.hazeWash;
  u.uHazeMist.value = tune.haze * tune.hazeMist;
  u.uHazeSpread.value = tune.hazeSpread;
  u.uHazeGlow.value = tune.haze * tune.hazeGlow;
  u.uGlowMove.value = tune.hazeMove;
  u.uGlowBase.value = tune.glowBase;
  u.uStreakN.value = Math.round(tune.streakN);
  u.uStreakGain.value = tune.streakGain;
  u.uStreakSpeed.value = tune.streakSpeed;
  u.uStreakTail.value = tune.streakTail;
  u.uStreakHead.value = tune.streakHead;
  u.uStreakLife.value = tune.streakLife;
  u.uStreakDuty.value = tune.streakDuty;
  u.uStreakRound.value = tune.streakRound;
  u.uStreakUp.value = tune.streakUp;
  u.uStreakFlicker.value = tune.streakFlicker;
  u.uAir.value.set(w.air[0], w.air[1], w.air[2]);
  u.uKey.value.copy(w.key);
  u.uKeyIntensity.value = tune.keyIntensity;
  u.uRim.value = tune.rim;
  u.uFrostN.value = tune.frostPatches;
  u.uFrostSize.value = tune.frostSize;
  u.uFrostStrength.value = tune.frostStrength;
  u.uThickness.value = tune.thickness;
  u.uSeed.value = w.seed;
  u.uWarmth.value = tune.warmth;
  u.uPatch.value.forEach((p, j) => p.copy(w.patches[j]));
  u.uEnvAbove.value = tune.envAbove;
  u.uEnvBelow.value = tune.envBelow;
  u.uAboveColor.value.set(w.room.above);
  u.uBelowColor.value.set(w.room.below);
  u.uHorizon.value = tune.horizon;
  u.uHorizonSoft.value = tune.horizonSoft;
  u.uBend.value = tune.bend;
  u.uGlassSoft.value = tune.glassSoft;
  u.uBodyAlpha.value = tune.bodyAlpha;
  u.uThickDark.value = tune.thickDark;
  u.uHighlight.value = tune.highlight;
  u.uReflect.value = w.reflect;
  u.uGroundY.value = w.groundY;
}

/**
 * A strip size for the cavity so the picture covers the side it hangs on: the
 * strip's width (hung upright, its height) is the glass's full height, so the
 * frame inside it spans about .69 of the side with the stock's bands above and
 * below, whatever the form's proportions. Only when the form is much taller
 * than it is round is the strip held back, to about .58 of the body's
 * circumference, so the cloth wraps the near half of the wall and not the
 * back. The body's radius is the mean of the wall over the belt about the
 * equator.
 */
export function fitSheetSize(glass: Glass): number {
  let sum = 0, n = 0;
  const p = glass.positions;
  for (let k = 0; k < p.length; k += 3) {
    if (Math.abs(p[k + 1]) > 0.45) continue;
    sum += Math.hypot(p[k], p[k + 1], p[k + 2]); n++;
  }
  const body = n ? sum / n : 1;
  const height = glass.hi - glass.lo;
  const kHeight = height / STRIP_MM.width;
  const kWrap = (1.15 * Math.PI * body) / STRIP_MM.length;
  return Math.min(kHeight, kWrap) * STRIP_MM.length;
}

/** The mist's three shells over one glass, sharing its uniform set (each adds only
    which shell it is). Drawn after the glass, on its layer; nothing when `on` is
    false, so a clear vessel costs nothing. */
export function Mist({ geometry, uniforms, layer, renderOrder, on }: {
  geometry: THREE.BufferGeometry; uniforms: GlassUniformSet; layer: number; renderOrder: number; on: boolean;
}) {
  const sets = useMemo(() => MIST_SHELLS.map((s) => ({ ...uniforms, uShell: { value: s } })), [uniforms]);
  return <>
    {sets.map((u, i) => (
      <mesh key={i} geometry={geometry} renderOrder={renderOrder + i} frustumCulled={false} layers={layer} visible={on}>
        <shaderMaterial transparent depthWrite={false} side={THREE.FrontSide} vertexShader={mistVertex} fragmentShader={mistFragment} uniforms={u} />
      </mesh>
    ))}
  </>;
}

interface StageProps {
  tune: VesselTune;
  mode: GlassMode;
  sheetMode: SheetMode;
  face: SheetFace;
  show: Show;
  backdrop: Backdrop;
  room: Room;
  url: string;
  seed: number;
  form: ArtifactForm;
  held: RefObject<boolean>;
  drag: RefObject<number>;
  /** The turn it opens at, in radians; the page's ?yaw= unless the editor says. */
  yaw0?: number;
}

/** The glass's facing surface draws on its own layer so it can refract the rest. */
export const FRONT_LAYER = 1;

function Stage({ tune, mode, sheetMode, face, show, backdrop, room, url, seed, form, held, drag, yaw0 = YAW }: StageProps) {
  const { camera, gl, size } = useThree();
  const yaw = useRef(yaw0);
  // how much of the table is there: 1 with the eye above it, 0 once it has gone under
  const tableFade = useRef(1);

  /* The refraction pass: everything but the glass's facing surface is drawn
     to a target, the target is copied to the screen, and the facing surface
     is drawn over it sampling the target. Under the frost look the scene is
     drawn straight. The backdrop is a quad in the scene so it is in the
     target too. At a distance (haze × hazeBlur > 0) the finished frame goes
     to a second target instead and reaches the screen through the blur, once
     across into `pong` and once down; with a bloom as well the soft frame
     lands in `soft`, what is lighter than the backdrop is taken out of it and
     blurred three times as wide, and the two are screened together. */
  const backdropUniforms = useMemo(() => ({
    uStop0: { value: new THREE.Color() }, uStop1: { value: new THREE.Color() }, uStop2: { value: new THREE.Color() },
    uAt1: { value: 0.5 }, uAt2: { value: 1 },
  }), []);
  const pass = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(1, 1, { samples: 4, depthBuffer: true, stencilBuffer: false });
    const frame = new THREE.WebGLRenderTarget(1, 1, { samples: 4, depthBuffer: true, stencilBuffer: false });
    const pong = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, stencilBuffer: false });
    const soft = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, stencilBuffer: false });
    const flat = { depthTest: false, depthWrite: false, blending: THREE.NoBlending, vertexShader: backdropVertex };
    const blit = new THREE.ShaderMaterial({ ...flat, fragmentShader: blitFragment, uniforms: { tScene: { value: target.texture } } });
    const blur = new THREE.ShaderMaterial({ ...flat, fragmentShader: blurFragment,
      uniforms: { tScene: { value: frame.texture }, uStep: { value: new THREE.Vector2() } } });
    const extract = new THREE.ShaderMaterial({ ...flat, fragmentShader: bloomExtractFragment,
      uniforms: { ...backdropUniforms, tScene: { value: frame.texture }, uStep: { value: new THREE.Vector2() } } });
    const composite = new THREE.ShaderMaterial({ ...flat, fragmentShader: bloomCompositeFragment,
      uniforms: { tScene: { value: pong.texture }, tBase: { value: frame.texture }, uStep: { value: new THREE.Vector2() }, uBloom: { value: 0 } } });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blit);
    quad.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(quad);
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return { target, frame, pong, soft, blit, blur, extract, composite, quad, scene, ortho };
  }, [backdropUniforms]);
  useEffect(() => () => {
    pass.target.dispose(); pass.frame.dispose(); pass.pong.dispose(); pass.soft.dispose();
    pass.blit.dispose(); pass.blur.dispose(); pass.extract.dispose(); pass.composite.dispose(); pass.quad.geometry.dispose();
  }, [pass]);
  useEffect(() => {
    const dpr = gl.getPixelRatio();
    const w = Math.round(size.width * dpr), h = Math.round(size.height * dpr);
    pass.target.setSize(w, h);
    pass.frame.setSize(w, h);
    pass.pong.setSize(w, h);
    pass.soft.setSize(w, h);
  }, [pass, gl, size]);
  const blurPx = tune.haze * tune.hazeBlur;
  const bloom = tune.haze * tune.hazeBloom;
  useFrame(({ gl: renderer, scene, camera: view }) => {
    // the softness in device pixels; under a quarter pixel the frame goes straight to the screen
    const dpr = renderer.getPixelRatio();
    const px = blurPx * dpr;
    const soften = px > 0.25, bleed = bloom > 0.005;
    const out = soften || bleed ? pass.frame : null;
    if (mode !== "refract") {
      view.layers.enableAll();
      renderer.setRenderTarget(out);
      renderer.render(scene, view);
    } else {
      for (const u of glassUniformSets) u.uResolution.value.set(pass.target.width, pass.target.height);
      view.layers.set(0);
      renderer.setRenderTarget(pass.target);
      renderer.render(scene, view);
      renderer.setRenderTarget(out);
      pass.quad.material = pass.blit;
      renderer.render(pass.scene, pass.ortho);
      renderer.clearDepth();
      view.layers.set(FRONT_LAYER);
      renderer.autoClear = false;
      renderer.render(scene, view);
      renderer.autoClear = true;
      view.layers.enableAll();
    }
    const w = pass.frame.width, h = pass.frame.height;
    // the soft frame: blurred into `soft` when a bloom follows, else straight to the screen
    let base: THREE.Texture = pass.frame.texture;
    if (soften) {
      const step = px / 6;
      pass.quad.material = pass.blur;
      pass.blur.uniforms.tScene.value = pass.frame.texture;
      pass.blur.uniforms.uStep.value.set(step / w, 0);
      renderer.setRenderTarget(pass.pong);
      renderer.render(pass.scene, pass.ortho);
      pass.blur.uniforms.tScene.value = pass.pong.texture;
      pass.blur.uniforms.uStep.value.set(0, step / h);
      renderer.setRenderTarget(bleed ? pass.soft : null);
      renderer.render(pass.scene, pass.ortho);
      base = pass.soft.texture;
    }
    if (bleed) {
      // the bleed reaches three times as far as the softness, and at least a dozen pixels
      const step = Math.max(px, 4 * dpr) * 3 / 6;
      pass.quad.material = pass.extract;
      pass.extract.uniforms.tScene.value = base;
      pass.extract.uniforms.uStep.value.set(step / w, 0);
      renderer.setRenderTarget(pass.pong);
      renderer.render(pass.scene, pass.ortho);
      pass.quad.material = pass.composite;
      pass.composite.uniforms.tScene.value = pass.pong.texture;
      pass.composite.uniforms.tBase.value = base;
      pass.composite.uniforms.uStep.value.set(0, step / h);
      pass.composite.uniforms.uBloom.value = bloom;
      renderer.setRenderTarget(null);
      renderer.render(pass.scene, pass.ortho);
    }
    pass.quad.material = pass.blit;
    renderer.setRenderTarget(null);
  }, 1);

  backdrop.stops.forEach((s, i) => (backdropUniforms[`uStop${i}` as "uStop0"].value as THREE.Color).setRGB(s[0] / 255, s[1] / 255, s[2] / 255));
  backdropUniforms.uAt1.value = backdrop.at[0];
  backdropUniforms.uAt2.value = backdrop.at[1];

  const morph = tune.morph;
  const glass = useMemo(() => buildGlass(form, morph), [form, morph]);
  useEffect(() => () => glass.geometry.dispose(), [glass]);
  const { inset, arc, band, lift, foldScale } = tune;
  const { sheetSize, anchorAngle, anchorHeight, tilt, contact, sag, peel, curl, twist, gap, soft } = tune;
  const sheet = useMemo(() => sheetMode === "draped"
    ? buildDrapedSheet(glass, inset, { sheetSize, anchorAngle, anchorHeight, tilt, contact, sag, peel, curl, twist, gap, soft })
    : buildSheet(glass, inset, arc, band, lift, foldScale, seed),
  [glass, sheetMode, inset, arc, band, lift, foldScale, seed, sheetSize, anchorAngle, anchorHeight, tilt, contact, sag, peel, curl, twist, gap, soft]);
  useEffect(() => () => sheet.geometry.dispose(), [sheet]);
  const groundY = glass.lo - 0.02;
  const radius = (glass.hi - glass.lo) * 0.5;

  const edgePrint = useMemo(() => createEdgePrint(1 + Math.floor(hash2(seed, 7.7) * 36)), [seed]);
  const key = keyFrom(tune.keyAzimuth, tune.keyElevation);
  const patches = useMemo(() => seedDirections(seed, 3, 1.1), [seed]);

  // the sheet and the glass each twice: the thing and its reflection under the table
  const sheetUniformSets = useMemo(() => [0, 1].map(() => createSheetUniformSet(edgePrint)), [edgePrint]);
  const glassUniformSets = useMemo(() => [0, 1].map(() => createGlassUniformSet(pass.target.texture)), [pass]);
  const groundUniforms = useMemo(() => ({
    uGround: { value: 0 }, uWarmth: { value: 0 }, uRadius: { value: 1 }, uSize: { value: 12 },
  }), []);

  // the knobs are written straight into the uniforms on every render
  const air = airOf(backdrop);
  sheetUniformSets.forEach((u, i) => writeSheetUniforms(u, {
    tune, seed, sheet, sheetMode, face, key, edgePrint, groundY, reflect: i === 0 ? -1 : 0.22 * tune.ground * tableFade.current, air,
  }));
  glassUniformSets.forEach((u, i) => writeGlassUniforms(u, {
    tune, seed, key, patches, room, groundY, reflect: i === 0 ? -1 : 0.22 * tune.ground * tableFade.current, air,
  }));
  groundUniforms.uGround.value = tune.ground * tableFade.current;
  groundUniforms.uWarmth.value = tune.warmth;
  groundUniforms.uRadius.value = radius;

  useEffect(() => {
    let live = true;
    let texture: THREE.Texture | null = null;
    photoLoader.loadAsync(url).then((t) => {
      if (!live) { t.dispose(); return; }
      texture = t;
      const image = t.image as { width: number; height: number };
      const prepared = prepareFilmPhoto(t);
      for (const u of sheetUniformSets) {
        u.uPhoto.value = prepared;
        u.uImageAspect.value = image.width / image.height;
      }
    }).catch(() => undefined);
    return () => { live = false; texture?.dispose(); };
  }, [url, sheetUniformSets]);

  /* The eye orbits the form; the form, the key and the room stay where they
     are, so turning it is walking round a still life — the lit side comes and
     goes, the horizon's reflection slides over the glass, the sheet is seen
     through and then against the light. Yaw is the slow turn plus the drag;
     pitch and distance are knobs (the drag writes pitch too). */
  const { turn, pitch, distance, ground } = tune;
  useFrame(({ clock }, dt) => {
    // the glow's clock; the lab's frame loop is always running, so it breathes while everything else is still
    for (const g of glassUniformSets) g.uTime.value = clock.elapsedTime;
    let y = yaw.current;
    if (!held.current) y += turn * Math.min(dt, 0.1);
    y += drag.current ?? 0;
    drag.current = 0;
    yaw.current = y;
    const p = (pitch * Math.PI) / 180;
    camera.position.set(-Math.sin(y) * Math.cos(p) * distance, LOOK_Y + Math.sin(p) * distance, Math.cos(y) * Math.cos(p) * distance);
    camera.lookAt(0, LOOK_Y, 0);
    // under the table there is no table: its tone and the reflection in it go
    const fade = smooth01((camera.position.y - groundY + 0.45) / 0.7);
    if (fade !== tableFade.current) {
      tableFade.current = fade;
      sheetUniformSets[1].uReflect.value = 0.22 * ground * fade;
      glassUniformSets[1].uReflect.value = 0.22 * ground * fade;
      groundUniforms.uGround.value = ground * fade;
    }
  });

  // the material is keyed by the look so the shader is rebuilt on a switch; the far
  // wall of the glass never refracts (it is behind the sheet), only the facing one
  const refract = mode === "refract";
  const layers = (reflect: boolean) => {
    const s = sheetUniformSets[reflect ? 1 : 0];
    const g = glassUniformSets[reflect ? 1 : 0];
    const base = reflect ? -3 : 0;
    return <>
      {show !== "sheet" && <mesh geometry={glass.geometry} renderOrder={base} frustumCulled={false} layers={refract ? FRONT_LAYER : 0}>
        <shaderMaterial key={mode} transparent depthWrite={false} side={THREE.BackSide}
          vertexShader={glassVertex} fragmentShader={refract ? glassRefractFragment : glassFragment} uniforms={g} />
      </mesh>}
      {show !== "glass" && <mesh geometry={sheet.geometry} renderOrder={base + 1} frustumCulled={false}>
        <shaderMaterial transparent depthWrite={false} side={THREE.DoubleSide}
          vertexShader={sheetVertex} fragmentShader={sheetFragment} uniforms={s} />
      </mesh>}
      {show !== "sheet" && <mesh geometry={glass.geometry} renderOrder={base + 2} frustumCulled={false} layers={refract ? FRONT_LAYER : 0}>
        <shaderMaterial key={mode} transparent depthWrite={false} side={THREE.FrontSide}
          vertexShader={glassVertex} fragmentShader={refract ? glassRefractFragment : glassFragment} uniforms={g} />
      </mesh>}
      {/* the mist stands off the glass, over everything, and only at a distance */}
      {show !== "sheet" && <Mist geometry={glass.geometry} uniforms={g} layer={refract ? FRONT_LAYER : 0} renderOrder={base + 3} on={tune.haze * (tune.hazeMist + tune.hazeGlow) > 0} />}
    </>;
  };

  return <>
    <mesh renderOrder={-10} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial depthTest={false} depthWrite={false} vertexShader={backdropVertex} fragmentShader={backdropFragment} uniforms={backdropUniforms} />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, groundY, 0]} renderOrder={-4}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial transparent depthWrite={false} vertexShader={groundVertex} fragmentShader={groundFragment} uniforms={groundUniforms} />
    </mesh>
    {/* the reflection: the same meshes mirrored in the table, fading with depth */}
    <group scale={[1, -1, 1]} position={[0, 2 * groundY, 0]}>{layers(true)}</group>
    <group>{layers(false)}</group>
  </>;
}

/* ───────── the panel ───────── */

interface Knob { key: keyof VesselTune; label: string; min: number; max: number; step: number; only?: SheetMode }
const KNOBS: { group: string; knobs: Knob[]; only?: SheetMode }[] = [
  // the form itself, as the shape step has it: a category, a deviation inside it, and how far it has grown from its sphere
  { group: "form", knobs: [
    { key: "morph", label: "grown from the sphere  (the shape step's morph)", min: 0, max: 1, step: 0.01 },
  ] },
  // the distance step: how far the memory has receded. `haze` is the signal the step
  // would drive; the rest say what a full haze does
  { group: "distance", knobs: [
    { key: "haze", label: "haze  (the distance step's signal; 0 is clear)", min: 0, max: 1, step: 0.01 },
    { key: "hazeBlur", label: "softness  px  (the frame, blurred)", min: 0, max: 24, step: 0.5 },
    { key: "hazePhoto", label: "photo blur  (mip levels)", min: 0, max: 5, step: 0.1 },
    { key: "hazeMist", label: "mist  (the outline fogs)", min: 0, max: 1, step: 0.01 },
    { key: "hazeSpread", label: "mist reach", min: 0, max: 0.5, step: 0.005 },
    { key: "hazeWash", label: "fades into the air", min: 0, max: 1, step: 0.01 },
    { key: "hazeEdge", label: "edges let go  (rim lines, cuts, gloss)", min: 0, max: 1, step: 0.01 },
  ] },
  // the light at the edges of a receded memory: a halo, and streaks of light that
  // run along one edge at a time and fade behind themselves. All of it scaled by the haze.
  { group: "glow", knobs: [
    { key: "hazeGlow", label: "glow  (the light at the edges; 0 is none)", min: 0, max: 1, step: 0.01 },
    { key: "glowBase", label: "halo  (the steady band under the streaks)", min: 0, max: 1, step: 0.01 },
    { key: "hazeMove", label: "halo moves  (breath, flow, shimmer; 0 is still)", min: 0, max: 1, step: 0.01 },
    { key: "hazeBloom", label: "bleed  (the lights spill past the edge)", min: 0, max: 2, step: 0.01 },
    { key: "streakN", label: "streaks  (runners of light along the edges)", min: 0, max: 8, step: 1 },
    { key: "streakGain", label: "streak brightness", min: 0, max: 4, step: 0.05 },
    { key: "streakSpeed", label: "streak speed  rad/s", min: 0.05, max: 2, step: 0.01 },
    { key: "streakTail", label: "tail  rad  (how far behind it the light lingers)", min: 0.1, max: 3.2, step: 0.02 },
    { key: "streakHead", label: "front  rad  (how soft its leading edge is)", min: 0.02, max: 0.8, step: 0.01 },
    { key: "streakLife", label: "one life  s", min: 2, max: 24, step: 0.5 },
    { key: "streakDuty", label: "lit for  (the part of a life it is seen; the rest is dark)", min: 0.1, max: 1, step: 0.01 },
    { key: "streakUp", label: "runs up or down one lobe  (chance)", min: 0, max: 1, step: 0.01 },
    { key: "streakRound", label: "else runs round the form, not the silhouette  (chance)", min: 0, max: 1, step: 0.01 },
    { key: "streakFlicker", label: "flicker along the trail", min: 0, max: 1, step: 0.01 },
  ] },
  { group: "glass", knobs: [
    { key: "frostPatches", label: "frost patches", min: 0, max: 3, step: 1 },
    { key: "frostSize", label: "frost size", min: 0.4, max: 2.5, step: 0.05 },
    { key: "frostStrength", label: "frost strength", min: 0, max: 1, step: 0.01 },
    { key: "rim", label: "rim", min: 0, max: 1.5, step: 0.01 },
    { key: "thickness", label: "thickness variation", min: 0, max: 1, step: 0.01 },
  ] },
  // shown only under the refraction look
  { group: "refraction", knobs: [
    { key: "envAbove", label: "lightness  above the horizon", min: 0, max: 1, step: 0.01 },
    { key: "envBelow", label: "lightness  below it", min: 0, max: 1, step: 0.01 },
    { key: "horizon", label: "horizon  (0 is eye level)", min: -0.5, max: 0.3, step: 0.005 },
    { key: "horizonSoft", label: "horizon softness", min: 0.01, max: 0.6, step: 0.005 },
    { key: "bend", label: "bend  (pulls the view in)", min: 0, max: 2, step: 0.01 },
    { key: "glassSoft", label: "smear by thickness", min: 0, max: 2, step: 0.01 },
    { key: "bodyAlpha", label: "body", min: 0, max: 1, step: 0.01 },
    { key: "thickDark", label: "thick parts darken", min: 0, max: 1, step: 0.01 },
    { key: "highlight", label: "silhouette highlight", min: 0, max: 1.5, step: 0.01 },
  ] },
  { group: "sheet", knobs: [
    { key: "inset", label: "inset", min: 0.8, max: 0.98, step: 0.005 },
    { key: "arc", label: "arc °", min: 60, max: 220, step: 1, only: "pressed" },
    { key: "band", label: "band  (1 = true scale)", min: 0.5, max: 1.6, step: 0.01, only: "pressed" },
    { key: "lift", label: "lift", min: 0, max: 0.15, step: 0.002, only: "pressed" },
    { key: "foldScale", label: "fold scale", min: 0.4, max: 3, step: 0.05, only: "pressed" },
    { key: "stockThick", label: "stock alpha  thick", min: 0.2, max: 1, step: 0.01 },
    { key: "stockThin", label: "stock alpha  thin", min: 0.1, max: 0.95, step: 0.01 },
    { key: "wear", label: "edge wear  mm", min: 0.05, max: 1.6, step: 0.01 },
    { key: "holeSize", label: "perforations  size  (0 is none)", min: 0, max: 1, step: 0.01 },
    { key: "holeWidth", label: "perforations  width", min: 0, max: 1, step: 0.01 },
    { key: "holeFade", label: "perforations  fade  (1 is a mark, not a cut)", min: 0, max: 1, step: 0.01 },
    { key: "holeRim", label: "perforations  rim", min: 0, max: 1, step: 0.01 },
    { key: "backFace", label: "far face", min: 0, max: 1, step: 0.01 },
  ] },
  // shown only under the draped sheet: how it hangs
  { group: "drape", only: "draped", knobs: [
    { key: "sheetSize", label: "size  (strip length)", min: 0.6, max: 3, step: 0.02 },
    { key: "anchorAngle", label: "hung from  around °", min: -180, max: 180, step: 1 },
    { key: "anchorHeight", label: "hung from  height", min: 0.3, max: 1, step: 0.01 },
    { key: "tilt", label: "tilt °  (90 hangs from one end)", min: -90, max: 90, step: 1 },
    { key: "contact", label: "pressed for  mm", min: 0, max: 46, step: 0.5 },
    { key: "sag", label: "peels over  mm", min: 2, max: 46, step: 0.5 },
    { key: "peel", label: "peels away °", min: -40, max: 160, step: 1 },
    { key: "curl", label: "curl across", min: -1, max: 1, step: 0.01 },
    { key: "twist", label: "twist °", min: -90, max: 90, step: 1 },
    { key: "gap", label: "air from the wall", min: 0, max: 0.15, step: 0.002 },
    { key: "soft", label: "softness  (0 is crisp)", min: 0, max: 1, step: 0.01 },
  ] },
  { group: "feel", only: "draped", knobs: [
    { key: "sheer", label: "sheer  (how much shows through)", min: 0.3, max: 1, step: 0.01 },
    { key: "softRim", label: "furred edge", min: 0, max: 1, step: 0.01 },
    { key: "sheen", label: "sheen", min: 0, max: 1, step: 0.01 },
    { key: "gloss", label: "gloss  (1 is film)", min: 0, max: 1, step: 0.01 },
    { key: "grain", label: "grain", min: 0, max: 0.15, step: 0.005 },
  ] },
  { group: "dye", knobs: [
    { key: "dyeLift", label: "black lift", min: 0, max: 0.25, step: 0.005 },
    { key: "dyeContrast", label: "contrast", min: 0.5, max: 1.2, step: 0.01 },
    { key: "dyeShoulder", label: "shoulder", min: 0, max: 1, step: 0.01 },
    { key: "dyeExposure", label: "exposure", min: -1, max: 1, step: 0.01 },
    { key: "dyeSaturation", label: "saturation", min: 0, max: 1.2, step: 0.01 },
    { key: "dyeSoft", label: "softness", min: 0, max: 1, step: 0.01 },
    { key: "dyeGrain", label: "grain", min: 0, max: 0.1, step: 0.001 },
    { key: "dyeLeak", label: "light leak", min: 0, max: 1, step: 0.01 },
    { key: "photoOpacity", label: "photo opacity", min: 0.3, max: 1, step: 0.01 },
    { key: "bleed", label: "bled corner", min: 0, max: 1, step: 0.01 },
    { key: "mono", label: "drained to grey", min: 0, max: 1, step: 0.01 },
    { key: "negative", label: "negative  (1 is the inverted film)", min: 0, max: 1, step: 0.01 },
  ] },
  { group: "light", knobs: [
    { key: "keyAzimuth", label: "key azimuth °", min: -180, max: 180, step: 1 },
    { key: "keyElevation", label: "key elevation °", min: 0, max: 90, step: 1 },
    { key: "keyIntensity", label: "intensity", min: 0, max: 2, step: 0.01 },
  ] },
  // the eye: orbiting, so the light on the form changes as it would walking round it
  { group: "camera", knobs: [
    { key: "pitch", label: "pitch °  (down on it … up at it)", min: PITCH_MIN, max: PITCH_MAX, step: 0.5 },
    { key: "distance", label: "distance", min: 5, max: 16, step: 0.1 },
    { key: "turn", label: "turn  rad/s", min: 0, max: 0.4, step: 0.005 },
  ] },
  { group: "scene", knobs: [
    { key: "ground", label: "ground", min: 0, max: 1, step: 0.01 },
    { key: "warmth", label: "background warmth", min: 0, max: 1, step: 0.01 },
  ] },
];

/** /lab/vessel — the memory as a glass vessel with the film inside, with its knobs. */
/** Everything the panel can set — what an editor hands back to whoever opened it. */
export interface VesselState {
  tune: VesselTune;
  mode: GlassMode;
  sheetMode: SheetMode;
  face: SheetFace;
  room: Room;
  url: string;
  seed: number;
  form: ArtifactForm;
}

export interface VesselPreviewProps {
  /** Opens with these instead of the page's defaults and ?params. */
  initial?: Partial<VesselState>;
  /** Called with the whole state after every change, for an editor over one memory. */
  onChange?: (state: VesselState) => void;
  /** Given, a way back is shown top-left in place of the lab's caption. */
  onBack?: () => void;
  backLabel?: string;
  /** The turn it opens at, in degrees (the page's ?yaw= otherwise). */
  yaw?: number;
  /** The stills offered under the form; the lab's two by default. */
  photos?: string[];
}

export function VesselPreview({ initial, onChange, onBack, backLabel = "back", yaw: yawProp, photos = PHOTOS }: VesselPreviewProps = {}) {
  const [opening] = useState(vesselDefaults);
  const [tune, setTune] = useState<VesselTune>(initial?.tune ?? opening.tune);
  const [mode, setMode] = useState<GlassMode>(initial?.mode ?? opening.mode);
  const [sheetMode, setSheetMode] = useState<SheetMode>(initial?.sheetMode ?? opening.sheetMode);
  const [face, setFace] = useState<SheetFace>(initial?.face ?? opening.face);
  const [room, setRoom] = useState<Room>(initial?.room ?? opening.room);
  const [keptOwn, setKeptOwn] = useState(hasKeptDefaults);
  const [justKept, setJustKept] = useState(false);
  const [show, setShow] = useState<Show>(SHOW);
  const refract = mode === "refract";
  const backdrop = backdropFor(tune, mode, room);
  // the caption sits on the backdrop's top, which may be dark under the refraction look
  const topLuma = (0.2126 * backdrop.stops[0][0] + 0.7152 * backdrop.stops[0][1] + 0.0722 * backdrop.stops[0][2]) / 255;
  const ink = topLuma < 0.55 ? "rgba(226, 228, 228, 0.82)" : CHROME_GRAY;
  // ?photo= is one of the bundled stills by index, or any image URL
  const [url, setUrl] = useState<string>(() => {
    if (initial?.url) return initial.url;
    const p = PARAMS.get("photo") ?? "";
    if (/^\d+$/.test(p)) return photos[Math.min(photos.length - 1, Number(p))];
    return p || photos[0];
  });
  const [seed, setSeed] = useState(() => initial?.seed ?? 3.7);
  const [copied, setCopied] = useState(false);
  // the form as the shape step would hand it on: ?form= and ?category= to start, then a
  // category chosen in the panel draws a fresh deviation inside it, "another form" another
  const [form, setForm] = useState(() => initial?.form ?? createArtifactForm({ seed: FORM_SEED, category: CATEGORY }));
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    onChangeRef.current?.({ tune, mode, sheetMode, face, room, url, seed, form });
  }, [tune, mode, sheetMode, face, room, url, seed, form]);
  const formDraws = useRef(0);
  const drawForm = (category: ArtifactCategory) => {
    formDraws.current++;
    setForm(createArtifactForm({ seed: `${FORM_SEED}|${category}|${formDraws.current}`, category }));
  };
  const held = useRef(false);
  const drag = useRef(0);
  const lastX = useRef(0);
  const lastY = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const takeFile = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    setUrl(URL.createObjectURL(file));
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); takeFile(e.dataTransfer.files?.[0]); };

  const copy = async () => {
    const lines = (Object.keys(VESSEL_TUNE_DEFAULT) as (keyof VesselTune)[]).map((k) => `  ${k}: ${Number(tune[k].toFixed(3))},`);
    try {
      await navigator.clipboard.writeText(`{\n${lines.join("\n")}\n}\n// form: ${describeForm(form)}\n// glass: ${mode}, sheet: ${sheetMode}, face: ${face}, room: ${room.above} / ${room.below}, show: ${show}, stock: ${STOCKS[tune.stock]?.name ?? tune.stock}, seed: ${seed.toFixed(3)}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard refused — the values are still on screen */ }
  };
  // one press makes the panel's settling the default this lab opens with, here on this machine
  const keep = () => {
    keepVesselDefaults({ tune, mode, sheetMode, face, room });
    setKeptOwn(true);
    setJustKept(true);
    window.setTimeout(() => setJustKept(false), 1600);
  };
  const forget = () => {
    forgetVesselDefaults();
    setKeptOwn(false);
    const d = vesselDefaults();
    setTune(d.tune); setMode(d.mode); setSheetMode(d.sheetMode); setFace(d.face); setRoom(d.room);
  };
  const reset = () => {
    const d = vesselDefaults();
    setTune(d.tune); setRoom(d.room);
  };

  const release = () => { held.current = false; };
  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic events have no pointer to capture */ }
    held.current = true;
    lastX.current = e.clientX;
    lastY.current = e.clientY;
  };
  // across turns the view round the form; up and down raise and lower the eye
  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!held.current) return;
    drag.current += (e.clientX - lastX.current) * 0.008;
    const dy = e.clientY - lastY.current;
    lastX.current = e.clientX;
    lastY.current = e.clientY;
    if (dy !== 0) setTune((t) => ({ ...t, pitch: Math.min(PITCH_MAX, Math.max(PITCH_MIN, t.pitch - dy * 0.25)) }));
  };

  return (
    <main onDragOver={(e) => e.preventDefault()} onDrop={onDrop}
      style={{ position: "relative", width: "100%", height: "100dvh", overflow: "hidden", background: backdropCss(backdrop) }}>
      {/* a long lens, as the still-life references are shot: the far wall projects nearly as large as the near one */}
      <Canvas camera={{ position: [0, 0.6, 9], fov: FOV, near: 0.1, far: 50 }}
        dpr={[1, 2]} gl={{ antialias: true, alpha: true }}
        style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: "calc(100% - 260px)" }}>
        <Stage tune={tune} mode={mode} sheetMode={sheetMode} face={face} show={show} backdrop={backdrop} room={room} url={url} seed={seed} form={form} held={held} drag={drag}
          yaw0={yawProp === undefined ? undefined : (yawProp * Math.PI) / 180} />
      </Canvas>

      {onBack
        ? <TextButton label={`← ${backLabel}`} onClick={onBack} style={{ position: "absolute", top: 22, left: 28, zIndex: 20, color: ink }} />
        : <p style={{ ...META, position: "absolute", top: 26, left: 28, margin: 0, zIndex: 20, color: ink }}>lab — vessel</p>}

      {/* hold to stop the turn, drag across to turn, up and down to look down on it or up at it */}
      <button type="button" aria-label="hold to stop the turn, drag to look round the form"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
        onContextMenu={(e) => e.preventDefault()}
        style={{ position: "absolute", left: 0, top: 0, bottom: 0, right: 260, border: "none", outline: "none",
          background: "transparent", touchAction: "none", cursor: "default", zIndex: 5 }} />

      <div style={{ position: "absolute", left: "calc(50% - 130px)", bottom: 34, transform: "translateX(-50%)", display: "flex",
        alignItems: "center", gap: 14, zIndex: 10 }}>
        <TextButton label="choose a photo" onClick={() => inputRef.current?.click()} />
        <span style={{ fontFamily: SANS, fontSize: NOTE_SIZE, color: CHROME_GRAY, opacity: 0.6, marginLeft: 10 }}>or one of these</span>
        {photos.map((p) => (
          <button key={p} type="button" aria-label="select photo" aria-pressed={url === p} onClick={() => setUrl(p)}
            style={{ width: 44, height: 44, flex: "0 0 44px", padding: 0, overflow: "hidden", borderRadius: "50%",
              border: `1px solid rgba(123, 123, 135, ${url === p ? 0.6 : 0.25})`, background: "#e7e7e8",
              boxShadow: "0 6px 18px rgba(40, 36, 48, 0.1)", cursor: "pointer", opacity: 0.85 }}>
            <img src={p} alt="" style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} />
          </button>
        ))}
      </div>
      <input ref={inputRef} type="file" accept="image/*" aria-label="choose a photo" style={{ display: "none" }}
        onChange={(e) => takeFile(e.target.files?.[0])} />

      <aside aria-label="vessel knobs" style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 260, padding: "64px 28px 28px 24px",
        boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 8, zIndex: 10, overflowY: "auto",
        borderLeft: "1px solid rgba(123, 123, 135, 0.14)", background: `rgba(236, 237, 236, ${refract ? 0.88 : 0.5})`, backdropFilter: "blur(6px)" }}>
        {KNOBS.filter(({ group, only }) => (group !== "refraction" || refract) && (!only || only === sheetMode)).map(({ group, knobs }) => (
          <section key={group} style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            <p style={{ ...META, margin: "0 0 2px", color: CHROME_GRAY }}>{group}</p>
            {group === "form" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 4 }}>
                <div role="radiogroup" aria-label="category" style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
                  {ARTIFACT_CATEGORIES.map((c) => {
                    const on = c === form.category;
                    return (
                      <button key={c} type="button" role="radio" aria-checked={on} onClick={() => drawForm(c)}
                        style={{ padding: 0, border: "none", background: "transparent", cursor: "pointer", fontFamily: SANS, fontSize: NOTE_SIZE,
                          color: CHROME_GRAY, opacity: on ? 1 : 0.5, textDecoration: on ? "underline" : "none", textUnderlineOffset: 4 }}>
                        {CATEGORY_LABELS[c]}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontFamily: SANS, fontSize: NOTE_SIZE, color: CHROME_GRAY, opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    title={describeForm(form)}>
                    {describeForm(form)}
                  </span>
                  <TextButton label="another form" onClick={() => drawForm(form.category)} style={{ fontSize: NOTE_SIZE, flexShrink: 0 }} />
                </div>
              </div>
            )}
            {group === "refraction" && (
              <div style={{ display: "flex", gap: 18, marginBottom: 4 }}>
                {(["above", "below"] as const).map((side) => {
                  // what is picked is what is seen: the lightness knob goes to 1 with a pick, and can dim it after
                  const shown = rgb(envColor(room[side], tune[side === "above" ? "envAbove" : "envBelow"], tune.warmth));
                  return (
                    <label key={side} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: SANS, fontSize: NOTE_SIZE, color: CHROME_GRAY, cursor: "pointer", whiteSpace: "nowrap" }}>
                      <span style={{ position: "relative", width: 22, height: 22, borderRadius: 11, background: shown, border: "1px solid rgba(123,123,135,.3)", overflow: "hidden" }}>
                        <input type="color" aria-label={`room colour ${side} the horizon`} value={room[side]}
                          onChange={(e) => { const hex = e.target.value; setRoom((r) => ({ ...r, [side]: hex })); setTune((t) => ({ ...t, [side === "above" ? "envAbove" : "envBelow"]: 1 })); }}
                          style={{ position: "absolute", inset: -8, width: 40, height: 40, opacity: 0, cursor: "pointer", border: "none", padding: 0 }} />
                      </span>
                      {side === "above" ? "above the horizon" : "below"}
                    </label>
                  );
                })}
              </div>
            )}
            {group === "sheet" && (
              <div role="radiogroup" aria-label="sheet" style={{ display: "flex", gap: 16, marginBottom: 4 }}>
                {(["pressed", "draped"] as const).map((m) => {
                  const on = m === sheetMode;
                  return (
                    <button key={m} type="button" role="radio" aria-checked={on} onClick={() => setSheetMode(m)}
                      style={{ padding: 0, border: "none", background: "transparent", cursor: "pointer", fontFamily: SANS, fontSize: NOTE_SIZE,
                        color: CHROME_GRAY, opacity: on ? 1 : 0.5, textDecoration: on ? "underline" : "none", textUnderlineOffset: 4 }}>
                      {m === "pressed" ? "pressed to the wall" : "draped"}
                    </button>
                  );
                })}
              </div>
            )}
            {group === "sheet" && (
              <div role="radiogroup" aria-label="picture faces" style={{ display: "flex", gap: 16, alignItems: "baseline", marginBottom: 4 }}>
                <span style={{ fontFamily: SANS, fontSize: NOTE_SIZE, color: CHROME_GRAY, opacity: 0.5 }}>picture faces</span>
                {(["inside", "glass"] as const).map((f) => {
                  const on = f === face;
                  return (
                    <button key={f} type="button" role="radio" aria-checked={on} onClick={() => setFace(f)}
                      style={{ padding: 0, border: "none", background: "transparent", cursor: "pointer", fontFamily: SANS, fontSize: NOTE_SIZE,
                        color: CHROME_GRAY, opacity: on ? 1 : 0.5, textDecoration: on ? "underline" : "none", textUnderlineOffset: 4 }}>
                      {f === "inside" ? "the inside" : "the glass"}
                    </button>
                  );
                })}
              </div>
            )}
            {group === "glass" && (
              <div role="radiogroup" aria-label="glass look" style={{ display: "flex", gap: 16, marginBottom: 4 }}>
                {(["frost", "refract"] as const).map((m) => {
                  const on = m === mode;
                  return (
                    <button key={m} type="button" role="radio" aria-checked={on} onClick={() => setMode(m)}
                      style={{ padding: 0, border: "none", background: "transparent", cursor: "pointer", fontFamily: SANS, fontSize: NOTE_SIZE,
                        color: CHROME_GRAY, opacity: on ? 1 : 0.5, textDecoration: on ? "underline" : "none", textUnderlineOffset: 4 }}>
                      {m === "frost" ? "frost" : "refraction"}
                    </button>
                  );
                })}
              </div>
            )}
            {group === "scene" && (
              <div role="radiogroup" aria-label="layers shown" style={{ display: "flex", gap: 16, marginBottom: 4 }}>
                {(["both", "glass", "sheet"] as const).map((s) => {
                  const on = s === show;
                  return (
                    <button key={s} type="button" role="radio" aria-checked={on} onClick={() => setShow(s)}
                      style={{ padding: 0, border: "none", background: "transparent", cursor: "pointer", fontFamily: SANS, fontSize: NOTE_SIZE,
                        color: CHROME_GRAY, opacity: on ? 1 : 0.5, textDecoration: on ? "underline" : "none", textUnderlineOffset: 4 }}>
                      {s === "both" ? "both" : s === "glass" ? "glass only" : "sheet only"}
                    </button>
                  );
                })}
              </div>
            )}
            {group === "sheet" && (
              <div style={{ marginBottom: 4 }}>
                <span style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: NOTE_SIZE, color: CHROME_GRAY }}>
                  <span>stock</span>
                  <span style={{ opacity: 0.6 }}>{STOCKS[tune.stock]?.name}</span>
                </span>
                <div role="radiogroup" aria-label="stock" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                  {STOCKS.map((s, i) => {
                    const on = i === tune.stock;
                    return (
                      <button key={s.name} type="button" role="radio" aria-checked={on} aria-label={s.name}
                        onClick={() => setTune((t) => ({ ...t, stock: i }))}
                        style={{ width: 44, height: 22, padding: 0, borderRadius: 3, cursor: "pointer",
                          border: `1px solid rgba(123, 123, 135, ${on ? 0.7 : 0.22})`,
                          boxShadow: on ? "0 0 0 2px rgba(236, 237, 236, 1), 0 0 0 3px rgba(123, 123, 135, 0.35)" : "none",
                          background: `linear-gradient(100deg, ${stockHex(s.low)}, ${stockHex(s.base)} 45%, ${stockHex(s.high)})` }} />
                    );
                  })}
                </div>
              </div>
            )}
            {knobs.filter(({ only }) => !only || only === sheetMode).map(({ key, label, min, max, step }) => (
              <label key={key} style={{ display: "block" }}>
                <span style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: NOTE_SIZE, color: CHROME_GRAY }}>
                  <span>{label}</span>
                  <span style={{ opacity: 0.6, fontVariantNumeric: "tabular-nums" }}>
                    {tune[key].toFixed(step >= 1 ? 0 : step < 0.01 ? 3 : 2)}
                  </span>
                </span>
                <input type="range" className="vessel-range" min={min} max={max} step={step} value={tune[key]}
                  onChange={(e) => setTune((t) => ({ ...t, [key]: Number(e.target.value) }))} />
              </label>
            ))}
          </section>
        ))}
        <div style={{ display: "flex", gap: 18, marginTop: 14, flexWrap: "wrap" }}>
          <TextButton label="another strip" onClick={() => setSeed(Math.random() * 10)} style={{ fontSize: NOTE_SIZE }} />
          <TextButton label="reset" onClick={reset} style={{ fontSize: NOTE_SIZE }} />
          <TextButton label={copied ? "copied" : "copy values"} onClick={() => void copy()} style={{ fontSize: NOTE_SIZE }} />
          <TextButton label={justKept ? "the default now" : "make this the default"} onClick={keep} style={{ fontSize: NOTE_SIZE }} />
          {keptOwn && <TextButton label="back to the built-in default" onClick={forget} style={{ fontSize: NOTE_SIZE }} />}
        </div>
        {keptOwn && !initial && (
          <p style={{ margin: "10px 0 0", fontFamily: SANS, fontSize: NOTE_SIZE, color: CHROME_GRAY, opacity: 0.6, lineHeight: 1.5 }}>
            opens with your default, kept on this machine
          </p>
        )}
      </aside>

      <style>{`
        .vessel-range { -webkit-appearance: none; appearance: none; width: 100%; height: 18px; margin: 0; background: transparent; cursor: pointer; display: block; }
        .vessel-range::-webkit-slider-runnable-track { height: 1px; background: rgba(123, 123, 135, 0.4); }
        .vessel-range::-moz-range-track { height: 1px; background: rgba(123, 123, 135, 0.4); }
        .vessel-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 9px; height: 9px; border-radius: 50%; margin-top: -4px; background: #7b7b87; border: none; }
        .vessel-range::-moz-range-thumb { width: 9px; height: 9px; border-radius: 50%; background: #7b7b87; border: none; }
        .vessel-range:focus-visible { outline: none; }
        .vessel-range:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 3px rgba(123, 123, 135, 0.25); }
      `}</style>
    </main>
  );
}
