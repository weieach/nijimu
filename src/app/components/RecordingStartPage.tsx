import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { BlobScene } from "./BlobScene";
import svgPathsStop from "../../imports/svg-hpzn3032f5";

export function RecordingStartPage() {
  const navigate = useNavigate();
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showBlobs, setShowBlobs] = useState(false);
  const [isRecording, setIsRecording] = useState(false); // Track recording state
  const [transcript, setTranscript] = useState("");
  const [displayedTranscript, setDisplayedTranscript] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const recordingTimerRef = useRef<number | null>(null);
  const typingIntervalRef = useRef<number | null>(null);

  // Mock transcript that will appear gradually
  const mockTranscript = "I remember the day we sat by the river, watching the sun set behind the mountains. The air was crisp and I could feel the warmth of your hand in mine. It was one of those perfect moments that I wish I could hold onto forever.";

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
    setTranscript("");
    setDisplayedTranscript("");
    
    // Start timer
    recordingTimerRef.current = window.setInterval(() => {
      setRecordingDuration((prev) => {
        const newDuration = prev + 1;
        
        // Auto-stop at 10 seconds
        if (newDuration >= 10) {
          handleStopRecording();
        }
        
        return newDuration;
      });
    }, 1000);

    // Start transcript simulation after 1 second
    setTimeout(() => {
      setTranscript(mockTranscript);
      setIsTyping(true);
      
      let currentIndex = 0;
      typingIntervalRef.current = window.setInterval(() => {
        if (currentIndex < mockTranscript.length) {
          setDisplayedTranscript(mockTranscript.slice(0, currentIndex + 1));
          currentIndex++;
        } else {
          if (typingIntervalRef.current) {
            clearInterval(typingIntervalRef.current);
            typingIntervalRef.current = null;
          }
          setIsTyping(false);
        }
      }, 50); // Type one character every 50ms
    }, 1000);
  };

  // Handle clicking on transcript to skip animation
  const handleTranscriptClick = () => {
    if (isTyping && transcript) {
      // Stop typing animation
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
      }
      
      // Show full transcript immediately
      setDisplayedTranscript(transcript);
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
    
    // Fade out blobs before navigating
    setShowBlobs(false);
    setTimeout(() => {
      // Navigate to transcript page
      navigate("/record/transcript");
    }, 500);
  };

  // Format duration as MM:SS
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
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

      {/* nijimu text */}
      <a
        href={import.meta.env.BASE_URL}
        onClick={(e) => {
          e.preventDefault();
          navigate("/");
        }}
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          top: 30,
          fontFamily: "'GenRyuMin2 TW', 'Playfair Display', Georgia, serif",
          fontStyle: "normal",
          fontSize: 12,
          lineHeight: 1.5,
          color: "#d7d6d6",
          textTransform: "lowercase",
          whiteSpace: "nowrap",
          margin: 0,
          textDecoration: "none",
          cursor: "pointer",
          zIndex: 100,
        }}
      >
        nijimu
      </a>

      {/* Question text */}
      <p
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          top: 171,
          fontFamily: "'GenRyuMin2 TW', 'Playfair Display', Georgia, serif",
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
              fontFamily: "'GenRyuMin2 TW', 'Playfair Display', Georgia, serif",
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
              fontFamily: "'GenRyuMin2 TW', 'Playfair Display', Georgia, serif",
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
        <p
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            top: 270,
            fontFamily: "'GenRyuMin2 TW', 'Playfair Display', Georgia, serif",
            fontSize: 12,
            letterSpacing: "0px",
            color: "#ebebeb",
            opacity: 0.7,
            whiteSpace: "nowrap",
            margin: 0,
          }}
        >
          recording...({recordingDuration}s)
        </p>
      )}

      {/* Click to record button (pre-recording) or Stop button (during recording) */}
      {!isRecording ? (
        <button
          onClick={handleStartRecording}
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: 80,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: "12px 24px",
            borderRadius: 100,
            border: "none",
            background: "rgba(218, 218, 218, 0.25)",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              fontFamily: "'SF Pro', sans-serif",
              fontSize: 16,
              fontWeight: 300,
              lineHeight: 1.5,
              color: "white",
              textShadow: "0px 4px 100px black",
              textTransform: "lowercase",
            }}
          >
            click to record
          </span>
        </button>
      ) : (
        <button
          onClick={handleStopRecording}
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: 80,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: "12px 24px",
            borderRadius: 100,
            border: "none",
            background: "rgba(218, 218, 218, 0.25)",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
            <path d={svgPathsStop.p220b0800} fill="white" />
          </svg>
          <span
            style={{
              fontFamily: "'SF Pro', sans-serif",
              fontSize: 16,
              fontWeight: 300,
              lineHeight: 1.5,
              color: "white",
              textShadow: "0px 4px 100px black",
              textTransform: "lowercase",
            }}
          >
            stop
          </span>
        </button>
      )}

      {/* Transcript display */}
      <div
        onClick={handleTranscriptClick}
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          bottom: 150,
          maxWidth: "80%",
          textAlign: "center",
          opacity: showBlobs ? 1 : 0,
          transition: "opacity 1.5s ease-in-out, transform 1.5s ease-in-out",
          cursor: isTyping ? "pointer" : "default",
        }}
      >
        <p
          style={{
            fontFamily: "'GenRyuMin2 TW', 'Playfair Display', Georgia, serif",
            fontSize: 12,
            letterSpacing: "0px",
            color: "#ebebeb",
            opacity: 0.7,
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          {displayedTranscript}
        </p>
      </div>
    </div>
  );
}