import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";
import { CHROME_GRAY } from "../lib/colors";
import { SERIF, TITLE, NOTE_SIZE } from "../lib/theme";
import { beginTranscription } from "../lib/transcribe";
import svgPathsStop from "../../imports/svg-hpzn3032f5";
import { PARTICLE_TEXT_KEYFRAMES, ParticleText } from "./ParticleText";
import { PillButton } from "./PillButton";
import { pickArtifactModelPath } from "./ContourArtifact";
import { RecordingInstructionsDialog } from "./RecordingInstructionsDialog";
import { MEMORY_POND_PATH, TRANSCRIPT_PATH } from "../lib/routes";
import { createVoiceRippleBurstPlanner, pickVoiceRippleSpot, type VoiceRippleSpot } from "../lib/voicePeaks";

const QUESTION_DELAY_S = 0.35;
const QUESTION_SWEEP_S = 0.5;
const NOTE_1_DELAY_S = 0.9;
const NOTE_SWEEP_S = 0.7;
const BUTTON_IN_DELAY_MS = 1900;
const CHROME_OUT_MS = 500;

const noteStyle = {
  margin: 0,
  fontFamily: SERIF,
  fontSize: NOTE_SIZE,
  lineHeight: 1.45,
  color: CHROME_GRAY,
} as const;

interface RecordingArrival {
  focus?: [number, number];
  shape?: { modelPath?: string };
}

/**
 * Prompt and record controls laid over the pond — same words as the old
 * record-start screen, without leaving the water or placing a form on it.
 */
