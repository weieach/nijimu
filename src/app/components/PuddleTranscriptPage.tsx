import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { CHROME_GRAY } from "../lib/colors";
import { isPuddleSupported } from "../lib/puddle/simulation";
import { SERIF, SERIF_DISPLAY, SERIF_EXPOSURE } from "../lib/theme";
import { BackButton } from "./BackButton";
import { readVariant } from "./HomePage";
import { PARTICLE_TEXT_KEYFRAMES, ParticleText } from "./ParticleText";
import { PAGE_BG, PuddleBackdrop } from "./PuddleBackdrop";
import { PageHeader } from "./PageHeader";
import { PillButton } from "./PillButton";
import { TranscriptPage } from "./TranscriptPage";

const SAMPLE_TRANSCRIPT =
  "I keep coming back to that summer. Not to him, exactly — but to who I was when I was around him. Someone who still had time to notice things. The light on a wall. The sound of a city at 2am. He gave me a camera and said, just feel for the click. I think what he actually meant was — slow down. Pay attention. I didn't. And then he was gone. And I kept moving. But sometimes I wonder if that version of me is still somewhere, waiting on that island, wondering why I never came back.";

const HIGHLIGHT = "rgba(123, 123, 135, 0.22)";

interface PuddleTranscriptState {
  transcript?: string;
  focus?: [number, number];
}

/**
 * The transcript screen for the puddle homescreen: same water as the recording
 * page, held at depth, with the words laid over it in the same quiet chrome.
 */
