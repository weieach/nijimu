import { useLocation, useNavigate } from "react-router";
import { useState, useEffect } from "react";
import { BackButton } from "./BackButton";
import { MODEL_PATHS } from "./SceneViewer";
import {
  resetShapeBuildEvolveAnchor,
  stripLegacyEvolveFromState,
} from "../hooks/useOscillatingEvolve";

export function BuildObjectPage() {
  const location = useLocation();
  const navigate = useNavigate();
  // Fresh random model each time the user starts building a memory
  const [sessionModelPath] = useState(
    () => MODEL_PATHS[Math.floor(Math.random() * MODEL_PATHS.length)],
  );
  const [fadeIn, setFadeIn] = useState(false);
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const [cameraPermission, setCameraPermission] = useState<"pending" | "granted" | "denied">("pending");

  useEffect(() => {
    // Fade in effect
    setTimeout(() => setFadeIn(true), 100);
    // Show permission prompt after initial fade in
    setTimeout(() => setShowPermissionPrompt(true), 1000);
  }, []);

  const handleEnableCamera = async () => {
    try {
      // Request camera permission and immediately stop the stream
      // The permission will persist for subsequent pages
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
      });
      
      // Stop all tracks immediately - we just needed to get permission
      stream.getTracks().forEach(track => track.stop());
      
      setCameraPermission("granted");
      setShowPermissionPrompt(false);
    } catch (error) {
      setCameraPermission("denied");
      setShowPermissionPrompt(false);
    }
  };

  const handleSkipCamera = () => {
    setCameraPermission("denied");
    setShowPermissionPrompt(false);
  };

  const handleContinue = () => {
    resetShapeBuildEvolveAnchor();
    // Pass along all the state from previous pages plus camera permission
    navigate("/record/shape/weight", {
      state: {
        ...stripLegacyEvolveFromState(location.state),
        cameraPermission,
        modelPath: sessionModelPath,
      },
    });
  };

  return (
    <div
      className="relative w-full h-screen flex flex-col overflow-hidden"
      style={{ background: "#e0e0e0" }}
    >
      {/* Content wrapper with fade in */}
      <div
        className="flex flex-col h-full transition-opacity duration-1000"
        style={{ opacity: fadeIn ? 1 : 0 }}
      >
        {/* Top section */}
        <div className="flex-shrink-0" style={{ paddingTop: 0 }}>
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
            }}
          >
            nijimu
          </a>

          {/* Header text */}
          <p
            style={{
              fontFamily: "'GenRyuMin2 TW', 'Playfair Display', Georgia, serif",
              fontSize: 16,
              fontWeight: 500,
              lineHeight: "39.2px",
              letterSpacing: "0px",
              color: "#7b7b87",
              textTransform: "lowercase",
              whiteSpace: "pre-line",
              marginTop: 0,
              marginRight: 0,
              marginLeft: 0,
              textAlign: "center",
              marginBottom: "clamp(60px, 10vh, 278px)",
              paddingLeft: 20,
              paddingRight: 20,
            }}
          >
            now let's build an object to represent{"\n"}how you are feeling
          </p>
        </div>

        {/* Spacer for content area */}
        <div className="flex-1" />

        {/* Continue button - fixed at bottom */}
        <button
          onClick={handleContinue}
          className="transition-opacity duration-500"
          style={{
            position: "fixed",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: "clamp(40px, 8vh, 80px)",
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
              fontFamily: "'Neue Haas Grotesk Display Pro', 'Neue Montreal', sans-serif",
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
      </div>

      {/* Back button */}
      <BackButton />

      {/* Camera permission prompt */}
      {showPermissionPrompt && cameraPermission === "pending" && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 100,
            background: "rgba(255, 255, 255, 0.95)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            padding: "40px 50px",
            borderRadius: 20,
            boxShadow: "0 10px 40px rgba(0, 0, 0, 0.2)",
            textAlign: "center",
            maxWidth: 500,
          }}
        >
          <p
            style={{
              fontFamily: "'GenRyuMin2 TW', 'Playfair Display', Georgia, serif",
              fontSize: 24,
              color: "#7b7b87",
              marginBottom: 20,
              textTransform: "lowercase",
            }}
          >
            enable camera
          </p>
          <p
            style={{
              fontFamily: "'Neue Haas Grotesk Display Pro', 'Neue Montreal', sans-serif",
              fontSize: 16,
              color: "#8C8C8C",
              marginBottom: 30,
              lineHeight: 1.5,
            }}
          >
            allow camera access to control shape editing with hand gestures, or skip to adjust manually
          </p>
          <div style={{ display: "flex", gap: 15, justifyContent: "center" }}>
            <button
              onClick={handleSkipCamera}
              style={{
                fontFamily: "'Neue Haas Grotesk Display Pro', 'Neue Montreal', sans-serif",
                fontSize: 16,
                color: "#8C8C8C",
                background: "rgba(163, 167, 175, 0.2)",
                border: "none",
                padding: "12px 24px",
                borderRadius: 100,
                cursor: "pointer",
                textTransform: "lowercase",
              }}
            >
              skip
            </button>
            <button
              onClick={handleEnableCamera}
              style={{
                fontFamily: "'Neue Haas Grotesk Display Pro', 'Neue Montreal', sans-serif",
                fontSize: 16,
                color: "#ffffff",
                background: "#7b7b87",
                border: "none",
                padding: "12px 30px",
                borderRadius: 100,
                cursor: "pointer",
                textTransform: "lowercase",
              }}
            >
              enable camera
            </button>
          </div>
        </div>
      )}
    </div>
  );
}