import type { CSSProperties } from "react";
import { Oklch, oklchCss } from "../lib/oklch";

type Blob = {
  dh: number;
  l: number;
  c: number;
  x: string;
  y: string;
  rx: string;
  ry: string;
};

/** Soft aurora / bokeh patches. Hues ride with the pick (`dh` is offset). */
const BLOBS: Blob[] = [
  { dh: -48, l: 0.88, c: 0.078, x: "16%", y: "42%", rx: "48%", ry: "36%" },
  { dh: -18, l: 0.9, c: 0.07, x: "40%", y: "36%", rx: "44%", ry: "32%" },
  { dh: 8, l: 0.89, c: 0.074, x: "58%", y: "40%", rx: "42%", ry: "34%" },
  { dh: 46, l: 0.87, c: 0.068, x: "80%", y: "38%", rx: "40%", ry: "36%" },
  { dh: 92, l: 0.86, c: 0.06, x: "90%", y: "28%", rx: "34%", ry: "28%" },
  { dh: -78, l: 0.91, c: 0.055, x: "8%", y: "30%", rx: "32%", ry: "26%" },
  { dh: 22, l: 0.92, c: 0.038, x: "50%", y: "22%", rx: "40%", ry: "26%" },
  { dh: 200, l: 0.9, c: 0.03, x: "68%", y: "18%", rx: "28%", ry: "20%" },
];

function wrapHue(h: number): number {
  return ((h % 360) + 360) % 360;
}

/**
 * The color-page air: a still periwinkle mist above, and a flowy
 * mesh of pastel clouds around the form. The pick tints the clouds;
 * chroma stays low so it reads as weather, not a lightbox.
 */
export function AmbientSurround({ oklch }: { oklch: Oklch }) {
  const h = oklch.h;
  const sky = oklchCss({
    l: 0.935,
    c: 0.008,
    h: wrapHue(268 + (h - 268) * 0.18),
  });

  const layers = BLOBS.map((b) => {
    const color = oklchCss({
      l: b.l,
      c: b.c * 0.85 * 0.6,
      h: wrapHue(h + b.dh),
    });
    return `radial-gradient(ellipse ${b.rx} ${b.ry} at ${b.x} ${b.y}, ${color} 0%, transparent 72%)`;
  });

  const style: CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 0,
    pointerEvents: "none",
    backgroundColor: sky,
    backgroundImage: layers.join(", "),
    filter: "blur(16px) saturate(0.57)",
    transform: "scale(1.08)",
    transformOrigin: "center bottom",
    transition: "background-color 0.9s ease, background-image 0.9s ease",
  };

  return (
    <>
      <div aria-hidden style={style} />
      <div
        aria-hidden
        style={{
          ...style,
          filter: "blur(36px) saturate(0.54)",
          opacity: 0.7,
          transform: "scale(1.14) translateY(3%)",
        }}
      />
    </>
  );
}
