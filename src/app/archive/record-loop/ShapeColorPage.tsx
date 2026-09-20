import { useLocation, useNavigate } from "react-router";
import { useState, useEffect, useRef } from "react";
import { BackButton } from "./BackButton";
import { MATERIAL_PRESETS, MODEL_PATHS } from "./SceneViewer";
import { BubbleViewer, DEFAULT_BUBBLE_MATERIAL } from "./BubbleViewer";
import { AmbientSurround } from "./AmbientSurround";
import { OklchColorField, WASH_HEIGHT } from "./OklchColorField";
import { stripLegacyEvolveFromState } from "../hooks/useOscillatingEvolve";
import { landmarkDistance, useHandTracking } from "../hooks/useHandTracking";
import {
  DEFAULT_OKLCH,
  Oklch,
  meshCoreFromOklch,
  rimFromOklch,
  sampleField,
  uvFromOklch,
} from "../lib/oklch";
import {
  DEFAULT_BUBBLE_AMBIENTS,
  DEFAULT_BUBBLE_LIGHTS,
} from "../lib/sceneLights";
import { asFiniteNumber, loadFormDraft, saveFormDraft } from "../lib/formDraft";
import memoryPhotoUrl from "../../assets/memory-photo.jpg";
import { SERIF } from "../lib/theme";
import { PageHeader } from "./PageHeader";
import { PillButton } from "./PillButton";

