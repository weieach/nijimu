import { ReactNode, useEffect, useRef, useState } from "react";
import { SceneViewer, MODEL_PATHS } from "./SceneViewer";
import { PageHeader } from "./PageHeader";
import { LIFE_EVENTS } from "../data/memoryData";
import { SERIF, SANS } from "../lib/theme";
import { COLOR_PALETTE } from "../lib/colors";
import { loadMemories } from "../lib/memoryStore";
import addEllipse from "../../assets/memory-grid/add-ellipse.svg";
import addTriangle from "../../assets/memory-grid/add-triangle.png";

export interface GalleryMemory {
  id: string;
  title: string;
  year: string;
  lastUpdated: string;
  color: number;
  shape: {
    modelPath: string;
    colorIndex: number;
    matPresetIndex?: number;
    fluidity: number;
    evolve: number;
    bumpAmount: number;
  };
}

/** Deterministic 0–1 from a string seed (stable shapes across reloads). */
function seededUnit(seed: string, salt: number): number {
  let h = salt;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^= h >>> 16) >>> 0) / 4294967296;
}

export function formatYearMonth(isoOrYear: string): string {
  if (/^\d{4}$/.test(isoOrYear)) return `${isoOrYear}.01`;
  const d = new Date(isoOrYear);
  if (Number.isNaN(d.getTime())) return isoOrYear;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}.${m}`;
}

export function generateGalleryMemories(): GalleryMemory[] {
  const curated = LIFE_EVENTS.map((event) => {
    const colorIndex = event.color % COLOR_PALETTE.length;
    return {
      id: event.id,
      title: event.event,
      year: event.year,
      lastUpdated: formatYearMonth(event.year),
      color: event.color,
      shape: {
        modelPath: MODEL_PATHS[Math.floor(seededUnit(event.id, 1) * MODEL_PATHS.length)],
        colorIndex,
        fluidity: seededUnit(event.id, 2),
        evolve: seededUnit(event.id, 3),
        bumpAmount: seededUnit(event.id, 4) * 0.12,
      },
    };
  });

  const saved = loadMemories().map((memory) => ({
    id: memory.id,
    title: memory.title,
    year: memory.year,
    lastUpdated: formatYearMonth(memory.createdAt || memory.year),
    color: memory.colorIndex,
    shape: {
      modelPath: memory.shape.modelPath,
      colorIndex: memory.colorIndex % COLOR_PALETTE.length,
      matPresetIndex: memory.shape.matPresetIndex,
      fluidity: memory.shape.fluidity,
      evolve: memory.shape.evolve,
      bumpAmount: memory.shape.bumpAmount,
    },
  }));

  // Oldest first, newest last — same spirit as the home gallery order.
  return [...curated, ...saved].sort(
    (a, b) => (parseInt(a.year) || 0) - (parseInt(b.year) || 0),
  );
}

export function ArtifactPreview({
  memory,
  active,
}: {
  memory: GalleryMemory;
  active: boolean;
}) {
  const selectedColor = COLOR_PALETTE[memory.shape.colorIndex] ?? COLOR_PALETTE[0];

  if (!active) {
    return (
      <div
        aria-hidden
        style={{
          width: "55%",
          height: "55%",
          borderRadius: "42% 58% 55% 45% / 48% 42% 58% 52%",
          background: `radial-gradient(ellipse at 35% 30%, ${selectedColor.light1}, ${selectedColor.color})`,
          opacity: 0.85,
          filter: "blur(1px)",
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: "78%",
        height: "78%",
        pointerEvents: "none",
      }}
    >
      <SceneViewer
        modelPath={memory.shape.modelPath}
        fluidity={memory.shape.fluidity}
        evolve={memory.shape.evolve}
        bumpAmount={memory.shape.bumpAmount}
        autoRotate
        ready
        constrainedViewport
        canvasBlurPx={2}
        matPresetIndex={memory.shape.matPresetIndex}
        rectAreaLightColors={{
          color1: selectedColor.light1,
          color2: selectedColor.light2,
          matColor: selectedColor.color,
        }}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}

/** Cap concurrent WebGL canvases — browsers typically allow ~8–16. */
const MAX_LIVE_PREVIEWS = 6;
const livePreviewIds = new Set<string>();

const cardShellStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  width: "100%",
  aspectRatio: "1 / 1",
  margin: 0,
  padding: 0,
  border: "0.4px solid #7e7e7e",
  background: "#f1f1f0",
  textAlign: "left",
  overflow: "hidden",
} as const;

const captionBarStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  height: 44,
  padding: "10px 14px",
  background: "#f1f1f0",
  borderTop: "0.4px solid #7e7e7e",
  boxSizing: "border-box",
  flexShrink: 0,
} as const;

export const galleryTitleStyle = {
  margin: 0,
  fontFamily: SERIF,
  fontStyle: "italic",
  fontSize: 14,
  color: "#000",
  opacity: 0.7,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  minWidth: 0,
  flex: 1,
} as const;

export const galleryMetaStyle = {
  margin: 0,
  fontFamily: SANS,
  fontSize: 14,
  color: "#000",
  opacity: 0.7,
  whiteSpace: "nowrap",
  flexShrink: 0,
} as const;

export function ArtifactCard({
  memory,
  onOpen,
  live: liveOverride,
  footer,
}: {
  memory: GalleryMemory;
  onOpen?: () => void;
  /** Force the 3D preview on (used by the in-progress naming card). */
  live?: boolean;
  footer?: ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(liveOverride ?? false);

  useEffect(() => {
    if (liveOverride) {
      setLive(true);
      return;
    }
    const el = hostRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (livePreviewIds.has(memory.id) || livePreviewIds.size < MAX_LIVE_PREVIEWS) {
            livePreviewIds.add(memory.id);
            setLive(true);
          } else {
            setLive(false);
          }
        } else {
          livePreviewIds.delete(memory.id);
          setLive(false);
        }
      },
      { rootMargin: "40px", threshold: 0.15 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      livePreviewIds.delete(memory.id);
    };
  }, [memory.id, liveOverride]);

  const body = (
    <>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f1f1f0",
        }}
      >
        <ArtifactPreview memory={memory} active={live} />
      </div>
      {footer ?? (
        <div style={captionBarStyle}>
          <p style={galleryTitleStyle}>{memory.title.replace(/\n/g, " ")}</p>
          <p style={galleryMetaStyle}>last updated {memory.lastUpdated}</p>
        </div>
      )}
    </>
  );

  return (
    <div
      ref={hostRef}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={
        onOpen
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen();
              }
            }
          : undefined
      }
      aria-label={onOpen ? `${memory.title}, updated ${memory.lastUpdated}` : undefined}
      style={{ ...cardShellStyle, cursor: onOpen ? "pointer" : "default" }}
    >
      {body}
    </div>
  );
}

export function ArtifactCaptionBar({ children }: { children: ReactNode }) {
  return <div style={captionBarStyle}>{children}</div>;
}

export function AddMemoryCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="add a memory"
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "1 / 1",
        margin: 0,
        padding: 0,
        border: "0.6px solid #7e7e7e",
        background: "#f1f1f0",
        cursor: "pointer",
        overflow: "hidden",
      }}
    >
      <img
        src={addEllipse}
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "6.7%",
          right: "6.7%",
          top: 0,
          bottom: "25%",
          pointerEvents: "none",
        }}
      >
        <img
          src={addTriangle}
          alt=""
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "contain",
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          pointerEvents: "none",
        }}
      >
        <span
          style={{
            fontFamily: SERIF,
            fontSize: 44,
            lineHeight: 1,
            color: "#000",
            opacity: 0.5,
          }}
        >
          +
        </span>
        <span
          style={{
            fontFamily: SERIF,
            fontSize: 14,
            color: "#000",
            opacity: 0.5,
            whiteSpace: "nowrap",
          }}
        >
          add a memory
        </span>
      </div>
    </button>
  );
}

export function GalleryPage({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f1f1f0",
        boxSizing: "border-box",
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          height: 72,
          background: "#f1f1f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
        }}
      >
        <PageHeader layout="block" style={{ marginTop: 0, marginBottom: 0 }} />
      </header>

      <div
        style={{
          width: "100%",
          maxWidth: 1728,
          margin: "0 auto",
          padding: footer ? "0 24px 120px" : "0 24px 30px",
          boxSizing: "border-box",
        }}
      >
        <div
          className="memory-artifact-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            width: "100%",
          }}
        >
          {children}
        </div>
      </div>

      {footer}

      <style>{`
        @media (max-width: 1100px) {
          .memory-artifact-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }
        @media (max-width: 640px) {
          .memory-artifact-grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
    </div>
  );
}
