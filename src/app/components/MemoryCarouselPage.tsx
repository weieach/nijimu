import { useState } from "react";
import { useNavigate } from "react-router";
import { isPuddleSupported } from "../lib/puddle/simulation";
import { PuddleScene } from "./PuddleScene";
import { PuddleDiveGallery } from "./PuddleDiveGallery";
import { buildArchive } from "../lib/archive";
import type { InkArrival } from "../lib/landingTransition";

/** Dedicated 3D carousel at /memory — the dive gallery, not the blob overlay. */
export function MemoryCarouselPage({ inkArrival }: { inkArrival?: InkArrival }) {
  const navigate = useNavigate();
  const [items] = useState(buildArchive);
  const [activeIdx, setActiveIdx] = useState(0);
  const goRecord = () => navigate("/record/start");
  const goHome = () => navigate("/");
  const goGrid = () => navigate("/memory/scroll");

  if (!isPuddleSupported()) {
    return (
      <PuddleDiveGallery
        items={items}
        activeIdx={activeIdx}
        phase="gallery"
        reducedMotion={inkArrival?.reducedMotion ?? window.matchMedia("(prefers-reduced-motion: reduce)").matches}
        inkArrival={inkArrival}
        onNavigate={delta => setActiveIdx(i => Math.max(0, Math.min(items.length - 1, i + delta)))}
        onExit={goHome}
        onToggleGrid={goGrid}
      />
    );
  }

  return (
    <PuddleScene
      texture="puddle"
      diveGalleryEnabled
      galleryOpen
      galleryOnly
      inkArrival={inkArrival}
      hideAnnotations
      onNewMemory={goRecord}
      onGalleryExit={goHome}
      onToggleGrid={goGrid}
    />
  );
}
