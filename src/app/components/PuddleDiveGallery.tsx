import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useGLTF } from "@react-three/drei";
import { SceneViewer } from "./SceneViewer";
import { COLOR_PALETTE } from "../lib/colors";
import { SANS, SERIF } from "../lib/theme";
import { DIVE_TUNING } from "../lib/puddle/dive";

/*
 * PuddleDiveGallery — the gallery presentation of the "dive" variant.
 *
 * The memories hang on a shallow arc over the defocused puddle that
 * PuddleScene keeps rendering (and simulating, slowed) underneath: the
 * focused one at the apex, its neighbours falling away to either side and
 * deeper into the water. Stepping through them swings the whole arc, so a
 * memory is never cut to — it travels. Underneath runs a timescale drawn on
 * the same curve, so the arc's left-is-newer order has something to read
 * against. No blobs, no homescreen chrome.
 *
 * The descent itself (dolly + defocus) lives in PuddleScene / the sim's dive
 * pass; this component only owns the overlay UI and its resolve/dissolve
 * timing, which is keyed to the same DIVE_TUNING.
 */

/* ── the arc ──────────────────────────────────────────────────────────────
   A wide, shallow ellipse rather than a circle: on a landscape screen a true
   semicircle would drop the neighbours off the bottom long before it ran out
   of width. Angles are just a parameter along it — sin for the reach, cos for
   the fall — so the slots stay evenly spaced as they swing. */
/** Memories shown either side of the focused one. Each is a WebGL canvas, so
    this is the main cost dial for the whole screen. */
const ARC_NEIGHBOURS = 2;
const ARC_STEP_DEG = 34;
/** Half-width of the ellipse, in vw. */
const ARC_RX_VW = 42;
/** Depth of the fall, in vh. */
const ARC_RY_VH = 34;
/** Where the apex sits, from the top of the viewport. */
const ARC_APEX_VH = 40;
/** The focused artifact's box; neighbours are scaled down from it. */
const ARTIFACT_SIZE = "clamp(320px, 34vw, 480px)";
/** How long a memory takes to travel one slot along the arc. */
const ARC_TRAVEL_MS = 900;

/** The arriving refraction outlasts the artifact's resolve by this factor, so
    the water is still faintly moving after the shape has settled. */
const WOBBLE_ARRIVE_TAIL = 1.45;
/** The filter is torn down this long after its clock ends. Unmounting on the
    same frame it reaches zero can clip the last of the waver if the SMIL
    sampling and the timer disagree by a frame. */
const WOBBLE_UNMOUNT_MARGIN_MS = 220;

