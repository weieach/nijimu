import { useLocation, useNavigate } from "react-router";
import { useState, useEffect, useRef } from "react";
import { BackButton } from "./BackButton";
import { MATERIAL_PRESETS } from "./SceneViewer";
import { BubbleViewer, BUBBLE_BACKGROUND, DEFAULT_ARTIFACT_TINT } from "./BubbleViewer";
import { UnderwaterScene } from "./UnderwaterScene";
import { AmbientSurround, SURROUND_FADE_MS } from "./AmbientSurround";
import { DESCENT, stageOfStep } from "../lib/underwater";
import { SINK_WASH } from "../lib/pondCamera";
import { OklchColorField } from "./OklchColorField";
import { stripLegacyEvolveFromState } from "../hooks/useOscillatingEvolve";
import {
  createGestureGate,
  handCenter,
  handOpenness,
  landmarkDistance,
  useHandTracking,
} from "../hooks/useHandTracking";
import { SERIF } from "../lib/theme";
import { CAMERA_PREVIEW, GestureHint } from "./GestureHint";
import { ARTIFACT_LIGHT, useArtifactGlow } from "./ArtifactGlow";
import { PageHeader } from "./PageHeader";
import { PillButton } from "./PillButton";
import { BubbleFormView } from "./BubbleFormView";
import { asFiniteNumber, loadFormDraft, saveFormDraft } from "../lib/formDraft";
import {
  DEFAULT_OKLCH,
  type Oklch,
  meshCoreFromOklch,
  sampleField,
  uvFromOklch,
} from "../lib/oklch";
import {
  IMAGE_PATH,
  NAMING_PATH,
  SHAPE_DISTANCE_PATH,
  SHAPE_FEELING_PATH,
  SHAPE_GROW_PATH,
} from "../lib/routes";
import {
  ArtifactCategory,
  ArtifactForm,
  createArtifactForm,
  formFromState,
  formKey,
} from "../lib/superformula";

type GestureStep = "shape" | "feeling" | "distance";

/** Going back up runs the descent in reverse, a little quicker than it came down. */
const SURFACE_MS = DESCENT.durationMs * 0.6;
/** The share of the descent the wash covered on the way down; it returns over the same stretch. */
const WASH_SPAN = DESCENT.washMs / DESCENT.durationMs;
/** Rising to be named, the memory turns to light as the eye nears the
 *  surface: none at this depth, all of it by the next. */
const GLOW_FROM_DEPTH = 0.62;
const GLOW_FULL_DEPTH = 0.32;

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
 * Two-hand palm-center distance → morph.
 * Hands together → sphere; farther apart → settled form.
 */
function distanceToMorph(distance: number): number {
  const minDistance = 0.15;
  const maxDistance = 0.55;
  const clamped = Math.max(minDistance, Math.min(maxDistance, distance));
  return (clamped - minDistance) / (maxDistance - minDistance);
}

