import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CHROME_GRAY } from "../lib/colors";
import { MEMORY_PHOTOS } from "../lib/memoryPhotos";
import { NOTE_SIZE, SERIF, TITLE } from "../lib/theme";
import { PARTICLE_TEXT_KEYFRAMES, ParticleText } from "./ParticleText";
import { PillButton } from "./PillButton";

const BUTTON_IN_DELAY_MS = 1400;
const CHROME_OUT_MS = 700;
/** Match the neutral, milky translucent film used by the falling 3D sheet. */
const PRINT_PAPER =
  "linear-gradient(135deg, rgba(255,255,255,.58), rgba(244,245,245,.34) 48%, rgba(255,255,255,.48))";
/** Until a real library exists, let the two photographs form a scrollable reel. */
const PHOTO_STRIP = Array.from(
  { length: 10 },
  (_, index) => ({ ...MEMORY_PHOTOS[index % MEMORY_PHOTOS.length], copy: index }),
);

const noteStyle = {
  margin: 0,
  fontFamily: SERIF,
  fontSize: NOTE_SIZE,
  lineHeight: 1.45,
  color: CHROME_GRAY,
} as const;

/**
 * Choosing a picture, laid over the pond after the words. The sheet itself
 * is drawn inside the water scene (PondPhotoPaper); this is only the chrome.
 */
