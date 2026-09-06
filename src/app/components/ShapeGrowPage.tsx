import { useLocation, useNavigate } from "react-router";
import { useState, useEffect, useRef } from "react";
import { BackButton } from "./BackButton";
import { SceneViewer, MODEL_PATHS } from "./SceneViewer";
import { BubbleViewer, BUBBLE_BACKGROUND, DEFAULT_BUBBLE_MATERIAL } from "./BubbleViewer";
import { stripLegacyEvolveFromState } from "../hooks/useOscillatingEvolve";
import {
  createGestureGate,
  handCenter,
  handOpenness,
  landmarkDistance,
  useHandTracking,
} from "../hooks/useHandTracking";
import { SANS, SERIF } from "../lib/theme";
import { PageHeader } from "./PageHeader";
import { PillButton } from "./PillButton";
import { LightGeometryView } from "./LightGeometryView";
import { BubbleMaterialView } from "./BubbleMaterialView";
import { BubblePhotoView } from "./BubblePhotoView";
import { BubbleFormView } from "./BubbleFormView";
import { BubbleWrapView } from "./BubbleWrapView";
import memoryPhotoUrl from "../../assets/memory-photo.jpg";
import memoryPhoto02Url from "../../assets/memory-photo-02.png";

const WRAP_PHOTOS = [memoryPhotoUrl, memoryPhoto02Url] as const;
import { MEMORY_PHOTO_FILTER_DEFAULTS } from "./MemoryPhotoLayer";
import {
  DEFAULT_BUBBLE_AMBIENTS,
  DEFAULT_BUBBLE_LIGHTS,
  EditableLight,
  AmbientFill,
  TransformMode,
} from "../lib/sceneLights";

const FORM_LABELS = ["form 01", "form 02", "form 03"] as const;
const BUBBLE_TABS = ["shape", "feeling", "distance"] as const;
type BubbleTab = (typeof BUBBLE_TABS)[number];
type GestureMode = "adjust" | "confirm";

/** 'glass' is the original lit render; 'bubble' is the fresnel + editable env lights variant. */
type RenderVariant = "glass" | "bubble";

const VARIANT_KEY = "nijimu.growVariant";

/**
 * Open palm → 1; fist → 0.
 * Used by glass morph. Bubble vividness inverts this (open = frost).
 */
function opennessToUnit(openness: number): number {
  const openHand = 0.28;
  const fist = 0.09;
  const t = (openness - fist) / (openHand - fist);
  return Math.max(0, Math.min(1, t));
}

/**
 * Two-hand palm-center distance → morph (same range as glass texture "distance").
 * Hands together → sphere; farther apart → settled form.
 */
function distanceToMorph(distance: number): number {
  const minDistance = 0.15;
  const maxDistance = 0.55;
  const clamped = Math.max(minDistance, Math.min(maxDistance, distance));
  return (clamped - minDistance) / (maxDistance - minDistance);
}

/** Raised palm (low Y) → stronger blue-hour feeling grade. */
function palmYToFeeling(palmY: number): number {
  const minY = 0.35;
  const maxY = 0.95;
  const clamped = Math.max(minY, Math.min(maxY, palmY));
  return 1 - (clamped - minY) / (maxY - minY);
}

