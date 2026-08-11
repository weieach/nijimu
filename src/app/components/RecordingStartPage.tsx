import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { BlobScene } from "./BlobScene";
import svgPathsStop from "../../imports/svg-hpzn3032f5";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";
import { SERIF, SERIF_EXPOSURE } from "../lib/theme";
import { beginTranscription } from "../lib/transcribe";
import { PageHeader } from "./PageHeader";
import { PillButton } from "./PillButton";

/** The record button waits for the prompt to settle before offering itself. */
const BUTTON_IN_DELAY_MS = 1800;

export function RecordingStartPage() {
  const navigate = useNavigate();
  const [showBlobs, setShowBlobs] = useState(false);
  const [buttonIn, setButtonIn] = useState(false);
  const [captureFailed, setCaptureFailed] = useState(false);

  const recorder = useVoiceRecorder({
    onStop: (audio) => {
      if (!audio) {
        setCaptureFailed(true);
        return;
      }
      // The recording keeps being transcribed while the blobs fade — the
      // transcript screen picks it up by id when the words land.
      const transcriptionId = beginTranscription(audio);
      setShowBlobs(false);
      setTimeout(() => {
        navigate("/record/transcript", { state: { transcriptionId } });
      }, 500);
    },
  });
  const isRecording = recorder.isRecording;
  const recordingDuration = recorder.duration;

  const troubleMessage = captureFailed
    ? "the recording didn't come through — try again"
    : recorder.error === "not-allowed"
      ? "microphone access was denied — your words can't be heard"
      : recorder.error === "unsupported"
        ? "this browser can't record — try chrome"
        : recorder.error === "failed"
          ? "the microphone couldn't be opened — try again"
          : null;

  const startRecording = () => {
    setCaptureFailed(false);
    void recorder.start();
  };

  // Auto-fade in blobs on mount; the record button follows a beat later
  useEffect(() => {
    const blobs = setTimeout(() => setShowBlobs(true), 100);
    const button = setTimeout(() => setButtonIn(true), BUTTON_IN_DELAY_MS);
    return () => {
      clearTimeout(blobs);
      clearTimeout(button);
    };
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden" style={{ background: "#434343" }}>
      {/* BlobScene background (no annotations, zoomed in, non-interactive) */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-500"
        style={{
          transform: "scale(1.3)",
          transformOrigin: "center center",
          opacity: showBlobs ? 1 : 0,
        }}
      >
        <BlobScene hideAnnotations={true} />
      </div>

      {/* Dark overlay */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-500"
        style={{
          background: "linear-gradient(to bottom, rgba(36,17,13,0.4), rgba(102,102,102,0.4))",
          opacity: showBlobs ? 1 : 0,
        }}
      />

      {/* nijimu wordmark */}
      <PageHeader layout="absolute" tone="dark" />

      {/* Question text */}
      <p
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          top: 171,
          fontFamily: SERIF_EXPOSURE,
          fontSize: "clamp(16px, calc(16px + (21 - 16) * ((100vw - 390px) / (1024 - 390))), 21px)",
          fontWeight: 400,
          fontSynthesis: "none",
          letterSpacing: "0px",
          color: "white",
          textTransform: "lowercase",
          whiteSpace: "nowrap",
          margin: 0,
        }}
      >
        what's been lingering on your mind?
      </p>

      {/* Instructional text (pre-recording state) or Recording indicator */}
      {!isRecording && !troubleMessage ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            top: 229,
            maxWidth: "80%",
            textAlign: "center",
            opacity: showBlobs ? 1 : 0,
            transition: "opacity 1.5s ease-in-out, transform 1.5s ease-in-out",
          }}
        >
          <p
            style={{
              fontFamily: SERIF,
              fontSize: 12,
              letterSpacing: "0px",
              color: "#ebebeb",
              opacity: 0.7,
              lineHeight: 1.6,
              margin: 0,
              marginBottom: 12,
            }}
          >
            speak into the microphone about this memory you are about to forget or still cannot let it go.
          </p>
          <p
            style={{
              fontFamily: SERIF,
              fontSize: 12,
              letterSpacing: "0px",
              color: "#ebebeb",
              opacity: 0.7,
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            how it happened, how it leave a shape in your heart, how do you feel...
          </p>
        </div>
      ) : (
        /* while recording, the line breathes with the voice being heard */
        <p
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            top: 270,
            fontFamily: SERIF,
            fontSize: 12,
            letterSpacing: "0px",
            color: "#ebebeb",
            opacity: troubleMessage ? 0.7 : 0.5 + recorder.level * 0.5,
            transition: "opacity 0.4s ease",
            whiteSpace: "nowrap",
            margin: 0,
          }}
        >
          {troubleMessage ?? `recording...(${recordingDuration}s)`}
        </p>
      )}

      {/* Click to record button (pre-recording) or Stop button (during recording) */}
      {!isRecording ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: 80,
            opacity: buttonIn ? 1 : 0,
            transition: "opacity 0.9s ease",
            pointerEvents: buttonIn ? "auto" : "none",
          }}
        >
          <PillButton
            label={captureFailed ? "record again" : "click to record"}
            onClick={startRecording}
            variant="dark"
          />
        </div>
      ) : (
        <PillButton
          label="stop"
          onClick={recorder.stop}
          variant="dark"
          icon={<svg width="14" height="14" viewBox="0 0 20 20" fill="none"> <path d={svgPathsStop.p220b0800} fill="white" /> </svg>}
          style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: 80 }}
        />
      )}

    </div>
  );
}
