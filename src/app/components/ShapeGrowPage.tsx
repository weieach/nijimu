import { useLocation, useNavigate } from "react-router";
import { useState, useEffect, useRef } from "react";
import { BackButton } from "./BackButton";
import { SceneViewer, MATERIAL_PRESETS, MODEL_PATHS } from "./SceneViewer";
import { BubbleViewer, BUBBLE_BACKGROUND, DEFAULT_BUBBLE_MATERIAL } from "./BubbleViewer";
import { AmbientSurround } from "./AmbientSurround";
import { OklchColorField } from "./OklchColorField";
import { stripLegacyEvolveFromState } from "../hooks/useOscillatingEvolve";
import {
  createGestureGate,
  handCenter,
  handOpenness,
  landmarkDistance,
  useHandTracking,
} from "../hooks/useHandTracking";
import { SANS, SERIF } from "../lib/theme";
import { GestureHint } from "./GestureHint";
import { PageHeader } from "./PageHeader";
import { PillButton } from "./PillButton";
import { LightGeometryView } from "./LightGeometryView";
import { BubbleMaterialView } from "./BubbleMaterialView";
import { BubblePhotoView } from "./BubblePhotoView";
import { BubbleFormView } from "./BubbleFormView";
import { PhotoLibraryTray } from "./PhotoLibraryTray";
import {
  MEMORY_PHOTO_DEFAULTS,
  MEMORY_PHOTO_FILTER_DEFAULTS,
  type MemoryPhotoFilter,
} from "./MemoryPhotoLayer";
import {
  DEFAULT_BUBBLE_AMBIENTS,
  DEFAULT_BUBBLE_LIGHTS,
  EditableLight,
  AmbientFill,
  TransformMode,
} from "../lib/sceneLights";
import { asFiniteNumber, loadFormDraft, saveFormDraft } from "../lib/formDraft";
import {
  DEFAULT_OKLCH,
  type Oklch,
  meshCoreFromOklch,
  rimFromOklch,
  sampleField,
  uvFromOklch,
} from "../lib/oklch";
import {
  NAMING_PATH,
  SHAPE_DISTANCE_PATH,
  SHAPE_FEELING_PATH,
  SHAPE_GROW_PATH,
  TRANSCRIPT_PATH,
} from "../lib/routes";
import memoryPhotoUrl from "../../assets/memory-photo.jpg";
import snowMountainPhotoUrl from "../../assets/memory-photo-02.png";

const FORM_LABELS = ["form 01", "form 02", "form 03"] as const;
type GestureStep = "shape" | "feeling" | "distance";

/** 'glass' is the original lit render; 'bubble' is the fresnel + editable env lights variant. */
type RenderVariant = "glass" | "bubble";

function stepFromPath(pathname: string): GestureStep {
  if (pathname.includes("/feeling")) return "feeling";
  if (pathname.includes("/distance")) return "distance";
  return "shape";
}

/**
 * Open palm → 1; fist → 0.
 */
function opennessToUnit(openness: number): number {
  const openHand = 0.28;
  const fist = 0.09;
  const t = (openness - fist) / (openHand - fist);
  return Math.max(0, Math.min(1, t));
}

/**
 * Historical wrap look (MemoryPhotoLayer): soft B&W print at baseOpacity 0.48.
 * Fist → exact wrap opacity; open palm → ~20% of that.
 * Never overshoot the wrap default — that reads as a bright flash.
 */
const WRAP_PHOTO_OPACITY_FULL = MEMORY_PHOTO_DEFAULTS.baseOpacity;
const WRAP_PHOTO_OPACITY_FADED = WRAP_PHOTO_OPACITY_FULL * 0.2;

function opennessToWrapOpacity(openness: number): number {
  const t = opennessToUnit(openness);
  const next =
    WRAP_PHOTO_OPACITY_FULL -
    t * (WRAP_PHOTO_OPACITY_FULL - WRAP_PHOTO_OPACITY_FADED);
  return Math.min(WRAP_PHOTO_OPACITY_FULL, Math.max(WRAP_PHOTO_OPACITY_FADED, next));
}

