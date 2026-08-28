import type { CSSProperties } from "react";
import { SANS, SERIF } from "../lib/theme";

export type BubbleMaterialParams = {
  roughness: number;
  reflectivity: number;
  transparency: number;
  fog: number;
};

type BubbleMaterialViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: BubbleMaterialParams;
  onChange: (next: BubbleMaterialParams) => void;
};

const SLIDERS: {
  id: keyof BubbleMaterialParams;
  label: string;
}[] = [
  { id: "roughness", label: "roughness" },
  { id: "reflectivity", label: "reflectivity" },
  { id: "transparency", label: "transparency" },
  { id: "fog", label: "fog" },
];

/**
 * Bottom-left toggle + right panel for the bubble-material knobs.
 * Does not enter geometry view — the live shader stays on screen.
 */
export function BubbleMaterialView({
  open,
  onOpenChange,
  value,
  onChange,
}: BubbleMaterialViewProps) {
  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        style={{
          position: "fixed",
          left: 120,
          bottom: 40,
          zIndex: 40,
          fontFamily: SANS,
          fontSize: 13,
          textTransform: "lowercase",
          letterSpacing: "0.02em",
          color: open ? "#ffffff" : "#7b7b87",
          background: open ? "#7b7b87" : "rgba(163, 167, 175, 0.28)",
          border: "none",
          borderRadius: 100,
          padding: "10px 18px",
          cursor: "pointer",
          backdropFilter: "blur(8px)",
        }}
      >
        material
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 30,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 120,
              right: 24,
              width: 220,
              pointerEvents: "auto",
              padding: "16px 16px 18px",
              borderRadius: 16,
              background: "rgba(72, 74, 80, 0.58)",
              backdropFilter: "blur(12px)",
              color: "rgba(255,255,255,0.9)",
              fontFamily: SANS,
              fontSize: 12,
            }}
          >
            <p
              style={{
                margin: "0 0 14px",
                fontFamily: SERIF,
                fontStyle: "italic",
                fontSize: 14,
                opacity: 0.85,
              }}
            >
              material
            </p>

            {SLIDERS.map((s) => (
              <label key={s.id} style={labelStyle}>
                {s.label} · {value[s.id].toFixed(2)}
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={value[s.id]}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      [s.id]: parseFloat(e.target.value),
                    })
                  }
                  style={{ width: "100%", margin: "6px 0 12px" }}
                />
              </label>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

const labelStyle: CSSProperties = {
  display: "block",
  textTransform: "lowercase",
  opacity: 0.75,
  fontSize: 11,
  letterSpacing: "0.03em",
};
