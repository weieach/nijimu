import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useLocation, useNavigate } from "react-router";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { CHROME_GRAY } from "../lib/colors";
import { POND_SINK, SINK_WASH, pondSinkWash, type PondSinkTarget } from "../lib/pondCamera";
import { SHAPE_GROW_PATH } from "../lib/routes";
import { SANS, SERIF, TITLE } from "../lib/theme";
import { FallingSheet, type SheetLanding } from "./FallingSheet";
import { PARTICLE_TEXT_KEYFRAMES, ParticleText } from "./ParticleText";
import type { PondTouch } from "./PerspectivePond";

const QUESTION_DELAY_S = 0.3;
const QUESTION_SWEEP_S = 0.5;
const CHROME_OUT_MS = 1000;
/** Same quiet mark as the landing Enter control. */
const SKIP_INK = "#504A4A";
/** The landing header's description line — same ink, same setting. */
const SCROLL_INK = "#2A2018";
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** The plus rises this far as it arrives, its backlight swelling with it. */
const PLUS_RISE_PX = 50;
const PLUS_DELAY_S = 0.9;
const PLUS_RISE_S = 1.8;
const PLUS_LIGHT_S = 2.4;
const PLUS_SIZE = 72;
const PLUS_ARM = 10;
/** The fog just behind the plus, so it reads as a cutout against its own light. */
const PLUS_INK = "#e2e5e4";
/** Noise as alpha: the light itself is speckled, rather than dirtied from above. */
const LIGHT_GRAIN = `url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 2.2 0 0 0 -0.5'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;
const LIGHT_EASE = [0.45, 0, 0.25, 1] as const;
/** Rim light hugging the plus's edges, stronger above — lit from just behind and over it. */
const rimLight = (v: number) =>
  `drop-shadow(0px 0px ${1 + 2 * v}px rgba(255,255,255,${v})) ` +
  `drop-shadow(0px ${-3 * v}px ${2 + 12 * v}px rgba(255,255,255,${v})) ` +
  `drop-shadow(0px ${-10 * v}px ${8 + 64 * v}px rgba(255,255,255,${v}))`;
/** The words leave before the sheet is let go. */
const HEADING_OUT_MS = 700;
/** Back from under the water: the eye rises to the surface, then the step arrives. */
const RISE_MS = POND_SINK.durationMs;
const RISE_SETTLE_S = (RISE_MS / 1000) * 0.75;

interface PondImageState {
  image?: { url: string; name: string; aspect?: number };
  /** Set by the shape scene's back: arrive from beneath the surface. */
  rise?: boolean;
  [key: string]: unknown;
}

/* pick → clearing (heading fading, picture ready) → falling → landed */
type Phase = "pick" | "clearing" | "falling" | "landed";

/**
 * The picture step, laid over the pond after the words. A chosen image is
 * printed on a sheet of vellum that is let go above the screen, drifts down
 * like a leaf, and lies on the water where it lands — which rings in reply.
 */
export function PondImagePage({
  reducedMotion = false,
  onLand,
  sinkRef,
  sinkTargetRef,
}: {
  reducedMotion?: boolean;
  /** Where the sheet meets the water, in stage-relative 0..1 coordinates, with its footprint. */
  onLand?: (at: { x: number; y: number; strength: number; sheet?: PondTouch["sheet"] }) => void;
  /** Shared with the water: continuing sinks the camera through it. */
  sinkRef?: RefObject<number>;
  sinkTargetRef?: RefObject<PondSinkTarget | null>;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as PondImageState | null) ?? null;

  const inputRef = useRef<HTMLInputElement>(null);
  const washRef = useRef<HTMLDivElement>(null);
  const landedChromeRef = useRef<HTMLDivElement>(null);
  const sinkRaf = useRef<number | null>(null);
  /** How far down the user has scrolled since the sheet landed, 0..1. */
  const scrolled = useRef(0);
  const departed = useRef(false);
  // The step always opens on the plus — a picture carried in from a later
  // scene is not taken as already chosen.
  const [image, setImage] = useState<PondImageState["image"] | null>(null);
  const [phase, setPhase] = useState<Phase>("pick");
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [leaving, setLeaving] = useState(false);
  const landCallback = useRef(onLand);
  landCallback.current = onLand;
  const releaseTimer = useRef<number | null>(null);

  const [rising] = useState(() => state?.rise === true && !reducedMotion && !!sinkRef);
  const risingRef = useRef(rising);
  /** Everything on this step waits for the eye to reach the surface. */
  const arriveS = rising ? RISE_SETTLE_S : 0;

  // Before the first frame: the camera starts where the shape scene left it,
  // just under the surface, behind the same wash.
  useLayoutEffect(() => {
    if (!rising || !sinkRef) return;
    sinkRef.current = 1;
    let last = performance.now();
    let elapsed = 0;
    const tick = (now: number) => {
      if (!document.hidden) elapsed += Math.min(50, now - last);
      last = now;
      const sink = 1 - Math.min(1, elapsed / RISE_MS);
      sinkRef.current = sink;
      if (washRef.current) washRef.current.style.opacity = String(pondSinkWash(sink));
      if (sink <= 0) {
        sinkRaf.current = null;
        risingRef.current = false;
        return;
      }
      sinkRaf.current = requestAnimationFrame(tick);
    };
    sinkRaf.current = requestAnimationFrame(tick);
  }, [rising, sinkRef]);

  /* One clock for the backlight, so the rim and the bloom swell together. */
  const light = useMotionValue(reducedMotion ? 1 : 0);
  const rimFilter = useTransform(light, rimLight);
  const haloScale = useTransform(light, [0, 1], [0.45, 1]);
  useEffect(() => {
    if (reducedMotion) {
      light.set(1);
      return;
    }
    const controls = animate(light, 1, { duration: PLUS_LIGHT_S, delay: PLUS_DELAY_S + arriveS, ease: LIGHT_EASE });
    return () => controls.stop();
  }, [light, reducedMotion, arriveS]);

  /* Object URLs belong to this visit; one is enough per chosen file. */
  const ownedUrl = useRef<string | null>(null);
  useEffect(() => () => {
    if (ownedUrl.current) URL.revokeObjectURL(ownedUrl.current);
    if (releaseTimer.current) window.clearTimeout(releaseTimer.current);
    if (sinkRaf.current) cancelAnimationFrame(sinkRaf.current);
    if (sinkRef) sinkRef.current = 0;
  }, [sinkRef]);

  const choose = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    // Wait for the pixels so the sheet arrives with its picture already printed.
    const preload = new Image();
    preload.onload = () => {
      if (ownedUrl.current) URL.revokeObjectURL(ownedUrl.current);
      ownedUrl.current = url;
      scrolled.current = 0;
      setImage({ url, name: file.name, aspect: preload.naturalWidth / Math.max(1, preload.naturalHeight) });
      if (phaseRef.current === "landed") {
        // Nothing left to clear away — the next sheet is simply let go.
        setPhase("falling");
        return;
      }
      setPhase("clearing");
      if (releaseTimer.current) window.clearTimeout(releaseTimer.current);
      releaseTimer.current = window.setTimeout(
        () => setPhase("falling"),
        reducedMotion ? 0 : HEADING_OUT_MS,
      );
    };
    preload.onerror = () => URL.revokeObjectURL(url);
    preload.src = url;
  };

  const settle = (at: SheetLanding) => {
    landCallback.current?.({
      x: at.x,
      y: at.y,
      strength: 0.9,
      sheet: { x: at.world.x, z: at.world.z, ...at.footprint },
    });
    if (sinkTargetRef) sinkTargetRef.current = at.world;
    setPhase("landed");
  };

  const chooseAnother = () => {
    if (leaving || departed.current) return;
    inputRef.current?.click();
  };

  const next = () =>
    navigate(SHAPE_GROW_PATH, {
      state: { ...state, image: image ?? undefined, rise: undefined, dive: true },
    });

  // With the picture down, the way on is to scroll: the eye goes under the
  // water exactly as far as the hand has turned, and no further, until the
  // surface is crossed and the next scene takes over.
  useEffect(() => {
    if (phase !== "landed" || !sinkRef) return;
    let raf = 0;
    let last = performance.now();
    let shown = sinkRef.current ?? 0;
    let touchY: number | null = null;
    const nudge = (px: number) => {
      scrolled.current = clamp01(scrolled.current + px / POND_SINK.scrollPx);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
      nudge(e.deltaY * unit);
    };
    const touchStart = (e: TouchEvent) => { touchY = e.touches[0]?.clientY ?? null; };
    const touchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY;
      if (touchY === null || y === undefined) return;
      nudge((touchY - y) * 1.6);
      touchY = y;
    };
    const keys = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); nudge(180); }
    };
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const target = scrolled.current;
      shown += (target - shown) * (reducedMotion ? 1 : 1 - Math.exp(-7 * dt));
      if (target >= 1 && shown > 0.995) shown = 1;
      sinkRef.current = shown;
      if (washRef.current) washRef.current.style.opacity = String(pondSinkWash(shown));
      if (landedChromeRef.current) landedChromeRef.current.style.opacity = String(1 - clamp01(shown * 5));
      if (shown >= 1) {
        departed.current = true;
        ownedUrl.current = null; // The URL travels on with the memory now.
        next();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("touchstart", touchStart, { passive: true });
    window.addEventListener("touchmove", touchMove, { passive: true });
    window.addEventListener("keydown", keys);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("wheel", wheel);
      window.removeEventListener("touchstart", touchStart);
      window.removeEventListener("touchmove", touchMove);
      window.removeEventListener("keydown", keys);
      cancelAnimationFrame(raf);
      if (!departed.current) {
        // Another picture is on its way down: the eye comes back up to meet it.
        sinkRef.current = 0;
        if (washRef.current) washRef.current.style.opacity = "0";
      }
    };
    // `next` reads the latest state through closure each render; the effect only
    // needs to re-arm when the phase does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, sinkRef, reducedMotion]);

  const goOn = () => {
    if (leaving || risingRef.current) return;
    setLeaving(true);
    ownedUrl.current = null; // The URL travels on with the memory now.
    if (reducedMotion || !sinkRef) {
      setTimeout(next, reducedMotion ? POND_SINK.reducedMs : CHROME_OUT_MS);
      return;
    }
    // The chrome goes first; then the camera goes down through the water,
    // the wash rising to meet the surface so the crossing itself is light.
    let last = performance.now();
    let elapsed = 0;
    const tick = (now: number) => {
      if (!document.hidden) elapsed += Math.min(50, now - last);
      last = now;
      const sink = Math.min(1, Math.max(0, (elapsed - CHROME_OUT_MS * 0.4) / POND_SINK.durationMs));
      sinkRef.current = sink;
      if (washRef.current) washRef.current.style.opacity = String(pondSinkWash(sink));
      if (sink >= 1) { sinkRaf.current = null; next(); return; }
      sinkRaf.current = requestAnimationFrame(tick);
    };
    sinkRaf.current = requestAnimationFrame(tick);
  };

  const headingShown = phase === "pick" && !leaving;
  const sheetShown = image && (phase === "falling" || phase === "landed");

  return (
    <div className="absolute inset-0 select-none" style={{ zIndex: 30, pointerEvents: "none" }}>
      <style>{`${PARTICLE_TEXT_KEYFRAMES}
        .pond-skip-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin: 0;
          padding: 0;
          border: none;
          background: transparent;
          appearance: none;
          -webkit-appearance: none;
          cursor: pointer;
          color: ${SKIP_INK};
          font-size: clamp(12px, calc(12px + (16 - 12) * ((100vw - 390px) / (1024 - 390))), 16px);
          line-height: 1.5;
        }
        .pond-skip-label {
          font-family: ${SANS};
          font-size: 13px;
          letter-spacing: 0.01em;
          white-space: nowrap;
        }
        .pond-skip-arrow {
          position: absolute;
          left: calc(100% + 12px);
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          align-items: center;
          width: 0.42em;
          height: 0.7em;
          overflow: visible;
        }
        .pond-skip-stem {
          display: block;
          height: 1.25px;
          width: 0;
          flex-shrink: 0;
          background: currentColor;
          margin-right: -0.1em;
          transition: width 0.28s ease;
        }
        .pond-skip-caret {
          flex-shrink: 0;
          width: 0.36em;
          height: 0.36em;
          border-top: 1.25px solid currentColor;
          border-right: 1.25px solid currentColor;
          transform: rotate(45deg);
          box-sizing: border-box;
        }
        .pond-skip-btn:hover .pond-skip-stem {
          width: 0.78em;
        }
      `}</style>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          choose(e.target.files?.[0]);
          e.target.value = "";
        }}
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
      />

      {phase !== "landed" && (
        <div
          aria-hidden={!headingShown}
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            top: 171,
            zIndex: 1,
            width: "min(28em, 90vw)",
            textAlign: "center",
            opacity: headingShown ? 1 : 0,
            transition: `opacity ${leaving ? CHROME_OUT_MS : HEADING_OUT_MS}ms ease`,
          }}
        >
          <p style={{ ...TITLE, margin: 0, color: CHROME_GRAY }}>
            <ParticleText
              text="Is there a picture that belongs to this memory?"
              seed={67}
              animate={!reducedMotion}
              delay={QUESTION_DELAY_S + arriveS}
              sweep={QUESTION_SWEEP_S}
              wrap
            />
          </p>
        </div>
      )}

      {(phase === "pick" || phase === "clearing") && (
        <motion.button
          type="button"
          aria-label="add an image"
          onClick={() => {
            if (!risingRef.current) inputRef.current?.click();
          }}
          initial={reducedMotion ? false : { opacity: 0, y: PLUS_RISE_PX }}
          animate={{ opacity: headingShown ? 1 : 0, y: 0 }}
          transition={{
            duration: headingShown ? (reducedMotion ? 0.3 : PLUS_RISE_S) : HEADING_OUT_MS / 1000,
            delay: headingShown && !reducedMotion ? PLUS_DELAY_S + arriveS : 0,
            ease: [0.22, 1, 0.36, 1],
          }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            translate: "-50% -50%",
            width: PLUS_SIZE,
            height: PLUS_SIZE,
            border: "none",
            background: "transparent",
            padding: 0,
            cursor: "pointer",
            overflow: "visible",
            pointerEvents: headingShown ? "auto" : "none",
          }}
        >
          {/* On pale fog a light can only read against shade, so the surround dims as it brightens. */}
          <motion.span
            aria-hidden
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: PLUS_SIZE * 26,
              height: PLUS_SIZE * 26,
              marginLeft: -PLUS_SIZE * 13,
              marginTop: -PLUS_SIZE * 13 - 12,
              borderRadius: "50%",
              opacity: light,
              background:
                "radial-gradient(circle, rgba(58,60,66,0) 8%, rgba(58,60,66,0.05) 16%, rgba(58,60,66,0.1) 26%, rgba(58,60,66,0.07) 40%, rgba(58,60,66,0.025) 54%, rgba(58,60,66,0) 70%)",
              pointerEvents: "none",
            }}
          />
          <motion.span
            aria-hidden
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: PLUS_SIZE * 15,
              height: PLUS_SIZE * 15,
              marginLeft: -PLUS_SIZE * 7.5,
              marginTop: -PLUS_SIZE * 7.5 - 12,
              borderRadius: "50%",
              opacity: light,
              scale: haloScale,
              background:
                "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,255,255,0.95) 6%, rgba(255,255,255,0.72) 14%, rgba(255,255,255,0.45) 24%, rgba(255,255,255,0.22) 36%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0) 68%)",
              maskImage: LIGHT_GRAIN,
              WebkitMaskImage: LIGHT_GRAIN,
              maskSize: "180px 180px",
              WebkitMaskSize: "180px 180px",
              pointerEvents: "none",
            }}
          />
          <motion.span
            aria-hidden
            style={{ position: "absolute", inset: 0, display: "block", filter: rimFilter }}
          >
            <span style={{ position: "absolute", left: 0, right: 0, top: "50%", height: PLUS_ARM, marginTop: -PLUS_ARM / 2, background: PLUS_INK }} />
            <span style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: PLUS_ARM, marginLeft: -PLUS_ARM / 2, background: PLUS_INK }} />
          </motion.span>
        </motion.button>
      )}

      {sheetShown && (
        /* Keyed by picture so choosing another is a fresh release from the top. */
        <div
          key={image.url}
          role="img"
          aria-label={`${image.name}, printed on vellum`}
          style={{ position: "absolute", inset: 0 }}
        >
          <FallingSheet
            url={image.url}
            aspect={image.aspect ?? 4 / 3}
            reducedMotion={reducedMotion}
            onLand={settle}
            sinkRef={sinkRef}
            sinkTargetRef={sinkTargetRef}
          />
        </div>
      )}

      <div
        ref={washRef}
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 99970,
          background: SINK_WASH,
          opacity: rising ? 1 : 0,
          pointerEvents: "none",
        }}
      />

      {phase === "pick" && (
        <motion.div
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: leaving ? 0 : 1 }}
          transition={{ duration: 0.9, delay: reducedMotion ? 0 : 2.2 + arriveS }}
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: 80,
            pointerEvents: leaving ? "none" : "auto",
          }}
        >
          <button type="button" className="pond-skip-btn" onClick={goOn}>
            <span className="pond-skip-label">continue without one</span>
            <span className="pond-skip-arrow" aria-hidden>
              <span className="pond-skip-stem" />
              <span className="pond-skip-caret" />
            </span>
          </button>
        </motion.div>
      )}

      {phase === "landed" && (
        <div
          ref={landedChromeRef}
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: 56,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
            pointerEvents: "none",
          }}
        >
          <motion.p
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.4, delay: reducedMotion ? 0 : 1.4, ease: "easeOut" }}
            style={{
              fontFamily: SERIF,
              fontSize: 12,
              letterSpacing: "0.24px",
              lineHeight: 1.5,
              color: SCROLL_INK,
              margin: 0,
              textAlign: "center",
              whiteSpace: "nowrap",
            }}
          >
            Scroll down to continue
          </motion.p>
          <motion.button
            type="button"
            className="pond-skip-btn"
            onClick={chooseAnother}
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 0.55 }}
            transition={{ duration: 1.2, delay: reducedMotion ? 0 : 2.4, ease: "easeOut" }}
            style={{ pointerEvents: "auto" }}
          >
            <span className="pond-skip-label" style={{ fontSize: 12 }}>choose another</span>
          </motion.button>
        </div>
      )}
    </div>
  );
}
