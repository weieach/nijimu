import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import { SceneViewer } from "./SceneViewer";
import { BackButton } from "./BackButton";
import { GalleryViewToggle } from "./GalleryViewToggle";
import { CHROME_GRAY, COLOR_PALETTE } from "../lib/colors";
import { SERIF, SERIF_CJK, SERIF_ITALIC_TRACKING } from "../lib/theme";
import { DIVE_TUNING } from "../lib/puddle/dive";
import type { ArchiveArtifact } from "../lib/archive";
import { inkGrowth, inkWash, INK_POINTER_SIZE, type InkArrival } from "../lib/landingTransition";

/*
 * PuddleDiveGallery — the gallery presentation of the "dive" variant.
 *
 * The memories hang on a dome over the defocused puddle that PuddleScene
 * keeps rendering (and simulating, slowed) underneath: the focused one at the
 * apex, its neighbours falling away to either side and deeper into the water.
 * Stepping through them swings the whole dome, so a memory is never cut to —
 * it travels. Underneath runs a timescale drawn on the *same* circle, a dial
 * of the years the memories fall in. No blobs, no homescreen chrome.
 *
 * The descent itself (dolly + defocus) lives in PuddleScene / the sim's dive
 * pass; this component only owns the overlay UI and its resolve/dissolve
 * timing, which is keyed to the same DIVE_TUNING.
 */

/* ── the dome ─────────────────────────────────────────────────────────────
   A shallow circular arc: the focused memory at the apex, neighbours falling
   gently away. The radius is solved so the outermost slot's centre sits at
   twice the timescale's height from the bottom — always clear of the line,
   never dropping into the foot of the screen. Measured in px from the
   viewport so the landing holds at any window size. */
/** Memories shown either side of the focused one. Each is a WebGL canvas, so
    this is the main cost dial for the whole screen. */
const ARC_NEIGHBOURS = 3;
/** Angle between neighbours on the rim — kept modest so the path stays gentle. */
const ARC_STEP_DEG = 17;
/** Where the apex sits, as a fraction of viewport height. */
const ARC_APEX_VH = 0.34;
/** Whole-arc vertical shift (fraction of viewport height). Added to every
    slot equally so the curve's slope stays the same. */
const ARC_DOWN_VH = 0.08;
/** The focused artifact's box; neighbours are scaled down from it. */
const ARTIFACT_VW = 0.3;
const ARTIFACT_MIN_PX = 240;
const ARTIFACT_MAX_PX = 420;
/** Whole-rim sit, as a fraction of viewport height. Applied to every seat
    equally so a step around the rim never drops one memory relative to the
    others. */
const ARC_FOCUS_DROP_VH = 0.04;
/** How long a memory takes to travel one step around the rim. */
const ARC_TRAVEL_MS = 900;
/* ── the neighbours arriving and leaving ──
   On the naming step the rim isn't dived to: it gathers once the memory has a
   year to stand in. The memories still surface the way they do on a descent —
   blurred, rising — but they overshoot their seat, levitate there for most of
   the arrival, and only then lower into place, so the rim reads as assembling
   itself rather than being placed. Deleting the year sends them back down the
   way they came. */
const NEIGHBOR_IN_MS = 2600;
const NEIGHBOR_OUT_MS = 950;
/** Nearest memory leads the arrival; the outermost leads the departure. */
const NEIGHBOR_IN_STAGGER_MS = 110;
const NEIGHBOR_OUT_STAGGER_MS = 80;
/** Caption block centre-ish, as a fraction of viewport height from the top —
    scales with the window instead of sitting a fixed px above the timescale. */
const CAPTION_TOP_VH = 0.62;
/** Extra downward sit of the title + year. Shared by the carousel and the
    naming step — both draw this caption from the same seat. */
export const CAPTION_DOWN_VH = 0.07;
/** Height of the timescale above the bottom of the viewport. */
const TS_BOTTOM_PX = 78;
/** Outermost artifact centre lands this many times TS_BOTTOM_PX from the
    bottom — twice the timescale's own clearance. */
const ARC_FLOOR_MULT = 2;

/** Falling away from the apex: smaller, dimmer, losing focus to the water.
    Indexed by distance from the apex. */
const SLOT_SCALE = [1, 0.72, 0.56, 0.44];
const SLOT_OPACITY = [1, 0.78, 0.58, 0.4];
const SLOT_BLUR_PX = [0, 2, 5, 9];

function slotDepth(offset: number) {
  const d = Math.min(Math.abs(offset), SLOT_SCALE.length - 1);
  const i = Math.floor(d);
  const f = d - i;
  const j = Math.min(i + 1, SLOT_SCALE.length - 1);
  return {
    scale: SLOT_SCALE[i] + (SLOT_SCALE[j] - SLOT_SCALE[i]) * f,
    opacity: SLOT_OPACITY[i] + (SLOT_OPACITY[j] - SLOT_OPACITY[i]) * f,
    blurPx: SLOT_BLUR_PX[i] + (SLOT_BLUR_PX[j] - SLOT_BLUR_PX[i]) * f,
  };
}

interface DomeGeometry {
  /** Centre of the circle everything is struck from. */
  cx: number;
  cy: number;
  /** Radius the artifacts ride. */
  r: number;
  /** The focused artifact's box, in px. */
  size: number;
  /** Screen y of the apex. */
  apexY: number;
}

