import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MemoryCarouselPage } from "../components/MemoryCarouselPage";
import { LIFE_EVENTS } from "../data/memoryData";
import { CHROME_GRAY, COLOR_PALETTE } from "../lib/colors";
import type { ArchiveArtifact } from "../lib/archive";
import { carouselContainsOffset } from "../lib/carouselLayout";
import {
  GalleryOverrideContext, type ArtifactSeat, type GalleryOverride, type SeatDepth, type SeatPlace,
} from "../lib/galleryOverride";
import { createArtifactForm, type ArtifactCategory } from "../lib/superformula";
import {
  ROOM_DEFAULT, VESSEL_TUNE_DEFAULT, VesselPreview, buildGlass, fitSheetSize, smooth01,
  type Room, type VesselState, type VesselTune,
} from "./VesselPreview";
import { VesselArtifact, preloadSeatPhotos } from "./VesselArtifact";
import {
  DOLLY_IN, DOLLY_MAX, DOLLY_MIN, FIELD_FOCAL, FIELD_ORDER, FIELD_PLACES, blendSeat, easeFlight, fieldSeat, surfacingSeat,
  type FieldCamera, type FieldSeat,
} from "./vesselField";
import photoA from "../../assets/memory-photo.jpg";
import photoB from "../../assets/memory-photo-02.png";

/*
 * Lab: the dive gallery with the vessel on every seat. The gallery itself —
 * its S-curve, caption, timescale, wheel and keys, the way out to the pond —
 * is the live one (MemoryCarouselPage, untouched); through GalleryOverride it
 * is handed ten memories and asked to draw each as the glass vessel from
 * /lab/vessel with a photo inside, the draped sheet under the refraction
 * look, sized to its own cavity, the picture on the glass side of the sheet
 * and facing the viewer, who turns the vessel by dragging it. Ten forms, one
 * from each of ten categories; the photos are src/assets/vessel-gallery, in
 * name order (drop ten in; the bundled stills stand in for any missing).
 *
 * Pressing the vessel at the apex opens it in the lab as an editor for that
 * one memory — its form, glass, sheet, dye, light and photo — and "back to
 * the gallery" returns with the memory drawn as it was left. Edits live in
 * page state for this visit.
 *
 * A second view, the field (the switch at the top right): the same ten hang
 * in the air by distance rather than along the years — near and large, far
 * and small and hazed — the eye looking round them with the pointer and into
 * them with the wheel. The seats fly between the two views along arcs, the
 * outer ones leaving first and the picked one coming home first; a press on
 * a memory in the field gathers the years back around it. The layout and the
 * flight are vesselField.ts; the clock, the camera and each seat's share are
 * kept here and handed to the gallery through adjustSeat every frame.
 */

const PHOTOS = Object.entries(
  import.meta.glob("../../assets/vessel-gallery/*.{jpg,jpeg,png,webp}", { eager: true, import: "default" }) as Record<string, string>,
).sort(([a], [b]) => a.localeCompare(b)).map(([, url]) => url);
const FALLBACK = [photoA, photoB];
// fetched and decoded as the module loads, so the seats open with their pictures already in the stock
preloadSeatPhotos(PHOTOS.length ? PHOTOS : FALLBACK);

/**
 * Which of the curated memories are seated, and the form each takes. `draw`
 * picks another deviation inside the category: the star and the gear mostly
 * come out as flat discs with no side for a picture to hang on, and these two
 * draws have a body (about half as tall as they are wide).
 */
const SEATS: { event: number; category: ArtifactCategory; draw?: number }[] = [
  { event: 0, category: "sphere" },
  { event: 2, category: "roundedBox" },
  { event: 3, category: "cylinder" },
  { event: 5, category: "prism" },
  { event: 7, category: "diamond" },
  { event: 8, category: "flower" },
  { event: 9, category: "star", draw: 5 },
  { event: 11, category: "gear", draw: 2 },
  { event: 13, category: "hybrid" },
  { event: 15, category: "torn" },
];

/**
 * The lab's settling, with the film's edge quieter: smaller, fainter
 * perforations, less rim. No slow turn — the vessel opens with its picture
 * squarely to the viewer and would turn it away; the viewer turns it by hand.
 */
export const VESSEL_GALLERY_TUNE: VesselTune = {
  ...VESSEL_TUNE_DEFAULT,
  morph: 0.6,
  holeSize: 0.6, holeWidth: 0.75, holeFade: 0.75, holeRim: 0.25,
  mono: 0, negative: 0,
  pitch: 4, turn: 0, ground: 0,
};

