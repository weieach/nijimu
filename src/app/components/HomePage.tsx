import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { BlobScene } from "./BlobScene";
import { PuddleScene } from "./PuddleScene";
import { isPuddleSupported } from "../lib/puddle/simulation";
import { isRipple2dSupported } from "../lib/puddle/ripple2d";

export type ShaderVariant = "blobs" | "puddle" | "ripple2d";

const VARIANT_KEY = "nijimu.shaderVariant";

/**
 * The home memory field, in one of three renderings:
 *  - 'blobs'    — the existing CSS blob field (BlobScene)
 *  - 'puddle'   — WebGL2 watercolor / iridescent puddle (A)
 *  - 'ripple2d' — WebGL2 airy "rings of light" 2d texture (Z)
 * Same API as BlobScene so the variants can be A/B'd in place.
 */
export function MemoryField({
  shaderVariant = "blobs",
  onNewMemory,
  hideAnnotations = false,
}: {
  shaderVariant?: ShaderVariant;
  onNewMemory?: () => void;
  hideAnnotations?: boolean;
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
      />
    );
  }
  return <BlobScene onNewMemory={onNewMemory} hideAnnotations={hideAnnotations} />;
}

function readVariant(): ShaderVariant {
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

  // Home-only A/B shortcuts (see README):
  //   A — blobs ↔ puddle
  //   Z — blobs ↔ ripple2d (2d ripple texture)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;

      const key = e.key.toLowerCase();
      if (key !== "a" && key !== "z") return;

      setVariant((v) => {
        let next: ShaderVariant;
        if (key === "a") {
          next = v === "puddle" ? "blobs" : "puddle";
        } else {
          next = v === "ripple2d" ? "blobs" : "ripple2d";
        }
        writeVariant(next);
        return next;
      });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <MemoryField
      key={variant}
      shaderVariant={variant}
      onNewMemory={() => navigate("/record/start")}
    />
  );
}
