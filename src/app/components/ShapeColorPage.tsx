import { useLocation, useNavigate } from "react-router";
import { useState, useEffect, useRef } from "react";
import { BackButton } from "./BackButton";
import { SceneViewer, MATERIAL_PRESETS } from "./SceneViewer";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { stripLegacyEvolveFromState } from "../hooks/useOscillatingEvolve";

export function ShapeColorPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [fadeIn, setFadeIn] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [debugMode, setDebugMode] = useState(true);
  const [handDetected, setHandDetected] = useState(false);
  const [debugPalmY, setDebugPalmY] = useState(0);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const targetColorIndexRef = useRef<number>(location.state?.matPresetIndex ?? 0); // Target preset index (0-4)
  const smoothingFrameRef = useRef<number | null>(null);

  // Get camera permission from previous page (BuildObjectPage)
  const cameraPermission = location.state?.cameraPermission ?? "denied";

  // Get state from previous page
  const modelPath = location.state?.modelPath;
  const fluidity = location.state?.fluidity ?? 0;
  const bumpAmount = location.state?.bumpAmount ?? 0;

  // selectedColorIndex is a float for smooth interpolation; snapped to int for display
  const [selectedColorIndex, setSelectedColorIndex] = useState<number>(
    location.state?.matPresetIndex ?? 0
  );

  useEffect(() => {
    setTimeout(() => setFadeIn(true), 100);
    setTimeout(() => setSceneReady(true), 300);
  }, []);

        // Smoothing animation loop for color index - runs independently
  useEffect(() => {
    const smoothingSpeed = 0.05;
    
    const animate = () => {
      setSelectedColorIndex((current) => {
        const target = targetColorIndexRef.current;
        const diff = target - current;
        
        // Snap when close
        if (Math.abs(diff) < 0.1) return Math.round(target);
        
        return current + diff * smoothingSpeed;
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
                    
                    // Calculate palm center from wrist and palm base landmarks
                    // Landmarks: 0 (wrist), 1, 5, 9, 13, 17 (bases of fingers)
                    const palmLandmarks = [
                      landmarks[0],  // wrist
                      landmarks[1],  // thumb base
                      landmarks[5],  // index base
                      landmarks[9],  // middle base
                      landmarks[13], // ring base
                      landmarks[17], // pinky base
                    ];
                    
                    const palmY = palmLandmarks.reduce((sum, lm) => sum + lm.y, 0) / palmLandmarks.length;
                    
                    // Map palm Y position to preset index (0-4)
                    // Lower Y = hand raised higher = warmer (higher index)
                    const minY = 0.5;
                    const maxY = 1.2;
                    const clampedY = Math.max(minY, Math.min(maxY, palmY));
                    const normalizedY = (clampedY - minY) / (maxY - minY);
                    
                    // Invert so raised hand = higher index (warmer)
                    const colorIndex = Math.round((1 - normalizedY) * (MATERIAL_PRESETS.length - 1));
                    
                    targetColorIndexRef.current = colorIndex;
                    setHandDetected(true);
                    setDebugPalmY(palmY);
                  } else {
                    setHandDetected(false);
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
    navigate("/record/shape/texture", {
      state: {
        ...stripLegacyEvolveFromState(location.state),
        modelPath,
        matPresetIndex: Math.round(selectedColorIndex),
        fluidity,
        bumpAmount,
      },
    });
  };

  const currentPresetIndex = Math.min(
    Math.max(0, Math.round(selectedColorIndex)),
    MATERIAL_PRESETS.length - 1,
  );
  const activePreset = MATERIAL_PRESETS[currentPresetIndex];

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
          matPresetIndex={currentPresetIndex}
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
            fontFamily: "'GenRyuMin2 TW', 'Playfair Display', Georgia, serif",
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
            top: 198,
            left: "50%",
            transform: "translateX(-50%)",
            fontFamily: "'GenRyuMin2 TW', 'Playfair Display', Georgia, serif",
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
          warm
        </p>

        {/* Instructions */}
        <div
          style={{
            position: "absolute",
            top: 275,
            left: "50%",
            transform: "translateX(-50%)",
            fontFamily: "'GenRyuMin2 TW', 'Playfair Display', Georgia, serif",
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
          <p style={{ margin: 0 }}>lay your palm flat. </p>
          <p style={{ margin: 0 }}>raise it to bring warmth. </p>
          <p style={{ margin: 0 }}>lower it toward cool. </p>
          <p style={{ margin: 0 }}>let the color find where this memory lives.</p>
        </div>

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
                  marginBottom: 12,
                }}
              >
                <label
                  style={{
                    fontFamily: "'Neue Haas Grotesk Display Pro', 'Neue Montreal', sans-serif",
                    fontSize: 12,
                    color: "#8C8C8C",
                    textTransform: "lowercase",
                  }}
                >
                  warmth
                </label>
                <span
                  style={{
                    fontFamily: "'Neue Haas Grotesk Display Pro', 'Neue Montreal', sans-serif",
                    fontSize: 12,
                    color: "#8C8C8C",
                  }}
                >
                  {activePreset.id}
                </span>
              </div>
              {/* 5 colour swatches */}
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                {MATERIAL_PRESETS.map((preset, index) => (
                  <button
                    key={preset.id}
                    onClick={() => {
                      setSelectedColorIndex(index);
                      targetColorIndexRef.current = index;
                    }}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      border:
                        currentPresetIndex === index
                          ? "2px solid #8C8C8C"
                          : "2px solid transparent",
                      background: `linear-gradient(135deg, ${preset.matColor} 0%, ${preset.matSheenColor} 100%)`,
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      boxShadow:
                        currentPresetIndex === index
                          ? "0 0 0 2px rgba(140,140,140,0.2)"
                          : "0 2px 4px rgba(0,0,0,0.1)",
                      transform:
                        currentPresetIndex === index
                          ? "scale(1.15)"
                          : "scale(1)",
                    }}
                    aria-label={`Select ${preset.id}`}
                  />
                ))}
              </div>
            </div>
            
            {/* Permission text below swatches */}
            <p
              style={{
                position: "absolute",
                bottom: 250,
                left: "50%",
                transform: "translateX(-50%)",
                fontFamily: "'GenRyuMin2 TW', 'Playfair Display', Georgia, serif",
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
                "'Neue Haas Grotesk Display Pro', 'Neue Montreal', sans-serif",
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
              fontFamily: "SF Pro, system-ui, sans-serif",
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
            <p style={{ margin: "5px 0" }}>Hand Detected: {handDetected ? "✓ Yes" : "✗ No"}</p>
            <p style={{ margin: "5px 0" }}>Palm Y: {debugPalmY.toFixed(4)}</p>
            <p style={{ margin: "5px 0" }}>Target Preset: {targetColorIndexRef.current} ({MATERIAL_PRESETS[targetColorIndexRef.current]?.id})</p>
            <p style={{ margin: "5px 0" }}>Current Preset: {currentPresetIndex} ({activePreset.id})</p>
            <p style={{ margin: "5px 0" }}>Color: {activePreset.matColor}</p>
            <p style={{ margin: "5px 0", fontSize: 10, opacity: 0.7 }}>
              MediaPipe: {handLandmarkerRef.current ? "✓ Loaded" : "✗ Not loaded"}
            </p>
          </div>
        )}
      </div>

      {/* Back button */}
      <BackButton />
    </div>
  );
}