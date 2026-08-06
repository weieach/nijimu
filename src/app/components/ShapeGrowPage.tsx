import { useLocation, useNavigate } from "react-router";
import { useState, useEffect, useRef } from "react";
import { BackButton } from "./BackButton";
import { SceneViewer, MODEL_PATHS } from "./SceneViewer";
import { BubbleViewer, BUBBLE_BACKGROUND } from "./BubbleViewer";
import { stripLegacyEvolveFromState } from "../hooks/useOscillatingEvolve";
import {
  createGestureGate,
  handOpenness,
  useHandTracking,
} from "../hooks/useHandTracking";
import { SANS, SERIF } from "../lib/theme";
import { PageHeader } from "./PageHeader";
import { PillButton } from "./PillButton";

const FORM_LABELS = ["form 01", "form 02", "form 03"] as const;

/** 'glass' is the original lit render; 'bubble' is the unlit fresnel variant. */
type RenderVariant = "glass" | "bubble";

const VARIANT_KEY = "nijimu.growVariant";

/**
 * Open palm → form (morphProgress 1); fist → sphere (0).
 * Openness is average fingertip–palm distance (see handOpenness).
 */
function opennessToMorph(openness: number): number {
  const openHand = 0.28; // fully open → full form
  const fist = 0.09; // closed → sphere
  const t = (openness - fist) / (openHand - fist);
  return Math.max(0, Math.min(1, t));
}