export function PondPhotoOverlay({
  reducedMotion = false,
  chosenUrl,
  landed,
  onChoose,
  onClear,
  onContinue,
}: {
  reducedMotion?: boolean;
  chosenUrl?: string;
  landed: boolean;
  onChoose: (url: string) => void;
  onClear: () => void;
  onContinue: (photoUrl?: string) => void;
}) {
  const [buttonsIn, setButtonsIn] = useState(reducedMotion);
  const [leaving, setLeaving] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reducedMotion) return;
    const id = window.setTimeout(() => setButtonsIn(true), BUTTON_IN_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [reducedMotion]);

  const continueOn = (photoUrl?: string) => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => onContinue(photoUrl), CHROME_OUT_MS);
  };

  const leaveStyle = {
    opacity: leaving ? 0 : 1,
    transition: `opacity ${CHROME_OUT_MS}ms ease`,
  } as const;
  const trayVisible = !chosenUrl && !leaving;
  const buttonsVisible = buttonsIn && !leaving && (!chosenUrl || landed);
  useEffect(() => {
    if (!trayVisible) return;
    const strip = stripRef.current;
    if (!strip) return;
    const id = requestAnimationFrame(() => {
      strip.scrollLeft = (strip.scrollWidth - strip.clientWidth) / 2;
    });
    return () => cancelAnimationFrame(id);
  }, [trayVisible]);
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const onTrackpad = (event: WheelEvent) => {
      // Two-finger horizontal gestures arrive as deltaX. A vertical mouse
      // wheel (or two-finger vertical gesture) is a useful fallback while the
      // pointer is over this deliberately horizontal reel.
      const horizontal =
        Math.abs(event.deltaX) > .5 ? event.deltaX : event.deltaY;
      if (Math.abs(horizontal) < .01) return;
      event.preventDefault();
      strip.scrollLeft += horizontal;
    };
    // Explicitly non-passive: otherwise WebKit can perform its native scroll
    // as well and the same two-finger gesture moves the strip twice.
    strip.addEventListener("wheel", onTrackpad, { passive: false });
    return () => strip.removeEventListener("wheel", onTrackpad);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 30 }}>
      <style>{`
        ${PARTICLE_TEXT_KEYFRAMES}
        .pond-print { transform: rotate(var(--tilt)); transition: transform .45s ease, box-shadow .45s ease; }
        .pond-print:hover, .pond-print:focus-visible { transform: rotate(var(--tilt)) translateY(-4px); outline: none; }
        .pond-photo-strip { scrollbar-width: none; }
        .pond-photo-strip::-webkit-scrollbar { display: none; }
      `}</style>

      <p
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          top: 171,
          margin: 0,
          ...TITLE,
          color: CHROME_GRAY,
          width: "min(28em, 90vw)",
          textAlign: "center",
          ...leaveStyle,
        }}
      >
        <ParticleText
          text="Is there a picture that holds this memory?"
          seed={47}
          animate={!reducedMotion}
          delay={0.2}
          sweep={0.5}
          wrap
        />
      </p>

      <p
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          top: 229,
          width: "min(28em, 82vw)",
          textAlign: "center",
          ...noteStyle,
          opacity: trayVisible ? 1 : 0,
          transition: "opacity 0.6s ease",
        }}
      >
        <ParticleText
          text="choose one, and let it rest on the water."
          seed={59}
          animate={!reducedMotion}
          delay={0.8}
          sweep={0.6}
          wrap
        />
      </p>

      <div
        ref={stripRef}
        role="listbox"
        aria-label="pictures for this memory"
        aria-hidden={!trayVisible}
        className="pond-photo-strip"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "39%",
          height: "clamp(210px, 31vh, 300px)",
          display: "flex",
          alignItems: "center",
          gap: "clamp(24px, 4vw, 44px)",
          overflowX: "auto",
          overflowY: "hidden",
          padding: "28px clamp(42px, 12vw, 150px)",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-x",
          overscrollBehaviorX: "contain",
          userSelect: "none",
          maskImage: "linear-gradient(90deg, transparent, black 7%, black 93%, transparent)",
          WebkitMaskImage: "linear-gradient(90deg, transparent, black 7%, black 93%, transparent)",
          opacity: trayVisible ? 1 : 0,
          transition: "opacity 0.6s ease",
          pointerEvents: trayVisible ? "auto" : "none",
        }}
      >
        {PHOTO_STRIP.map((photo, index) => (
          <button
            key={`${photo.id}-${photo.copy}`}
            type="button"
            role="option"
            aria-selected={false}
            aria-label={photo.label}
            className="pond-print"
            onClick={() => onChoose(photo.url)}
            style={{
              "--tilt": index % 3 === 0 ? "-1.4deg" : index % 3 === 1 ? ".8deg" : "-.4deg",
              flex: "0 0 auto",
              padding: "clamp(9px, 1.4vw, 13px)",
              background: PRINT_PAPER,
              border: "1px solid rgba(255, 255, 255, 0.62)",
              borderRadius: 1,
              boxShadow: "0 14px 34px rgba(45, 51, 55, 0.10), inset 0 1px rgba(255,255,255,.36)",
              backdropFilter: "blur(3px)",
              WebkitBackdropFilter: "blur(3px)",
              cursor: "pointer",
            } as CSSProperties}
          >
            <img
              src={photo.url}
              alt=""
              draggable={false}
              style={{
                display: "block",
                width: photo.id === "ridge"
                  ? "clamp(168px, 26vw, 230px)"
                  : "auto",
                height: photo.id === "camp"
                  ? "clamp(168px, 25vw, 220px)"
                  : "auto",
                maxWidth: "clamp(168px, 26vw, 230px)",
                maxHeight: "clamp(168px, 25vw, 220px)",
                opacity: 0.94,
                filter: "saturate(.88) contrast(1.18)",
              }}
            />
          </button>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          bottom: 80,
          display: "flex",
          alignItems: "center",
          gap: 12,
          opacity: buttonsVisible ? 1 : 0,
          transition: "opacity 0.9s ease",
          pointerEvents: buttonsVisible ? "auto" : "none",
        }}
      >
        {chosenUrl ? (
          <>
            <PillButton label="choose another" variant="outline" onClick={onClear} />
            <PillButton label="continue" onClick={() => continueOn(chosenUrl)} trailing="›" />
          </>
        ) : (
          <PillButton label="continue without a picture" variant="outline" onClick={() => continueOn()} />
        )}
      </div>
    </div>
  );
}
