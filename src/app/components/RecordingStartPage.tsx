import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { BlobScene } from "./BlobScene";
import svgPathsStop from "../../imports/svg-hpzn3032f5";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { SANS_UI, SERIF } from "../lib/theme";
import { PageHeader } from "./PageHeader";
import { PillButton } from "./PillButton";

// Fallback transcript for browsers without the Web Speech API
const MOCK_TRANSCRIPT = "I remember the day we sat by the river, watching the sun set behind the mountains. The air was crisp and I could feel the warmth of your hand in mine. It was one of those perfect moments that I wish I could hold onto forever.";

const MAX_RECORDING_SECONDS = 60;
const MOCK_RECORDING_SECONDS = 10;

export function RecordingStartPage() {
  const navigate = useNavigate();
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showBlobs, setShowBlobs] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [displayedTranscript, setDisplayedTranscript] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const recordingTimerRef = useRef<number | null>(null);
  const typingIntervalRef = useRef<number | null>(null);

  const speech = useSpeechRecognition();
  const useMock = !speech.isSupported;

  // Latest live transcript, readable from timers/timeouts without stale closures
  const liveTranscriptRef = useRef("");
  useEffect(() => {
    liveTranscriptRef.current = [speech.finalText, speech.interimText]
      .filter(Boolean)
      .join(" ")
      .trim();
  }, [speech.finalText, speech.interimText]);

  const maxDuration = useMock ? MOCK_RECORDING_SECONDS : MAX_RECORDING_SECONDS;

  // Auto-fade in blobs on mount
  useEffect(() => {
    setTimeout(() => {
      setShowBlobs(true);
    }, 100);
  }, []);

  // Start recording when user clicks "click to record"
  const handleStartRecording = () => {
    setIsRecording(true);
    setRecordingDuration(0);
    setDisplayedTranscript("");
    speech.reset();

    if (!useMock) {
      speech.start();
    }

    // Start timer
    recordingTimerRef.current = window.setInterval(() => {
      setRecordingDuration((prev) => {
        const newDuration = prev + 1;

        if (newDuration >= maxDuration) {
          handleStopRecording();
        }

        return newDuration;
      });
    }, 1000);

    // Mock mode: simulate a transcript typing in, as before
    if (useMock) {
      setTimeout(() => {
        setIsTyping(true);

        let currentIndex = 0;
        typingIntervalRef.current = window.setInterval(() => {
          if (currentIndex < MOCK_TRANSCRIPT.length) {
            setDisplayedTranscript(MOCK_TRANSCRIPT.slice(0, currentIndex + 1));
            currentIndex++;
          } else {
            if (typingIntervalRef.current) {
              clearInterval(typingIntervalRef.current);
              typingIntervalRef.current = null;
            }
            setIsTyping(false);
          }
        }, 50);
      }, 1000);
    }
  };

  // Handle clicking on transcript to skip animation (mock mode only)
  const handleTranscriptClick = () => {
    if (useMock && isTyping) {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
      }
      setDisplayedTranscript(MOCK_TRANSCRIPT);
      setIsTyping(false);
    }
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
      }
    };
  }, []);

  // Stop recording
  const handleStopRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }

    if (!useMock) {
      speech.stop();
    }

    // Fade out blobs before navigating
    setShowBlobs(false);
    setTimeout(() => {
      // Read the freshest transcript — final words can still land after stop()
      const transcript = useMock ? MOCK_TRANSCRIPT : liveTranscriptRef.current;
      navigate("/record/transcript", {
        state: transcript ? { transcript } : undefined,
      });
    }, 500);
  };

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
          fontFamily: SERIF,
          fontSize: "clamp(16px, calc(16px + (21 - 16) * ((100vw - 390px) / (1024 - 390))), 21px)",
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
      {!isRecording ? (
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
          {useMock && (
            <p
              style={{
                fontFamily: SERIF,
                fontSize: 11,
                letterSpacing: "0px",
                color: "#ebebeb",
                opacity: 0.45,
                lineHeight: 1.6,
                margin: 0,
                marginTop: 12,
              }}
            >
              (live transcription needs chrome — a sample memory will be used here)
            </p>
          )}
        </div>
      ) : (
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
            opacity: 0.7,
            whiteSpace: "nowrap",
            margin: 0,
          }}
        >
          {speech.error === "not-allowed"
            ? "microphone access was denied — your words can't be heard"
            : `recording...(${recordingDuration}s)`}
        </p>
      )}

      {/* Click to record button (pre-recording) or Stop button (during recording) */}
      {!isRecording ? (
        <PillButton
          label="click to record"
          onClick={handleStartRecording}
          variant="dark"
          style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: 80 }}
        />
      ) : (
        <PillButton
          label="stop"
          onClick={handleStopRecording}
          variant="dark"
          icon={<svg width="14" height="14" viewBox="0 0 20 20" fill="none"> <path d={svgPathsStop.p220b0800} fill="white" /> </svg>}
          style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: 80 }}
        />
      )}

      {/* Transcript display: live speech (final solid, interim faded) or mock typing */}
      <div
        onClick={handleTranscriptClick}
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          bottom: 150,
          maxWidth: "80%",
          maxHeight: "30vh",
          overflowY: "auto",
          textAlign: "center",
          opacity: showBlobs ? 1 : 0,
          transition: "opacity 1.5s ease-in-out, transform 1.5s ease-in-out",
          cursor: isTyping ? "pointer" : "default",
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
          }}
        >
          {useMock ? (
            displayedTranscript
          ) : (
            <>
              {speech.finalText}
              {speech.interimText && (
                <span style={{ opacity: 0.5 }}>
                  {speech.finalText ? " " : ""}
                  {speech.interimText}
                </span>
              )}
            </>
          )}
        </p>
      </div>
    </div>
  );
}
