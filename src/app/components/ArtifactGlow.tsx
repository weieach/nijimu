import { useCallback, useId, useRef } from "react";
import { SINK_WASH } from "../lib/pondCamera";

/*
 * The memory turned to light: its silhouette filled with one even colour and
 * blooming outward in that same colour. Drawn as an SVG filter over the
 * artifact's own canvas, so it follows the exact outline of whatever form it
 * is, and the glass underneath is left untouched — at 0 the filter is removed
 * and the artifact is exactly as it was.
 */

/** The colour of the light at the surface — the same wash the eye passes through. */
export const ARTIFACT_LIGHT = SINK_WASH;

/** The glass is mostly see-through; the light must read as a solid body. */
const ALPHA_GAIN = 4;
/** Two blooms: a close one that thickens the edge, a wide one that radiates. */
const NEAR_BLUR_PX = 10;
const FAR_BLUR_PX = 38;
const NEAR_STRENGTH = 1.6;
const FAR_STRENGTH = 1.9;
/** At full white the light is brighter and reaches further than the wash-coloured glow. */
const WHITE_REACH = 0.5;
const WHITE_BOOST = 0.8;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function rgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Identity at 0; at 1 every pixel is `rgb`, its coverage lifted to solid. */
function flatMatrix(k: number, [r, g, b]: [number, number, number]): string {
  const keep = 1 - k;
  return [
    keep, 0, 0, 0, k * r,
    0, keep, 0, 0, k * g,
    0, 0, keep, 0, k * b,
    0, 0, 0, 1 + k * (ALPHA_GAIN - 1), 0,
  ].join(" ");
}

/**
 * `filter` is the SVG to render once anywhere on the page; `apply(el, k, w)`
 * sets the glow on an element: `k` 0..1 how much of it is light, `w` 0..1
 * how far that light has gone from the wash's colour to pure white. `bleed`
 * is how far past the element's box the bloom may spread, as a share of its
 * size.
 */
export function useArtifactGlow(color: string, bleed = 0.15) {
  const id = `artifact-glow-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const matrixRef = useRef<SVGFEColorMatrixElement>(null);
  const nearBlurRef = useRef<SVGFEGaussianBlurElement>(null);
  const farBlurRef = useRef<SVGFEGaussianBlurElement>(null);
  const nearAlphaRef = useRef<SVGFEFuncAElement>(null);
  const farAlphaRef = useRef<SVGFEFuncAElement>(null);
  const rgb = rgb01(color);
  const [r, g, b] = rgb;

  const apply = useCallback(
    (el: HTMLElement | SVGElement | null | undefined, amount: number, whiteness = 0) => {
      if (!el) return;
      const k = clamp01(amount);
      if (k <= 0.001) {
        el.style.filter = "";
        return;
      }
      const w = clamp01(whiteness);
      const tint: [number, number, number] = [r + (1 - r) * w, g + (1 - g) * w, b + (1 - b) * w];
      const reach = k * (1 + WHITE_REACH * w);
      const strength = k * (1 + WHITE_BOOST * w);
      matrixRef.current?.setAttribute("values", flatMatrix(k, tint));
      nearBlurRef.current?.setAttribute("stdDeviation", String(NEAR_BLUR_PX * reach));
      farBlurRef.current?.setAttribute("stdDeviation", String(FAR_BLUR_PX * reach));
      nearAlphaRef.current?.setAttribute("slope", String(NEAR_STRENGTH * strength));
      farAlphaRef.current?.setAttribute("slope", String(FAR_STRENGTH * strength));
      el.style.filter = `url(#${id})`;
    },
    [id, r, g, b],
  );

  const region = `${-bleed * 100}%`;
  const span = `${(1 + bleed * 2) * 100}%`;
  const filter = (
    <svg aria-hidden width="0" height="0" style={{ position: "absolute", width: 0, height: 0, pointerEvents: "none" }}>
      <filter id={id} x={region} y={region} width={span} height={span} colorInterpolationFilters="sRGB">
        <feColorMatrix ref={matrixRef} in="SourceGraphic" type="matrix" values={flatMatrix(0, rgb)} result="flat" />
        <feGaussianBlur ref={nearBlurRef} in="flat" stdDeviation="0" result="nearBlur" />
        <feComponentTransfer in="nearBlur" result="near">
          <feFuncA ref={nearAlphaRef} type="linear" slope="0" />
        </feComponentTransfer>
        <feGaussianBlur ref={farBlurRef} in="flat" stdDeviation="0" result="farBlur" />
        <feComponentTransfer in="farBlur" result="far">
          <feFuncA ref={farAlphaRef} type="linear" slope="0" />
        </feComponentTransfer>
        <feMerge>
          <feMergeNode in="far" />
          <feMergeNode in="near" />
          <feMergeNode in="flat" />
        </feMerge>
      </filter>
    </svg>
  );

  return { filter, apply };
}
