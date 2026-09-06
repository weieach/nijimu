import { useEffect, useRef, useState } from "react";
import { createPaletteWater, type PaletteWater } from "../lib/paletteWater";
import { Oklch, oklchToHex, sampleField } from "../lib/oklch";

const COLS = 196;
const ROWS = 72;

/** Shorter wash — 80% of the first 30vh band. */
export const WASH_HEIGHT = "24vh";
export const WASH_MIN_PX = 134;

/**
 * Bowl contour with the dissolve baked in: fill the curve, then blur
 * it so the edge melts along the shape (not a flat horizontal cut).
 */
function bakeCurveMask(): string {
  if (typeof document === "undefined") return "none";
  const w = 1024;
  const h = 512;
  const endY = 108;
  const midY = 268;
  const shape = document.createElement("canvas");
  shape.width = w;
  shape.height = h;
  const s = shape.getContext("2d");
  if (!s) return "none";
  s.fillStyle = "#fff";
  s.beginPath();
  s.moveTo(0, endY);
  s.bezierCurveTo(w * 0.22, midY, w * 0.78, midY, w, endY);
  s.lineTo(w, h);
  s.lineTo(0, h);
  s.closePath();
  s.fill();

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "none";
  ctx.filter = "blur(42px)";
  ctx.drawImage(shape, 0, 0);
  return `url(${canvas.toDataURL("image/png")})`;
}

const CURVE_MASK = bakeCurveMask();

type Props = {
  u: number;
  v: number;
  held?: boolean;
  onPick: (next: { u: number; v: number; color: Oklch }) => void;
};

/**
 * Full-width muted OKLCH wash. Click / drag like a Figma picker —
 * color is computed from UV, not from the blurred pixels.
 */
export function OklchColorField({ u, v, held = false, onPick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waterRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const water = useRef<PaletteWater | null>(null);
  const dragging = useRef(false);
  const heldRef = useRef(held);
  const lastFollow = useRef({ u, v, t: 0 });
  const hoverUv = useRef({ u, v, t: 0 });
  const flowPx = useRef({ x: 0, y: 0 });
  const [liveWater, setLiveWater] = useState(false);

  const slideWash = (du: number, dv: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    flowPx.current.x = flowPx.current.x * 0.72 + du * 46;
    flowPx.current.y = flowPx.current.y * 0.72 + dv * 32;
    canvas.style.transform = `translate(${flowPx.current.x}px, ${flowPx.current.y}px) scale(1.04, 1.12)`;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = COLS;
    canvas.height = ROWS;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    const img = ctx.createImageData(COLS, ROWS);
    const data = img.data;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const ny = y / (ROWS - 1);
        const hex = oklchToHex(sampleField(x / (COLS - 1), ny));
        const i = (y * COLS + x) * 4;
        data[i] = parseInt(hex.slice(1, 3), 16);
        data[i + 1] = parseInt(hex.slice(3, 5), 16);
        data[i + 2] = parseInt(hex.slice(5, 7), 16);
        const t = ny < 0.16 ? (ny / 0.16) ** 1.35 : 1;
        data[i + 3] = Math.round(255 * t);
      }
    }
    ctx.putImageData(img, 0, 0);

    const overlay = waterRef.current;
    const quiet =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!overlay || quiet) return;
    const sim = createPaletteWater(overlay, canvas);
    water.current = sim;
    setLiveWater(!!sim);
    const onResize = () => sim?.resize();
    window.addEventListener("resize", onResize);
    let raf = 0;
    const ease = () => {
      const f = flowPx.current;
      f.x *= 0.9;
      f.y *= 0.9;
      canvas.style.transform = `translate(${f.x}px, ${f.y}px) scale(1.04, 1.12)`;
      raf = requestAnimationFrame(ease);
    };
    raf = requestAnimationFrame(ease);
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
      sim?.dispose();
      water.current = null;
      setLiveWater(false);
    };
  }, []);

  useEffect(() => {
    const wasHeld = heldRef.current;
    heldRef.current = held;
    if (held && !wasHeld) water.current?.ripple(u, v);
  }, [held, u, v]);

  useEffect(() => {
    if (heldRef.current) {
      lastFollow.current = { u, v, t: performance.now() };
      return;
    }
    const now = performance.now();
    const prev = lastFollow.current;
    const dt = Math.max(now - (prev.t || now), 8);
    const speed = Math.hypot(u - prev.u, v - prev.v) / (dt / 1000);
    lastFollow.current = { u, v, t: now };
    slideWash(u - prev.u, v - prev.v);
    water.current?.stir(u, v, speed);
  }, [u, v]);

  const uvAt = (clientX: number, clientY: number) => {
    const el = wrapRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      u: clamp01((clientX - rect.left) / rect.width),
      v: clamp01((clientY - rect.top) / rect.height),
    };
  };

  const pickAt = (clientX: number, clientY: number) => {
    const next = uvAt(clientX, clientY);
    if (!next) return;
    onPick({ u: next.u, v: next.v, color: sampleField(next.u, next.v) });
  };

  const stirAt = (clientX: number, clientY: number) => {
    const next = uvAt(clientX, clientY);
    if (!next || heldRef.current) return;
    const now = performance.now();
    const prev = hoverUv.current;
    const dt = Math.max(now - (prev.t || now), 8);
    const speed = Math.hypot(next.u - prev.u, next.v - prev.v) / (dt / 1000);
    hoverUv.current = { ...next, t: now };
    slideWash(next.u - prev.u, next.v - prev.v);
    water.current?.stir(next.u, next.v, speed);
  };

  return (
    <div
      ref={wrapRef}
      role="slider"
      aria-label="color field"
      aria-valuetext="oklch wash"
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        const at = uvAt(e.clientX, e.clientY);
        pickAt(e.clientX, e.clientY);
        if (at) water.current?.ripple(at.u, at.v);
      }}
      onPointerMove={(e) => {
        stirAt(e.clientX, e.clientY);
        if (!dragging.current) return;
        pickAt(e.clientX, e.clientY);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: WASH_HEIGHT,
        minHeight: WASH_MIN_PX,
        zIndex: 10,
        cursor: "crosshair",
        touchAction: "none",
        WebkitMaskImage: CURVE_MASK,
        maskImage: CURVE_MASK,
        WebkitMaskSize: "100% 100%",
        maskSize: "100% 100%",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          filter: "blur(18px) saturate(1.08)",
          transform: "scale(1.04, 1.12)",
          transformOrigin: "center bottom",
          opacity: 0.6,
          pointerEvents: "none",
          transition: "transform 80ms linear",
        }}
      />
      <canvas
        ref={waterRef}
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
          visibility: liveWater ? "visible" : "hidden",
          filter: "blur(6px)",
          transform: "scale(1.04, 1.12)",
          transformOrigin: "center bottom",
          opacity: liveWater ? 0.85 : 0,
          mixBlendMode: "soft-light",
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: "42%",
          pointerEvents: "none",
          background:
            "linear-gradient(to bottom, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.12) 60%, transparent 100%)",
          filter: "blur(16px)",
          opacity: 0.6,
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: `${u * 100}%`,
          top: `${v * 100}%`,
          width: held ? 14 : 18,
          height: held ? 14 : 18,
          borderRadius: "50%",
          border: "1.5px solid rgba(255,255,255,0.92)",
          boxShadow: "0 0 0 1px rgba(70,70,78,0.28), 0 2px 10px rgba(40,40,48,0.18)",
          background: held ? "rgba(255,255,255,0.55)" : "transparent",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
