import { useState } from "react";
import { useNavigate } from "react-router";
import { isPuddleSupported } from "../lib/puddle/simulation";
import { PuddleScene } from "./PuddleScene";
import { PuddleDiveGallery } from "./PuddleDiveGallery";
import { PageHeader } from "./PageHeader";
import { buildArchive } from "../lib/archive";
import { MEMORY_FIELD_PATH } from "../lib/routes";
import { INK_ENTRY, type InkArrival } from "../lib/landingTransition";

/** Dedicated 3D carousel at /memory — the dive gallery, not the blob overlay. */
export function MemoryCarouselPage({
  inkArrival,
  galleryFocusId,
}: {
  inkArrival?: InkArrival;
  /** Chronological seat the landing ink unfolds onto. */
  galleryFocusId?: string;
}) {
  const navigate = useNavigate();
  const [items] = useState(buildArchive);
  const [activeIdx, setActiveIdx] = useState(() => {
    if (!galleryFocusId) return 0;
    const i = items.findIndex((a) => a.id === galleryFocusId);
    return i < 0 ? 0 : i;
  });
  const goRecord = () => navigate("/record/start");
  const goHome = () => navigate("/");
  const goRipple = () => navigate(MEMORY_FIELD_PATH);
  const goGrid = () => navigate("/memory/scroll");

  const markReady = !inkArrival || inkArrival.elapsed >= (inkArrival.reducedMotion ? INK_ENTRY.reducedEnd : INK_ENTRY.end);

  if (!isPuddleSupported()) {
    return (
      <>
        {markReady && <PageHeader layout="absolute" link={false} />}
        <PuddleDiveGallery
          items={items}
          activeIdx={activeIdx}
          phase="gallery"
          reducedMotion={inkArrival?.reducedMotion ?? window.matchMedia("(prefers-reduced-motion: reduce)").matches}
          inkArrival={inkArrival}
          onNavigate={delta => setActiveIdx(i => Math.max(0, Math.min(items.length - 1, i + delta)))}
          onExit={goHome}
          onOverscrollExit={goRipple}
          onToggleGrid={goGrid}
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
      galleryFocusId={galleryFocusId}
      hideAnnotations
      onNewMemory={goRecord}
      onGalleryExit={goHome}
      onOverscrollExit={goRipple}
      onToggleGrid={goGrid}
    />
  );
}
