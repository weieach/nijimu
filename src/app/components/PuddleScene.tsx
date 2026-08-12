import { useEffect, useMemo, useRef, useState } from "react";
// import NewMomoryIdle from "../../imports/NewMomoryIdle"; // button hidden — cursor hint replaces it
import { LIFE_EVENTS, MemoryEvent } from "../data/memoryData";
import { loadMemories, toMemoryEvent, SavedMemory } from "../lib/memoryStore";
import { CHROME_GRAY, COLOR_PALETTE } from "../lib/colors";
import { SERIF } from "../lib/theme";
import { createPuddleSimulation, PUDDLE_TUNING, PuddleSimulation } from "../lib/puddle/simulation";
import { createRipple2dSimulation, RIPPLE2D_TUNING } from "../lib/puddle/ripple2d";
import { DIVE_TUNING, RECORD_DIVE } from "../lib/puddle/dive";
import { offerWater } from "../lib/puddle/handoff";
import { RIPPLE_CADENCE, introSchedule, dripGapMs } from "../lib/puddle/cadence";
import { BlobScene } from "./BlobScene";
import { PageHeader } from "./PageHeader";
import { PARTICLE_TEXT_KEYFRAMES, ParticleText } from "./ParticleText";
import { MODEL_PATHS } from "./SceneViewer";
import { PuddleDiveGallery, DiveGalleryItem, DivePhase } from "./PuddleDiveGallery";

/*
 * PuddleScene — WebGL2 homescreen field variants.
 *
 * texture:
 *  - 'puddle'   — watercolor / iridescent surface (B key)
 *  - 'ripple2d' — airy "rings of light" 2d texture (Z key)
 *
 * Same component API as BlobScene. Gallery morph / annotations are out of
 * scope for these variants — the pointer stirs the water instead.
 */

export type PuddleTexture = "puddle" | "ripple2d";

/* ───────── timing ─────────
   How often memories surface — the intro reveal and the idle drip — lives in
   lib/puddle/cadence.ts, driven by a single density dial so the surface stays
   equally sparse however many memories the user has saved. */
const CAPTION_LIFE_MS = RIPPLE_CADENCE.captionLifeMs;
/** The water moves first: a memory's words surface a beat after its drop lands,
    so they rise out of the spreading ripple rather than arriving with it. */
const CAPTION_REVEAL_DELAY_MS = 550;
/** Per-drop weight wobble, so no two memories land with quite the same force. */
const INTRO_WEIGHT_JITTER = 0.15;
/** Ripples visually settle in ~3–4 s with the default damping; pause a bit after. */
const SETTLE_MS = 6000;
const SETTLE_MS_REDUCED = 2000;
/** Long-press duration that commits to creating a new memory. */
const HOLD_TO_CREATE_MS = 2000;
/* Progress ring drawn around the cursor while pressing — ~135px at a laptop
   width. Sized in JS rather than a CSS clamp() because the sweep has to start
   where the label crosses the ring, and that angle depends on the diameter. */
const HOLD_RING_MIN = 150;
const HOLD_RING_MAX = 200;
const HOLD_RING_VW = 0.117;
const holdRingSize = () =>
  Math.min(HOLD_RING_MAX, Math.max(HOLD_RING_MIN, window.innerWidth * HOLD_RING_VW));
const HOLD_RING_R = 15; // in the ring's 32-unit viewBox, so the stroke scales with the size
/** ~1px at the rendered size — light enough to stay quiet, heavy enough to read. */
const HOLD_RING_STROKE = 0.05;
const HOLD_RING_CIRCUMFERENCE = 2 * Math.PI * HOLD_RING_R;
/** Once closed, the ring swells and dissolves — and only then does the flow open. */
const HOLD_RING_BLOOM_MS = 480;
/** The hand-off to the recording screen — softening only, no camera move. */
const CREATE_DIVE_MS = RECORD_DIVE.diveMs;
/** The page ground the puddle is painted on. */
const PAGE_BG = "#ededee";
/** The hint label's offset from the cursor, and the vertical center of its line box. */
const HINT_OFFSET_X = 14;
const HINT_OFFSET_Y = 16;
const HINT_FONT_SIZE = 12;
const HINT_LINE_HEIGHT = 1.5;
const HINT_LABEL_CENTER_Y = HINT_OFFSET_Y + (HINT_FONT_SIZE * HINT_LINE_HEIGHT) / 2;
/** Clearance around the label where the ring is masked away, and how soft that edge is. */
const HINT_KNOCKOUT_PAD = 5;
const HINT_KNOCKOUT_FEATHER = 0.7; // viewBox units
/* ───────── how deep each thing presses ─────────
   Every depth below is a multiple of the tuning's base drop strength, and the
   ordering is the point: a hand pressed into the water outweighs a memory
   falling into it, which in turn outweighs a cursor merely dragging across it.
   A click is a single drop; only a held press opens the cavity that sheds
   many rings.

     cursor trail  0.08  ·  stroke ends  0.14     (addStir, inside the sims)
     click / tap   TAP_DEPTH
     memory drop   MEMORY_DEPTH × the memory's own scale
     press start   PRESS_DEPTH  (+ breathing cavity)
     press commit  COMMIT_DEPTH */
/** Extra depth on every memory drop, over the tuned base strength. */
const MEMORY_DEPTH = 1.5;
/** A click — one quiet ring, near a memory's weight. Never the press flurry. */
const TAP_DEPTH = MEMORY_DEPTH * 0.85;
const TAP_RADIUS_SCALE = 1.0;
/** The hold's opening drop — deeper than a memory, shy of the old rain-maker. */
const PRESS_DEPTH = MEMORY_DEPTH * 1.45;
const PRESS_RADIUS_SCALE = 1.05;
/** The single deepest event in the app: the press committing to a new memory. */
const COMMIT_DEPTH = MEMORY_DEPTH * 3.6;
const COMMIT_RADIUS_SCALE = 1.5;
/** Grace period before a press opens the sustained cavity — a tap never does. */
const PRESS_CAVITY_DELAY_MS = 220;

