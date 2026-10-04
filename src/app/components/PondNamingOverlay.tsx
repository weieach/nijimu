import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useNavigate } from "react-router";
import { COLOR_PALETTE } from "../lib/colors";
import { carouselFrame } from "../lib/carouselLayout";
import { POND_SINK, SINK_WASH, pondSinkWash } from "../lib/pondCamera";
import { SHAPE_FEELING_PATH } from "../lib/routes";
import { SceneViewer } from "./SceneViewer";
import { ARTIFACT_LIGHT, useArtifactGlow } from "./ArtifactGlow";
import { CAPTION_DOWN_VH, CAPTION_TOP_VH } from "./PuddleDiveGallery";
import {
  draftColorIndex,
  draftShapeOf,
  useNamingRim,
  type NameFlowState,
  type NamingSession,
} from "./NamingRim";

/*
 * The naming step, back above the water. The eye has come up from where the
 * memory was made and stands at the pond again, in the same place it stood to
 * speak; the memory has risen with it and hangs in the air over the water,
 * centred, turning, in the gallery's own glass. Beneath it the same caption
 * the gallery shows — here still being typed.
 */

/** The eye comes up through the water, then the step arrives. */
const RISE_MS = POND_SINK.durationMs * 1.2;
/** The memory comes up behind the eye, slower, and lands after it has settled. */
const ARTIFACT_RISE_MS = RISE_MS * 1.5;
/** Going back down: the words leave first, then the eye sinks. */
const CHROME_OUT_MS = 420;
/** How far the memory travels on the way up, as a share of the viewport height. */
const LIFT_VH = 18;
/** The memory's own levitation — a little freer here than on the rim. */
const FLOAT_AMPLITUDE = 0.06;
/**
 * Its light along its own way up (0 = surfacing, 1 = landed): the wash's
 * colour at first, turning gradually to full white, then the white fading
 * back off to leave the glass — all well before it comes to rest.
 */
const WHITEN_FROM = 0.2;
const WHITE_AT = 0.4;
const CLEAR_FROM = 0.47;
const GLASS_AT = 0.74;
/** Going back down, whatever light is left goes out over this long. */
const LIGHT_OUT_MS = 600;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (t: number) => { const c = clamp01(t); return c * c * (3 - 2 * c); };

function lightAt(p: number) {
  const whiten = smooth((p - WHITEN_FROM) / (WHITE_AT - WHITEN_FROM));
  const clear = smooth((p - CLEAR_FROM) / (GLASS_AT - CLEAR_FROM));
  return { fill: 1 - clear, white: whiten * (1 - clear) };
}

function useViewport() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

