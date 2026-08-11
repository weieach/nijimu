import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";
import { CHROME_GRAY } from "../lib/colors";
import { isPuddleSupported } from "../lib/puddle/simulation";
import { SERIF, SERIF_EXPOSURE } from "../lib/theme";
import { beginTranscription } from "../lib/transcribe";
import svgPathsStop from "../../imports/svg-hpzn3032f5";
import { BackButton } from "./BackButton";
import { readVariant } from "./HomePage";
import { PARTICLE_TEXT_KEYFRAMES, ParticleText } from "./ParticleText";
import { PAGE_BG, PuddleBackdrop } from "./PuddleBackdrop";
import { PageHeader } from "./PageHeader";
import { PillButton } from "./PillButton";
import { RecordingStartPage } from "./RecordingStartPage";

/* The arrival is staggered — the question gathers first, the guidance follows
   line by line, the way back arrives mid-way, and the record button surfaces
   last, once the words have settled. Each line reads itself in. */
const QUESTION_DELAY_S = 0.25;
const QUESTION_SWEEP_S = 0.5;
const NOTE_1_DELAY_S = 0.85;
const NOTE_2_DELAY_S = 1.35;
/** The guidance lines are long — they sweep a little slower than the question. */
const NOTE_SWEEP_S = 0.7;
/** The way back surfaces once the question has gathered. */
const BACK_IN_DELAY_MS = 1500;
/** The record button waits until the guidance has finished reading itself in. */
const BUTTON_IN_DELAY_MS = 2400;
/** …and everything dissolves before the transcript screen takes over. */
const CHROME_OUT_MS = 500;

const noteStyle = {
  margin: 0,
  fontFamily: SERIF,
  fontSize: 12,
  lineHeight: 1.45,
  color: CHROME_GRAY,
} as const;

/** Where the homescreen's descent left the camera, if we arrived from it. */
interface PuddleRecordingState {
  focus?: [number, number];
}

/**
 * The recording screen for the puddle homescreen: the same water, held at
 * depth, with the prompt laid over it. The press that opened this screen
 * pushed the camera into the puddle; here it surfaces around that same point
 * and rests, and the voice keeps sending rings through it while you speak.
 */
