import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { SERIF } from "../lib/theme";
import { BlobScene } from "./BlobScene";
import { PuddleScene } from "./PuddleScene";
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
 *  - 'blobs'    — the existing CSS blob field (BlobScene) — key A
 *  - 'puddle'   — WebGL2 watercolor / iridescent puddle — key B
 *  - 'ripple2d' — WebGL2 airy "rings of light" 2d texture — key Z
 * Same API as BlobScene so the variants can be A/B'd in place.
 */
export function MemoryField({
  shaderVariant = "blobs",
  onNewMemory,
  hideAnnotations = false,
  diveGalleryEnabled = false,
  galleryOpen = false,
  onGalleryExit,
}: {
  shaderVariant?: ShaderVariant;
  /** The puddle hands back the uv point its descent ended on (see PuddleScene). */
  onNewMemory?: (focus?: [number, number]) => void;
  hideAnnotations?: boolean;
  /** Flagged 'dive' gallery variant — puddle texture only (see lib/puddle/dive.ts). */
  diveGalleryEnabled?: boolean;
  galleryOpen?: boolean;
  onGalleryExit?: () => void;
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
        onGalleryExit={onGalleryExit}
      />
    );
  }
  return <BlobScene onNewMemory={onNewMemory} hideAnnotations={hideAnnotations} />;
}

/** The homescreen the user is on — also decides which recording screen opens. */
export function readVariant(): ShaderVariant {
  try {
    const v = sessionStorage.getItem(VARIANT_KEY);
    if (v === "puddle" || v === "ripple2d") return v;
  } catch {
    // private mode
  }
  return "blobs";
}

function writeVariant(next: ShaderVariant): void {
  try {
    sessionStorage.setItem(VARIANT_KEY, next);
  } catch {
    // private mode — the toggle just won't survive a refresh
  }
}

export function HomePage() {
  const navigate = useNavigate();
  const [variant, setVariant] = useState<ShaderVariant>(readVariant);
  /** G shortcut: open the memory artifact gallery; Esc restores the active test homescreen. */
  const [galleryOpen, setGalleryOpen] = useState(false);
  /** V shortcut: A/B flag — 'morph' (existing BlobScene gallery) vs 'dive' (through the puddle). */
  const [galleryVariant, setGalleryVariant] = useState<GalleryVariant>(readGalleryVariant);
  /** Transient confirmation after pressing V — otherwise the flag is invisible. */
  const [flagNotice, setFlagNotice] = useState<{ text: string; key: number } | null>(null);

  // Fresh values for the keydown handler (registered once with [] deps).
  const variantRef = useRef(variant);
  variantRef.current = variant;

  // The dive gallery only exists on the puddle homescreen; everywhere else G
  // falls back to the morph gallery so the flag never strands the shortcut.
  const diveCapable =
    variant === "puddle" && galleryVariant === "dive" && isPuddleSupported();

  // Home-only shortcuts (see README):
  //   A — original blob homescreen
  //   B — puddle homescreen
  //   Z — ripple2d homescreen
  //   G — open memory artifact gallery (any homescreen)
  //   V — toggle gallery variant: morph ↔ dive (dive runs on the puddle homescreen)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;

      const key = e.key.toLowerCase();
      if (key === "g") {
        setGalleryOpen((open) => !open);
        return;
      }
      if (key === "v") {
        // sessionStorage is the source of truth, so the once-registered
        // handler never reads a stale flag; state updaters stay pure.
        const next: GalleryVariant = readGalleryVariant() === "dive" ? "morph" : "dive";
        writeGalleryVariant(next);
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
  const scene =
    galleryOpen && !diveCapable ? (
      <BlobScene
        openGallery
        onNewMemory={() => navigate("/record/start")}
        onGalleryExit={() => setGalleryOpen(false)}
      />
    ) : (
      <MemoryField
        key={variant}
        shaderVariant={variant}
        onNewMemory={(focus) => navigate("/record/start", { state: focus ? { focus } : undefined })}
        diveGalleryEnabled={diveCapable}
        galleryOpen={galleryOpen && diveCapable}
        onGalleryExit={() => setGalleryOpen(false)}
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
