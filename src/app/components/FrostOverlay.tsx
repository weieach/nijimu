/**
 * CSS frosted-glass stack used by the glass SceneViewer and the bubble
 * vividness slider. Blurs the 3D canvas underneath — not a material param.
 *
 * Three layers: a light full-frame blur, a heavier edge vignette, and a
 * soft-light noise grain. All filter params approach identity as
 * canvasBlurPx → 0 so vividness can slide to 1 without a hard cut.
 */

export const FROST_MAX_BLUR_PX = 6;

const NOISE_DATA_URI =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch' result='noise'/%3E%3CfeColorMatrix in='noise' type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export function vividnessToBlurPx(vividness: number): number {
  const v = Math.min(1, Math.max(0, vividness));
  return (1 - v) * FROST_MAX_BLUR_PX;
}

export function FrostOverlay({ canvasBlurPx }: { canvasBlurPx: number }) {
  if (canvasBlurPx <= 0) return null;

  // 0 at clear, 1 at glass-default frost — every filter must hit identity at 0.
  const t = canvasBlurPx / FROST_MAX_BLUR_PX;
  // Preserves the old max (1.14 at blur 6) while removing the old 1.02 floor.
  const brightness = 1 + canvasBlurPx * (0.02 + 0.02 / FROST_MAX_BLUR_PX);
  const contrast = 1 + canvasBlurPx * 0.05;
  const edgeSaturate = 1 + 0.2 * t;

  return (
    <>
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 10,
          backdropFilter: `blur(${canvasBlurPx}px) contrast(${contrast}) brightness(${brightness})`,
          WebkitBackdropFilter: `blur(${canvasBlurPx}px) contrast(${contrast}) brightness(${brightness})`,
          background: `rgba(255, 255, 255, ${canvasBlurPx * 0.008})`,
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 10,
          backdropFilter: `blur(${canvasBlurPx * 2.8}px) saturate(${edgeSaturate})`,
          WebkitBackdropFilter: `blur(${canvasBlurPx * 2.8}px) saturate(${edgeSaturate})`,
          maskImage:
            "radial-gradient(ellipse 88% 88% at 50% 50%, transparent 40%, black 90%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 88% 88% at 50% 50%, transparent 40%, black 90%)",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 11,
          opacity: Math.min(canvasBlurPx * 0.018, 0.12),
          backgroundImage: NOISE_DATA_URI,
          backgroundRepeat: "repeat",
          backgroundSize: "512px 512px",
          mixBlendMode: "soft-light",
        }}
      />
    </>
  );
}
