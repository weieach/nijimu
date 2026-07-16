import { useLocation, useNavigate } from "react-router";
import { useState, useEffect, useRef } from "react";
import { BackButton } from "./BackButton";
import { SceneViewer } from "./SceneViewer";
import {
  createGestureGate,
  handCenter,
  landmarkDistance,
  useHandTracking,
} from "../hooks/useHandTracking";
import {
  getShapeBuildEvolvePhase,
  stripLegacyEvolveFromState,
} from "../hooks/useOscillatingEvolve";
import { SANS, SANS_UI, SERIF } from "../lib/theme";
import { PageHeader } from "./PageHeader";
import { PillButton } from "./PillButton";

export function ShapeTexturePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [fadeIn, setFadeIn] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [debugMode, setDebugMode] = useState(true);
  const [handsDetected, setHandsDetected] = useState(0);
  const [debugDistance, setDebugDistance] = useState(0);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const targetBumpAmountRef = useRef<number>(location.state?.bumpAmount ?? 0);
  const smoothingFrameRef = useRef<number | null>(null);
  const gateRef = useRef(createGestureGate(0.03));

  // Get camera permission from previous page (BuildObjectPage)
  const cameraPermission = location.state?.cameraPermission ?? "denied";

  // Get state from previous pages
  const modelPath = location.state?.modelPath;
  const fluidity = location.state?.fluidity ?? 0;
  const matPresetIndex: number = location.state?.matPresetIndex ?? 0;

  const [bumpAmount, setBumpAmount] = useState(0);
  const [density, setDensity] = useState(150);
  const targetDensityRef = useRef<number>(150);

  useEffect(() => {
    setTimeout(() => setFadeIn(true), 100);
    setTimeout(() => setSceneReady(true), 300);
  }, []);

  // Smoothing animation loop - runs independently
  useEffect(() => {
    const smoothingSpeed = 0.04;
    const maxBumpChangePerFrame = 0.002;   // scaled for 0–0.15 range
    const maxDensityChangePerFrame = 8;    // scaled for 150–500 range

    const animate = () => {
      setBumpAmount((current) => {
        const target = Math.min(targetBumpAmountRef.current, 0.15);
        const diff = target - current;
        if (Math.abs(diff) < 0.00005) return target;
        let change = diff * smoothingSpeed;
        change = Math.max(-maxBumpChangePerFrame, Math.min(maxBumpChangePerFrame, change));
        return Math.min(current + change, 0.15);
      });

      setDensity((current) => {
        const target = targetDensityRef.current;
        const diff = target - current;
        if (Math.abs(diff) < 0.1) return target;
        let change = diff * smoothingSpeed;
        change = Math.max(-maxDensityChangePerFrame, Math.min(maxDensityChangePerFrame, change));
        return current + change;
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

  // Distance between the two hand centers drives texture roughness.
  const { isTracking } = useHandTracking({
    enabled: cameraPermission === "granted",
    videoRef,
    numHands: 2,
    onLandmarks: (hands) => {
      if (hands.length !== 2) {
        setHandsDetected(hands.length);
        return;
      }
      const distance = landmarkDistance(handCenter(hands[0]), handCenter(hands[1]));
      if (gateRef.current.update(distance)) {
        // Closer hands = smooth surface; far apart = rough texture
        // Reference ranges: bump 0→0.15, density 150→500
        // Maximum reached at distance = 0.55
        const minDistance = 0.15;
        const maxDistance = 0.55;
        const clamped = Math.max(minDistance, Math.min(maxDistance, distance));
        const normalized = (clamped - minDistance) / (maxDistance - minDistance);
        targetBumpAmountRef.current = normalized * 0.15;
        targetDensityRef.current = 150 + normalized * 350; // 150 → 500
      }
      setHandsDetected(2);
      setDebugDistance(distance);
    },
    onNoHands: () => setHandsDetected(0),
  });

  const handleContinue = () => {
    navigate("/record/connect", {
      state: {
        ...stripLegacyEvolveFromState(location.state),
        shape: {
          modelPath,
          evolve: getShapeBuildEvolvePhase(),
          bumpAmount,
          fluidity,
        },
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
          density={density}
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
          distance
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
          <p style={{ margin: 0 }}>bring your hands close, </p>
          <p style={{ margin: 0 }}>or let them drift apart. </p>
          <p style={{ margin: 0 }}>the closer they are, </p>
          <p style={{ margin: 0 }}>the smoother the surface. </p>
          <p style={{ margin: 0 }}>distance is how memory starts to let go.</p>
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
                  texture
                </label>
                <span
                  style={{
                    fontFamily: SANS,
                    fontSize: 12,
                    color: "#8C8C8C",
                  }}
                >
                  {Math.round(bumpAmount * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={bumpAmount}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value);
                  setBumpAmount(newValue);
                  targetBumpAmountRef.current = newValue;
                }}
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
            <p style={{ margin: "5px 0" }}>Hands Detected: {handsDetected}/2</p>
            <p style={{ margin: "5px 0" }}>Distance: {debugDistance.toFixed(4)}</p>
            <p style={{ margin: "5px 0" }}>Target Texture: {targetBumpAmountRef.current.toFixed(3)} / 0.15</p>
            <p style={{ margin: "5px 0" }}>Current Texture: {bumpAmount.toFixed(3)} / 0.15</p>
            <p style={{ margin: "5px 0" }}>Density: {Math.round(density)} / 500</p>
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