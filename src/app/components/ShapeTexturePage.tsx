import { useLocation, useNavigate } from "react-router";
import { useState, useEffect, useRef } from "react";
import { BackButton } from "./BackButton";
import { SceneViewer } from "./SceneViewer";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import {
  getShapeBuildEvolvePhase,
  stripLegacyEvolveFromState,
} from "../hooks/useOscillatingEvolve";
import { SANS, SANS_UI, SERIF } from "../lib/theme";

export function ShapeTexturePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [fadeIn, setFadeIn] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [debugMode, setDebugMode] = useState(true);
  const [handsDetected, setHandsDetected] = useState(0);
  const [debugDistance, setDebugDistance] = useState(0);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const targetBumpAmountRef = useRef<number>(location.state?.bumpAmount ?? 0);
  const smoothingFrameRef = useRef<number | null>(null);
  const baselineHandsDistanceRef = useRef<number | null>(null);
  const gestureActiveRef = useRef(false);
  const gestureFramesRef = useRef(0);

  // Get camera permission from previous page (BuildObjectPage)
  const cameraPermission = location.state?.cameraPermission ?? "denied";

  // Get state from previous pages
  const modelPath = location.state?.modelPath;
  const fluidity = location.state?.fluidity ?? 0;
  const matPresetIndex: number = location.state?.matPresetIndex ?? 0;

  const [bumpAmount, setBumpAmount] = useState(0);
  const [density, setDensity] = useState(150);
  const targetDensityRef = useRef<number>(150);

  useEffect(() => {
    setTimeout(() => setFadeIn(true), 100);
    setTimeout(() => setSceneReady(true), 300);
  }, []);

  // Smoothing animation loop - runs independently
  useEffect(() => {
    const smoothingSpeed = 0.04;
    const maxBumpChangePerFrame = 0.002;   // scaled for 0–0.15 range
    const maxDensityChangePerFrame = 8;    // scaled for 150–500 range

    const animate = () => {
      setBumpAmount((current) => {
        const target = Math.min(targetBumpAmountRef.current, 0.15);
        const diff = target - current;
        if (Math.abs(diff) < 0.00005) return target;
        let change = diff * smoothingSpeed;
        change = Math.max(-maxBumpChangePerFrame, Math.min(maxBumpChangePerFrame, change));
        return Math.min(current + change, 0.15);
      });

      setDensity((current) => {
        const target = targetDensityRef.current;
        const diff = target - current;
        if (Math.abs(diff) < 0.1) return target;
        let change = diff * smoothingSpeed;
        change = Math.max(-maxDensityChangePerFrame, Math.min(maxDensityChangePerFrame, change));
        return current + change;
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
              numHands: 2, // Detect both hands
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

                  if (results.landmarks && results.landmarks.length === 2) {
                    // Calculate center of each hand (average of all landmarks)
                    const hand1Landmarks = results.landmarks[0];
                    const hand2Landmarks = results.landmarks[1];
                    
                    const hand1Center = {
                      x: hand1Landmarks.reduce((sum, lm) => sum + lm.x, 0) / hand1Landmarks.length,
                      y: hand1Landmarks.reduce((sum, lm) => sum + lm.y, 0) / hand1Landmarks.length,
                      z: hand1Landmarks.reduce((sum, lm) => sum + lm.z, 0) / hand1Landmarks.length,
                    };
                    
                    const hand2Center = {
                      x: hand2Landmarks.reduce((sum, lm) => sum + lm.x, 0) / hand2Landmarks.length,
                      y: hand2Landmarks.reduce((sum, lm) => sum + lm.y, 0) / hand2Landmarks.length,
                      z: hand2Landmarks.reduce((sum, lm) => sum + lm.z, 0) / hand2Landmarks.length,
                    };
                    
                    // Calculate 3D distance between hand centers
                    const distance = Math.sqrt(
                      Math.pow(hand2Center.x - hand1Center.x, 2) +
                      Math.pow(hand2Center.y - hand1Center.y, 2) +
                      Math.pow(hand2Center.z - hand1Center.z, 2)
                    );

                    // Avoid "non-smooth initial state": don't apply MediaPipe output until
                    // user meaningfully changes pose from the first detected baseline.
                    if (baselineHandsDistanceRef.current == null) {
                      baselineHandsDistanceRef.current = distance;
                      gestureActiveRef.current = false;
                      gestureFramesRef.current = 0;
                    } else {
                      const baseline = baselineHandsDistanceRef.current;
                      const movedEnough = Math.abs(distance - baseline) > 0.03;
                      if (movedEnough) {
                        gestureFramesRef.current += 1;
                        if (gestureFramesRef.current >= 3) gestureActiveRef.current = true;
                      } else {
                        gestureFramesRef.current = 0;
                      }
                    }

                    if (gestureActiveRef.current) {
                      // Map distance to bump amount + density (texture)
                      // Closer hands = smooth surface; far apart = rough texture
                      // Reference ranges: bump 0→0.15, density 150→500
                      // Maximum reached at distance = 0.55
                      const minDistance = 0.15;
                      const maxDistance = 0.55;
                      const clampedDistance = Math.max(minDistance, Math.min(maxDistance, distance));
                      const normalizedValue = (clampedDistance - minDistance) / (maxDistance - minDistance);

                      targetBumpAmountRef.current = normalizedValue * 0.15;
                      targetDensityRef.current = 150 + normalizedValue * 350; // 150 → 500
                    }
                    setHandsDetected(2);
                    setDebugDistance(distance);
                  } else {
                    setHandsDetected(results.landmarks?.length || 0);
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
    navigate("/record/connect", {
      state: {
        ...stripLegacyEvolveFromState(location.state),
        shape: {
          modelPath,
          evolve: getShapeBuildEvolvePhase(),
          bumpAmount,
          fluidity,
        },
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
          density={density}
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
        {/* nijimu text */}
        <a
          href={import.meta.env.BASE_URL}
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
          style={{
            fontFamily: SERIF,
            fontStyle: "normal",
            fontSize: 12,
            lineHeight: 1.5,
            color: "#9b9ba3",
            textTransform: "lowercase",
            whiteSpace: "nowrap",
            marginTop: 30,
            marginRight: 0,
            marginLeft: 0,
            textAlign: "center",
            marginBottom: "clamp(60px, 15vh, 100px)",
            display: "block",
            textDecoration: "none",
            cursor: "pointer",
            zIndex: 10,
          }}
        >
          nijimu
        </a>

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
          distance
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
          <p style={{ margin: 0 }}>bring your hands close, </p>
          <p style={{ margin: 0 }}>or let them drift apart. </p>
          <p style={{ margin: 0 }}>the closer they are, </p>
          <p style={{ margin: 0 }}>the smoother the surface. </p>
          <p style={{ margin: 0 }}>distance is how memory starts to let go.</p>
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
                  texture
                </label>
                <span
                  style={{
                    fontFamily: SANS,
                    fontSize: 12,
                    color: "#8C8C8C",
                  }}
                >
                  {Math.round(bumpAmount * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={bumpAmount}
                onChange={(e) => {
                  const newValue = parseFloat(e.target.value);
                  setBumpAmount(newValue);
                  targetBumpAmountRef.current = newValue;
                }}
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
        <button
          onClick={handleContinue}
          className="transition-opacity duration-500"
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: 40,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: "12px 24px",
            borderRadius: 100,
            border: "none",
            background: "rgba(163, 167, 175, 0.2)",
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
              textShadow: "none",
              textTransform: "lowercase",
            }}
          >
            continue
          </span>
          {/* Arrow icon */}
          <span
            style={{
              fontFamily: SANS_UI,
              fontSize: 14,
              lineHeight: 0,
              color: "#8C8C8C",
              fontVariationSettings: "'wdth' 100",
            }}
          >
            ›
          </span>
        </button>

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
            <p style={{ margin: "5px 0" }}>Hands Detected: {handsDetected}/2</p>
            <p style={{ margin: "5px 0" }}>Distance: {debugDistance.toFixed(4)}</p>
            <p style={{ margin: "5px 0" }}>Target Texture: {targetBumpAmountRef.current.toFixed(3)} / 0.15</p>
            <p style={{ margin: "5px 0" }}>Current Texture: {bumpAmount.toFixed(3)} / 0.15</p>
            <p style={{ margin: "5px 0" }}>Density: {Math.round(density)} / 500</p>
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