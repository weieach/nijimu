import { useLocation, useNavigate } from "react-router";
import { useState, useEffect, useRef } from "react";
import { BackButton } from "./BackButton";
import { SceneViewer } from "./SceneViewer";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { SANS, SANS_UI, SERIF } from "../lib/theme";

export function EditWeightPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [fadeIn, setFadeIn] = useState(false);
  const [fluidity, setFluidity] = useState(location.state?.shape?.fluidity ?? 0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const targetFluidityRef = useRef<number>(location.state?.shape?.fluidity ?? 0);

  const memory = location.state?.memory;
  const shape = location.state?.shape || {};
  const cameraPermission = location.state?.cameraPermission || "prompt";

  console.log("EditWeightPage - memory:", memory);
  console.log("EditWeightPage - shape:", shape);

  useEffect(() => {
    setTimeout(() => setFadeIn(true), 100);
  }, []);

  useEffect(() => {
    if (!memory) {
      console.log("No memory data in EditWeightPage, redirecting");
      navigate("/memory/scroll");
    }
  }, [memory, navigate]);

  // Initialize MediaPipe Hand Landmarker
  useEffect(() => {
    if (cameraPermission !== "granted") return;

    let active = true;

    const initializeHandTracking = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );

        const handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
        });

        if (!active) return;
        handLandmarkerRef.current = handLandmarker;

        // Start camera
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
        });
        if (videoRef.current && active) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Hand tracking initialization error:", err);
      }
    };

    initializeHandTracking();

    return () => {
      active = false;
      if (handLandmarkerRef.current) {
        handLandmarkerRef.current.close();
      }
    };
  }, [cameraPermission]);

  // Hand tracking loop
  useEffect(() => {
    if (!handLandmarkerRef.current || !videoRef.current) return;

    const detectHands = () => {
      if (
        !videoRef.current ||
        !handLandmarkerRef.current ||
        videoRef.current.readyState < 2
      ) {
        animationFrameRef.current = requestAnimationFrame(detectHands);
        return;
      }

      const results = handLandmarkerRef.current.detectForVideo(
        videoRef.current,
        performance.now()
      );

      if (results.landmarks && results.landmarks.length === 2) {
        // Get thumb tips (landmark 4) from both hands
        const hand1Thumb = results.landmarks[0][4];
        const hand2Thumb = results.landmarks[1][4];

        // Calculate Euclidean distance
        const dx = hand1Thumb.x - hand2Thumb.x;
        const dy = hand1Thumb.y - hand2Thumb.y;
        const dz = hand1Thumb.z - hand2Thumb.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Map distance to fluidity (0-1)
        const normalizedDistance = Math.max(0, Math.min(1, distance / 0.5));
        targetFluidityRef.current = normalizedDistance;
      }

      animationFrameRef.current = requestAnimationFrame(detectHands);
    };

    detectHands();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [cameraPermission]);

  // Smooth animation
  useEffect(() => {
    const animate = () => {
      setFluidity((current) => {
        const target = targetFluidityRef.current;
        const diff = target - current;
        if (Math.abs(diff) < 0.0001) return target;
        return current + diff * 0.003;
      });
      requestAnimationFrame(animate);
    };
    const frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  const handleContinue = () => {
    navigate("/memory/edit/color", {
      state: {
        memory,
        shape: { ...shape, fluidity },
        isEditing: true,
        cameraPermission,
      },
    });
  };

  if (!memory) {
    navigate("/profile");
    return null;
  }

  return (
    <div
      className="relative w-full h-screen flex flex-col overflow-hidden"
      style={{ background: "#e0e0e0" }}
    >
      <div
        className="flex flex-col h-full transition-opacity duration-1000"
        style={{ opacity: fadeIn ? 1 : 0 }}
      >
        {/* Header */}
        <p
          style={{
            fontFamily: SERIF,
            fontSize: 28,
            fontWeight: 400,
            lineHeight: "39.2px",
            letterSpacing: "-2px",
            color: "#7b7b87",
            textTransform: "lowercase",
            textAlign: "center",
            marginTop: "clamp(60px, 10vh, 100px)",
            marginBottom: "clamp(40px, 8vh, 80px)",
          }}
        >
          adjust the weight
        </p>

        {/* 3D Shape Viewer */}
        <div className="flex-1 relative flex items-center justify-center">
          <div
            style={{
              width: "clamp(300px, 40vw, 600px)",
              height: "clamp(300px, 40vh, 600px)",
            }}
          >
            <SceneViewer
              modelPath={shape.modelPath}
              fluidity={fluidity}
              evolve={0}
              bumpAmount={shape.bumpAmount ?? 0}
              autoRotate={true}
              ready={true}
              constrainedViewport
              rectAreaLightColors={shape.colors}
              style={{
                width: "100%",
                height: "100%",
                borderRadius: 0,
              }}
            />
          </div>

          {/* Weight value display */}
          <div
            style={{
              position: "absolute",
              bottom: "clamp(40px, 8vh, 80px)",
              left: "50%",
              transform: "translateX(-50%)",
              textAlign: "center",
            }}
          >
            <p
              style={{
                fontFamily: SERIF,
                fontSize: 18,
                color: "#7b7b87",
              }}
            >
              {Math.round(fluidity * 100)}%
            </p>
          </div>
        </div>

        {/* Continue button */}
        <button
          onClick={handleContinue}
          style={{
            position: "fixed",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: "clamp(80px, 12vh, 120px)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: "12px 24px",
            borderRadius: 100,
            border: "none",
            background: "rgba(175, 163, 163, 0.2)",
            cursor: "pointer",
            whiteSpace: "nowrap",
            zIndex: 10,
          }}
        >
          <span
            style={{
              fontFamily:
                SANS,
              fontSize: 16,
              fontWeight: 400,
              lineHeight: 1.5,
              color: "#8C8C8C",
              textTransform: "lowercase",
            }}
          >
            continue
          </span>
          <span
            style={{
              fontFamily: SANS_UI,
              fontSize: 14,
              lineHeight: 0,
              color: "#8C8C8C",
            }}
          >
            ›
          </span>
        </button>
      </div>

      {/* Hidden video for hand tracking */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ display: "none" }}
      />

      <BackButton />
    </div>
  );
}