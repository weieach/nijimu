import { useLocation } from "react-router";
import { useMemo, useState } from "react";
import { PAGE_BG } from "./PuddleBackdrop";
import { PageHeader } from "./PageHeader";
import { PuddleDiveGallery } from "./PuddleDiveGallery";
import { useNamingRim, type NameFlowState, type NamingSession } from "./NamingRim";

/*
 * NameMemoryPage — the naming step on its own page.
 *
 * This is the fallback when the dive gallery's water cannot start. The usual
 * naming step is hosted on LandingPage / MemoryCarouselPage so that saving
 * turns the rim already on screen into the /memory gallery without remounting it.
 */
export function NameMemoryPage() {
  const location = useLocation();
  const [draftId] = useState(() => crypto.randomUUID());
  const [reducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const session = useMemo<NamingSession>(
    () => ({ draftId, state: (location.state as NameFlowState | null) ?? {} }),
    [draftId, location.state],
  );
  const rim = useNamingRim(session, reducedMotion);
  if (!rim) return null;

  /* The rim hangs off the sides of a wide dome, so the page is pinned to the
     viewport and clips: a memory at the end of the arc is cut by the edge of the
     screen rather than growing the document and raising scrollbars. */
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
        background: PAGE_BG,
      }}
    >
      <PageHeader layout="absolute" link={false} />
      <PuddleDiveGallery
        items={rim.items}
        activeIdx={rim.activeIdx}
        phase="gallery"
        reducedMotion={reducedMotion}
        onNavigate={() => {}}
        onExit={rim.exit}
        exitOnBackdropClick={false}
        caption={rim.caption}
        showTimeScale={false}
        showArrows={false}
        waterEffect={false}
        neighborsVisible={rim.neighborsVisible}
      />
    </div>
  );
}