export function ShapeGrowPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [fadeIn, setFadeIn] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [debugMode] = useState(true);
  const [handsDetected, setHandsDetected] = useState(0);
  const [debugOpenness, setDebugOpenness] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const targetMorphRef = useRef(0);
  const smoothingFrameRef = useRef<number | null>(null);
  // Ignore MediaPipe until openness moves from the first detected pose.
  const gateRef = useRef(createGestureGate(0.015));

  const cameraPermission = location.state?.cameraPermission ?? "denied";
  const [modelPath, setModelPath] = useState(
    () => location.state?.modelPath ?? MODEL_PATHS[0],
  );
  const [morphProgress, setMorphProgress] = useState(0);
  const selectedIndex = Math.max(
    0,
    MODEL_PATHS.findIndex((p) => p === modelPath),
  );

  const [variant, setVariant] = useState<RenderVariant>(() => {
    try {
      return sessionStorage.getItem(VARIANT_KEY) === "bubble" ? "bubble" : "glass";
    } catch {
      return "glass";
    }
  });

  useEffect(() => {
    setTimeout(() => setFadeIn(true), 100);
    setTimeout(() => setSceneReady(true), 300);
  }, []);

  // "A" swaps the render variant; gesture state and form choice carry over.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "a" && e.key !== "A") return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      setVariant((v) => {
        const next: RenderVariant = v === "glass" ? "bubble" : "glass";
        try {
          sessionStorage.setItem(VARIANT_KEY, next);
        } catch {
          // private mode — the toggle just won't survive a refresh
        }
        return next;
      });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Snappy follow with a bit of ease — responsive but not snappy-hard.
  useEffect(() => {
    const smoothingSpeed = 0.14;
    const maxChangePerFrame = 0.035;

    const animate = () => {
      setMorphProgress((current) => {
        const target = targetMorphRef.current;
        const diff = target - current;
        if (Math.abs(diff) < 0.0005) return target;
        let desiredChange = diff * smoothingSpeed;
        desiredChange = Math.max(
          -maxChangePerFrame,
          Math.min(maxChangePerFrame, desiredChange),
        );
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

  /*
   * Gesture map for this page (implemented): open palm ↔ fist → morphProgress.
   * Other pages (reference only — not wired here):
   *   pinch (thumb–index) → weight / fluidity
   *   palm height → color preset
   *   two-hand distance → texture / bump
   */
  const { isTracking } = useHandTracking({
    enabled: cameraPermission === "granted",
    videoRef,
    numHands: 1,
    onLandmarks: (hands) => {
      const openness = handOpenness(hands[0]);
      if (gateRef.current.update(openness)) {
        targetMorphRef.current = opennessToMorph(openness);
      }
      setHandsDetected(1);
      setDebugOpenness(openness);
    },
    onNoHands: () => setHandsDetected(0),
  });

  const handleSelectForm = (index: number) => {
    const next = MODEL_PATHS[index];
    if (!next || next === modelPath) return;
    setModelPath(next);
    // Restart from sphere; gesture (or slider) grows into the new form.
    setMorphProgress(0);
    targetMorphRef.current = 0;
    gateRef.current = createGestureGate(0.015);
  };

  const handleContinue = () => {
    navigate("/record/shape/weight", {
      state: {
        ...stripLegacyEvolveFromState(location.state),
        cameraPermission,
        modelPath,
      },
    });
  };

  return (
    <div
      className="relative w-full h-screen flex flex-col overflow-hidden"
      style={{
        background: variant === "bubble" ? BUBBLE_BACKGROUND : "#e0e0e0",
      }}
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
        {variant === "bubble" ? (
          <BubbleViewer
            key={`bubble-${modelPath}`}
            autoRotate
            morphProgress={morphProgress}
            ready={sceneReady}
            modelPath={modelPath}
          />
        ) : (
          <SceneViewer
            key={modelPath}
            autoRotate={true}
            floatAmplitude={0.05}
            shapeBuildOscillatingEvolve={false}
            evolve={0}
            canvasBlurPx={3}
            matOpacity={0.4}
            fluidity={0}
            bumpAmount={0}
            morphProgress={morphProgress}
            ready={sceneReady}
            matPresetIndex={0}
            modelPath={modelPath}
          />
        )}
      </div>

      <div
        className="flex flex-col h-full transition-opacity duration-1000"
        style={{ opacity: fadeIn ? 1 : 0, position: "relative", zIndex: 2 }}
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
          form
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
          <p style={{ margin: 0 }}>close your hand to begin as a sphere.</p>
          <p style={{ margin: 0 }}>open it to grow the shape.</p>
          <p style={{ margin: 0 }}>choose which form wants to become you.</p>
        </div>

        {/* Form selection bar */}
        <div
          style={{
            position: "absolute",
            bottom: cameraPermission === "denied" ? 220 : 110,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 10,
            padding: "8px 10px",
            borderRadius: 100,
            background: "rgba(163, 167, 175, 0.22)",
            zIndex: 10,
          }}
        >
          {FORM_LABELS.map((label, i) => {
            const active = i === selectedIndex;
            return (
              <button
                key={label}
                type="button"
                onClick={() => handleSelectForm(i)}
                style={{
                  fontFamily: SANS,
                  fontSize: 13,
                  textTransform: "lowercase",
                  border: "none",
                  cursor: "pointer",
                  borderRadius: 100,
                  padding: "10px 18px",
                  color: active ? "#ffffff" : "#7b7b87",
                  background: active ? "#7b7b87" : "transparent",
                  transition: "background 0.2s ease, color 0.2s ease",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {cameraPermission === "denied" && (
          <>
            <p
              style={{
                position: "absolute",
                bottom: 290,
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
                  growth
                </label>
                <span
                  style={{
                    fontFamily: SANS,
                    fontSize: 12,
                    color: "#8C8C8C",
                  }}
                >
                  {Math.round(morphProgress * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={morphProgress}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  targetMorphRef.current = v;
                  setMorphProgress(v);
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
          </>
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
            <p style={{ margin: "5px 0" }}>Hands Detected: {handsDetected}</p>
            <p style={{ margin: "5px 0" }}>
              Openness: {debugOpenness.toFixed(4)}
            </p>
            <p style={{ margin: "5px 0" }}>
              Target Growth: {(targetMorphRef.current * 100).toFixed(1)}%
            </p>
            <p style={{ margin: "5px 0" }}>
              Current Growth: {(morphProgress * 100).toFixed(1)}%
            </p>
            <p style={{ margin: "5px 0" }}>
              Form: {FORM_LABELS[selectedIndex] ?? "—"}
            </p>
            <p style={{ margin: "5px 0" }}>Render (A to switch): {variant}</p>
            <p style={{ margin: "5px 0", fontSize: 10, opacity: 0.7 }}>
              MediaPipe: {isTracking ? "✓ Loaded" : "✗ Not loaded"}
            </p>
          </div>
        )}
      </div>

      <BackButton />

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