function domeGeometry(w: number, h: number): DomeGeometry {
  const size = Math.max(ARTIFACT_MIN_PX, Math.min(ARTIFACT_VW * w, ARTIFACT_MAX_PX));
  // solve the slope first, then translate the whole arc down by the same
  // amount — r and θ stay put, so the curve doesn't change
  const apexY0 = ARC_APEX_VH * h;
  const outerY0 = h - ARC_FLOOR_MULT * TS_BOTTOM_PX;
  const thetaMax = ((ARC_NEIGHBOURS * ARC_STEP_DEG) * Math.PI) / 180;
  const drop = Math.max(1, outerY0 - apexY0);
  const r = drop / (1 - Math.cos(thetaMax));
  const down = ARC_DOWN_VH * h;
  const apexY = apexY0 + down;
  return { cx: w / 2, cy: apexY + r, r, size, apexY };
}

/** A point on a circle around the dome's centre. 0° is the apex, + is right. */
function domePoint(g: DomeGeometry, radius: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: g.cx + radius * Math.sin(a), y: g.cy - radius * Math.cos(a) };
}

/** Shared with the ink field: its pointers finish at these exact seats. */
export function inkGallerySeat(w: number, h: number, offset: number) {
  const geo = domeGeometry(w, h);
  const at = domePoint(geo, geo.r, Math.min(offset, 10) * ARC_STEP_DEG);
  const depth = slotDepth(offset);
  return { x: at.x, y: at.y + ARC_FOCUS_DROP_VH * h,
    size: geo.size * depth.scale, opacity: depth.opacity };
}

function useViewport() {
  const [size, setSize] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

/** The memory's palette color as a wash: saturation nudged up so the muted
    palette still reads through the water, then lifted toward paper so even
    "night" tints the space instead of blotting it. */
function washColor(hex: string): string {
  const channel = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  const [r, g, b] = [channel(1), channel(3), channel(5)];
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const lift = DIVE_TUNING.artifactWashLift;
  const wash = (c: number) => {
    const saturated = Math.min(Math.max(lum + (c - lum) * 2.2, 0), 255);
    return Math.round(saturated + (255 - saturated) * lift);
  };
  return `rgb(${wash(r)}, ${wash(g)}, ${wash(b)})`;
}

export type DiveGalleryItem = ArchiveArtifact;

export type DivePhase = "diving" | "gallery" | "surfacing";

/**
 * How the gallery came to be on screen.
 *  - 'resolve' — it was dived to: every artifact rises out of the blurred water.
 *  - 'carried' — the naming step already had this rim on screen and only handed
 *    it over, so the memories must not move or re-resolve. Just the things that
 *    weren't there yet (the water, the timescale, the arrows) arrive.
 */
export type DiveArrival = "resolve" | "carried";

/** How long the chrome that is new to the carried arrival takes to appear. */
const CARRIED_CHROME_MS = 1200;

const EMPTY_IDS: ReadonlySet<string> = new Set();

/* ── the caption ──
   The naming step types into this same block, so the two are built from one
   set of styles and one DOM shape: when the fields become words the text must
   not move by a pixel. Line-height is pinned on the inputs as well so the
   editable and the settled caption measure the same. */
/* fontWeight is pinned because the naming step renders these same words in an
   <input> inside a <label>, and the theme gives labels weight 500 while inputs
   and the settled caption get 400 — unpinned, the sizer measures heavier text
   than the field shows, and the words move by a pixel when they settle. */
export const CAPTION_TITLE_STYLE: CSSProperties = {
  color: CHROME_GRAY,
  margin: 0,
  fontFamily: SERIF,
  fontStyle: "italic",
  fontWeight: 400,
  fontSize: "clamp(13px, 1.05vw, 16px)",
  letterSpacing: SERIF_ITALIC_TRACKING,
  lineHeight: 1.35,
  textAlign: "center",
};

export const CAPTION_YEAR_STYLE: CSSProperties = {
  color: "#999",
  margin: 0,
  fontFamily: SERIF_CJK,
  fontStyle: "normal",
  fontWeight: 400,
  fontSize: "clamp(11px, 0.9vw, 14px)",
  lineHeight: 1.35,
  textAlign: "center",
};

/** Gap between the title and the year, in the caption block's own em. */
export const CAPTION_TITLE_GAP = "0.8em";

/** The settled caption — a memory's words and its year. */
export function StaticCaption({ title, year }: { title: string; year: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ marginBottom: CAPTION_TITLE_GAP }}>
        <span style={{ ...CAPTION_TITLE_STYLE, display: "inline-block", whiteSpace: "pre-line" }}>
          {title}
        </span>
      </div>
      <span style={{ ...CAPTION_YEAR_STYLE, display: "inline-block" }}>{year}</span>
    </div>
  );
}

