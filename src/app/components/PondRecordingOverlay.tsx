import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";
import { CHROME_GRAY } from "../lib/colors";
import { SERIF, SERIF_EXPOSURE } from "../lib/theme";
import { beginTranscription } from "../lib/transcribe";
import svgPathsStop from "../../imports/svg-hpzn3032f5";
import { PARTICLE_TEXT_KEYFRAMES, ParticleText } from "./ParticleText";
import { PillButton } from "./PillButton";
import { pickArtifactModelPath } from "./ContourArtifact";

const QUESTION_DELAY_S = 0.35;
const QUESTION_SWEEP_S = 0.5;
const NOTE_1_DELAY_S = 0.9;
const NOTE_2_DELAY_S = 1.4;
const NOTE_SWEEP_S = 0.7;
const BUTTON_IN_DELAY_MS = 1900;
const CHROME_OUT_MS = 500;

const noteStyle = {
  margin: 0,
  fontFamily: SERIF,
  fontSize: 12,
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
  onVoicePulse?: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const arrival = (location.state as RecordingArrival | null) ?? null;
  const focus = arrival?.focus;

  const [buttonIn, setButtonIn] = useState(reducedMotion);
  const [leaving, setLeaving] = useState(false);
  const [captureFailed, setCaptureFailed] = useState(false);
  const [modelPath] = useState(() => arrival?.shape?.modelPath ?? pickArtifactModelPath());

  const recorder = useVoiceRecorder({
    onStop: (audio) => {
      if (!audio) {
        setCaptureFailed(true);
        return;
      }
      const transcriptionId = beginTranscription(audio);
      setLeaving(true);
      setTimeout(() => {
        navigate("/record/transcript", {
          state: {
            transcriptionId,
            shape: { modelPath },
            ...(focus ? { focus } : {}),
          },
        });
      }, CHROME_OUT_MS);
    },
  });

  useEffect(() => {
    if (recorder.voicePulse > 0) onVoicePulse?.();
  }, [recorder.voicePulse, onVoicePulse]);

  const troubleMessage = captureFailed
    ? "The recording didn't come through — try again"
    : recorder.error === "not-allowed"
      ? "Microphone access was denied — your words can't be heard"
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

  const startRecording = () => {
    setCaptureFailed(false);
    void recorder.start();
  };

  const goToSampleTranscript = () => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => {
      navigate("/record/transcript", {
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
          fontFamily: SERIF_EXPOSURE,
          fontSize: "clamp(16px, calc(16px + (21 - 16) * ((100vw - 390px) / (1024 - 390))), 21px)",
          fontWeight: 400,
          fontSynthesis: "none",
          color: CHROME_GRAY,
          whiteSpace: "nowrap",
          ...leaveStyle,
        }}
      >
        <ParticleText
          text="What's been lingering on your mind?"
          seed={41}
          animate={!reducedMotion}
          delay={QUESTION_DELAY_S}
          sweep={QUESTION_SWEEP_S}
        />
      </p>

      {!recorder.isRecording && !troubleMessage ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            top: 229,
            maxWidth: "80%",
            textAlign: "center",
            ...leaveStyle,
          }}
        >
          <p style={{ ...noteStyle, marginBottom: 4 }}>
            <ParticleText
              text="Speak into the microphone about this memory you are about to forget or still cannot let it go."
              seed={53}
              animate={!reducedMotion}
              delay={NOTE_1_DELAY_S}
              sweep={NOTE_SWEEP_S}
              wrap
            />
          </p>
          <p style={noteStyle}>
            <ParticleText
              text="How it happened, how it leave a shape in your heart, how do you feel..."
              seed={67}
              animate={!reducedMotion}
              delay={NOTE_2_DELAY_S}
              sweep={NOTE_SWEEP_S}
              wrap
            />
          </p>
        </div>
      ) : (
        <p
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            top: 270,
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
            onClick={recorder.stop}
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
