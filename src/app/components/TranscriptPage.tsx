import { useLocation, useNavigate } from "react-router";
import { useState, useEffect, useRef } from "react";
import { BackButton } from "./BackButton";
import exposureTrialFontUrl from "../../assets/fonts/ExposureTrial-20.otf?url";
import exposureTrial10Url from "../../assets/fonts/ExposureTrial+10.otf?url";

const SAMPLE_TRANSCRIPT = 
  "I keep coming back to that summer. Not to him, exactly — but to who I was when I was around him. Someone who still had time to notice things. The light on a wall. The sound of a city at 2am. He gave me a camera and said, just feel for the click. I think what he actually meant was — slow down. Pay attention. I didn't. And then he was gone. And I kept moving. But sometimes I wonder if that version of me is still somewhere, waiting on that island, wondering why I never came back.";

export function TranscriptPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const transcript =
    (location.state as { transcript?: string } | null)?.transcript || SAMPLE_TRANSCRIPT;

  const words = transcript.split(/\s+/);
  
  // State for typing effect
  const [visibleWordCount, setVisibleWordCount] = useState(0);
  const [isTyping, setIsTyping] = useState(true);
  const [showContinue, setShowContinue] = useState(false);
  const [highlightMode, setHighlightMode] = useState(false);
  const [highlightedWords, setHighlightedWords] = useState<Set<number>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [currentSelection, setCurrentSelection] = useState<Set<number>>(new Set());
  const [fadeOutContent, setFadeOutContent] = useState(false);
  const typingIntervalRef = useRef<number | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [showBottomFade, setShowBottomFade] = useState(false);

  // Word-by-word typing effect
  useEffect(() => {
    const typingSpeed = 80; // milliseconds per word

    typingIntervalRef.current = window.setInterval(() => {
      setVisibleWordCount((count) => {
        if (count < words.length) {
          return count + 1;
        } else {
          // Typing complete
          if (typingIntervalRef.current) {
            clearInterval(typingIntervalRef.current);
          }
          setIsTyping(false);
          // Small delay before showing continue button
          setTimeout(() => {
            setShowContinue(true);
          }, 300);
          return count;
        }
      });
    }, typingSpeed);

    return () => {
      if (typingIntervalRef.current) {
        clearInterval(typingIntervalRef.current);
      }
    };
  }, [words.length]);

  const handleContinue = () => {
    if (!highlightMode) {
      // First continue: enter highlight mode
      setHighlightMode(true);
      setShowContinue(false);
    } else {
      // Second continue: fade out and navigate to naming page
      setFadeOutContent(true);
      setTimeout(() => {
        navigate("/record/name", { 
          state: { 
            transcript,
            highlightedWords: Array.from(highlightedWords).map(i => words[i])
          } 
        });
      }, 1000);
    }
  };

  const handleMouseDown = (wordIndex: number) => {
    if (!highlightMode) return;
    setIsSelecting(true);
    setSelectionStart(wordIndex);
    setCurrentSelection(new Set([wordIndex]));
  };

  const handleMouseEnter = (wordIndex: number) => {
    if (!highlightMode || !isSelecting || selectionStart === null) return;
    
    const start = Math.min(selectionStart, wordIndex);
    const end = Math.max(selectionStart, wordIndex);
    
    const newSelection = new Set<number>();
    for (let i = start; i <= end; i++) {
      newSelection.add(i);
    }
    setCurrentSelection(newSelection);
  };

  const handleMouseUp = () => {
    if (!highlightMode || !isSelecting) return;
    
    // Toggle highlighted state for selected words
    const newHighlighted = new Set(highlightedWords);
    
    // Check if all selected words are already highlighted
    const allHighlighted = Array.from(currentSelection).every(i => highlightedWords.has(i));
    
    if (allHighlighted) {
      // De-highlight all selected words
      currentSelection.forEach(i => newHighlighted.delete(i));
    } else {
      // Highlight all selected words
      currentSelection.forEach(i => newHighlighted.add(i));
    }
    
    setHighlightedWords(newHighlighted);
    setIsSelecting(false);
    setSelectionStart(null);
    setCurrentSelection(new Set());
    
    // Show continue button if any words are highlighted
    if (newHighlighted.size > 0) {
      setShowContinue(true);
    } else {
      setShowContinue(false);
    }
  };

  useEffect(() => {
    if (highlightMode) {
      window.addEventListener('mouseup', handleMouseUp);
      return () => window.removeEventListener('mouseup', handleMouseUp);
    }
  }, [highlightMode, isSelecting, currentSelection, highlightedWords]);

  const isWordHighlighted = (index: number) => {
    return highlightedWords.has(index) || currentSelection.has(index);
  };

  const hasHighlights = highlightedWords.size > 0;

  // Scroll detection for fade effect
  useEffect(() => {
    const handleScroll = () => {
      const container = transcriptRef.current?.parentElement;
      if (!container) return;

      const { scrollTop, scrollHeight, clientHeight } = container;
      const scrollBottom = scrollHeight - clientHeight - scrollTop;

      // Show fade when not at the bottom (within 10px threshold)
      setShowBottomFade(scrollBottom > 10);
    };

    const container = transcriptRef.current?.parentElement;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      // Initial check
      handleScroll();
      
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, []);

  return (
    <div
      className="relative w-full h-screen flex flex-col overflow-hidden"
      style={{ background: "#e0e0e0", userSelect: highlightMode ? "none" : "auto" }}
    >
      {/* Vite-resolved URL so @font-face always matches the bundled .otf */}
      <style
        dangerouslySetInnerHTML={{
          __html: `@font-face{font-family:"Exposure Trial";src:url(${JSON.stringify(exposureTrialFontUrl)}) format("opentype");font-weight:100 900;font-style:normal;font-display:swap;}@font-face{font-family:"Exposure Trial Plus";src:url(${JSON.stringify(exposureTrial10Url)}) format("opentype");font-weight:100 900;font-style:normal;font-display:swap;}`,
        }}
      />
      {/* Content wrapper with fade out */}
      <div
        className="flex flex-col h-full transition-opacity duration-1000"
        style={{ opacity: fadeOutContent ? 0 : 1 }}
      >
        {/* Top section - nijimu and header */}
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

          {/* Header text - changes based on mode */}
          {!highlightMode ? (
            <div style={{ textAlign: "center", marginBottom: "clamp(40px, 8vh, 80px)" }}>
              {/* Question text */}
              <p
                style={{
                  fontFamily: "'GenRyuMin2 TW', 'Playfair Display', Georgia, serif",
                  fontSize: "clamp(16px, calc(16px + (21 - 16) * ((100vw - 390px) / (1024 - 390))), 21px)",
                  fontWeight: 500,
                  lineHeight: "140%",
                  letterSpacing: "0px",
                  color: "#7b7b87",
                  textTransform: "lowercase",
                  whiteSpace: "nowrap",
                  top: 200,
                  marginTop: 0,
                  marginRight: 0,
                  marginBottom: 0,
                  marginLeft: 0,
                  textAlign: "center",
                }}
              >
                What's been lingering on your mind?
              </p>

              {/* Transcribing... text (only visible while typing) */}
              {isTyping && (
                <p
                  style={{
                    fontFamily: "'GenRyuMin2 TW', 'Playfair Display', Georgia, serif",
                    fontSize: 12,
                    fontWeight: 400,
                    lineHeight: "170%",
                    color: "#acacac",
                    whiteSpace: "nowrap",
                    marginTop: 0,
                    marginRight: 0,
                    marginBottom: 0,
                    marginLeft: 0,
                  }}
                >
                  transcribing...
                </p>
              )}
            </div>
          ) : (
            /* Highlight mode header */
            <div
              style={{
                fontFamily: "'GenRyuMin2 TW', 'Playfair Display', Georgia, serif",
                fontSize: 16,
                fontWeight: 500,
                lineHeight: "150%",
                letterSpacing: "0px",
                color: "#7b7b87",
                textTransform: "lowercase",
                textAlign: "center",
                marginTop: 0,
                marginRight: 0,
                marginLeft: 0,
                marginBottom: "clamp(40px, 8vh, 80px)",
                paddingLeft: 20,
                paddingRight: 20,
              }}
            >
              <p style={{ marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0 }}>
                drag to{" "}
                <span
                  style={{
                    position: "relative",
                    display: "inline-block",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: 2,
                      bottom: 2,
                      background: "#cdcaca",
                      mixBlendMode: "darken",
                      zIndex: 0,
                    }}
                  />
                  <span style={{ position: "relative", zIndex: 1 }}>highlight</span>
                </span>{" "}
                the words
              </p>
              <p style={{ marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0 }}>that touch you the most.</p>
            </div>
          )}
        </div>

        {/* Scrollable transcript area */}
        <div 
          className="flex-1 overflow-hidden relative"
          style={{
            paddingLeft: "clamp(20px, 5vw, 40px)",
            paddingRight: "clamp(20px, 5vw, 40px)",
            paddingBottom: "clamp(120px, 20vh, 160px)", // Space for button
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            paddingTop: 0, // Start from top
          }}
        >
          {/* Scrollable transcript container (60% width) */}
          <div
            className="overflow-y-auto overflow-x-hidden relative"
            style={{
              width: "60%",
              maxHeight: "100%",
              position: "relative",
              paddingTop: "100px", // Position body text 100px from top
            }}
          >
            <div
              ref={transcriptRef}
              style={{
                fontFamily: "'Exposure Trial Plus', 'Playfair Display', Georgia, serif",
                fontSize: "clamp(18px, 2.5vw, 22px)",
                fontWeight: 400,
                lineHeight: 1.5,
                letterSpacing: "0.02em",
                fontFeatureSettings: '"kern" 1',
                fontKerning: "normal",
                color: "#2D2727",
                textAlign: "center",
                position: "relative",
                zIndex: 0,
              }}
            >
              {words.map((word, index) => {
                const isVisible = index < visibleWordCount;
                const isHighlighted = isWordHighlighted(index);
                
                return (
                  <span
                    key={index}
                    onMouseDown={() => handleMouseDown(index)}
                    onMouseEnter={() => handleMouseEnter(index)}
                    style={{
                      position: "relative",
                      display: "inline-block",
                      opacity: isVisible ? 1 : 0,
                      transition: isTyping ? "opacity 0.3s ease-in" : "none",
                      cursor: highlightMode ? "pointer" : "default",
                      marginRight: index < words.length - 1 ? "0.3em" : 0,
                    }}
                  >
                    {isHighlighted && (
                      <span
                        style={{
                          position: "absolute",
                          left: -2,
                          right: -2,
                          top: 2,
                          bottom: 2,
                          background: "#cdcaca",
                          mixBlendMode: "darken",
                          zIndex: 0,
                          pointerEvents: "none",
                        }}
                      />
                    )}
                    <span style={{ position: "relative", zIndex: 1 }}>{word}</span>
                  </span>
                );
              })}
            </div>
            
            {/* Bottom gradient mask - only shows when not at bottom */}
            {showBottomFade && (
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: "clamp(120px, 20vh, 200px)",
                  background: "linear-gradient(to top, #e0e0e0 20%, rgba(224, 224, 224, 0) 100%)",
                  pointerEvents: "none",
                  zIndex: 2,
                  transition: "opacity 0.3s ease",
                }}
              />
            )}
          </div>
        </div>

        {/* Continue button - fixed at bottom */}
        {showContinue && (
          <button
            onClick={handleContinue}
            disabled={highlightMode && !hasHighlights}
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
              background: (highlightMode && !hasHighlights) 
                ? "rgba(175, 163, 163, 0.1)" 
                : "rgba(175, 163, 163, 0.2)",
              cursor: (highlightMode && !hasHighlights) ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
              opacity: showContinue ? 1 : 0,
              zIndex: 20,
            }}
          >
            <span
              style={{
                fontFamily: "'Neue Haas Grotesk Display Pro', 'Neue Montreal', sans-serif",
                fontSize: 16,
                fontWeight: 400,
                lineHeight: 1.5,
                color: (highlightMode && !hasHighlights) ? "rgba(140, 140, 140, 0.5)" : "#8C8C8C",
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
                color: (highlightMode && !hasHighlights) ? "rgba(140, 140, 140, 0.5)" : "#8C8C8C",
                fontVariationSettings: "'wdth' 100",
              }}
            >
              ›
            </span>
          </button>
        )}
      </div>

      {/* Back button */}
      <BackButton />
    </div>
  );
}