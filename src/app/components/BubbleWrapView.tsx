import { SANS, SERIF } from "../lib/theme";

export const WRAP_LABELS = ["wrap 01", "wrap 02"] as const;

type BubbleWrapViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIndex: number;
  onSelect: (index: number) => void;
};

/**
 * Bottom-left toggle + right panel for picking the memory wrap photo.
 * Same chrome family as lights / material / photo / form.
 */
export function BubbleWrapView({
  open,
  onOpenChange,
  selectedIndex,
  onSelect,
}: BubbleWrapViewProps) {
  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        style={{
          position: "fixed",
          left: 400,
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
        wrap
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
              wrap
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {WRAP_LABELS.map((label, i) => {
                const active = i === selectedIndex;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => onSelect(i)}
                    style={{
                      fontFamily: SANS,
                      fontSize: 13,
                      textTransform: "lowercase",
                      border: "none",
                      cursor: "pointer",
                      borderRadius: 100,
                      padding: "10px 14px",
                      textAlign: "left",
                      color: active ? "#ffffff" : "rgba(255,255,255,0.7)",
                      background: active ? "#7b7b87" : "rgba(255,255,255,0.08)",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
