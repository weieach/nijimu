import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { BlobScene } from "./BlobScene";
import { MemoryCarouselPage } from "./MemoryCarouselPage";
import { INK_ENTRY, type InkArrival } from "../lib/landingTransition";
import { CAROUSEL_PATH } from "../lib/routes";

/**
 * One layout owns / and /memory. The gallery starts loading behind the ink
 * when Enter is pressed and survives the URL change after its artifacts grow.
 */
export function LandingPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [arrival, setArrival] = useState<InkArrival | null>(null);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [seenPath, setSeenPath] = useState(pathname);
  const galleryRef = useRef<HTMLDivElement>(null);
  const inGallery = pathname === CAROUSEL_PATH;
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    if (!inGallery) { setStartedAt(null); setArrival(null); }
  }
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReducedMotion(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (startedAt === null || inGallery) return;
    let raf = 0;
    let last = performance.now(), elapsed = 0;
    const end = reducedMotion ? INK_ENTRY.reducedEnd : INK_ENTRY.end;
    const tick = (now: number) => {
      // Shader compilation and a background tab must never skip an entire
      // stage. Advance by displayed frames, with a bounded catch-up.
      if (!document.hidden) elapsed = Math.min(end, elapsed + Math.min(50, now - last));
      last = now;
      setArrival({ elapsed, reducedMotion });
      if (elapsed >= end) { navigate(CAROUSEL_PATH); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const cancel = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      cancelAnimationFrame(raf); setStartedAt(null); setArrival(null);
    };
    window.addEventListener("keydown", cancel);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("keydown", cancel); };
  }, [startedAt, inGallery, reducedMotion, navigate]);
  useEffect(() => { if (inGallery && arrival) galleryRef.current?.focus(); }, [inGallery]);
  const enter = () => {
    if (startedAt !== null) return;
    setArrival({ elapsed: 0, reducedMotion });
    setStartedAt(performance.now());
  };
  return (
    <main style={{ position: "relative", width: "100%", height: "100dvh", overflow: "hidden", background: "#ededee" }}>
      {(inGallery || arrival) && (
        <div ref={galleryRef} tabIndex={-1} aria-label="memory gallery" inert={!inGallery}
          style={{ position: "absolute", inset: 0, zIndex: 0, outline: "none" }}>
          <MemoryCarouselPage inkArrival={arrival ?? undefined} />
        </div>
      )}
      {!inGallery && (
        <div style={{ position: "absolute", inset: 0, zIndex: 40 }}>
          <BlobScene classicChrome ctaLabel="Enter" showPlus={false}
            onNewMemory={enter} landingArrival={arrival} />
        </div>
      )}
      <span className="sr-only" role="status">{arrival && !inGallery ? "opening memories" : ""}</span>
    </main>
  );
}
