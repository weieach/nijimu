import { useLocation, useNavigate } from "react-router";
import { useState, useEffect, useRef } from "react";
import { BackButton } from "./BackButton";
import { LIFE_EVENTS, COLORS } from "../data/memoryData";
import { SceneViewer, MODEL_PATHS } from "./SceneViewer";
import { SANS, SANS_UI, SERIF } from "../lib/theme";
import { COLOR_PALETTE } from "../lib/colors";


// Watercolor gradients matching COLOR_PALETTE exactly
const WATERCOLOR_GRADIENTS = [
  "radial-gradient(ellipse at 30% 30%, #9496a6, #7a7c8c)",      // slate
  "radial-gradient(ellipse at 40% 40%, #D6DADB, #bcc0c1)",      // cloud
  "radial-gradient(ellipse at 60% 60%, #C8D0D4, #aeb6ba)",      // mist
  "radial-gradient(ellipse at 50% 50%, #CBBFBC, #b1a5a2)",      // sand
  "radial-gradient(ellipse at 35% 45%, #A4B6BE, #8a9ca4)",      // sky
  "radial-gradient(ellipse at 55% 35%, #B8969A, #9e7c80)",      // rose
  "radial-gradient(ellipse at 45% 55%, #8C9FA8, #72858e)",      // sage
  "radial-gradient(ellipse at 40% 60%, #6488A0, #4a6e86)",      // ocean
  "radial-gradient(ellipse at 60% 40%, #1C2C35, #34444F)",      // night
];

// Generate organic border radius for watercolor blobs
function generateBorderRadius(seed: number): string {
  // Use seed to make it consistent for each memory
  const random = (i: number) => {
    const x = Math.sin(seed + i) * 10000;
    return (x - Math.floor(x));
  };
  const v = Array.from({ length: 8 }, (_, i) => 30 + random(i) * 40);
  return `${v[0]}% ${v[1]}% ${v[2]}% ${v[3]}% / ${v[4]}% ${v[5]}% ${v[6]}% ${v[7]}%`;
}

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

// Generate memories with random shape properties (matching scroll page)
const generateMemories = (): Memory[] => {
  return LIFE_EVENTS.map((event) => {
    // Use the same color index for both 2D watercolor and 3D shape
    const colorIndex = event.color;
    
    return {
      id: event.id,
      title: event.event,
      year: event.year,
      color: event.color,
      shape: {
        modelPath: MODEL_PATHS[Math.floor(Math.random() * MODEL_PATHS.length)],
        colorIndex: colorIndex % COLOR_PALETTE.length, // Match 2D and 3D colors
        fluidity: Math.random(),
        evolve: Math.random(),
        bumpAmount: Math.random(),
      },
    };
  });
};

