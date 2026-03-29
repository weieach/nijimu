import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// Thumb tip = 4, Index finger tip = 8
const THUMB_TIP = 4;
const INDEX_TIP = 8;

const ORB_MIN  = 80;
const ORB_BASE = 200;
const ORB_MAX  = 420;

// Maximum normalised pinch distance → full orb size
const MAX_DIST = 0.38;

// Lerp smoothing (lower = smoother but slower)
const LERP_ALPHA = 0.07;

function generateBorderRadius(): string {
  const v = Array.from({ length: 8 }, () => 34 + Math.random() * 32);
  return `${v[0]}% ${v[1]}% ${v[2]}% ${v[3]}% / ${v[4]}% ${v[5]}% ${v[6]}% ${v[7]}%`;
}

type Status = "loading" | "ready" | "cam-denied" | "error";

// Try to create HandLandmarker — first GPU, then CPU
async function createHandLandmarker(): Promise<HandLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
  );

  const modelAssetPath =
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

  try {
    return await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 2,
    });
  } catch {
    // GPU unavailable (sandboxed env / no WebGL) — fall back to CPU
    return await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath, delegate: "CPU" },
      runningMode: "VIDEO",
      numHands: 2,
    });
  }
}

export function OrbPage() {
  const navigate = useNavigate();
  const videoRef   = useRef<HTMLVideoElement>(null);
  const orbRef     = useRef<HTMLDivElement>(null);
  const glowRef    = useRef<HTMLDivElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const rafRef            = useRef<number>();
  const streamRef         = useRef<MediaStream | null>(null);

  // Smooth size tracking (refs = no re-render on frame)
  const currentSizeRef = useRef(ORB_BASE);
  const targetSizeRef  = useRef(ORB_BASE);
  // Mouse fallback: normalised 0–1 distance
  const mouseDistRef   = useRef(0.5);
  const modeRef        = useRef<"hand" | "mouse">("hand");

  const [borderRadius] = useState(generateBorderRadius);
  const [status, setStatus]   = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  /* ── Grain canvas ── */
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    c.width = 512; c.height = 512;
    const img = ctx.createImageData(512, 512);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 28;
    }
    ctx.putImageData(img, 0, 0);
  }, []);

  /* ── Mouse / touch fallback listener ── */
  useEffect(() => {
    function handlePointerMove(e: PointerEvent) {
      if (modeRef.current !== "mouse") return;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width  / 2;
      const cy = rect.top  + rect.height * 0.44;
      const dx = (e.clientX - cx) / (rect.width  / 2);
      const dy = (e.clientY - cy) / (rect.height / 2);
      const dist = Math.min(Math.sqrt(dx * dx + dy * dy), 1);
      mouseDistRef.current = dist;
    }
    window.addEventListener("pointermove", handlePointerMove);
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, []);

  /* ── Animation loop (runs always, hand or mouse) ── */
  useEffect(() => {
    let alive = true;

    function tick() {
      if (!alive) return;

      if (modeRef.current === "mouse") {
        const t = mouseDistRef.current;
        targetSizeRef.current = ORB_MIN + t * (ORB_MAX - ORB_MIN);
      }

      currentSizeRef.current +=
        (targetSizeRef.current - currentSizeRef.current) * LERP_ALPHA;

      const s  = currentSizeRef.current;
      const gs = s * 1.35;

      if (orbRef.current) {
        orbRef.current.style.width      = `${s}px`;
        orbRef.current.style.height     = `${s}px`;
        orbRef.current.style.marginLeft = `${-s / 2}px`;
        orbRef.current.style.marginTop  = `${-s / 2}px`;
      }
      if (glowRef.current) {
        glowRef.current.style.width      = `${gs}px`;
        glowRef.current.style.height     = `${gs}px`;
        glowRef.current.style.marginLeft = `${-gs / 2}px`;
        glowRef.current.style.marginTop  = `${-gs / 2}px`;
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  /* ── MediaPipe hand-tracking loop ── */
  useEffect(() => {
    let cancelled = false;

    async function init() {
      // 1. Load model
      let handLandmarker: HandLandmarker;
      try {
        handLandmarker = await createHandLandmarker();
      } catch (err) {
        if (cancelled) return;
        console.warn("HandLandmarker failed to load:", err);
        setStatus("error");
        setErrorMsg("Hand tracking model failed to load. Move your pointer to shape the orb instead.");
        modeRef.current = "mouse";
        return;
      }

      if (cancelled) { handLandmarker.close(); return; }
      handLandmarkerRef.current = handLandmarker;

      // 2. Request camera
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 640, height: 480 },
          audio: false,
        });
      } catch (err) {
        if (cancelled) return;
        const isDenied =
          err instanceof DOMException &&
          (err.name === "NotAllowedError" || err.name === "PermissionDeniedError");
        console.warn("Camera access failed:", err);
        modeRef.current = "mouse";
        if (isDenied) {
          setStatus("cam-denied");
        } else {
          setStatus("error");
          setErrorMsg("Camera unavailable. Move your pointer to shape the orb instead.");
        }
        return;
      }

      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;

      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      if (cancelled) return;

      modeRef.current = "hand";
      setStatus("ready");

      // 3. Per-frame detection
      let lastTime = -1;

      function detect() {
        if (cancelled || !handLandmarkerRef.current) return;
        const vid = videoRef.current!;
        const now = performance.now();

        if (vid.readyState >= 2 && now !== lastTime) {
          lastTime = now;
          const result = handLandmarkerRef.current.detectForVideo(vid, now);

          if (result.landmarks?.length) {
            // Use first detected hand only
            const hand  = result.landmarks[0];
            const thumb = hand[THUMB_TIP];
            const index = hand[INDEX_TIP];
            const dx = thumb.x - index.x;
            const dy = thumb.y - index.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const t = Math.min(dist / MAX_DIST, 1);
            targetSizeRef.current = ORB_MIN + t * (ORB_MAX - ORB_MIN);
          } else {
            targetSizeRef.current = ORB_BASE;
          }
        }

        rafRef.current = requestAnimationFrame(detect);
      }

      detect();
    }

    init();

    return () => {
      cancelled = true;
      if (handLandmarkerRef.current) {
        try { handLandmarkerRef.current.close(); } catch (_) {}
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, []);

  /* ── Re-request camera after denial ── */
  const retryCamera = () => {
    setStatus("loading");
    // Re-mount the effect by navigating away and back would be complex;
    // instead just reload the page which re-triggers getUserMedia
    window.location.reload();
  };

  return (
    <div
      ref={containerRef}
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

      {/* Hidden webcam video */}
      <video ref={videoRef} style={{ display: "none" }} muted playsInline />

      {/* Orb outer glow */}
      <div
        ref={glowRef}
        style={{
          position: "absolute",
          left: "50%",
          top: "44%",
          width: ORB_BASE * 1.35,
          height: ORB_BASE * 1.35,
          marginLeft: -(ORB_BASE * 1.35) / 2,
          marginTop:  -(ORB_BASE * 1.35) / 2,
          background:
            "radial-gradient(ellipse at 45% 40%, rgba(94,207,222,0.28), rgba(42,154,170,0.10), transparent 70%)",
          borderRadius: "50%",
          filter: "blur(28px)",
          animation: "orbGlowPulse 5s ease-in-out infinite",
          pointerEvents: "none",
          zIndex: 3,
        }}
      />

      {/* Main orb */}
      <div
        ref={orbRef}
        style={{
          position: "absolute",
          left: "50%",
          top: "44%",
          width: ORB_BASE,
          height: ORB_BASE,
          marginLeft: -ORB_BASE / 2,
          marginTop:  -ORB_BASE / 2,
          background:
            "radial-gradient(ellipse at 38% 34%, #8adfe9, #3bb8c4 45%, #2a8fa0 75%, #1d6e80)",
          borderRadius,
          opacity: 0.9,
          filter: "blur(14px)",
          animation: "orbMorph 14s ease-in-out infinite",
          zIndex: 4,
        }}
      />

      {/* Status hint */}
      <div
        style={{
          position: "absolute",
          bottom: 160,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
          textAlign: "center",
          width: "80%",
          maxWidth: 340,
        }}
      >
        {status === "loading" && (
          <p
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: "italic",
              color: "#515151",
              fontSize: 15,
              opacity: 0.6,
              margin: 0,
              animation: "hintFade 2s ease-in-out infinite",
            }}
          >
            loading hand tracking...
          </p>
        )}

        {status === "ready" && (
          <p
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: "italic",
              color: "#515151",
              fontSize: 15,
              opacity: 0.55,
              margin: 0,
            }}
          >
            pinch &amp; open your fingers to shape the memory
          </p>
        )}

        {status === "cam-denied" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <p
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontStyle: "italic",
                color: "#515151",
                fontSize: 15,
                opacity: 0.7,
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              camera access denied — move your pointer to shape the orb instead
            </p>
            <button
              onClick={retryCamera}
              style={{
                background: "transparent",
                border: "1px solid #999",
                borderRadius: 20,
                padding: "6px 18px",
                cursor: "pointer",
                fontFamily: "Georgia, serif",
                color: "#515151",
                fontSize: 13,
                opacity: 0.7,
              }}
            >
              grant camera access
            </button>
          </div>
        )}

        {status === "error" && (
          <p
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: "italic",
              color: "#515151",
              fontSize: 15,
              opacity: 0.65,
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {errorMsg}
          </p>
        )}
      </div>

      {/* Bottom frosted gradient */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 222,
          background:
            "linear-gradient(to top, rgba(255,255,255,0.42), rgba(255,255,255,0))",
          backdropFilter: "blur(40px)",
          WebkitBackdropFilter: "blur(40px)",
          zIndex: 5,
        }}
      />

      {/* Save button */}
      <button
        onClick={() => navigate("/")}
        style={{
          position: "absolute",
          bottom: 40,
          left: "50%",
          transform: "translateX(-50%)",
          width: 359,
          maxWidth: "calc(100% - 40px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px 40px",
          borderRadius: 100,
          border: "1px solid #616161",
          background: "transparent",
          cursor: "pointer",
          zIndex: 10,
        }}
      >
        <span
          style={{
            fontFamily: "Georgia, serif",
            color: "#616161",
            fontSize: 24,
            letterSpacing: "0.48px",
            lineHeight: 1.5,
            whiteSpace: "nowrap",
          }}
        >
          Save memory
        </span>
      </button>

      {/* Grain */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{
          opacity: 0.38,
          mixBlendMode: "overlay",
          imageRendering: "pixelated",
          zIndex: 6,
        }}
      />

      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 38%, rgba(0,0,0,0.09) 100%)",
          zIndex: 7,
        }}
      />

      <style>{`
        @keyframes orbMorph {
          0%,  100% { border-radius: 42% 58% 53% 47% / 52% 42% 58% 48%; }
          20%        { border-radius: 58% 42% 46% 54% / 44% 62% 38% 56%; }
          40%        { border-radius: 47% 53% 62% 38% / 58% 47% 53% 42%; }
          60%        { border-radius: 55% 45% 38% 62% / 40% 56% 44% 60%; }
          80%        { border-radius: 38% 62% 55% 45% / 62% 38% 62% 38%; }
        }
        @keyframes orbGlowPulse {
          0%,  100% { opacity: 0.7; }
          50%        { opacity: 1;   }
        }
        @keyframes hintFade {
          0%,  100% { opacity: 0.3; }
          50%        { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