export function ShapeGrowPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const step = stepFromPath(location.pathname);
  const [fadeIn, setFadeIn] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [handsDetected, setHandsDetected] = useState(0);

  // Arriving from the pond, the eye is still just under the surface and goes
  // on sinking until it is level with the form. Read once: the dive happens
  // on arrival only, never again on a step change or a return.
  const [dive] = useState(() => location.state?.dive === true);
  const [reducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const descentRef = useRef(dive && !reducedMotion ? 0 : 1);
  const [washed, setWashed] = useState(!dive);
  // The feeling's colour waits for the form to come to rest in front of the eye.
  const [settled, setSettled] = useState(!dive || reducedMotion);
  const [surfacing, setSurfacing] = useState(false);
  const [carried, setCarried] = useState(false);
  const surfacingRef = useRef(false);
  const artifactLayerRef = useRef<HTMLDivElement>(null);
  const glow = useArtifactGlow(ARTIFACT_LIGHT);
  const surfaceRaf = useRef<number | null>(null);
  const washRef = useRef<HTMLDivElement>(null);
  useEffect(() => () => {
    if (surfaceRaf.current) cancelAnimationFrame(surfaceRaf.current);
  }, []);
  const surfaceImage = location.state?.image as { url: string; aspect?: number } | undefined;

  const videoRef = useRef<HTMLVideoElement>(null);
  const draft = loadFormDraft();
  const startingMorph =
    asFiniteNumber(location.state?.morphProgress) ??
    asFiniteNumber(draft?.morphProgress) ??
    0;
  const startingVividness = asFiniteNumber(location.state?.vividness) ?? 1;
  const initialOklch: Oklch = location.state?.oklch ?? DEFAULT_OKLCH;
  const initialColorUv = uvFromOklch(initialOklch);
  const targetMorphRef = useRef(startingMorph);
  const targetVividnessRef = useRef(startingVividness);
  const smoothingFrameRef = useRef<number | null>(null);
  // Ignore MediaPipe until the driving signal moves from the first pose.
  const morphGateRef = useRef(createGestureGate(0.015));
  const vividnessGateRef = useRef(createGestureGate(0.015));
  const stepRef = useRef<GestureStep>(step);
  const colorUvRef = useRef(initialColorUv);
  const colorHeldRef = useRef(false);
  const pinchFramesRef = useRef(0);

  // Entering directly from highlight should request the camera on this page.
  const cameraPermission = location.state?.cameraPermission ?? "granted";
  // Assigned when the memory was recorded; a deep link gets a fresh one.
  const [form, setForm] = useState<ArtifactForm>(
    () => formFromState(location.state) ?? draft?.form ?? createArtifactForm(),
  );
  const [morphProgress, setMorphProgress] = useState(startingMorph);
  stepRef.current = step;

  const [formOpen, setFormOpen] = useState(false);
  const [vividness, setVividness] = useState(startingVividness);
  const [oklch, setOklch] = useState<Oklch>(initialOklch);
  const [colorUv, setColorUv] = useState(initialColorUv);
  const [colorHeld, setColorHeld] = useState(false);

  const resetGestureGates = () => {
    morphGateRef.current = createGestureGate(0.015);
    vividnessGateRef.current = createGestureGate(0.015);
  };

  // Fresh gates when the gesture step changes.
  useEffect(() => {
    resetGestureGates();
    if (step !== "feeling") {
      colorHeldRef.current = false;
      pinchFramesRef.current = 0;
      setColorHeld(false);
    }
  }, [step]);

  useEffect(() => {
    const diving = dive && !reducedMotion;
    const timers = [
      window.setTimeout(() => setSceneReady(true), diving ? 0 : 300),
      window.setTimeout(() => setWashed(true), 60),
    ];
    if (!diving) {
      timers.push(window.setTimeout(() => setFadeIn(true), 100));
      return () => timers.forEach(clearTimeout);
    }

    // The chrome arrives once the eye has nearly settled — on the descent's
    // own clock, so a slow frame rate never shows it while still sinking.
    let raf = 0;
    let last = performance.now();
    let elapsed = 0;
    const tick = (now: number) => {
      if (!document.hidden) elapsed += Math.min(50, now - last);
      last = now;
      descentRef.current = Math.min(1, elapsed / DESCENT.durationMs);
      if (descentRef.current >= DESCENT.chromeAt) setFadeIn(true);
      if (descentRef.current < 1) raf = requestAnimationFrame(tick);
      else setSettled(true);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      timers.forEach(clearTimeout);
      cancelAnimationFrame(raf);
    };
  }, [dive, reducedMotion]);

  // Debounced: growth changes every frame while a hand is moving.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveFormDraft({ form, morphProgress });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [form, morphProgress]);

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
   *   shape    → two-hand palm distance → morph
   *   distance → open palm ↔ fist → how much the memory has faded (frost)
   *   feeling  → fingertip position → OKLCH color; pinch → ripple
   */
  useHandTracking({
    enabled: cameraPermission === "granted",
    videoRef,
    numHands: step === "shape" ? 2 : 1,
    onLandmarks: (hands) => {
      setHandsDetected(hands.length);
      const tab = stepRef.current;

      if (tab === "distance") {
        const openness = handOpenness(hands[0]);
        if (vividnessGateRef.current.update(openness)) {
          // Open palm frosts the glass; a fist clears it.
          targetVividnessRef.current = 1 - opennessToUnit(openness);
        }
        return;
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

      if (hands.length >= 2) {
        const distance = landmarkDistance(
          handCenter(hands[0]),
          handCenter(hands[1]),
        );
        if (morphGateRef.current.update(distance)) {
          targetMorphRef.current = distanceToMorph(distance);
        }
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

  /** Debug preview: a new deviation in the given category. */
  const handleSelectCategory = (category: ArtifactCategory) => {
    setForm(createArtifactForm({ category }));
    // Restart from sphere; gesture (or slider) grows into the new form.
    setMorphProgress(0);
    targetMorphRef.current = 0;
    resetGestureGates();
  };

  // The glass takes the feeling's dye only once the feeling step is reached;
  // before that it is the tint every memory starts with.
  const matColor = step === "feeling" ? meshCoreFromOklch(oklch) : DEFAULT_ARTIFACT_TINT;
  const matPresetIndex = Math.min(
    Math.round(
      ((((oklch.h % 360) + 360) % 360) / 360) *
        (MATERIAL_PRESETS.length - 1),
    ),
    MATERIAL_PRESETS.length - 1,
  );

  const formState = () => ({
    ...stripLegacyEvolveFromState(location.state),
    dive: undefined, // The descent was this arrival's; it does not travel on.
    rise: undefined,
    cameraPermission,
    form,
    morphProgress,
    vividness,
    oklch,
    matColor,
    matPresetIndex,
    shape: {
      form,
      fluidity: 0,
      evolve: morphProgress,
      bumpAmount: 0,
    },
  });

  // Up the way the eye came down: the descent unwinds, the wash returns at
  // the surface, and the pond takes over rising — back to the picture step,
  // or on to the naming step with the memory rising alongside. From the
  // feeling step the colour drains out of the water first; only then does
  // the eye start to rise. On the way to be named the memory comes up with
  // the eye, turning to light as they near the surface.
  const surface = (to: string) => {
    if (surfacingRef.current) return;
    surfacingRef.current = true;
    const go = () => navigate(to, { state: { ...formState(), rise: true } });
    if (reducedMotion) {
      go();
      return;
    }
    const toNaming = to === NAMING_PATH;
    setFadeIn(false);
    setSurfacing(true);
    setCarried(toNaming);
    const holdMs = step === "feeling" ? SURROUND_FADE_MS : 0;
    const from = descentRef.current ?? 1;
    let last = performance.now();
    let elapsed = 0;
    const tick = (now: number) => {
      if (!document.hidden) elapsed += Math.min(50, now - last);
      last = now;
      const t = clamp01((elapsed - holdMs) / SURFACE_MS);
      const depth = from * (1 - t);
      descentRef.current = depth;
      const wash = 1 - clamp01(depth / WASH_SPAN);
      if (washRef.current) washRef.current.style.opacity = String(wash * wash * (3 - 2 * wash));
      if (toNaming) {
        const light = map01(depth, GLOW_FROM_DEPTH, GLOW_FULL_DEPTH);
        glow.apply(artifactLayerRef.current?.querySelector("canvas"), light * light * (3 - 2 * light));
      }
      if (t >= 1) {
        surfaceRaf.current = null;
        go();
        return;
      }
      surfaceRaf.current = requestAnimationFrame(tick);
    };
    surfaceRaf.current = requestAnimationFrame(tick);
  };

  const handleContinue = () => {
    if (surfacingRef.current) return;
    saveFormDraft({ form, morphProgress });
    if (step === "shape") navigate(SHAPE_DISTANCE_PATH, { state: formState() });
    else if (step === "distance") navigate(SHAPE_FEELING_PATH, { state: formState() });
    else surface(NAMING_PATH);
  };

  const handleBack = () => {
    if (surfacingRef.current) return;
    if (step === "shape") {
      surface(IMAGE_PATH);
      return;
    }
    navigate(step === "feeling" ? SHAPE_DISTANCE_PATH : SHAPE_GROW_PATH, { state: formState() });
  };

  return (
    <div
      className="relative w-full h-screen flex flex-col overflow-hidden"
      style={{ background: "#8f9c9c" }}
    >
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
        <UnderwaterScene
          imageUrl={surfaceImage?.url}
          imageAspect={surfaceImage?.aspect}
          descentRef={descentRef}
          reducedMotion={reducedMotion}
          stage={stageOfStep(step)}
        />
      </div>
      {/* The scene's own gradient, laid over the water as a veil. */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          background: BUBBLE_BACKGROUND,
          opacity: 0.32,
          pointerEvents: "none",
        }}
      />
      {/* The feeling's colour, fading in over the same water. */}
      <AmbientSurround oklch={oklch} visible={step === "feeling" && settled && !surfacing} />

      <div
        style={{
          display: cameraPermission === "granted" ? "block" : "none",
          position: "absolute",
          bottom: CAMERA_PREVIEW.bottom,
          right: CAMERA_PREVIEW.right,
          width: CAMERA_PREVIEW.size,
          height: CAMERA_PREVIEW.size,
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

      {glow.filter}
      <div
        ref={artifactLayerRef}
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
        <BubbleViewer
          key={formKey(form)}
          autoRotate
          morphProgress={morphProgress}
          ready={sceneReady}
          form={form}
          matColor={matColor}
          vividness={vividness}
          underwater={{
            descentRef,
            imageUrl: surfaceImage?.url,
            imageAspect: surfaceImage?.aspect,
            reducedMotion,
            stage: stageOfStep(step),
            carried,
          }}
        />
      </div>

      {(dive || surfacing) && (
        <div
          ref={washRef}
          aria-hidden
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99970,
            background: SINK_WASH,
            opacity: washed || surfacing ? 0 : 1,
            transition: surfacing ? "none" : `opacity ${reducedMotion ? 1 : DESCENT.washMs}ms ease-out`,
            pointerEvents: "none",
          }}
        />
      )}

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

        <p
          style={{
            position: "absolute",
            top: 100,
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
          {step}
        </p>

        <div
          style={{
            position: "absolute",
            top: 148,
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
          {step === "shape" ? (
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
          )}
        </div>

        <GestureHint
          kind={step === "feeling" ? "color" : step}
          active={handsDetected >= (step === "shape" ? 2 : 1)}
        />
      </div>

      {step === "feeling" && (
        <div
          style={{
            pointerEvents: surfacing || !settled ? "none" : "auto",
            opacity: surfacing || !settled ? 0 : 1,
            transition: `opacity ${SURROUND_FADE_MS}ms ease`,
          }}
        >
          <OklchColorField
            u={colorUv.u}
            v={colorUv.v}
            held={colorHeld}
            onPick={({ u, v }) => applyColorPick(u, v)}
          />
        </div>
      )}

      {step !== "feeling" && (
        <BubbleFormView
          open={formOpen}
          onOpenChange={setFormOpen}
          form={form}
          onSelectCategory={handleSelectCategory}
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
          zIndex: 30,
          pointerEvents: "auto",
          opacity: fadeIn ? 1 : 0,
        }}
      />

      <div style={{ pointerEvents: "auto" }}>
        <BackButton onClick={handleBack} />
      </div>
    </div>
  );
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function map01(value: number, min: number, max: number): number {
  return clamp01((value - min) / (max - min));
}