export function PuddleDiveGallery({
  items,
  activeIdx,
  phase,
  reducedMotion,
  onNavigate,
  onExit,
  onOverscrollExit,
  caption,
  exitOnBackdropClick = true,
  onToggleGrid,
  showTimeScale = true,
  showArrows = true,
  waterEffect = true,
  neighborsVisible = true,
  arrival = "resolve",
  inkArrival,
}: {
  items: DiveGalleryItem[];
  activeIdx: number;
  phase: DivePhase;
  reducedMotion: boolean;
  /** Steps to travel around the rim: negative = older (left), positive = newer. */
  onNavigate: (delta: number) => void;
  onExit: () => void;
  /** Leave past the first or last memory — the dedicated carousel uses this
      to open the ripple field; the G-gallery falls back to onExit. */
  onOverscrollExit?: () => void;
  /** Replace the default title / year caption (used by the naming step). */
  caption?: ReactNode;
  /** Homescreen G-gallery exits on a blank click; the naming step does not. */
  exitOnBackdropClick?: boolean;
  onToggleGrid?: () => void;
  /** The foot ruler — hidden on the naming step. */
  showTimeScale?: boolean;
  showArrows?: boolean;
  /** Underwater resolve / refraction / buoyant bob. Off on the naming step. */
  waterEffect?: boolean;
  /** Neighbours on the rim. The naming step reveals them with a valid year. */
  neighborsVisible?: boolean;
  /** Whether the rim was dived to or handed over from the naming step. */
  arrival?: DiveArrival;
  /** A mounted ink field hands its six-pixel pointers to these same artifacts. */
  inkArrival?: InkArrival;
}) {
  const hasOlder = activeIdx > 0;
  const hasNewer = activeIdx < items.length - 1;
  const viewport = useViewport();
  const geo = domeGeometry(viewport.w, viewport.h);
  const growth = inkArrival ? inkGrowth(inkArrival) : 1;
  const washIn = inkArrival ? inkWash(inkArrival) : 1;

  /* The rim rides a float, not a CSS lerp of x/y. A straight-line transition
     between seats cuts the chord under the arc — the dip you see when several
     memories move at once. */
  const [rimIdx, setRimIdx] = useState(activeIdx);
  const rimIdxRef = useRef(activeIdx);
  const activeIdxRef = useRef(activeIdx);
  activeIdxRef.current = activeIdx;
  useEffect(() => {
    if (reducedMotion) {
      rimIdxRef.current = activeIdx;
      setRimIdx(activeIdx);
      return;
    }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const target = activeIdxRef.current;
      const next = rimIdxRef.current + (target - rimIdxRef.current) * (1 - Math.exp(-5.2 * dt));
      if (Math.abs(target - next) < 0.001) {
        rimIdxRef.current = target;
        setRimIdx(target);
        return;
      }
      rimIdxRef.current = next;
      setRimIdx(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [activeIdx, reducedMotion]);

  const focusIdx = Math.round(rimIdx);
  const item = items[focusIdx] ?? items[activeIdx];
  const captionItem = items[activeIdx] ?? item;
  const rimSettled = Math.abs(rimIdx - activeIdx) < 0.04;
  const rimSettledRef = useRef(rimSettled);
  rimSettledRef.current = rimSettled;

  /* arrows — keyboard */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (phase !== "gallery" || growth < 1) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") onNavigate(-1);
      else if (e.key === "ArrowRight") onNavigate(1);
      else if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, growth, onNavigate, onExit]);

  /* scroll — one notch steps the rim; another notch past either end leaves.
     The naming step has no arrows and must not steal the wheel. */
  useEffect(() => {
    if (!showArrows) return;
    let leftover = 0;
    let lockedUntil = 0;
    const leave = onOverscrollExit ?? onExit;
    const handler = (e: WheelEvent) => {
      if (phase !== "gallery" || growth < 1) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      const now = performance.now();
      if (now < lockedUntil) return;
      const primary = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      leftover += primary;
      if (Math.abs(leftover) < 72) return;
      const dir = leftover > 0 ? 1 : -1;
      leftover -= dir * 72;
      lockedUntil = now + (reducedMotion ? 80 : 140);
      if (dir < 0 && !hasOlder) {
        if (rimSettledRef.current) leave();
        leftover = 0;
      } else if (dir > 0 && !hasNewer) {
        if (rimSettledRef.current) leave();
        leftover = 0;
      } else onNavigate(dir);
    };
    window.addEventListener("wheel", handler, { passive: false });
    return () => window.removeEventListener("wheel", handler);
  }, [showArrows, phase, growth, reducedMotion, hasOlder, hasNewer, onNavigate, onExit, onOverscrollExit]);

  /* preload the artifacts just off the end of the rim, so the memory that
     swings in on an arrow press never stalls on a network fetch */
  useEffect(() => {
    for (const k of [-ARC_NEIGHBOURS - 1, ARC_NEIGHBOURS + 1]) {
      const neighbour = items[activeIdx + k];
      if (neighbour) useGLTF.preload(neighbour.shape.modelPath);
    }
  }, [items, activeIdx]);

  /* The refraction wobble is a full-element filter pass, so it only runs when
     something is actually moving through the water: the arrival and the exit.
     A carried rim wasn't moving at all, so it starts calm. */
  const [wobbling, setWobbling] = useState(false);
  useEffect(() => {
    if (!waterEffect || phase === "diving" || reducedMotion || inkArrival) {
      setWobbling(false);
      return;
    }
    if (arrival === "carried" && phase === "gallery") {
      setWobbling(false);
      return;
    }
    setWobbling(true);
    const ms =
      phase === "surfacing"
        ? DIVE_TUNING.surfaceMs * 0.6
        : DIVE_TUNING.artifactResolveMs;
    const t = setTimeout(() => setWobbling(false), ms);
    return () => clearTimeout(t);
  }, [arrival, phase, reducedMotion, waterEffect, !!inkArrival]);

  /* The neighbours outlive `neighborsVisible` going false: they have to stay
     mounted long enough to sink back out, or the rim would simply blink away. */
  const [neighborsMounted, setNeighborsMounted] = useState(neighborsVisible);
  useEffect(() => {
    if (neighborsVisible) {
      setNeighborsMounted(true);
      return;
    }
    const t = setTimeout(
      () => setNeighborsMounted(false),
      reducedMotion ? 0 : NEIGHBOR_OUT_MS + ARC_NEIGHBOURS * NEIGHBOR_OUT_STAGGER_MS,
    );
    return () => clearTimeout(t);
  }, [neighborsVisible, reducedMotion]);

  /* The memories the naming step already had on screen. They are not entering
     — they were simply handed over — so they get no entrance at all. Filled the
     first time the rim is seen as carried and then left alone, since which
     artifacts carried over is a fact about the hand-off, not the current rim.
     Usually this component is the very same instance the naming step was
     rendering, and `arrival` flips under it; the set is what remembers who was
     there at that moment. */
  const carriedIdsRef = useRef<Set<string> | null>(null);

  /* A carried rim hands over a wash that was laid on paper; underwater the same
     color sits lower. It settles across the arrival, while the water itself is
     still coming in, so the change is never read as the color shifting. Only a
     rim that *mounts* carried needs the two-frame hold below — when the hand-off
     happens in place the previous paint is already the value to travel from. */
  const [washSettled, setWashSettled] = useState(arrival !== "carried");
  useEffect(() => {
    if (washSettled) return;
    // two frames: the first paint has to land on the handed-over value, or the
    // transition has nothing to travel from
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => setWashSettled(true));
    });
    return () => cancelAnimationFrame(raf);
  }, [washSettled]);

  /* After the opening rise, a step around the rim must not replay it — a newly
     mounted neighbour would start 30px low and pop up. */
  const [rimReady, setRimReady] = useState(false);
  useEffect(() => {
    if (phase !== "gallery") {
      setRimReady(false);
      return;
    }
    if (inkArrival && growth < 1) return;
    const t = setTimeout(
      () => setRimReady(true),
      reducedMotion ? 0 : DIVE_TUNING.artifactResolveMs,
    );
    return () => clearTimeout(t);
  }, [phase, reducedMotion, !!inkArrival, growth < 1]);

  if (!item) return null;

  /* Reveal choreography: an artifact begins resolving the moment it exists on
     screen, rising out of the defocused water itself. The focused slot is
     mounted through the descent (hidden) so its GLB has loaded and compiled by
     the time it's needed; the neighbours only join once the dolly has stopped,
     so building their canvases can't stutter the descent. */
  const resolveMs = reducedMotion ? DIVE_TUNING.reducedMs : DIVE_TUNING.artifactResolveMs;
  const dissolveMs = Math.round(
    (reducedMotion ? DIVE_TUNING.reducedMs : DIVE_TUNING.surfaceMs) * 0.6,
  );
  const artifactAnimation = !waterEffect
    ? "none"
    : phase === "diving"
      ? "none"
      : phase === "surfacing"
        ? `${reducedMotion ? "diveDissolveReduced" : "diveDissolve"} ${dissolveMs}ms ease forwards`
        : rimReady
          ? "none"
          : `${
              reducedMotion ? "diveResolveReduced" : "diveResolve"
            } ${Math.round(resolveMs)}ms cubic-bezier(0.22, 1, 0.36, 1) backwards`;

  /* Chrome the carried arrival brings with it — the foot ruler, the arrows, the
     view switch. These really are new, so they are the ones that fade in. */
  const carriedChrome =
    arrival === "carried" ? `diveChromeIn ${CARRIED_CHROME_MS}ms ease backwards` : undefined;

  /* Refraction wobble — an SVG turbulence/displacement filter over the focused
     artifact, seen as if through moving water. Its SMIL animation starts when
     the filter mounts and calms to zero as the shape arrives. */
  const wobble =
    phase === "surfacing"
      ? // leaving: the water takes it back, so the distortion grows
        { dur: dissolveMs, scale: "0;16;44" }
      : // arriving: strongest at first sight, stilling as the shape settles
        { dur: Math.round(resolveMs), scale: "42;14;0" };

  const chromeVisible = phase === "gallery" && growth >= 1;
  const palette = COLOR_PALETTE[item.colorIndex % COLOR_PALETTE.length];
  const travelMs = reducedMotion ? 0 : ARC_TRAVEL_MS;
  const travelEase = "cubic-bezier(0.33, 0.02, 0.2, 1)";

  /* The background wash: the memory's color belongs to the space the artifact
     hangs in, not to the water — the puddle is left exactly as it was dived
     from (PuddleScene restores it on the way up). An arrow press crossfades
     this color; nothing is added to the surface below. */
  const washFadeMs = phase === "surfacing" ? dissolveMs : Math.round(resolveMs);

  /* The rim, apex outward. Only the focused memory exists while the dolly is
     still running; everything on the dome leaves together when it reverses. */
  const slots: { offset: number; item: DiveGalleryItem }[] = [];
  for (let i = 0; i < items.length; i++) {
    const offset = i - rimIdx;
    if (phase === "diving" && Math.abs(offset) > 0.01) continue;
    if (!neighborsMounted && Math.abs(offset) > 0.01) continue;
    if (Math.abs(offset) > ARC_NEIGHBOURS + 0.05) continue;
    const slotItem = items[i];
    if (slotItem) slots.push({ offset, item: slotItem });
  }

  /** The rim is letting go: still on screen, but on its way back down. */
  const neighborsLeaving = neighborsMounted && !neighborsVisible;

  /** How a neighbour joins or leaves a rim that gathers rather than being dived
      to. Nearest first on the way in, outermost first on the way out. */
  const neighborAnimation = (offset: number) => {
    const d = Math.abs(offset);
    if (reducedMotion) {
      // nothing rises or sinks here; the rim is simply there or not
      return neighborsLeaving ? "none" : "diveNeighborInReduced 1.1s ease forwards";
    }
    /* ease-in-out, not a snappy ease-out: the curve is applied between every
       pair of keyframes, so a sharp one would lurch four times over. Easing
       each segment in and out instead is what lets the overshoot hang. */
    if (neighborsLeaving) {
      const delay = (ARC_NEIGHBOURS - d) * NEIGHBOR_OUT_STAGGER_MS;
      return `diveNeighborOut ${NEIGHBOR_OUT_MS}ms ease-in-out ${delay}ms both`;
    }
    return `diveNeighborIn ${NEIGHBOR_IN_MS}ms ease-in-out ${
      d * NEIGHBOR_IN_STAGGER_MS
    }ms both`;
  };

  if (!carriedIdsRef.current && arrival === "carried") {
    carriedIdsRef.current = new Set(slots.map(({ item: slotItem }) => slotItem.id));
  }
  const carriedIds: ReadonlySet<string> = carriedIdsRef.current ?? EMPTY_IDS;

  const arrowStyle = (side: "left" | "right"): CSSProperties => ({
    position: "absolute",
    top: geo.apexY,
    [side]: "clamp(8px, 1.6vw, 26px)",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    padding: 16,
    cursor: "pointer",
    color: "#4a4a4a",
    opacity: chromeVisible ? 0.35 : 0,
    transition: "opacity 0.6s ease",
    animation: carriedChrome,
    pointerEvents: chromeVisible ? "auto" : "none",
  });

  return (
    <div
      className="absolute inset-0 select-none"
      style={{ zIndex: 30, pointerEvents: growth < 1 ? "none" : undefined }}
      onClick={() => {
        if (chromeVisible && exitOnBackdropClick) onExit();
      }}
    >
      {/* ═══ BACKGROUND WASH — the memory's color, held around the focused
             artifact. First child, so it paints under the dome and over the
             water; its soft radial mask keeps it edgeless. ═══ */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          left: geo.cx,
          top: geo.apexY,
          transform: "translate(-50%, -50%)",
          width: "clamp(700px, 78vw, 1000px)",
          height: "clamp(700px, 78vw, 1000px)",
          borderRadius: "50%",
          backgroundColor: washColor(palette.color),
          opacity:
            inkArrival
              ? DIVE_TUNING.artifactWashOpacity * washIn
              : (chromeVisible || !waterEffect)
                ? waterEffect && washSettled
                  ? DIVE_TUNING.artifactWashOpacity
                  : Math.min(1, DIVE_TUNING.artifactWashOpacity / 0.62)
                : 0,
          maskImage:
            "radial-gradient(closest-side, #000 10%, rgba(0,0,0,0.5) 50%, transparent 82%)",
          WebkitMaskImage:
            "radial-gradient(closest-side, #000 10%, rgba(0,0,0,0.5) 50%, transparent 82%)",
          transition: inkArrival
            ? "none"
            : waterEffect
              ? `background-color ${DIVE_TUNING.artifactWashFadeMs}ms ease, opacity ${washFadeMs}ms ease`
              : "none",
          willChange: waterEffect ? "background-color, opacity" : undefined,
        }}
      />

      {/* Refraction filter def, shared by whichever artifact holds the apex.
          Mounted only while it has something to do; remounting restarts its
          SMIL clock, which is what ties it to the arrival and the exit. */}
      {wobbling && (
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
          <defs>
            <filter id="dive-refraction" x="-20%" y="-20%" width="140%" height="140%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.014 0.028"
                numOctaves="2"
                seed="7"
                result="water"
              >
                {/* the water itself keeps moving while it stills */}
                <animate
                  attributeName="baseFrequency"
                  values="0.014 0.028;0.011 0.023;0.016 0.031"
                  keyTimes="0;0.6;1"
                  dur={`${wobble.dur}ms`}
                  fill="freeze"
                />
              </feTurbulence>
              <feDisplacementMap
                in="SourceGraphic"
                in2="water"
                scale={wobble.scale.split(";")[0]}
                xChannelSelector="R"
                yChannelSelector="G"
              >
                <animate
                  attributeName="scale"
                  values={wobble.scale}
                  keyTimes="0;0.55;1"
                  dur={`${wobble.dur}ms`}
                  fill="freeze"
                />
              </feDisplacementMap>
            </filter>
          </defs>
        </svg>
      )}

      {/* ═══ THE DOME — the memories on the rim, the focused one at the apex.
             Slots are keyed by memory, so an arrow press moves the elements
             instead of replacing them: the whole dome swings. ═══ */}
      <div className="absolute inset-0">
        {slots.map(({ offset, item: slotItem }) => {
          const focused = Math.abs(offset) < 0.5;
          const depth = slotDepth(offset);
          const at = domePoint(geo, geo.r, offset * ARC_STEP_DEG);
          const dropY = ARC_FOCUS_DROP_VH * viewport.h;
          const slotPalette =
            COLOR_PALETTE[slotItem.colorIndex % COLOR_PALETTE.length];
          /* handed over rather than arriving: it is already exactly here */
          const carried = carriedIds.has(slotItem.id) && phase === "gallery";
          const entryScale = inkArrival && !inkArrival.reducedMotion
            ? INK_POINTER_SIZE / (geo.size * depth.scale) + (1 - INK_POINTER_SIZE / (geo.size * depth.scale)) * growth
            : 1;
          return (
            <div
              key={slotItem.id}
              className="dive-artifact"
              data-memory-id={slotItem.id}
              onClick={(e) => {
                e.stopPropagation();
                if (!focused && chromeVisible) onNavigate(Math.round(offset));
              }}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: geo.size,
                height: geo.size,
                transform: `translate(-50%, -50%) translate(${at.x.toFixed(2)}px, ${(
                  at.y + dropY
                ).toFixed(2)}px) scale(${depth.scale})`,
                zIndex: 10 - Math.round(Math.abs(offset)),
                cursor: focused ? "default" : "pointer",
                pointerEvents: chromeVisible ? "auto" : "none",
              }}
            >
              {/* the arrival / departure, on its own layer so the depth
                  styling below can't fight its filter and opacity */}
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  opacity: inkArrival ? Math.min(1, growth * 5) : phase === "diving" ? 0 : undefined,
                  transform: inkArrival ? `scale(${entryScale})` : undefined,
                  /* A carried neighbour keeps the very animation string the
                     naming step gave it: unchanged, the browser lets it run on
                     to its end, so a rim still gathering when it was handed
                     over finishes gathering instead of snapping into place. */
                  animation: inkArrival ? "none" : carried
                    ? focused
                      ? "none"
                      : neighborAnimation(offset)
                    : !focused && !waterEffect
                      ? neighborAnimation(offset)
                      : artifactAnimation,
                  willChange: "filter, opacity, transform",
                }}
              >
                {/* depth: how far into the water this slot has fallen. The
                    bob lives on the model so a step never cuts a CSS float
                    short and drops the box. The depth blur belongs to the
                    dome, not the water, so both screens carry it. */}
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    opacity: depth.opacity,
                    filter:
                      [
                        depth.blurPx ? `blur(${depth.blurPx}px)` : "",
                        waterEffect && focused && wobbling ? "url(#dive-refraction)" : "",
                      ]
                        .filter(Boolean)
                        .join(" ") || undefined,
                    transition: "none",
                  }}
                >
                  <SceneViewer
                    measureUnscaled={!!inkArrival}
                    modelPath={slotItem.shape.modelPath}
                    fluidity={slotItem.shape.fluidity}
                    evolve={slotItem.shape.evolve}
                    bumpAmount={slotItem.shape.bumpAmount}
                    autoRotate={focused}
                    floatAmplitude={0.08}
                    ready
                    // tight framing — the artifact is the screen here, so it
                    // fills its box instead of floating in the middle of it
                    frameMargin={1.12}
                    // parked neighbours render once and then cost nothing.
                    // `still` is what keeps that honest: a demand canvas that
                    // kept animating would show its motion in lurches, so a
                    // neighbour holds one pose until it reaches the apex.
                    frameloop={focused ? "always" : "demand"}
                    still={!focused}
                    // the apex artifact turns on the page's clock rather than
                    // its canvas's, so the same memory on two screens reads as
                    // one continuous rotation instead of snapping back to rest
                    sharedClock={focused}
                    // no frosted-glass overlay here: its backdrop-filter draws
                    // a hard square over the defocused water (backdrop filters
                    // ignore ancestor opacity/masks in Chromium). The artifact
                    // resolves sharp; the blur belongs to the puddle behind it.
                    canvasBlurPx={0}
                    rectAreaLightColors={{
                      color1: slotPalette.light1,
                      color2: slotPalette.light2,
                      matColor: slotPalette.color,
                    }}
                    style={{ width: "100%", height: "100%" }}
                  />
                </div>
              </div>
              {/* A neighbour is a destination, not a toy: this lid keeps the
                  pointer off its OrbitControls so the click that lands on it
                  bubbles up and brings it to the apex instead. */}
              {!focused && (
                <div style={{ position: "absolute", inset: 0, zIndex: 20 }} />
              )}
            </div>
          );
        })}
      </div>

      {/* ═══ TIMESCALE — one line across the foot of the screen ═══ */}
      {showTimeScale && (
        <TimeScale
          items={items}
          activeIdx={rimIdx}
          viewport={viewport}
          visible={chromeVisible}
          travelMs={0}
          travelEase={travelEase}
          enterAnimation={carriedChrome}
        />
      )}

      {/* ═══ CAPTION — between the dome and the timescale ═══ */}
      <div
        className="absolute left-0 right-0 text-center"
        style={{
          top: (CAPTION_TOP_VH + CAPTION_DOWN_VH) * viewport.h,
          padding: "0 clamp(24px, 6vw, 80px)",
          fontFamily: SERIF,
          opacity: chromeVisible ? 1 : 0,
          transition: "opacity 0.8s ease",
          zIndex: 30,
          pointerEvents: caption ? "auto" : "none",
        }}
      >
        <div
          key={captionItem.id}
          style={{
            /* the opening fade waits for the memory; once the rim is in
               motion the words stay put and simply change with the step */
            animation:
              caption || reducedMotion || rimReady || carriedIds.has(captionItem.id)
                ? undefined
                : `diveCaptionIn ${travelMs}ms ease`,
            pointerEvents: caption ? "auto" : "none",
          }}
        >
          {caption ?? <StaticCaption title={captionItem.event} year={captionItem.year} />}
        </div>
      </div>

      {/* ═══ ARROWS ═══ */}
      {showArrows && hasOlder && (
        <button
          aria-label="older memory"
          style={arrowStyle("left")}
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(-1);
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = chromeVisible ? "0.7" : "0")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = chromeVisible ? "0.35" : "0")}
        >
          <svg width="22" height="40" viewBox="0 0 22 40" fill="none" aria-hidden>
            <path d="M18 4 L6 20 L18 36" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      )}
      {showArrows && hasNewer && (
        <button
          aria-label="newer memory"
          style={arrowStyle("right")}
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(1);
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = chromeVisible ? "0.7" : "0")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = chromeVisible ? "0.35" : "0")}
        >
          <svg width="22" height="40" viewBox="0 0 22 40" fill="none" aria-hidden>
            <path d="M4 4 L16 20 L4 36" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      )}

      {/* ═══ WAY BACK — same left arrow as the recording screen ═══ */}
      <div
        style={{
          opacity: chromeVisible ? 1 : 0,
          transition: "opacity 0.8s ease",
          pointerEvents: chromeVisible ? "auto" : "none",
        }}
      >
        <BackButton onClick={onExit} />
      </div>

      <GalleryViewToggle
        view="carousel"
        onToggle={onToggleGrid ?? (() => {})}
        visible={chromeVisible && !!onToggleGrid}
        enterAnimation={carriedChrome}
      />

      <style>{`
        /* The slots are scaled with a CSS transform, and r3f sizes its canvas
           from getBoundingClientRect — which already includes that scale, so
           three.js writes back a px style smaller than the box and the artifact
           ends up shrunken and off-centre inside it. Pinning the canvas to its
           container leaves the scale to CSS alone; the measured size then only
           decides render resolution, which is what a scaled-down neighbour
           wants anyway. */
        .dive-artifact canvas {
          width: 100% !important;
          height: 100% !important;
        }
        /* Rising out of the deep, the way a thing resolves as you swim down
           to it: it drifts UP toward you (translateY), murky and cool at
           first — sepia rotated to teal reads as water colour, not gray —
           then the haze clears and its own warm hues arrive last.
           Every keyframe lists the same filter chain so the browser can
           interpolate smoothly. The refraction wobble is a separate SVG
           displacement layer, calming on its own clock. */
        @keyframes diveResolve {
          0% {
            opacity: 0;
            filter: blur(28px) sepia(0.5) hue-rotate(150deg) saturate(0.55) brightness(1.08) contrast(0.88);
            transform: translateY(30px) scale(0.93);
          }
          30% {
            opacity: 1;
            filter: blur(13px) sepia(0.45) hue-rotate(148deg) saturate(0.6) brightness(1.06) contrast(0.92);
            transform: translateY(18px) scale(0.955);
          }
          60% {
            filter: blur(4.5px) sepia(0.3) hue-rotate(120deg) saturate(0.75) brightness(1.03) contrast(0.96);
            transform: translateY(7px) scale(0.98);
          }
          85% {
            filter: blur(1px) sepia(0.12) hue-rotate(60deg) saturate(0.9) brightness(1.01) contrast(0.99);
            transform: translateY(1px) scale(0.996);
          }
          100% {
            opacity: 1;
            filter: blur(0) sepia(0) hue-rotate(0deg) saturate(1) brightness(1) contrast(1);
            transform: translateY(0) scale(1);
          }
        }
        /* Sinking back down and away: colour drains to water first, then the
           shape drops out of focus into the murk below. */
        @keyframes diveDissolve {
          0% {
            opacity: 1;
            filter: blur(0) sepia(0) hue-rotate(0deg) saturate(1) brightness(1) contrast(1);
            transform: translateY(0) scale(1);
          }
          40% {
            opacity: 1;
            filter: blur(4px) sepia(0.3) hue-rotate(130deg) saturate(0.6) brightness(1.05) contrast(0.94);
            transform: translateY(10px) scale(0.985);
          }
          100% {
            opacity: 0;
            filter: blur(22px) sepia(0.5) hue-rotate(150deg) saturate(0.4) brightness(1.1) contrast(0.87);
            transform: translateY(34px) scale(0.94);
          }
        }
        /* the settled artifact's slow buoyant drift */
        @keyframes diveFloat {
          from { transform: translateY(0); }
          to   { transform: translateY(-7px); }
        }
        /* the words arrive after the memory they belong to */
        @keyframes diveCaptionIn {
          0%   { opacity: 0; }
          45%  { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes diveResolveReduced {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes diveDissolveReduced {
          from { opacity: 1; }
          to   { opacity: 0; }
        }
        /* A rim that gathers instead of being dived to. Same surfacing as
           diveResolve — deep blur clearing as the memory rises — but with no
           water to tint, and it doesn't arrive straight onto its seat: it
           floats up past it, hangs there while the blur lets go, and only then
           lowers into place. */
        @keyframes diveNeighborIn {
          0% {
            opacity: 0;
            filter: blur(26px);
            transform: translateY(30px) scale(0.93);
          }
          20% {
            opacity: 0.85;
            filter: blur(14px);
            transform: translateY(-4px) scale(0.98);
          }
          38% {
            opacity: 1;
            filter: blur(6px);
            transform: translateY(-13px) scale(1.012);
          }
          60% {
            opacity: 1;
            filter: blur(2.5px);
            transform: translateY(-15px) scale(1.015);
          }
          80% {
            opacity: 1;
            filter: blur(0.8px);
            transform: translateY(-11px) scale(1.008);
          }
          100% {
            opacity: 1;
            filter: blur(0);
            transform: translateY(0) scale(1);
          }
        }
        /* Letting go: one small lift, as if it had been held up, then back down
           into the blur it came out of. */
        @keyframes diveNeighborOut {
          0% {
            opacity: 1;
            filter: blur(0);
            transform: translateY(0) scale(1);
          }
          26% {
            opacity: 0.92;
            filter: blur(3px);
            transform: translateY(-6px) scale(1.006);
          }
          100% {
            opacity: 0;
            filter: blur(22px);
            transform: translateY(26px) scale(0.94);
          }
        }
        @keyframes diveNeighborInReduced {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        /* Chrome that is new to a carried arrival: it focuses in out of a soft
           blur. Only the 'from' is written: with backwards fill the element
           travels from nothing to whatever opacity it styles for itself, and
           keeps it afterwards — so hover states still work once it has arrived. */
        @keyframes diveChromeIn {
          from { opacity: 0; filter: blur(6px); }
        }
      `}</style>
    </div>
  );
}

