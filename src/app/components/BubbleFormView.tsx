import { SANS, SERIF } from "../lib/theme";
import {
  ARTIFACT_CATEGORIES,
  ArtifactCategory,
  ArtifactForm,
  CATEGORY_LABELS,
  SuperParams,
} from "../lib/superformula";

type BubbleFormViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: ArtifactForm;
  /** Grow a new form in this category — the same one again draws another deviation. */
  onSelectCategory: (category: ArtifactCategory) => void;
};

const fmt = (v: number) => String(Math.round(v * 100) / 100);
const setLine = (p: SuperParams) => `${fmt(p.m)}, ${fmt(p.n1)}, ${fmt(p.n2)}, ${fmt(p.n3)}`;

/**
 * Bottom-left toggle + right panel for previewing superformula categories.
 * A memory's form is assigned, not chosen; this is for looking at the range.
 */
export function BubbleFormView({
  open,
  onOpenChange,
  form,
  onSelectCategory,
}: BubbleFormViewProps) {
  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        style={{
          position: "fixed",
          left: 24,
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
        form
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
              width: 244,
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
              form
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 6,
              }}
            >
              {ARTIFACT_CATEGORIES.map((category) => {
                const active = category === form.category;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => onSelectCategory(category)}
                    style={{
                      fontFamily: SANS,
                      fontSize: 12,
                      textTransform: "lowercase",
                      border: "none",
                      cursor: "pointer",
                      borderRadius: 100,
                      padding: "8px 12px",
                      textAlign: "left",
                      whiteSpace: "nowrap",
                      color: active ? "#ffffff" : "rgba(255,255,255,0.7)",
                      background: active ? "#7b7b87" : "rgba(255,255,255,0.08)",
                    }}
                  >
                    {CATEGORY_LABELS[category]}
                  </button>
                );
              })}
            </div>
            <div
              style={{
                marginTop: 14,
                lineHeight: 1.6,
                opacity: 0.7,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {form.hybridOf && (
                <p style={{ margin: 0 }}>
                  {CATEGORY_LABELS[form.hybridOf[0]]} over {CATEGORY_LABELS[form.hybridOf[1]]}
                </p>
              )}
              <p style={{ margin: 0 }}>top ({setLine(form.top)})</p>
              <p style={{ margin: 0 }}>side ({setLine(form.side)})</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
