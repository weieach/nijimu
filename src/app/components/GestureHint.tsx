import shapePalmUrl from "../../assets/gesture-shape-palm.png";
import shapePrayerUrl from "../../assets/gesture-shape-prayer.png";
import feelingHandUrl from "../../assets/gesture-feeling-horizontal.png";
import distanceOpenUrl from "../../assets/gesture-distance-open.png";
import distanceFistUrl from "../../assets/gesture-distance-fist.png";
import colorPinchUrl from "../../assets/gesture-color-pinch.png";

export type GestureHintKind = "shape" | "feeling" | "distance" | "color";

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
        position: "absolute",
        top: 210,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 20,
        pointerEvents: "none",
        display: "block",
        width: kind === "shape" ? 180 : 96,
        height: 88,
        /* `active` means a real hand is driving the gesture — hide the hint. */
        opacity: active ? 0 : 0.92,
        transition: "opacity 0.9s ease",
      }}
    >
      {/* key remounts the frames so tab switches always restart a visible cycle */}
      <div key={kind} className="nijimu-gesture-hint-stage">
        {kind === "shape" ? (
          <>
            <img className="nijimu-gesture-shape-prayer" src={shapePrayerUrl} alt="" />
            <img className="nijimu-gesture-shape-left" src={shapePalmUrl} alt="" />
            <img className="nijimu-gesture-shape-right" src={shapePalmUrl} alt="" />
          </>
        ) : kind === "feeling" ? (
          <img className="nijimu-gesture-feeling" src={feelingHandUrl} alt="" />
        ) : kind === "color" ? (
          <img className="nijimu-gesture-color" src={colorPinchUrl} alt="" />
        ) : (
          <>
            <img className="nijimu-gesture-distance-fist" src={distanceFistUrl} alt="" />
            <img className="nijimu-gesture-distance-open" src={distanceOpenUrl} alt="" />
          </>
        )}
      </div>

      <style>{`
        .nijimu-gesture-hint-stage {
          position: relative;
          width: 100%;
          height: 100%;
        }
        .nijimu-gesture-hint img {
          position: absolute;
          left: 0;
          right: 0;
          top: 0;
          bottom: 0;
          margin: auto;
          display: block;
          object-fit: contain;
          max-width: none;
        }
        /* Sized so stroke weight matches feeling (~84px wide). */
        .nijimu-gesture-shape-prayer {
          width: 64px;
          height: 80px;
          animation: nijimuGesturePrayer 2.8s ease-in-out infinite;
        }
        .nijimu-gesture-shape-left,
        .nijimu-gesture-shape-right {
          width: 56px;
          height: 78px;
        }
        .nijimu-gesture-shape-left {
          animation: nijimuGestureShapeLeft 2.8s ease-in-out infinite;
        }
        .nijimu-gesture-shape-right {
          animation: nijimuGestureShapeRight 2.8s ease-in-out infinite;
        }
        .nijimu-gesture-feeling {
          width: 84px;
          height: 42px;
          opacity: 1;
          animation: nijimuGestureLift 2.4s ease-in-out infinite;
        }
        .nijimu-gesture-color {
          width: 58px;
          height: 58px;
          opacity: 1;
          animation: nijimuGestureColorSweep 2.8s ease-in-out infinite;
        }
        .nijimu-gesture-distance-fist {
          width: 52px;
          height: 52px;
          animation: nijimuGestureFist 2.4s ease-in-out infinite;
        }
        .nijimu-gesture-distance-open {
          width: 74px;
          height: 74px;
          animation: nijimuGesturePalm 2.4s ease-in-out infinite;
        }

        /* Prayer fades out; two upright palms slide apart in parallel. */
        @keyframes nijimuGesturePrayer {
          0%, 18% { opacity: 1; transform: translateY(2px); }
          40%, 70% { opacity: 0; transform: translateY(0); }
          92%, 100% { opacity: 1; transform: translateY(2px); }
        }
        @keyframes nijimuGestureShapeLeft {
          0%, 18% { opacity: 0; transform: translateX(-6px) scaleX(-1); }
          40%, 70% { opacity: 1; transform: translateX(-36px) scaleX(-1); }
          92%, 100% { opacity: 0; transform: translateX(-6px) scaleX(-1); }
        }
        @keyframes nijimuGestureShapeRight {
          0%, 18% { opacity: 0; transform: translateX(6px); }
          40%, 70% { opacity: 1; transform: translateX(36px); }
          92%, 100% { opacity: 0; transform: translateX(6px); }
        }
        @keyframes nijimuGestureLift {
          0%, 14% { transform: translateY(8px); }
          50%, 64% { transform: translateY(-8px); }
          100% { transform: translateY(8px); }
        }
        @keyframes nijimuGestureColorSweep {
          0%, 12% { transform: translateX(-18px); }
          50%, 62% { transform: translateX(18px); }
          100% { transform: translateX(-18px); }
        }
        @keyframes nijimuGestureFist {
          0%, 18% { opacity: 1; transform: scale(0.88); }
          42%, 68% { opacity: 0; transform: scale(0.96); }
          92%, 100% { opacity: 1; transform: scale(0.88); }
        }
        @keyframes nijimuGesturePalm {
          0%, 18% { opacity: 0; transform: scale(0.92); }
          42%, 68% { opacity: 1; transform: scale(1); }
          92%, 100% { opacity: 0; transform: scale(0.92); }
        }

        @media (prefers-reduced-motion: reduce) {
          .nijimu-gesture-hint img {
            animation: none !important;
          }
          .nijimu-gesture-shape-prayer { opacity: 0; }
          .nijimu-gesture-shape-left { opacity: 1; transform: translateX(-36px) scaleX(-1); }
          .nijimu-gesture-shape-right { opacity: 1; transform: translateX(36px); }
          .nijimu-gesture-feeling { opacity: 1; transform: none; }
          .nijimu-gesture-color { opacity: 1; transform: none; }
          .nijimu-gesture-distance-fist { opacity: 0; }
          .nijimu-gesture-distance-open { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