/* A pointer stroke reads like a finger dragged through water: a shallow
   trail, pressed a little deeper where it enters and where it lifts out. */
/** Pixels of travel between trail stirs — near the original continuous feel. */
export const STIR_SPACING_PX = 14;
/** A pause this long makes the next movement a fresh stroke (finger re-enters). */
export const STROKE_IDLE_MS = 260;
/** No movement for this long = the finger lifted; press the end of the stroke. */
export const STROKE_END_MS = 160;
/** Depth of the entry/exit stirs, relative to the trail's 1 — a hint, not a drop. */
export const STROKE_END_DEPTH = 1.8;

/* ───────── memory → drop anchors ───────── */

interface DropAnchor {
  x: number; // uv, 0..1
  y: number; // uv, 0..1, y up (GL convention)
  colorIndex: number;
  /** Multiplier on drop radius/strength; the newest saved memory lands largest. */
  scale: number;
  year: string;
  event: string;
  /** Position in the intro sequence (oldest memory falls first). */
  introIndex: number;
}

// Deterministic per-memory layout so a memory keeps its spot across visits.
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ───────── caption crowding ─────────
   A caption is a wide, short block of text centered on its anchor, so two
   memories can sit far enough apart to ripple independently and still collide
   as words. After the deterministic scatter, the layout is relaxed until every
   pair of caption boxes clears the other. */

/** The uv box anchors live in — the scatter's range, and the relaxation's walls. */
const FIELD_X: [number, number] = [0.1, 0.9];
const FIELD_Y: [number, number] = [0.14, 0.82];
/** Average serif advance as a fraction of the font size — a cheap width estimate. */
const CAPTION_ADVANCE = 0.5;
/** Cap on the event title's line length (matches maxWidth: Nch on the caption). */
const CAPTION_MAX_CH = 14;
/** Clearance kept between two caption boxes, in px. */
const CAPTION_GAP_X = 30;
const CAPTION_GAP_Y = 26;
const CAPTION_RELAX_PASSES = 80;
/** Sub-pixel overlap counts as clear, so the solver settles instead of jittering. */
const CAPTION_RELAX_EPS = 0.5;

const clampTo = (v: number, [lo, hi]: [number, number]) => Math.min(Math.max(v, lo), hi);

/** Half-extents of a caption's text block, in px. */
function captionHalfSize(event: string, vw: number): { w: number; h: number } {
  // both lines track the responsive clamps the caption markup below uses
  const eventPx = Math.min(13, Math.max(9, vw * 0.012));
  const yearPx = Math.min(10, Math.max(8, vw * 0.009));
  const lines = event.split("\n");
  const chars = Math.min(
    CAPTION_MAX_CH,
    lines.reduce((m, l) => Math.max(m, l.length), 0),
  );
  const wrappedLines = lines.reduce(
    (sum, l) => sum + Math.max(1, Math.ceil(l.length / CAPTION_MAX_CH)),
    0,
  );
  return {
    w: (chars * eventPx * CAPTION_ADVANCE) / 2,
    h: (wrappedLines * eventPx * 1.5 + yearPx * 1.5 + 3) / 2,
  };
}

/** Push overlapping captions apart, along whichever axis needs the least travel. */
function relaxAnchors(anchors: DropAnchor[], vw: number, vh: number): void {
  const half = anchors.map((a) => captionHalfSize(a.event, vw));
  for (let pass = 0; pass < CAPTION_RELAX_PASSES; pass++) {
    let settled = true;
    for (let i = 0; i < anchors.length; i++) {
      for (let j = i + 1; j < anchors.length; j++) {
        const a = anchors[i];
        const b = anchors[j];
        const overX = half[i].w + half[j].w + CAPTION_GAP_X - Math.abs((a.x - b.x) * vw);
        const overY = half[i].h + half[j].h + CAPTION_GAP_Y - Math.abs((a.y - b.y) * vh);
        if (overX <= CAPTION_RELAX_EPS || overY <= CAPTION_RELAX_EPS) continue; // already clear
        settled = false;
        // wide blocks almost always part vertically — the cheaper axis by far
        if (overY <= overX) {
          const push = overY / 2 / vh;
          const dir = a.y >= b.y ? 1 : -1;
          a.y = clampTo(a.y + dir * push, FIELD_Y);
          b.y = clampTo(b.y - dir * push, FIELD_Y);
        } else {
          const push = overX / 2 / vw;
          const dir = a.x >= b.x ? 1 : -1;
          a.x = clampTo(a.x + dir * push, FIELD_X);
          b.x = clampTo(b.x - dir * push, FIELD_X);
        }
      }
    }
    if (settled) break;
  }
}

function computeAnchors(
  events: MemoryEvent[],
  savedCount: number,
  vw: number,
  vh: number,
): DropAnchor[] {
  const anchors = events.map((e, i) => {
    const rand = mulberry32(hashString(`${e.id}|${e.year}|${e.event}`));
    const isNewestSaved = savedCount > 0 && i === events.length - 1;
    return {
      x: FIELD_X[0] + rand() * (FIELD_X[1] - FIELD_X[0]),
      y: FIELD_Y[0] + rand() * (FIELD_Y[1] - FIELD_Y[0]),
      colorIndex: e.color,
      scale: isNewestSaved ? 1.6 : 0.8 + rand() * 0.45,
      year: e.year,
      event: e.event,
      introIndex: 0,
    };
  });
  relaxAnchors(anchors, vw, vh);
  // oldest memory falls first; ties keep list order, so saved memories land last
  [...anchors]
    .map((a, i) => i)
    .sort((p, q) => (parseInt(anchors[p].year) || 0) - (parseInt(anchors[q].year) || 0) || p - q)
    .forEach((anchorIdx, order) => {
      anchors[anchorIdx].introIndex = order;
    });
  return anchors;
}

