import { useCallback, useEffect, useRef, useState } from "react";

/** A release, lost capture, tab switch, or unmount always cancels the hold. */
export function useHoldToCreate(onComplete: () => void, enabled: boolean) {
  const [progress, setProgress] = useState(0);
  const raf = useRef(0);
  const holding = useRef(false);
  const committed = useRef(false);
  const complete = useRef(onComplete);
  complete.current = onComplete;
  const cancel = useCallback(() => {
    holding.current = false;
    cancelAnimationFrame(raf.current);
    setProgress(0);
  }, []);
  const reset = useCallback(() => {
    committed.current = false;
    cancel();
  }, [cancel]);
  const start = useCallback(() => {
    if (!enabled || holding.current || committed.current) return;
    holding.current = true;
    const began = performance.now();
    const tick = (now: number) => {
      if (!holding.current) return;
      const next = Math.min(1, (now - began) / 2000);
      setProgress(next);
      if (next === 1) {
        holding.current = false;
        committed.current = true;
        complete.current();
      } else raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [enabled]);
  useEffect(() => {
    if (!enabled) cancel();
  }, [enabled, cancel]);
  useEffect(() => {
    const hide = () => { if (document.hidden) cancel(); };
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", hide);
    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [cancel]);
  return { progress, start, cancel, reset };
}
