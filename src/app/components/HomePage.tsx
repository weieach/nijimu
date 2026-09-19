import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { SERIF } from "../lib/theme";
import { NAMING_PATH } from "../lib/routes";
import { BlobScene } from "./BlobScene";
import { PuddleScene } from "./PuddleScene";
import { NameMemoryPage } from "./NameMemoryPage";
import type { NameFlowState, NamingSession } from "./NamingRim";
import { isPuddleSupported } from "../lib/puddle/simulation";
import { isRipple2dSupported } from "../lib/puddle/ripple2d";
import {
  GalleryVariant,
  readGalleryVariant,
  writeGalleryVariant,
} from "../lib/puddle/dive";

export type ShaderVariant = "blobs" | "puddle" | "ripple2d";

const VARIANT_KEY = "nijimu.shaderVariant";

/**
 * The home memory field, in one of three renderings:
 *  - 'ripple2d' — WebGL2 airy "rings of light" 2d texture — this route's default
 *  - 'puddle'   — WebGL2 watercolor / iridescent puddle — key B
 *  - 'blobs'    — the legacy CSS blob field (BlobScene) — key A, compare only
 * Lives at /ripple; the original blob field is the index landing.
 * Same API as BlobScene so the older variants can still be A/B'd in place.
 */
export function MemoryField({
  shaderVariant = "ripple2d",
  onNewMemory,
  hideAnnotations = false,
  diveGalleryEnabled = false,
  galleryOpen = false,
  galleryFocusId,
  galleryCarried = false,
  naming = null,
  onGalleryExit,
  onToggleGrid,
}: {
  shaderVariant?: ShaderVariant;
  /** The puddle hands back the uv point its descent ended on (see PuddleScene). */
  onNewMemory?: (focus?: [number, number]) => void;
  hideAnnotations?: boolean;
  /** Flagged 'dive' gallery variant — puddle texture only (see lib/puddle/dive.ts). */
  diveGalleryEnabled?: boolean;
  galleryOpen?: boolean;
  /** Which memory the gallery opens on; the oldest when unset. */
  galleryFocusId?: string;
  /** The naming step handed its carousel over — open at depth, don't dive. */
  galleryCarried?: boolean;
  /** The naming step, hosted inside the puddle field (see PuddleScene). */
  naming?: NamingSession | null;
  onGalleryExit?: () => void;
  onToggleGrid?: () => void;
}) {
  if (shaderVariant === "ripple2d" && isRipple2dSupported()) {
    return (
      <PuddleScene
        texture="ripple2d"
        onNewMemory={onNewMemory}
        hideAnnotations={hideAnnotations}
      />
    );
  }
  if (shaderVariant === "puddle" && isPuddleSupported()) {
    return (
      <PuddleScene
        texture="puddle"
        onNewMemory={onNewMemory}
        hideAnnotations={hideAnnotations}
        diveGalleryEnabled={diveGalleryEnabled}
        galleryOpen={galleryOpen}
        galleryFocusId={galleryFocusId}
        galleryCarried={galleryCarried}
        naming={naming}
        onGalleryExit={onGalleryExit}
        onToggleGrid={onToggleGrid}
      />
    );
  }
  return (
    <BlobScene
      onNewMemory={onNewMemory}
      hideAnnotations={hideAnnotations}
      onToggleGrid={onToggleGrid}
    />
  );
}

/** The homescreen the user is on — also decides which recording screen opens. */
export function readVariant(): ShaderVariant {
  try {
    const v = sessionStorage.getItem(VARIANT_KEY);
    if (v === "blobs" || v === "puddle" || v === "ripple2d") return v;
  } catch {
    // private mode
  }
  return "ripple2d";
}

export function writeVariant(next: ShaderVariant): void {
  try {
    sessionStorage.setItem(VARIANT_KEY, next);
  } catch {
    // private mode — the toggle just won't survive a refresh
  }
}

/** What the create flow asks for when it lands here: the gallery already open,
    on the memory just saved, continuing the carousel the naming step showed. */
interface GalleryEntry {
  galleryOpen?: boolean;
  galleryFocusId?: string;
  galleryCarried?: boolean;
}

