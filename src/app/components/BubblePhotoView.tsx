import type { CSSProperties } from "react";
import { SANS, SERIF } from "../lib/theme";
import type { MemoryPhotoFilter } from "./MemoryPhotoLayer";

type BubblePhotoViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: MemoryPhotoFilter;
  onChange: (next: MemoryPhotoFilter) => void;
  /** Whole-canvas frost. Independent of the photo overlay shader. */
  vividness: number;
  onVividnessChange: (next: number) => void;
};

const SLIDERS: {
  id: keyof MemoryPhotoFilter;
  label: string;
  min: number;
  max: number;
}[] = [
  { id: "brightness", label: "brightness", min: 0, max: 2 },
  { id: "contrast", label: "contrast", min: 0, max: 2 },
  { id: "saturate", label: "saturate", min: 0, max: 2 },
  { id: "hue", label: "hue", min: 0, max: 1 },
  { id: "colorize", label: "colorize", min: 0, max: 1 },
  { id: "feeling", label: "feeling", min: 0, max: 1 },
  { id: "opacity", label: "opacity", min: 0, max: 1 },
];

function formatValue(id: keyof MemoryPhotoFilter, value: number): string {
  if (id === "hue") return `${Math.round(value * 360)}°`;
  return value.toFixed(2);
}

/**
 * Bottom-left toggle + right panel for grading the memory-photo overlay.
 * The bubble film shader is left alone.
 */
export function BubblePhotoView({
  open,
  onOpenChange,
  value,
  onChange,
  vividness,
  onVividnessChange,
}: BubblePhotoViewProps) {
  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        style={{
          position: "fixed",
          left: 216,
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
        photo
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
              photo
            </p>

            <label style={labelStyle}>
              vividness · {vividness.toFixed(2)}
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={vividness}
                onChange={(e) => onVividnessChange(parseFloat(e.target.value))}
                style={{ width: "100%", margin: "6px 0 16px" }}
              />
            </label>

            {SLIDERS.map((s) => (
              <label key={s.id} style={labelStyle}>
                {s.label} · {formatValue(s.id, value[s.id])}
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
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
