import type { CSSProperties } from "react";
import { SANS, SERIF } from "../lib/theme";
import {
  AmbientFill,
  EditableLight,
  TransformMode,
  createAreaLight,
  createPointLight,
} from "../lib/sceneLights";

type LightGeometryViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lights: EditableLight[];
  onLightsChange: (lights: EditableLight[]) => void;
  ambients: AmbientFill[];
  onAmbientsChange: (ambients: AmbientFill[]) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  transformMode: TransformMode;
  onTransformModeChange: (mode: TransformMode) => void;
};

const MODES: { id: TransformMode; label: string }[] = [
  { id: "translate", label: "move" },
  { id: "rotate", label: "rotate" },
  { id: "scale", label: "scale" },
];

function kindLabel(kind: EditableLight["kind"]): string {
  if (kind === "point") return "point";
  if (kind === "area") return "area";
  return "dir";
}

/**
 * Bottom-left toggle + overlay chrome for the form-page light geometry view.
 * The 3D canvas stays underneath; this only draws the UI frame.
 */
export function LightGeometryView({
  open,
  onOpenChange,
  lights,
  onLightsChange,
  ambients,
  onAmbientsChange,
  selectedId,
  onSelect,
  transformMode,
  onTransformModeChange,
}: LightGeometryViewProps) {
  const selected = lights.find((l) => l.id === selectedId) ?? null;

  const patchSelected = (patch: Partial<EditableLight>) => {
    if (!selected) return;
    onLightsChange(
      lights.map((l) => (l.id === selected.id ? { ...l, ...patch } : l)),
    );
  };

  const removeSelected = () => {
    if (!selected) return;
    onLightsChange(lights.filter((l) => l.id !== selected.id));
    onSelect(null);
  };

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
        lights
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
          {/* top bar */}
          <div
            style={{
              position: "absolute",
              top: 72,
              left: "50%",
              transform: "translateX(-50%)",
              pointerEvents: "auto",
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              borderRadius: 100,
              background: "rgba(90, 92, 98, 0.55)",
              backdropFilter: "blur(10px)",
            }}
          >
            {MODES.map((m) => {
              const active = transformMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onTransformModeChange(m.id)}
                  style={{
                    fontFamily: SANS,
                    fontSize: 12,
                    textTransform: "lowercase",
                    border: "none",
                    cursor: "pointer",
                    borderRadius: 100,
                    padding: "8px 14px",
                    color: active ? "#2a2a2e" : "rgba(255,255,255,0.85)",
                    background: active ? "rgba(237,237,238,0.95)" : "transparent",
                  }}
                >
                  {m.label}
                </button>
              );
            })}
            <span
              style={{
                width: 1,
                height: 18,
                background: "rgba(255,255,255,0.25)",
                margin: "0 4px",
              }}
            />
            <button
              type="button"
              onClick={() => {
                const next = createPointLight();
                onLightsChange([...lights, next]);
                onSelect(next.id);
              }}
              style={addBtnStyle}
            >
              + point
            </button>
            <button
              type="button"
              onClick={() => {
                const next = createAreaLight();
                onLightsChange([...lights, next]);
                onSelect(next.id);
              }}
              style={addBtnStyle}
            >
              + area
            </button>
          </div>

          {/* side panel */}
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
                margin: "0 0 12px",
                fontFamily: SERIF,
                fontStyle: "italic",
                fontSize: 14,
                opacity: 0.85,
              }}
            >
              geometry view
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
              {lights.map((l) => {
                const active = l.id === selectedId;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => onSelect(l.id)}
                    style={{
                      textAlign: "left",
                      border: "none",
                      cursor: "pointer",
                      borderRadius: 8,
                      padding: "8px 10px",
                      fontFamily: SANS,
                      fontSize: 12,
                      textTransform: "lowercase",
                      color: active ? "#2a2a2e" : "rgba(255,255,255,0.88)",
                      background: active
                        ? "rgba(237,237,238,0.92)"
                        : "rgba(255,255,255,0.06)",
                    }}
                  >
                    {kindLabel(l.kind)} · {l.id}
                  </button>
                );
              })}
            </div>

            {selected ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={labelStyle}>
                  color
                  <input
                    type="color"
                    value={selected.color}
                    onChange={(e) => patchSelected({ color: e.target.value })}
                    style={{
                      width: "100%",
                      height: 28,
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      marginTop: 4,
                    }}
                  />
                </label>
                <label style={labelStyle}>
                  intensity · {selected.intensity.toFixed(2)}
                  <input
                    type="range"
                    min={0}
                    max={selected.kind === "directional" ? 12 : 8}
                    step={0.05}
                    value={selected.intensity}
                    onChange={(e) =>
                      patchSelected({ intensity: parseFloat(e.target.value) })
                    }
                    style={{ width: "100%", marginTop: 6 }}
                  />
                </label>
                {selected.kind !== "directional" && (
                  <button
                    type="button"
                    onClick={removeSelected}
                    style={{
                      ...addBtnStyle,
                      marginTop: 4,
                      background: "rgba(180,90,90,0.35)",
                    }}
                  >
                    remove
                  </button>
                )}
              </div>
            ) : (
              <p style={{ margin: 0, opacity: 0.55, lineHeight: 1.4 }}>
                select a light in the list or click its helper in the viewport.
              </p>
            )}

            <div
              style={{
                marginTop: 16,
                paddingTop: 12,
                borderTop: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              <p style={{ ...labelStyle, marginBottom: 8 }}>ambient</p>
              {ambients.map((a) => (
                <div key={a.id} style={{ marginBottom: 8 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <input
                      type="color"
                      value={a.color}
                      onChange={(e) =>
                        onAmbientsChange(
                          ambients.map((x) =>
                            x.id === a.id ? { ...x, color: e.target.value } : x,
                          ),
                        )
                      }
                      style={{
                        width: 28,
                        height: 22,
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                      }}
                    />
                    <span style={{ opacity: 0.7 }}>{a.id}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={0.05}
                    value={a.intensity}
                    onChange={(e) =>
                      onAmbientsChange(
                        ambients.map((x) =>
                          x.id === a.id
                            ? { ...x, intensity: parseFloat(e.target.value) }
                            : x,
                        ),
                      )
                    }
                    style={{ width: "100%" }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const addBtnStyle: CSSProperties = {
  fontFamily: SANS,
  fontSize: 12,
  textTransform: "lowercase",
  border: "none",
  cursor: "pointer",
  borderRadius: 100,
  padding: "8px 12px",
  color: "rgba(255,255,255,0.9)",
  background: "rgba(255,255,255,0.12)",
};

const labelStyle: CSSProperties = {
  display: "block",
  textTransform: "lowercase",
  opacity: 0.75,
  fontSize: 11,
  letterSpacing: "0.03em",
};
