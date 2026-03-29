import { useEffect, useRef, useState, useCallback } from "react";
import svgPaths from "../../imports/svg-t19vgojqiy";
import NewMomoryIdle from "../../imports/NewMomoryIdle";
import { LIFE_EVENTS, COLORS as MEMORY_COLORS } from "../data/memoryData";
import { SceneViewer, MODEL_PATHS } from "./SceneViewer";

// Color palette for 3D shapes
const COLOR_PALETTE = [
  { id: "slate", color: "#9496a6", light1: "#c8d0d4", light2: "#d6dadb" },
  { id: "cloud", color: "#D6DADB", light1: "#e8eaeb", light2: "#c8d0d4" },
  { id: "mist", color: "#C8D0D4", light1: "#e0e4e6", light2: "#d6dadb" },
  { id: "sand", color: "#CBBFBC", light1: "#e5dbd9", light2: "#d6cbc8" },
  { id: "sky", color: "#A4B6BE", light1: "#c8d0d4", light2: "#d6dadb" },
  { id: "rose", color: "#B8969A", light1: "#d8c8ca", light2: "#e5dbd9" },
  { id: "sage", color: "#8C9FA8", light1: "#b8c4ca", light2: "#c8d0d4" },
  { id: "ocean", color: "#6488A0", light1: "#9cb4c8", light2: "#b8c8d4" },
  { id: "night", color: "#1C2C35", light1: "#4a5a62", light2: "#7a8a92" },
];

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
 * Gallery sort order: chronological, newest (left) → oldest (right).
 * gallerySortOrder[slot] = blobIndex
 * gallerySlot[blobIndex] = slot position (0 = leftmost = newest)
 */
const gallerySortOrder = LIFE_EVENTS
  .map((_, i) => i)
  .sort((a, b) => parseInt(LIFE_EVENTS[b].year) - parseInt(LIFE_EVENTS[a].year));

const gallerySlot: number[] = new Array(LIFE_EVENTS.length);
gallerySortOrder.forEach((blobIdx, slot) => {
  gallerySlot[blobIdx] = slot;
});

/* ───────── helpers ───────── */
function generateBorderRadius(): string {
  const v = Array.from({ length: 8 }, () => 30 + Math.random() * 40);
  return `${v[0]}% ${v[1]}% ${v[2]}% ${v[3]}% / ${v[4]}% ${v[5]}% ${v[6]}% ${v[7]}%`;
}

