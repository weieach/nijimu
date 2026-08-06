import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { SceneViewer, MODEL_PATHS } from "./SceneViewer";
import { LIFE_EVENTS } from "../data/memoryData";
import { SERIF, SANS } from "../lib/theme";
import { COLOR_PALETTE } from "../lib/colors";
import { loadMemories } from "../lib/memoryStore";
import addEllipse from "../../assets/memory-grid/add-ellipse.svg";
import addTriangle from "../../assets/memory-grid/add-triangle.png";

interface Memory {
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

function formatYearMonth(isoOrYear: string): string {
  if (/^\d{4}$/.test(isoOrYear)) return `${isoOrYear}.01`;
  const d = new Date(isoOrYear);
  if (Number.isNaN(d.getTime())) return isoOrYear;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}.${m}`;
}

const generateMemories = (): Memory[] => {
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

  // Newest saved first, then curated (same spirit as the home gallery order).
  return [...saved.reverse(), ...curated];
};

function ArtifactPreview({ memory, active }: { memory: Memory; active: boolean }) {
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

function ArtifactCard({
  memory,
  onOpen,
}: {
  memory: Memory;
  onOpen: () => void;
}) {
  const hostRef = useRef<HTMLButtonElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
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
  }, [memory.id]);

  return (
    <button
      ref={hostRef}
      type="button"
      onClick={onOpen}
      aria-label={`${memory.title}, updated ${memory.lastUpdated}`}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        width: "100%",
        aspectRatio: "1 / 1",
        margin: 0,
        padding: 0,
        border: "0.4px solid #7e7e7e",
        background: "#f1f1f0",
        cursor: "pointer",
        textAlign: "left",
        overflow: "hidden",
      }}
    >
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

      <div
        style={{
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
        }}
      >
        <p
          style={{
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
          }}
        >
          {memory.title.replace(/\n/g, " ")}
        </p>
        <p
          style={{
            margin: 0,
            fontFamily: SANS,
            fontSize: 14,
            color: "#000",
            opacity: 0.7,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          last updated {memory.lastUpdated}
        </p>
      </div>
    </button>
  );
}

function AddMemoryCard({ onClick }: { onClick: () => void }) {
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

export function MemoryScrollPage() {
  const navigate = useNavigate();
  const [memories] = useState<Memory[]>(generateMemories);

  const handleMemoryClick = (memory: Memory) => {
    navigate("/memory/revisit", {
      state: {
        memory: {
          id: memory.id,
          event: memory.title,
          year: memory.year,
          color: memory.color,
        },
        shape: {
          modelPath: memory.shape.modelPath,
          fluidity: memory.shape.fluidity,
          evolve: memory.shape.evolve,
          bumpAmount: memory.shape.bumpAmount,
          colors: {
            color1: COLOR_PALETTE[memory.shape.colorIndex].light1,
            color2: COLOR_PALETTE[memory.shape.colorIndex].light2,
            matColor: COLOR_PALETTE[memory.shape.colorIndex].color,
          },
        },
      },
    });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f1f1f0",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          height: 61,
          background: "#f1f1f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 24px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            maxWidth: 1680,
            height: 40,
            border: "0.6px solid #7e7e7e",
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <a
            href={import.meta.env.BASE_URL}
            onClick={(e) => {
              e.preventDefault();
              navigate("/");
            }}
            style={{
              fontFamily: SERIF,
              fontStyle: "italic",
              fontSize: 17,
              color: "#000",
              opacity: 0.5,
              textDecoration: "none",
              cursor: "pointer",
            }}
          >
            nijimu{" "}
            <span style={{ fontStyle: "normal" }}>滲む</span>
          </a>
          <button
            type="button"
            onClick={() => navigate("/profile")}
            style={{
              position: "absolute",
              right: 16,
              top: "50%",
              transform: "translateY(-50%)",
              margin: 0,
              padding: 0,
              border: "none",
              background: "transparent",
              fontFamily: SERIF,
              fontSize: 17,
              color: "#000",
              opacity: 0.5,
              cursor: "pointer",
            }}
          >
            profile
          </button>
        </div>
      </header>

      {/* Artifact grid */}
      <div
        style={{
          width: "100%",
          maxWidth: 1728,
          margin: "0 auto",
          padding: "0 24px 30px",
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
          <AddMemoryCard onClick={() => navigate("/record/start")} />
          {memories.map((memory) => (
            <ArtifactCard
              key={memory.id}
              memory={memory}
              onOpen={() => handleMemoryClick(memory)}
            />
          ))}
        </div>
      </div>

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
