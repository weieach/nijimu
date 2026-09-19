import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { BlobScene } from "./BlobScene";
import { MemoryCarouselPage } from "./MemoryCarouselPage";
import { INK_ENTRY, pickLandingGalleryIndex, type InkArrival } from "../lib/landingTransition";
import { buildArchive } from "../lib/archive";
import { CAROUSEL_PATH, NAMING_PATH } from "../lib/routes";
import type { NameFlowState, NamingSession } from "./NamingRim";

/** What the create flow asks for when it lands on /memory: the gallery already
    open, on the memory just saved, continuing the rim the naming step showed. */
interface GalleryEntry {
  galleryOpen?: boolean;
  galleryFocusId?: string;
  galleryCarried?: boolean;
}

/**
 * One layout owns /, /memory, and /record/name. The gallery starts loading
 * behind the ink when Enter is pressed, and the naming rim becomes that same
 * gallery when a memory is saved — both need the page (and its canvases) to
 * survive the URL change.
 */
export function LandingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname } = location;
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [arrival, setArrival] = useState<InkArrival | null>(null);
  const [entryFocus, setEntryFocus] = useState<{ id: string; slot: number } | null>(null);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [seenPath, setSeenPath] = useState(pathname);
  const galleryRef = useRef<HTMLDivElement>(null);
  const inGallery = pathname === CAROUSEL_PATH;
  const inNaming = pathname === NAMING_PATH;
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    if (!inGallery && !inNaming) { setStartedAt(null); setArrival(null); setEntryFocus(null); }
  }

  const [draftId] = useState(() => crypto.randomUUID());
  const naming = useMemo<NamingSession | null>(
    () =>
      inNaming
        ? { draftId, state: (location.state as NameFlowState | null) ?? {} }
        : null,
    [draftId, inNaming, location.state],
  );
  const galleryEntry = !inNaming ? (location.state as GalleryEntry | null) : null;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReducedMotion(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (startedAt === null || inGallery || inNaming) return;
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
      cancelAnimationFrame(raf); setStartedAt(null); setArrival(null); setEntryFocus(null);
    };
    window.addEventListener("keydown", cancel);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("keydown", cancel); };
  }, [startedAt, inGallery, inNaming, reducedMotion, navigate]);
  useEffect(() => { if (inGallery && arrival) galleryRef.current?.focus(); }, [inGallery]);
  const enter = () => {
    if (startedAt !== null) return;
    const archive = buildArchive();
    const slot = pickLandingGalleryIndex(archive.length);
    setEntryFocus({ id: archive[slot]?.id ?? "", slot });
    setArrival({ elapsed: 0, reducedMotion });
    setStartedAt(performance.now());
  };
  const showGallery = inGallery || inNaming || !!arrival;
  return (
    <main style={{ position: "relative", width: "100%", height: "100dvh", overflow: "hidden", background: "#ededee" }}>
      {showGallery && (
        <div ref={galleryRef} tabIndex={-1} aria-label="memory gallery" inert={!inGallery && !inNaming}
          style={{ position: "absolute", inset: 0, zIndex: 0, outline: "none" }}>
          <MemoryCarouselPage
            inkArrival={inNaming ? undefined : arrival ?? undefined}
            galleryFocusId={galleryEntry?.galleryFocusId ?? naming?.draftId ?? entryFocus?.id}
            galleryCarried={!!galleryEntry?.galleryCarried}
            naming={naming}
          />
        </div>
      )}
      {!inGallery && !inNaming && (
        <div style={{ position: "absolute", inset: 0, zIndex: 40 }}>
          <BlobScene classicChrome ctaLabel="Enter" showPlus={false}
            onNewMemory={enter} landingArrival={arrival}
            landingFocusSlot={entryFocus?.slot ?? 0} />
        </div>
      )}
      <span className="sr-only" role="status">{arrival && !inGallery ? "opening memories" : ""}</span>
    </main>
  );
}