export function PuddleTranscriptPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state as PuddleTranscriptState | null) ?? null;
  const transcript = state?.transcript || SAMPLE_TRANSCRIPT;
  const focus = state?.focus;

  const words = transcript.split(/\s+/);

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
  const [reducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const typingDoneRef = useRef(false);
  useEffect(() => {
    if (typingDoneRef.current) {
      setVisibleWordCount(words.length);
      return;
    }
    const typingSpeed = 80;

    typingIntervalRef.current = window.setInterval(() => {
      setVisibleWordCount((count) => {
        if (count < words.length) {
          return count + 1;
        }
        if (typingIntervalRef.current) {
          clearInterval(typingIntervalRef.current);
        }
        typingDoneRef.current = true;
        setIsTyping(false);
        setTimeout(() => setShowContinue(true), 300);
        return count;
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
      setHighlightMode(true);
      setShowContinue(false);
    } else {
      setFadeOutContent(true);
      setTimeout(() => {
        navigate("/record/name", {
          state: {
            transcript,
            highlightedWords: Array.from(highlightedWords).map((i) => words[i]),
            focus,
          },
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

    const newHighlighted = new Set(highlightedWords);
    const allHighlighted = Array.from(currentSelection).every((i) => highlightedWords.has(i));

    if (allHighlighted) {
      currentSelection.forEach((i) => newHighlighted.delete(i));
    } else {
      currentSelection.forEach((i) => newHighlighted.add(i));
    }

    setHighlightedWords(newHighlighted);
    setIsSelecting(false);
    setSelectionStart(null);
    setCurrentSelection(new Set());

    setShowContinue(newHighlighted.size > 0);
  };

  useEffect(() => {
    if (highlightMode) {
      window.addEventListener("mouseup", handleMouseUp);
      return () => window.removeEventListener("mouseup", handleMouseUp);
    }
  }, [highlightMode, isSelecting, currentSelection, highlightedWords]);

  const isWordHighlighted = (index: number) =>
    highlightedWords.has(index) || currentSelection.has(index);

  const hasHighlights = highlightedWords.size > 0;

  useEffect(() => {
    const handleScroll = () => {
      const container = transcriptRef.current?.parentElement;
      if (!container) return;

      const { scrollTop, scrollHeight, clientHeight } = container;
      const scrollBottom = scrollHeight - clientHeight - scrollTop;
      setShowBottomFade(scrollBottom > 10);
    };

    const container = transcriptRef.current?.parentElement;
    if (container) {
      container.addEventListener("scroll", handleScroll);
      handleScroll();
      return () => container.removeEventListener("scroll", handleScroll);
    }
  }, []);

  return (
    <div
      className="relative w-full h-screen overflow-hidden select-none"
      style={{
        background: PAGE_BG,
        userSelect: highlightMode ? "none" : "auto",
      }}
    >
      <style>{PARTICLE_TEXT_KEYFRAMES}</style>
      <PuddleBackdrop focus={focus} />

      <div
        className="absolute inset-0"
        style={{
          zIndex: 10,
          opacity: fadeOutContent ? 0 : 1,
          transition: "opacity 1s ease",
          pointerEvents: fadeOutContent ? "none" : "auto",
        }}
      >
        <PageHeader layout="absolute" style={{ pointerEvents: "auto" }} />
        <BackButton />

        {!highlightMode ? (
          <div
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              top: 171,
              textAlign: "center",
              maxWidth: "90%",
            }}
          >
            <p
              style={{
                margin: 0,
                fontFamily: SERIF_EXPOSURE,
                fontSize:
                  "clamp(16px, calc(16px + (21 - 16) * ((100vw - 390px) / (1024 - 390))), 21px)",
                fontWeight: 400,
                fontSynthesis: "none",
                color: CHROME_GRAY,
                whiteSpace: "nowrap",
              }}
            >
              <ParticleText
                text="What's been lingering on your mind?"
                seed={41}
                animate={!reducedMotion}
                delay={0.2}
                sweep={0.5}
              />
            </p>
            {isTyping && (
              <p
                style={{
                  margin: "8px 0 0",
                  fontFamily: SERIF,
                  fontSize: 12,
                  lineHeight: 1.45,
                  color: CHROME_GRAY,
                }}
              >
                transcribing...
              </p>
            )}
          </div>
        ) : (
          <div
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              top: 171,
              width: "min(90%, 420px)",
              textAlign: "center",
              fontFamily: SERIF,
              fontSize: 14,
              lineHeight: 1.5,
              color: CHROME_GRAY,
              textTransform: "lowercase",
            }}
          >
            <p style={{ margin: 0 }}>
              drag to{" "}
              <span style={{ position: "relative", display: "inline-block" }}>
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: 2,
                    bottom: 2,
                    background: HIGHLIGHT,
                    zIndex: 0,
                  }}
                />
                <span style={{ position: "relative", zIndex: 1 }}>highlight</span>
              </span>{" "}
              the words
            </p>
            <p style={{ margin: 0 }}>that touch you the most.</p>
          </div>
        )}

        <div
          className="overflow-hidden"
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            top: highlightMode ? 240 : 220,
            bottom: "clamp(120px, 18vh, 160px)",
            width: "100%",
            display: "flex",
            justifyContent: "center",
            paddingLeft: "clamp(20px, 5vw, 40px)",
            paddingRight: "clamp(20px, 5vw, 40px)",
          }}
        >
          <div
            className="overflow-y-auto overflow-x-hidden relative"
            style={{
              width: "60%",
              maxHeight: "100%",
              paddingTop: 40,
            }}
          >
            <div
              ref={transcriptRef}
              style={{
                fontFamily: SERIF_DISPLAY,
                fontSize: "clamp(13px, 1.6vw, 15px)",
                fontWeight: 400,
                lineHeight: 1.7,
                letterSpacing: "0.02em",
                fontFeatureSettings: '"kern" 1',
                fontKerning: "normal",
                color: CHROME_GRAY,
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
                          background: HIGHLIGHT,
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

            {showBottomFade && (
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: "clamp(100px, 16vh, 160px)",
                  background: `linear-gradient(to top, ${PAGE_BG} 20%, rgba(237, 237, 238, 0) 100%)`,
                  pointerEvents: "none",
                  zIndex: 2,
                  transition: "opacity 0.3s ease",
                }}
              />
            )}
          </div>
        </div>

        {showContinue && (
          <div
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              bottom: 80,
              zIndex: 20,
              transition: "opacity 0.5s ease",
            }}
          >
            <PillButton
              label="continue"
              onClick={handleContinue}
              disabled={highlightMode && !hasHighlights}
              trailing="›"
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * `/record/transcript` — puddle transcript when the puddle homescreen is active,
 * the original gray transcript otherwise.
 */
export function TranscriptRoute() {
  const [puddle] = useState(() => readVariant() === "puddle" && isPuddleSupported());
  return puddle ? <PuddleTranscriptPage /> : <TranscriptPage />;
}
