import { useLocation, useNavigate } from "react-router";
import { useState, useEffect, useRef } from "react";
import { BackButton } from "./BackButton";
import { SceneViewer, MODEL_PATHS } from "./SceneViewer";
import {
  getShapeBuildEvolvePhase,
  stripLegacyEvolveFromState,
} from "../hooks/useOscillatingEvolve";
import {
  createGestureGate,
  landmarkDistance,
  useHandTracking,
} from "../hooks/useHandTracking";
import { SANS, SANS_UI, SERIF } from "../lib/theme";
import { PageHeader } from "./PageHeader";
import { PillButton } from "./PillButton";

export function ShapeWeightPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [fadeIn, setFadeIn] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [debugMode, setDebugMode] = useState(true);
  const [handsDetected, setHandsDetected] = useState(0);
  const [debugPinchDistance, setDebugPinchDistance] = useState(0);
  const [debugEvolvePhase, setDebugEvolvePhase] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const targetFluidityRef = useRef<number>(location.state?.fluidity ?? 0);
  const smoothingFrameRef = useRef<number | null>(null);
  // Ignore MediaPipe output until the pinch meaningfully changes from its
  // first detected pose, so the shape doesn't jump when a hand appears.
  const gateRef = useRef(createGestureGate(0.02));

  // Get camera permission from previous page (BuildObjectPage)
  const cameraPermission = location.state?.cameraPermission ?? "denied";

  // Get state from previous pages
  const modelPath = location.state?.modelPath;
  const matPresetIndex: number = location.state?.matPresetIndex ?? 0;
  const [fluidity, setFluidity] = useState(location.state?.fluidity ?? 0);
  const bumpAmount = location.state?.bumpAmount ?? 0;

  useEffect(() => {
    setTimeout(() => setFadeIn(true), 100);
    setTimeout(() => setSceneReady(true), 300);
  }, []);

  useEffect(() => {
    if (!debugMode) return;
    const id = window.setInterval(() => {
      setDebugEvolvePhase(getShapeBuildEvolvePhase());
    }, 150);
    return () => clearInterval(id);
  }, [debugMode]);

  // Smoothing animation loop - runs independently
  useEffect(() => {
    const smoothingSpeed = 0.003; // Much slower transition (takes ~10 seconds to reach target)
    const maxChangePerFrame = 0.002; // Limit how fast the value can change per frame to prevent sudden acceleration
    
    const animate = () => {
      setFluidity((current) => {
        const target = targetFluidityRef.current;
        const diff = target - current;
        
        // If very close to target, snap to it
        if (Math.abs(diff) < 0.0001) {
          return target;
        }
        
        // Calculate desired change with smoothing
        let desiredChange = diff * smoothingSpeed;
        
        // Clamp the change to prevent sudden acceleration
        desiredChange = Math.max(-maxChangePerFrame, Math.min(maxChangePerFrame, desiredChange));
        
        // Gradually move towards target
        return current + desiredChange;
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

  // Pinch (thumb tip ↔ index tip) drives weight; hook owns camera + model.
  const { isTracking } = useHandTracking({
    enabled: cameraPermission === "granted",
    videoRef,
    numHands: 1,
    onLandmarks: (hands) => {
      const distance = landmarkDistance(hands[0][4], hands[0][8]);
      if (gateRef.current.update(distance)) {
        // Map distance 0.05 (minimum weight) to 0.5 (maximum weight)
        const minDistance = 0.05;
        const maxDistance = 0.5;
        const clamped = Math.max(minDistance, Math.min(maxDistance, distance));
        targetFluidityRef.current = (clamped - minDistance) / (maxDistance - minDistance);
      }
      setHandsDetected(1);
      setDebugPinchDistance(distance);
    },
    onNoHands: () => setHandsDetected(0),
  });

  const handleContinue = () => {
    navigate("/record/shape/color", {
      state: {
        ...stripLegacyEvolveFromState(location.state),
        fluidity,
      },
    });
  };

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
          matPresetIndex={matPresetIndex}
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
          weight
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
          <p style={{ margin: 0 }}>pinch your fingers together. </p>
          <p style={{ margin: 0 }}>the tighter you hold, </p>
          <p style={{ margin: 0 }}>the heavier it becomes. </p>
          <p style={{ margin: 0 }}>some things still need to be held.</p>
        </div>

        {/* Fallback slider for denied/skipped camera - above continue button */}
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
                  marginBottom: 8,
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
            
            {/* Permission text below slider */}
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
            <p style={{ margin: "5px 0" }}>Hands Detected: {handsDetected}</p>
            <p style={{ margin: "5px 0" }}>Pinch Distance: {debugPinchDistance.toFixed(4)}</p>
            <p style={{ margin: "5px 0" }}>Target Weight: {(targetFluidityRef.current * 100).toFixed(1)}%</p>
            <p style={{ margin: "5px 0" }}>Current Weight: {(fluidity * 100).toFixed(1)}%</p>
            <p style={{ margin: "5px 0" }}>
              Evolve (0–100%, 10s cycle): {(debugEvolvePhase * 100).toFixed(0)}%
            </p>
            <p style={{ margin: "5px 0", fontSize: 10, opacity: 0.7 }}>
              MediaPipe: {isTracking ? "✓ Loaded" : "✗ Not loaded"}
            </p>
          </div>
        )}
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