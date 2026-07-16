import { useLocation, useNavigate } from "react-router";
import { useState, useEffect, useRef } from "react";
import { BackButton } from "./BackButton";
import { SceneViewer } from "./SceneViewer";
import { landmarkDistance, useHandTracking } from "../hooks/useHandTracking";
import { SANS, SANS_UI, SERIF } from "../lib/theme";
import { PillButton } from "./PillButton";

export function EditWeightPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [fadeIn, setFadeIn] = useState(false);
  const [fluidity, setFluidity] = useState(location.state?.shape?.fluidity ?? 0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const targetFluidityRef = useRef<number>(location.state?.shape?.fluidity ?? 0);

  const memory = location.state?.memory;
  const shape = location.state?.shape || {};
  const cameraPermission = location.state?.cameraPermission || "prompt";

  useEffect(() => {
    setTimeout(() => setFadeIn(true), 100);
  }, []);

  useEffect(() => {
    if (!memory) {
      navigate("/memory/scroll");
    }
  }, [memory, navigate]);

  // Distance between the two thumb tips drives weight.
  useHandTracking({
    enabled: cameraPermission === "granted",
    videoRef,
    numHands: 2,
    onLandmarks: (hands) => {
      if (hands.length !== 2) return;
      const distance = landmarkDistance(hands[0][4], hands[1][4]);
      targetFluidityRef.current = Math.max(0, Math.min(1, distance / 0.5));
    },
  });

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
        <PillButton
          label="continue"
          onClick={handleContinue}
          trailing="›"
          style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: "clamp(80px, 12vh, 120px)", zIndex: 10 }}
        />
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