import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { SceneViewer, MODEL_PATHS } from "./SceneViewer";
import { LIFE_EVENTS, COLORS } from "../data/memoryData";
import { BackButton } from "./BackButton";
import { SANS, SERIF } from "../lib/theme";
import { COLOR_PALETTE } from "../lib/colors";


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

// Generate memories with random shape properties
const generateMemories = (): Memory[] => {
  return LIFE_EVENTS.map((event) => ({
    id: event.id,
    title: event.event,
    year: event.year,
    color: event.color,
    shape: {
      modelPath: MODEL_PATHS[Math.floor(Math.random() * MODEL_PATHS.length)],
      colorIndex: Math.floor(Math.random() * COLOR_PALETTE.length),
      fluidity: Math.random(), // 0-1 for weight
      evolve: Math.random(), // 0-1 for evolve
      // Keep texture in a safe range to avoid "torn" geometry in SceneViewer.
      bumpAmount: Math.random() * 0.12, // 0-0.12
    },
  }));
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
            evolve={selectedMemory.shape.evolve}
            bumpAmount={selectedMemory.shape.bumpAmount}
            autoRotate={true}
            ready={true}
            constrainedViewport
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
              fontFamily: SERIF,
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
              fontFamily: SERIF,
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
              fontFamily: SANS,
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