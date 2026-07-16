import { useLocation, useNavigate } from "react-router";
import { useState, useEffect, useRef } from "react";
import { BackButton } from "./BackButton";
import { SceneViewer, MATERIAL_PRESETS } from "./SceneViewer";
import { createGestureGate, useHandTracking } from "../hooks/useHandTracking";
import { stripLegacyEvolveFromState } from "../hooks/useOscillatingEvolve";
import { SANS, SANS_UI, SERIF } from "../lib/theme";
import { PageHeader } from "./PageHeader";
import { PillButton } from "./PillButton";

export function ShapeColorPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [fadeIn, setFadeIn] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [debugMode, setDebugMode] = useState(true);
  const [handDetected, setHandDetected] = useState(false);
  const [debugPalmY, setDebugPalmY] = useState(0);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const targetColorIndexRef = useRef<number>(location.state?.matPresetIndex ?? 0); // Target preset index (0-4)
  const smoothingFrameRef = useRef<number | null>(null);
  const gateRef = useRef(createGestureGate(0.04));

  // Get camera permission from previous page (BuildObjectPage)
  const cameraPermission = location.state?.cameraPermission ?? "denied";

  // Get state from previous page
  const modelPath = location.state?.modelPath;
  const fluidity = location.state?.fluidity ?? 0;
  const bumpAmount = location.state?.bumpAmount ?? 0;

  // selectedColorIndex is a float for smooth interpolation; snapped to int for display
  const [selectedColorIndex, setSelectedColorIndex] = useState<number>(
    location.state?.matPresetIndex ?? 0
  );

  useEffect(() => {
    setTimeout(() => setFadeIn(true), 100);
    setTimeout(() => setSceneReady(true), 300);
  }, []);

        // Smoothing animation loop for color index - runs independently
  useEffect(() => {
    const smoothingSpeed = 0.05;
    
    const animate = () => {
      setSelectedColorIndex((current) => {
        const target = targetColorIndexRef.current;
        const diff = target - current;
        
        // Snap when close
        if (Math.abs(diff) < 0.1) return Math.round(target);
        
        return current + diff * smoothingSpeed;
      });
      
      smoothingFrameRef.current = requestAnimationFrame(animate);
    };
    
    animate();
    
    return () => {
      if (smoothingFrameRef.current) {
        cancelAnimationFrame(smoothingFrameRef.current);
      }
    };
  }, []);

  // Palm height drives the material preset: raised hand = warmer.
  const { isTracking } = useHandTracking({
    enabled: cameraPermission === "granted",
    videoRef,
    numHands: 1,
    onLandmarks: (hands) => {
      // Palm center from wrist + the five finger bases
      const palm = [0, 1, 5, 9, 13, 17].map((i) => hands[0][i]);
      const palmY = palm.reduce((sum, lm) => sum + lm.y, 0) / palm.length;

      if (gateRef.current.update(palmY)) {
        // Map palm Y position to preset index (0-4)
        // Lower Y = hand raised higher = warmer (higher index)
        const minY = 0.5;
        const maxY = 1.2;
        const clampedY = Math.max(minY, Math.min(maxY, palmY));
        const normalizedY = (clampedY - minY) / (maxY - minY);
        // Invert so raised hand = higher index (warmer)
        targetColorIndexRef.current = Math.round((1 - normalizedY) * (MATERIAL_PRESETS.length - 1));
      }
      setHandDetected(true);
      setDebugPalmY(palmY);
    },
    onNoHands: () => setHandDetected(false),
  });

  const handleContinue = () => {
    navigate("/record/shape/texture", {
      state: {
        ...stripLegacyEvolveFromState(location.state),
        modelPath,
        matPresetIndex: Math.round(selectedColorIndex),
        fluidity,
        bumpAmount,
      },
    });
  };

  const currentPresetIndex = Math.min(
    Math.max(0, Math.round(selectedColorIndex)),
    MATERIAL_PRESETS.length - 1,
  );
  const activePreset = MATERIAL_PRESETS[currentPresetIndex];

  return (
    <div
      className="relative w-full h-screen flex flex-col overflow-hidden"
      style={{ background: "#e0e0e0" }}
    >
      {/* Video element for MediaPipe - visible in debug mode */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ 
          display: debugMode && cameraPermission === "granted" ? "block" : "none",
          position: "absolute",
          bottom: 10,
          right: 10,
          width: 200,
          height: 150,
          border: "2px solid #fff",
          borderRadius: 10,
          zIndex: 1000,
        }}
      />

      {/* Full-screen 3D Scene */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 1,
          pointerEvents: "none",
        }}
      >
        <SceneViewer
          shapeBuildOscillatingEvolve
          bumpAmount={bumpAmount}
          bumpSpike={0}
          density={200}
          canvasBlurPx={3}
          matOpacity={0.4}
          fluidity={fluidity}
          ready={sceneReady}
          matPresetIndex={currentPresetIndex}
          modelPath={modelPath}
        />
      </div>

      {/* Content wrapper with fade in */}
      <div
        className="flex flex-col h-full transition-opacity duration-1000"
        style={{ opacity: fadeIn ? 1 : 0, position: "relative", zIndex: 2 }}
      >
        {/* nijimu wordmark */}
      <PageHeader layout="block" />

        {/* Title */}
        <p
          style={{
            position: "absolute",
            top: 118,
            left: "50%",
            transform: "translateX(-50%)",
            fontFamily: SERIF,
            fontSize: 20,
            lineHeight: 1.2,
            letterSpacing: "-1px",
            color: "#7b7b87",
            textTransform: "lowercase",
            whiteSpace: "nowrap",
            textAlign: "center",
            mixBlendMode: "difference",
          }}
        >
          warm
        </p>

        {/* Instructions */}
        <div
          style={{
            position: "absolute",
            top: 195,
            left: "50%",
            transform: "translateX(-50%)",
            fontFamily: SERIF,
            fontSize: 17,
            lineHeight: 1.2,
            letterSpacing: "-1px",
            color: "#7b7b87",
            textTransform: "lowercase",
            whiteSpace: "pre-line",
            textAlign: "center",
            mixBlendMode: "difference",
          }}
        >
          <p style={{ margin: 0 }}>lay your palm flat. </p>
          <p style={{ margin: 0 }}>raise it to bring warmth. </p>
          <p style={{ margin: 0 }}>lower it toward cool. </p>
          <p style={{ margin: 0 }}>let the color find where this memory lives.</p>
        </div>

        {cameraPermission === "denied" && (
          <>
            <div
              style={{
                position: "absolute",
                bottom: 160,
                left: "50%",
                transform: "translateX(-50%)",
                width: "90%",
                maxWidth: 400,
                zIndex: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <label
                  style={{
                    fontFamily: SANS,
                    fontSize: 12,
                    color: "#8C8C8C",
                    textTransform: "lowercase",
                  }}
                >
                  warmth
                </label>
                <span
                  style={{
                    fontFamily: SANS,
                    fontSize: 12,
                    color: "#8C8C8C",
                  }}
                >
                  {activePreset.id}
                </span>
              </div>
              {/* 5 colour swatches */}
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                {MATERIAL_PRESETS.map((preset, index) => (
                  <button
                    key={preset.id}
                    onClick={() => {
                      setSelectedColorIndex(index);
                      targetColorIndexRef.current = index;
                    }}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      border:
                        currentPresetIndex === index
                          ? "2px solid #8C8C8C"
                          : "2px solid transparent",
                      background: `linear-gradient(135deg, ${preset.matColor} 0%, ${preset.matSheenColor} 100%)`,
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      boxShadow:
                        currentPresetIndex === index
                          ? "0 0 0 2px rgba(140,140,140,0.2)"
                          : "0 2px 4px rgba(0,0,0,0.1)",
                      transform:
                        currentPresetIndex === index
                          ? "scale(1.15)"
                          : "scale(1)",
                    }}
                    aria-label={`Select ${preset.id}`}
                  />
                ))}
              </div>
            </div>
            
            {/* Permission text below swatches */}
            <p
              style={{
                position: "absolute",
                bottom: 250,
                left: "50%",
                transform: "translateX(-50%)",
                fontFamily: SERIF,
                fontSize: 15,
                lineHeight: 1,
                color: "rgba(42, 32, 24, 0.6)",
                textAlign: "center",
                whiteSpace: "nowrap",
                zIndex: 10,
              }}
            >
              (grant camera permission to access gesture control. )
            </p>
          </>
        )}

        {/* Continue button - positioned from Figma */}
        <PillButton
          label="continue"
          onClick={handleContinue}
          trailing="›"
          className="transition-opacity duration-500"
          style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: 40, zIndex: 10 }}
        />

        {/* Debug information */}
        {debugMode && (
          <div
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              background: "rgba(0, 0, 0, 0.7)",
              color: "#fff",
              padding: "10px",
              borderRadius: 5,
              zIndex: 1000,
              fontFamily: "monospace",
              fontSize: 12,
            }}
          >
            <p style={{ margin: "5px 0" }}>Camera: {cameraPermission}</p>
            <p style={{ margin: "5px 0" }}>Hand Detected: {handDetected ? "✓ Yes" : "✗ No"}</p>
            <p style={{ margin: "5px 0" }}>Palm Y: {debugPalmY.toFixed(4)}</p>
            <p style={{ margin: "5px 0" }}>Target Preset: {targetColorIndexRef.current} ({MATERIAL_PRESETS[targetColorIndexRef.current]?.id})</p>
            <p style={{ margin: "5px 0" }}>Current Preset: {currentPresetIndex} ({activePreset.id})</p>
            <p style={{ margin: "5px 0" }}>Color: {activePreset.matColor}</p>
            <p style={{ margin: "5px 0", fontSize: 10, opacity: 0.7 }}>
              MediaPipe: {isTracking ? "✓ Loaded" : "✗ Not loaded"}
            </p>
          </div>
        )}
      </div>

      {/* Back button */}
      <BackButton />
    </div>
  );
}