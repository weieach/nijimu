import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { BlobScene } from "./BlobScene";
import { PuddleScene } from "./PuddleScene";
import { isPuddleSupported } from "../lib/puddle/simulation";

export type ShaderVariant = "blobs" | "puddle";

const VARIANT_KEY = "nijimu.shaderVariant";

/**
 * The home memory field, in one of two renderings:
 *  - 'blobs'  — the existing CSS blob field (BlobScene)
 *  - 'puddle' — the WebGL2 rain-puddle simulation (PuddleScene)
 * Same API as BlobScene so the two can be A/B'd in place.
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
  if (shaderVariant === "puddle" && isPuddleSupported()) {
    return <PuddleScene onNewMemory={onNewMemory} hideAnnotations={hideAnnotations} />;
  }
  return <BlobScene onNewMemory={onNewMemory} hideAnnotations={hideAnnotations} />;
}

export function HomePage() {
  const navigate = useNavigate();
  const [variant, setVariant] = useState<ShaderVariant>(() => {
    try {
      return sessionStorage.getItem(VARIANT_KEY) === "puddle" ? "puddle" : "blobs";
    } catch {
      return "blobs";
    }
  });

  // "A" toggles between the two field renderings (home screen only).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "a" && e.key !== "A") return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      setVariant((v) => {
        const next: ShaderVariant = v === "blobs" ? "puddle" : "blobs";
        try {
          sessionStorage.setItem(VARIANT_KEY, next);
        } catch {
          // private mode — the toggle just won't survive a refresh
        }
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