export function ConnectMemoriesPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [fadeIn, setFadeIn] = useState(false);
  const [selectedMemories, setSelectedMemories] = useState<string[]>([]);
  const [memories] = useState<Memory[]>(generateMemories());
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTimeout(() => setFadeIn(true), 100);
  }, []);

  const handleMemoryClick = (memoryId: string) => {
    setSelectedMemories((prev) => {
      if (prev.includes(memoryId)) {
        // Deselect if already selected
        return prev.filter((id) => id !== memoryId);
      } else if (prev.length < 4) {
        // Select if under the limit
        return [...prev, memoryId];
      }
      // If at limit, don't add more
      return prev;
    });
  };

  const handleContinue = () => {
    navigate("/record/saved", {
      state: {
        ...location.state,
        connectedMemories: selectedMemories,
      },
    });
  };

  const handleSkip = () => {
    navigate("/record/saved", {
      state: {
        ...location.state,
        connectedMemories: [],
      },
    });
  };

  // Find the index of the first selected memory, or 0 if none selected
  const firstSelectedIndex = selectedMemories.length > 0
    ? memories.findIndex(m => m.id === selectedMemories[0])
    : 0;

  // Display the hovered memory, or the first selected, or the first memory
  const displayIndex = hoveredIndex !== null ? hoveredIndex : firstSelectedIndex;
  const selectedMemory = memories[displayIndex];
  const selectedColor = COLOR_PALETTE[selectedMemory.shape.colorIndex];

  return (
    <div
      className="relative w-full h-screen flex overflow-hidden"
      style={{ background: "#e0e0e0" }}
    >
      {/* Content wrapper with fade in */}
      <div
        className="flex-1 flex h-full transition-opacity duration-1000"
        style={{ 
          opacity: fadeIn ? 1 : 0,
        }}
      >
        {/* Main content area - left side */}
        <div className="flex-1 relative flex flex-col items-center justify-center">
          {/* Header section */}
          <div
            style={{
              position: "absolute",
              top: "clamp(60px, 10vh, 120px)",
              left: "60%",
              transform: "translateX(-50%)",
              textAlign: "center",
              width: "80%",
              
            }}
          >
            <p
              style={{
                fontFamily: SERIF,
                fontSize: "clamp(16px, 1vw, 18px)",
                fontWeight: 500,
                lineHeight: "140%",
                letterSpacing: "-0.5px",
                color: "#7b7b87",
                textTransform: "lowercase",
                whiteSpace: "pre-line",
                marginBottom: 12,
              }}
            >
              choose past memories
            </p>
            <p
              style={{
                fontFamily: SERIF,
                fontSize: "clamp(14px, 0.9vw, 16px)",
                fontWeight: 500,
                lineHeight: "140%",
                letterSpacing: "-0.5px",
                color: "#7b7b87",
                textTransform: "lowercase",
                whiteSpace: "pre-line",
                marginBottom: 8,
              }}
            >
              this new entry is connected to
            </p>
            {/* Counter */}
            <p
              style={{
                fontFamily: SERIF,
                fontSize: "clamp(12px, 0.9vw, 14px)",
                fontWeight: 400,
                lineHeight: "normal",
                color: "rgba(42, 32, 24, 0.5)",
              }}
            >
              ({selectedMemories.length}/4)
            </p>
          </div>

          {/* 3D Shape Viewer - centered */}
          <div
            className="relative"
            style={{
              width: "clamp(280px, 30vw, 380px)",
              height: "clamp(280px, 30vw, 380px)",
              left: "10%",
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
                borderRadius: 14,
                border: "0.5px solid #bcbcbc",
              }}
            />
          </div>

          {/* Memory title and year */}
          <div
            style={{
              textAlign: "center",
              maxWidth: "80%",
              marginTop: "clamp(30px, 5vh, 50px)",
              paddingLeft: "20%",
            }}
          >
            <p
              style={{
                fontFamily: SERIF,
                fontSize: "clamp(16px, 1.5vw, 18px)",
                fontStyle: "italic",
                color: "#7b7b87",
                marginBottom: 6,
                lineHeight: 1.3,
                whiteSpace: "pre-line",
              }}
            >
              {selectedMemory.title}
            </p>
            <p
              style={{
                fontFamily: SERIF,
                fontSize: "clamp(13px, 1vw, 15px)",
                color: "#a0a0a8",
                lineHeight: 1.3,
              }}
            >
              {selectedMemory.year}
            </p>
          </div>

          {/* Instructions and skip at bottom */}
          <div
            style={{
              position: "absolute",
              bottom: "clamp(40px, 6vh, 60px)",
              left: "60%",
              transform: "translateX(-50%)",
              textAlign: "center",
            }}
          >
            <p
              style={{
                fontFamily: SANS,
                fontSize: "clamp(9px, 0.8vw, 12px)",
                color: "#a8a8b0",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                marginBottom: 16,
              }}
            >
              click to select • hover to preview
            </p>
            {/* Skip button */}
            <button
              onClick={handleSkip}
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontFamily: SERIF,
                fontSize: "clamp(10px, 0.9vw, 12px)",
                fontWeight: 400,
                lineHeight: "normal",
                color: "rgba(42, 32, 24, 0.5)",
                textAlign: "center",
                textDecoration: "none",
                padding: 0,
              }}
            >
              skip this step
            </button>
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
            paddingLeft: "7vw",
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
            const isSelected = selectedMemories.includes(memory.id);
            // Use watercolor gradient instead of solid color
            const watercolorGradient = WATERCOLOR_GRADIENTS[memory.color % WATERCOLOR_GRADIENTS.length];
            // Generate organic border radius based on index for consistency
            const organicBorderRadius = generateBorderRadius(index * 123.456);

            return (
              <button
                key={memory.id}
                onClick={() => handleMemoryClick(memory.id)}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                style={{
                  width: isHovered ? 64 : isSelected ? 56 : 48,
                  height: isHovered ? 64 : isSelected ? 56 : 48,
                  borderRadius: organicBorderRadius, // Organic blob shape
                  background: watercolorGradient, // Watercolor gradient
                  border: isSelected
                    ? "3px solid rgba(123, 123, 135, 0.6)"
                    : isHovered
                    ? "2px solid rgba(123, 123, 135, 0.4)"
                    : "none",
                  marginBottom: index === memories.length - 1 ? 0 : 28,
                  cursor: "pointer",
                  transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
                  opacity: isHovered ? 1 : isSelected ? 0.9 : 0.55,
                  transform: isHovered
                    ? "scale(1)"
                    : isSelected
                    ? "scale(0.95)"
                    : "scale(0.88)",
                  boxShadow: isSelected
                    ? "0 6px 20px rgba(0,0,0,0.18)"
                    : isHovered
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
      </div>

      {/* Continue button - fixed at bottom center */}
      {selectedMemories.length > 0 && (
        <button
          onClick={handleContinue}
          className="transition-opacity duration-500"
          style={{
            position: "fixed",
            left: "calc(60% - 9vw)", // Shift left to align with main content area
            transform: "translateX(-50%)",
            bottom: "clamp(100px, 14vh, 140px)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 19,
            padding: "15px 30px",
            borderRadius: 100,
            border: "none",
            background: "rgba(163, 167, 175, 0.2)",
            cursor: "pointer",
            whiteSpace: "nowrap",
            zIndex: 10,
            opacity: fadeIn ? 1 : 0,
          }}
        >
          <span
            style={{
              fontFamily:
                SANS,
              fontSize: 18,
              fontWeight: 400,
              lineHeight: 1.5,
              color: "#8C8C8C",
              textShadow: "0px 4px 100px black",
              textTransform: "lowercase",
            }}
          >
            continue
          </span>
          {/* Arrow icon */}
          <span
            style={{
              fontFamily: SANS_UI,
              fontSize: 20,
              lineHeight: 0,
              color: "#8C8C8C",
              fontVariationSettings: "'wdth' 100",
            }}
          >
            ›
          </span>
        </button>
      )}

      {/* Back button */}
      <BackButton />
    </div>
  );
}