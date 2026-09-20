import type { CSSProperties } from "react";

export type GestureHintKind = "shape" | "feeling" | "distance";

const STROKE = {
  fill: "none",
  stroke: "#7b7b87",
  strokeWidth: 1.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Open palm as separate strokes — wrist, palm, fingers, thumb. */
function OpenHand() {
  return (
    <g>
      <path {...STROKE} d="M27 92c1 7 4 11 11 11s10-4 11-11" />
      <path {...STROKE} d="M24 58c-2.5 9 .5 24 14 26 13.5-1 17-15 14.5-26-1.2-6-4.5-9-14-9s-13 3-14.5 9z" />
      <path {...STROKE} d="M26 54c-1.2-18 1-30 4-33" />
      <path {...STROKE} d="M33 50c-.2-22 1-34 3.2-37" />
      <path {...STROKE} d="M41 49c.8-24 1.4-38 2.2-41" />
      <path {...STROKE} d="M49 52c2.2-20 3.4-31 4.6-34" />
      <path {...STROKE} d="M55 62c12-7 16 2 11.5 12" />
    </g>
  );
}

/** Fist: compact palm, short knuckles, tucked thumb. */
function FistHand() {
  return (
    <g>
      <path {...STROKE} d="M28 90c1 6 4 10 10 10s9-4 10-10" />
      <path {...STROKE} d="M24 58c-3 8 0 22 14 24 14-1 17-14 14-24-1-7-5-12-14-12s-12 5-14 12z" />
      <path {...STROKE} d="M28 48c-1-8 1-12 3-13" />
      <path {...STROKE} d="M35 46c0-9 1-13 3-14" />
      <path {...STROKE} d="M43 46c1-9 2-13 3.5-14" />
      <path {...STROKE} d="M50 49c2-7 3-11 4-12" />
      <path {...STROKE} d="M22 62c-8-4-9-14-2-18 4-2 9 0 11 5" />
    </g>
  );
}

const wrapStyle: CSSProperties = {
  position: "absolute",
  top: 232,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 10,
  pointerEvents: "none",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  height: 80,
  overflow: "visible",
};

export function GestureHint({
  kind,
  active,
}: {
  kind: GestureHintKind;
  active: boolean;
}) {
  return (
    <div
      className="nijimu-gesture-hint"
      aria-hidden
      data-kind={kind}
      style={{
        ...wrapStyle,
        opacity: active ? 0 : 0.88,
        transition: "opacity 0.9s ease",
      }}
    >
      {kind === "shape" ? (
        <svg
          key="shape"
          width="168"
          height="80"
          viewBox="0 0 168 100"
          overflow="visible"
        >
          <g
            className="nijimu-gesture-spread"
            style={{ "--spread": "-16px" } as CSSProperties}
          >
            <g transform="translate(10 8) scale(-1 1) translate(-72 0)">
              <OpenHand />
            </g>
          </g>
          <g
            className="nijimu-gesture-spread"
            style={{ "--spread": "16px" } as CSSProperties}
          >
            <g transform="translate(90 8)">
              <OpenHand />
            </g>
          </g>
        </svg>
      ) : kind === "feeling" ? (
        <svg
          key="feeling"
          width="72"
          height="96"
          viewBox="0 0 72 110"
          overflow="visible"
        >
          <g className="nijimu-gesture-lift">
            <g transform="translate(4 12)">
              <OpenHand />
            </g>
          </g>
        </svg>
      ) : (
        <svg
          key="distance"
          width="72"
          height="96"
          viewBox="0 0 72 110"
          overflow="visible"
        >
          <g className="nijimu-gesture-fist" transform="translate(4 14)">
            <FistHand />
          </g>
          <g className="nijimu-gesture-open" transform="translate(4 12)">
            <OpenHand />
          </g>
        </svg>
      )}

      <style>{`
        .nijimu-gesture-spread {
          animation: nijimuGestureSpread 2.4s ease-in-out infinite;
          transform-box: fill-box;
          transform-origin: center;
        }
        .nijimu-gesture-lift {
          animation: nijimuGestureLift 2.4s ease-in-out infinite;
          transform-box: fill-box;
          transform-origin: center;
        }
        .nijimu-gesture-fist {
          animation: nijimuGestureFist 2.4s ease-in-out infinite;
        }
        .nijimu-gesture-open {
          animation: nijimuGesturePalm 2.4s ease-in-out infinite;
        }

        @keyframes nijimuGestureSpread {
          0%, 14% { transform: translateX(0); }
          50%, 64% { transform: translateX(var(--spread)); }
          100% { transform: translateX(0); }
        }
        @keyframes nijimuGestureLift {
          0%, 14% { transform: translateY(8px); }
          50%, 64% { transform: translateY(0); }
          100% { transform: translateY(8px); }
        }
        @keyframes nijimuGestureFist {
          0%, 14% { opacity: 1; }
          38%, 62% { opacity: 0; }
          88%, 100% { opacity: 1; }
        }
        @keyframes nijimuGesturePalm {
          0%, 14% { opacity: 0; }
          38%, 62% { opacity: 1; }
          88%, 100% { opacity: 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .nijimu-gesture-spread,
          .nijimu-gesture-lift,
          .nijimu-gesture-fist,
          .nijimu-gesture-open {
            animation: none !important;
          }
          .nijimu-gesture-spread { transform: translateX(calc(var(--spread) * 0.45)); }
          .nijimu-gesture-lift { transform: none; }
          .nijimu-gesture-fist { opacity: 0; }
          .nijimu-gesture-open { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
