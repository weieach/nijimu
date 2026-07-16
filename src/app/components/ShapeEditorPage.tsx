import { useLocation, useNavigate } from "react-router";
import { useState, useEffect } from "react";
import { BackButton } from "./BackButton";
import { SceneViewer, MODEL_PATHS, MATERIAL_PRESETS } from "./SceneViewer";
import { SANS, SANS_UI, SERIF } from "../lib/theme";
import { PageHeader } from "./PageHeader";
import { PillButton } from "./PillButton";

export function ShapeEditorPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [fadeIn, setFadeIn] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  
  // Randomly select a model path when entering the shape editor
  const [randomModelPath] = useState(() => {
    const idx = Math.floor(Math.random() * MODEL_PATHS.length);
    return MODEL_PATHS[idx];
  });

  // 3D shape parameters
  const [evolve, setEvolve] = useState(0);
  const [bumpAmount, setBumpAmount] = useState(0);
  const [fluidity, setFluidity] = useState(0);
  const [selectedColorIndex, setSelectedColorIndex] = useState(0);

  useEffect(() => {
    setTimeout(() => setFadeIn(true), 100);
    // Delay scene rendering to avoid iframe conflicts
    setTimeout(() => setSceneReady(true), 300);
  }, []);

  const handleContinue = () => {
    navigate("/record/connect", {
      state: {
        ...location.state,
        shape: { evolve, bumpAmount, fluidity },
      },
    });
  };

  const activePreset = MATERIAL_PRESETS[selectedColorIndex] ?? MATERIAL_PRESETS[0];

  return (
    <div
      className="relative w-full h-screen flex flex-col overflow-hidden"
      style={{ background: "#e0e0e0" }}
    >
      {/* Content wrapper with fade in */}
      <div
        className="flex flex-col h-full transition-opacity duration-1000"
        style={{ opacity: fadeIn ? 1 : 0 }}
      >
        {/* Top section */}
        <div className="flex-shrink-0" style={{ paddingTop: 0 }}>
          {/* nijimu wordmark */}
          <PageHeader layout="block" style={{ marginBottom: "clamp(30px, 5vh, 60px)" }} />

          {/* Header text */}
          <p
            style={{
              fontFamily: SERIF,
              fontSize: 16,
              fontWeight: 500,
              lineHeight: "39.2px",
              letterSpacing: "0px",
              color: "#7b7b87",
              textTransform: "lowercase",
              whiteSpace: "pre-line",
              marginTop: 0,
              marginRight: 0,
              marginLeft: 0,
              textAlign: "center",
              marginBottom: "clamp(30px, 5vh, 50px)",
              paddingLeft: 20,
              paddingRight: 20,
            }}
          >
            shape your feeling
          </p>
        </div>

        {/* 3D Scene */}
        <div 
          className="flex-1 flex items-center justify-center"
          style={{
            padding: "20px",
            maxHeight: "50vh",
          }}
        >
          <div 
            style={{ 
              width: "100%",
              maxWidth: "600px",
              height: "100%",
              maxHeight: "500px",
              aspectRatio: "1",
            }}
          >
            <SceneViewer
              evolve={evolve}
              bumpAmount={bumpAmount}
              bumpSpike={0}
              density={200}
              canvasBlurPx={3}
              matOpacity={0.4}
              fluidity={fluidity}
              ready={sceneReady}
              constrainedViewport
              matPresetIndex={selectedColorIndex}
              modelPath={randomModelPath}
            />
          </div>
        </div>

        {/* Controls section */}
        <div 
          className="flex-shrink-0"
          style={{
            padding: "20px",
            paddingBottom: "clamp(100px, 15vh, 160px)",
            maxWidth: "600px",
            margin: "0 auto",
            width: "100%",
          }}
        >
          {/* Color selection */}
          <div style={{ marginBottom: 32 }}>
            <label
              style={{
                fontFamily: SANS,
                fontSize: 12,
                color: "#8C8C8C",
                textTransform: "lowercase",
                display: "block",
                marginBottom: 12,
              }}
            >
              warmth
            </label>
            <div 
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              {MATERIAL_PRESETS.map((preset, index) => (
                <button
                  key={preset.id}
                  onClick={() => setSelectedColorIndex(index)}
                  title={preset.id.charAt(0).toUpperCase() + preset.id.slice(1)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    border: selectedColorIndex === index 
                      ? "2px solid #8C8C8C" 
                      : "2px solid transparent",
                    background: `linear-gradient(135deg, ${preset.matColor} 0%, ${preset.matSheenColor} 100%)`,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    boxShadow: selectedColorIndex === index
                      ? "0 0 0 2px rgba(140, 140, 140, 0.2)"
                      : "0 2px 4px rgba(0, 0, 0, 0.1)",
                    transform: selectedColorIndex === index ? "scale(1.1)" : "scale(1)",
                  }}
                  aria-label={`Select ${preset.id}`}
                />
              ))}
            </div>
          </div>

          {/* Evolve slider */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <label
                style={{
                  fontFamily: SANS,
                  fontSize: 12,
                  color: "#8C8C8C",
                  textTransform: "lowercase",
                }}
              >
                evolve
              </label>
              <span
                style={{
                  fontFamily: SANS,
                  fontSize: 12,
                  color: "#8C8C8C",
                }}
              >
                {Math.round(evolve * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={evolve}
              onChange={(e) => setEvolve(parseFloat(e.target.value))}
              style={{
                width: "100%",
                height: 2,
                background: "rgba(139, 139, 139, 0.3)",
                outline: "none",
                WebkitAppearance: "none",
              }}
            />
          </div>

          {/* Bump Amount slider */}
          <div style={{ marginBottom: 24 }}>
            <label
              style={{
                fontFamily: SANS,
                fontSize: 12,
                color: "#8C8C8C",
                textTransform: "lowercase",
                display: "block",
                marginBottom: 8,
              }}
            >
              texture
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={bumpAmount}
              onChange={(e) => setBumpAmount(parseFloat(e.target.value))}
              style={{
                width: "100%",
                height: 2,
                background: "rgba(139, 139, 139, 0.3)",
                outline: "none",
                WebkitAppearance: "none",
              }}
            />
          </div>

          {/* Weight slider */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <label
                style={{
                  fontFamily: SANS,
                  fontSize: 12,
                  color: "#8C8C8C",
                  textTransform: "lowercase",
                }}
              >
                weight
              </label>
              <span
                style={{
                  fontFamily: SANS,
                  fontSize: 12,
                  color: "#8C8C8C",
                }}
              >
                {Math.round(fluidity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={fluidity}
              onChange={(e) => setFluidity(parseFloat(e.target.value))}
              style={{
                width: "100%",
                height: 2,
                background: "rgba(139, 139, 139, 0.3)",
                outline: "none",
                WebkitAppearance: "none",
              }}
            />
          </div>
        </div>

        {/* Continue button - fixed at bottom */}
        <PillButton
          label="continue"
          onClick={handleContinue}
          trailing="›"
          className="transition-opacity duration-500"
          style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: "clamp(40px, 8vh, 80px)", zIndex: 10 }}
        />
      </div>

      {/* Back button */}
      <BackButton />

      {/* Slider styles */}
      <style>{`
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #8C8C8C;
          cursor: pointer;
        }
        input[type="range"]::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #8C8C8C;
          cursor: pointer;
          border: none;
        }
      `}</style>
    </div>
  );
}