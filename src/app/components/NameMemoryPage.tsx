import { useLocation, useNavigate } from "react-router";
import { useState, useRef, useEffect } from "react";
import { BackButton } from "./BackButton";
import { SANS, SANS_UI, SERIF } from "../lib/theme";
import { PageHeader } from "./PageHeader";
import { PillButton } from "./PillButton";

export function NameMemoryPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [memoryName, setMemoryName] = useState("");
  const [year, setYear] = useState("");
  const [fadeIn, setFadeIn] = useState(false);
  const [showYearWheel, setShowYearWheel] = useState(false);
  const yearInputRef = useRef<HTMLInputElement>(null);
  const wheelRef = useRef<HTMLDivElement>(null);

  // Generate years from 1950 to current year
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1949 }, (_, i) => currentYear - i);

  useEffect(() => {
    // Fade in effect
    setTimeout(() => setFadeIn(true), 100);
  }, []);

  const handleYearClick = () => {
    setShowYearWheel(!showYearWheel);
  };

  const handleYearSelect = (selectedYear: number) => {
    setYear(selectedYear.toString());
    setShowYearWheel(false);
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const element = e.currentTarget;
    const scrollPosition = element.scrollTop;
    const itemHeight = 44; // Height of each year item
    const centerIndex = Math.round(scrollPosition / itemHeight);
    
    // Auto-select the centered year
    if (years[centerIndex]) {
      setYear(years[centerIndex].toString());
    }
  };

  const handleContinue = () => {
    if (memoryName && year) {
      console.log("Navigating with:", { memoryName, year }); // Debug log
      navigate("/record/build", {
        state: {
          memoryName,
          year,
          ...location.state,
        },
      });
    } else {
      console.log("Cannot continue - missing data:", { memoryName, year }); // Debug log
    }
  };

  const canContinue = memoryName.trim() !== "" && year !== "";

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
          {/* nijimu wordmark */}
      <PageHeader layout="block" />

          {/* Header text */}
          <p
            style={{
              fontFamily: SERIF,
              fontSize: "clamp(16px, calc(16px + (21 - 16) * ((100vw - 390px) / (1024 - 390))), 21px)",
              fontWeight: 500,
              lineHeight: "39.2px",
              letterSpacing: "0px",
              color: "#7b7b87",
              textTransform: "lowercase",
              whiteSpace: "nowrap",
              marginTop: 0,
              marginRight: 0,
              marginLeft: 0,
              textAlign: "center",
              marginBottom: "clamp(40px, 8vh, 80px)",
            }}
          >
            name this memory.
          </p>
        </div>

        {/* Scrollable content area */}
        <div 
          className="flex-1 overflow-y-auto overflow-x-hidden"
          style={{
            paddingLeft: 20,
            paddingRight: 20,
            paddingBottom: "clamp(120px, 20vh, 160px)", // Space for button
          }}
        >
          <div style={{ maxWidth: 298, margin: "0 auto" }}>
            {/* Memory name input */}
            <div
              style={{
                width: "100%",
                marginBottom: "clamp(20px, 5vh, 88px)",
              }}
            >
              <input
                type="text"
                value={memoryName}
                onChange={(e) => setMemoryName(e.target.value)}
                placeholder="something simple is fine..."
                style={{
                  width: "100%",
                  padding: "8px 0 12px 0",
                  fontFamily: SERIF,
                  fontSize: 12,
                  lineHeight: "normal",
                  color: "#2a2018",
                  textAlign: "center",
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid rgba(42, 32, 24, 0.3)",
                  outline: "none",
                }}
                onFocus={(e) => {
                  e.target.style.borderBottomColor = "rgba(42, 32, 24, 0.5)";
                }}
                onBlur={(e) => {
                  e.target.style.borderBottomColor = "rgba(42, 32, 24, 0.3)";
                }}
              />
            </div>

            {/* Year input */}
            <div
              style={{
                width: "100%",
                position: "relative",
              }}
            >
              <input
                ref={yearInputRef}
                type="text"
                value={year}
                onClick={handleYearClick}
                readOnly
                placeholder="year of event..."
                style={{
                  width: "100%",
                  padding: "8px 0 12px 0",
                  fontFamily: SERIF,
                  fontSize: 12,
                  lineHeight: "normal",
                  color: year ? "rgba(42, 32, 24, 1)" : "rgba(42, 32, 24, 0.5)",
                  textAlign: "center",
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid rgba(42, 32, 24, 0.3)",
                  outline: "none",
                  cursor: "pointer",
                }}
              />

              {/* Year wheel picker (positioned below input) */}
              {showYearWheel && (
                <>
                  {/* Backdrop */}
                  <div
                    onClick={() => setShowYearWheel(false)}
                    style={{
                      position: "fixed",
                      inset: 0,
                      background: "transparent",
                      zIndex: 10,
                    }}
                  />
                  
                  {/* Year wheel */}
                  <div
                    style={{
                      position: "absolute",
                      left: "50%",
                      transform: "translateX(-50%)",
                      top: 60,
                      width: "100%",
                      maxWidth: 298,
                      height: 240,
                      background: "rgba(255, 255, 255, 0.95)",
                      backdropFilter: "blur(20px)",
                      borderRadius: 12,
                      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
                      zIndex: 20,
                      overflow: "hidden",
                    }}
                  >
                    {/* Selection indicator */}
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: "50%",
                        transform: "translateY(-50%)",
                        height: 40,
                        background: "rgba(205, 202, 202, 0.25)",
                        pointerEvents: "none",
                        zIndex: 1,
                      }}
                    />
                    
                    {/* Scrollable year list */}
                    <div
                      ref={wheelRef}
                      onScroll={handleScroll}
                      style={{
                        height: "100%",
                        overflowY: "scroll",
                        scrollSnapType: "y mandatory",
                        paddingTop: 100,
                        paddingBottom: 100,
                        WebkitOverflowScrolling: "touch",
                      }}
                      className="scrollbar-hide"
                    >
                      {years.map((y) => (
                        <div
                          key={y}
                          onClick={() => handleYearSelect(y)}
                          style={{
                            height: 40,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontFamily: SERIF,
                            fontSize: 18,
                            color: year === y.toString() ? "#2a2018" : "rgba(42, 32, 24, 0.5)",
                            fontWeight: year === y.toString() ? 500 : 400,
                            cursor: "pointer",
                            scrollSnapAlign: "center",
                            transition: "all 0.2s ease",
                          }}
                        >
                          {y}
                        </div>
                      ))}
                    </div>

                    {/* Gradient overlays for fade effect */}
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        height: 60,
                        background: "linear-gradient(to bottom, rgba(255, 255, 255, 0.95), transparent)",
                        pointerEvents: "none",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 60,
                        background: "linear-gradient(to top, rgba(255, 255, 255, 0.95), transparent)",
                        pointerEvents: "none",
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Save to archive button - fixed at bottom */}
        <PillButton
          label="save to archive"
          onClick={handleContinue}
          disabled={!canContinue}
          trailing="›"
          className="transition-opacity duration-500"
          style={{
            position: "fixed",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: "clamp(40px, 8vh, 80px)",
            zIndex: 10,
          }}
        />
      </div>

      {/* Back button */}
      <BackButton />

      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        input::placeholder {
          color: rgba(42, 32, 24, 0.5);
        }
      `}</style>
    </div>
  );
}