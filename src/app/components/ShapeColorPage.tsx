import { useLocation, useNavigate } from "react-router";
import { useState, useEffect, useRef } from "react";
import { BackButton } from "./BackButton";
import { MATERIAL_PRESETS, MODEL_PATHS } from "./SceneViewer";
import {
  BubbleViewer,
  BUBBLE_BACKGROUND,
  DEFAULT_BUBBLE_MATERIAL,
} from "./BubbleViewer";
import { createGestureGate, useHandTracking } from "../hooks/useHandTracking";
import { stripLegacyEvolveFromState } from "../hooks/useOscillatingEvolve";
import { COLOR_PALETTE } from "../lib/colors";
import {
  DEFAULT_BUBBLE_AMBIENTS,
  DEFAULT_BUBBLE_LIGHTS,
} from "../lib/sceneLights";
import { SERIF } from "../lib/theme";
import { PageHeader } from "./PageHeader";
import { PillButton } from "./PillButton";

function rimFromCore(hex: string): string {
  if (!hex.startsWith("#") || hex.length < 7) return "#3a3c44";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v)));
  return `#${clamp(r * 0.42)
    .toString(16)
    .padStart(2, "0")}${clamp(g * 0.42)
    .toString(16)
    .padStart(2, "0")}${clamp(b * 0.42)
    .toString(16)
    .padStart(2, "0")}`;
}

export function ShapeColorPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [fadeIn, setFadeIn] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [debugMode] = useState(true);
  const [handDetected, setHandDetected] = useState(false);
  const [debugPalmY, setDebugPalmY] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const gateRef = useRef(createGestureGate(0.04));
  const targetColorIndexRef = useRef<number>(location.state?.colorIndex ?? 0);

  const cameraPermission = location.state?.cameraPermission ?? "denied";
  const modelPath = location.state?.modelPath ?? MODEL_PATHS[0];
  const incomingMorph = location.state?.morphProgress;
  const morphProgress =
    typeof incomingMorph === "number" && incomingMorph > 0.08
      ? incomingMorph
      : 1;
  const bubbleMaterial = location.state?.bubbleMaterial ?? DEFAULT_BUBBLE_MATERIAL;
  const lights = location.state?.lights ?? DEFAULT_BUBBLE_LIGHTS;
  const ambients = location.state?.ambients ?? DEFAULT_BUBBLE_AMBIENTS;

  const [selectedColorIndex, setSelectedColorIndex] = useState<number>(
    location.state?.colorIndex ?? 0,
  );

  useEffect(() => {
    setTimeout(() => setFadeIn(true), 100);
    setTimeout(() => setSceneReady(true), 300);
  }, []);

  const { isTracking } = useHandTracking({
    enabled: cameraPermission === "granted",
    videoRef,
    numHands: 1,
    onLandmarks: (hands) => {
      const palm = [0, 1, 5, 9, 13, 17].map((i) => hands[0][i]);
      const palmY = palm.reduce((sum, lm) => sum + lm.y, 0) / palm.length;

      if (gateRef.current.update(palmY)) {
        const minY = 0.5;
        const maxY = 1.2;
        const clampedY = Math.max(minY, Math.min(maxY, palmY));
        const normalizedY = (clampedY - minY) / (maxY - minY);
        targetColorIndexRef.current = Math.round(
          (1 - normalizedY) * (COLOR_PALETTE.length - 1),
        );
        setSelectedColorIndex(targetColorIndexRef.current);
      }
      setHandDetected(true);
      setDebugPalmY(palmY);
    },
    onNoHands: () => setHandDetected(false),
  });

  const currentIndex = Math.min(
    Math.max(0, Math.round(selectedColorIndex)),
    COLOR_PALETTE.length - 1,
  );
  const active = COLOR_PALETTE[currentIndex];
  const coreColor = active.color;
  const rimColor = rimFromCore(active.color);

  const handleSelect = (index: number) => {
    targetColorIndexRef.current = index;
    setSelectedColorIndex(index);
  };

  const handleContinue = () => {
    navigate("/record/shape/texture", {
      state: {
        ...stripLegacyEvolveFromState(location.state),
        modelPath,
        morphProgress,
        bubbleMaterial,
        lights,
        ambients,
        coreColor,
        rimColor,
        colorIndex: currentIndex,
        matPresetIndex: Math.min(currentIndex, MATERIAL_PRESETS.length - 1),
      },
    });
  };

  return (
    <div
      className="relative w-full h-screen flex flex-col overflow-hidden"
      style={{ background: BUBBLE_BACKGROUND }}
    >
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
        <BubbleViewer
          key={modelPath}
          autoRotate
          morphProgress={morphProgress}
          ready={sceneReady}
          modelPath={modelPath}
          coreColor={coreColor}
          rimColor={rimColor}
          roughness={bubbleMaterial.roughness}
          reflectivity={bubbleMaterial.reflectivity}
          transparency={bubbleMaterial.transparency}
          fog={bubbleMaterial.fog}
          lights={lights}
          ambients={ambients}
        />
      </div>

      <div
        className="flex flex-col h-full transition-opacity duration-1000"
        style={{
          opacity: fadeIn ? 1 : 0,
          position: "relative",
          zIndex: 2,
        }}
      >
        <PageHeader layout="block" />

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
          color
        </p>

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
          <p style={{ margin: 0 }}>the form is settled.</p>
          <p style={{ margin: 0 }}>now let a tint find it.</p>
          <p style={{ margin: 0 }}>raise your palm to warm the film.</p>
          <p style={{ margin: 0 }}>lower it toward cool.</p>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: cameraPermission === "denied" ? 160 : 110,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 8,
            padding: "8px 12px",
            borderRadius: 100,
            background: "rgba(163, 167, 175, 0.22)",
            zIndex: 10,
            pointerEvents: "auto",
          }}
        >
          {COLOR_PALETTE.map((swatch, i) => {
            const activeSwatch = i === currentIndex;
            return (
              <button
                key={swatch.id}
                type="button"
                onClick={() => handleSelect(i)}
                aria-label={swatch.id}
                title={swatch.id}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  border: activeSwatch
                    ? "2px solid #ffffff"
                    : "2px solid transparent",
                  background: swatch.color,
                  cursor: "pointer",
                  boxShadow: activeSwatch
                    ? "0 0 0 1px rgba(123,123,135,0.45)"
                    : "none",
                  transform: activeSwatch ? "scale(1.12)" : "scale(1)",
                  transition: "transform 0.2s ease, box-shadow 0.2s ease",
                }}
              />
            );
          })}
        </div>

        {cameraPermission === "denied" && (
          <p
            style={{
              position: "absolute",
              bottom: 220,
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
        )}

        <PillButton
          label="continue"
          onClick={handleContinue}
          trailing="›"
          className="transition-opacity duration-500"
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: 40,
            zIndex: 10,
          }}
        />

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
            <p style={{ margin: "5px 0" }}>
              Hand Detected: {handDetected ? "✓ Yes" : "✗ No"}
            </p>
            <p style={{ margin: "5px 0" }}>Palm Y: {debugPalmY.toFixed(4)}</p>
            <p style={{ margin: "5px 0" }}>
              Tint: {active.id} · {coreColor}
            </p>
            <p style={{ margin: "5px 0", fontSize: 10, opacity: 0.7 }}>
              MediaPipe: {isTracking ? "✓ Loaded" : "✗ Not loaded"}
            </p>
          </div>
        )}
      </div>

      <BackButton />
    </div>
  );
}
