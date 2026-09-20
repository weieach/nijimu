import { useState } from "react";
import { SERIF, TITLE, BODY_SIZE } from "../lib/theme";
import { GlassPane } from "./GlassPane";
import { PillButton } from "./PillButton";
import { TextButton } from "./TextButton";

/** Intentionally shown on every recording attempt, regardless of past visits
 * or whether the browser already remembers microphone permission. */
export function RecordingInstructionsDialog({ busy, error, onStart, onSkip, onClose }: {
  busy: boolean;
  error: string | null;
  onStart: () => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <GlassPane
      open={open}
      onClose={() => { if (!busy) setOpen(false); }}
      onExited={onClose}
      labelledBy="recording-instructions-title"
      closeLabel="back to the pond"
      closeDisabled={busy}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          width: "100%",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8a8a96" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0" />
          <path d="M12 18v3" />
          <path d="M8 21h8" />
        </svg>
        <h2
          id="recording-instructions-title"
          style={{
            ...TITLE,
            color: "#7b7b87",
            margin: 0,
            textAlign: "center",
          }}
        >
          Before you begin
        </h2>
      </div>

      <div
        id="recording-instructions-body"
        style={{
          fontFamily: SERIF,
          fontSize: BODY_SIZE,
          fontWeight: 400,
          lineHeight: 1.65,
          color: "rgba(123, 123, 135, 0.82)",
          textAlign: "left",
          width: "100%",
        }}
      >
        <p style={{ margin: 0 }}>
          If you’d like to sculpt an artifact from your own story, allow microphone access in your browser.
        </p>
        <p style={{ margin: "14px 0 0" }}>
          Otherwise, select “Skip to sample transcript” to experience the full nijimu flow with a sample story.
        </p>
      </div>

      {error && (
        <p role="alert" style={{ fontFamily: SERIF, fontSize: BODY_SIZE, lineHeight: 1.5, color: "#7b7b87", margin: 0, textAlign: "center" }}>
          {error}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, width: "100%" }}>
        <PillButton
          label={busy ? "Opening microphone…" : "Allow microphone & record"}
          onClick={onStart}
          disabled={busy}
          transform="none"
          style={{ width: "100%", alignSelf: "stretch" }}
        />
        <TextButton
          label="Skip to sample transcript"
          trailing="››"
          onClick={onSkip}
          disabled={busy}
        />
      </div>
    </GlassPane>
  );
}
