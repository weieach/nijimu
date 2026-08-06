import { useEffect, useMemo, useRef, useState } from "react";
// import NewMomoryIdle from "../../imports/NewMomoryIdle"; // button hidden — cursor hint replaces it
import { LIFE_EVENTS, MemoryEvent } from "../data/memoryData";
import { loadMemories, toMemoryEvent, SavedMemory } from "../lib/memoryStore";
import { COLOR_PALETTE } from "../lib/colors";
import { SERIF } from "../lib/theme";
import { createPuddleSimulation, PUDDLE_TUNING } from "../lib/puddle/simulation";
import { BlobScene } from "./BlobScene";

/*
 * PuddleScene — the 'puddle' homescreen shader variant.
 *
 * A rain puddle on dark asphalt at night, top-down. Each memory falls in as a
 * droplet: it ripples out for a few seconds and settles, while its color
 * lingers, bleeds, and mixes with what's already in the water.
 *
 * Same component API as BlobScene. Gallery morph / annotations are out of
 * scope for this variant — the pointer stirs the water instead.
 */

/* ───────── timing ───────── */
const INTRO_DELAY_MS = 700;
const INTRO_STAGGER_MS = 420;
const DRIP_MIN_MS = 8000;
const DRIP_MAX_MS = 15000;
/** Ripples visually settle in ~3–5 s with the default damping; pause a bit after. */
const SETTLE_MS = 6500;
const SETTLE_MS_REDUCED = 2000;
/** A caption lives as long as its ripple: focus in, hold, dissolve away. */
const CAPTION_LIFE_MS = 5200;
/** Long-press duration that commits to creating a new memory. */
const HOLD_TO_CREATE_MS = 2000;

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

function computeAnchors(events: MemoryEvent[], savedCount: number): DropAnchor[] {
  const anchors = events.map((e, i) => {
    const rand = mulberry32(hashString(`${e.id}|${e.year}|${e.event}`));
    const isNewestSaved = savedCount > 0 && i === events.length - 1;
    return {
      x: 0.1 + rand() * 0.8,
      y: 0.14 + rand() * 0.68,
      colorIndex: e.color,
      scale: isNewestSaved ? 1.6 : 0.8 + rand() * 0.45,
      year: e.year,
      event: e.event,
      introIndex: 0,
    };
  });
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

/* ───────── particle text: letters drift in from scatter and focus ───────── */

function ParticleText({
  text,
  seed,
  animate,
  inline = false,
}: {
  text: string;
  seed: number;
  animate: boolean;
  /** Keep the run on the surrounding text line instead of starting its own. */
  inline?: boolean;
}) {
  const rand = mulberry32(seed);
  const Line = inline ? "span" : "div";
  return (
    <>
      {text.split("\n").map((line, li) => (
        <Line key={li} style={{ whiteSpace: "nowrap" }}>
          {line.split("").map((ch, i) => {
            const dx = (rand() - 0.5) * 30;
            const dy = (rand() - 0.5) * 24;
            const delay = rand() * 0.4;
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  animation: animate
                    ? `puddleLetterIn 1.1s cubic-bezier(0.22, 1, 0.36, 1) ${delay}s backwards`
                    : "none",
                  ["--dx" as string]: `${dx}px`,
                  ["--dy" as string]: `${dy}px`,
                }}
              >
                {ch === " " ? "\u00A0" : ch}
              </span>
            );
          })}
        </Line>
      ))}
    </>
  );
}

/* ═══════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════ */