export function ShapeGrowPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [fadeIn, setFadeIn] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [debugMode] = useState(true);
  const [handsDetected, setHandsDetected] = useState(0);
  const [debugOpenness, setDebugOpenness] = useState(0);
  const [debugDistance, setDebugDistance] = useState(0);
  const [debugPalmY, setDebugPalmY] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const targetMorphRef = useRef(0);
  const targetVividnessRef = useRef(1);
  const targetFeelingRef = useRef(MEMORY_PHOTO_FILTER_DEFAULTS.feeling);
  const smoothingFrameRef = useRef<number | null>(null);
  // Ignore MediaPipe until the driving signal moves from the first pose.
  const morphGateRef = useRef(createGestureGate(0.015));
  const vividnessGateRef = useRef(createGestureGate(0.015));
  const feelingGateRef = useRef(createGestureGate(0.015));
  const variantRef = useRef<RenderVariant>("glass");
  const bubbleTabRef = useRef<BubbleTab>("shape");
  const gestureModeRef = useRef<GestureMode>("adjust");

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
  variantRef.current = variant;

  const [lightEditOpen, setLightEditOpen] = useState(false);
  const [lights, setLights] = useState<EditableLight[]>(DEFAULT_BUBBLE_LIGHTS);
  const [ambients, setAmbients] = useState<AmbientFill[]>(DEFAULT_BUBBLE_AMBIENTS);
  const [selectedLightId, setSelectedLightId] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<TransformMode>("translate");
  const [materialOpen, setMaterialOpen] = useState(false);
  const [bubbleMaterial, setBubbleMaterial] = useState(DEFAULT_BUBBLE_MATERIAL);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [wrapOpen, setWrapOpen] = useState(false);
  const [wrapIndex, setWrapIndex] = useState(0);
  const wrapPhotoUrl = WRAP_PHOTOS[wrapIndex] ?? WRAP_PHOTOS[0];
  const [photoFilter, setPhotoFilter] = useState(MEMORY_PHOTO_FILTER_DEFAULTS);
  const [vividness, setVividness] = useState(1);
  const [bubbleTab, setBubbleTab] = useState<BubbleTab>("shape");
  const [gestureMode, setGestureMode] = useState<GestureMode>("adjust");
  bubbleTabRef.current = bubbleTab;
  gestureModeRef.current = gestureMode;

  const resetGestureGates = () => {
    morphGateRef.current = createGestureGate(0.015);
    vividnessGateRef.current = createGestureGate(0.015);
    feelingGateRef.current = createGestureGate(0.015);
  };

  const closeDebugPanels = () => {
    setLightEditOpen(false);
    setMaterialOpen(false);
    setPhotoOpen(false);
    setFormOpen(false);
    setWrapOpen(false);
  };

  const openLightEdit = (open: boolean) => {
    if (open) {
      setMaterialOpen(false);
      setPhotoOpen(false);
      setFormOpen(false);
      setWrapOpen(false);
      setVariant("bubble");
      try {
        sessionStorage.setItem(VARIANT_KEY, "bubble");
      } catch {
        // private mode
      }
      setSelectedLightId((id) => id ?? "dir-key");
    }
    setLightEditOpen(open);
  };

  const openMaterial = (open: boolean) => {
    if (open) {
      setLightEditOpen(false);
      setPhotoOpen(false);
      setFormOpen(false);
      setWrapOpen(false);
    }
    setMaterialOpen(open);
  };

  const openPhoto = (open: boolean) => {
    if (open) {
      setLightEditOpen(false);
      setMaterialOpen(false);
      setFormOpen(false);
      setWrapOpen(false);
    }
    setPhotoOpen(open);
  };

  const openForm = (open: boolean) => {
    if (open) {
      setLightEditOpen(false);
      setMaterialOpen(false);
      setPhotoOpen(false);
      setWrapOpen(false);
    }
    setFormOpen(open);
  };

  const openWrap = (open: boolean) => {
    if (open) {
      setLightEditOpen(false);
      setMaterialOpen(false);
      setPhotoOpen(false);
      setFormOpen(false);
    }
    setWrapOpen(open);
  };

  const selectBubbleTab = (tab: BubbleTab) => {
    if (tab === bubbleTab) return;
    setBubbleTab(tab);
    resetGestureGates();
  };

  // Keep gesture gates fresh when swapping glass ↔ bubble.
  useEffect(() => {
    resetGestureGates();
  }, [variant]);

  useEffect(() => {
    setTimeout(() => setFadeIn(true), 100);
    setTimeout(() => setSceneReady(true), 300);
  }, []);

  // "A" swaps the render variant; gesture state and form choice carry over.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "a" && e.key !== "A") return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      closeDebugPanels();
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

    const stepToward = (current: number, target: number) => {
      const diff = target - current;
      if (Math.abs(diff) < 0.0005) return target;
      let desiredChange = diff * smoothingSpeed;
      desiredChange = Math.max(
        -maxChangePerFrame,
        Math.min(maxChangePerFrame, desiredChange),
      );
      return current + desiredChange;
    };

    const animate = () => {
      setMorphProgress((current) => stepToward(current, targetMorphRef.current));
      setVividness((current) => stepToward(current, targetVividnessRef.current));
      setPhotoFilter((current) => {
        const next = stepToward(current.feeling, targetFeelingRef.current);
        if (next === current.feeling) return current;
        return { ...current, feeling: next };
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
   * Glass: open palm ↔ fist → morphProgress.
   * Bubble (adjust mode only, active tab only):
   *   shape    → two-hand palm distance → morph
   *   feeling  → palm height → blue-hour filter strength
   *   distance → open palm ↔ fist → vividness (open = frost)
   */
  const { isTracking } = useHandTracking({
    enabled: cameraPermission === "granted",
    videoRef,
    numHands: variant === "bubble" ? 2 : 1,
    onLandmarks: (hands) => {
      setHandsDetected(hands.length);

      if (variantRef.current === "bubble") {
        const adjusting = gestureModeRef.current === "adjust";
        const tab = bubbleTabRef.current;
        const openness = handOpenness(hands[0]);
        setDebugOpenness(openness);

        const palm = [0, 1, 5, 9, 13, 17].map((i) => hands[0][i]);
        const palmY = palm.reduce((sum, lm) => sum + lm.y, 0) / palm.length;
        setDebugPalmY(palmY);

        if (hands.length >= 2) {
          setDebugDistance(
            landmarkDistance(handCenter(hands[0]), handCenter(hands[1])),
          );
        } else {
          setDebugDistance(0);
        }

        if (!adjusting) return;

        if (tab === "distance" && vividnessGateRef.current.update(openness)) {
          targetVividnessRef.current = 1 - opennessToUnit(openness);
        }

        if (tab === "feeling" && feelingGateRef.current.update(palmY)) {
          targetFeelingRef.current = palmYToFeeling(palmY);
        }

        if (tab === "shape" && hands.length >= 2) {
          const distance = landmarkDistance(
            handCenter(hands[0]),
            handCenter(hands[1]),
          );
          if (morphGateRef.current.update(distance)) {
            targetMorphRef.current = distanceToMorph(distance);
          }
        }
        return;
      }

      const openness = handOpenness(hands[0]);
      setDebugOpenness(openness);
      setDebugDistance(0);
      if (morphGateRef.current.update(openness)) {
        targetMorphRef.current = opennessToUnit(openness);
      }
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
    resetGestureGates();
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
          pointerEvents: lightEditOpen ? "auto" : "none",
        }}
      >
        {variant === "bubble" ? (
          <BubbleViewer
            key={`bubble-${modelPath}-${wrapPhotoUrl}`}
            autoRotate={!lightEditOpen}
            morphProgress={morphProgress}
            ready={sceneReady}
            modelPath={modelPath}
            memoryPhotoUrl={lightEditOpen ? undefined : wrapPhotoUrl}
            lightEditMode={lightEditOpen}
            lights={lights}
            onLightsChange={setLights}
            ambients={ambients}
            selectedLightId={selectedLightId}
            onSelectLight={setSelectedLightId}
            transformMode={transformMode}
            roughness={bubbleMaterial.roughness}
            reflectivity={bubbleMaterial.reflectivity}
            transparency={bubbleMaterial.transparency}
            fog={bubbleMaterial.fog}
            photoFilter={photoFilter}
            vividness={vividness}
          />
        ) : (
          <SceneViewer
            key={modelPath}
            autoRotate
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
            memoryPhotoUrl={memoryPhotoUrl}
          />
        )}
      </div>

      <div
        className="flex flex-col h-full transition-opacity duration-1000"
        style={{
          opacity: fadeIn ? 1 : 0,
          position: "relative",
          zIndex: 2,
          pointerEvents: lightEditOpen ? "none" : "auto",
        }}
      >
        <PageHeader layout="block" />

        {!lightEditOpen && (
          <>
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
          {variant === "bubble" ? bubbleTab : "form"}
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
          {variant === "bubble" ? (
            bubbleTab === "shape" ? (
              <>
                <p style={{ margin: 0 }}>each memory already has a shape.</p>
                <p style={{ margin: 0 }}>open your hands, and let these words find theirs.</p>
              </>
            ) : bubbleTab === "feeling" ? (
              <>
                <p style={{ margin: 0 }}>remembering dyes what happened.</p>
                <p style={{ margin: 0 }}>how does it feel, returning to it today?</p>
              </>
            ) : (
              <>
                <p style={{ margin: 0 }}>time blurs the edges, not the feeling.</p>
                <p style={{ margin: 0 }}>a faded memory can hold more.</p>
              </>
            )
          ) : (
            <>
              <p style={{ margin: 0 }}>close your hand to begin as a sphere.</p>
              <p style={{ margin: 0 }}>open it to grow the shape.</p>
              <p style={{ margin: 0 }}>choose which form wants to become you.</p>
            </>
          )}
        </div>

        {variant === "bubble" ? (
          <div
            style={{
              position: "absolute",
              bottom: cameraPermission === "denied" ? 250 : 160,
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
            {BUBBLE_TABS.map((tab) => {
              const active = tab === bubbleTab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => selectBubbleTab(tab)}
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
                  {tab}
                </button>
              );
            })}
          </div>
        ) : (
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
        )}

        {cameraPermission === "denied" && variant !== "bubble" && (
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

        {variant === "bubble" && (
          <PillButton
            label={gestureMode}
            onClick={() => {
              const next: GestureMode =
                gestureMode === "adjust" ? "confirm" : "adjust";
              setGestureMode(next);
              if (next === "adjust") resetGestureGates();
            }}
            className="transition-opacity duration-500"
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              bottom: 96,
              zIndex: 10,
              boxSizing: "border-box",
              width: 148,
            }}
          />
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
            boxSizing: "border-box",
            width: 148,
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
            {variant === "bubble" && (
              <>
                <p style={{ margin: "5px 0" }}>Tab: {bubbleTab}</p>
                <p style={{ margin: "5px 0" }}>Mode: {gestureMode}</p>
                <p style={{ margin: "5px 0" }}>
                  Hand distance: {debugDistance.toFixed(4)}
                </p>
                <p style={{ margin: "5px 0" }}>
                  Palm Y: {debugPalmY.toFixed(4)}
                </p>
                <p style={{ margin: "5px 0" }}>
                  Feeling: {photoFilter.feeling.toFixed(2)}
                </p>
                <p style={{ margin: "5px 0" }}>
                  Target vividness: {(targetVividnessRef.current * 100).toFixed(1)}%
                </p>
                <p style={{ margin: "5px 0" }}>
                  Current vividness: {(vividness * 100).toFixed(1)}%
                </p>
              </>
            )}
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
          </>
        )}
      </div>

      {variant === "bubble" && (
        <>
          <LightGeometryView
            open={lightEditOpen}
            onOpenChange={openLightEdit}
            lights={lights}
            onLightsChange={setLights}
            ambients={ambients}
            onAmbientsChange={setAmbients}
            selectedId={selectedLightId}
            onSelect={setSelectedLightId}
            transformMode={transformMode}
            onTransformModeChange={setTransformMode}
          />
          <BubbleMaterialView
            open={materialOpen}
            onOpenChange={openMaterial}
            value={bubbleMaterial}
            onChange={setBubbleMaterial}
          />
          <BubblePhotoView
            open={photoOpen}
            onOpenChange={openPhoto}
            value={photoFilter}
            onChange={(next) => {
              targetFeelingRef.current = next.feeling;
              setPhotoFilter(next);
            }}
            vividness={vividness}
            onVividnessChange={(v) => {
              targetVividnessRef.current = v;
              setVividness(v);
            }}
          />
          <BubbleFormView
            open={formOpen}
            onOpenChange={openForm}
            selectedIndex={selectedIndex}
            onSelect={handleSelectForm}
          />
          <BubbleWrapView
            open={wrapOpen}
            onOpenChange={openWrap}
            selectedIndex={wrapIndex}
            onSelect={setWrapIndex}
          />
        </>
      )}

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