function withWrapPhotoLook(
  filter: MemoryPhotoFilter,
  opacity = WRAP_PHOTO_OPACITY_FULL,
): MemoryPhotoFilter {
  return {
    ...filter,
    saturate: 0,
    opacity: Math.min(WRAP_PHOTO_OPACITY_FULL, opacity),
  };
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
  const step = stepFromPath(location.pathname);
  const [fadeIn, setFadeIn] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [handsDetected, setHandsDetected] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const draft = loadFormDraft();
  const startingMorph =
    asFiniteNumber(location.state?.morphProgress) ??
    asFiniteNumber(draft?.morphProgress) ??
    0;
  const startingVividness = asFiniteNumber(location.state?.vividness) ?? 1;
  const startingFeeling =
    asFiniteNumber(location.state?.photoFilter?.feeling) ??
    MEMORY_PHOTO_FILTER_DEFAULTS.feeling;
  const startingPhotoOpacity = Math.min(
    WRAP_PHOTO_OPACITY_FULL,
    asFiniteNumber(location.state?.photoFilter?.opacity) ??
      WRAP_PHOTO_OPACITY_FULL,
  );
  const initialOklch: Oklch = location.state?.oklch ?? DEFAULT_OKLCH;
  const initialColorUv = uvFromOklch(initialOklch);
  const targetMorphRef = useRef(startingMorph);
  const targetVividnessRef = useRef(startingVividness);
  const targetFeelingRef = useRef(startingFeeling);
  const targetPhotoOpacityRef = useRef(startingPhotoOpacity);
  const smoothingFrameRef = useRef<number | null>(null);
  // Ignore MediaPipe until the driving signal moves from the first pose.
  const morphGateRef = useRef(createGestureGate(0.015));
  const vividnessGateRef = useRef(createGestureGate(0.015));
  const feelingGateRef = useRef(createGestureGate(0.015));
  const variantRef = useRef<RenderVariant>("glass");
  const stepRef = useRef<GestureStep>(step);
  const photoSelectedRef = useRef(!!location.state?.photoUrl);
  const colorUvRef = useRef(initialColorUv);
  const colorHeldRef = useRef(false);
  const pinchFramesRef = useRef(0);

  // Entering directly from highlight should request the camera on this page.
  const cameraPermission = location.state?.cameraPermission ?? "granted";
  const [modelPath, setModelPath] = useState(
    () => location.state?.modelPath ?? draft?.modelPath ?? MODEL_PATHS[0],
  );
  const [morphProgress, setMorphProgress] = useState(startingMorph);
  const selectedIndex = Math.max(
    0,
    MODEL_PATHS.findIndex((p) => p === modelPath),
  );

  const variant = "bubble" as RenderVariant;
  variantRef.current = variant;
  stepRef.current = step;

  const [lightEditOpen, setLightEditOpen] = useState(false);
  const [lights, setLights] = useState<EditableLight[]>(
    () => location.state?.lights ?? draft?.lights ?? DEFAULT_BUBBLE_LIGHTS,
  );
  const [ambients, setAmbients] = useState<AmbientFill[]>(
    () => location.state?.ambients ?? draft?.ambients ?? DEFAULT_BUBBLE_AMBIENTS,
  );
  const [selectedLightId, setSelectedLightId] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<TransformMode>("translate");
  const [materialOpen, setMaterialOpen] = useState(false);
  const [bubbleMaterial, setBubbleMaterial] = useState(
    () => location.state?.bubbleMaterial ?? draft?.bubbleMaterial ?? DEFAULT_BUBBLE_MATERIAL,
  );
  const [photoOpen, setPhotoOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [photoLibraryOpen, setPhotoLibraryOpen] = useState(false);
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | undefined>(
    () => location.state?.photoUrl,
  );
  photoSelectedRef.current = !!selectedPhotoUrl;
  const [photoFilter, setPhotoFilter] = useState(() => {
    const base = {
      ...MEMORY_PHOTO_FILTER_DEFAULTS,
      ...(location.state?.photoFilter ?? {}),
      feeling: startingFeeling,
      opacity: startingPhotoOpacity,
    };
    // A wrapped photo always uses the historical soft B&W print look.
    return location.state?.photoUrl ? withWrapPhotoLook(base, startingPhotoOpacity) : base;
  });
  const [vividness, setVividness] = useState(startingVividness);
  const [oklch, setOklch] = useState<Oklch>(initialOklch);
  const [colorUv, setColorUv] = useState(initialColorUv);
  const [colorHeld, setColorHeld] = useState(false);

  const resetGestureGates = () => {
    morphGateRef.current = createGestureGate(0.015);
    vividnessGateRef.current = createGestureGate(0.015);
    feelingGateRef.current = createGestureGate(0.015);
  };

  const openLightEdit = (open: boolean) => {
    if (open) {
      setMaterialOpen(false);
      setPhotoOpen(false);
      setFormOpen(false);
      setSelectedLightId((id) => id ?? "dir-key");
    }
    setLightEditOpen(open);
  };

  const openMaterial = (open: boolean) => {
    if (open) {
      setLightEditOpen(false);
      setPhotoOpen(false);
      setFormOpen(false);
    }
    setMaterialOpen(open);
  };

  const openPhoto = (open: boolean) => {
    if (open) {
      setLightEditOpen(false);
      setMaterialOpen(false);
      setFormOpen(false);
    }
    setPhotoOpen(open);
  };

  const openForm = (open: boolean) => {
    if (open) {
      setLightEditOpen(false);
      setMaterialOpen(false);
      setPhotoOpen(false);
    }
    setFormOpen(open);
  };

  // Fresh gates when the gesture step changes.
  useEffect(() => {
    resetGestureGates();
    if (step !== "distance") setPhotoLibraryOpen(false);
    if (step !== "feeling") {
      colorHeldRef.current = false;
      pinchFramesRef.current = 0;
      setColorHeld(false);
    }
  }, [step]);

  useEffect(() => {
    setTimeout(() => setFadeIn(true), 100);
    setTimeout(() => setSceneReady(true), 300);
  }, []);

  useEffect(() => {
    saveFormDraft({
      modelPath,
      morphProgress,
      bubbleMaterial,
      lights,
      ambients,
    });
  }, [modelPath, morphProgress, bubbleMaterial, lights, ambients]);

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
        const feeling = stepToward(current.feeling, targetFeelingRef.current);
        const opacity = stepToward(
          current.opacity,
          targetPhotoOpacityRef.current,
        );
        if (feeling === current.feeling && opacity === current.opacity) {
          return current;
        }
        return { ...current, feeling, opacity };
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

  const applyColorPick = (nextU: number, nextV: number) => {
    const u = clamp01(nextU);
    const v = clamp01(nextV);
    colorUvRef.current = { u, v };
    setColorUv({ u, v });
    setOklch(sampleField(u, v));
  };

  /*
   * Glass: open palm ↔ fist → morphProgress.
   * Bubble (current page only):
   *   shape    → two-hand palm distance → morph
   *   feeling  → fingertip position → OKLCH color; pinch → ripple
   *   distance → open palm ↔ fist → wrap opacity (with photo) / vividness (without)
   */
  useHandTracking({
    enabled: cameraPermission === "granted",
    videoRef,
    numHands: variant === "bubble" && step === "shape" ? 2 : 1,
    onLandmarks: (hands) => {
      setHandsDetected(hands.length);

      if (variantRef.current === "bubble") {
        const tab = stepRef.current;
        const openness = handOpenness(hands[0]);

        if (
          tab === "distance" &&
          vividnessGateRef.current.update(openness)
        ) {
          if (photoSelectedRef.current) {
            // Photo present: only opacity. Fist = exact wrap default.
            // Driving frost at the same time clears with a bright flash.
            targetVividnessRef.current = 1;
            targetPhotoOpacityRef.current = opennessToWrapOpacity(openness);
          } else {
            // No photo: open palm frosts the bubble; fist clears it.
            targetVividnessRef.current = 1 - opennessToUnit(openness);
          }
        }

        if (tab === "feeling") {
          const hand = hands[0];
          const pinch = landmarkDistance(hand[4], hand[8], true);
          if (pinch < 0.052) {
            pinchFramesRef.current += 1;
            if (!colorHeldRef.current && pinchFramesRef.current >= 2) {
              colorHeldRef.current = true;
              setColorHeld(true);
            }
          } else {
            pinchFramesRef.current = 0;
            if (colorHeldRef.current && pinch > 0.08) {
              colorHeldRef.current = false;
              setColorHeld(false);
            }
          }

          const nextU = 1 - map01(hand[8].x, 0.12, 0.88);
          const nextV = map01(hand[8].y, 0.16, 0.84);
          const current = colorUvRef.current;
          applyColorPick(
            current.u + (nextU - current.u) * 0.24,
            current.v + (nextV - current.v) * 0.24,
          );
          return;
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
      if (morphGateRef.current.update(openness)) {
        targetMorphRef.current = opennessToUnit(openness);
      }
    },
    onNoHands: () => {
      setHandsDetected(0);
      if (colorHeldRef.current) {
        colorHeldRef.current = false;
        pinchFramesRef.current = 0;
        setColorHeld(false);
      }
    },
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

  const togglePhoto = () => {
    if (selectedPhotoUrl) {
      setSelectedPhotoUrl(undefined);
      return;
    }
    setPhotoLibraryOpen(true);
  };

  const selectLibraryPhoto = (url: string) => {
    setSelectedPhotoUrl(url);
    setPhotoLibraryOpen(false);
    // Settle on the historical wrap look; keep frost cleared so fist
    // later returns to this exact state with no pop.
    targetPhotoOpacityRef.current = WRAP_PHOTO_OPACITY_FULL;
    targetVividnessRef.current = 1;
    setVividness(1);
    setPhotoFilter((current) =>
      withWrapPhotoLook(current, WRAP_PHOTO_OPACITY_FULL),
    );
  };

  const coreColor = meshCoreFromOklch(oklch);
  const rimColor = rimFromOklch(oklch);
  const matPresetIndex = Math.min(
    Math.round(
      ((((oklch.h % 360) + 360) % 360) / 360) *
        (MATERIAL_PRESETS.length - 1),
    ),
    MATERIAL_PRESETS.length - 1,
  );
  const colorApplied = step === "feeling";

  const formState = () => ({
    ...stripLegacyEvolveFromState(location.state),
    cameraPermission,
    modelPath,
    morphProgress,
    bubbleMaterial,
    lights,
    ambients,
    renderVariant: variant,
    vividness,
    photoFilter,
    photoUrl: selectedPhotoUrl,
    oklch,
    coreColor,
    rimColor,
    matPresetIndex,
    shape: {
      modelPath,
      fluidity: 0,
      evolve: morphProgress,
      bumpAmount: 0,
    },
  });

  const handleContinue = () => {
    saveFormDraft({
      modelPath,
      morphProgress,
      bubbleMaterial,
      lights,
      ambients,
    });
    const nextPath =
      step === "shape"
        ? SHAPE_DISTANCE_PATH
        : step === "distance"
          ? SHAPE_FEELING_PATH
          : NAMING_PATH;
    navigate(nextPath, { state: formState() });
  };

  const handleBack = () => {
    const previousPath =
      step === "feeling"
        ? SHAPE_DISTANCE_PATH
        : step === "distance"
          ? SHAPE_GROW_PATH
          : TRANSCRIPT_PATH;
    navigate(previousPath, { state: formState() });
  };

  return (
    <div
      className="relative w-full h-screen flex flex-col overflow-hidden"
      style={{
        background: variant === "bubble" ? BUBBLE_BACKGROUND : "#e0e0e0",
      }}
    >
      {step === "feeling" && <AmbientSurround oklch={oklch} />}

      <div
        style={{
          display:
            cameraPermission === "granted" && !photoLibraryOpen
              ? "block"
              : "none",
          position: "absolute",
          bottom: 22,
          right: 22,
          width: 152,
          height: 152,
          borderRadius: "50%",
          overflow: "hidden",
          background: "rgba(40, 36, 48, 0.1)",
          boxShadow: "0 8px 24px rgba(40, 36, 48, 0.14), 0 2px 6px rgba(40, 36, 48, 0.08)",
          zIndex: 1000,
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: "scaleX(-1)",
          }}
        />
      </div>

      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 1,
          // Always receive wheel / two-finger rotate; UI chrome punches through
          // with its own pointer-events: auto.
          pointerEvents: "auto",
        }}
      >
        {variant === "bubble" ? (
          <BubbleViewer
            key={modelPath}
            autoRotate={!lightEditOpen}
            morphProgress={morphProgress}
            ready={sceneReady}
            modelPath={modelPath}
            coreColor={colorApplied ? coreColor : undefined}
            rimColor={colorApplied ? rimColor : undefined}
            memoryPhotoUrl={
              lightEditOpen || step === "shape" ? undefined : selectedPhotoUrl
            }
            photoFade={1}
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
          // Pass wheel / two-finger through to the canvas underneath.
          pointerEvents: "none",
        }}
      >
        <PageHeader layout="block" style={{ pointerEvents: "auto" }} />

        {!lightEditOpen && (
          <>
        <p
          style={{
            position: "absolute",
            top: variant === "bubble" ? 100 : 118,
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
          {variant === "bubble" ? step : "form"}
        </p>

        <div
          style={{
            position: "absolute",
            top: variant === "bubble" ? 148 : 195,
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
            step === "shape" ? (
              <>
                <p style={{ margin: 0 }}>each memory already has a shape.</p>
                <p style={{ margin: 0 }}>open your hands, and let these words find theirs.</p>
              </>
            ) : step === "feeling" ? (
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

        {variant === "bubble" && (
          <GestureHint
            kind={step === "feeling" ? "color" : step}
            active={handsDetected >= (step === "shape" ? 2 : 1)}
          />
        )}

        {variant !== "bubble" && (
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
              pointerEvents: "auto",
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
                pointerEvents: "auto",
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

          </>
        )}
      </div>

      {step === "feeling" && (
        <div style={{ pointerEvents: "auto" }}>
          <OklchColorField
            u={colorUv.u}
            v={colorUv.v}
            held={colorHeld}
            onPick={({ u, v }) => applyColorPick(u, v)}
          />
        </div>
      )}

      {variant === "bubble" && step !== "feeling" && (
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
              targetPhotoOpacityRef.current = next.opacity;
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
        </>
      )}

      <PhotoLibraryTray
        open={step === "distance" && photoLibraryOpen}
        photoUrl={snowMountainPhotoUrl}
        selectedUrl={selectedPhotoUrl}
        onSelect={selectLibraryPhoto}
        onClose={() => setPhotoLibraryOpen(false)}
      />

      {!lightEditOpen && !photoLibraryOpen && step === "distance" && (
        <PillButton
          label={selectedPhotoUrl ? "remove photo" : "add photo"}
          onClick={togglePhoto}
          className="transition-opacity duration-500"
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: 96,
            zIndex: 30,
            pointerEvents: "auto",
          }}
        />
      )}

      {!lightEditOpen && !photoLibraryOpen && (
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
            zIndex: 30,
            pointerEvents: "auto",
          }}
        />
      )}

      <div style={{ pointerEvents: "auto" }}>
        <BackButton onClick={handleBack} />
      </div>

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

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function map01(value: number, min: number, max: number): number {
  return clamp01((value - min) / (max - min));
}