/* ── the timescale ────────────────────────────────────────────────────────
   One line across the foot of the screen. Short ticks mark each memory (no
   year). Longer ticks land on regular five-year increments (2010, 2015, …)
   and carry the only numbers. The focused memory's mark slides along as the
   dome swings. Oldest at the left, newest at the right — same as the dome. */

/** Inset at each end, as a fraction of the width. */
const TS_SIDE_PAD_VW = 0.07;
const TS_SIDE_PAD_MIN = 44;
/** Same-year memories share a point in time; nudge them apart so stepping
    between two of them still moves the mark. */
const TS_TIE_SPREAD = 0.011;
const TS_MEMORY_TICK = 4;
const TS_YEAR_TICK = 9;
const TS_LABEL_DROP = 22;
/** Major ticks every N years (2010, 2015, …). */
const TS_YEAR_STEP = 5;

function TimeScale({
  items,
  activeIdx,
  viewport,
  visible,
  travelMs,
  travelEase,
  enterAnimation,
}: {
  items: DiveGalleryItem[];
  activeIdx: number;
  viewport: { w: number; h: number };
  visible: boolean;
  travelMs: number;
  travelEase: string;
  /** Set when the ruler is new to the screen and has to draw itself in. */
  enterAnimation?: string;
}) {
  /** Memory places + the five-year ticks that frame them. */
  const { positions, yearTicks } = useMemo(() => {
    const parsed = items.map((it) => parseInt(it.year) || 0);
    const min = Math.min(...parsed);
    const max = Math.max(...parsed);
    // pad the domain out to the surrounding five-year marks so the ends of
    // the line have something to say
    const domainMin = Math.floor(min / TS_YEAR_STEP) * TS_YEAR_STEP;
    const domainMax = Math.ceil(max / TS_YEAR_STEP) * TS_YEAR_STEP;
    const span = domainMax - domainMin || 1;
    // oldest to the left, newest to the right — the dome's own direction
    const ofYear = (y: number) => (y - domainMin) / span;

    const tally = new Map<number, number>();
    for (const y of parsed) tally.set(y, (tally.get(y) ?? 0) + 1);
    const seats = new Map<number, number>();

    const positions = parsed.map((y) => {
      const seat = seats.get(y) ?? 0;
      seats.set(y, seat + 1);
      const count = tally.get(y) ?? 1;
      return ofYear(y) + (seat - (count - 1) / 2) * TS_TIE_SPREAD;
    });

    const yearTicks: { year: number; t: number }[] = [];
    for (let y = domainMin; y <= domainMax; y += TS_YEAR_STEP) {
      yearTicks.push({ year: y, t: ofYear(y) });
    }

    return { positions, yearTicks };
  }, [items]);

  const pad = Math.max(TS_SIDE_PAD_MIN, TS_SIDE_PAD_VW * viewport.w);
  const inner = Math.max(1, viewport.w - pad * 2);
  const y = viewport.h - TS_BOTTOM_PX;
  const x = (t: number) => pad + t * inner;
  const markAt = (() => {
    const a = Math.max(0, Math.min(positions.length - 1, activeIdx));
    const i = Math.floor(a);
    const t0 = positions[i] ?? 0;
    const t1 = positions[Math.min(i + 1, positions.length - 1)] ?? t0;
    return t0 + (t1 - t0) * (a - i);
  })();

  return (
    <svg
      aria-hidden
      className="absolute inset-0 pointer-events-none"
      width="100%"
      height="100%"
      style={{
        opacity: visible ? 1 : 0,
        transition: "opacity 0.8s ease",
        animation: enterAnimation,
      }}
    >
      <defs>
        {/* the line has no ends, it just stops being */}
        <linearGradient
          id="dive-timescale-fade"
          gradientUnits="userSpaceOnUse"
          x1={0}
          y1={y}
          x2={viewport.w}
          y2={y}
        >
          <stop offset="0" stopColor="#4a4a4a" stopOpacity="0" />
          <stop offset="0.1" stopColor="#4a4a4a" stopOpacity="0.24" />
          <stop offset="0.9" stopColor="#4a4a4a" stopOpacity="0.24" />
          <stop offset="1" stopColor="#4a4a4a" stopOpacity="0" />
        </linearGradient>
      </defs>

      <line x1={0} y1={y} x2={viewport.w} y2={y} stroke="url(#dive-timescale-fade)" strokeWidth={1} />

      {/* every memory — short tick, no year */}
      {positions.map((t, i) => (
        <line
          key={`m-${items[i].id}`}
          x1={x(t)}
          y1={y - TS_MEMORY_TICK / 2}
          x2={x(t)}
          y2={y + TS_MEMORY_TICK / 2}
          stroke="#4a4a4a"
          strokeOpacity={0.28}
          strokeWidth={1}
        />
      ))}

      {/* regular five-year increments — long tick + year */}
      {yearTicks.map(({ year, t }) => (
        <g key={year}>
          <line
            x1={x(t)}
            y1={y - TS_YEAR_TICK / 2}
            x2={x(t)}
            y2={y + TS_YEAR_TICK / 2}
            stroke="#4a4a4a"
            strokeOpacity={0.38}
            strokeWidth={1}
          />
          <text
            x={x(t)}
            y={y + TS_LABEL_DROP}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#4a4a4a"
            fillOpacity={0.4}
            style={{
              fontFamily: SERIF_CJK,
              fontSize: 10,
              letterSpacing: "0.06em",
            }}
          >
            {year}
          </text>
        </g>
      ))}

      {/* where you are */}
      <g
        style={{
          transform: `translate(${x(markAt).toFixed(2)}px, ${y}px)`,
          transition: travelMs ? `transform ${travelMs}ms ${travelEase}` : "none",
        }}
      >
        <circle
          r={TS_YEAR_TICK / 2}
          fill="#f7f7f8"
          stroke="#4a4a4a"
          strokeWidth={0.3}
          style={{ filter: "drop-shadow(0 1px 11px rgba(45, 45, 45, 0.38))" }}
        />
      </g>
    </svg>
  );
}