/** Falling away from the apex: smaller, dimmer, and losing focus to the water. */
function slotDepth(offset: number) {
  const d = Math.abs(offset);
  return {
    scale: 1 - d * 0.26,
    opacity: d === 0 ? 1 : d === 1 ? 0.5 : 0.16,
    blurPx: d * 6,
  };
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

export interface DiveGalleryItem {
  /** Index into the events/anchors arrays in PuddleScene. */
  eventIdx: number;
  year: string;
  event: string;
  /** The memory's drop anchor in puddle uv (y up) — where ripples/dye land. */
  anchor: { x: number; y: number };
  colorIndex: number;
  shape: {
    modelPath: string;
    fluidity: number;
    evolve: number;
    bumpAmount: number;
  };
}

export type DivePhase = "diving" | "gallery" | "surfacing";

export function PuddleDiveGallery({
  items,
  activeIdx,
  phase,
  reducedMotion,
  onNavigate,
  onExit,
}: {
  items: DiveGalleryItem[];
  activeIdx: number;
  phase: DivePhase;
  reducedMotion: boolean;
  /** Slots to travel: negative = newer (left), positive = older (right). */
  onNavigate: (delta: number) => void;
  onExit: () => void;
}) {
  const item = items[activeIdx];
  const hasNewer = activeIdx > 0;
  const hasOlder = activeIdx < items.length - 1;

  /* arrows — keyboard */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (phase !== "gallery") return;
      if (e.key === "ArrowLeft") onNavigate(-1);
      else if (e.key === "ArrowRight") onNavigate(1);
      else if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, onNavigate, onExit]);

  /* preload the artifacts just off the end of the arc, so the memory that
     swings in on an arrow press never stalls on a network fetch */
  useEffect(() => {
    for (const k of [-ARC_NEIGHBOURS - 1, ARC_NEIGHBOURS + 1]) {
      const neighbour = items[activeIdx + k];
      if (neighbour) useGLTF.preload(neighbour.shape.modelPath);
    }
  }, [items, activeIdx]);

  /* The refraction wobble is a full-element filter pass, so it only runs when
     something is actually moving through the water: the arrival and the exit. */
  const [wobbling, setWobbling] = useState(false);
  useEffect(() => {
    if (phase === "diving" || reducedMotion) {
      setWobbling(false);
      return;
    }
    setWobbling(true);
    const ms =
      phase === "surfacing"
        ? DIVE_TUNING.surfaceMs * 0.6
        : DIVE_TUNING.artifactResolveMs * WOBBLE_ARRIVE_TAIL;
    const t = setTimeout(() => setWobbling(false), ms + WOBBLE_UNMOUNT_MARGIN_MS);
    return () => clearTimeout(t);
  }, [phase, reducedMotion]);

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
  const artifactAnimation =
    phase === "diving"
      ? "none"
      : phase === "surfacing"
        ? `${reducedMotion ? "diveDissolveReduced" : "diveDissolve"} ${dissolveMs}ms ease forwards`
        : `${
            reducedMotion ? "diveResolveReduced" : "diveResolve"
          } ${Math.round(resolveMs)}ms cubic-bezier(0.22, 1, 0.36, 1) backwards`;

  /* Refraction wobble — an SVG turbulence/displacement filter over the focused
     artifact, seen as if through moving water. Its SMIL animation starts when
     the filter mounts and calms to zero as the shape arrives. Arriving, the
     amplitude falls off steeply and then holds a long, barely-there tail past
     the resolve: water lets go of a thing gradually, and a linear ramp ending
     on the same frame as everything else reads as a cut. */
  const wobble =
    phase === "surfacing"
      ? // leaving: the water takes it back, so the distortion grows
        { dur: dissolveMs, scale: "0;16;44", keyTimes: "0;0.55;1" }
      : // arriving: strongest at first sight, stilling as the shape settles
        {
          dur: Math.round(resolveMs * WOBBLE_ARRIVE_TAIL),
          scale: "42;16;5;1.2;0",
          keyTimes: "0;0.34;0.58;0.8;1",
        };

  const chromeVisible = phase === "gallery";
  const palette = COLOR_PALETTE[item.colorIndex % COLOR_PALETTE.length];
  const travelMs = reducedMotion ? 0 : ARC_TRAVEL_MS;
  const travelEase = "cubic-bezier(0.33, 0.02, 0.2, 1)";

  /* The background wash: the memory's color belongs to the space the artifact
     hangs in, not to the water — the puddle is left exactly as it was dived
     from (PuddleScene restores it on the way up). An arrow press crossfades
     this color; nothing is added to the surface below. */
  const washFadeMs = phase === "surfacing" ? dissolveMs : Math.round(resolveMs);

  /* The arc, apex outward. Only the focused memory exists while the dolly is
     still running; everything on the arc leaves together when it reverses. */
  const slots: { offset: number; item: DiveGalleryItem }[] = [];
  for (let k = -ARC_NEIGHBOURS; k <= ARC_NEIGHBOURS; k++) {
    if (phase === "diving" && k !== 0) continue;
    const slotItem = items[activeIdx + k];
    if (slotItem) slots.push({ offset: k, item: slotItem });
  }

  const arrowStyle = (side: "left" | "right"): CSSProperties => ({
    position: "absolute",
    top: `${ARC_APEX_VH}vh`,
    [side]: "clamp(10px, 2vw, 30px)",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    padding: 16,
    cursor: "pointer",
    color: "#4a4a4a",
    opacity: chromeVisible ? 0.35 : 0,
    transition: "opacity 0.6s ease",
    pointerEvents: chromeVisible ? "auto" : "none",
  });

  return (
    <div
      className="absolute inset-0 select-none"
      style={{ zIndex: 30 }}
      onClick={() => {
        if (phase === "gallery") onExit();
      }}
    >
      {/* ═══ BACKGROUND WASH — the memory's color, held around the focused
             artifact. First child, so it paints under the arc and over the
             water; its soft radial mask keeps it edgeless. ═══ */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          left: "50%",
          top: `${ARC_APEX_VH}vh`,
          transform: "translate(-50%, -50%)",
          width: "clamp(700px, 78vw, 1000px)",
          height: "clamp(700px, 78vw, 1000px)",
          borderRadius: "50%",
          backgroundColor: washColor(palette.color),
          opacity: chromeVisible ? DIVE_TUNING.artifactWashOpacity : 0,
          maskImage:
            "radial-gradient(closest-side, #000 10%, rgba(0,0,0,0.5) 50%, transparent 82%)",
          WebkitMaskImage:
            "radial-gradient(closest-side, #000 10%, rgba(0,0,0,0.5) 50%, transparent 82%)",
          transition: `background-color ${DIVE_TUNING.artifactWashFadeMs}ms ease, opacity ${washFadeMs}ms ease`,
          willChange: "background-color, opacity",
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
                  keyTimes={wobble.keyTimes}
                  dur={`${wobble.dur}ms`}
                  fill="freeze"
                />
              </feDisplacementMap>
            </filter>
          </defs>
        </svg>
      )}

      {/* ═══ THE ARC — the memories on their curve, the focused one at the
             apex. Slots are keyed by memory, so an arrow press moves the
             elements instead of replacing them: the arc swings. ═══ */}
      <div
        className="absolute"
        style={{ left: "50%", top: `${ARC_APEX_VH}vh`, width: 0, height: 0 }}
      >
        {slots.map(({ offset, item: slotItem }) => {
          const focused = offset === 0;
          const theta = (offset * ARC_STEP_DEG * Math.PI) / 180;
          const depth = slotDepth(offset);
          const slotPalette =
            COLOR_PALETTE[slotItem.colorIndex % COLOR_PALETTE.length];
          return (
            <div
              key={slotItem.eventIdx}
              onClick={(e) => {
                e.stopPropagation();
                if (!focused && phase === "gallery") onNavigate(offset);
              }}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: ARTIFACT_SIZE,
                height: ARTIFACT_SIZE,
                transform: `translate(-50%, -50%) translate(${(
                  ARC_RX_VW * Math.sin(theta)
                ).toFixed(3)}vw, ${(ARC_RY_VH * (1 - Math.cos(theta))).toFixed(3)}vh) scale(${
                  depth.scale
                })`,
                transition: `transform ${travelMs}ms ${travelEase}`,
                zIndex: 10 - Math.abs(offset),
                cursor: focused ? "default" : "pointer",
                pointerEvents: phase === "gallery" ? "auto" : "none",
              }}
            >
              {/* the arrival / departure, on its own layer so the depth
                  styling below can't fight its filter and opacity */}
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  opacity: phase === "diving" ? 0 : undefined,
                  animation: artifactAnimation,
                  willChange: "filter, opacity, transform",
                }}
              >
                {/* depth: how far into the water this slot has fallen, plus
                    the focused artifact's slow buoyant bob — nothing rests
                    perfectly still underwater */}
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    opacity: depth.opacity,
                    filter: [
                      depth.blurPx ? `blur(${depth.blurPx}px)` : "",
                      focused && wobbling ? "url(#dive-refraction)" : "",
                    ]
                      .filter(Boolean)
                      .join(" "),
                    transition: `opacity ${travelMs}ms ${travelEase}, filter ${travelMs}ms ${travelEase}`,
                    animation:
                      focused && !reducedMotion && phase === "gallery"
                        ? `diveFloat 7s ease-in-out ${Math.round(resolveMs)}ms infinite alternate`
                        : undefined,
                  }}
                >
                  <SceneViewer
                    modelPath={slotItem.shape.modelPath}
                    fluidity={slotItem.shape.fluidity}
                    evolve={slotItem.shape.evolve}
                    bumpAmount={slotItem.shape.bumpAmount}
                    autoRotate={focused}
                    floatAmplitude={focused ? 0.08 : 0}
                    ready
                    // tight framing — the artifact is the screen here, so it
                    // fills its box instead of floating in the middle of it
                    frameMargin={1.12}
                    // parked neighbours render once and then cost nothing
                    frameloop={focused ? "always" : "demand"}
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

      {/* ═══ CAPTION ═══ */}
      <div
        className="absolute left-0 right-0 text-center pointer-events-none"
        style={{
          bottom: "24vh",
          fontFamily: SERIF,
          fontStyle: "italic",
          opacity: chromeVisible ? 1 : 0,
          transition: "opacity 0.8s ease",
        }}
      >
        <div
          key={item.eventIdx}
          style={{
            animation: reducedMotion ? undefined : `diveCaptionIn ${travelMs}ms ease`,
          }}
        >
          <p style={{ color: "#2a2a2a", margin: "0 0 6px", whiteSpace: "pre-line" }}>
            {item.event}
          </p>
          <p style={{ color: "#999", margin: 0 }}>{item.year}</p>
        </div>
      </div>

      {/* ═══ TIMESCALE ═══ */}
      <TimeScale
        items={items}
        activeIdx={activeIdx}
        visible={chromeVisible}
        travelMs={travelMs}
        travelEase={travelEase}
      />

      {/* ═══ ARROWS ═══ */}
      {hasNewer && (
        <button
          aria-label="newer memory"
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
      {hasOlder && (
        <button
          aria-label="older memory"
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

      {/* ═══ HINT ═══ */}
      <div
        className="absolute bottom-8 left-0 right-0 text-center pointer-events-none"
        style={{
          opacity: chromeVisible ? 0.45 : 0,
          transition: "opacity 0.8s ease",
          color: "#aaa",
          fontFamily: SANS,
          fontSize: 12,
          letterSpacing: "0.05em",
        }}
      >
        esc to surface
      </div>

      <style>{`
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
      `}</style>
    </div>
  );
}

/* ── the timescale ────────────────────────────────────────────────────────
   The same curve as the arc, drawn as a line: every memory a faint tick,
   every year a longer one with its label, and the focused memory a mark that
   slides along as the arc swings. Reading order matches the arc — newest at
   the left, oldest at the right — so the mark always travels the same way the
   memories do. */

const TS_HEIGHT = 92;
/** How far the centre of the line lifts above its ends. */
const TS_RISE = 26;
const TS_SIDE_PAD = 72;
/** Baseline of the line's ends, from the top of the block. */
const TS_BASE_Y = 34;
/** Same-year memories share a point in time; nudge them apart so stepping
    between two of them still moves the mark. */
const TS_TIE_SPREAD = 0.014;
/** Below this, year labels start colliding — show every other one. */
const TS_LABEL_MIN_PX = 52;

function TimeScale({
  items,
  activeIdx,
  visible,
  travelMs,
  travelEase,
}: {
  items: DiveGalleryItem[];
  activeIdx: number;
  visible: boolean;
  travelMs: number;
  travelEase: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Each memory's place on the line, 0 (newest, left) → 1 (oldest, right). */
  const { positions, years } = useMemo(() => {
    const parsed = items.map((it) => parseInt(it.year) || 0);
    const min = Math.min(...parsed);
    const max = Math.max(...parsed);
    const span = max - min || 1;
    const ofYear = (y: number) => 1 - (y - min) / span;

    const tally = new Map<number, number>();
    const seats = new Map<number, number>();
    for (const y of parsed) tally.set(y, (tally.get(y) ?? 0) + 1);

    const positions = parsed.map((y) => {
      const seat = seats.get(y) ?? 0;
      seats.set(y, seat + 1);
      const count = tally.get(y) ?? 1;
      return ofYear(y) + (seat - (count - 1) / 2) * TS_TIE_SPREAD;
    });

    const years = [...new Set(parsed)]
      .sort((a, b) => b - a)
      .map((y) => ({ year: y, t: ofYear(y) }));

    return { positions, years };
  }, [items]);

  const inner = Math.max(0, width - TS_SIDE_PAD * 2);
  const x = (t: number) => TS_SIDE_PAD + t * inner;
  const y = (t: number) => TS_BASE_Y - 4 * TS_RISE * t * (1 - t);
  const activeYear = parseInt(items[activeIdx]?.year ?? "") || 0;
  const labelStep = Math.max(
    1,
    Math.ceil((years.length * TS_LABEL_MIN_PX) / Math.max(1, inner)),
  );

  return (
    <div
      ref={ref}
      aria-hidden
      className="absolute pointer-events-none"
      style={{
        left: 0,
        right: 0,
        bottom: 56,
        height: TS_HEIGHT,
        opacity: visible ? 1 : 0,
        transition: "opacity 0.8s ease",
      }}
    >
      {width > 0 && (
        <svg width="100%" height={TS_HEIGHT} style={{ display: "block", overflow: "visible" }}>
          <defs>
            {/* the line has no ends, it just stops being */}
            <linearGradient id="dive-timescale-fade" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#4a4a4a" stopOpacity="0" />
              <stop offset="0.14" stopColor="#4a4a4a" stopOpacity="0.22" />
              <stop offset="0.86" stopColor="#4a4a4a" stopOpacity="0.22" />
              <stop offset="1" stopColor="#4a4a4a" stopOpacity="0" />
            </linearGradient>
          </defs>

          <path
            d={`M ${x(0)} ${y(0)} Q ${x(0.5)} ${TS_BASE_Y - 2 * TS_RISE} ${x(1)} ${y(1)}`}
            fill="none"
            stroke="url(#dive-timescale-fade)"
            strokeWidth={1}
          />

          {/* every memory */}
          {positions.map((t, i) => (
            <line
              key={`m-${items[i].eventIdx}`}
              x1={x(t)}
              y1={y(t)}
              x2={x(t)}
              y2={y(t) + 4}
              stroke="#4a4a4a"
              strokeOpacity={0.18}
              strokeWidth={1}
            />
          ))}

          {/* every year it happened in */}
          {years.map(({ year, t }, i) => {
            const current = year === activeYear;
            return (
              <g key={year}>
                <line
                  x1={x(t)}
                  y1={y(t)}
                  x2={x(t)}
                  y2={y(t) + 9}
                  stroke="#4a4a4a"
                  strokeOpacity={current ? 0.55 : 0.28}
                  strokeWidth={1}
                  style={{ transition: `stroke-opacity ${travelMs}ms ${travelEase}` }}
                />
                {(current || i % labelStep === 0) && (
                  <text
                    x={x(t)}
                    y={y(t) + 24}
                    textAnchor="middle"
                    fill="#4a4a4a"
                    fillOpacity={current ? 0.8 : 0.34}
                    style={{
                      fontFamily: SERIF,
                      fontSize: 10,
                      letterSpacing: "0.06em",
                      transition: `fill-opacity ${travelMs}ms ${travelEase}`,
                    }}
                  >
                    {year}
                  </text>
                )}
              </g>
            );
          })}

          {/* where you are */}
          <g
            style={{
              transform: `translate(${x(positions[activeIdx] ?? 0)}px, ${y(
                positions[activeIdx] ?? 0,
              )}px)`,
              transition: `transform ${travelMs}ms ${travelEase}`,
            }}
          >
            <circle r={5.5} fill="#4a4a4a" fillOpacity={0.1} />
            <circle r={2.4} fill="#4a4a4a" fillOpacity={0.75} />
          </g>
        </svg>
      )}
    </div>
  );
}