/**
 * The room the glass reflects and shows through where nothing is behind it.
 * The lab's grey wall (#b3b3b3) sat in a grey backdrop; over the gallery's
 * pale water it read as a dark cast on every vessel, so here the room is the
 * water's own light.
 */
export const VESSEL_GALLERY_ROOM: Room = { above: "#e6e7ea", below: "#ffffff" };

function seedOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 9973;
  return 1 + (h % 97) / 10;
}

/** A memory's vessel as the preview first draws it. */
function baseState(i: number): VesselState {
  const { event, category, draw } = SEATS[i];
  const e = LIFE_EVENTS[event];
  const seed = draw === undefined ? `vessel|${e.id}` : `vessel|${category}|${draw}`;
  const form = createArtifactForm({ seed, category });
  const tune = { ...VESSEL_GALLERY_TUNE, sheetSize: fitSheetSize(buildGlass(form, VESSEL_GALLERY_TUNE.morph)) };
  return {
    tune, mode: "refract", sheetMode: "draped", face: "glass", room: VESSEL_GALLERY_ROOM,
    url: PHOTOS[i] ?? FALLBACK[i % FALLBACK.length], seed: seedOf(e.id), form,
  };
}

const BASE: VesselState[] = SEATS.map((_, i) => baseState(i));

/**
 * The seats on the near side of the apex, drawn back. The curve's perspective
 * makes the first newer neighbour larger than the apex and lays it over it
 * (nearer seats draw on top), and the vessel fills its seat where the crystal
 * did not — so the one being looked at was half covered. From the apex out
 * the newer seats shrink (22% by the first neighbour, 28% by the second) and
 * move out toward the lower right (.045w/.025h at the first, .09w/.1h at the
 * second, so the first keeps clear of the apex and the second stays mostly
 * off the frame); and the apex draws over its neighbours, the order falling
 * off smoothly so a step never swaps two seats while they overlap.
 */
function adjustCurveSeat(depth: SeatDepth, offset: number, viewport: { w: number; h: number }): SeatPlace {
  const order = Math.round(offset * 100 + 140 * Math.max(0, 1 - Math.abs(offset) / 0.8));
  if (offset <= 0) return { ...depth, order };
  const w1 = smooth01(Math.min(offset, 1));
  const w2 = smooth01(Math.max(0, offset - 1));
  const shrink = 0.22 * w1 + 0.06 * w2;
  const scale = depth.scale * (1 - shrink);
  return {
    ...depth,
    scale,
    size: depth.size * (1 - shrink),
    x: depth.x + viewport.w * (0.045 * w1 + 0.045 * w2),
    y: depth.y + viewport.h * (0.025 * w1 + 0.075 * w2),
    blurPx: depth.blurPx * (depth.scale / scale),
    order,
  };
}

/* ───────── the field's clock, camera and shares ───────── */

/** One seat's flight between the views. */
const FLIGHT_MS = 1500;
/** Between one seat's departure and the next ring's. */
const STAGGER_MS = 55;
const STAGGER_MAX = 6;
/** How far the eye looks round with the pointer, in fractions of the view. */
const PARALLAX_X = 0.03;
const PARALLAX_Y = 0.02;
/** A wheel's pixel into the field. */
const DOLLY_PER_PX = 0.001;

/** `?speed=0.2` slows the flight between the views, to judge it. */
const SPEED = Number(new URLSearchParams(window.location.search).get("speed")) || 1;

const COUNT = SEATS.length;
const VARIANT = SEATS.map((_, i) => ((i * 7919) % 97) / 97);

class FieldDriver {
  on = false;
  direction: 1 | -1 = 1;
  share = new Array<number>(COUNT).fill(0);
  shareFrom = new Array<number>(COUNT).fill(0);
  delay = new Array<number>(COUNT).fill(0);
  whole = 0;
  wholeFrom = 0;
  startedAt = -1e9;
  cam: FieldCamera = { x: 0, y: 0, z: DOLLY_IN };
  camTarget = { x: 0, y: 0 };
  dolly = 0;
  dollyTarget = 0;
  hover = new Array<number>(COUNT).fill(0);
  hovered = -1;
  /** The seat at the apex, as the gallery last placed it. */
  apex = 0;
  busy = false;
  private cool = 0;
  private last = 0;