export function ShapeColorPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [fadeIn, setFadeIn] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);

  const draft = loadFormDraft();
  const modelPath = location.state?.modelPath ?? draft?.modelPath ?? MODEL_PATHS[0];
  const morphProgress =
    asFiniteNumber(location.state?.morphProgress) ??
    asFiniteNumber(draft?.morphProgress) ??
    1;
  const bubbleMaterial =
    location.state?.bubbleMaterial ?? draft?.bubbleMaterial ?? DEFAULT_BUBBLE_MATERIAL;
  const lights = location.state?.lights ?? draft?.lights ?? DEFAULT_BUBBLE_LIGHTS;
  const ambients = location.state?.ambients ?? draft?.ambients ?? DEFAULT_BUBBLE_AMBIENTS;

  const initialOklch: Oklch = location.state?.oklch ?? DEFAULT_OKLCH;
  const initialUv = uvFromOklch(initialOklch);
  const [oklch, setOklch] = useState<Oklch>(initialOklch);
  const [uv, setUv] = useState(initialUv);
  const [handMode, setHandMode] = useState(false);
  const [held, setHeld] = useState(false);
  const [handsSeen, setHandsSeen] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const smoothUv = useRef(initialUv);
  const heldRef = useRef(false);
  const pinchCount = useRef(0);

  const applyPick = (nextU: number, nextV: number) => {
    const u = clamp01(nextU);
    const v = clamp01(nextV);
    setUv({ u, v });
    setOklch(sampleField(u, v));
  };

  const { isTracking, error: handError } = useHandTracking({
    enabled: handMode,
    videoRef,
    numHands: 1,
    onLandmarks: (hands) => {
      const hand = hands[0];
      if (!hand) return;
      setHandsSeen(true);
      const pinch = landmarkDistance(hand[4], hand[8], true);
      if (pinch < 0.052) {
        pinchCount.current += 1;
        if (!heldRef.current && pinchCount.current >= 2) {
          heldRef.current = true;
          setHeld(true);
        }
      } else {
        pinchCount.current = 0;
        if (heldRef.current && pinch > 0.08) {
          heldRef.current = false;
          setHeld(false);
        }
      }
      // Selfie camera: flip X so moving right follows the wash.
      // Color always tracks the finger.
      const nextU = 1 - map01(hand[8].x, 0.12, 0.88);
      const nextV = map01(hand[8].y, 0.16, 0.84);
      smoothUv.current = {
        u: smoothUv.current.u + (nextU - smoothUv.current.u) * 0.24,
        v: smoothUv.current.v + (nextV - smoothUv.current.v) * 0.24,
      };
      applyPick(smoothUv.current.u, smoothUv.current.v);
    },
    onNoHands: () => setHandsSeen(false),
  });

  useEffect(() => {
    if (handMode) {
      smoothUv.current = uv;
      return;
    }
    heldRef.current = false;
    pinchCount.current = 0;
    setHeld(false);
    setHandsSeen(false);
  }, [handMode]);

  useEffect(() => {
    setTimeout(() => setFadeIn(true), 100);
    setTimeout(() => setSceneReady(true), 300);
  }, []);

  const coreColor = meshCoreFromOklch(oklch);
  const rimColor = rimFromOklch(oklch);

  const formState = () => ({
    ...stripLegacyEvolveFromState(location.state),
    modelPath,
    morphProgress,
    bubbleMaterial,
    lights,
    ambients,
    oklch,
    cameraPermission:
      handMode && isTracking ? "granted" : location.state?.cameraPermission,
  });

  const handleBackToForm = () => {
    saveFormDraft({
      modelPath,
      morphProgress,
      bubbleMaterial,
      lights,
      ambients,
    });
    navigate("/record/shape/grow", { state: formState() });
  };

  const handleContinue = () => {
    navigate("/record/shape/texture", {
      state: {
        ...formState(),
        coreColor,
        rimColor,
        matPresetIndex: Math.min(
          Math.round((((oklch.h % 360) + 360) % 360) / 360 * (MATERIAL_PRESETS.length - 1)),
          MATERIAL_PRESETS.length - 1,
        ),
      },
    });
  };

  return (
    <div
      className="relative w-full h-screen flex flex-col overflow-hidden"
      style={{ background: "#ededee" }}
    >
      <AmbientSurround oklch={oklch} />
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
          memoryPhotoUrl={morphProgress < 0.98 ? memoryPhotoUrl : undefined}
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
          <p style={{ margin: 0 }}>
            {handMode
              ? "move your hand — the wash follows. pinch for a ripple."
              : "move across the wash below. click for a ripple."}
          </p>
        </div>

      </div>

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          display: handMode ? "block" : "none",
          position: "absolute",
          top: 72,
          right: 18,
          width: 160,
          height: 120,
          objectFit: "cover",
          borderRadius: 10,
          opacity: 0.55,
          transform: "scaleX(-1)",
          zIndex: 30,
          pointerEvents: "none",
        }}
      />

      <OklchColorField
        u={uv.u}
        v={uv.v}
        held={held}
        onPick={({ u: nextU, v: nextV, color }) => {
          setUv({ u: nextU, v: nextV });
          setOklch(color);
        }}
      />

      <button
        type="button"
        aria-pressed={handMode}
        onClick={() => setHandMode((on) => !on)}
        style={{
          position: "absolute",
          left: 22,
          bottom: `calc(${WASH_HEIGHT} + 22px)`,
          zIndex: 20,
          fontFamily: SERIF,
          fontSize: 16,
          letterSpacing: "-0.6px",
          color: handMode ? "#5c5c68" : "#9a9aa6",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textTransform: "lowercase",
          padding: 0,
        }}
      >
        {handMode ? "hand on" : "hand"}
      </button>

      {handMode && (
        <p
          style={{
            position: "absolute",
            left: 22,
            bottom: `calc(${WASH_HEIGHT} + 44px)`,
            zIndex: 20,
            fontFamily: SERIF,
            fontSize: 13,
            letterSpacing: "-0.4px",
            color: "#9a9aa6",
            textTransform: "lowercase",
            margin: 0,
          }}
        >
          {handError
            ? "camera unavailable"
            : !isTracking
              ? "asking the camera…"
              : !handsSeen
                ? "looking for a hand"
                : held
                  ? "ripple"
                  : "browsing"}
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
          bottom: `calc(${WASH_HEIGHT} + 18px)`,
          zIndex: 20,
        }}
      />

      <BackButton onClick={handleBackToForm} />
    </div>
  );
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function map01(n: number, a: number, b: number): number {
  return clamp01((n - a) / (b - a));
}
