import { useLocation, useNavigate } from "react-router";
import { useState, useEffect } from "react";
import { BackButton } from "./BackButton";
import { SceneViewer } from "./SceneViewer";
import svgPaths from "../../imports/svg-f02d7wi360";

export function RevisitMemoryPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [fadeIn, setFadeIn] = useState(false);

  // Get memory data from location state
  const memory = location.state?.memory;
  const shape = location.state?.shape;

  console.log("RevisitMemoryPage - memory:", memory);
  console.log("RevisitMemoryPage - shape:", shape);

  useEffect(() => {
    setTimeout(() => setFadeIn(true), 100);
  }, []);

  useEffect(() => {
    if (!memory || !shape) {
      console.log("No memory or shape data, redirecting to profile");
      navigate("/memory/scroll");
    }
  }, [memory, shape, navigate]);

  const handleContinue = () => {
    console.log("Continue clicked - navigating to edit weight");
    // Navigate to weight page to start editing the shape
    navigate("/memory/edit/weight", {
      state: {
        memory,
        shape,
        isEditing: true,
      },
    });
  };

  if (!memory || !shape) {
    // If no memory data, show loading or redirect
    return null;
  }

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
        {/* Header text */}
        <p
          style={{
            fontFamily: "'GenRyuMin2 TW', 'Playfair Display', Georgia, serif",
            fontSize: 28,
            fontWeight: 400,
            lineHeight: "39.2px",
            letterSpacing: "-2px",
            color: "#7b7b87",
            textTransform: "lowercase",
            whiteSpace: "nowrap",
            textAlign: "center",
            marginTop: "clamp(180px, 23vh, 231px)",
            marginBottom: "clamp(40px, 8vh, 80px)",
          }}
        >
          how does it feel today?
        </p>

        {/* 3D Shape Viewer - centered */}
        <div
          className="relative flex items-center justify-center"
          style={{
            flexGrow: 1,
            maxHeight: "clamp(300px, 40vh, 451px)",
          }}
        >
          <div
            style={{
              width: "clamp(320px, 35vw, 431px)",
              height: "clamp(320px, 35vh, 451px)",
              position: "relative",
            }}
          >
            <SceneViewer
              modelPath={shape.modelPath}
              fluidity={shape.fluidity}
              evolve={shape.evolve}
              bumpAmount={shape.bumpAmount}
              autoRotate={true}
              ready={true}
              constrainedViewport
              rectAreaLightColors={shape.colors}
              style={{
                width: "100%",
                height: "100%",
                borderRadius: 14,
                border: "0.5px solid #bcbcbc",
              }}
            />
          </div>
        </div>

        {/* Memory title and year */}
        <div
          style={{
            textAlign: "center",
            marginTop: "clamp(40px, 8vh, 80px)",
            marginBottom: "clamp(30px, 6vh, 60px)",
          }}
        >
          <p
            style={{
              fontFamily: "'GenRyuMin2 TW', 'Playfair Display', Georgia, serif",
              fontSize: 28,
              fontWeight: 400,
              lineHeight: "39.2px",
              letterSpacing: "-2px",
              color: "#7b7b87",
              textTransform: "lowercase",
              whiteSpace: "pre-line",
              marginBottom: 2,
            }}
          >
            {memory.event}
          </p>
          <p
            style={{
              fontFamily: "'GenRyuMin2 TW', 'Playfair Display', Georgia, serif",
              fontSize: 16,
              fontWeight: 400,
              lineHeight: "39.2px",
              color: "#7b7b87",
              textTransform: "lowercase",
            }}
          >
            {memory.year}
          </p>
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
            gap: 19,
            padding: "15px 30px",
            borderRadius: 100,
            border: "none",
            background: "rgba(163, 167, 175, 0.2)",
            cursor: "pointer",
            whiteSpace: "nowrap",
            zIndex: 10,
          }}
        >
          <div className="relative shrink-0 size-[18.75px]">
            <svg
              className="absolute block size-full"
              fill="none"
              preserveAspectRatio="none"
              viewBox="0 0 18.75 18.75"
            >
              <path d={svgPaths.p12d5cb00} fill="white" />
            </svg>
          </div>
          <span
            style={{
              fontFamily:
                "'Neue Haas Grotesk Display Pro', 'Neue Montreal', sans-serif",
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
      </div>

      {/* Back button */}
      <BackButton />
    </div>
  );
}