export function PondNamingOverlay({
  session,
  reducedMotion = false,
  sinkRef,
  onSaved,
  backRef,
}: {
  session: NamingSession;
  reducedMotion?: boolean;
  /** Shared with the water: 1 is under it, 0 is standing at the pond. */
  sinkRef?: RefObject<number>;
  /** The memory is in the store; the host takes the pond away and opens the gallery on it. */
  onSaved: (draftId: string) => void;
  /** The host's back control calls this: the eye sinks back down to the feeling step. */
  backRef?: RefObject<(() => void) | null>;
}) {
  const navigate = useNavigate();
  const viewport = useViewport();
  const frame = carouselFrame(viewport.w, viewport.h);
  const { state } = session;

  const washRef = useRef<HTMLDivElement>(null);
  const artifactRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const raf = useRef<number | null>(null);
  const leaving = useRef(false);

  const [rising] = useState(() => state.rise === true && !reducedMotion && !!sinkRef);
  const risingRef = useRef(rising);

  const shape = useMemo(() => draftShapeOf(state), [state]);
  const matColor =
    state.matColor ?? COLOR_PALETTE[draftColorIndex(state.matPresetIndex)]?.color ?? COLOR_PALETTE[0].color;
  const glow = useArtifactGlow(ARTIFACT_LIGHT, 0.5);
  /** Where the memory is on its way up (1 = still below, 0 = in its seat), and its light. */
  const liftRef = useRef(rising ? 1 : 0);
  const lightRef = useRef(rising ? { fill: 1, white: 0 } : { fill: 0, white: 0 });

  /** The water and the words, at a depth of the eye: under the wash below the surface, settled above it. */
  const pose = (sink: number) => {
    const wash = pondSinkWash(sink);
    if (washRef.current) washRef.current.style.opacity = String(wash);
    if (chromeRef.current) chromeRef.current.style.opacity = String(1 - smooth(sink / 0.4));
  };
  const placeArtifact = (lift: number, light: { fill: number; white: number }) => {
    liftRef.current = lift;
    lightRef.current = light;
    if (artifactRef.current) artifactRef.current.style.transform = `translateY(${lift * LIFT_VH}vh)`;
    glow.apply(artifactRef.current, light.fill, light.white);
  };

  // Before the first frame: the camera starts where the shape scene left it,
  // just under the surface, behind the same wash. The memory comes up after
  // it, slower, still the light it turned into below; on the way its light
  // whitens, then fades off to leave the glass before it comes to rest.
  useLayoutEffect(() => {
    if (!rising || !sinkRef) return;
    sinkRef.current = 1;
    pose(1);
    placeArtifact(1, { fill: 1, white: 0 });
    let last = performance.now();
    let elapsed = 0;
    const tick = (now: number) => {
      if (!document.hidden) elapsed += Math.min(50, now - last);
      last = now;
      const sink = 1 - Math.min(1, elapsed / RISE_MS);
      sinkRef.current = sink;
      pose(sink);
      if (sink <= 0) risingRef.current = false;
      const way = Math.min(1, elapsed / ARTIFACT_RISE_MS);
      placeArtifact(1 - smooth(way), lightAt(way));
      if (way >= 1) {
        raf.current = null;
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [rising, sinkRef]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    if (sinkRef) sinkRef.current = 0;
  }, [sinkRef]);

  // Back is the way here in reverse: the words go, the eye sinks through the
  // surface with the memory, and the feeling step takes over the descent.
  const sinkBack = (flow: NameFlowState) => {
    if (leaving.current || risingRef.current) return;
    leaving.current = true;
    const go = () => navigate(SHAPE_FEELING_PATH, { state: { ...flow, rise: undefined, dive: true } });
    if (reducedMotion || !sinkRef) {
      go();
      return;
    }
    if (raf.current) cancelAnimationFrame(raf.current);
    // If it hadn't quite landed, it goes down from where it was.
    const liftFrom = liftRef.current;
    const lightFrom = lightRef.current;
    let last = performance.now();
    let elapsed = 0;
    const tick = (now: number) => {
      if (!document.hidden) elapsed += Math.min(50, now - last);
      last = now;
      const sink = clamp01((elapsed - CHROME_OUT_MS) / POND_SINK.durationMs);
      sinkRef.current = sink;
      pose(sink);
      const out = 1 - smooth(elapsed / LIGHT_OUT_MS);
      placeArtifact(Math.max(liftFrom, smooth(sink)), { fill: lightFrom.fill * out, white: lightFrom.white * out });
      if (chromeRef.current) chromeRef.current.style.opacity = String(1 - clamp01(elapsed / CHROME_OUT_MS));
      if (sink >= 1) { raf.current = null; go(); return; }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  const rim = useNamingRim(session, reducedMotion, {
    onSaved: (id) => {
      leaving.current = true;
      onSaved(id);
    },
    onExit: sinkBack,
  });

  useEffect(() => {
    if (!backRef) return;
    backRef.current = () => rim?.exit();
    return () => { backRef.current = null; };
  });

  if (!rim) return null;

  return (
    <div className="absolute inset-0 select-none" style={{ zIndex: 30, pointerEvents: "none" }}>
      {glow.filter}
      {/* The memory, in the air over the water. */}
      <div
        ref={artifactRef}
        role="img"
        aria-label="the memory being made"
        style={{
          position: "absolute",
          left: frame.cx - frame.size / 2,
          top: frame.apexY - frame.size / 2,
          width: frame.size,
          height: frame.size,
          transform: rising ? `translateY(${LIFT_VH}vh)` : "translateY(0)",
          willChange: "transform",
          pointerEvents: "auto",
        }}
      >
        <SceneViewer
          measureUnscaled
          form={shape.form}
          fluidity={shape.fluidity}
          evolve={shape.evolve}
          bumpAmount={shape.bumpAmount}
          autoRotate
          floatAmplitude={FLOAT_AMPLITUDE}
          ready
          frameMargin={1.12}
          sharedClock
          canvasBlurPx={0}
          enableZoom={false}
          enablePan={false}
          rectAreaLightColors={{ matColor }}
          style={{ width: "100%", height: "100%" }}
        />
      </div>

      {/* The caption, in the gallery's seat. */}
      <div
        ref={chromeRef}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: (CAPTION_TOP_VH + CAPTION_DOWN_VH) * viewport.h,
          padding: "0 clamp(24px, 6vw, 80px)",
          display: "flex",
          justifyContent: "center",
          opacity: rising ? 0 : 1,
          pointerEvents: "auto",
        }}
      >
        {rim.caption}
      </div>

      <div
        ref={washRef}
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 99970,
          background: SINK_WASH,
          opacity: rising ? 1 : 0,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
