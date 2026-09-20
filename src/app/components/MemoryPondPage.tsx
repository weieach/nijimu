import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useHoldToCreate } from "../hooks/useHoldToCreate";
import { CAROUSEL_PATH } from "../lib/routes";
import { CHROME_GRAY } from "../lib/colors";
import { INSTRUCTION_SIZE, SANS, SERIF, SERIF_EXPOSURE } from "../lib/theme";
import { POND_THOUGHTS, hasSeenPondInstruction, markPondInstructionSeen, pondPromptCue } from "../lib/pondPrompts";
import { PerspectivePond, type PondTouch } from "./PerspectivePond";

export function MemoryPondPage({ arrival = 1, active = true, reducedMotion = false, onReady, onLeave }: {
  arrival?: number; active?: boolean; reducedMotion?: boolean; onReady?: () => void; onLeave?: () => void;
}) {
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  const [touch, setTouch] = useState<PondTouch | null>(null);
  const promptRefs = useRef<Array<HTMLDivElement | null>>([]);
  const cueRef = useRef(pondPromptCue(0));
  const buttonRef = useRef<HTMLButtonElement>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const cursorRef = useRef<{ x: number; y: number } | null>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLParagraphElement>(null);
  const hintReveal = useRef(0);
  const holdProgress = useRef(0);
  const seen = useRef(hasSeenPondInstruction());
  const [lifeReady, setLifeReady] = useState(() => hasSeenPondInstruction());
  const enabled = active && arrival === 1 && !leaving;
  const ready = useCallback(() => onReady?.(), [onReady]);
  const hold = useHoldToCreate(() => setLeaving(true), enabled);
  holdProgress.current = hold.progress;
  const back = useCallback(() => (onLeave ?? (() => navigate(CAROUSEL_PATH)))(), [navigate, onLeave]);
  const setCursor = (e: { currentTarget: HTMLElement; clientX: number; clientY: number }) => {
    const r = e.currentTarget.getBoundingClientRect();
    cursorRef.current = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  useEffect(() => {
    if (!enabled || lifeReady) return;
    const line = lineRef.current;
    if (!line) return;
    let raf = 0, elapsed = 0, last = performance.now();
    const appearMs = reducedMotion ? 1 : 920;
    const riseMs = reducedMotion ? 1 : 1100;
    const ease = (t: number) => t * t * (3 - 2 * t);
    line.style.opacity = "0";
    line.style.transform = "translate(-50%, -50%) translateY(18px)";
    const tick = (now: number) => {
      if (!document.hidden) elapsed += Math.min(50, now - last);
      last = now;
      const appear = ease(Math.min(1, elapsed / appearMs));
      const rise = ease(Math.min(1, Math.max(0, (elapsed - appearMs) / riseMs)));
      line.style.opacity = String(appear);
      line.style.transform = `translate(-50%, -50%) translateY(calc(${(1 - appear) * 18}px - ${rise * 20}vh))`;
      if (appear >= 1 && rise >= 1) {
        markPondInstructionSeen();
        seen.current = true;
        setLifeReady(true);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, lifeReady, reducedMotion]);
  useEffect(() => {
    let raf = 0, elapsed = 0, last = performance.now();
    const tick = (now: number) => {
      if (enabled && lifeReady && !document.hidden) elapsed += Math.min(50, now - last) / 1000;
      last = now;
      const cue = pondPromptCue(elapsed);
      cueRef.current = cue;
      promptRefs.current.forEach((label, i) => {
        if (!label) return;
        const opacity = enabled && i === cue.index ? cue.opacity : 0;
        label.style.opacity = String(opacity);
        label.style.translate = `0 ${reducedMotion ? 0 : cue.lift}px`;
        label.style.filter = reducedMotion ? "none" : `blur(${(1 - opacity) * 3}px)`;
        label.setAttribute("aria-hidden", String(opacity < .01));
        label.dataset.active = String(opacity > .01);
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, lifeReady, reducedMotion]);
  useEffect(() => {
    if (!enabled || !lifeReady) {
      cursorRef.current = null;
      hintReveal.current = 0;
      if (hintRef.current) {
        hintRef.current.style.opacity = "0";
        hintRef.current.style.filter = "blur(6px)";
      }
      return;
    }
    let raf = 0, elapsed = 0, last = performance.now();
    const tick = (now: number) => {
      if (!document.hidden) elapsed += Math.min(50, now - last);
      last = now;
      if (elapsed < 1500) hintReveal.current = 0;
      else {
        const t = Math.min(1, (elapsed - 1500) / (reducedMotion ? 1 : 720));
        hintReveal.current = t * t * (3 - 2 * t);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled, lifeReady, reducedMotion]);
  useEffect(() => {
    if (!enabled) return;
    buttonRef.current?.focus({ preventScroll: true });
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "ArrowUp") back();
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [enabled, back]);
  useEffect(() => {
    if (!enabled) return;
    let leftover = 0;
    let lockedUntil = 0;
    const wheel = (e: WheelEvent) => {
      if (holdProgress.current > 0) return;
      e.preventDefault();
      const now = performance.now();
      if (now < lockedUntil) return;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
      leftover += e.deltaY * unit;
      if (leftover > 0) leftover = 0;
      if (leftover > -72) return;
      leftover = 0;
      lockedUntil = now + (reducedMotion ? 80 : 140);
      back();
    };
    window.addEventListener("wheel", wheel, { passive: false });
    return () => window.removeEventListener("wheel", wheel);
  }, [enabled, reducedMotion, back]);
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => navigate("/record/start", { state: { focus: [touch?.x ?? .5, touch?.y ?? .65] } }), reducedMotion ? 80 : 480);
    return () => clearTimeout(timer);
  }, [leaving, navigate, reducedMotion, touch]);

  return <section aria-label="a pond for a new memory" data-pond-ready={enabled}
    style={{ position: "absolute", inset: 0, overflow: "hidden", background: "linear-gradient(#ededE8, #e2e6e2 42%, #b6c8c3)", opacity: leaving ? 0 : 1, transition: "opacity 480ms ease" }}>
    <PerspectivePond arrival={arrival} reducedMotion={reducedMotion} touch={touch} cursorRef={cursorRef} holdRef={holdProgress} hintRef={hintRef} hintRevealRef={hintReveal} promptRefs={promptRefs} cueRef={cueRef} onReady={ready} lifeReady={lifeReady} />
    <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse at 48% 24%, #fff9, transparent 58%)" }} />
    {POND_THOUGHTS.map((thought, i) => <div key={thought.text} ref={el => { promptRefs.current[i] = el; }} data-pond-prompt={i} aria-hidden="true"
      style={{ position: "absolute", top: 0, left: 0, width: "min(148px, 42vw)", textAlign: "center", pointerEvents: "none", opacity: 0, transform: "translate(-50%, -100%) translate(50vw, 58vh)", transformOrigin: "center bottom", color: CHROME_GRAY, fontFamily: SERIF_EXPOSURE, fontWeight: 400, fontSynthesis: "none", fontSize: INSTRUCTION_SIZE, lineHeight: 1.45, textShadow: "0 1px 16px #f3f4ece6", paddingBottom: 52 }}>
      {thought.text}
    </div>)}
    <p
      ref={lineRef}
      aria-hidden
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: seen.current
          ? "translate(-50%, -50%) translateY(-20vh)"
          : "translate(-50%, -50%) translateY(18px)",
        margin: 0,
        width: "min(28em, 86vw)",
        textAlign: "center",
        pointerEvents: "none",
        zIndex: 8,
        color: CHROME_GRAY,
        fontFamily: SERIF,
        fontWeight: 400,
        fontSynthesis: "none",
        fontSize: INSTRUCTION_SIZE,
        lineHeight: 1.45,
        opacity: seen.current ? arrival : 0,
      }}
    >
      Let's put a memory to shape.
    </p>
    <button ref={buttonRef} aria-label="hold to create a memory" aria-describedby="pond-hold-help" disabled={!enabled}
      onPointerDown={e => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        origin.current = { x: e.clientX, y: e.clientY };
        setCursor(e);
        const r = e.currentTarget.getBoundingClientRect();
        setTouch({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, serial: performance.now() });
        hold.start();
      }}
      onPointerMove={e => {
        setCursor(e);
        if (!origin.current) return;
        const dx = e.clientX - origin.current.x;
        const dy = e.clientY - origin.current.y;
        if (Math.abs(dx) > 16 || Math.abs(dy) > 16) hold.cancel();
        if (dy < -70) {
          origin.current = null;
          hold.cancel();
          back();
        }
      }}
      onPointerLeave={() => { cursorRef.current = null; }}
      onPointerUp={() => { origin.current = null; hold.cancel(); }}
      onPointerCancel={() => { origin.current = null; cursorRef.current = null; hold.cancel(); }}
      onLostPointerCapture={() => { origin.current = null; hold.cancel(); }}
      onBlur={hold.cancel} onContextMenu={e => e.preventDefault()}
      onKeyDown={e => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); hold.start(); } }}
      onKeyUp={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); hold.cancel(); } }}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none", outline: "none", background: "transparent", touchAction: "none", cursor: "default", zIndex: 10 }}>
      <span className="sr-only">hold for two seconds, or hold space or enter. release to cancel.</span>
    </button>
    <div ref={hintRef} id="pond-hold-help" aria-hidden
      style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none", zIndex: 20, opacity: 0, filter: "blur(6px)", whiteSpace: "nowrap", fontFamily: SANS, fontSize: INSTRUCTION_SIZE, letterSpacing: "0.01em", color: CHROME_GRAY, transformOrigin: "left top" }}>
      hold to record a memory
    </div>
    <span className="sr-only" role="status">{leaving ? "opening a new memory" : ""}</span>
  </section>;
}
