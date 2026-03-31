import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { SceneViewer, MODEL_PATHS } from "./SceneViewer";
import { LIFE_EVENTS, COLORS } from "../data/memoryData";
import { BackButton } from "./BackButton";

// Color palette from homescreen
const COLOR_PALETTE = [
  { id: "slate", color: "#9496a6", light1: "#c8d0d4", light2: "#d6dadb" },
  { id: "cloud", color: "#D6DADB", light1: "#e8eaeb", light2: "#c8d0d4" },
  { id: "mist", color: "#C8D0D4", light1: "#e0e4e6", light2: "#d6dadb" },
  { id: "sand", color: "#CBBFBC", light1: "#e5dbd9", light2: "#d6cbc8" },
  { id: "sky", color: "#A4B6BE", light1: "#c8d0d4", light2: "#d6dadb" },
  { id: "rose", color: "#B8969A", light1: "#d8c8ca", light2: "#e5dbd9" },
  { id: "sage", color: "#8C9FA8", light1: "#b8c4ca", light2: "#c8d0d4" },
  { id: "ocean", color: "#6488A0", light1: "#9cb4c8", light2: "#b8c8d4" },
  { id: "night", color: "#1C2C35", light1: "#4a5a62", light2: "#7a8a92" },
];

interface Memory {
  id: string;
  title: string;
  year: string;
  color: number;
  shape: {
    modelPath: string;
    colorIndex: number;
    fluidity: number;
    evolve: number;
    bumpAmount: number;
  };
}

// A few catalogue memories get clearer surface texture; the rest stay mostly smooth.
const TEXTURED_MEMORY_IDS = new Set(["2", "5", "9", "12", "15"]);

// Generate memories with random shape properties
const generateMemories = (): Memory[] => {
  return LIFE_EVENTS.map((event) => {
    const isTextured = TEXTURED_MEMORY_IDS.has(event.id);
    return {
      id: event.id,
      title: event.event,
      year: event.year,
      color: event.color,
      shape: {
        modelPath: MODEL_PATHS[Math.floor(Math.random() * MODEL_PATHS.length)],
        colorIndex: Math.floor(Math.random() * COLOR_PALETTE.length),
        fluidity: Math.random(), // 0-1 for weight
        evolve: 0, // catalogue: env-spin + transmission is easy to misread as geometry tearing
        bumpAmount: isTextured
          ? 0.09 + Math.random() * 0.055 // ~0.09–0.145, capped in SceneViewer
          : Math.random() * 0.04, // mostly smooth / slight grain
      },
    };
  });
};

