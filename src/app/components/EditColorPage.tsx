import { useLocation, useNavigate } from "react-router";
import { useState, useEffect } from "react";
import { BackButton } from "./BackButton";
import { SceneViewer } from "./SceneViewer";
import { SANS, SANS_UI, SERIF } from "../lib/theme";
import { COLOR_PALETTE } from "../lib/colors";


export function EditColorPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [fadeIn, setFadeIn] = useState(false);
  const [colorIndex, setColorIndex] = useState(0);

  const memory = location.state?.memory;
  const shape = location.state?.shape || {};

  console.log("EditColorPage - memory:", memory);
  console.log("EditColorPage - shape:", shape);

  useEffect(() => {
    setTimeout(() => setFadeIn(true), 100);
  }, []);

  useEffect(() => {
    if (!memory) {
      console.log("No memory data in EditColorPage, redirecting");
      navigate("/memory/scroll");
    }
  }, [memory, navigate]);

  const handleHandsUpdate = (distance: number) => {
    const index = Math.floor(distance * COLOR_PALETTE.length);
    setColorIndex(Math.min(index, COLOR_PALETTE.length - 1));
  };

  const handleContinue = () => {
    const selectedColor = COLOR_PALETTE[colorIndex];
    navigate("/memory/edit/texture", {
      state: {
        memory,
        shape: {
          ...shape,
          colors: {
            color1: selectedColor.light1,
            color2: selectedColor.light2,
            matColor: selectedColor.color,
          },
        },
        isEditing: true,
      },
    });
  };

  if (!memory) {
    navigate("/profile");
    return null;
  }

  const selectedColor = COLOR_PALETTE[colorIndex];

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
          adjust the color
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
              fluidity={shape.fluidity ?? 0}
              evolve={0.4}
              bumpAmount={shape.bumpAmount ?? 0}
              autoRotate={true}
              ready={true}
              constrainedViewport
              rectAreaLightColors={{
                color1: selectedColor.light1,
                color2: selectedColor.light2,
                matColor: selectedColor.color,
              }}
              style={{
                width: "100%",
                height: "100%",
                borderRadius: 0,
              }}
            />
          </div>

          {/* Color name display */}
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
                textTransform: "lowercase",
              }}
            >
              {selectedColor.id}
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

      <BackButton />
    </div>
  );
}