  /** Send the seats to the field or back; `around` is the seat the stagger counts from. */
  set(on: boolean, around: number, now: number) {
    this.on = on;
    this.direction = on ? 1 : -1;
    this.startedAt = now;
    this.shareFrom = this.share.slice();
    this.wholeFrom = this.whole;
    for (let i = 0; i < COUNT; i++) {
      const ring = Math.min(Math.abs(i - around), STAGGER_MAX);
      // leaving: the outer ones lift first and the one in hand last; coming home: the one in hand first
      this.delay[i] = (on ? STAGGER_MAX - ring : ring) * STAGGER_MS;
    }
    if (!on) { this.dollyTarget = 0; this.camTarget = { x: 0, y: 0 }; this.hovered = -1; }
    this.busy = true;
    this.last = now;
  }

  /** Advances to `now`; true while anything is still moving (and for two frames after, so the last place is drawn). */
  tick(now: number): boolean {
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const t = (now - this.startedAt) * SPEED;
    const target = this.on ? 1 : 0;
    let moving = false;
    for (let i = 0; i < COUNT; i++) {
      const p = easeFlight((t - this.delay[i]) / FLIGHT_MS);
      this.share[i] = this.shareFrom[i] + (target - this.shareFrom[i]) * p;
      if (p < 1) moving = true;
    }
    const pw = easeFlight(t / (FLIGHT_MS + STAGGER_MAX * STAGGER_MS));
    this.whole = this.wholeFrom + (target - this.wholeFrom) * pw;
    if (pw < 1) moving = true;
    const kCam = 1 - Math.exp(-3 * dt), kDolly = 1 - Math.exp(-4 * dt), kHover = 1 - Math.exp(-8 * dt);
    this.cam.x += (this.camTarget.x - this.cam.x) * kCam;
    this.cam.y += (this.camTarget.y - this.cam.y) * kCam;
    if (Math.abs(this.camTarget.x - this.cam.x) + Math.abs(this.camTarget.y - this.cam.y) > 2e-5) moving = true;
    this.dolly += (this.dollyTarget - this.dolly) * kDolly;
    if (Math.abs(this.dollyTarget - this.dolly) > 1e-4) moving = true;
    for (let i = 0; i < COUNT; i++) {
      const h = i === this.hovered ? 1 : 0;
      this.hover[i] += (h - this.hover[i]) * kHover;
      if (Math.abs(h - this.hover[i]) > 1e-3) moving = true;
    }
    this.cam.z = this.dolly + DOLLY_IN * (1 - this.whole);
    if (moving) this.cool = 2;
    else if (this.cool > 0) this.cool--;
    this.busy = moving || this.cool > 0;
    return this.busy;
  }
}

/** The switch between the years and the field, beside the gallery's own chrome (the plus sits at right 114). */
function FieldToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const title = on ? "back along the years" : "see them in the air";
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      style={{
        position: "fixed", top: 22, right: 156, zIndex: 99999, width: 36, height: 36,
        border: "none", background: "transparent", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 0, opacity: 0.85,
      }}
    >
      {on ? (
        // the years: the curve with its seats along it
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M1.5 12.5 C 5 12.5, 6 3.5, 9.5 3.5 S 13 8, 14.5 8" stroke={CHROME_GRAY} strokeWidth="1.1" />
          <circle cx="3.2" cy="12.2" r="1.1" fill={CHROME_GRAY} />
          <circle cx="8" cy="6" r="1.5" fill={CHROME_GRAY} />
          <circle cx="13" cy="7.6" r="1.1" fill={CHROME_GRAY} />
        </svg>
      ) : (
        // the field: near and far
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <circle cx="3.6" cy="4.2" r="2.1" stroke={CHROME_GRAY} strokeWidth="1.1" />
          <circle cx="12" cy="11.2" r="2.6" stroke={CHROME_GRAY} strokeWidth="1.1" />
          <circle cx="11.4" cy="3.6" r="1" fill={CHROME_GRAY} opacity="0.75" />
          <circle cx="6.8" cy="9.4" r="0.8" fill={CHROME_GRAY} opacity="0.6" />
          <circle cx="3.4" cy="12.6" r="1.2" fill={CHROME_GRAY} opacity="0.8" />
          <circle cx="8.6" cy="6.6" r="0.55" fill={CHROME_GRAY} opacity="0.5" />
        </svg>
      )}
    </button>
  );
}

