import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import svgPaths from "../../imports/svg-ck7nn3w4ht";

// ⚠️ SECURITY: This key is exposed in the browser. Use a backend proxy in production.
const ELEVEN_LABS_API_KEY = "sk_85f506ae01bae9ab1a8d844c8952aa9f150813c0e433a586";
const ELEVEN_LABS_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text";

function generateBorderRadius(): string {
  const v = Array.from({ length: 8 }, () => 35 + Math.random() * 30);
  return `${v[0]}% ${v[1]}% ${v[2]}% ${v[3]}% / ${v[4]}% ${v[5]}% ${v[6]}% ${v[7]}%`;
}

export function RecordingProcessPage() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const [borderRadius] = useState(generateBorderRadius);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  /* start mic + MediaRecorder */
  useEffect(() => {
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        // Prefer webm/opus, fall back to whatever the browser supports
        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : MediaRecorder.isTypeSupported("audio/mp4")
              ? "audio/mp4"
              : "";

        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        recorder.onstart = () => {
          setIsRecording(true);
        };

        recorder.onerror = () => {
          setMicError("Recording error. Please reload and try again.");
          setIsRecording(false);
        };

        // Start recording — collect data every second for reliability
        recorder.start(1000);
      })
      .catch((err) => {
        console.warn("getUserMedia failed:", err);
        if (!cancelled) {
          setMicError("Microphone access was denied. Please allow mic access and reload.");
        }
      });

    return () => {
      cancelled = true;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try { mediaRecorderRef.current.stop(); } catch (_) {}
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  /* timer */
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsed((p) => p + 1);
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  /* grain */
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    c.width = 512;
    c.height = 512;
    const img = ctx.createImageData(512, 512);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 30;
    }
    ctx.putImageData(img, 0, 0);
  }, []);

  const handleStop = async () => {
    clearInterval(timerRef.current);
    setIsRecording(false);
    setIsTranscribing(true);

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      // No recording data — go to transcript with empty
      navigate("/record/transcript", { state: { transcript: "" } });
      return;
    }

    // Wait for the recorder to fully stop and flush remaining data
    const audioBlob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        resolve(blob);
      };
      recorder.stop();
    });

    // Stop all mic tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }

    // If audio is essentially empty (< 1KB), skip API call
    if (audioBlob.size < 1000) {
      navigate("/record/transcript", { state: { transcript: "" } });
      return;
    }

    // Determine file extension from mime type
    const ext = audioBlob.type.includes("mp4") ? "mp4" : "webm";

    // Send to ElevenLabs Scribe STT API
    try {
      const formData = new FormData();
      formData.append("file", audioBlob, `recording.${ext}`);
      formData.append("model_id", "scribe_v1");

      const response = await fetch(ELEVEN_LABS_STT_URL, {
        method: "POST",
        headers: {
          "xi-api-key": ELEVEN_LABS_API_KEY,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("ElevenLabs STT error:", response.status, errorText);
        setIsTranscribing(false);
        setMicError(`Transcription failed (${response.status}). Please try again.`);
        return;
      }

      const data = await response.json();
      const transcript = data.text || "";
      navigate("/record/transcript", { state: { transcript } });
    } catch (err) {
      console.error("ElevenLabs STT network error:", err);
      setIsTranscribing(false);
      setMicError("Network error during transcription. Please check your connection and try again.");
    }
  };

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`;

  return (
    <div
      className="relative w-full h-screen overflow-hidden select-none"
      style={{ background: "#ededee" }}
    >
      {/* Title */}
      <p
        style={{
          position: "absolute",
          left: 21,
          top: 20,
          fontFamily: "Georgia, serif",
          fontStyle: "italic",
          color: "#090606",
          fontSize: 30,
          letterSpacing: "0.6px",
          lineHeight: 1.5,
          margin: 0,
          zIndex: 10,
        }}
      >
        memento
      </p>

      {/* Single centered blob */}
      <div
        className="absolute"
        style={{
          left: "50%",
          top: "40%",
          width: 260,
          height: 260,
          transform: "translate(-50%, -50%)",
          background: isTranscribing
            ? "radial-gradient(ellipse at 50% 50%, #c49a3b, #aa8a2a)"
            : "radial-gradient(ellipse at 50% 50%, #3bb8c4, #2a9aaa)",
          borderRadius,
          opacity: 0.85,
          filter: "blur(12px)",
          animation: isTranscribing
            ? "blobRecordMorph 15s ease-in-out infinite, blobTranscribePulse 1.5s ease-in-out infinite"
            : "blobRecordMorph 15s ease-in-out infinite, blobRecordBreathe 4s ease-in-out infinite",
        }}
      />

      {/* Transcribing overlay */}
      {isTranscribing && (
        <div
          className="absolute"
          style={{
            left: "50%",
            top: "55%",
            transform: "translateX(-50%)",
            zIndex: 15,
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: "italic",
              color: "#515151",
              fontSize: 18,
              margin: 0,
              animation: "fadeInOut 2s ease-in-out infinite",
            }}
          >
            transcribing your memory...
          </p>
        </div>
      )}

      {/* Bottom blur gradient */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 222,
          borderRadius: 8,
          background:
            "linear-gradient(to top, rgba(255,255,255,0.4), rgba(255,255,255,0))",
          backdropFilter: "blur(40px)",
          WebkitBackdropFilter: "blur(40px)",
          zIndex: 5,
        }}
      />

      {/* Stop button — hidden while transcribing */}
      {!isTranscribing && (
        <button
          onClick={handleStop}
          className="absolute"
          style={{
            bottom: 100,
            left: "50%",
            transform: "translateX(-50%)",
            width: 99,
            height: 75,
            borderRadius: 37.5,
            background: "rgba(188, 188, 188, 0.3)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
          }}
        >
          <svg width="99" height="75" viewBox="0 0 99 75" fill="none">
            <path d={svgPaths.p2687d400} fill="white" />
          </svg>
        </button>
      )}

      {/* Timer */}
      {!isTranscribing && (
        <p
          className="absolute"
          style={{
            bottom: 80,
            left: 23,
            fontFamily: "Georgia, serif",
            color: "#515151",
            fontSize: 14,
            zIndex: 10,
            margin: 0,
            opacity: 0.7,
          }}
        >
          {timeStr}
        </p>
      )}

      {/* Recording status / error */}
      {micError ? (
        <div
          className="absolute"
          style={{
            bottom: 70,
            left: 16,
            right: 16,
            display: "flex",
            alignItems: "flex-start",
            gap: 6,
            zIndex: 10,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#e05050",
              flexShrink: 0,
              marginTop: 3,
            }}
          />
          <span
            style={{
              fontFamily: "Georgia, serif",
              color: "#e05050",
              fontSize: 12,
              lineHeight: 1.4,
            }}
          >
            {micError}
          </span>
        </div>
      ) : !isTranscribing ? (
        <div
          className="absolute"
          style={{
            bottom: 85,
            right: 23,
            display: "flex",
            alignItems: "center",
            gap: 6,
            zIndex: 10,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: isRecording ? "#e05050" : "#ccc",
              animation: isRecording ? "pulseDot 1.5s ease-in-out infinite" : "none",
            }}
          />
          <span
            style={{
              fontFamily: "Georgia, serif",
              color: "#515151",
              fontSize: 12,
              opacity: 0.7,
            }}
          >
            {isRecording ? "recording..." : "starting mic..."}
          </span>
        </div>
      ) : null}

      {/* "creating new memory" label */}
      {!isTranscribing && (
        <p
          className="absolute"
          style={{
            bottom: 62,
            left: "50%",
            transform: "translateX(-50%)",
            fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
            color: "#515151",
            fontSize: 14,
            letterSpacing: "-0.154px",
            opacity: 0.5,
            textAlign: "center",
            whiteSpace: "nowrap",
            zIndex: 10,
            margin: 0,
          }}
        >
          creating new memory
        </p>
      )}

      {/* Grain */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none opacity-40"
        style={{ mixBlendMode: "overlay", imageRendering: "pixelated" }}
      />

      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.08) 100%)",
        }}
      />

      <style>{`
        @keyframes blobRecordMorph {
          0%, 100% { border-radius: 40% 60% 55% 45% / 55% 40% 60% 45%; }
          25% { border-radius: 55% 45% 40% 60% / 45% 60% 40% 55%; }
          50% { border-radius: 45% 55% 60% 40% / 60% 45% 55% 40%; }
          75% { border-radius: 60% 40% 45% 55% / 40% 55% 45% 60%; }
        }
        @keyframes blobRecordBreathe {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.08); }
        }
        @keyframes blobTranscribePulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.85; }
          50% { transform: translate(-50%, -50%) scale(0.95); opacity: 0.6; }
        }
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
        @keyframes fadeInOut {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}