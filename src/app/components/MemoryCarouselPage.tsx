import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { isPuddleSupported } from "../lib/puddle/simulation";
import { PuddleScene } from "./PuddleScene";
import { PageHeader } from "./PageHeader";
import { buildArchive } from "../lib/archive";
import { MEMORY_POND_PATH } from "../lib/routes";
import { INK_ENTRY, type InkArrival } from "../lib/landingTransition";
import { DiveGalleryHost, type NamingSession } from "./NamingRim";

/** Dedicated 3D carousel at /memory — the dive gallery, not the blob overlay.
    Also hosts the naming rim, so saving only changes props on this scene. */
export function MemoryCarouselPage({
  inkArrival,
  galleryFocusId,
  galleryCarried = false,
  naming = null,
  onPondEnter,
  pondDeparture = 0,
  hideHeader = false,
}: {
  inkArrival?: InkArrival;
  /** Chronological seat the landing ink unfolds onto, or the memory just named. */
  galleryFocusId?: string;
  /** The naming step handed its rim over — open at depth, don't dive. */
  galleryCarried?: boolean;
  naming?: NamingSession | null;
  onPondEnter?: () => void;
  pondDeparture?: number;
  hideHeader?: boolean;
}) {
  const navigate = useNavigate();
  const items = useMemo(() => buildArchive(), [naming]);
  const [activeIdx, setActiveIdx] = useState(() => {
    if (!galleryFocusId) return 0;
    const i = items.findIndex((a) => a.id === galleryFocusId);
    return i < 0 ? 0 : i;
  });
  const [seenFocusId, setSeenFocusId] = useState(galleryFocusId);
  let idx = activeIdx;
  const focusId = naming?.draftId ?? galleryFocusId;
  if (galleryFocusId !== seenFocusId) {
    setSeenFocusId(galleryFocusId);
    if (galleryFocusId) {
      const i = items.findIndex((a) => a.id === galleryFocusId);
      if (i >= 0) {
        idx = i;
        if (i !== activeIdx) setActiveIdx(i);
      }
    }
  }
  const itemsRef = useRef(items);
  if (items !== itemsRef.current) {
    itemsRef.current = items;
    if (focusId && items[idx]?.id !== focusId) {
      const i = items.findIndex((a) => a.id === focusId);
      if (i >= 0) {
        idx = i;
        if (i !== activeIdx) setActiveIdx(i);
      }
    }
  }
  const goRecord = () => navigate("/record/start");
  const goHome = () => navigate("/");
  const goPond = onPondEnter ?? (() => navigate(MEMORY_POND_PATH));
  const goGrid = () => navigate("/memory/scroll");

  const markReady = !inkArrival || inkArrival.elapsed >= (inkArrival.reducedMotion ? INK_ENTRY.reducedEnd : INK_ENTRY.end);

  if (!isPuddleSupported()) {
    return (
      <>
        {markReady && !hideHeader && <PageHeader layout="absolute" link={false} />}
        <DiveGalleryHost
          naming={naming}
          reducedMotion={inkArrival?.reducedMotion ?? window.matchMedia("(prefers-reduced-motion: reduce)").matches}
          gallery={{
            inkArrival,
            pondDeparture,
            hideHeader,
            items,
            activeIdx: idx,
            phase: "gallery",
            onNavigate: (delta) => setActiveIdx((i) => Math.max(0, Math.min(items.length - 1, i + delta))),
            onExit: goHome,
            onOverscrollExit: goPond,
            onToggleGrid: goGrid,
            arrival: galleryCarried ? "carried" : "resolve",
          }}
        />
      </>
    );
  }

  return (
    <PuddleScene
      texture="puddle"
      diveGalleryEnabled
      galleryOpen
      galleryOnly
      inkArrival={inkArrival}
      pondDeparture={pondDeparture}
      hideGalleryHeader={hideHeader}
      galleryFocusId={galleryFocusId}
      galleryCarried={galleryCarried}
      naming={naming}
      hideAnnotations
      onNewMemory={goRecord}
      onGalleryExit={goHome}
      onOverscrollExit={goPond}
      onToggleGrid={goGrid}
    />
  );
}
