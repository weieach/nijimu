import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import svgPaths from "../../imports/svg-t19vgojqiy";
import NewMomoryIdle from "../../imports/NewMomoryIdle";
import { LIFE_EVENTS, COLORS as MEMORY_COLORS, MemoryEvent } from "../data/memoryData";
import { loadMemories, toMemoryEvent, SavedMemory } from "../lib/memoryStore";
import { SceneViewer, MODEL_PATHS } from "./SceneViewer";
import { PageHeader, PAGE_HEADER_MARK } from "./PageHeader";
import { GalleryViewToggle } from "./GalleryViewToggle";
import { SANS, SERIF, SERIF_CJK, SERIF_ITALIC_TRACKING } from "../lib/theme";
import { CHROME_GRAY, COLOR_PALETTE } from "../lib/colors";
import { INK_ENTRY, INK_POINTER_SIZE, flowProgress, inkGrowth, type InkArrival } from "../lib/landingTransition";
import { LANDING_RETURN, useLandingReturn } from "../lib/landingReturn";
import { carouselSeat, carouselContainsOffset, inkUnfoldSeat } from "../lib/carouselLayout";

/** Caption + annotation dot — shared so the marks match the words. */
const BLOB_CAPTION_COLOR = "#D6DADB";
/** Landing description. */
const HEADER_DESC_SIZE = 12;
/** Blob year + title — restored clamp, a step above the header description. */
const BLOB_CAPTION_SIZE =
  "clamp(13px, calc(13px + 2 * ((100vw - 390px) / (1024 - 390))), 15px)";
const BLOB_DOT = 8;
/** Radiating ring — kept as a painted width so scale() cannot fatten it. */
const BLOB_RING_STROKE = 0.6;


/* ───────── types ───────── */
interface BlobData {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  blur: number;
  opacity: number;
  borderRadius: string;
  animDuration: number;
  animDelay: number;
  rotate: number;
  year: string;
  event: string;
  distFromCentroid: number;
  shape: {
    modelPath: string;
    colorIndex: number;
    fluidity: number;
    evolve: number;
    bumpAmount: number;
  };
}

/* ───────── constants ───────── */
const COLORS = [
  "radial-gradient(ellipse at 30% 30%, #9496a6, #7a7c8c)",
  "radial-gradient(ellipse at 40% 40%, #D6DADB, #bcc0c1)",
  "radial-gradient(ellipse at 60% 60%, #C8D0D4, #aeb6ba)",
  "radial-gradient(ellipse at 50% 50%, #CBBFBC, #b1a5a2)",
  "radial-gradient(ellipse at 35% 45%, #A4B6BE, #8a9ca4)",
  "radial-gradient(ellipse at 55% 35%, #B8969A, #9e7c80)",
  "radial-gradient(ellipse at 45% 55%, #8C9FA8, #72858e)",
  "radial-gradient(ellipse at 40% 60%, #6488A0, #4a6e86)",
  "radial-gradient(ellipse at 50% 40%, #9496a6, #7a7c8c)",
  "radial-gradient(ellipse at 60% 40%, #1C2C35, #34444F)",
];

/*
 * Connection graph (edges):
 *  5↔0  Relocating ↔ College
 *  5↔2  Relocating ↔ Breakup
 *  5↔4  Relocating ↔ First real job
 *  5↔10 Relocating ↔ Moved back home
 *  0↔1  College ↔ Barcelona
 *  0↔3  College ↔ Graduated
 *  2↔6  Breakup ↔ Met someone new
 *  2↔8  Breakup ↔ Lost grandmother
 *  3↔4  Graduated ↔ First real job
 *
 * Degrees: 5→4, 0→3, 2→3, 3→2, 4→2, 1→1, 6→1, 8→1, 101, 7→0, 9→0, 11→0
 */
const EDGES: [number, number][] = [
  [5, 0], [5, 2], [5, 4], [5, 10],
  [0, 1], [0, 3],
  [2, 6], [2, 8],
  [3, 4],
];

function getConnections(idx: number): number[] {
  const out: number[] = [];
  for (const [a, b] of EDGES) {
    if (a === idx) out.push(b);
    else if (b === idx) out.push(a);
  }
  return out;
}

function connectionCount(idx: number): number {
  return getConnections(idx).length;
}

/*
 * Gallery sort order: chronological, oldest (left) → newest (right).
 * gallerySortOrder[slot] = blobIndex
 * gallerySlot[blobIndex] = slot position (0 = leftmost = oldest)
 */
function computeGalleryOrder(events: { year: string }[]) {
  const sortOrder = events
    .map((_, i) => i)
    .sort((a, b) => parseInt(events[a].year) - parseInt(events[b].year));
  const slot: number[] = new Array(events.length);
  sortOrder.forEach((blobIdx, s) => {
    slot[blobIdx] = s;
  });
  return { sortOrder, slot };
}

/* ───────── helpers ───────── */
function generateBorderRadius(): string {
  const v = Array.from({ length: 8 }, () => 30 + Math.random() * 40);
  return `${v[0]}% ${v[1]}% ${v[2]}% ${v[3]}% / ${v[4]}% ${v[5]}% ${v[6]}% ${v[7]}%`;
}

function generateBlobs(
  events: MemoryEvent[],
  saved: SavedMemory[],
  isMobile: boolean,
): BlobData[] {
  const raw = Array.from({ length: events.length }, (_, i) => {
    let x, y;
    if (isMobile) {
      // Mobile: 2x width, blobs can be generated across 200% width
      x = Math.random() * 100; // 0-100% of the 2x container
      y = 10 + Math.random() * 70;
    } else {
      // Desktop: 1.5x size canvas
      x = 10 + Math.random() * 70;
      y = 10 + Math.random() * 70;
    }
    
    // Use the color index from the event to ensure 2D and 3D colors match
    const colorIndex = events[i].color;
    // Saved memories replay the shape the user actually sculpted; the curated
    // LIFE_EVENTS get a generated one.
    const savedMemory = i >= LIFE_EVENTS.length ? saved[i - LIFE_EVENTS.length] : undefined;
    
    return {
      id: i,
      x,
      y: y + 10, // Shift all blobs down (10% = approx 100px at 1080p height)
      size: 180 + Math.random() * 300,
      color: COLORS[colorIndex % COLORS.length],
      blur: 8 + Math.random() * 30,
      opacity: 0.55 + Math.random() * 0.35,
      borderRadius: generateBorderRadius(),
      animDuration: 33 + Math.random() * 50,
      animDelay: -Math.random() * 33,
      rotate: Math.random() * 360,
      year: events[i].year,
      event: events[i].event,
      distFromCentroid: 0,
      shape: savedMemory
        ? {
            modelPath: savedMemory.shape.modelPath,
            colorIndex: colorIndex % COLOR_PALETTE.length,
            fluidity: savedMemory.shape.fluidity,
            evolve: savedMemory.shape.evolve,
            bumpAmount: savedMemory.shape.bumpAmount,
          }
        : {
            modelPath: MODEL_PATHS[Math.floor(Math.random() * MODEL_PATHS.length)],
            colorIndex: colorIndex % COLOR_PALETTE.length, // Use the same color index
            fluidity: Math.random() * 0.5 + 0.5,
            evolve: Math.random() * 0.5 + 0.5,
            bumpAmount: i % 2 === 0 ? Math.random() * 0.03 : 0.03 + Math.random() * 0.12,
          },
    };
  });
  const cx = raw.reduce((s, b) => s + b.x, 0) / raw.length;
  const cy = raw.reduce((s, b) => s + b.y, 0) / raw.length;
  for (const b of raw) {
    b.distFromCentroid =
      Math.sqrt(((b.x - cx) / 100) ** 2 + ((b.y - cy) / 100) ** 2) * 2;
  }
  return raw;
}

function useScaleFactor(): number {
  const getScale = useCallback(() => {
    const w = window.innerWidth;
    if (w <= 480) return 0.5;
    if (w <= 768) return 0.6;
    if (w <= 1024) return 0.7;
    return 1;
  }, []);
  const [scale, setScale] = useState(getScale);
  useEffect(() => {
    const h = () => setScale(getScale());
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, [getScale]);
  return scale;
}

/* ───────── easing / math ───────── */
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function parseHex(hex: string) {
  const n = hex.replace("#", "");
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  };
}
function lerpHex(a: string, b: string, t: number) {
  const pa = parseHex(a);
  const pb = parseHex(b);
  return `rgb(${Math.round(lerp(pa.r, pb.r, t))}, ${Math.round(lerp(pa.g, pb.g, t))}, ${Math.round(lerp(pa.b, pb.b, t))})`;
}
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
function gentleEase(t: number): number {
  return t - Math.sin(t * Math.PI * 2) / (Math.PI * 2);
}

const PAPER = "#ededee";
/** Landing paper — a step below the raw token so isolation doesn't read as a flash. */
const LANDING_PAPER = "#e4e4e6";
const HEADER_INK = { mark: "#504A4A", desc: "#2A2018" };
const HEADER_LIGHT = { mark: "#e2e2e3", desc: "#D6DADB" };
const HEADER_COLOR_FADE = "color 1.15s ease";
/** Labels invert against the field; the saturation pass keeps that invert gray. */
const LANDING_INK = {
  color: "rgba(255, 255, 255, 0.8)",
  mixBlendMode: "difference" as const,
};
const LANDING_MONO = {
  color: "#808080",
  mixBlendMode: "saturation" as const,
};