export function PuddleScene({
  onNewMemory,
  hideAnnotations = false,
}: {
  onNewMemory?: () => void;
  hideAnnotations?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const [reducedMotionPref] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  /** Captions alive right now — one per landed drop, removed as its ripple dies. */
  const [captions, setCaptions] = useState<{ anchorIdx: number; key: number }[]>([]);
  const captionKey = useRef(0);

  /** Cursor hint: a small dot trailing the pointer, "hold to create memory". */
  const [hintReady, setHintReady] = useState(false);
  /** True while a create-press is held — the hint dot becomes a progress ring. */
  const [pressing, setPressing] = useState(false);
  const hintRef = useRef<HTMLDivElement>(null);
  const lastPointer = useRef<[number, number] | null>(null);
  const onNewMemoryRef = useRef(onNewMemory);
  onNewMemoryRef.current = onNewMemory;

  useEffect(() => {
    const t = setTimeout(() => setHintReady(true), 2000);
    return () => clearTimeout(t);
  }, []);

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
  const anchors = useMemo(
    () => computeAnchors(events, savedMemories.length),
    [events, savedMemories.length],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const sim = createPuddleSimulation(canvas, PUDDLE_TUNING);
    if (!sim) {
      setFailed(true);
      return;
    }
    sim.resize();

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const settleMs = reducedMotion ? SETTLE_MS_REDUCED : SETTLE_MS;

    /* ─── loop: run while disturbed, park on a static frame once settled ─── */
    let raf = 0;
    let running = false;
    let lastTime = 0;
    let lastActivity = performance.now();

    const tick = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;
      sim.step(dt);
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

    const showCaption = (anchorIdx: number) => {
      const key = ++captionKey.current;
      setCaptions((cs) => [...cs.filter((c) => c.anchorIdx !== anchorIdx), { anchorIdx, key }]);
      timeouts.push(
        setTimeout(() => {
          setCaptions((cs) => cs.filter((c) => c.key !== key));
        }, CAPTION_LIFE_MS),
      );
    };

    const dropAnchor = (idx: number, strengthScale = 1) => {
      const a = anchors[idx];
      sim.addDrop(
        a.x,
        a.y,
        a.scale,
        reducedMotion ? 0 : PUDDLE_TUNING.dropStrength * a.scale * strengthScale,
        dyeColorFor(a.colorIndex),
        a.scale * strengthScale,
      );
      showCaption(idx);
      wake();
    };

    /* intro: every memory falls in, oldest first; newest saved lands last */
    const introOrder = anchors
      .map((_, i) => i)
      .sort((p, q) => anchors[p].introIndex - anchors[q].introIndex);

    if (reducedMotion) {
      // No wave animation: pre-splat all dye, bleed it, show a settled still.
      for (const a of anchors) {
        sim.addDrop(a.x, a.y, a.scale * 1.3, 0, dyeColorFor(a.colorIndex), a.scale);
      }
      sim.runDyeSettle(120);
      sim.render(0);
    } else {
      introOrder.forEach((anchorIdx, i) => {
        timeouts.push(
          setTimeout(
            () => dropAnchor(anchorIdx),
            INTRO_DELAY_MS + i * INTRO_STAGGER_MS + Math.random() * 160,
          ),
        );
      });
    }

    /* idle drip: re-seed a random memory so the surface never fully dies */
    let dripTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleDrip = () => {
      dripTimer = setTimeout(() => {
        if (!document.hidden && !reducedMotion && anchors.length > 0) {
          dropAnchor(Math.floor(Math.random() * anchors.length), 0.55);
        }
        scheduleDrip();
      }, DRIP_MIN_MS + Math.random() * (DRIP_MAX_MS - DRIP_MIN_MS));
    };
    if (!reducedMotion) {
      timeouts.push(
        setTimeout(scheduleDrip, INTRO_DELAY_MS + introOrder.length * INTRO_STAGGER_MS),
      );
    }

    /* ─── pointer: stir (colorless) on move, drop on tap ─── */
    const toUv = (e: PointerEvent): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      return [(e.clientX - rect.left) / rect.width, 1 - (e.clientY - rect.top) / rect.height];
    };

    let lastStir: [number, number] | null = null;
    const onPointerMove = (e: PointerEvent) => {
      // the hint dot trails the cursor (cheap: style mutation, no re-render)
      const rect0 = canvas.getBoundingClientRect();
      const hx = e.clientX - rect0.left;
      const hy = e.clientY - rect0.top;
      lastPointer.current = [hx, hy];
      if (hintRef.current) {
        hintRef.current.style.transform = `translate(${hx}px, ${hy}px)`;
      }
      if (reducedMotion) return;
      const [x, y] = toUv(e);
      if (pressUv) {
        pressUv = [x, y]; // the held cavity follows the pointer
        sim.setPress(x, y);
      }
      if (lastStir) {
        const rect = canvas.getBoundingClientRect();
        const dx = (x - lastStir[0]) * rect.width;
        const dy = (y - lastStir[1]) * rect.height;
        if (dx * dx + dy * dy < 100) return; // inject roughly every 10px of travel
      }
      lastStir = [x, y];
      sim.addStir(x, y); // stirs the water and smears dye — never paints
      wake();
    };

    /* long-press to create: the held pointer keeps a sustained cavity in the
       water (like a heavy object resting there); the cavity breathes slowly
       and sheds rings from its rim. After HOLD_TO_CREATE_MS the press commits
       and the recording flow opens. Releasing early just lets the water
       rebound. */
    let navigating = false;
    let pressTimer: ReturnType<typeof setTimeout> | undefined;
    let pressUv: [number, number] | null = null;

    const endPress = () => {
      if (pressTimer !== undefined) {
        clearTimeout(pressTimer);
        pressTimer = undefined;
      }
      pressUv = null;
      sim.clearPress();
      setPressing(false);
    };

    const onPointerDown = (e: PointerEvent) => {
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
      const dye = nearMemory ? dyeColorFor(anchors[nearestIdx].colorIndex) : null;
      if (reducedMotion) {
        if (dye) {
          sim.addDrop(x, y, 1, 0, dye, 0.8); // dye crossfades in, no ripple
          showCaption(nearestIdx);
          wake();
        }
      } else {
        sim.addDrop(x, y, 1, PUDDLE_TUNING.dropStrength, dye, 0.9);
        if (nearMemory) showCaption(nearestIdx);
        wake();
      }

      if (!onNewMemoryRef.current || navigating) return;
      endPress();
      pressUv = [x, y];
      if (!reducedMotion) sim.setPress(x, y);
      setPressing(true);
      pressTimer = setTimeout(() => {
        const at = pressUv ?? [x, y];
        endPress();
        navigating = true;
        if (!reducedMotion) {
          // one deeper drop as the press commits, then into the flow
          sim.addDrop(at[0], at[1], 1.3, PUDDLE_TUNING.dropStrength * 1.4, null, 0);
          wake();
        }
        timeouts.push(setTimeout(() => onNewMemoryRef.current?.(), 350));
      }, HOLD_TO_CREATE_MS);
    };

    const onPointerUp = () => endPress();

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerUp);

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
      for (const t of timeouts) clearTimeout(t);
      if (dripTimer !== undefined) clearTimeout(dripTimer);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerUp);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
      sim.dispose();
    };
  }, [anchors]);

  // WebGL2 / float targets unavailable — quietly fall back to the blob field.
  if (failed) {
    return <BlobScene onNewMemory={onNewMemory} hideAnnotations={hideAnnotations} />;
  }

  return (
    <div
      className="relative w-full h-screen overflow-hidden select-none"
      style={{ background: "#ededee" }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ display: "block", touchAction: "none" }}
      />

      {/* ═══ MEMORY CAPTIONS — live with their ripple: focus in from particles,
             hold, dissolve as the water stills ═══ */}
      {!hideAnnotations && (
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 19 }}>
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
                  <ParticleText text={a.event} seed={c.key * 131 + 17} animate={!reducedMotionPref} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ CURSOR HINT — a small dot trailing the pointer, inviting a new
             memory; fades in like the captions, 2s after load ═══ */}
      {onNewMemory && hintReady && (
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              transform: "translate(14px, 16px)", // sit just below-right of the cursor
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                backgroundColor: "#4a4a4a",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: SERIF,
                fontSize: "clamp(9px, 1.2vw, 13px)",
                color: "#4a4a4a",
                textShadow: "0 0 10px rgba(237,237,238,0.65)",
                whiteSpace: "nowrap",
              }}
            >
              {/* the underline sweeps across "hold" alone as the press fills */}
              <span style={{ position: "relative", display: "inline-block" }}>
                <ParticleText text="hold" seed={97} animate={!reducedMotionPref} inline />
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: -2,
                    height: 1,
                    backgroundColor: "#4a4a4a",
                    transformOrigin: "left center",
                    transform: "scaleX(0)",
                    animation: pressing
                      ? `puddleHoldUnderline ${HOLD_TO_CREATE_MS}ms linear forwards`
                      : "none",
                  }}
                />
              </span>
              <ParticleText
                text=" to create memory"
                seed={181}
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
          0% { opacity: 0; }
          14% { opacity: 1; }
          68% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes puddleHintIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes puddleHoldUnderline {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
        @keyframes puddleLetterIn {
          from {
            opacity: 0;
            filter: blur(6px);
            transform: translate(var(--dx), var(--dy)) scale(1.2);
          }
          55% { opacity: 1; }
          to {
            opacity: 1;
            filter: blur(0);
            transform: translate(0, 0) scale(1);
          }
        }
      `}</style>

      {/* ═══ HOMESCREEN OVERLAY — same chrome as the blob variant ═══ */}
      {onNewMemory && (
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 25 }}>
          <p
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              top: 30,
              fontFamily: SERIF,
              color: "#9b9ba3",
              fontSize: 12,
              letterSpacing: "0.16px",
              lineHeight: 1.5,
              margin: 0,
              display: "flex",
              alignItems: "center",
              gap: 12,
              zIndex: 2,
            }}
          >
            <span>滲む</span>
            <span>Nijimu</span>
          </p>

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
    </div>
  );
}
