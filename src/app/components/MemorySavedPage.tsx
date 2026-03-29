import { useLocation, useNavigate } from "react-router";
import { useState, useEffect } from "react";

export function MemorySavedPage() {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Extract memoryName, year, and isEditing from location state
  const state = location.state as { memoryName?: string; year?: string; isEditing?: boolean } | null;
  const memoryName = state?.memoryName || "";
  const year = state?.year || "";
  const isEditing = state?.isEditing || false;
  
  const [fadeIn, setFadeIn] = useState(false);
  const [showText, setShowText] = useState(false);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    // Orchestrate the reveal animation - more subtle fades
    setTimeout(() => setFadeIn(true), 100);
    setTimeout(() => setShowText(true), 800);
    setTimeout(() => setShowButton(true), 1600);
    
    // Debug log
    console.log("MemorySavedPage received state:", { memoryName, year, isEditing, fullState: state });
  }, []);

  const displayName = memoryName || "your memory";
  const displayYear = year || "the archive";

  return (
    <div
      className="relative w-full h-screen overflow-hidden"
      style={{ 
        background: "#e0e0e0",
      }}
    >
      {/* Content wrapper with fade in */}
      <div
        className="absolute inset-0 transition-opacity duration-1000"
        style={{ opacity: fadeIn ? 1 : 0 }}
      >
        {/* nijimu text */}
        <a
          href={import.meta.env.BASE_URL}
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            top: 30,
            fontFamily: "'GenRyuMin2 TW', 'Playfair Display', Georgia, serif",
            fontStyle: "normal",
            fontSize: 12,
            lineHeight: 1.5,
            color: "#9b9ba3",
            textTransform: "lowercase",
            whiteSpace: "nowrap",
            margin: 0,
            zIndex: 2,
            textDecoration: "none",
            cursor: "pointer",
          }}
        >
          nijimu
        </a>

        {/* Center content */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 24,
          }}
        >
          {/* Success message */}
          <div
            className="transition-all duration-1000"
            style={{
              textAlign: "center",
              opacity: showText ? 1 : 0,
              transform: showText ? "translateY(0)" : "translateY(20px)",
            }}
          >
            <p
              style={{
                fontFamily: "'GenRyuMin2 TW', 'Playfair Display', Georgia, serif",
                fontSize: "clamp(16px, calc(16px + (21 - 16) * ((100vw - 390px) / (1024 - 390))), 21px)",
                fontWeight: 500,
                lineHeight: "140%",
                letterSpacing: "0px",
                color: "rgba(123, 123, 135, 0.6)",
                textTransform: "lowercase",
                margin: 0,
                marginBottom: 16,
              }}
            >
              {isEditing ? "memory updated" : "memory preserved"}
            </p>
            

            {/* Gentle reminder */}
            <p
              style={{
                fontFamily: "'GenRyuMin2 TW', 'Playfair Display', Georgia, serif",
                fontSize: 12,
                lineHeight: 1.7,
                letterSpacing: "0px",
                color: "rgba(123, 123, 135, 0.6)",
                textAlign: "center",
                maxWidth: 420,
                margin: 0,
              }}
            >
              {isEditing 
                ? "the shape has been reshaped, reflecting how you feel about it now"
                : "it will blend with the others, waiting to be rediscovered when the time feels right"}
            </p>
          </div>
        </div>

        {/* Continue button */}
        {showButton && (
          <button
            onClick={() => navigate("/")}
            className="transition-all duration-1000"
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              bottom: 80,
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
              opacity: showButton ? 1 : 0,
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
              return home
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
        )}
      </div>
    </div>
  );
}