export function MemoryScrollPage() {
  const navigate = useNavigate();
  const [memories] = useState<Memory[]>(generateMemories());
  const [centeredIndex, setCenteredIndex] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Track which memory is centered based on scroll position
  useEffect(() => {
    const handleScroll = () => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const containerHeight = container.clientHeight;
      const scrollTop = container.scrollTop;
      const itemHeight = 76; // 48px dot + 28px margin
      const paddingTop = containerHeight * 0.2; // 20vh padding

      // Calculate which index is centered
      const scrollOffset = scrollTop + containerHeight / 2 - paddingTop;
      const index = Math.round(scrollOffset / itemHeight);
      const clampedIndex = Math.max(0, Math.min(memories.length - 1, index));

      setCenteredIndex(clampedIndex);
    };

    const container = scrollContainerRef.current;
    if (container) {
      handleScroll(); // Initial calculation
      container.addEventListener("scroll", handleScroll);
      return () => container.removeEventListener("scroll", handleScroll);
    }
  }, [memories.length]);

  const displayIndex = hoveredIndex !== null ? hoveredIndex : centeredIndex;
  const selectedMemory = memories[displayIndex];
  const selectedColor = COLOR_PALETTE[selectedMemory.shape.colorIndex];

  const handleMemoryClick = (index: number) => {
    // Navigate to revisit page with memory and shape data
    const memory = memories[index];
    console.log("Memory clicked:", memory);
    
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
          evolve: 0,
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
      className="relative w-full h-screen flex overflow-hidden"
      style={{ background: "#e0e0e0" }}
    >
      {/* Main content area - left side */}
      <div className="flex-1 relative flex flex-col items-center justify-center">
        {/* 3D Shape Viewer - 200px × 200px container */}
        <div
          className="relative"
          style={{
            width: 200,
            height: 200,
            marginBottom: "clamp(60px, 10vh, 100px)",
          }}
        >
          <SceneViewer
            modelPath={selectedMemory.shape.modelPath}
            fluidity={selectedMemory.shape.fluidity}
            evolve={0}
            bumpAmount={selectedMemory.shape.bumpAmount}
            ready={true}
            constrainedViewport
            fixedCamera
            canvasBlurPx={0}
            matOpacity={0.42}
            rectAreaLightColors={{
              color1: selectedColor.light1,
              color2: selectedColor.light2,
              matColor: selectedColor.color,
            }}
            style={{
              width: "100%",
              height: "100%",
              borderRadius: 0,
            }}
          />
        </div>

        {/* Memory title and year */}
        <div
          style={{
            textAlign: "center",
            maxWidth: "80%",
          }}
        >
          <p
            style={{
              fontFamily: "'GenRyuMin2 TW', 'Playfair Display', Georgia, serif",
              fontSize: "clamp(18px, 2.5vw, 28px)",
              fontStyle: "italic",
              color: "#7b7b87",
              marginBottom: 8,
              lineHeight: 1.3,
              whiteSpace: "pre-line",
            }}
          >
            {selectedMemory.title}
          </p>
          <p
            style={{
              fontFamily: "'GenRyuMin2 TW', 'Playfair Display', Georgia, serif",
              fontSize: "clamp(14px, 1.8vw, 20px)",
              color: "#a0a0a8",
              lineHeight: 1.3,
            }}
          >
            {selectedMemory.year}
          </p>
        </div>

        {/* Instructions at very bottom */}
        <div
          style={{
            position: "absolute",
            bottom: "clamp(40px, 6vh, 60px)",
            left: "50%",
            transform: "translateX(-50%)",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontFamily: "'Neue Haas Grotesk Display Pro', 'Neue Montreal', sans-serif",
              fontSize: "clamp(10px, 1.2vw, 13px)",
              color: "#a8a8b0",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
            }}
          >
            scroll to browse • click to revisit
          </p>
        </div>
      </div>

      {/* Memory dots - Right side with scroll */}
      <div
        ref={scrollContainerRef}
        className="relative flex flex-col items-center overflow-y-auto overflow-x-hidden"
        style={{
          width: "clamp(150px, 18vw, 250px)",
          paddingTop: "20vh",
          paddingBottom: "20vh",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {/* Hide scrollbar for webkit browsers */}
        <style>{`
          .overflow-y-auto::-webkit-scrollbar {
            display: none;
          }
        `}</style>

        {memories.map((memory, index) => {
          const isHovered = hoveredIndex === index;
          const isSelected = centeredIndex === index;
          const color = COLORS[memory.color];

          return (
            <button
              key={memory.id}
              onClick={() => handleMemoryClick(index)}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              style={{
                width: isHovered ? 64 : isSelected ? 56 : 48,
                height: isHovered ? 64 : isSelected ? 56 : 48,
                borderRadius: "50%",
                background: color,
                border: isHovered
                  ? "3px solid rgba(123, 123, 135, 0.5)"
                  : isSelected
                  ? "2px solid rgba(123, 123, 135, 0.35)"
                  : "none",
                marginBottom: index === memories.length - 1 ? 0 : 28,
                cursor: "pointer",
                transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
                opacity: isHovered ? 1 : isSelected ? 0.85 : 0.55,
                transform: isHovered
                  ? "scale(1)"
                  : isSelected
                  ? "scale(0.95)"
                  : "scale(0.88)",
                boxShadow: isHovered
                  ? "0 6px 20px rgba(0,0,0,0.18)"
                  : isSelected
                  ? "0 4px 14px rgba(0,0,0,0.12)"
                  : "0 2px 8px rgba(0,0,0,0.08)",
                padding: 0,
                flexShrink: 0,
              }}
              aria-label={`${memory.title} - ${memory.year}`}
            />
          );
        })}
      </div>

      <BackButton />
    </div>
  );
}