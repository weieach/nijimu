import { useNavigate } from "react-router";
import { useState, useRef, useEffect } from "react";
import { BlobScene } from "./BlobScene";
import { BackButton } from "./BackButton";
import svgPaths from "../../imports/svg-h5bca79tjj";
import svgPathsStop from "../../imports/svg-v4a6nixv89";
import { SANS, SERIF } from "../lib/theme";
import { PageHeader } from "./PageHeader";
import { PillButton } from "./PillButton";

export function ClickToRecordPage() {
  const navigate = useNavigate();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showBlobs, setShowBlobs] = useState(false);
  const recordingTimerRef = useRef<number | null>(null);

  // Start recording
  const handleStartRecording = () => {
    setIsRecording(true);
    setRecordingDuration(0);
    
    // Fade in blobs
    setTimeout(() => {
      setShowBlobs(true);
    }, 100);
    
    // Start timer
    recordingTimerRef.current = window.setInterval(() => {
      setRecordingDuration((prev) => prev + 1);
    }, 1000);
  };

  // Stop recording
  const handleStopRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    
    // Fade out blobs before navigating
    setShowBlobs(false);
    setTimeout(() => {
      setIsRecording(false);
      // Navigate to transcript page (skip the process page)
      navigate("/record/transcript");
    }, 500);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  // Format duration as MM:SS
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (isRecording) {
    // Recording state - show BlobScene background with darker overlay
    return (
      <div className="relative w-full h-screen overflow-hidden">
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
            fontSize: 16,
            fontWeight: 500,
            lineHeight: "120%",
            letterSpacing: "0px",
            color: "#7B7B87",
            textTransform: "lowercase",
            whiteSpace: "nowrap",
            margin: 0,
          }}
        >
          What's been lingering on your mind?
        </p>

        {/* Recording indicator */}
        <p
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            top: 229,
            fontFamily: "SF Mono, Monaco, monospace",
            fontSize: 18,
            fontWeight: 400,
            lineHeight: "120%",
            letterSpacing: "-1px",
            color: "#ebebeb",
            opacity: 0.7,
            whiteSpace: "nowrap",
            margin: 0,
          }}
        >
          recording... {formatDuration(recordingDuration)}
        </p>

        {/* Stop button */}
        <PillButton
          label="stop"
          onClick={handleStopRecording}
          variant="dark"
          icon={<svg width="20" height="20" viewBox="0 0 20 20" fill="none"> <path d={svgPathsStop.p220b0800} fill="white" /> </svg>}
          style={{ position: "absolute", bottom: 80, left: "50%", transform: "translateX(-50%)" }}
        />
      </div>
    );
  }

  // Initial state - click to record
  return (
    <div
      className="relative w-full h-screen overflow-hidden select-none flex flex-col items-center justify-center"
      style={{ background: "#e0e0e0" }}
    >
      {/* nijimu wordmark */}
      <PageHeader layout="absolute" />

      {/* Question text */}
      <p
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          top: 171,
          fontFamily: SERIF,
          fontSize: "clamp(16px, calc(16px + (21 - 16) * ((100vw - 390px) / (1024 - 390))), 21px)",
          fontWeight: 500,
          lineHeight: "120%",
          letterSpacing: "0px",
          color: "#7B7B87",
          textTransform: "lowercase",
          whiteSpace: "nowrap",
          margin: 0,
        }}
      >
        What's been lingering on your mind?
      </p>

      {/* Central image */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, calc(-50% + 20.5px))",
          width: "min(510px, 80vw)",
          aspectRatio: "510 / 534",
          pointerEvents: "none",
        }}
      >
        {/* Solid panel (replaces Figma liquid image) */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "#181818",
            border: "0.5px solid #bcbcbc",
          }}
        />
      </div>

      {/* Click to record button */}
      <button
        onClick={handleStartRecording}
        style={{
          position: "absolute",
          bottom: 80,
          left: "50%",
          transform: "translateX(-50%)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 19,
          padding: "15px 30px",
          borderRadius: 100,
          border: "none",
          background: "rgba(163, 167, 175, 0.25)",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        <svg width="18.75" height="18.75" viewBox="0 0 18.75 18.75" fill="none">
          <path d={svgPaths.p12d5cb00} fill="white" />
        </svg>
        <span
          style={{
            fontFamily: SANS,
            fontSize: 24,
            fontWeight: 400,
            lineHeight: 1.5,
            color: "white",
            textShadow: "0px 4px 100px black",
            textTransform: "lowercase",
          }}
        >
          click to record
        </span>
      </button>

      {/* Back button */}
      <BackButton />
    </div>
  );
}