function generateBlobs(count: number, isMobile: boolean): BlobData[] {
  const raw = Array.from({ length: count }, (_, i) => {
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
    
    // Use the color index from LIFE_EVENTS to ensure 2D and 3D colors match
    const colorIndex = LIFE_EVENTS[i % LIFE_EVENTS.length].color;
    
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
      year: LIFE_EVENTS[i % LIFE_EVENTS.length].year,
      event: LIFE_EVENTS[i % LIFE_EVENTS.length].event,
      distFromCentroid: 0,
      shape: {
        modelPath: MODEL_PATHS[Math.floor(Math.random() * MODEL_PATHS.length)],
        colorIndex: colorIndex % COLOR_PALETTE.length, // Use the same color index
        fluidity: Math.random() * 0.5 + 0.5,
        evolve: Math.random() * 0.5 + 0.5,
        bumpAmount: i % 2 === 0 ? Math.random() * 0.03 : 0.03 + Math.random() * 0.12,
      },
    };
  });
  const cx = raw.reduce((s, b) => s + b.x, 0) / count;
  const cy = raw.reduce((s, b) => s + b.y, 0) / count;
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
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
function gentleEase(t: number): number {
  return t - Math.sin(t * Math.PI * 2) / (Math.PI * 2);
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
export function BlobScene({ onNewMemory, hideAnnotations = false }: { onNewMemory?: () => void; hideAnnotations?: boolean }) {
  const [blobs] = useState<BlobData[]>(() => generateBlobs(16, window.innerWidth <= 768));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blobEls = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const annRafRef = useRef(0);
  const mainRafRef = useRef(0);
  const scale = useScaleFactor();

  /* ─── refs for animation state ─── */
  const morphProgress = useRef(0);
  const morphTarget = useRef(0);
  const modeRef = useRef<"blend" | "gallery">("blend");
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

  /* ─── React state ─── */
  const [morphVal, setMorphVal] = useState(0);
  const [activeIdx, setActiveIdx] = useState(0);
  const [annotations, setAnnotations] = useState<AnnPos[]>([]);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [panState, setPanState] = useState({ x: 0, y: 0 });

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
    c.width = 512;
    c.height = 512;
    const img = ctx.createImageData(512, 512);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 30;
    }
    ctx.putImageData(img, 0, 0);
  }, []);

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
    if (morphTarget.current === 0) return;
    capture();
    morphTarget.current = 0;
  }, [capture]);

  /* ─── navigate to gallery with specific blob selected ─── */
  const morphToGalleryAt = useCallback((blobIdx: number) => {
    const slot = gallerySlot[blobIdx];
    carouselTgt.current = slot;
    carouselIdx.current = slot;
    setActiveIdx(blobIdx);
    setHoveredIdx(null);
    morphToGallery();
  }, [morphToGallery]);

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
    if (hoveredIdx !== null) return; // don't morph while hovering an annotation
    if (morphTarget.current === 0 && morphProgress.current < 0.1) {
      // Default: open gallery at the newest event (slot 0)
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
  }, [morphToGallery, morphToBlend, hoveredIdx]);

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

  /* ─── derived ─── */
  const showGooey = morphVal < 0.5;
  const gooeyT = clamp(morphVal * 2.2, 0, 1);

  // Connection lines: from hovered event's dot to each connected event's dot
  const hoveredConns = hoveredIdx !== null ? getConnections(hoveredIdx) : [];

  return (
    <div
      ref={viewportRef}
      className="relative w-full h-screen overflow-hidden cursor-pointer select-none"
      style={{ background: "#ededee" }}
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

      {/* ═══ PANNABLE INNER CANVAS ═══ */}
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: `${canvasWidth}px`,
          height: `${canvasHeight}px`,
          transform: morphVal < 0.05
            ? `translate(${panState.x}px, ${panState.y}px)`
            : `translate(${-(canvasWidth - vw) / 2 + vw * 0.15}px, ${-(canvasHeight - vh) / 2 - vh * 0.1}px)`,
          transition: morphVal > 0.05 ? "transform 0.6s ease" : "none",
          willChange: "transform",
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
                willChange: "transform, left, top, width, height",
              }}
            />
          ))}
        </div>

        {/* ═══ AMBIENT BLOBS ═══ */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ opacity: clamp(1 - morphVal * 3, 0, 1) }}
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

        {/* ═══ ANNOTATIONS ═══ */}
        <div className="absolute inset-0" style={{ opacity: clamp(1 - morphVal * 5, 0, 1), zIndex: 19 }}>
          {blobs.map((blob, i) => {
            const a = annotations[i];
            if (!a || (a.dotX === 0 && a.dotY === 0)) return null;
            const cc = connectionCount(i);
            const ts = textScale(i);
            const isPulsating = cc > 2;
            const isHovered = hoveredIdx === i;
            const isConnectedToHovered = hoveredIdx !== null && hoveredConns.includes(i);
            const dimmed = hoveredIdx !== null && !isHovered && !isConnectedToHovered;

            return (
              <div
                key={`a-${blob.id}`}
                onMouseEnter={(e) => { e.stopPropagation(); setHoveredIdx(i); }}
                onMouseLeave={() => setHoveredIdx(null)}
                onClick={(e) => { e.stopPropagation(); morphToGalleryAt(i); }}
                style={{ pointerEvents: "auto" }}
              >
                {/* Dot */}
                <div
                  className="absolute"
                  style={{
                    left: `${a.dotX}px`,
                    top: `${a.dotY}px`,
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    backgroundColor: "#1a1a1a",
                    transform: "translate(-50%, -50%)",
                    zIndex: 22,
                    opacity: dimmed ? 0.25 : 1,
                    transition: "opacity 0.4s ease",
                  }}
                />
                {/* Pulsating ring for highly-connected events */}
                {isPulsating && (
                  <div
                    className="absolute"
                    style={{
                      left: `${a.dotX}px`,
                      top: `${a.dotY}px`,
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      border: "0.2px solid #1a1a1a",
                      backgroundColor: "transparent",
                      transform: "translate(-50%, -50%)",
                      zIndex: 21,
                      opacity: dimmed ? 0.15 : 1,
                      animation: "ringPulse 2.5s ease-in-out infinite",
                      transition: "opacity 0.4s ease",
                    }}
                  />
                )}
                {/* Text hit area */}
                <div
                  className="absolute"
                  style={{
                    left: `${a.anchorX}px`,
                    top: `${a.anchorY}px`,
                    transform: a.textAlign === "right" ? "translateX(-100%)" : "translateX(0)",
                    zIndex: 22,
                    opacity: dimmed ? 0.2 : 1,
                    transition: "opacity 0.4s ease",
                    cursor: "pointer",
                    padding: "4px 8px",
                    margin: "-4px -8px",
                  }}
                >
                  {/* Year */}
                  <div
                    style={{
                      fontFamily: "'GenRyuMin2 TW', 'Playfair Display', Georgia, serif",
                      fontSize: 12,
                      color: "#504A4A",
                      opacity: 0.8,
                      marginBottom: 4,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {blob.year}
                  </div>
                  {/* Memory text */}
                  <div
                    style={{
                      fontFamily: "'GenRyuMin2 TW', 'Playfair Display', Georgia, serif",
                      fontSize: isMobile ? "clamp(12px, calc(12px + (16 - 12) * ((100vw - 390px) / (1024 - 390))), 16px)" : 16,
                      color: "#2A2018",
                      opacity: 0.9,
                      lineHeight: blob.event.includes("\n") ? 1.5 : "normal",
                      whiteSpace: blob.event.includes("\n") ? "pre-line" : "nowrap",
                      letterSpacing: "0px",
                    }}
                  >
                    {blob.event}
                  </div>
                  {/* Ellipsis for entry 15 (2026) */}
                  {blob.year === "2026" && (
                    <div
                      style={{
                        fontFamily: "Georgia, serif",
                        fontStyle: "italic",
                        fontSize: 11,
                        color: "#2A2018",
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
            );
          })}
        </div>
      </div>{/* end pannable inner canvas */}

      {/* ═══ GALLERY TEXT ═══ */}
      <div
        className="absolute inset-0 pointer-events-none flex items-end justify-center"
        style={{ opacity: clamp((morphVal - 0.65) / 0.35, 0, 1), zIndex: 20, paddingBottom: `${vh * 0.12}px` }}
      >
        <div className="text-center" style={{ fontFamily: "'GenRyuMin2 TW', 'Playfair Display', Georgia, serif", fontStyle: "italic" }}>
          <p style={{ color: "#2a2a2a", marginBottom: 6 }}>{blobs[activeIdx]?.event}</p>
          <p style={{ color: "#999" }}>{blobs[activeIdx]?.year}</p>
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
          fontFamily: "'Neue Haas Grotesk Display Pro', 'Neue Montreal', sans-serif",
          fontSize: 12,
          letterSpacing: "0.05em",
          zIndex: 20,
        }}
      >
        Scroll to browse &middot; Click to return
      </div>

      {/* ═══ HOMESCREEN OVERLAY (blend mode only) ═══ */}
      {onNewMemory && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            opacity: clamp(1 - morphVal * 4, 0, 1),
            zIndex: 25,
            transition: "opacity 0.3s ease",
          }}
        >
          {/* Top blur gradient */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: 300,
              borderRadius: 0,
              background: "linear-gradient(to bottom, rgba(27,27,27,0.4), rgba(129,129,129,0))",
              backdropFilter: "blur(40px)",
              WebkitBackdropFilter: "blur(40px)",
              maskImage: "linear-gradient(to top, transparent, black)",
              WebkitMaskImage: "linear-gradient(to top, transparent, black)",
              zIndex: 1,
            }}
          />

          {/* Top texts */}
          <p
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              top: 30,
              fontFamily: "'GenRyuMin2 TW', 'Playfair Display', Georgia, serif",
              fontStyle: "normal",
              color: "#e2e2e3",
              fontSize: 12,
              letterSpacing: "0.16px",
              lineHeight: 1.5,
              margin: 0,
              textShadow: "0 2px 40px rgba(0,0,0,0.3)",
              display: "flex",
              alignItems: "center",
              gap: 12,
              zIndex: 2,
            }}
          >
            <span>滲む</span>
            <span>Nijimu</span>
          </p>
          <p
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              top: 65,
              fontFamily: "'GenRyuMin2 TW', 'Playfair Display', Georgia, serif",
              color: "#D6DADB",
              fontSize: "clamp(12px, calc(12px + (16 - 12) * ((100vw - 390px) / (1024 - 390))), 16px)",
              letterSpacing: "0.24px",
              lineHeight: 1.5,
              margin: 0,
              textShadow: "0px 4px 100px black",
              textAlign: "center",
              maxWidth: "90%",
              zIndex: 2,
            }}
          >
            The things you've loved don't disappear.
            <br />
            They dissolve into who you're becoming.{" "}
          </p>

          {/* Bottom blur gradient */}
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

          {/* "New Memory" button */}
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
        </div>
      )}

      {/* Grain */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none opacity-40"
        style={{ mixBlendMode: "overlay", imageRendering: "pixelated" }}
      />

      {/* Vignette */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.08) 100%)",
      }} />

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
          0% { transform: translate(-50%, -50%) scale(1); opacity: 0.8; }
          100% { transform: translate(-50%, -50%) scale(5.6); opacity: 0; }
        }
        @keyframes connDash {
          to { stroke-dashoffset: -20; }
        }
        .connection-line-anim {
          animation: connDash 1.2s linear infinite;
        }
        div::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}