export function PuddleRecordingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const focus = (location.state as PuddleRecordingState | null)?.focus;

  const [backIn, setBackIn] = useState(false);
  const [buttonIn, setButtonIn] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [captureFailed, setCaptureFailed] = useState(false);
  const [reducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const recorder = useVoiceRecorder({
    onStop: (audio) => {
      if (!audio) {
        setCaptureFailed(true);
        return;
      }
      // the words are still being heard while the water fades — the transcript
      // screen picks the transcription up by id when it lands
      const transcriptionId = beginTranscription(audio);
      setLeaving(true);
      setTimeout(() => {
        navigate("/record/transcript", {
          state: { transcriptionId, ...(focus ? { focus } : {}) },
        });
      }, CHROME_OUT_MS);
    },
  });

  const troubleMessage = captureFailed
    ? "The recording didn't come through — try again"
    : recorder.error === "not-allowed"
      ? "Microphone access was denied — your words can't be heard"
      : recorder.error === "unsupported"
        ? "This browser can't record — try chrome"
        : recorder.error === "failed"
          ? "The microphone couldn't be opened — try again"
          : null;

  useEffect(() => {
    const back = setTimeout(() => setBackIn(true), BACK_IN_DELAY_MS);
    const button = setTimeout(() => setButtonIn(true), BUTTON_IN_DELAY_MS);
    return () => {
      clearTimeout(back);
      clearTimeout(button);
    };
  }, []);

  const startRecording = () => {
    setCaptureFailed(false);
    void recorder.start();
  };

  const goToSampleTranscript = () => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => {
      navigate("/record/transcript", {
        state: focus ? { focus } : undefined,
      });
    }, CHROME_OUT_MS);
  };

  /** The way back and the record button — they fade rather than gather. */
  const fadeStyle = (visible: boolean) =>
    ({
      opacity: visible && !leaving ? 1 : 0,
      transition: "opacity 0.9s ease",
    }) as const;

  /** Everything already on screen dissolves together on the way out. */
  const leaveStyle = {
    opacity: leaving ? 0 : 1,
    transition: `opacity ${CHROME_OUT_MS}ms ease`,
  } as const;

  return (
    <div
      className="relative w-full h-screen overflow-hidden select-none"
      style={{ background: PAGE_BG }}
    >
      <style>{`
        ${PARTICLE_TEXT_KEYFRAMES}
        @keyframes puddleRecIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
      <PuddleBackdrop focus={focus} voicePulse={recorder.voicePulse} />

      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 }}>
        <PageHeader
          layout="absolute"
          style={{
            pointerEvents: "auto",
            opacity: leaving ? 0 : 1,
            transition: "opacity 1.2s ease",
          }}
        />

        {/* the way back surfaces once the question has gathered */}
        <div style={{ pointerEvents: backIn && !leaving ? "auto" : "none", ...fadeStyle(backIn) }}>
          <BackButton />
        </div>

        <p
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            top: 171,
            margin: 0,
            fontFamily: SERIF_EXPOSURE,
            fontSize: "clamp(16px, calc(16px + (21 - 16) * ((100vw - 390px) / (1024 - 390))), 21px)",
            fontWeight: 400,
            fontSynthesis: "none",
            color: CHROME_GRAY,
            whiteSpace: "nowrap",
            ...leaveStyle,
          }}
        >
          <ParticleText
            text="What's been lingering on your mind?"
            seed={41}
            animate={!reducedMotion}
            delay={QUESTION_DELAY_S}
            sweep={QUESTION_SWEEP_S}
          />
        </p>

        {!recorder.isRecording && !troubleMessage ? (
          <div
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              top: 229,
              maxWidth: "80%",
              textAlign: "center",
              ...leaveStyle,
            }}
          >
            <p style={{ ...noteStyle, marginBottom: 4 }}>
              <ParticleText
                text="Speak into the microphone about this memory you are about to forget or still cannot let it go."
                seed={53}
                animate={!reducedMotion}
                delay={NOTE_1_DELAY_S}
                sweep={NOTE_SWEEP_S}
                wrap
              />
            </p>
            <p style={noteStyle}>
              <ParticleText
                text="How it happened, how it leave a shape in your heart, how do you feel..."
                seed={67}
                animate={!reducedMotion}
                delay={NOTE_2_DELAY_S}
                sweep={NOTE_SWEEP_S}
                wrap
              />
            </p>
          </div>
        ) : (
          /* while recording, the line breathes with the voice the water is hearing */
          <p
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              top: 270,
              margin: 0,
              whiteSpace: "nowrap",
              ...noteStyle,
              ...leaveStyle,
              opacity: leaving ? 0 : troubleMessage ? 1 : 0.6 + recorder.level * 0.4,
              transition: "opacity 0.4s ease",
              animation: reducedMotion ? "none" : "puddleRecIn 0.8s ease backwards",
            }}
          >
            {troubleMessage ?? `Recording...(${recorder.duration}s)`}
          </p>
        )}

        <div style={{ pointerEvents: buttonIn && !leaving ? "auto" : "none", ...fadeStyle(buttonIn) }}>
          {!recorder.isRecording ? (
            <div
              style={{
                position: "absolute",
                left: "50%",
                transform: "translateX(-50%)",
                bottom: 48,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
              }}
            >
              <PillButton label={captureFailed ? "record again" : "record"} onClick={startRecording} />
              <PillButton
                label="show sample transcript"
                variant="outline"
                onClick={goToSampleTranscript}
              />
            </div>
          ) : (
            <PillButton
              label="stop"
              onClick={recorder.stop}
              icon={
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                  <path d={svgPathsStop.p220b0800} fill={CHROME_GRAY} />
                </svg>
              }
              style={{
                position: "absolute",
                left: "50%",
                transform: "translateX(-50%)",
                bottom: 80,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * `/record/start` — the puddle recording screen when the puddle homescreen is
 * the one you pressed from, the original otherwise. Same A/B convention as the
 * shader and gallery variants.
 */
export function RecordingStartRoute() {
  const [puddle] = useState(() => readVariant() === "puddle" && isPuddleSupported());
  return puddle ? <PuddleRecordingPage /> : <RecordingStartPage />;
}
