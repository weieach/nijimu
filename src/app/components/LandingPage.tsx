import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { BlobScene } from "./BlobScene";
import { MemoryCarouselPage } from "./MemoryCarouselPage";
import { MemoryPondPage } from "./MemoryPondPage";
import { PageHeader } from "./PageHeader";
import { BackButton } from "./BackButton";
import { GalleryViewToggle } from "./GalleryViewToggle";
import { INK_ENTRY, pickLandingGalleryIndex, type InkArrival } from "../lib/landingTransition";
import { buildArchive } from "../lib/archive";
import { CAROUSEL_PATH, MEMORY_POND_PATH, NAMING_PATH, RECORD_START_PATH } from "../lib/routes";
import { POND_ENTRY, pondTransition, pondSurfaceMask } from "../lib/pondTransition";
import type { NameFlowState, NamingSession } from "./NamingRim";

/** What the create flow asks for when it lands on /memory: the gallery already
    open, on the memory just saved, continuing the rim the naming step showed. */
interface GalleryEntry {
  galleryOpen?: boolean;
  galleryFocusId?: string;
  galleryCarried?: boolean;
}

/**
 * One layout owns /, /memory, /memory/pond, /record/start, and /record/name. The gallery starts loading
 * behind the ink when Enter is pressed, and the naming rim becomes that same
 * gallery when a memory is saved — both need the page (and its canvases) to
 * survive the URL change. The pond also mounts before the rim leaves, so its
 * perspective canvas is ready before it rises into view; scrolling back keeps
 * the gallery mounted and plays the same clock in reverse.
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
  const [pondElapsed, setPondElapsed] = useState<number | null>(null);
  const [pondReady, setPondReady] = useState(false);
  const [pondLeaving, setPondLeaving] = useState(false);
  const [pondReturnId, setPondReturnId] = useState<string>();
  const galleryRef = useRef<HTMLDivElement>(null);
  const inGallery = pathname === CAROUSEL_PATH;
  const inNaming = pathname === NAMING_PATH;
  const inRecording = pathname === RECORD_START_PATH;
  const inPond = pathname === MEMORY_POND_PATH || inRecording;
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    if (!inGallery && !inNaming && !inPond) {
      setStartedAt(null); setArrival(null); setEntryFocus(null);
      setPondElapsed(null); setPondReady(false); setPondLeaving(false);
      setPondReturnId(undefined);
    } else if (inGallery && pondLeaving) {
      setPondElapsed(null); setPondReady(false); setPondLeaving(false);
    }
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
    if (startedAt === null || inGallery || inNaming || inPond) return;
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
  }, [startedAt, inGallery, inNaming, inPond, reducedMotion, navigate]);
  useEffect(() => { if (inGallery && arrival) galleryRef.current?.focus(); }, [inGallery]);
  const openingPond = pondElapsed !== null && !pondLeaving && inGallery;
  const pondOnStage = pondElapsed !== null || inPond;
  const markPondReady = useCallback(() => setPondReady(true), []);
  const openPond = useCallback(() => {
    if (!inGallery || pondElapsed !== null || pondLeaving) return;
    setPondReady(false);
    setPondElapsed(0);
  }, [inGallery, pondElapsed, pondLeaving]);
  const closePond = useCallback(() => {
    if (pondLeaving) return;
    if (pondElapsed === null && !inPond) return;
    const archive = buildArchive();
    setPondReturnId(archive[archive.length - 1]?.id);
    setStartedAt(null); setArrival(null);
    setPondLeaving(true);
    if (pondElapsed === null) setPondElapsed(reducedMotion ? POND_ENTRY.reducedEnd : POND_ENTRY.end);
  }, [inPond, pondElapsed, pondLeaving, reducedMotion]);
  const pondElapsedRef = useRef(pondElapsed);
  pondElapsedRef.current = pondElapsed;
  const pondClock = (openingPond && pondReady) || pondLeaving;
  useEffect(() => {
    if (!pondClock) return;
    let raf = 0;
    let last = performance.now();
    let elapsed = pondElapsedRef.current ?? 0;
    const end = reducedMotion ? POND_ENTRY.reducedEnd : POND_ENTRY.end;
    const leaving = pondLeaving;
    const tick = (now: number) => {
      if (!document.hidden) {
        const dt = Math.min(50, now - last);
        elapsed = leaving ? Math.max(0, elapsed - dt) : Math.min(end, elapsed + dt);
      }
      last = now;
      setPondElapsed(elapsed);
      if (leaving) {
        if (elapsed <= 0) {
          setPondElapsed(null); setPondLeaving(false); setPondReady(false);
          navigate(CAROUSEL_PATH, { state: { galleryFocusId: pondReturnId, galleryCarried: true } });
          return;
        }
      } else if (elapsed >= end) {
        navigate(MEMORY_POND_PATH);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const cancel = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || leaving) return;
      cancelAnimationFrame(raf);
      setPondElapsed(null); setPondReady(false);
    };
    window.addEventListener("keydown", cancel);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("keydown", cancel); };
  }, [pondClock, pondLeaving, reducedMotion, navigate, pondReturnId]);
  const enter = () => {
    if (startedAt !== null) return;
    const archive = buildArchive();
    const slot = pickLandingGalleryIndex(archive.length);
    setEntryFocus({ id: archive[slot]?.id ?? "", slot });
    setArrival({ elapsed: 0, reducedMotion });
    setStartedAt(performance.now());
  };
  const showGallery = inGallery || inNaming || inPond || !!arrival || pondElapsed !== null;
  const pond = pondTransition(pondElapsed ?? 0, reducedMotion);
  const pondArrival = inPond && pondElapsed === null ? 1 : pond.arrival;
  return (
    <main style={{ position: "relative", width: "100%", height: "100dvh", overflow: "hidden", background: "#e4e4e6" }}>
      {showGallery && (
        <div ref={galleryRef} tabIndex={-1} aria-label="memory gallery" inert={pondElapsed !== null || (!inGallery && !inNaming)}
          style={{ position: "absolute", inset: 0, zIndex: 0, outline: "none", opacity: pondElapsed !== null ? pond.galleryOpacity : 1 }}>
          <MemoryCarouselPage
            inkArrival={inNaming ? undefined : arrival ?? undefined}
            galleryFocusId={pondReturnId ?? galleryEntry?.galleryFocusId ?? naming?.draftId ?? entryFocus?.id}
            galleryCarried={!!pondReturnId || !!galleryEntry?.galleryCarried}
            naming={naming}
            onPondEnter={openPond}
            pondDeparture={pondElapsed !== null ? Math.max(.00001, pond.departure) : 0}
            hideHeader={pondElapsed !== null || inPond}
          />
        </div>
      )}
      {pondOnStage && (
        <div data-pond-stage={pondLeaving ? "returning" : inPond ? "settled" : pond.arrival > 0 ? "rising" : "artifacts-leaving"}
          inert={!inPond || pondLeaving}
          style={{ position: "absolute", inset: 0, zIndex: 20,
            transform: reducedMotion ? undefined : `translate3d(0, min(${(1 - pondArrival) * 16}vh, ${(1 - pondArrival) * 120}px), 0)`,
            maskImage: reducedMotion ? undefined : pondSurfaceMask(pondArrival),
            WebkitMaskImage: reducedMotion ? undefined : pondSurfaceMask(pondArrival),
            opacity: pondArrival }}>
          <MemoryPondPage active={inPond && !pondLeaving} arrival={pondArrival} reducedMotion={reducedMotion} recording={inRecording} onReady={markPondReady} onLeave={closePond} />
        </div>
      )}
      {pondOnStage && (
        <div data-pond-header style={{ position: "absolute", inset: "0 0 auto", height: 76, zIndex: 100 }}>
          <PageHeader layout="absolute" link={false} />
          <BackButton onClick={() => {
            if (inRecording) navigate(MEMORY_POND_PATH);
            else if (openingPond && !pondLeaving) { setPondElapsed(null); setPondReady(false); }
            else closePond();
          }} />
          <GalleryViewToggle
            view="carousel"
            label="return to carousel"
            onToggle={() => {
              if (openingPond && !pondLeaving) { setPondElapsed(null); setPondReady(false); }
              else closePond();
            }}
          />
        </div>
      )}
      {!inGallery && !inNaming && !inPond && (
        <div style={{ position: "absolute", inset: 0, zIndex: 40 }}>
          <BlobScene classicChrome ctaLabel="Enter" showPlus={false}
            onNewMemory={enter} landingArrival={arrival}
            landingFocusSlot={entryFocus?.slot ?? 0} />
        </div>
      )}
      <span className="sr-only" role="status">{pondLeaving ? "returning to memories" : openingPond ? "opening the pond" : arrival && !inGallery ? "opening memories" : ""}</span>
    </main>
  );
}
