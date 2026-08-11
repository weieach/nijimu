import { useEffect, useRef, useState } from "react";
import { DIVE_TUNING, RECORD_DIVE } from "../lib/puddle/dive";
import { takeWater } from "../lib/puddle/handoff";
import { PUDDLE_TUNING, createPuddleSimulation } from "../lib/puddle/simulation";

/** The page ground the puddle is painted on — same as the homescreen. */
export const PAGE_BG = "#ededee";

const BACKDROP = {
  /** The arrival: the homescreen's haze eases off here, then rests. */
  entryMs: RECORD_DIVE.entryMs,
  /** Depth the water holds behind the words. 0 = the open surface, 1 = the hand-off. */
  restDepth: RECORD_DIVE.restDepth,
  /** prefers-reduced-motion: straight to the settled wash. */
  reducedEntryMs: 400,
  /** Ambient life — a soft colorless drop now and then, so the water never dies. */
  ambientMinMs: 4200,
  ambientMaxMs: 8000,
  ambientStrength: 0.2,
  ambientRadius: 1.5,
  /** A few of these on arrival, so the surface is already breathing. */
  seedDrops: 3,
  /** Words landing send a small ring up through the surface. */
  voiceStrength: 0.55,
  voiceRadius: 1.0,
  /** How far voice ripples wander from the focus point, in uv. */
  voiceSpread: 0.18,
  /** Once nothing has moved this long, the loop parks on a static frame. */
  settleMs: 6000,
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * The puddle as a backdrop: the same water as the homescreen, minus the
 * memories. It arrives at the haze the hand-off ended on and eases to a resting
 * softness, so the words laid over it stay legible while the surface keeps
 * living underneath. The cursor is quiet here — only the voice and the
 * ambient breath move the water, so recording stays undistracted.
 */
export function PuddleBackdrop({
  focus = [0.5, 0.5],
  voicePulse = 0,
  style,
}: {
  /** uv point the descent pushed toward — the water surfaces around it. */
  focus?: [number, number];
  /** Ticks up as words land; each tick sends a ring through the water. */
  voicePulse?: number;
  style?: React.CSSProperties;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const focusRef = useRef(focus);
  focusRef.current = focus;
  /** Assigned inside the sim effect, so the voice can reach the water. */
  const rippleRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const ownCanvas = canvasRef.current;
    if (!ownCanvas) return;

    /* If the homescreen just handed its water off, adopt it — same canvas,
       same GPU state, so the ripples that were in flight simply play out.
       Otherwise (deep link, reduced motion) start a still surface of our own. */
    const handoff = takeWater();
    const canvas = handoff ? handoff.canvas : ownCanvas;
    const sim = handoff ? handoff.sim : createPuddleSimulation(ownCanvas, PUDDLE_TUNING);
    if (!sim) {
      setFailed(true);
      return;
    }
    if (handoff) {
      ownCanvas.style.display = "none";
      canvas.className = "absolute inset-0 w-full h-full";
      canvas.style.display = "block";
      ownCanvas.parentElement!.appendChild(canvas);
    }
    sim.resize();

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const [fx, fy] = focusRef.current;

    /* The hand-off, continued: depth 1 is the haze the homescreen ended on,
       easing back to a resting softness. There is no dolly on this path — the
       held haze is what keeps this a backdrop rather than a scene. */
    const entryMs = reducedMotion ? BACKDROP.reducedEntryMs : BACKDROP.entryMs;
    let entry = 0;

    const applyDive = () => {
      const t = DIVE_TUNING.ease(Math.min(entry / entryMs, 1));
      const depth = 1 + (BACKDROP.restDepth - 1) * t;
      sim.setDive({
        x: fx,
        y: fy,
        zoom: RECORD_DIVE.zoom,
        blur: RECORD_DIVE.blur * Math.pow(depth, 1.5),
        wash: RECORD_DIVE.wash * depth,
      });
    };
    applyDive();

    let raf = 0;
    let running = false;
    let lastTime = 0;
    let lastActivity = performance.now();

    const tick = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;
      if (entry < entryMs) {
        entry += dt;
        applyDive();
        lastActivity = now;
      }
      sim.step(dt);
      sim.render(now / 1000);
      if (now - lastActivity > BACKDROP.settleMs) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    const wake = () => {
      lastActivity = performance.now();
      if (running || document.hidden) return;
      running = true;
      lastTime = performance.now();
      raf = requestAnimationFrame(tick);
    };

    /** A ring somewhere near the focus — the voice, or the water's own breathing. */
    const disturb = (strength: number, radius: number, spread: number) => {
      if (reducedMotion) return;
      const x = Math.min(0.92, Math.max(0.08, fx + rand(-spread, spread)));
      const y = Math.min(0.92, Math.max(0.08, fy + rand(-spread, spread)));
      sim.addDrop(x, y, radius, PUDDLE_TUNING.dropStrength * strength, null, 0);
      wake();
    };

    rippleRef.current = () =>
      disturb(
        BACKDROP.voiceStrength * rand(0.7, 1.3),
        BACKDROP.voiceRadius * rand(0.8, 1.2),
        BACKDROP.voiceSpread,
      );

    // adopted water is already in motion; only a fresh surface needs waking up
    if (!handoff) {
      for (let i = 0; i < BACKDROP.seedDrops; i++) {
        disturb(BACKDROP.ambientStrength * rand(0.8, 1.6), BACKDROP.ambientRadius, 0.3);
      }
    }

    let ambientTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleAmbient = () => {
      ambientTimer = setTimeout(
        () => {
          disturb(BACKDROP.ambientStrength * rand(0.7, 1.4), BACKDROP.ambientRadius, 0.34);
          scheduleAmbient();
        },
        rand(BACKDROP.ambientMinMs, BACKDROP.ambientMaxMs),
      );
    };
    if (!reducedMotion) scheduleAmbient();

    wake();

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
      if (ambientTimer !== undefined) clearTimeout(ambientTimer);
      rippleRef.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
      sim.dispose();
      if (handoff) {
        handoff.canvas.remove();
        ownCanvas.style.display = "block";
      }
    };
  }, []);

  useEffect(() => {
    if (voicePulse > 0) rippleRef.current?.();
  }, [voicePulse]);

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ background: PAGE_BG, ...style }}
    >
      {!failed && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ display: "block" }}
        />
      )}
    </div>
  );
}
