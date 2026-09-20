import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { CHROME_GRAY } from "../lib/colors";
import { RECORD_START_PATH, SHAPE_BUILD_PATH, TRANSCRIPT_PATH } from "../lib/routes";
import { BODY_SIZE, NOTE_SIZE, PROSE_SIZE, SERIF, SERIF_DISPLAY, TITLE } from "../lib/theme";
import { getTranscription } from "../lib/transcribe";
import { PARTICLE_TEXT_KEYFRAMES, ParticleText } from "./ParticleText";
import { PillButton } from "./PillButton";

/** Soft wash over the pond so long transcripts fade instead of colliding with the button. */
const POND_FADE = "rgba(226, 230, 226, 0.88)";

const SAMPLE_TRANSCRIPT =
  "I keep coming back to that summer. Not to him, exactly — but to who I was when I was around him. Someone who still had time to notice things. The light on a wall. The sound of a city at 2am. He gave me a camera and said, just feel for the click. I think what he actually meant was — slow down. Pay attention. I didn't. And then he was gone. And I kept moving. But sometimes I wonder if that version of me is still somewhere, waiting on that island, wondering why I never came back.";

const HIGHLIGHT = "rgba(123, 123, 135, 0.22)";

interface PuddleTranscriptState {
  transcript?: string;
  transcriptionId?: string;
  focus?: [number, number];
  shape?: { modelPath?: string };
}

/**
 * Transcript chrome over the pond — same words as the former transcript
 * page, without leaving the water or painting a second puddle.
 */
export function PuddleTranscriptPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state as PuddleTranscriptState | null) ?? null;
  const focus = state?.focus;
  const transcriptionId = state?.transcriptionId;

  /* A real recording arrives as an id — the words are still being heard while
     the water settles here. Only a deep link (or the sample button) falls back
     to the sample memory. */
  const pending = getTranscription(transcriptionId);
  const [transcript, setTranscript] = useState(() => {
    if (pending?.result?.transcript) return pending.result.transcript;
    if (state?.transcript) return state.transcript;
    return transcriptionId ? "" : SAMPLE_TRANSCRIPT;
  });
  const [transcribeError, setTranscribeError] = useState<string | null>(() => {
    if (pending?.result?.error) return pending.result.error;
    if (transcriptionId && !pending && !state?.transcript) {
      return "The transcription was lost — try recording again.";
    }
    return null;
  });
  const [awaitingTranscript, setAwaitingTranscript] = useState(
    () => !!pending && pending.result === null,
  );

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

  /** Keep settled words in location.state so a remount doesn't lose them. */
  const rememberTranscript = (text: string) => {
    if (!transcriptionId || state?.transcript === text) return;
    // This overlay is rendered by LandingPage rather than as the matched route
    // component. A route-relative "." therefore resolves to the shared landing
    // route (`/`) and used to throw the user home as soon as transcription
    // completed. Preserve the settled words on the explicit transcript URL.
    navigate(TRANSCRIPT_PATH, {
      replace: true,
      state: { ...state, transcriptionId, transcript: text },
    });
  };

  // The words arriving from the transcription service
  useEffect(() => {
    if (pending?.result?.transcript) rememberTranscript(pending.result.transcript);
    if (!pending || !awaitingTranscript) return;
    let alive = true;
    pending.promise.then((result) => {
      if (!alive) return;
      if (result.transcript) {
        setTranscript(result.transcript);
        rememberTranscript(result.transcript);
      } else {
        setTranscribeError(result.error);
      }
      setAwaitingTranscript(false);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, awaitingTranscript]);

  useEffect(() => {
    if (awaitingTranscript || transcribeError || !transcript.trim()) return;
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
  }, [words.length, awaitingTranscript, transcribeError, transcript]);

  const goToRecord = () => {
    navigate(RECORD_START_PATH, {
      state: {
        ...(focus ? { focus } : {}),
        ...(state?.shape ? { shape: state.shape } : {}),
      },
    });
  };

  const handleContinue = () => {
    if (!highlightMode) {
      setHighlightMode(true);
      setShowContinue(false);
    } else {
      setFadeOutContent(true);
      setTimeout(() => {
        navigate(SHAPE_BUILD_PATH, {
          state: {
            transcript,
            highlightedWords: Array.from(highlightedWords).map((i) => words[i]),
            shape: state?.shape,
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
      className="absolute inset-0 select-none"
      style={{
        zIndex: 30,
        userSelect: highlightMode ? "none" : "auto",
        opacity: fadeOutContent ? 0 : 1,
        transition: "opacity 1s ease",
        pointerEvents: "none",
      }}
    >
      <style>{PARTICLE_TEXT_KEYFRAMES}</style>

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
                ...TITLE,
                margin: 0,
                color: CHROME_GRAY,
              }}
            >
              <ParticleText
                text="What's been lingering on your mind?"
                seed={41}
                animate={!reducedMotion}
                delay={0.2}
                sweep={0.5}
                wrap
              />
            </p>
            {(awaitingTranscript || transcribeError || isTyping) && (
              <p
                style={{
                  margin: "8px 0 0",
                  fontFamily: SERIF,
                  fontSize: NOTE_SIZE,
                  lineHeight: 1.45,
                  color: CHROME_GRAY,
                }}
              >
                {transcribeError
                  ? `couldn't hear that — ${transcribeError.toLowerCase()}`
                  : "transcribing..."}
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
              fontSize: BODY_SIZE,
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
            pointerEvents: fadeOutContent ? "none" : "auto",
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
                fontSize: PROSE_SIZE,
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
                  background: `linear-gradient(to top, ${POND_FADE} 20%, rgba(226, 230, 226, 0) 100%)`,
                  pointerEvents: "none",
                  zIndex: 2,
                  transition: "opacity 0.3s ease",
                }}
              />
            )}
          </div>
        </div>

        {(transcribeError || showContinue) && (
          <div
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              bottom: 80,
              zIndex: 20,
              display: "flex",
              alignItems: "center",
              gap: 12,
              pointerEvents: fadeOutContent ? "none" : "auto",
              transition: "opacity 0.5s ease",
            }}
          >
            <PillButton
              label="record again"
              variant={showContinue && !transcribeError ? "outline" : "light"}
              onClick={goToRecord}
            />
            {showContinue && !transcribeError && (
              <PillButton
                label="continue"
                onClick={handleContinue}
                disabled={highlightMode && !hasHighlights}
                trailing="›"
              />
            )}
          </div>
        )}
    </div>
  );
}