export function PondRecordingOverlay({
  reducedMotion = false,
  onVoicePulse,
}: {
  reducedMotion?: boolean;
  onVoicePulse?: (at: VoiceRippleSpot) => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const arrival = (location.state as RecordingArrival | null) ?? null;
  const focus = arrival?.focus;

  const [buttonIn, setButtonIn] = useState(reducedMotion);
  const [leaving, setLeaving] = useState(false);
  const [captureFailed, setCaptureFailed] = useState(false);
  const [openingMicrophone, setOpeningMicrophone] = useState(false);
  const [modelPath] = useState(() => arrival?.shape?.modelPath ?? pickArtifactModelPath());
  const lastRipple = useRef<VoiceRippleSpot | null>(null);
  const planBurst = useRef(createVoiceRippleBurstPlanner());
  const pendingRipples = useRef(new Set<number>());
  const canRipple = useRef(false);
  const pulseCallback = useRef(onVoicePulse);
  pulseCallback.current = onVoicePulse;
  const cancelRipples = useCallback(() => {
    canRipple.current = false;
    pendingRipples.current.forEach(id => window.clearTimeout(id));
    pendingRipples.current.clear();
  }, []);

  const recorder = useVoiceRecorder({
    onVoicePeak: level => {
      if (!canRipple.current) return;
      for (const ripple of planBurst.current(level, performance.now())) {
        const emit = () => {
          if (!canRipple.current) return;
          const at = { ...pickVoiceRippleSpot(lastRipple.current), strength: ripple.strength };
          lastRipple.current = at;
          pulseCallback.current?.(at);
        };
        if (ripple.delayMs === 0) emit();
        else {
          const id = window.setTimeout(() => {
            pendingRipples.current.delete(id);
            emit();
          }, ripple.delayMs);
          pendingRipples.current.add(id);
        }
      }
    },
    onStop: (audio) => {
      cancelRipples();
      if (!audio) {
        setCaptureFailed(true);
        return;
      }
      const transcriptionId = beginTranscription(audio);
      setLeaving(true);
      setTimeout(() => {
        navigate(TRANSCRIPT_PATH, {
          state: {
            transcriptionId,
            shape: { modelPath },
            ...(focus ? { focus } : {}),
          },
        });
      }, CHROME_OUT_MS);
    },
  });
  canRipple.current = recorder.isRecording && !reducedMotion && !leaving;
  useEffect(() => {
    if (!recorder.isRecording || reducedMotion || leaving) cancelRipples();
  }, [recorder.isRecording, reducedMotion, leaving, cancelRipples]);
  useEffect(() => cancelRipples, [cancelRipples]);

  const troubleMessage = captureFailed
    ? "The recording didn't come through — try again"
    : recorder.error === "not-allowed"
      ? "microphone access is off. allow it in your browser’s site settings, then try again—or explore with a sample memory."
      : recorder.error === "unsupported"
        ? "This browser can't record — try chrome"
        : recorder.error === "failed"
          ? "The microphone couldn't be opened — try again"
          : null;

  useEffect(() => {
    if (reducedMotion) return;
    const button = setTimeout(() => setButtonIn(true), BUTTON_IN_DELAY_MS);
    return () => clearTimeout(button);
  }, [reducedMotion]);

  const startRecording = async () => {
    if (openingMicrophone || leaving) return;
    setCaptureFailed(false);
    setOpeningMicrophone(true);
    setButtonIn(true);
    planBurst.current = createVoiceRippleBurstPlanner();
    try { await recorder.start(); }
    finally { setOpeningMicrophone(false); }
  };

  const goToSampleTranscript = () => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => {
      navigate(TRANSCRIPT_PATH, {
        state: {
          shape: { modelPath },
          ...(focus ? { focus } : {}),
        },
      });
    }, CHROME_OUT_MS);
  };

  const fadeStyle = (visible: boolean) =>
    ({
      opacity: visible && !leaving ? 1 : 0,
      transition: "opacity 0.9s ease",
    }) as const;

  const leaveStyle = {
    opacity: leaving ? 0 : 1,
    transition: `opacity ${CHROME_OUT_MS}ms ease`,
  } as const;

  // No first-visit flag: every entry (and failed attempt) gets the same
  // instructions. The microphone opens only after the primary action.
  if (!recorder.isRecording && !leaving) return <RecordingInstructionsDialog
    busy={openingMicrophone} error={troubleMessage} onStart={startRecording}
    onSkip={goToSampleTranscript} onClose={() => navigate(MEMORY_POND_PATH)} />;

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 30 }}>
      <style>{`
        ${PARTICLE_TEXT_KEYFRAMES}
        @keyframes puddleRecIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      <p
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          top: 171,
          margin: 0,
          ...TITLE,
          color: CHROME_GRAY,
          width: "min(28em, 90vw)",
          textAlign: "center",
          ...leaveStyle,
        }}
      >
        <ParticleText
          text="What's been lingering on your mind?"
          seed={41}
          animate={!reducedMotion}
          delay={QUESTION_DELAY_S}
          sweep={QUESTION_SWEEP_S}
          wrap
        />
      </p>

      <p
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          top: 229,
          margin: 0,
          width: "min(28em, 82vw)",
          textAlign: "center",
          ...noteStyle,
          ...leaveStyle,
        }}
      >
        <ParticleText
          text="Start with a moment, feeling, or detail that stayed with you. Don’t worry about finding the perfect words, just speak naturally until you feel you’ve finished telling your story."
          seed={53}
          animate={!reducedMotion}
          delay={NOTE_1_DELAY_S}
          sweep={NOTE_SWEEP_S}
          wrap
        />
      </p>

      {(recorder.isRecording || troubleMessage) && (
        <p
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            top: 338,
            margin: 0,
            whiteSpace: "nowrap",
            ...noteStyle,
            ...leaveStyle,
            opacity: leaving ? 0 : troubleMessage ? 1 : 0.6 + recorder.level * 0.4,
            transition: "opacity 0.4s ease",
            animation: reducedMotion ? "none" : "puddleRecIn 0.8s ease backwards",
          }}
        >
          {troubleMessage ?? `Recording...(${recorder.duration}s)`}
        </p>
      )}

      <div style={{ pointerEvents: buttonIn && !leaving ? "auto" : "none", ...fadeStyle(buttonIn) }}>
        {!recorder.isRecording ? (
          <div
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              bottom: 110,
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              gap: 12,
            }}
          >
            <PillButton
              label={captureFailed ? "record again" : "record"}
              onClick={startRecording}
              style={{ width: "100%" }}
            />
            <PillButton
              label="show sample transcript"
              variant="outline"
              onClick={goToSampleTranscript}
              style={{ width: "100%" }}
            />
          </div>
        ) : (
          <PillButton
            label="stop"
            onClick={() => { cancelRipples(); recorder.stop(); }}
            icon={
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                <path d={svgPathsStop.p220b0800} fill={CHROME_GRAY} />
              </svg>
            }
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              bottom: 110,
            }}
          />
        )}
      </div>
    </div>
  );
}
