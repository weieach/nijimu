import { useLocation, useNavigate } from "react-router";
import { useState, useEffect, useRef } from "react";
import { SANS, SANS_UI, SERIF } from "../lib/theme";
import { COLOR_PALETTE } from "../lib/colors";
import { saveMemory } from "../lib/memoryStore";
import { PageHeader } from "./PageHeader";
import { PillButton } from "./PillButton";

interface SavedState {
  memoryName?: string;
  year?: string;
  isEditing?: boolean;
  transcript?: string;
  highlightedWords?: string[];
  matPresetIndex?: number;
  shape?: {
    modelPath?: string;
    fluidity?: number;
    evolve?: number;
    bumpAmount?: number;
  };
}

export function MemorySavedPage() {
  const location = useLocation();
  const navigate = useNavigate();

  // Extract memoryName, year, and isEditing from location state
  const state = location.state as SavedState | null;
  const memoryName = state?.memoryName || "";
  const year = state?.year || "";
  const isEditing = state?.isEditing || false;

  const [fadeIn, setFadeIn] = useState(false);
  const [showText, setShowText] = useState(false);
  const [showButton, setShowButton] = useState(false);
  const persistedRef = useRef(false);

  useEffect(() => {
    // Orchestrate the reveal animation - more subtle fades
    setTimeout(() => setFadeIn(true), 100);
    setTimeout(() => setShowText(true), 800);
    setTimeout(() => setShowButton(true), 1600);
  }, []);

  // Persist the finished memory. Editing an existing one re-saves nothing yet —
  // the edit flow has no id to update against.
  useEffect(() => {
    if (persistedRef.current || isEditing) return;
    if (!state?.shape?.modelPath || !memoryName) return;
    persistedRef.current = true; // guards against StrictMode's double effect

    const matPresetIndex = state.matPresetIndex ?? 0;
    saveMemory({
      id: crypto.randomUUID(),
      title: memoryName,
      year,
      transcript: state.transcript ?? "",
      highlightedWords: state.highlightedWords ?? [],
      shape: {
        modelPath: state.shape.modelPath,
        matPresetIndex,
        fluidity: state.shape.fluidity ?? 0,
        evolve: state.shape.evolve ?? 0.5,
        bumpAmount: state.shape.bumpAmount ?? 0,
      },
      // Material presets (5) are a coarser scale than the blob palette (9);
      // spread them across it so saved blobs vary in tint like the curated ones.
      colorIndex: Math.round((matPresetIndex / 4) * (COLOR_PALETTE.length - 1)),
      createdAt: new Date().toISOString(),
    });
  }, [isEditing, memoryName, state, year]);

  const displayName = memoryName || "your memory";
  const displayYear = year || "the archive";

  return (
    <div
      className="relative w-full h-screen overflow-hidden"
      style={{ 
        background: "#e0e0e0",
      }}
    >
      {/* Content wrapper with fade in */}
      <div
        className="absolute inset-0 transition-opacity duration-1000"
        style={{ opacity: fadeIn ? 1 : 0 }}
      >
        {/* nijimu wordmark */}
      <PageHeader layout="absolute" />

        {/* Center content */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 24,
          }}
        >
          {/* Success message */}
          <div
            className="transition-all duration-1000"
            style={{
              textAlign: "center",
              opacity: showText ? 1 : 0,
              transform: showText ? "translateY(0)" : "translateY(20px)",
            }}
          >
            <p
              style={{
                fontFamily: SERIF,
                fontSize: "clamp(16px, calc(16px + (21 - 16) * ((100vw - 390px) / (1024 - 390))), 21px)",
                fontWeight: 500,
                lineHeight: "140%",
                letterSpacing: "0px",
                color: "rgba(123, 123, 135, 0.6)",
                textTransform: "lowercase",
                margin: 0,
                marginBottom: 16,
              }}
            >
              {isEditing ? "memory updated" : "memory preserved"}
            </p>
            

            {/* Gentle reminder */}
            <p
              style={{
                fontFamily: SERIF,
                fontSize: 12,
                lineHeight: 1.7,
                letterSpacing: "0px",
                color: "rgba(123, 123, 135, 0.6)",
                textAlign: "center",
                maxWidth: 420,
                margin: 0,
              }}
            >
              {isEditing 
                ? "the shape has been reshaped, reflecting how you feel about it now"
                : "it will blend with the others, waiting to be rediscovered when the time feels right"}
            </p>
          </div>
        </div>

        {/* Continue button */}
        {showButton && (
          <PillButton
            label="return home"
            onClick={() => navigate("/")}
            trailing="›"
            className="transition-all duration-1000"
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              bottom: 80,
              opacity: showButton ? 1 : 0,
            }}
          />
        )}
      </div>
    </div>
  );
}