export function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [variant, setVariant] = useState<ShaderVariant>(readVariant);
  const entryFromNav = () => {
    const state = location.state as GalleryEntry | null;
    return state?.galleryOpen ? state : null;
  };
  /** G shortcut: open the memory artifact gallery; Esc restores the active test homescreen. */
  const [galleryOpen, setGalleryOpen] = useState(() => !!entryFromNav());
  /** Set only for the hand-off from the naming step; cleared once the gallery
      closes, so a later G press dives the ordinary way. */
  const [entry, setEntry] = useState<GalleryEntry | null>(entryFromNav);

  /* A navigation that asks for the gallery is honoured in the same render it
     lands in, not an effect later: the naming step's save arrives this way,
     and its rim must never be painted once as "not carried". */
  const [seenState, setSeenState] = useState(location.state);
  if (location.state !== seenState) {
    setSeenState(location.state);
    const state = location.state as GalleryEntry | null;
    if (state?.galleryOpen) {
      setGalleryOpen(true);
      setEntry(state);
    }
  }
  /** V shortcut: A/B flag — 'morph' (existing BlobScene gallery) vs 'dive' (through the puddle). */
  const [galleryVariant, setGalleryVariant] = useState<GalleryVariant>(readGalleryVariant);
  /** Transient confirmation after pressing V — otherwise the flag is invisible. */
  const [flagNotice, setFlagNotice] = useState<{ text: string; key: number } | null>(null);

  /* The naming step. This page is also mounted for NAMING_PATH (see App.tsx):
     the memory being made is named over the field's own scene, so saving it
     changes what the scene shows without remounting anything. The id is the
     memory's for good, minted when the step is entered. */
  const namingActive = location.pathname === NAMING_PATH;
  const [draftId] = useState(() => crypto.randomUUID());
  const naming = useMemo<NamingSession | null>(
    () =>
      namingActive
        ? { draftId, state: (location.state as NameFlowState | null) ?? {} }
        : null,
    [draftId, location.state, namingActive],
  );

  // Fresh values for the keydown handler (registered once with [] deps).
  const variantRef = useRef(variant);
  variantRef.current = variant;
  const namingRef = useRef(namingActive);
  namingRef.current = namingActive;

  // The dive gallery only exists on the puddle homescreen; everywhere else G
  // falls back to the morph gallery so the flag never strands the shortcut.
  const diveCapable =
    variant === "puddle" && galleryVariant === "dive" && isPuddleSupported();

  // Field-only shortcuts (see README); this page lives at /ripple:
  //   Z — ripple2d homescreen (default on this route)
  //   B — puddle homescreen
  //   A — original blob homescreen (compare)
  //   G — open memory artifact gallery (any field variant)
  //   V — toggle gallery variant: morph ↔ dive (dive runs on the puddle field)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (namingRef.current) return; // the naming step owns the keyboard
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;

      const key = e.key.toLowerCase();
      if (key === "g") {
        setEntry(null); // a keyed open always dives
        setGalleryOpen((open) => !open);
        return;
      }
      if (key === "v") {
        // sessionStorage is the source of truth, so the once-registered
        // handler never reads a stale flag; state updaters stay pure.
        const next: GalleryVariant = readGalleryVariant() === "dive" ? "morph" : "dive";
        writeGalleryVariant(next);
        setEntry(null);
        setGalleryOpen(false);
        setGalleryVariant(next);
        // quiet confirmation — and a nudge when the flag can't take effect here
        const hint =
          next === "dive" && variantRef.current !== "puddle"
            ? " — works on the puddle homescreen (press B)"
            : "";
        setFlagNotice({ text: `gallery: ${next}${hint}`, key: Date.now() });
        return;
      }

      let next: ShaderVariant | null = null;
      if (key === "a") next = "blobs";
      else if (key === "b") next = "puddle";
      else if (key === "z") next = "ripple2d";
      if (!next) return;

      setEntry(null);
      setGalleryOpen(false);
      writeVariant(next);
      setVariant(next);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // The V confirmation dissolves on its own.
  useEffect(() => {
    if (!flagNotice) return;
    const t = setTimeout(() => setFlagNotice(null), 3200);
    return () => clearTimeout(t);
  }, [flagNotice]);

  // Morph gallery (the existing A side): swaps the whole scene for BlobScene.
  // The dive gallery instead stays inside PuddleScene so the sim's accumulated
  // dye/height state survives the descent and the return.
  const openGrid = () => navigate("/memory/scroll");

  const closeGallery = () => {
    setEntry(null);
    setGalleryOpen(false);
  };

  /* Only the puddle field has a dive gallery to hand the naming rim to. The
     other fields get the naming step on its own page and the ordinary gallery
     open afterwards. */
  const scene =
    naming && !diveCapable ? (
      <NameMemoryPage />
    ) : galleryOpen && !diveCapable ? (
      <BlobScene
        openGallery
        onNewMemory={() => navigate("/record/start")}
        onGalleryExit={closeGallery}
        onToggleGrid={openGrid}
      />
    ) : (
      <MemoryField
        key={variant}
        shaderVariant={variant}
        onNewMemory={(focus) => navigate("/record/start", { state: focus ? { focus } : undefined })}
        diveGalleryEnabled={diveCapable}
        galleryOpen={galleryOpen && diveCapable}
        galleryFocusId={entry?.galleryFocusId}
        galleryCarried={!!entry?.galleryCarried}
        naming={diveCapable ? naming : null}
        onGalleryExit={closeGallery}
        onToggleGrid={openGrid}
      />
    );

  return (
    <>
      {scene}
      {flagNotice && (
        <div
          key={flagNotice.key}
          style={{
            position: "fixed",
            left: "50%",
            bottom: 96,
            transform: "translateX(-50%)",
            zIndex: 60,
            pointerEvents: "none",
            fontFamily: SERIF,
            fontStyle: "italic",
            fontSize: 13,
            color: "#4a4a4a",
            textShadow: "0 0 10px rgba(237,237,238,0.65)",
            whiteSpace: "nowrap",
            animation: "galleryFlagNotice 3.2s ease forwards",
          }}
        >
          {flagNotice.text}
          <style>{`
            @keyframes galleryFlagNotice {
              0% { opacity: 0; }
              10% { opacity: 0.85; }
              75% { opacity: 0.85; }
              100% { opacity: 0; }
            }
          `}</style>
        </div>
      )}
    </>
  );
}