function hexLuma(hex: string): number {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

const PAPER_LUMA = hexLuma(LANDING_PAPER);

interface CaptionFx {
  /** How far the caption sits in the header keep-out — blur only. */
  progress: number;
  /** Label-on-label coverage — blur only; the top of the stack stays sharp. */
  overlap: number;
  stack: number;
}

/* ──────── annotation ──────── */
interface AnnPos {
  dotX: number;
  dotY: number;
  textAlign: "left" | "right";
  anchorX: number;
  anchorY: number;
}

/* ───────── text scale by connections ───────── */
function textScale(idx: number): number {
  const c = connectionCount(idx);
  if (c >= 4) return 1.45;
  if (c >= 3) return 1.25;
  if (c >= 2) return 1.1;
  if (c >= 1) return 1.0;
  return 0.88;
}

/* ═══════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════ */
export function BlobScene({
  onNewMemory,
  hideAnnotations = false,
  openGallery = false,
  onGalleryExit,
  onToggleGrid,
  classicChrome = false,
  galleryOnly = false,
  ctaLabel = "New Memory",
  showPlus = true,
  landingArrival = null,
  landingFocusSlot = 0,
}: {
  onNewMemory?: () => void;
  hideAnnotations?: boolean;
  /** Open the artifact gallery on mount (used by the homescreen G shortcut). */
  openGallery?: boolean;
  /** Fired when leaving gallery → blend (so HomePage can restore a test variant). */
  onGalleryExit?: () => void;
  onToggleGrid?: () => void;
  /** Main-branch overlay: top blur, tagline, original wordmark. */
  classicChrome?: boolean;
  /** Dedicated carousel route: start (and stay) in gallery, no blend overlay. */
  galleryOnly?: boolean;
  ctaLabel?: string;
  showPlus?: boolean;
  /** Only the landing's Enter action uses this clock; the original field is
      unchanged until that action begins. */
  landingArrival?: InkArrival | null;
  /** Chronological seat the ink unfolds onto — a middle memory, not an end. */
  landingFocusSlot?: number;
}) {
  // Curated life events plus whatever the user has saved, so their memories
  // blend into the same field.
  const [savedMemories] = useState<SavedMemory[]>(() => loadMemories());
  const events = useMemo(
    () => [...LIFE_EVENTS, ...savedMemories.map(toMemoryEvent)],
    [savedMemories],
  );
  const { sortOrder: gallerySortOrder, slot: gallerySlot } = useMemo(
    () => computeGalleryOrder(events),
    [events],
  );
  const [blobs] = useState<BlobData[]>(() =>
    generateBlobs(events, savedMemories, window.innerWidth <= 768),
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blobEls = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const annRafRef = useRef(0);
  const mainRafRef = useRef(0);
  const scale = useScaleFactor();

  /* ─── refs for animation state ─── */
  const morphProgress = useRef(galleryOnly ? 1 : 0);
  const morphTarget = useRef(galleryOnly ? 1 : 0);
  const modeRef = useRef<"blend" | "gallery">(galleryOnly ? "gallery" : "blend");
  const carouselIdx = useRef(0);
  const carouselTgt = useRef(0);
  const scrollVel = useRef(0);
  const capturedPos = useRef<{ left: number; top: number; size: number }[]>([]);
  const didCleanup = useRef(true);

  /* ─── panning state for blend mode ─── */
  const panOffset = useRef({ x: 0, y: 0 });
  const panVelocity = useRef({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const lastPanTime = useRef(0);
  const lastPanPos = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, scrollX: 0, scrollY: 0 });
  const panDragDist = useRef(0);

  const { phase: returnPhase } = useLandingReturn();
  const returnReveal = classicChrome && (returnPhase === "holding" || returnPhase === "landing");
  const revealArmed = returnPhase === "landing";
  const [fieldShown, setFieldShown] = useState(!returnReveal);
  const [headerShown, setHeaderShown] = useState(!returnReveal);
  useEffect(() => {
    if (!returnReveal) {
      setFieldShown(true);
      setHeaderShown(true);
      return;
    }
    setFieldShown(false);
    setHeaderShown(false);
    if (!revealArmed) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setFieldShown(true);
      setHeaderShown(true);
      return;
    }
    const frame = window.requestAnimationFrame(() => setFieldShown(true));
    const headerTimer = window.setTimeout(() => setHeaderShown(true), LANDING_RETURN.headerDelayMs);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(headerTimer);
    };
  }, [returnReveal, revealArmed]);
  const fieldFadeStyle = returnReveal
    ? { opacity: fieldShown ? 1 : 0, transition: revealArmed ? `opacity ${LANDING_RETURN.contentFadeMs}ms ease` : "none" }
    : undefined;
  const headerFadeStyle = returnReveal
    ? { opacity: headerShown ? 1 : 0, transition: revealArmed ? `opacity ${LANDING_RETURN.headerFadeMs}ms ease` : "none" }
    : undefined;

  /* ─── React state ─── */
  const [morphVal, setMorphVal] = useState(galleryOnly ? 1 : 0);
  const [activeIdx, setActiveIdx] = useState(() =>
    galleryOnly ? (gallerySortOrder[0] ?? 0) : 0,
  );
  const [annotations, setAnnotations] = useState<AnnPos[]>([]);
  const annotationsRef = useRef<AnnPos[]>([]);
  annotationsRef.current = annotations;
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [panState, setPanState] = useState({ x: 0, y: 0 });
  const headerCopyRef = useRef<HTMLDivElement>(null);
  const headerOnDarkRef = useRef(false);
  const [headerOnDark, setHeaderOnDark] = useState(false);
  const captionEls = useRef<(HTMLDivElement | null)[]>([]);
  const captionFxRef = useRef<CaptionFx[]>([]);
  const [captionFx, setCaptionFx] = useState<CaptionFx[]>([]);
  const entryRef = useRef(landingArrival);
  entryRef.current = landingArrival;
  const entryCapture = useRef<{
    inline: string; x: number; y: number; dotX: number; dotY: number;
    width: number; height: number; a: number; b: number; c: number; d: number;
    radius: string; blur: number; opacity: number;
  }[] | null>(null);
  const entryTime = landingArrival?.elapsed ?? 0;
  const entryReduced = landingArrival?.reducedMotion ?? false;
  const entryDesc = landingArrival ? 1 - flowProgress(entryTime, 0, entryReduced ? 80 : INK_ENTRY.descEnd) : 1;
  const entryHeader = landingArrival ? 1 - flowProgress(entryTime, entryReduced ? 80 : INK_ENTRY.descEnd,
    entryReduced ? 160 : INK_ENTRY.headerEnd) : 1;
  const markFlightStart = entryReduced ? 160 : INK_ENTRY.headerEnd;
  const markFlightEnd = entryReduced ? 320 : INK_ENTRY.markEnd;
  const entryMark = landingArrival
    ? flowProgress(entryTime, markFlightStart, markFlightEnd)
    : 0;
  const entryMarkInk = landingArrival
    ? flowProgress(entryTime, lerp(markFlightStart, markFlightEnd, 0.35), lerp(markFlightStart, markFlightEnd, 0.65))
    : 0;
  const entryLabels = landingArrival ? 1 - flowProgress(entryTime, entryReduced ? 160 : INK_ENTRY.headerEnd,
    entryReduced ? 320 : INK_ENTRY.labelsEnd) : 1;
  const headerGone = !!landingArrival && entryTime >= markFlightStart;
  const markRef = useRef<HTMLSpanElement>(null);
  const markFrom = useRef<{ top: number; left: number; fontSize: number; gap: number } | null>(null);
  const markInkFrom = useRef<string | null>(null);
  const [markHeld, setMarkHeld] = useState(false);
  if (!landingArrival) markInkFrom.current = null;
  else if (!markInkFrom.current) {
    markInkFrom.current = headerOnDark ? HEADER_LIGHT.mark : HEADER_INK.mark;
  }
  const markInk = markInkFrom.current
    ? lerpHex(markInkFrom.current, CHROME_GRAY, entryMarkInk)
    : headerOnDark ? HEADER_LIGHT.mark : HEADER_INK.mark;
  useLayoutEffect(() => {
    if (!landingArrival) {
      markFrom.current = null;
      setMarkHeld(false);
      return;
    }
    const readMark = () => {
      const el = markRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      markFrom.current = {
        top: r.top,
        left: r.left + r.width / 2,
        fontSize: parseFloat(cs.fontSize) || 16,
        gap: parseFloat(cs.gap) || 8,
      };
    };
    if (!headerGone) {
      readMark();
      if (markHeld) setMarkHeld(false);
      return;
    }
    readMark();
    setMarkHeld(true);
  }, [landingArrival, headerGone, markHeld]);
  const entryShrink = landingArrival && !entryReduced ? flowProgress(entryTime, INK_ENTRY.labelsEnd, INK_ENTRY.shrinkEnd) : 0;
  const entryPaper = landingArrival ? 1 - flowProgress(entryTime, entryReduced ? 320 : INK_ENTRY.pathHoldEnd,
    entryReduced ? INK_ENTRY.reducedEnd : INK_ENTRY.growEnd) : 1;

  /* ─── sizing ─── */
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const isMobile = vw <= 768;
  const canvasWidth = isMobile ? vw * 2 * 0.9 : vw * 1.5 * 0.9;
  const canvasHeight = isMobile ? vh * 0.9 : vh * 1.5 * 0.9;
  const baseSize = 120 * scale;
  const selSize = 260 * scale;
  const gap = 36 * scale;
  const centerY = vh * 0.73; // Moved carousel lower

  // Animate the actual CSS blobs from their live, panned positions. Capturing
  // their computed transform and shape preserves the original first frame.
  useLayoutEffect(() => {
    if (!landingArrival) {
      if (entryCapture.current) {
        entryCapture.current.forEach((captured, i) => {
          if (blobEls.current[i]) blobEls.current[i]!.style.cssText = captured.inline;
        });
        entryCapture.current = null;
      }
      return;
    }
    const container = containerRef.current;
    if (!container) return;
    const cr = container.getBoundingClientRect();
    if (!entryCapture.current) {
      panVelocity.current = { x: 0, y: 0 };
      isPanning.current = false;
      entryCapture.current = blobEls.current.map((el, i) => {
        const style = getComputedStyle(el!);
        const rect = el!.getBoundingClientRect();
        const matrix = new DOMMatrixReadOnly(style.transform);
        const s = parseFloat(style.scale) || 1;
        return { inline: el!.style.cssText, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2,
          dotX: annotations[i] ? cr.left + annotations[i].dotX : rect.left + rect.width / 2,
          dotY: annotations[i] ? cr.top + annotations[i].dotY : rect.top + rect.height / 2,
          width: parseFloat(style.width), height: parseFloat(style.height),
          a: matrix.a * s, b: matrix.b * s, c: matrix.c * s, d: matrix.d * s,
          radius: style.borderRadius, blur: blobs[i].blur * scale, opacity: blobs[i].opacity };
      });
    }
    const gather = entryReduced ? 0 : flowProgress(entryTime, INK_ENTRY.shrinkEnd, INK_ENTRY.pathEnd);
    const unfold = entryReduced ? 0 : flowProgress(entryTime, INK_ENTRY.pathHoldEnd, INK_ENTRY.unfoldEnd);
    const growth = inkGrowth(landingArrival);
    entryCapture.current.forEach((captured, i) => {
      const el = blobEls.current[i];
      if (!el) return;
      const slot = gallerySlot[i];
      const offset = slot - landingFocusSlot;
      const path = inkUnfoldSeat(vw, vh, slot, blobs.length, landingFocusSlot, unfold);
      const seat = carouselSeat(vw, vh, offset);
      // Out-of-range pointers keep travelling along the extended projection.
      // Only visible seats crossfade into artifacts; the rest leave the frame
      // physically, without fading away when the gallery's render range ends.
      const becomesArtifact = carouselContainsOffset(offset) && seat.opacity > 0;
      const x = lerp(lerp(captured.x, captured.dotX, entryShrink), path.x, gather);
      const y = lerp(lerp(captured.y, captured.dotY, entryShrink), path.y, gather);
      const pointerScale = lerp(1, path.scale, gather);
      const width = lerp(captured.width, INK_POINTER_SIZE * pointerScale, entryShrink);
      const height = lerp(captured.height, INK_POINTER_SIZE * pointerScale, entryShrink);
      el.style.animation = "none";
      el.style.scale = "1";
      el.style.left = `${x - cr.left}px`; el.style.top = `${y - cr.top}px`;
      el.style.width = `${width}px`; el.style.height = `${height}px`;
      el.style.transform = `matrix(${lerp(captured.a, 1, entryShrink)}, ${lerp(captured.b, 0, entryShrink)}, ${lerp(captured.c, 0, entryShrink)}, ${lerp(captured.d, 1, entryShrink)}, ${-width / 2}, ${-height / 2})`;
      el.style.borderRadius = entryShrink > 0.98 ? "50%" : captured.radius;
      el.style.filter = `blur(${captured.blur * (1 - entryShrink)}px)`;
      el.style.opacity = `${lerp(captured.opacity, 1, entryShrink) * lerp(1, becomesArtifact ? seat.opacity : 1, unfold) * (becomesArtifact || entryReduced ? 1 - flowProgress(growth, 0.01, entryReduced ? 1 : 0.24) : 1)}`;
      if (entryShrink > 0.98) el.style.background = blobs[i].color.match(/#[0-9a-f]{6}/i)?.[0] ?? MEMORY_COLORS[0];
    });
  }, [landingArrival, entryTime, entryShrink, entryReduced, gallerySlot, landingFocusSlot, blobs, scale, vw, vh]);

  /* ─── initial pan offset (center the canvas) ─── */
  useEffect(() => {
    const initialX = -(canvasWidth - vw) / 2;
    const initialY = -(canvasHeight - vh) / 2;
    panOffset.current = { x: initialX, y: initialY };
    setPanState({ x: initialX, y: initialY });
  }, []);

  /* ─── pan momentum animation ─── */
  useEffect(() => {
    let raf = 0;
    const decay = () => {
      const vx = panVelocity.current.x;
      const vy = panVelocity.current.y;
      if (Math.abs(vx) < 0.5 && Math.abs(vy) < 0.5) {
        panVelocity.current = { x: 0, y: 0 };
        return;
      }
      panVelocity.current = { x: vx * 0.92, y: vy * 0.92 };
      const maxX = 0;
      const minX = -(canvasWidth - vw);
      const maxY = 0;
      const minY = -(canvasHeight - vh);
      panOffset.current = {
        x: clamp(panOffset.current.x + vx, minX, maxX),
        y: clamp(panOffset.current.y + vy, minY, maxY),
      };
      setPanState({ ...panOffset.current });
      raf = requestAnimationFrame(decay);
    };
    if (!isPanning.current && (Math.abs(panVelocity.current.x) > 0.5 || Math.abs(panVelocity.current.y) > 0.5)) {
      raf = requestAnimationFrame(decay);
    }
    return () => cancelAnimationFrame(raf);
  }, [panState, canvasWidth, canvasHeight, vw, vh]);

  /* ─── grain canvas ─── */
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    let painted = false;
    const paint = () => {
      // Slightly larger grains, still sized relative to the display rather
      // than stretching a fixed texture across different viewport sizes.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const grainSize = 1.5;
      const width = classicChrome ? Math.max(1, Math.round(c.clientWidth * dpr / grainSize)) : 512;
      const height = classicChrome ? Math.max(1, Math.round(c.clientHeight * dpr / grainSize)) : 512;
      if (painted && c.width === width && c.height === height) return;
      c.width = width;
      c.height = height;
      const img = ctx.createImageData(width, height);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = v;
        img.data[i + 1] = v;
        img.data[i + 2] = v;
        img.data[i + 3] = 42;
      }
      ctx.putImageData(img, 0, 0);
      painted = true;
    };
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(c);
    window.addEventListener("resize", paint);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", paint);
    };
  }, [classicChrome]);

  /* ─── pause blob animations on hover ─── */
  useEffect(() => {
    if (morphVal > 0.05) return; // only in blend mode
    for (const el of blobEls.current) {
      if (el) {
        el.style.animationPlayState = hoveredIdx !== null ? "paused" : "running";
      }
    }
  }, [hoveredIdx, morphVal]);

  /* ─── gallery position ─── */
  const galleryPos = useCallback(
    (i: number, center: number) => {
      const off = i - center;
      const prox = Math.max(0, 1 - Math.abs(off) * 0.85);
      const sz = lerp(baseSize, selSize, prox * prox);
      // Center position with slight offset adjustment for perfect centering
      let x = vw / 2 + (selSize / 2 - baseSize / 2) * 0.03;
      if (Math.abs(off) > 0.01) {
        const dir = off > 0 ? 1 : -1;
        const steps = Math.abs(off);
        const whole = Math.floor(steps);
        const frac = steps - whole;
        let acc = selSize / 2 + gap;
        for (let s = 0; s < whole; s++) {
          const sp = Math.max(0, 1 - (s + 1) * 0.85);
          const ss = lerp(baseSize, selSize, sp * sp);
          acc += s === 0 ? ss / 2 : ss + gap;
        }
        if (frac > 0 && whole >= 1) {
          const sp = Math.max(0, 1 - (whole + 1) * 0.85);
          const ss = lerp(baseSize, selSize, sp * sp);
          acc += (ss + gap) * frac;
        } else if (frac > 0 && whole === 0) {
          acc *= frac;
        }
        x += dir * acc;
      }
      return { left: x, top: centerY, size: sz };
    },
    [vw, baseSize, selSize, gap, centerY],
  );

  /* ═══════════ MAIN ANIMATION LOOP ═══════════ */
  useEffect(() => {
    let last = performance.now();
    let prevMorphBucket = -1;
    let prevActive = -1;

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const container = containerRef.current;
      if (!container) {
        mainRafRef.current = requestAnimationFrame(tick);
        return;
      }
      const cr = container.getBoundingClientRect();

      const speed = 0.9;
      const prev = morphProgress.current;
      if (morphTarget.current === 1) {
        morphProgress.current = Math.min(1, prev + dt * speed);
      } else {
        morphProgress.current = Math.max(0, prev - dt * speed);
      }
      const mp = morphProgress.current;

      if (mp >= 1 && modeRef.current !== "gallery") modeRef.current = "gallery";
      if (mp <= 0 && modeRef.current !== "blend") {
        modeRef.current = "blend";
        capturedPos.current = [];
      }

      // restore when blend
      if (mp <= 0 && morphTarget.current === 0) {
        if (!didCleanup.current) {
          didCleanup.current = true;
          for (let i = 0; i < blobs.length; i++) {
            const el = blobEls.current[i];
            if (!el) continue;
            const blob = blobs[i];
            el.style.left = `${blob.x}%`;
            el.style.top = `${blob.y}%`;
            el.style.width = `${blob.size * scale}px`;
            el.style.height = `${blob.size * scale}px`;
            el.style.opacity = `${blob.opacity}`;
            el.style.filter = `blur(${blob.blur * scale}px)`;
            el.style.mixBlendMode = "multiply";
            el.style.transform = `translate(-50%, -50%) rotate(${blob.rotate}deg)`;
            el.style.boxShadow = "none";
            el.style.animation = `blobFloat${blob.id % 4} ${blob.animDuration}s ease-in-out ${blob.animDelay}s infinite, blobMorph ${blob.animDuration * 1.3}s ease-in-out ${blob.animDelay}s infinite, blobScale ${blob.animDuration * 0.8}s ease-in-out ${blob.animDelay * 0.5}s infinite`;
          }
        }
        const morphBucket = Math.round(mp * 50);
        if (morphBucket !== prevMorphBucket) {
          prevMorphBucket = morphBucket;
          setMorphVal(mp);
        }
        mainRafRef.current = requestAnimationFrame(tick);
        return;
      }

      if (mp > 0 || morphTarget.current === 1) {
        didCleanup.current = false;
        for (const el of blobEls.current) {
          if (el) el.style.animation = "none";
        }
      }

      const cSmooth = 4.5;
      carouselIdx.current = lerp(
        carouselIdx.current,
        carouselTgt.current,
        1 - Math.exp(-cSmooth * dt),
      );

      if (Math.abs(scrollVel.current) > 0.01) {
        carouselTgt.current += scrollVel.current * dt;
        carouselTgt.current = clamp(carouselTgt.current, 0, blobs.length - 1);
        scrollVel.current *= Math.exp(-3.5 * dt);
      }
      if (Math.abs(scrollVel.current) < 0.08) {
        scrollVel.current = 0;
        carouselTgt.current = Math.round(carouselTgt.current);
      }

      const newActive = clamp(Math.round(carouselIdx.current), 0, blobs.length - 1);

      for (let i = 0; i < blobs.length; i++) {
        const el = blobEls.current[i];
        if (!el) continue;
        const blob = blobs[i];

        const cap = capturedPos.current[i];
        const bLeft = cap ? cap.left : (blob.x / 100) * cr.width;
        const bTop = cap ? cap.top : (blob.y / 100) * cr.height;
        const bSize = cap ? cap.size : blob.size * scale;

        // Use gallery slot position (chronological) instead of raw blob index
        const slot = gallerySlot[i];
        const gp = galleryPos(slot, carouselIdx.current);
        const isActive = gallerySortOrder[newActive] === i;

        const stag = 0.2;
        const so = blob.distFromCentroid * stag;
        let bMp: number;
        if (morphTarget.current === 1) {
          bMp = clamp((mp - so * 0.4) / (1 - so * 0.4), 0, 1);
        } else {
          bMp = clamp(
            (mp - (1 - blob.distFromCentroid) * stag * 0.4) /
              (1 - (1 - blob.distFromCentroid) * stag * 0.4),
            0,
            1,
          );
        }

        const eased = gentleEase(bMp);
        const left = lerp(bLeft, gp.left, eased);
        const top = lerp(bTop, gp.top, eased);
        const size = lerp(bSize, gp.size, eased);

        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;

        const galOp = isActive
          ? 1
          : lerp(0.35, 0.55, Math.max(0, 1 - Math.abs(slot - carouselIdx.current) * 0.3));
        el.style.opacity = `${lerp(blob.opacity, galOp, mp)}`;
        el.style.filter = `blur(${lerp(blob.blur * scale, Math.min(blob.blur * 0.12, 3), mp)}px)`;
        el.style.mixBlendMode = mp > 0.55 ? "normal" : "multiply";

        const breathe =
          mp > 0 && mp < 1 ? Math.sin(eased * Math.PI) * 0.04 : 0;
        el.style.transform = `translate(-50%, -50%) scale(${1 + breathe})`;

        if (mp > 0.4) {
          const si = (mp - 0.4) / 0.6;
          el.style.boxShadow = isActive
            ? `0 ${24 * si}px ${64 * si}px rgba(0,0,0,${0.1 * si})`
            : `0 ${6 * si}px ${20 * si}px rgba(0,0,0,${0.03 * si})`;
        } else {
          el.style.boxShadow = "none";
        }
      }

      const morphBucket = Math.round(mp * 50);
      if (morphBucket !== prevMorphBucket) {
        prevMorphBucket = morphBucket;
        setMorphVal(mp);
      }
      // Map active slot back to blob index - this should match the centered blob
      const centeredSlot = Math.round(carouselIdx.current);
      const newActiveBlobIdx = gallerySortOrder[centeredSlot] ?? 0;
      if (newActiveBlobIdx !== prevActive) {
        prevActive = newActiveBlobIdx;
        setActiveIdx(newActiveBlobIdx);
      }

      mainRafRef.current = requestAnimationFrame(tick);
    };

    mainRafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(mainRafRef.current);
  }, [blobs, scale, galleryPos]);

  /* ─── annotation RAF (blend only) ─── */
  useEffect(() => {
    if (morphVal > 0.05 || hideAnnotations) {
      setAnnotations([]);
      return;
    }
    const update = () => {
      if (entryRef.current) { annRafRef.current = requestAnimationFrame(update); return; }
      const ct = containerRef.current;
      if (!ct) { annRafRef.current = requestAnimationFrame(update); return; }
      const cr = ct.getBoundingClientRect();
      const ps: { cx: number; cy: number; w: number; h: number }[] = [];
      for (const el of blobEls.current) {
        if (!el) { ps.push({ cx: 0, cy: 0, w: 0, h: 0 }); continue; }
        const r = el.getBoundingClientRect();
        ps.push({ cx: r.left + r.width / 2 - cr.left, cy: r.top + r.height / 2 - cr.top, w: r.width, h: r.height });
      }
      let cx = 0, cy = 0, n = 0;
      for (const p of ps) if (p.w > 0) { cx += p.cx; cy += p.cy; n++; }
      if (n) { cx /= n; cy /= n; }
      const anns: AnnPos[] = ps.map((p) => {
        if (p.w === 0) return { dotX: 0, dotY: 0, textAlign: "left" as const, anchorX: 0, anchorY: 0 };
        let dx = p.cx - cx, dy = p.cy - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 0) { dx /= d; dy /= d; } else { dx = 1; dy = 0; }
        const rad = Math.min(p.w, p.h) / 2;
        const dotX = p.cx + dx * rad * 0.85;
        const dotY = p.cy + dy * rad * 0.85;
        return { dotX, dotY, textAlign: (dx >= 0 ? "left" : "right") as "left" | "right", anchorX: dotX + dx * 8, anchorY: dotY + dy * 8 + 18 };
      });
      setAnnotations(anns);
      annRafRef.current = requestAnimationFrame(update);
    };
    annRafRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(annRafRef.current);
  }, [morphVal, hideAnnotations]);

  /* ─── capture positions ─── */
  const capture = useCallback(() => {
    const ct = containerRef.current;
    if (!ct) return;
    const cr = ct.getBoundingClientRect();
    capturedPos.current = blobEls.current.map((el, i) => {
      if (!el) return { left: (blobs[i].x / 100) * cr.width, top: (blobs[i].y / 100) * cr.height, size: blobs[i].size * scale };
      const r = el.getBoundingClientRect();
      return { left: r.left - cr.left + r.width / 2, top: r.top - cr.top + r.height / 2, size: r.width };
    });
  }, [blobs, scale]);

  /* ─── morph triggers ─── */
  const morphToGallery = useCallback(() => {
    if (morphTarget.current === 1) return;
    capture();
    morphTarget.current = 1;
    modeRef.current = "gallery";
  }, [capture]);

  const morphToBlend = useCallback(() => {
    if (galleryOnly) {
      onGalleryExit?.();
      return;
    }
    if (morphTarget.current === 0) return;
    capture();
    morphTarget.current = 0;
    onGalleryExit?.();
  }, [galleryOnly, capture, onGalleryExit]);

  /* ─── navigate to gallery with specific blob selected ─── */
  const morphToGalleryAt = useCallback((blobIdx: number) => {
    const slot = gallerySlot[blobIdx];
    carouselTgt.current = slot;
    carouselIdx.current = slot;
    setActiveIdx(blobIdx);
    setHoveredIdx(null);
    morphToGallery();
  }, [morphToGallery, gallerySlot]);

  /* ─── open gallery on mount (homescreen G shortcut) ─── */
  useEffect(() => {
    if (galleryOnly || !openGallery || blobs.length === 0) return;
    const defaultSlot = 0;
    const id = requestAnimationFrame(() => {
      // Second frame so blob layout is measurable for capture()
      requestAnimationFrame(() => {
        carouselTgt.current = defaultSlot;
        carouselIdx.current = defaultSlot;
        setActiveIdx(gallerySortOrder[defaultSlot] ?? 0);
        morphToGallery();
      });
    });
    return () => cancelAnimationFrame(id);
  }, [galleryOnly, openGallery, blobs.length, gallerySortOrder, morphToGallery]);

  /* ─── keyboard ─── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (morphTarget.current === 1 && morphProgress.current > 0.5) {
        if (e.key === "ArrowLeft") {
          carouselTgt.current = clamp(Math.round(carouselTgt.current) - 1, 0, blobs.length - 1);
        } else if (e.key === "ArrowRight") {
          carouselTgt.current = clamp(Math.round(carouselTgt.current) + 1, 0, blobs.length - 1);
        } else if (e.key === "Escape") {
          morphToBlend();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [blobs.length, morphToBlend]);

  /* ─── click ─── */
  const handleClick = useCallback(() => {
    // Don't trigger click if user just panned
    if (panDragDist.current > 5) {
      panDragDist.current = 0;
      return;
    }
    panDragDist.current = 0;
    if (classicChrome) return; // landing: blobs stay put; Enter is the way in
    if (hoveredIdx !== null) return; // don't morph while hovering an annotation
    if (morphTarget.current === 0 && morphProgress.current < 0.1) {
      // Default: open gallery at the oldest event (slot 0)
      const defaultSlot = 0;
      carouselTgt.current = defaultSlot;
      carouselIdx.current = defaultSlot;
      setActiveIdx(gallerySortOrder[defaultSlot]);
      morphToGallery();
      return;
    }
    if (morphTarget.current === 1 && morphProgress.current > 0.5) {
      morphToBlend();
      return;
    }
  }, [classicChrome, morphToGallery, morphToBlend, hoveredIdx]);

  /* ─── wheel ─── */
  const handleWheel = useCallback((e: React.WheelEvent) => {
    // In gallery mode, scroll the carousel
    if (morphTarget.current === 1 && morphProgress.current > 0.7) {
      const delta = (e.deltaX || e.deltaY) * 0.008;
      scrollVel.current += delta * 6;
      return;
    }
    // In blend mode, pan the canvas
    if (morphTarget.current === 0 && morphProgress.current < 0.1) {
      const maxX = 0;
      const minX = -(canvasWidth - vw);
      const maxY = 0;
      const minY = -(canvasHeight - vh);
      panOffset.current = {
        x: clamp(panOffset.current.x - e.deltaX * 0.8, minX, maxX),
        y: clamp(panOffset.current.y - e.deltaY * 0.8, minY, maxY),
      };
      setPanState({ ...panOffset.current });
    }
  }, [canvasWidth, canvasHeight, vw, vh]);

  /* ─── panning (blend mode drag + gallery mode drag) ─── */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    panDragDist.current = 0;
    // Gallery drag
    if (morphTarget.current === 1 && morphProgress.current > 0.7) {
      isDragging.current = true;
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        scrollX: 0,
        scrollY: 0,
      };
      return;
    }
    // Blend mode panning
    if (morphTarget.current === 0 && morphProgress.current < 0.1) {
      isPanning.current = true;
      panDragDist.current = 0;
      panStart.current = {
        x: e.clientX,
        y: e.clientY,
        panX: panOffset.current.x,
        panY: panOffset.current.y,
      };
      lastPanTime.current = performance.now();
      lastPanPos.current = { x: e.clientX, y: e.clientY };
      panVelocity.current = { x: 0, y: 0 };
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Gallery drag
    if (isDragging.current) {
      const dx = e.clientX - dragStart.current.x;
      panDragDist.current += Math.abs(dx);
      scrollVel.current = -dx * 0.02;
      dragStart.current.x = e.clientX;
      return;
    }
    // Blend mode panning
    if (isPanning.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      panDragDist.current = Math.sqrt(dx * dx + dy * dy);
      const maxX = 0;
      const minX = -(canvasWidth - vw);
      const maxY = 0;
      const minY = -(canvasHeight - vh);
      panOffset.current = {
        x: clamp(panStart.current.panX + dx, minX, maxX),
        y: clamp(panStart.current.panY + dy, minY, maxY),
      };
      setPanState({ ...panOffset.current });
      // Track velocity for momentum
      const now = performance.now();
      const dt = Math.max(1, now - lastPanTime.current);
      panVelocity.current = {
        x: (e.clientX - lastPanPos.current.x) / dt * 16,
        y: (e.clientY - lastPanPos.current.y) / dt * 16,
      };
      lastPanTime.current = now;
      lastPanPos.current = { x: e.clientX, y: e.clientY };
    }
  }, [canvasWidth, canvasHeight, vw, vh]);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    if (isPanning.current) {
      isPanning.current = false;
      // Momentum is handled by the pan momentum effect
      setPanState({ ...panOffset.current });
    }
  }, []);

  /* ─── landing header + captions: ink follows the field; captions
        near the header or under another label blur in place. ─── */
  useEffect(() => {
    if (!classicChrome) return;
    let raf = 0;
    let last = performance.now();
    const ENTER_DARK = 0.46;
    const LEAVE_DARK = 0.58;
    const INNER_PAD = 36;
    const BAND = 90;
    const TAU = 0.16;

    const lumaAt = (px: number, py: number) => {
      let luma = PAPER_LUMA;
      for (let i = 0; i < blobs.length; i++) {
        const el = blobEls.current[i];
        if (!el) continue;
        const br = el.getBoundingClientRect();
        const rx = br.width / 2 || 1;
        const ry = br.height / 2 || 1;
        const nx = (px - (br.left + rx)) / rx;
        const ny = (py - (br.top + ry)) / ry;
        if (nx * nx + ny * ny > 1) continue;
        const hex = COLOR_PALETTE[blobs[i].shape.colorIndex % COLOR_PALETTE.length].color;
        luma = Math.min(luma, hexLuma(hex) * blobs[i].opacity);
      }
      return luma;
    };

    const onDarkFrom = (avg: number, was: boolean) =>
      was ? avg < LEAVE_DARK : avg < ENTER_DARK;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const copy = headerCopyRef.current;
      if (entryRef.current) return;
      if (!copy) return;
      const hr = copy.getBoundingClientRect();
      if (hr.width < 2 || hr.height < 2) return;

      const kx = (hr.left + hr.right) / 2;
      const ky = (hr.top + hr.bottom) / 2;
      const follow = 1 - Math.exp(-dt / TAU);

      const xs = [0.18, 0.5, 0.82];
      const ys = [0.22, 0.78];
      let sum = 0;
      let n = 0;
      for (const fx of xs) {
        for (const fy of ys) {
          sum += lumaAt(hr.left + hr.width * fx, hr.top + hr.height * fy);
          n++;
        }
      }
      const headerDark = onDarkFrom(sum / (n || 1), headerOnDarkRef.current);
      if (headerDark !== headerOnDarkRef.current) {
        headerOnDarkRef.current = headerDark;
        setHeaderOnDark(headerDark);
      }

      const laid = blobs.map((_, i) => {
        const cap = captionEls.current[i];
        if (!cap) return null;
        const cr = cap.getBoundingClientRect();
        if (cr.width < 2 || cr.height < 2) return null;
        const cx = cr.left + cr.width / 2;
        const cy = cr.top + cr.height / 2;
        const z = cy + blobs[i].size * 0.12 + i * 0.01;
        return { i, cr, cx, cy, z };
      });
      const ranked = laid
        .filter((row): row is NonNullable<typeof row> => !!row)
        .sort((a, b) => a.z - b.z);
      const stackOf = new Array<number>(blobs.length).fill(0);
      ranked.forEach((row, rank) => { stackOf[row.i] = rank; });

      const cover = new Array<number>(blobs.length).fill(0);
      for (const under of ranked) {
        for (const over of ranked) {
          if (over.z <= under.z) continue;
          const ow = Math.min(under.cr.right, over.cr.right) - Math.max(under.cr.left, over.cr.left);
          const oh = Math.min(under.cr.bottom, over.cr.bottom) - Math.max(under.cr.top, over.cr.top);
          if (ow <= 0 || oh <= 0) continue;
          const amount = (ow * oh) / (under.cr.width * under.cr.height);
          if (amount > cover[under.i]) cover[under.i] = amount;
        }
      }

      const nextFx: CaptionFx[] = blobs.map((_, i) => {
        const prev = captionFxRef.current[i] ?? {
          progress: 0,
          overlap: 0,
          stack: 0,
        };
        const row = laid[i];
        if (!row) {
          return {
            ...prev,
            progress: prev.progress + (0 - prev.progress) * follow,
            overlap: prev.overlap + (0 - prev.overlap) * follow,
          };
        }

        const { cr, cx, cy } = row;
        const rx = hr.width / 2 + INNER_PAD + cr.width / 2;
        const ry = hr.height / 2 + INNER_PAD + cr.height / 2;
        const d = Math.hypot((cx - kx) / rx, (cy - ky) / ry);
        const outer = 1 + BAND / Math.max(rx, ry);
        const headerTarget = clamp((outer - d) / (outer - 1), 0, 1);

        const progress = prev.progress + (headerTarget - prev.progress) * follow;
        const overlap = prev.overlap + (cover[i] - prev.overlap) * follow;
        return { progress, overlap, stack: stackOf[i] };
      });

      const changed =
        nextFx.length !== captionFxRef.current.length ||
        nextFx.some((fx, i) => {
          const prev = captionFxRef.current[i];
          return (
            !prev ||
            Math.abs(prev.progress - fx.progress) > 0.01 ||
            Math.abs(prev.overlap - fx.overlap) > 0.01 ||
            prev.stack !== fx.stack
          );
        });
      if (changed) {
        captionFxRef.current = nextFx;
        setCaptionFx(nextFx);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [classicChrome, blobs]);

  /* ─── derived ─── */
  const showGooey = morphVal < 0.5 && entryShrink < 0.34;
  const gooeyT = clamp(Math.max(morphVal * 2.2, entryShrink * 3), 0, 1);

  // Connection lines: from hovered event's dot to each connected event's dot
  const hoveredConns = hoveredIdx !== null ? getConnections(hoveredIdx) : [];
  const labelsFade = clamp(1 - morphVal * 5, 0, 1) * entryLabels;
  const renderAnnotationMarks = (bind: boolean) => blobs.map((blob, i) => {
    const a = annotations[i];
    if (!a || (a.dotX === 0 && a.dotY === 0)) {
      if (bind) captionEls.current[i] = null;
      return null;
    }
    const isPulsating = connectionCount(i) > 2;
    const isHovered = hoveredIdx === i;
    const isConnectedToHovered = hoveredIdx !== null && hoveredConns.includes(i);
    const dimmed = hoveredIdx !== null && !isHovered && !isConnectedToHovered;
    const fx = classicChrome ? captionFx[i] : undefined;
    const headerNear = fx?.progress ?? 0;
    const overlap = fx?.overlap ?? 0;
    const stack = fx?.stack ?? i;
    const buried = headerNear > 0.45 || overlap > 0.45;
    const captionColor = classicChrome ? LANDING_INK.color : BLOB_CAPTION_COLOR;
    const dotColor = classicChrome ? LANDING_INK.color : BLOB_CAPTION_COLOR;
    const visible = dimmed ? 0.2 : 1;
    const soften = Math.max(headerNear, overlap) * 6;
    const softenFilter = soften > 0.1 ? `blur(${soften}px)` : "none";

    return (
      <div
        key={`${bind ? "a" : "m"}-${blob.id}`}
        onMouseEnter={bind ? (e) => { e.stopPropagation(); setHoveredIdx(i); } : undefined}
        onMouseLeave={bind ? () => setHoveredIdx(null) : undefined}
        onClick={bind ? (e) => {
          e.stopPropagation();
          if (!classicChrome) morphToGalleryAt(i);
        } : undefined}
        style={{ pointerEvents: bind && !buried ? "auto" : "none" }}
      >
        <div
          className="absolute"
          style={{
            left: `${a.dotX}px`,
            top: `${a.dotY}px`,
            width: BLOB_DOT,
            height: BLOB_DOT,
            borderRadius: "50%",
            backgroundColor: dotColor,
            transform: "translate(-50%, -50%)",
            zIndex: 22 + stack,
            opacity: dimmed ? 0.25 : 1,
            filter: softenFilter,
          }}
        />
        {isPulsating && (
          <div
            className="absolute"
            style={{
              left: `${a.dotX}px`,
              top: `${a.dotY}px`,
              width: BLOB_DOT,
              height: BLOB_DOT,
              borderRadius: "50%",
              border: `${BLOB_RING_STROKE}px solid ${dotColor}`,
              backgroundColor: "transparent",
              boxSizing: "content-box",
              transform: "translate(-50%, -50%)",
              zIndex: 21 + stack,
              opacity: dimmed ? 0.15 : 1,
              filter: softenFilter,
              animation: "ringPulse 2.5s ease-in-out infinite",
              ["--ring-from" as string]: `${BLOB_DOT}px`,
              ["--ring-to" as string]: `${BLOB_DOT * 5.6}px`,
            }}
          />
        )}
        <div
          ref={bind ? (el) => { captionEls.current[i] = el; } : undefined}
          className="absolute"
          style={{
            left: `${a.anchorX}px`,
            top: `${a.anchorY}px`,
            transform: a.textAlign === "right" ? "translateX(-100%)" : "translateX(0)",
            zIndex: 22 + stack,
            cursor: "pointer",
            padding: "4px 8px",
            margin: "-4px -8px",
            color: captionColor,
            pointerEvents: buried ? "none" : "auto",
          }}
        >
          <div style={{ opacity: visible, filter: softenFilter }}>
            <div
              style={{
                fontFamily: SERIF_CJK,
                fontStyle: "normal",
                fontSize: BLOB_CAPTION_SIZE,
                color: "inherit",
                opacity: 0.8,
                letterSpacing: "0.06em",
                marginBottom: 4,
                whiteSpace: "nowrap",
              }}
            >
              {blob.year}
            </div>
            <div
              style={{
                fontFamily: SERIF,
                fontStyle: "italic",
                fontSize: BLOB_CAPTION_SIZE,
                color: "inherit",
                opacity: 0.9,
                lineHeight: blob.event.includes("\n") ? 1.5 : "normal",
                whiteSpace: blob.event.includes("\n") ? "pre-line" : "nowrap",
                letterSpacing: SERIF_ITALIC_TRACKING,
              }}
            >
              {blob.event}
            </div>
            {blob.year === "2026" && (
              <div
                style={{
                  fontFamily: "Georgia, serif",
                  fontStyle: "italic",
                  fontSize: 11,
                  color: "inherit",
                  opacity: 0.35,
                  marginTop: 8,
                  whiteSpace: "nowrap",
                }}
              >
                ...
              </div>
            )}
          </div>
        </div>
      </div>
    );
  });

  return (
    <div
      ref={viewportRef}
      inert={!!landingArrival}
      data-ink-stage={!landingArrival ? "field" : entryTime < INK_ENTRY.descEnd ? "desc" : entryTime < INK_ENTRY.headerEnd ? "header" : entryTime < INK_ENTRY.labelsEnd ? "labels"
        : entryTime < INK_ENTRY.shrinkEnd ? "shrink" : entryTime < INK_ENTRY.pathEnd ? "gather" : entryTime < INK_ENTRY.pathHoldEnd ? "curve"
        : entryTime < INK_ENTRY.unfoldEnd ? "unfold" : "artifacts"}
      className="relative w-full h-screen overflow-hidden cursor-pointer select-none"
      style={{
        background: classicChrome
          ? (landingArrival ? `rgba(228,228,230,${entryPaper})` : LANDING_PAPER)
          : (landingArrival ? `rgba(237,237,238,${entryPaper})` : PAPER),
        isolation: classicChrome ? "isolate" : undefined,
      }}
      onClick={handleClick}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* SVG Filters */}
      <svg className="absolute w-0 h-0" aria-hidden="true">
        <defs>
          <filter id="gooey">
            <feGaussianBlur in="SourceGraphic" stdDeviation={lerp(18, 2, gooeyT)} result="blur" />
            <feColorMatrix
              in="blur" mode="matrix"
              values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${lerp(22, 1, gooeyT)} ${lerp(-9, 0, gooeyT)}`}
              result="gooey"
            />
            <feComposite in="SourceGraphic" in2="gooey" operator="atop" />
          </filter>
        </defs>
      </svg>

      <div style={{ position: "absolute", inset: 0, ...fieldFadeStyle }}>
      {/* ═══ PANNABLE INNER CANVAS ═══ */}
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: `${canvasWidth}px`,
          height: `${canvasHeight}px`,
          transform: classicChrome && morphVal < 0.05 && !panState.x && !panState.y
            ? undefined
            : morphVal < 0.05
              ? `translate(${panState.x}px, ${panState.y}px)`
              : `translate(${-(canvasWidth - vw) / 2 + vw * 0.15}px, ${-(canvasHeight - vh) / 2 - vh * 0.1}px)`,
          transition: morphVal > 0.05 ? "transform 0.6s ease" : "none",
          willChange: classicChrome ? undefined : "transform",
        }}
      >
        {/* ═══ BLOB LAYER ═══ */}
        <div className="absolute inset-0" style={{ filter: showGooey ? "url(#gooey)" : "none" }}>
          {blobs.map((blob, i) => (
            <div
              key={blob.id}
              ref={(el) => { blobEls.current[i] = el; }}
              className="absolute"
              style={{
                left: `${blob.x}%`,
                top: `${blob.y}%`,
                width: `${blob.size * scale}px`,
                height: `${blob.size * scale}px`,
                background: blob.color,
                borderRadius: blob.borderRadius,
                opacity: blob.opacity,
                filter: `blur(${blob.blur * scale}px)`,
                mixBlendMode: "multiply",
                transform: `translate(-50%, -50%) rotate(${blob.rotate}deg)`,
                animation: `blobFloat${blob.id % 4} ${blob.animDuration}s ease-in-out ${blob.animDelay}s infinite,
                  blobMorph ${blob.animDuration * 1.3}s ease-in-out ${blob.animDelay}s infinite,
                  blobScale ${blob.animDuration * 0.8}s ease-in-out ${blob.animDelay * 0.5}s infinite`,
                willChange: classicChrome ? undefined : "transform, left, top, width, height",
              }}
            />
          ))}
        </div>

        {/* ═══ AMBIENT BLOBS ═══ */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ opacity: clamp(1 - morphVal * 3, 0, 1) * (landingArrival ? (1 - entryShrink) * entryPaper : 1) }}
        >
          <div className="absolute" style={{
            left: "20%", top: "30%",
            width: `${500 * scale}px`, height: `${500 * scale}px`,
            background: "radial-gradient(circle, rgba(26,138,110,0.25), transparent 70%)",
            borderRadius: "50%", filter: `blur(${60 * scale}px)`,
            animation: "ambientDrift1 20s ease-in-out infinite",
            animationPlayState: hoveredIdx !== null ? "paused" : "running",
          }} />
          <div className="absolute" style={{
            left: "60%", top: "50%",
            width: `${450 * scale}px`, height: `${450 * scale}px`,
            background: "radial-gradient(circle, rgba(93,212,224,0.2), transparent 70%)",
            borderRadius: "50%", filter: `blur(${50 * scale}px)`,
            animation: "ambientDrift2 18s ease-in-out infinite",
            animationPlayState: hoveredIdx !== null ? "paused" : "running",
          }} />
          <div className="absolute" style={{
            left: "45%", top: "65%",
            width: `${400 * scale}px`, height: `${400 * scale}px`,
            background: "radial-gradient(circle, rgba(242,196,170,0.25), transparent 70%)",
            borderRadius: "50%", filter: `blur(${55 * scale}px)`,
            animation: "ambientDrift3 22s ease-in-out infinite",
            animationPlayState: hoveredIdx !== null ? "paused" : "running",
          }} />
        </div>

        {/* ═══ CONNECTION LINES (SVG overlay) ═══ */}
        {hoveredIdx !== null && annotations.length > 0 && morphVal < 0.05 && (
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ zIndex: 18 }}
          >
            {hoveredConns.map((connIdx) => {
              const from = annotations[hoveredIdx];
              const to = annotations[connIdx];
              if (!from || !to || (from.dotX === 0 && from.dotY === 0) || (to.dotX === 0 && to.dotY === 0)) return null;
              // Curved line via quadratic bezier
              const mx = (from.dotX + to.dotX) / 2;
              const my = (from.dotY + to.dotY) / 2;
              const dx = to.dotX - from.dotX;
              const dy = to.dotY - from.dotY;
              const len = Math.sqrt(dx * dx + dy * dy);
              // perpendicular offset for curve
              const perpX = -dy / (len || 1) * len * 0.12;
              const perpY = dx / (len || 1) * len * 0.12;
              const cx = mx + perpX;
              const cy = my + perpY;
              return (
                <path
                  key={`conn-${hoveredIdx}-${connIdx}`}
                  d={`M ${from.dotX} ${from.dotY} Q ${cx} ${cy} ${to.dotX} ${to.dotY}`}
                  fill="none"
                  stroke="#1a1a1a"
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                  opacity={0.5}
                  className="connection-line-anim"
                />
              );
            })}
          </svg>
        )}

        {!classicChrome && (
          <div className="absolute inset-0" style={{ opacity: labelsFade, zIndex: 19 }}>
            {renderAnnotationMarks(!classicChrome)}
          </div>
        )}
      </div>{/* end pannable inner canvas */}

      {/* Grain sits on the blobs, under the landing type so exclusion can read the field. */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.48]"
        style={{ mixBlendMode: "overlay", imageRendering: classicChrome ? "auto" : "pixelated", opacity: landingArrival ? 0.48 * entryPaper : undefined }}
      />
      <div className="absolute inset-0 pointer-events-none" style={{
        opacity: entryPaper,
        background: classicChrome
          ? "radial-gradient(ellipse at center, transparent 22%, rgba(0,0,0,0.2) 100%)"
          : "radial-gradient(ellipse at center, transparent 32%, rgba(0,0,0,0.14) 100%)",
      }} />

      {/* ═══ GALLERY TEXT ═══ */}
      <div
        className="absolute inset-0 pointer-events-none flex items-end justify-center"
        style={{ opacity: clamp((morphVal - 0.65) / 0.35, 0, 1), zIndex: 20, paddingBottom: `${vh * 0.22}px` }}
      >
        <div className="text-center" style={{ fontFamily: SERIF }}>
          <p style={{ color: CHROME_GRAY, marginBottom: 6, fontStyle: "italic", letterSpacing: SERIF_ITALIC_TRACKING }}>{blobs[activeIdx]?.event}</p>
          <p style={{ color: "#999", fontStyle: "normal", fontFamily: SERIF_CJK }}>{blobs[activeIdx]?.year}</p>
        </div>
      </div>

      {/* ═══ GALLERY 3D SHAPE VIEWER ═══ */}
      <div
        className="absolute inset-0 pointer-events-none flex items-center justify-center"
        style={{ 
          opacity: clamp((morphVal - 0.65) / 0.35, 0, 1), 
          zIndex: 15,
          paddingBottom: `${vh * 0.1}px`, // Moved 3D viewer 10vh upward
        }}
      >
        {blobs[activeIdx] && blobs[activeIdx].shape && (
          <div
            style={{
              width: "clamp(310px, 33.4vw, 430px)",
              height: "clamp(310px, 33.4vw, 430px)",
              position: "relative",
              overflow: "visible",
              // The wrapper above is pointer-events:none so the carousel keeps
              // the rest of the screen. The artifact itself has to take the
              // pointer back, or OrbitControls never sees a drag and the form
              // only ever appears to turn on its own clock.
              pointerEvents: "auto",
            }}
          >
            <SceneViewer
              modelPath={blobs[activeIdx].shape.modelPath}
              fluidity={blobs[activeIdx].shape.fluidity}
              evolve={blobs[activeIdx].shape.evolve}
              bumpAmount={blobs[activeIdx].shape.bumpAmount}
              autoRotate={true}
              ready={morphVal > 0.7}
              constrainedViewport
              rectAreaLightColors={{
                color1: COLOR_PALETTE[blobs[activeIdx].shape.colorIndex].light1,
                color2: COLOR_PALETTE[blobs[activeIdx].shape.colorIndex].light2,
                matColor: COLOR_PALETTE[blobs[activeIdx].shape.colorIndex].color,
              }}
              style={{
                width: "100%",
                height: "100%",
              }}
            />
          </div>
        )}
      </div>

      {/* ═══ HINT ═══ */}
      <div
        className="absolute bottom-8 left-0 right-0 text-center pointer-events-none"
        style={{
          opacity: clamp((morphVal - 0.8) / 0.2, 0, 0.45),
          color: "#aaa",
          fontFamily: SANS,
          fontSize: 12,
          letterSpacing: "0.05em",
          zIndex: 20,
        }}
      >
        Scroll to browse &middot; Click to return
      </div>

      {/* Wordmark stays through gallery; the rest of the homescreen chrome dissolves.
          The classic landing overlay carries its own mark, so skip this one there. */}
      {onNewMemory && !classicChrome && (
        <PageHeader layout="absolute" link={false} style={{ zIndex: 26 }} />
      )}

      <GalleryViewToggle
        view="carousel"
        onToggle={onToggleGrid ?? (() => {})}
        visible={morphVal > 0.65 && !!onToggleGrid}
      />

      {/* ═══ HOMESCREEN OVERLAY (blend mode only) ═══ */}
      {onNewMemory && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={classicChrome ? {
            mixBlendMode: LANDING_INK.mixBlendMode,
            ...(landingArrival ? { opacity: 1 } : morphVal > 0 ? {
              opacity: clamp(1 - morphVal * 4, 0, 1),
              transition: "opacity 0.3s ease",
            } : {}),
          } : {
            opacity: landingArrival ? 1 : clamp(1 - morphVal * 4, 0, 1),
            zIndex: 25,
            transition: landingArrival ? "none" : "opacity 0.3s ease",
          }}
        >
          {classicChrome ? (
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: canvasWidth,
                height: canvasHeight,
                ...(labelsFade < 1 ? { opacity: labelsFade } : {}),
              }}
            >
              {renderAnnotationMarks(true)}
            </div>
          ) : (
            <>
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: 222,
                  borderRadius: 0,
                  background: "linear-gradient(to top, rgba(27,27,27,0.4), rgba(129,129,129,0))",
                  backdropFilter: "blur(40px)",
                  WebkitBackdropFilter: "blur(40px)",
                  maskImage: "linear-gradient(to bottom, transparent, black)",
                  WebkitMaskImage: "linear-gradient(to bottom, transparent, black)",
                  zIndex: 1,
                }}
              />

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
                <NewMomoryIdle label={ctaLabel} showPlus={showPlus} />
              </div>
            </>
          )}
        </div>
      )}

      {classicChrome && onNewMemory && (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            ...LANDING_MONO,
            ...(landingArrival ? { opacity: 1 } : morphVal > 0 ? {
              opacity: clamp(1 - morphVal * 4, 0, 1),
            } : {}),
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: canvasWidth,
              height: canvasHeight,
              ...(labelsFade < 1 ? { opacity: labelsFade } : {}),
            }}
          >
            {renderAnnotationMarks(false)}
          </div>
        </div>
      )}
      </div>

      {classicChrome && onNewMemory && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 26,
            ...(landingArrival ? { opacity: 1 } : morphVal > 0 ? {
              opacity: clamp(1 - morphVal * 4, 0, 1),
              transition: "opacity 0.3s ease",
            } : {}),
            ...headerFadeStyle,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 28,
            }}
          >
            <div
              ref={headerCopyRef}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                gap: 28,
                width: "fit-content",
              }}
            >
              <p
                style={{
                  fontFamily: SERIF,
                  color: headerOnDark ? HEADER_LIGHT.desc : HEADER_INK.desc,
                  fontSize: HEADER_DESC_SIZE,
                  letterSpacing: "0.24px",
                  lineHeight: 1.5,
                  margin: 0,
                  padding: 0,
                  textAlign: "center",
                  width: 0,
                  minWidth: "100%",
                  boxSizing: "border-box",
                  opacity: entryDesc * (returnReveal && !headerShown ? 0 : 1),
                  transition: returnReveal && revealArmed
                    ? `opacity ${LANDING_RETURN.headerFadeMs}ms ease, ${HEADER_COLOR_FADE}`
                    : HEADER_COLOR_FADE,
                }}
              >
                An interactive memory sculpting tool to trace how memory evolves.
              </p>
              <button
                type="button"
                className="landing-enter-btn"
                disabled={!!landingArrival}
                onClick={(e) => {
                  e.stopPropagation();
                  onNewMemory();
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 16,
                  margin: 0,
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  appearance: "none",
                  WebkitAppearance: "none",
                  cursor: "pointer",
                  pointerEvents: landingArrival || (returnReveal && !headerShown) ? "none" : "auto",
                  color: headerOnDark ? HEADER_LIGHT.mark : HEADER_INK.mark,
                  fontSize: "clamp(12px, calc(12px + (16 - 12) * ((100vw - 390px) / (1024 - 390))), 16px)",
                  lineHeight: 1.5,
                  transition: HEADER_COLOR_FADE,
                }}
              >
                <span
                  style={{
                    fontFamily: SANS,
                    fontSize: HEADER_DESC_SIZE + 1,
                    letterSpacing: "0.01em",
                    whiteSpace: "nowrap",
                    marginRight: -4,
                    opacity: entryHeader * (returnReveal && !headerShown ? 0 : 1),
                    transition: returnReveal && revealArmed
                      ? `opacity ${LANDING_RETURN.headerFadeMs}ms ease`
                      : undefined,
                  }}
                >
                  {ctaLabel}
                </span>
                {!markHeld && (
                  <span
                    ref={markRef}
                    style={{
                      fontFamily: SERIF_CJK,
                      fontStyle: "normal",
                      letterSpacing: PAGE_HEADER_MARK.letterSpacing,
                      textTransform: "lowercase",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      color: "inherit",
                    }}
                  >
                    <span>滲む</span>
                    <span>nijimu</span>
                  </span>
                )}
                <span className="landing-enter-arrow" aria-hidden style={{ opacity: entryHeader }}>
                  <span className="landing-enter-stem" />
                  <span className="landing-enter-caret" />
                </span>
              </button>
            </div>
          </div>
          {markHeld && markFrom.current && (
            <span
              style={{
                position: "fixed",
                left: lerp(markFrom.current.left, vw / 2, entryMark),
                top: lerp(markFrom.current.top, PAGE_HEADER_MARK.top, entryMark),
                transform: "translateX(-50%)",
                fontFamily: SERIF_CJK,
                fontStyle: "normal",
                fontSize: lerp(markFrom.current.fontSize, PAGE_HEADER_MARK.fontSize, entryMark),
                letterSpacing: PAGE_HEADER_MARK.letterSpacing,
                lineHeight: 1.5,
                textTransform: "lowercase",
                display: "flex",
                alignItems: "center",
                gap: lerp(markFrom.current.gap, PAGE_HEADER_MARK.gap, entryMark),
                color: markInk,
                whiteSpace: "nowrap",
                margin: 0,
                padding: 0,
                zIndex: 50,
                pointerEvents: "none",
              }}
            >
              <span>滲む</span>
              <span>nijimu</span>
            </span>
          )}
        </div>
      )}

      {/* ═══ KEYFRAMES ═══ */}
      <style>{`
        @keyframes blobFloat0 {
          0%, 100% { transform: translate(-50%, -50%) rotate(0deg) translateX(0) translateY(0); }
          25% { transform: translate(-50%, -50%) rotate(15deg) translateX(40px) translateY(-60px); }
          50% { transform: translate(-50%, -50%) rotate(-10deg) translateX(-30px) translateY(50px); }
          75% { transform: translate(-50%, -50%) rotate(20deg) translateX(60px) translateY(30px); }
        }
        @keyframes blobFloat1 {
          0%, 100% { transform: translate(-50%, -50%) rotate(0deg) translateX(0) translateY(0); }
          25% { transform: translate(-50%, -50%) rotate(-20deg) translateX(-50px) translateY(40px); }
          50% { transform: translate(-50%, -50%) rotate(15deg) translateX(70px) translateY(-30px); }
          75% { transform: translate(-50%, -50%) rotate(-5deg) translateX(-20px) translateY(-60px); }
        }
        @keyframes blobFloat2 {
          0%, 100% { transform: translate(-50%, -50%) rotate(0deg) translateX(0) translateY(0); }
          33% { transform: translate(-50%, -50%) rotate(25deg) translateX(55px) translateY(45px); }
          66% { transform: translate(-50%, -50%) rotate(-15deg) translateX(-65px) translateY(-35px); }
        }
        @keyframes blobFloat3 {
          0%, 100% { transform: translate(-50%, -50%) rotate(0deg) translateX(0) translateY(0); }
          20% { transform: translate(-50%, -50%) rotate(-12deg) translateX(-40px) translateY(-50px); }
          40% { transform: translate(-50%, -50%) rotate(18deg) translateX(50px) translateY(20px); }
          60% { transform: translate(-50%, -50%) rotate(-8deg) translateX(30px) translateY(60px); }
          80% { transform: translate(-50%, -50%) rotate(22deg) translateX(-60px) translateY(10px); }
        }
        @keyframes blobMorph {
          0%, 100% { border-radius: 40% 60% 55% 45% / 55% 40% 60% 45%; }
          25% { border-radius: 55% 45% 40% 60% / 45% 60% 40% 55%; }
          50% { border-radius: 45% 55% 60% 40% / 60% 45% 55% 40%; }
          75% { border-radius: 60% 40% 45% 55% / 40% 55% 45% 60%; }
        }
        @keyframes blobScale {
          0%, 100% { scale: 1; }
          50% { scale: 1.12; }
        }
        @keyframes ambientDrift1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(80px, -60px) scale(1.15); }
        }
        @keyframes ambientDrift2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-70px, 50px) scale(1.1); }
        }
        @keyframes ambientDrift3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(50px, -40px) scale(1.2); }
        }
        @keyframes dotPulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          50% { transform: translate(-50%, -50%) scale(1.6); opacity: 0.6; }
        }
        @keyframes ringPulse {
          0% { width: var(--ring-from); height: var(--ring-from); opacity: 0.8; }
          100% { width: var(--ring-to); height: var(--ring-to); opacity: 0; }
        }
        @keyframes connDash {
          to { stroke-dashoffset: -20; }
        }
        .connection-line-anim {
          animation: connDash 1.2s linear infinite;
        }
        .landing-enter-arrow {
          display: flex;
          align-items: center;
          width: 0.42em;
          height: 0.7em;
          overflow: visible;
        }
        .landing-enter-stem {
          display: block;
          height: 1.25px;
          width: 0;
          flex-shrink: 0;
          background: currentColor;
          margin-right: -0.1em;
          transition: width 0.28s ease;
        }
        .landing-enter-caret {
          flex-shrink: 0;
          width: 0.36em;
          height: 0.36em;
          border-top: 1.25px solid currentColor;
          border-right: 1.25px solid currentColor;
          transform: rotate(45deg);
          box-sizing: border-box;
        }
        .landing-enter-btn:hover .landing-enter-stem {
          width: 0.78em;
        }
        div::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
