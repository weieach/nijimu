import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useGLTF } from "@react-three/drei";
import { SceneViewer } from "./SceneViewer";
import { BackButton } from "./BackButton";
import { COLOR_PALETTE } from "../lib/colors";
import { SERIF } from "../lib/theme";
import { DIVE_TUNING } from "../lib/puddle/dive";

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
/** The focused artifact hangs this much below its place on the rim (fraction
    of viewport height). Only the apex slot is moved — the rim itself, and
    every neighbour on it, stays exactly where it was. */
const ARC_FOCUS_DROP_VH = 0.04;
/** How long a memory takes to travel one step around the rim. */
const ARC_TRAVEL_MS = 900;
/** Caption block centre-ish, as a fraction of viewport height from the top —
    scales with the window instead of sitting a fixed px above the timescale. */
const CAPTION_TOP_VH = 0.72;
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
  return { scale: SLOT_SCALE[d], opacity: SLOT_OPACITY[d], blurPx: SLOT_BLUR_PX[d] };
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
  /** Steps to travel around the rim: negative = newer (left), positive = older. */
  onNavigate: (delta: number) => void;
  onExit: () => void;
}) {
  const item = items[activeIdx];
  const hasNewer = activeIdx > 0;
  const hasOlder = activeIdx < items.length - 1;
  const viewport = useViewport();
  const geo = domeGeometry(viewport.w, viewport.h);

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

  /* preload the artifacts just off the end of the rim, so the memory that
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
        : DIVE_TUNING.artifactResolveMs;
    const t = setTimeout(() => setWobbling(false), ms);
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
     the filter mounts and calms to zero as the shape arrives. */
  const wobble =
    phase === "surfacing"
      ? // leaving: the water takes it back, so the distortion grows
        { dur: dissolveMs, scale: "0;16;44" }
      : // arriving: strongest at first sight, stilling as the shape settles
        { dur: Math.round(resolveMs), scale: "42;14;0" };

  const chromeVisible = phase === "gallery";
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
  for (let k = -ARC_NEIGHBOURS; k <= ARC_NEIGHBOURS; k++) {
    if (phase === "diving" && k !== 0) continue;
    const slotItem = items[activeIdx + k];
    if (slotItem) slots.push({ offset: k, item: slotItem });
  }

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
          const focused = offset === 0;
          const depth = slotDepth(offset);
          const at = domePoint(geo, geo.r, offset * ARC_STEP_DEG);
          const dropY = focused ? ARC_FOCUS_DROP_VH * viewport.h : 0;
          const slotPalette =
            COLOR_PALETTE[slotItem.colorIndex % COLOR_PALETTE.length];
          return (
            <div
              key={slotItem.eventIdx}
              className="dive-artifact"
              onClick={(e) => {
                e.stopPropagation();
                if (!focused && phase === "gallery") onNavigate(offset);
              }}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: geo.size,
                height: geo.size,
                transform: `translate(-50%, -50%) translate(${at.x.toFixed(1)}px, ${(
                  at.y + dropY
                ).toFixed(1)}px) scale(${depth.scale})`,
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
                    // parked neighbours render once and then cost nothing.
                    // `still` is what keeps that honest: a demand canvas that
                    // kept animating would show its motion in lurches, so a
                    // neighbour holds one pose until it reaches the apex.
                    frameloop={focused ? "always" : "demand"}
                    still={!focused}
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
      <TimeScale
        items={items}
        activeIdx={activeIdx}
        viewport={viewport}
        visible={chromeVisible}
        travelMs={travelMs}
        travelEase={travelEase}
      />

      {/* ═══ CAPTION — between the dome and the timescale ═══ */}
      <div
        className="absolute left-0 right-0 text-center pointer-events-none"
        style={{
          top: CAPTION_TOP_VH * viewport.h,
          padding: "0 clamp(24px, 6vw, 80px)",
          fontFamily: SERIF,
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
          <p
            style={{
              color: "#2a2a2a",
              margin: "0 0 0.8em",
              whiteSpace: "pre-line",
              fontStyle: "italic",
              fontSize: "clamp(11px, 1.15vw, 15px)",
              lineHeight: 1.35,
            }}
          >
            {item.event}
          </p>
          <p
            style={{
              color: "#999",
              margin: 0,
              fontStyle: "normal",
              fontSize: "clamp(9px, 0.9vw, 12px)",
            }}
          >
            {item.year}
          </p>
        </div>
      </div>

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
      `}</style>
    </div>
  );
}

/* ── the timescale ────────────────────────────────────────────────────────
   One line across the foot of the screen. Short ticks mark each memory (no
   year). Longer ticks land on regular five-year increments (2010, 2015, …)
   and carry the only numbers. The focused memory's mark slides along as the
   dome swings. Newest at the left, oldest at the right — same as the dome. */

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
}: {
  items: DiveGalleryItem[];
  activeIdx: number;
  viewport: { w: number; h: number };
  visible: boolean;
  travelMs: number;
  travelEase: string;
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
    // newest to the left, oldest to the right — the dome's own direction
    const ofYear = (y: number) => 1 - (y - domainMin) / span;

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
    for (let y = domainMax; y >= domainMin; y -= TS_YEAR_STEP) {
      yearTicks.push({ year: y, t: ofYear(y) });
    }

    return { positions, yearTicks };
  }, [items]);

  const pad = Math.max(TS_SIDE_PAD_MIN, TS_SIDE_PAD_VW * viewport.w);
  const inner = Math.max(1, viewport.w - pad * 2);
  const y = viewport.h - TS_BOTTOM_PX;
  const x = (t: number) => pad + t * inner;

  return (
    <svg
      aria-hidden
      className="absolute inset-0 pointer-events-none"
      width="100%"
      height="100%"
      style={{
        opacity: visible ? 1 : 0,
        transition: "opacity 0.8s ease",
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
          key={`m-${items[i].eventIdx}`}
          x1={x(t)}
          y1={y}
          x2={x(t)}
          y2={y + TS_MEMORY_TICK}
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
            y1={y}
            x2={x(t)}
            y2={y + TS_YEAR_TICK}
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
              fontFamily: SERIF,
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
          transform: `translate(${x(positions[activeIdx] ?? 0).toFixed(1)}px, ${y}px)`,
          transition: `transform ${travelMs}ms ${travelEase}`,
        }}
      >
        <circle r={5.5} fill="#4a4a4a" fillOpacity={0.1} />
        <circle r={2.4} fill="#4a4a4a" fillOpacity={0.75} />
      </g>
    </svg>
  );
}