/** The seat's vessel, skipped when nothing about it changed — the field re-renders the gallery every frame. */
const SeatVessel = memo(VesselArtifact);

/** /lab/gallery — the live dive gallery, seated with vessels. */
export function VesselGalleryPreview() {
  // each memory's vessel as the editor left it (or as first drawn), and how many times it has changed —
  // the count keys the seat's built geometry, so a returned memory is rebuilt once as it now is
  const [vessels, setVessels] = useState(() => BASE.map((state) => ({ state, version: 0 })));
  const [editing, setEditing] = useState<number | null>(null);
  const [returnTo, setReturnTo] = useState<string | undefined>(undefined);

  // the field: its driver lives across renders; `frame` is bumped by the loop so the gallery re-places its seats
  const driver = useRef(new FieldDriver()).current;
  const [fieldOn, setFieldOn] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [frame, setFrame] = useState(0);
  const rafRef = useRef(0);
  const run = useCallback(() => {
    if (rafRef.current) return;
    const tick = (now: number) => {
      const more = driver.tick(now);
      setFrame((f) => f + 1);
      rafRef.current = more ? requestAnimationFrame(tick) : 0;
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [driver]);
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const setField = useCallback((on: boolean, around: number) => {
    driver.set(on, around, performance.now());
    setFieldOn(on);
    setHoveredId(null);
    run();
  }, [driver, run]);

  // in the field the eye looks round with the pointer and goes in with the wheel
  useEffect(() => {
    if (!fieldOn) return;
    const move = (e: PointerEvent) => {
      driver.camTarget = {
        x: ((e.clientX / window.innerWidth) * 2 - 1) * PARALLAX_X,
        y: ((e.clientY / window.innerHeight) * 2 - 1) * PARALLAX_Y,
      };
      run();
    };
    const wheel = (e: WheelEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, [contenteditable=true]")) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
      driver.dollyTarget = Math.min(DOLLY_MAX, Math.max(DOLLY_MIN, driver.dollyTarget + e.deltaY * unit * DOLLY_PER_PX));
      run();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("wheel", wheel, { passive: false });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("wheel", wheel);
    };
  }, [fieldOn, driver, run]);

  const items = useMemo<ArchiveArtifact[]>(() => SEATS.map(({ event }, i) => {
    const e = LIFE_EVENTS[event];
    const s = vessels[i].state;
    return {
      id: e.id,
      year: e.year,
      event: e.event,
      colorIndex: e.color % COLOR_PALETTE.length,
      shape: { form: s.form, fluidity: 0.7, evolve: s.tune.morph, bumpAmount: 0 },
      look: { photoUrl: s.url },
    };
  }), [vessels]);
  const indexOf = useCallback((item: ArchiveArtifact) => items.findIndex((it) => it.id === item.id), [items]);

  // a press at the apex opens the editor; in the field it picks the memory and gathers the years round it
  const pickRef = useRef<(i: number) => void>(() => undefined);
  pickRef.current = (i) => { setReturnTo(items[i].id); setEditing(i); };
  const pickHandlers = useMemo(() => SEATS.map((_, i) => () => pickRef.current(i)), []);
  const onFieldPick = useCallback((item: ArchiveArtifact) => {
    const i = indexOf(item);
    if (i < 0) return;
    setReturnTo(item.id);
    driver.apex = i;
    setField(false, i);
  }, [indexOf, driver, setField]);
  const onFieldHover = useCallback((id: string | null) => {
    driver.hovered = id === null ? -1 : items.findIndex((it) => it.id === id);
    setHoveredId(id);
    run();
  }, [driver, items, run]);

  /* The vessel's tune with the seat's distance folded into its haze, kept per
     hundredth so a seat whose distance has not changed gets the same object
     and its canvas is left alone. */
  const tunes = useRef(new Map<string, VesselTune>());
  const tuneFor = useCallback((i: number, haze: number) => {
    const own = vessels[i].state.tune;
    const h = 1 - (1 - own.haze) * (1 - haze);
    const q = Math.round(h * 100);
    if (q === Math.round(own.haze * 100)) return own;
    const key = `${i}|${vessels[i].version}|${q}`;
    let t = tunes.current.get(key);
    if (!t) {
      t = { ...own, haze: q / 100 };
      tunes.current.set(key, t);
    }
    return t;
  }, [vessels]);

  const renderArtifact = useCallback((item: ArchiveArtifact, seat: ArtifactSeat) => {
    const i = indexOf(item);
    if (i < 0) return null;
    const s = vessels[i].state;
    return (
      <SeatVessel
        cacheKey={`${item.id}|${vessels[i].version}`}
        form={s.form}
        morph={s.tune.morph}
        photoUrl={s.url}
        seed={s.seed}
        tune={tuneFor(i, seat.haze ?? 0)}
        room={s.room}
        glassMode={s.mode}
        sheetMode={s.sheetMode}
        face={s.face}
        sheetSize={s.tune.sheetSize}
        focused={seat.focused}
        still={seat.still}
        // while the seats fly or the eye moves every canvas draws, since its distance is changing under it
        frameloop={driver.busy ? "always" : seat.frameloop}
        onPick={pickHandlers[i]}
      />
    );
  }, [indexOf, vessels, tuneFor, driver, pickHandlers]);

  /* Where a seat is: the curve's answer (drawn back on the near side), or —
     by its share of the field — on the arc between that and its place in the
     air. A memory with no seat on the curve surfaces from deeper instead. */
  const adjustSeat = useCallback((curve: SeatDepth, offset: number, viewport: { w: number; h: number }, item: ArchiveArtifact): SeatPlace => {
    const i = indexOf(item);
    const onCurve = adjustCurveSeat(curve, offset, viewport);
    if (i < 0) return onCurve;
    if (Math.abs(offset) < 0.5) driver.apex = i;
    const share = driver.share[i];
    const place = FIELD_PLACES[FIELD_ORDER[i]];
    const seated = carouselContainsOffset(offset) && onCurve.opacity > 0.02;
    // a memory off the curve's range stays mounted but out of sight, deep in the field it would surface from
    if (share <= 0) return seated ? onCurve : surfacingSeat(place, driver.cam, viewport);
    const to = fieldSeat(place, driver.cam, viewport, driver.hover[i]);
    const from: FieldSeat = seated
      ? { ...onCurve, haze: 0, order: onCurve.order ?? Math.round(offset * 100), depth: FIELD_FOCAL / Math.max(onCurve.scale, 1e-3) }
      : surfacingSeat(place, driver.cam, viewport);
    return blendSeat(from, to, share, viewport, VARIANT[i], driver.direction);
  }, [indexOf, driver]);

  const toggle = useCallback(() => setField(!driver.on, driver.apex), [setField, driver]);
  const chrome = useMemo(() => <FieldToggle on={fieldOn} onToggle={toggle} />, [fieldOn, toggle]);

  // re-provided on every frame of the loop (`frame` stands for the driver's state): the seats' places
  // and the field's progress live in the driver, and the gallery re-places its seats when this changes
  const override = useMemo<GalleryOverride>(() => ({
    items, renderArtifact, adjustSeat, wash: false, chrome,
    // the gallery's own arrival tints the seats cyan through its sepia + hue-rotate for 1.8 s; the glass is clear
    arrival: "plain",
    field: { on: fieldOn, progress: driver.whole, hovered: hoveredId, onHover: onFieldHover, onPick: onFieldPick },
  }), [items, renderArtifact, adjustSeat, chrome, fieldOn, hoveredId, onFieldHover, onFieldPick, driver, frame]);

  if (editing !== null) {
    const i = editing;
    const s = vessels[i].state;
    return (
      <VesselPreview
        key={items[i].id}
        initial={s}
        photos={PHOTOS}
        yaw={-s.tune.anchorAngle}
        backLabel="back to the gallery"
        onBack={() => setEditing(null)}
        onChange={(next) => setVessels((all) => {
          const cur = all[i].state;
          const same = (Object.keys(next) as (keyof VesselState)[]).every((k) => cur[k] === next[k]);
          return same ? all : all.map((v, k) => (k === i ? { state: next, version: v.version + 1 } : v));
        })}
      />
    );
  }

  return (
    <GalleryOverrideContext.Provider value={override}>
      <main style={{ position: "relative", width: "100%", height: "100dvh", overflow: "hidden", background: "#e4e4e6" }}>
        <div aria-label="memory gallery" style={{ position: "absolute", inset: 0 }}>
          <MemoryCarouselPage galleryFocusId={returnTo} galleryCarried={returnTo !== undefined} />
        </div>
      </main>
    </GalleryOverrideContext.Provider>
  );
}