/* ───────── color: palette hex → saturated dye rgb ───────── */

function dyeColorFor(colorIndex: number): [number, number, number] {
  const hex = COLOR_PALETTE[colorIndex % COLOR_PALETTE.length].color;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  // The palette is muted by design; push saturation so the dye reads as color
  // in the near-black water (the iridescence ramp supplies the rest).
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const boost = 3.0;
  const saturate = (c: number) => Math.min(Math.max(lum + (c - lum) * boost, 0), 1);
  // normalize brightness so dark palette entries (e.g. "night") still glow
  const sr = saturate(r), sg = saturate(g), sb = saturate(b);
  const maxC = Math.max(sr, sg, sb, 0.001);
  const gain = 0.85 / maxC;
  return [sr * gain, sg * gain, sb * gain];
}

/* ═══════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════ */

export function PuddleScene({
  onNewMemory,
  hideAnnotations = false,
  texture = "puddle",
  diveGalleryEnabled = false,
  galleryOpen = false,
  onGalleryExit,
}: {
  /** Receives the uv point the descent ended on, so the next screen can surface there. */
  onNewMemory?: (focus?: [number, number]) => void;
  hideAnnotations?: boolean;
  /** Which sim/render module to drive the canvas. */
  texture?: PuddleTexture;
  /** Flagged 'dive' gallery variant: G on the puddle homescreen dives through the surface. */
  diveGalleryEnabled?: boolean;
  /** Externally-driven open/close (the homescreen G shortcut). */
  galleryOpen?: boolean;
  /** Fired when the gallery starts surfacing, so the G toggle stays in sync. */
  onGalleryExit?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const [reducedMotionPref] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  /** Captions alive right now — one per landed drop, removed as its ripple dies. */
  const [captions, setCaptions] = useState<{ anchorIdx: number; key: number }[]>([]);
  const captionKey = useRef(0);

  /** Cursor hint: "hold to create memory", trailing the pointer. */
  const [hintReady, setHintReady] = useState(false);
  /** True while a create-press is held — a progress ring draws around the cursor. */
  const [pressing, setPressing] = useState(false);
  /** The closed ring, swelling away after the press committed. */
  const [ringBloom, setRingBloom] = useState(false);
  /** The press committed: the camera is sinking into the water toward recording. */
  const [descending, setDescending] = useState(false);
  const [ringSize, setRingSize] = useState(holdRingSize);
  const hintRef = useRef<HTMLDivElement>(null);
  const lastPointer = useRef<[number, number] | null>(null);
  const onNewMemoryRef = useRef(onNewMemory);
  onNewMemoryRef.current = onNewMemory;

  useEffect(() => {
    const t = setTimeout(() => setHintReady(true), 2000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const onResize = () => setRingSize(holdRingSize());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* Where the label's line crosses the ring, as a clockwise angle from 3
     o'clock — an SVG circle's path starts there, so rotating by it puts the
     start of the sweep under the first words the label tucks behind. */
  const ringStartDeg = useMemo(() => {
    const r = ringSize / 2;
    const dx = Math.sqrt(Math.max(r * r - HINT_LABEL_CENTER_Y * HINT_LABEL_CENTER_Y, 1));
    return (Math.atan2(HINT_LABEL_CENTER_Y, dx) * 180) / Math.PI;
  }, [ringSize]);

  /* The label's band, in the ring's viewBox units, so the stroke can be masked
     out where the words sit — a knockout rather than a patch of page color,
     which would sit as a flat chip on top of the moving water. */
  const ringKnockout = useMemo(() => {
    const units = 32 / ringSize;
    const x = 16 + (HINT_OFFSET_X - HINT_KNOCKOUT_PAD) * units;
    return {
      x,
      y: 16 + (HINT_OFFSET_Y - HINT_KNOCKOUT_PAD) * units,
      width: Math.max(32 - x, 0),
      height: (HINT_FONT_SIZE * HINT_LINE_HEIGHT + HINT_KNOCKOUT_PAD * 2) * units,
    };
  }, [ringSize]);

  // If the pointer moved before the hint faded in, start it where the cursor is.
  useEffect(() => {
    if (hintReady && hintRef.current && lastPointer.current) {
      const [px, py] = lastPointer.current;
      hintRef.current.style.transform = `translate(${px}px, ${py}px)`;
    }
  }, [hintReady]);

  const [savedMemories] = useState<SavedMemory[]>(() => loadMemories());
  const events = useMemo(
    () => [...LIFE_EVENTS, ...savedMemories.map(toMemoryEvent)],
    [savedMemories],
  );
  /* Viewport is read once, at mount: caption spacing depends on it, but a
     resize must not teleport memories that have already surfaced. */
  const anchors = useMemo(
    () => computeAnchors(events, savedMemories.length, window.innerWidth, window.innerHeight),
    [events, savedMemories.length],
  );

  /* ─── dive gallery (flagged variant) ─── */
  /** idle → diving → gallery → surfacing → idle. Anything non-idle mounts the overlay. */
  const [divePhase, setDivePhase] = useState<"idle" | DivePhase>("idle");
  const [galleryIdx, setGalleryIdx] = useState(0);
  /** Sim-side controls, assigned inside the main effect (the sim must outlive the gallery). */
  const diveControlsRef = useRef<{
    open(itemIdx: number): void;
    close(): void;
    ripple(itemIdx: number): void;
  } | null>(null);

  /* One artifact per memory, newest (left) → oldest (right) — same content
     and order as the morph gallery so the A/B compares presentation only.
     Saved memories replay the shape the user sculpted; curated LIFE_EVENTS
     get a deterministic seeded one so an artifact is stable across visits. */
  const galleryItems = useMemo<DiveGalleryItem[]>(() => {
    const items = events.map((e, i) => {
      const saved = i >= LIFE_EVENTS.length ? savedMemories[i - LIFE_EVENTS.length] : undefined;
      const rand = mulberry32(hashString(`shape|${e.id}|${e.year}|${e.event}`));
      return {
        eventIdx: i,
        year: e.year,
        event: e.event,
        anchor: { x: anchors[i].x, y: anchors[i].y },
        colorIndex: e.color % COLOR_PALETTE.length,
        shape: saved
          ? {
              modelPath: saved.shape.modelPath,
              fluidity: saved.shape.fluidity,
              evolve: saved.shape.evolve,
              bumpAmount: saved.shape.bumpAmount,
            }
          : {
              modelPath: MODEL_PATHS[Math.floor(rand() * MODEL_PATHS.length)],
              fluidity: rand() * 0.5 + 0.5,
              evolve: rand() * 0.5 + 0.5,
              bumpAmount: i % 2 === 0 ? rand() * 0.03 : 0.03 + rand() * 0.12,
            },
      };
    });
    return items.sort((a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0));
  }, [events, anchors, savedMemories]);

  // Refs so the main sim effect (keyed by anchors/texture only) sees fresh
  // values without re-running — re-running would rebuild the sim and erase
  // the accumulated dye/height state.
  const galleryItemsRef = useRef(galleryItems);
  galleryItemsRef.current = galleryItems;
  const onGalleryExitRef = useRef(onGalleryExit);
  onGalleryExitRef.current = onGalleryExit;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const tuning = texture === "ripple2d" ? RIPPLE2D_TUNING : PUDDLE_TUNING;
    const sim =
      texture === "ripple2d"
        ? createRipple2dSimulation(canvas, RIPPLE2D_TUNING)
        : createPuddleSimulation(canvas, PUDDLE_TUNING);
    if (!sim) {
      setFailed(true);
      return;
    }
    sim.resize();

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const settleMs = reducedMotion ? SETTLE_MS_REDUCED : SETTLE_MS;

    /* ─── dive gallery camera (flagged variant; puddle texture only) ───
       The descent is a per-frame camera state fed to the sim's dive pass.
       The height/dye FBOs are never touched — the memories survive. */
    // only the puddle sim implements the dive pass (texture decides which factory ran)
    const diveSim: PuddleSimulation | null =
      texture === "ripple2d" ? null : (sim as PuddleSimulation);
    const dive = {
      target: 0,
      progress: 0,
      durMs: DIVE_TUNING.diveMs,
      /** 0 under prefers-reduced-motion — cross-fade, no dolly. */
      zoomScale: 1,
      focus: [0.5, 0.5] as [number, number],
      focusTarget: [0.5, 0.5] as [number, number],
      /** 'gallery' surfaces again; 'create' hands the descent to the recording screen. */
      mode: "gallery" as "gallery" | "create",
    };
    /** Set when the create descent lands: the water is passed on, not disposed. */
    let handOffWater = false;

    /** Diving, in the gallery, or surfacing — anything but the plain surface. */
    const underwater = () => dive.target === 1 || dive.progress > 0;

    /** Advance the descent by dtMs. Returns true while anything is in motion. */
    const stepDive = (dtMs: number): boolean => {
      if (!diveSim) return false;
      let busy = false;
      if (dive.progress !== dive.target) {
        busy = true;
        const delta = dtMs / Math.max(dive.durMs, 1);
        dive.progress =
          dive.target === 1
            ? Math.min(1, dive.progress + delta)
            : Math.max(0, dive.progress - delta);
        if (dive.mode === "create") {
          // the water has closed over the viewer — the recording screen picks
          // both the camera and the living water up from here (see PuddleBackdrop)
          if (dive.progress === 1) {
            handOffWater = true;
            onNewMemoryRef.current?.([dive.focus[0], dive.focus[1]]);
          }
        } else {
          if (dive.progress === 1) setDivePhase("gallery");
          if (dive.progress === 0) setDivePhase("idle");
        }
      }
      // the focus glides toward the active memory's point (arrows move it)
      if (dive.progress > 0) {
        const k = 1 - Math.exp(-2.2 * (dtMs / 1000));
        const dx = dive.focusTarget[0] - dive.focus[0];
        const dy = dive.focusTarget[1] - dive.focus[1];
        if (Math.abs(dx) + Math.abs(dy) > 0.0004) {
          dive.focus[0] += dx * k;
          dive.focus[1] += dy * k;
          busy = true;
        }
        const e = DIVE_TUNING.ease(dive.progress);
        // the recording hand-off keeps the water still and only hazes it
        const cam = dive.mode === "create" ? RECORD_DIVE : DIVE_TUNING;
        diveSim.setDive({
          x: dive.focus[0],
          y: dive.focus[1],
          zoom: cam.zoom * e * dive.zoomScale,
          // defocus arrives a touch after the dolly commits, so it reads as
          // depth of field, not the image dissolving
          blur: cam.blur * Math.pow(e, 1.5),
          wash: cam.wash * e,
        });
      } else {
        diveSim.setDive(null);
      }
      return busy;
    };

    /* ─── loop: run while disturbed, park on a static frame once settled ─── */
    let raf = 0;
    let running = false;
    let lastTime = 0;
    let lastActivity = performance.now();

    const tick = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;
      if (stepDive(dt)) lastActivity = now;
      // behind the blur the water keeps living, slowed — never frozen, never wiped
      const timeScale = 1 + (DIVE_TUNING.gallerySimTimeScale - 1) * dive.progress;
      sim.step(dt * timeScale);
      sim.render(now / 1000);
      if (now - lastActivity > settleMs) {
        running = false; // surface settled — stop stepping entirely
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    const wake = () => {
      lastActivity = performance.now();
      if (!running && !document.hidden) {
        running = true;
        lastTime = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };

    /* ─── drops (each landed drop also raises its caption for one ripple-life) ─── */
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    const showCaption = (anchorIdx: number, delayMs = 0) => {
      const raise = () => {
        const key = ++captionKey.current;
        setCaptions((cs) => [...cs.filter((c) => c.anchorIdx !== anchorIdx), { anchorIdx, key }]);
        timeouts.push(
          setTimeout(() => {
            setCaptions((cs) => cs.filter((c) => c.key !== key));
          }, CAPTION_LIFE_MS),
        );
      };
      if (delayMs > 0) timeouts.push(setTimeout(raise, delayMs));
      else raise();
    };

    const dropAnchor = (idx: number, strengthScale = 1) => {
      const a = anchors[idx];
      sim.addDrop(
        a.x,
        a.y,
        a.scale,
        reducedMotion ? 0 : tuning.dropStrength * a.scale * strengthScale * MEMORY_DEPTH,
        dyeColorFor(a.colorIndex),
        a.scale * strengthScale,
      );
      // reduced motion has no ripple to follow, so the words come straight away
      showCaption(idx, reducedMotion ? 0 : CAPTION_REVEAL_DELAY_MS);
      wake();
    };

    /* intro: every memory falls in, oldest first; newest saved lands last.
       The schedule comes from the cadence module — it holds the surface to a
       fixed density, so more memories mean a longer reveal, not a busier one. */
    const introOrder = anchors
      .map((_, i) => i)
      .sort((p, q) => anchors[p].introIndex - anchors[q].introIndex);
    const intro = introSchedule(introOrder.length);

    if (reducedMotion) {
      // No wave animation: pre-splat all dye, bleed it, show a settled still.
      for (const a of anchors) {
        sim.addDrop(a.x, a.y, a.scale * 1.3, 0, dyeColorFor(a.colorIndex), a.scale);
      }
      sim.runDyeSettle(120);
      sim.render(0);
    } else {
      introOrder.forEach((anchorIdx, order) => {
        const weight = 1 + (Math.random() * 2 - 1) * INTRO_WEIGHT_JITTER;
        timeouts.push(setTimeout(() => dropAnchor(anchorIdx, weight), intro.times[order]));
      });
    }

    /* idle drip: re-seed a random memory so the surface never fully dies.
       Suspended while underwater — the gallery's water is a backdrop the user
       came from, and it is restored on the way up, so a drip there would
       either be undone or, worse, seen arriving. */
    let dripTimer: ReturnType<typeof setTimeout> | undefined;
    let lastDripIdx = -1;
    const scheduleDrip = () => {
      dripTimer = setTimeout(() => {
        if (!document.hidden && !reducedMotion && anchors.length > 0 && !underwater()) {
          // never the same memory twice running — the field should feel wandered
          let idx = Math.floor(Math.random() * anchors.length);
          if (idx === lastDripIdx && anchors.length > 1) idx = (idx + 1) % anchors.length;
          lastDripIdx = idx;
          dropAnchor(idx, 0.45 + Math.random() * 0.3);
        }
        scheduleDrip();
      }, dripGapMs());
    };
    if (!reducedMotion) {
      timeouts.push(setTimeout(scheduleDrip, intro.endMs));
    }

    /* ─── pointer: stir (colorless) on move, drop on tap ─── */
    const toUv = (e: PointerEvent): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      return [(e.clientX - rect.left) / rect.width, 1 - (e.clientY - rect.top) / rect.height];
    };

    let lastStir: [number, number] | null = null;
    let lastStirAt = 0;
    let strokeEndTimer: ReturnType<typeof setTimeout> | undefined;
    const onPointerMove = (e: PointerEvent) => {
      // the hint dot trails the cursor (cheap: style mutation, no re-render)
      const rect0 = canvas.getBoundingClientRect();
      const hx = e.clientX - rect0.left;
      const hy = e.clientY - rect0.top;
      lastPointer.current = [hx, hy];
      if (hintRef.current) {
        hintRef.current.style.transform = `translate(${hx}px, ${hy}px)`;
      }
      if (underwater()) return; // the gallery owns the pointer
      if (reducedMotion) return;
      const [x, y] = toUv(e);
      if (pressUv) {
        pressUv = [x, y]; // the held cavity follows the pointer
        if (pressEngaged) sim.setPress(x, y);
      }
      if (lastStir) {
        const rect = canvas.getBoundingClientRect();
        const dx = (x - lastStir[0]) * rect.width;
        const dy = (y - lastStir[1]) * rect.height;
        if (dx * dx + dy * dy < STIR_SPACING_PX * STIR_SPACING_PX) return;
      }
      // a finger dragged through water: pressed in where the stroke begins,
      // a shallow trail while it travels…
      const now = performance.now();
      const strokeStart = now - lastStirAt > STROKE_IDLE_MS;
      lastStir = [x, y];
      lastStirAt = now;
      sim.addStir(x, y, strokeStart ? STROKE_END_DEPTH : 1); // stirs, never paints
      // …and pressed in again where it lifts out
      if (strokeEndTimer !== undefined) clearTimeout(strokeEndTimer);
      strokeEndTimer = setTimeout(() => {
        strokeEndTimer = undefined;
        if (lastStir && !underwater()) {
          sim.addStir(lastStir[0], lastStir[1], STROKE_END_DEPTH);
          wake();
        }
      }, STROKE_END_MS);
      wake();
    };

    /* long-press to create: the held pointer keeps a sustained cavity in the
       water (like a heavy object resting there); the cavity breathes slowly
       and sheds rings from its rim. After HOLD_TO_CREATE_MS the press commits
       and the recording flow opens. Releasing early just lets the water
       rebound. */
    let navigating = false;
    let pressTimer: ReturnType<typeof setTimeout> | undefined;
    let cavityTimer: ReturnType<typeof setTimeout> | undefined;
    let pressUv: [number, number] | null = null;
    let pressEngaged = false;
    /** The tap waiting on the pointer to lift; dropped if the press outlives a click. */
    let pendingTap: {
      x: number;
      y: number;
      dye: [number, number, number] | null;
      anchorIdx: number;
      downAt: number;
    } | null = null;

    const endPress = () => {
      if (pressTimer !== undefined) {
        clearTimeout(pressTimer);
        pressTimer = undefined;
      }
      if (cavityTimer !== undefined) {
        clearTimeout(cavityTimer);
        cavityTimer = undefined;
      }
      pressUv = null;
      pressEngaged = false;
      sim.clearPress();
      setPressing(false);
    };

    /* A tap: the splash, and — near an anchor — that memory's dye and caption.
       Held back until the pointer lifts, so a press that is on its way to
       creating a memory never also wakes the memory it started on. */
    const fireTap = (tap: {
      x: number;
      y: number;
      dye: [number, number, number] | null;
      anchorIdx: number;
    }) => {
      const { x, y, dye, anchorIdx } = tap;
      if (reducedMotion) {
        if (dye) {
          sim.addDrop(x, y, 1, 0, dye, 0.8); // dye crossfades in, no ripple
          showCaption(anchorIdx);
          wake();
        }
        return;
      }
      // one quiet ring for the wave, normal footprint for the dye, so the
      // color blot stays the size of a memory drop — the press flurry is
      // reserved for a hold that opens the cavity
      sim.addDrop(x, y, TAP_RADIUS_SCALE, tuning.dropStrength * TAP_DEPTH, null, 0);
      if (dye) sim.addDrop(x, y, 1, 0, dye, 0.9);
      if (anchorIdx >= 0) showCaption(anchorIdx);
      wake();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (underwater()) return;
      // park the hint on the press point so the ring lands under the cursor even
      // when the pointer never moved after the label faded in
      const rect0 = canvas.getBoundingClientRect();
      const hx = e.clientX - rect0.left;
      const hy = e.clientY - rect0.top;
      lastPointer.current = [hx, hy];
      if (hintRef.current) {
        hintRef.current.style.transform = `translate(${hx}px, ${hy}px)`;
      }
      const [x, y] = toUv(e);
      // near a memory's anchor → that memory's color; open water → clear ring
      const aspect = canvas.clientWidth / Math.max(canvas.clientHeight, 1);
      let nearestIdx = -1;
      let nearestD = Infinity;
      anchors.forEach((a, i) => {
        const dx = (a.x - x) * aspect;
        const dy = a.y - y;
        const d = dx * dx + dy * dy;
        if (d < nearestD) {
          nearestD = d;
          nearestIdx = i;
        }
      });
      const nearMemory = nearestIdx >= 0 && nearestD < 0.12 * 0.12;
      const tap = {
        x,
        y,
        dye: nearMemory ? dyeColorFor(anchors[nearestIdx].colorIndex) : null,
        anchorIdx: nearMemory ? nearestIdx : -1,
        downAt: performance.now(),
      };

      // no long press to wait on — the tap lands right away
      if (!onNewMemoryRef.current || navigating) {
        fireTap(tap);
        return;
      }
      endPress();
      pendingTap = tap;
      pressUv = [x, y];
      if (!reducedMotion) {
        cavityTimer = setTimeout(() => {
          cavityTimer = undefined;
          pressEngaged = true;
          const at = pressUv ?? [x, y];
          // the hold begins: one firm drop, then the cavity breathes a few more
          sim.addDrop(at[0], at[1], PRESS_RADIUS_SCALE, tuning.dropStrength * PRESS_DEPTH, null, 0);
          sim.setPress(at[0], at[1]);
          wake();
        }, PRESS_CAVITY_DELAY_MS);
      }
      setPressing(true);
      pressTimer = setTimeout(() => {
        const at = pressUv ?? [x, y];
        endPress();
        pendingTap = null; // this press became a new memory, not a visit to an old one
        navigating = true;
        setRingBloom(true); // the closed ring swells away before the flow opens
        if (!reducedMotion) {
          // one deeper drop as the press commits, then into the flow
          sim.addDrop(at[0], at[1], COMMIT_RADIUS_SCALE, tuning.dropStrength * COMMIT_DEPTH, null, 0);
          wake();
        }
        if (diveSim && !reducedMotion) {
          /* …and the camera follows that drop down. The ring blooms as the
             water pulls in, and the recording screen surfaces from the depth
             this descent ends on, so the two screens read as one move. */
          setDescending(true);
          dive.mode = "create";
          dive.target = 1;
          dive.zoomScale = 1;
          dive.durMs = CREATE_DIVE_MS;
          dive.focus = [at[0], at[1]];
          dive.focusTarget = [at[0], at[1]];
          wake();
        } else {
          timeouts.push(
            setTimeout(() => onNewMemoryRef.current?.([at[0], at[1]]), HOLD_RING_BLOOM_MS),
          );
        }
      }, HOLD_TO_CREATE_MS);
    };

    /* ─── dive gallery controls (assigned to the ref so React-side effects
       and the overlay can drive the sim without re-running this effect) ─── */
    const openDive = (itemIdx: number) => {
      if (!diveSim || dive.target === 1) return;
      const item = galleryItemsRef.current[itemIdx];
      if (!item) return;
      endPress();
      // a fresh descent remembers the surface exactly as it stands, so closing
      // the gallery can hand it back untouched
      if (dive.progress === 0) diveSim.captureState();
      setGalleryIdx(itemIdx);
      setDivePhase("diving");
      dive.target = 1;
      dive.zoomScale = reducedMotion ? 0 : 1; // reduced motion: cross-fade, no dolly
      dive.durMs = reducedMotion ? DIVE_TUNING.reducedMs : DIVE_TUNING.diveMs;
      dive.focusTarget = [item.anchor.x, item.anchor.y];
      // fresh descent: push toward the tapped point from the start
      if (dive.progress === 0) dive.focus = [item.anchor.x, item.anchor.y];
      wake();
    };

    const closeDive = () => {
      if (dive.target === 0) return;
      setDivePhase("surfacing");
      dive.target = 0;
      dive.durMs = reducedMotion ? DIVE_TUNING.reducedMs : DIVE_TUNING.surfaceMs;
      // hand the water back its pre-dive state now, while the wash and defocus
      // are still at full depth — the swap itself is never seen
      diveSim?.restoreState();
      wake();
      onGalleryExitRef.current?.(); // keep the homescreen G toggle in sync
    };

    const rippleTo = (itemIdx: number) => {
      const item = galleryItemsRef.current[itemIdx];
      if (!item) return;
      // the water reacts behind the blur, but colorlessly: browsing must not
      // paint the puddle. The memory's color goes to the artifact's own
      // background wash instead (see PuddleDiveGallery), and whatever the ring
      // stirs is handed back when the gallery closes.
      if (!reducedMotion) {
        sim.addDrop(
          item.anchor.x,
          item.anchor.y,
          1.4,
          tuning.dropStrength * DIVE_TUNING.arrowRippleStrength,
          null,
          0,
        );
      }
      dive.focusTarget = [item.anchor.x, item.anchor.y]; // the camera drifts with it
      wake();
    };

    diveControlsRef.current = { open: openDive, close: closeDive, ripple: rippleTo };

    /* Only a click wakes a memory: past the cavity's grace period the gesture
       has become a press toward a new memory, and abandoning it half-drawn
       should leave the water as it was. */
    const onPointerUp = () => {
      const tap = pendingTap;
      pendingTap = null;
      endPress();
      if (tap && performance.now() - tap.downAt <= PRESS_CAVITY_DELAY_MS) fireTap(tap);
    };

    /** Left the canvas or the gesture was taken away — the tap is abandoned. */
    const onPointerAbort = () => {
      pendingTap = null;
      endPress();
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerAbort);
    canvas.addEventListener("pointerleave", onPointerAbort);

    /* ─── visibility + resize ─── */
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        running = false;
      } else {
        wake();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onResize = () => {
      sim.resize();
      if (!running) sim.render(performance.now() / 1000); // keep the parked frame crisp
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      running = false;
      endPress();
      diveControlsRef.current = null;
      for (const t of timeouts) clearTimeout(t);
      if (dripTimer !== undefined) clearTimeout(dripTimer);
      if (strokeEndTimer !== undefined) clearTimeout(strokeEndTimer);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerAbort);
      canvas.removeEventListener("pointerleave", onPointerAbort);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
      // the ripples in flight ride the canvas across the route change
      if (handOffWater && diveSim) offerWater({ canvas, sim: diveSim });
      else sim.dispose();
    };
  }, [anchors, texture]);

  /* homescreen G shortcut / flag changes: open on the newest memory, close on toggle-off */
  useEffect(() => {
    if (galleryOpen && diveGalleryEnabled) diveControlsRef.current?.open(0);
    else diveControlsRef.current?.close(); // no-op when already surfaced
  }, [galleryOpen, diveGalleryEnabled]);

  // WebGL2 / float targets unavailable — quietly fall back to the blob field.
  if (failed) {
    return <BlobScene onNewMemory={onNewMemory} hideAnnotations={hideAnnotations} />;
  }

  /** Underwater (a descent of either kind): the homescreen chrome dissolves away. */
  const chromeHidden = divePhase !== "idle" || descending;
  /** Wordmark stays once the dive gallery settles; it only leaves during transit. */
  const wordmarkHidden =
    descending || divePhase === "diving" || divePhase === "surfacing";

  return (
    <div
      className="relative w-full h-screen overflow-hidden select-none"
      style={{ background: PAGE_BG }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ display: "block", touchAction: "none" }}
      />

      {/* ═══ MEMORY CAPTIONS — live with their ripple: focus in from particles,
             hold, dissolve as the water stills ═══ */}
      {!hideAnnotations && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ zIndex: 19, opacity: chromeHidden ? 0 : 1, transition: "opacity 0.5s ease" }}
        >
          {captions.map((c) => {
            const a = anchors[c.anchorIdx];
            if (!a) return null;
            return (
              <div
                key={c.key}
                className="absolute"
                style={{
                  left: `${a.x * 100}%`,
                  top: `${(1 - a.y) * 100}%`,
                  transform: "translate(-50%, -50%)",
                  textAlign: "center",
                  color: "#4a4a4a",
                  textShadow: "0 0 10px rgba(237,237,238,0.65)",
                  maxWidth: `${CAPTION_MAX_CH}ch`,
                  animation: reducedMotionPref
                    ? "none"
                    : `puddleCaptionLife ${CAPTION_LIFE_MS}ms ease forwards`,
                }}
              >
                <div
                  style={{
                    fontFamily: SERIF,
                    fontSize: "clamp(8px, 0.9vw, 10px)",
                    opacity: 0.75,
                    letterSpacing: "0.06em",
                    marginBottom: 3,
                  }}
                >
                  <ParticleText text={a.year} seed={c.key * 31 + 7} animate={!reducedMotionPref} />
                </div>
                <div
                  style={{
                    fontFamily: SERIF,
                    fontSize: "clamp(9px, 1.2vw, 13px)",
                    opacity: 0.95,
                    lineHeight: 1.5,
                  }}
                >
                  <ParticleText
                    text={a.event}
                    seed={c.key * 131 + 17}
                    animate={!reducedMotionPref}
                    wrap
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ CURSOR HINT — a line trailing the pointer, inviting a new
             memory; fades in like the captions, 2s after load ═══ */}
      {onNewMemory && hintReady && (!chromeHidden || ringBloom) && (
        <div
          ref={hintRef}
          className="absolute pointer-events-none"
          style={{
            left: 0,
            top: 0,
            zIndex: 24,
            transform: "translate(-200px, -200px)", // offscreen until the pointer moves
            animation: reducedMotionPref ? "none" : "puddleHintIn 1.1s ease backwards",
          }}
        >
          {/* the press fills a ring around the cursor; closed = committed. It
              sits under the label, and starts drawing where the label crosses it. */}
          {(pressing || ringBloom) && (
            <svg
              width={ringSize}
              height={ringSize}
              viewBox="0 0 32 32"
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                display: "block",
                transform: "translate(-50%, -50%)",
                animation: ringBloom
                  ? `${
                      reducedMotionPref ? "puddleHoldRingFade" : "puddleHoldRingBloom"
                    } ${HOLD_RING_BLOOM_MS}ms ease-out forwards`
                  : "none",
              }}
            >
              <defs>
                <filter id="puddleHoldRingFeather">
                  <feGaussianBlur stdDeviation={HINT_KNOCKOUT_FEATHER} />
                </filter>
                <mask id="puddleHoldRingMask" maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
                  <rect x="0" y="0" width="32" height="32" fill="#fff" />
                  <rect
                    x={ringKnockout.x}
                    y={ringKnockout.y}
                    width={ringKnockout.width}
                    height={ringKnockout.height}
                    fill="#000"
                    filter="url(#puddleHoldRingFeather)"
                  />
                </mask>
              </defs>
              {/* the mask lives on the group: a transform on the masked element
                  itself would rotate the knockout away from the label too */}
              <g mask="url(#puddleHoldRingMask)">
                <circle
                  cx="16"
                  cy="16"
                  r={HOLD_RING_R}
                  fill="none"
                  stroke={CHROME_GRAY}
                  strokeOpacity={0.85}
                  strokeWidth={HOLD_RING_STROKE}
                  strokeDasharray={HOLD_RING_CIRCUMFERENCE}
                  strokeDashoffset={ringBloom ? 0 : HOLD_RING_CIRCUMFERENCE}
                  transform={`rotate(${ringStartDeg} 16 16)`}
                  style={{
                    /* fade the element (not stroke-opacity — SVG attrs fight that) */
                    animation: ringBloom
                      ? "none"
                      : `puddleHoldRing ${HOLD_TO_CREATE_MS}ms linear forwards`,
                  }}
                />
              </g>
            </svg>
          )}
          <div
            style={{
              position: "relative", // above the ring, which the label tucks over
              display: "flex",
              alignItems: "center",
              transform: `translate(${HINT_OFFSET_X}px, ${HINT_OFFSET_Y}px)`,
              // the label is chrome: it leaves as the descent starts, the ring stays
              opacity: chromeHidden ? 0 : 1,
              transition: "opacity 0.35s ease",
            }}
          >
            <span
              style={{
                fontFamily: SERIF,
                fontSize: HINT_FONT_SIZE,
                lineHeight: HINT_LINE_HEIGHT,
                letterSpacing: "0.16px",
                color: CHROME_GRAY,
                whiteSpace: "nowrap",
              }}
            >
              <ParticleText
                text="hold to create memory"
                seed={97}
                animate={!reducedMotionPref}
                inline
              />
            </span>
          </div>
        </div>
      )}

      {/* shared keyframes for captions + cursor hint */}
      <style>{`
        @keyframes puddleCaptionLife {
          /* the letters focus in out of blur on their own (ParticleText), then
             the whole caption goes soft again as it leaves */
          0% { opacity: 0; filter: blur(0); }
          14% { opacity: 1; }
          68% { opacity: 1; filter: blur(0); }
          100% { opacity: 0; filter: blur(6px); }
        }
        @keyframes puddleHintIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes puddleHoldRing {
          from {
            stroke-dashoffset: ${HOLD_RING_CIRCUMFERENCE};
            opacity: 0.15;
          }
          to {
            stroke-dashoffset: 0;
            opacity: 1;
          }
        }
        @keyframes puddleHoldRingBloom {
          from { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          to { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }
        }
        @keyframes puddleHoldRingFade {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        ${PARTICLE_TEXT_KEYFRAMES}
      `}</style>

      {/* Wordmark stays through the settled dive gallery. */}
      {onNewMemory && (
        <div
          className="pointer-events-none"
          style={{
            opacity: wordmarkHidden ? 0 : 1,
            transition: "opacity 0.6s ease",
            zIndex: 31,
          }}
        >
          <PageHeader layout="absolute" link={false} />
        </div>
      )}

      {/* ═══ HOMESCREEN OVERLAY — same chrome as the blob variant ═══ */}
      {onNewMemory && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ zIndex: 25, opacity: chromeHidden ? 0 : 1, transition: "opacity 0.6s ease" }}
        >
          {/* Bottom blur gradient */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 222,
              background: "linear-gradient(to top, rgba(27,27,27,0.4), rgba(129,129,129,0))",
              backdropFilter: "blur(40px)",
              WebkitBackdropFilter: "blur(40px)",
              maskImage: "linear-gradient(to bottom, transparent, black)",
              WebkitMaskImage: "linear-gradient(to bottom, transparent, black)",
              zIndex: 1,
            }}
          />

          {/* "New Memory" button — hidden on the puddle variant; the water
              itself is the button (see the cursor hint + pointerdown handler).
          <div
            onClick={(e) => {
              e.stopPropagation();
              onNewMemory();
            }}
            className="absolute"
            style={{
              bottom: 56,
              left: "50%",
              transform: "translateX(-50%)",
              cursor: "pointer",
              pointerEvents: "auto",
              zIndex: 2,
              width: "fit-content",
            }}
          >
            <NewMomoryIdle />
          </div>
          */}
        </div>
      )}

      {/* ═══ DIVE GALLERY — flagged variant. One artifact resolving out of the
             defocused puddle; the sim keeps living underneath, slowed. ═══ */}
      {diveGalleryEnabled && divePhase !== "idle" && !descending && (
        <PuddleDiveGallery
          items={galleryItems}
          activeIdx={galleryIdx}
          phase={divePhase}
          reducedMotion={reducedMotionPref}
          onNavigate={(dir) => {
            const next = galleryIdx + dir;
            if (next < 0 || next >= galleryItems.length) return;
            setGalleryIdx(next);
            diveControlsRef.current?.ripple(next);
          }}
          onExit={() => diveControlsRef.current?.close()}
        />
      )}
    </div>
  );
}
