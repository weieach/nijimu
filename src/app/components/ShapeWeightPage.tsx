import { useLocation, useNavigate } from "react-router";
import { useState, useEffect, useRef } from "react";
import { BackButton } from "./BackButton";
import { SceneViewer, MODEL_PATHS } from "./SceneViewer";
import {
  getShapeBuildEvolvePhase,
  stripLegacyEvolveFromState,
} from "../hooks/useOscillatingEvolve";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { SANS, SANS_UI, SERIF } from "../lib/theme";
import { PageHeader } from "./PageHeader";
import { PillButton } from "./PillButton";

export function ShapeWeightPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [fadeIn, setFadeIn] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [debugMode, setDebugMode] = useState(true);
  const [handsDetected, setHandsDetected] = useState(0);
  const [debugPinchDistance, setDebugPinchDistance] = useState(0);
  const [debugEvolvePhase, setDebugEvolvePhase] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const targetFluidityRef = useRef<number>(location.state?.fluidity ?? 0);
  const smoothingFrameRef = useRef<number | null>(null);
  const baselinePinchDistanceRef = useRef<number | null>(null);
  const gestureActiveRef = useRef(false);
  const gestureFramesRef = useRef(0);

  // Get camera permission from previous page (BuildObjectPage)
  const cameraPermission = location.state?.cameraPermission ?? "denied";

  // Get state from previous pages
  const modelPath = location.state?.modelPath;
  const matPresetIndex: number = location.state?.matPresetIndex ?? 0;
  const [fluidity, setFluidity] = useState(location.state?.fluidity ?? 0);
  const bumpAmount = location.state?.bumpAmount ?? 0;

  useEffect(() => {
    setTimeout(() => setFadeIn(true), 100);
    setTimeout(() => setSceneReady(true), 300);
  }, []);

  useEffect(() => {
    if (!debugMode) return;
    const id = window.setInterval(() => {
      setDebugEvolvePhase(getShapeBuildEvolvePhase());
    }, 150);
    return () => clearInterval(id);
  }, [debugMode]);

  // Smoothing animation loop - runs independently
  useEffect(() => {
    const smoothingSpeed = 0.003; // Much slower transition (takes ~10 seconds to reach target)
    const maxChangePerFrame = 0.002; // Limit how fast the value can change per frame to prevent sudden acceleration
    
    const animate = () => {
      setFluidity((current) => {
        const target = targetFluidityRef.current;
        const diff = target - current;
        
        // If very close to target, snap to it
        if (Math.abs(diff) < 0.0001) {
          return target;
        }
        
        // Calculate desired change with smoothing
        let desiredChange = diff * smoothingSpeed;
        
        // Clamp the change to prevent sudden acceleration
        desiredChange = Math.max(-maxChangePerFrame, Math.min(maxChangePerFrame, desiredChange));
        
        // Gradually move towards target
        return current + desiredChange;
      });
      
      smoothingFrameRef.current = requestAnimationFrame(animate);
    };
    
    animate();
    
    return () => {
      if (smoothingFrameRef.current) {
        cancelAnimationFrame(smoothingFrameRef.current);
      }
    };
  }, []);

  // Initialize MediaPipe Hand Landmarker
  useEffect(() => {
    // Auto-start camera if permission was already granted
    if (cameraPermission === "granted") {
      initializeCamera();
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
      if (handLandmarkerRef.current) {
        handLandmarkerRef.current.close();
      }
    };
  }, [cameraPermission]);

  const initializeCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        const onVideoReady = async () => {
          try {
            const vision = await FilesetResolver.forVisionTasks(
              "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm"
            );

            const handLandmarker = await HandLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                delegate: "GPU",
              },
              numHands: 1,
              runningMode: "VIDEO",
              minHandDetectionConfidence: 0.5,
              minHandPresenceConfidence: 0.5,
              minTrackingConfidence: 0.5,
            });

            handLandmarkerRef.current = handLandmarker;
            
            // Start detection loop
            const detectHands = () => {
              if (!videoRef.current || !handLandmarkerRef.current) return;

              const video = videoRef.current;
              if (video.readyState === video.HAVE_ENOUGH_DATA) {
                try {
                  const results = handLandmarkerRef.current.detectForVideo(
                    video,
                    performance.now()
                  );

                  if (results.landmarks && results.landmarks.length > 0) {
                    const landmarks = results.landmarks[0];
                    const indexTip = landmarks[8];
                    const thumbTip = landmarks[4];

                    const distance = Math.sqrt(
                      Math.pow(indexTip.x - thumbTip.x, 2) +
                      Math.pow(indexTip.y - thumbTip.y, 2) +
                      Math.pow(indexTip.z - thumbTip.z, 2)
                    );

                    // Avoid "non-smooth initial state": don't apply MediaPipe output until
                    // user meaningfully changes pose from the first detected baseline.
                    if (baselinePinchDistanceRef.current == null) {
                      baselinePinchDistanceRef.current = distance;
                      gestureActiveRef.current = false;
                      gestureFramesRef.current = 0;
                    } else {
                      const baseline = baselinePinchDistanceRef.current;
                      const movedEnough = Math.abs(distance - baseline) > 0.02;
                      if (movedEnough) {
                        gestureFramesRef.current += 1;
                        if (gestureFramesRef.current >= 3) gestureActiveRef.current = true;
                      } else {
                        gestureFramesRef.current = 0;
                      }
                    }

                    if (gestureActiveRef.current) {
                      // Map distance 0.05 (minimum weight) to 0.5 (maximum weight)
                      const minDistance = 0.05;
                      const maxDistance = 0.5;
                      const clampedDistance = Math.max(minDistance, Math.min(maxDistance, distance));
                      const normalizedValue = (clampedDistance - minDistance) / (maxDistance - minDistance);
                      const newFluidity = normalizedValue; // Direct mapping: closer = lower weight
                      targetFluidityRef.current = newFluidity;
                    }
                    setHandsDetected(1);
                    setDebugPinchDistance(distance);
                  } else {
                    setHandsDetected(0);
                  }
                } catch (error) {
                  // Silently handle detection errors
                }
              }

              animationFrameRef.current = requestAnimationFrame(detectHands);
            };

            detectHands();
          } catch (error) {
            // Fall back to manual mode if MediaPipe initialization fails
            console.error("MediaPipe initialization failed:", error);
          }
        };
        
        videoRef.current.addEventListener("loadeddata", onVideoReady, { once: true });
      }
    } catch (error) {
      // Camera initialization failed
      console.error("Camera initialization failed:", error);
    }
  };

  const handleContinue = () => {
    navigate("/record/shape/color", {
      state: {
        ...stripLegacyEvolveFromState(location.state),
        fluidity,
      },
    });
  };

  return (
    <div
      className="relative w-full h-screen flex flex-col overflow-hidden"
      style={{ background: "#e0e0e0" }}
    >
      {/* Video element for MediaPipe - visible in debug mode */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ 
          display: debugMode && cameraPermission === "granted" ? "block" : "none",
          position: "absolute",
          bottom: 10,
          right: 10,
          width: 200,
          height: 150,
          border: "2px solid #fff",
          borderRadius: 10,
          zIndex: 1000,
        }}
      />

      {/* Full-screen 3D Scene */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 1,
          pointerEvents: "none",
        }}
      >
        <SceneViewer
          shapeBuildOscillatingEvolve
          bumpAmount={bumpAmount}
          bumpSpike={0}
          density={200}
          canvasBlurPx={3}
          matOpacity={0.4}
          fluidity={fluidity}
          ready={sceneReady}
          matPresetIndex={matPresetIndex}
          modelPath={modelPath}
        />
      </div>

      {/* Content wrapper with fade in */}
      <div
        className="flex flex-col h-full transition-opacity duration-1000"
        style={{ opacity: fadeIn ? 1 : 0, position: "relative", zIndex: 2 }}
      >
        {/* nijimu wordmark */}
      <PageHeader layout="block" />

        {/* Title */}
        <p
          style={{
            position: "absolute",
            top: 118,
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
          weight
        </p>

        {/* Instructions */}
        <div
          style={{
            position: "absolute",
            top: 195,
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
          <p style={{ margin: 0 }}>pinch your fingers together. </p>
          <p style={{ margin: 0 }}>the tighter you hold, </p>
          <p style={{ margin: 0 }}>the heavier it becomes. </p>
          <p style={{ margin: 0 }}>some things still need to be held.</p>
        </div>

        {/* Fallback slider for denied/skipped camera - above continue button */}
        {cameraPermission === "denied" && (
          <>
            <div
              style={{
                position: "absolute",
                bottom: 160,
                left: "50%",
                transform: "translateX(-50%)",
                width: "90%",
                maxWidth: 400,
                zIndex: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <label
                  style={{
                    fontFamily: SANS,
                    fontSize: 12,
                    color: "#8C8C8C",
                    textTransform: "lowercase",
                  }}
                >
                  weight
                </label>
                <span
                  style={{
                    fontFamily: SANS,
                    fontSize: 12,
                    color: "#8C8C8C",
                  }}
                >
                  {Math.round(fluidity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={fluidity}
                onChange={(e) => setFluidity(parseFloat(e.target.value))}
                style={{
                  width: "100%",
                  height: 2,
                  background: "rgba(139, 139, 139, 0.3)",
                  outline: "none",
                  WebkitAppearance: "none",
                }}
              />
            </div>
            
            {/* Permission text below slider */}
            <p
              style={{
                position: "absolute",
                bottom: 250,
                left: "50%",
                transform: "translateX(-50%)",
                fontFamily: SERIF,
                fontSize: 15,
                lineHeight: 1,
                color: "rgba(42, 32, 24, 0.6)",
                textAlign: "center",
                whiteSpace: "nowrap",
                zIndex: 10,
              }}
            >
              (grant camera permission to access gesture control. )
            </p>
          </>
        )}

        {/* Continue button - positioned from Figma */}
        <PillButton
          label="continue"
          onClick={handleContinue}
          trailing="›"
          className="transition-opacity duration-500"
          style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: 40, zIndex: 10 }}
        />

        {/* Debug information */}
        {debugMode && (
          <div
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              background: "rgba(0, 0, 0, 0.7)",
              color: "#fff",
              padding: "10px",
              borderRadius: 5,
              zIndex: 1000,
              fontFamily: "monospace",
              fontSize: 12,
            }}
          >
            <p style={{ margin: "5px 0" }}>Camera: {cameraPermission}</p>
            <p style={{ margin: "5px 0" }}>Hands Detected: {handsDetected}</p>
            <p style={{ margin: "5px 0" }}>Pinch Distance: {debugPinchDistance.toFixed(4)}</p>
            <p style={{ margin: "5px 0" }}>Target Weight: {(targetFluidityRef.current * 100).toFixed(1)}%</p>
            <p style={{ margin: "5px 0" }}>Current Weight: {(fluidity * 100).toFixed(1)}%</p>
            <p style={{ margin: "5px 0" }}>
              Evolve (0–100%, 10s cycle): {(debugEvolvePhase * 100).toFixed(0)}%
            </p>
            <p style={{ margin: "5px 0", fontSize: 10, opacity: 0.7 }}>
              MediaPipe: {handLandmarkerRef.current ? "✓ Loaded" : "✗ Not loaded"}
            </p>
          </div>
        )}
      </div>

      {/* Back button */}
      <BackButton />

      {/* Slider styles */}
      <style>{`
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #8C8C8C;
          cursor: pointer;
        }
        input[type="range"]::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #8C8C8C;
          cursor: pointer;
          border: none;
        }
      `}</style>
    </div>
  );
}