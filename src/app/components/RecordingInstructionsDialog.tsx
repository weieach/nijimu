import { useEffect, useRef } from "react";
import { CHROME_GRAY } from "../lib/colors";
import { SERIF } from "../lib/theme";
import { PillButton } from "./PillButton";

/** Intentionally shown on every recording attempt, regardless of past visits
 * or whether the browser already remembers microphone permission. */
export function RecordingInstructionsDialog({ busy, error, onStart, onSkip, onClose }: {
  busy: boolean;
  error: string | null;
  onStart: () => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    titleRef.current?.focus();
    return () => dialog.close();
  }, []);

  return <dialog ref={dialogRef} className="recording-instructions"
    aria-labelledby="recording-instructions-title" aria-describedby="recording-instructions-body"
    aria-busy={busy}
    onKeyDown={e => e.stopPropagation()}
    onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}
    style={{ position: "fixed", inset: 0, margin: "auto", width: "min(440px, calc(100vw - 40px))", maxHeight: "calc(100dvh - 48px)",
      boxSizing: "border-box", padding: "clamp(24px, 5vw, 40px)", borderRadius: 24,
      border: "1px solid rgba(255,255,255,.65)", background: "rgba(240,241,237,.96)",
      boxShadow: "0 16px 80px rgba(70,85,80,.12)", color: CHROME_GRAY,
      fontFamily: SERIF, textAlign: "center", pointerEvents: "auto" }}>
    <style>{`.recording-instructions::backdrop { background: rgba(90,105,100,.16); backdrop-filter: blur(8px); } .recording-instructions p + p { margin-top: 14px; }`}</style>
    <h2 ref={titleRef} id="recording-instructions-title" tabIndex={-1}
      style={{ fontSize: 23, fontWeight: 400, margin: "0 0 22px", outline: "none" }}>before you begin</h2>
    <div id="recording-instructions-body" style={{ fontSize: 15, lineHeight: 1.65 }}>
      <p>if your browser asks, allow microphone access. recording begins as soon as your microphone is ready.</p>
      <p>start with a moment, a feeling, or a detail that stayed with you. there’s no need to find the perfect words.</p>
      <p>you don’t need to keep holding. speak for up to a minute, then tap stop. you’ll review your words next.</p>
    </div>
    {error && <p role="alert" style={{ fontSize: 14, lineHeight: 1.5 }}>{error}</p>}
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 26 }}>
      <PillButton label={busy ? "opening microphone…" : "allow microphone & record"} onClick={onStart} disabled={busy} />
      <PillButton label="skip to transcript" variant="outline" onClick={onSkip} disabled={busy} />
      <small style={{ fontSize: 12 }}>explore with a sample memory</small>
      <button disabled={busy} onClick={onClose} style={{ border: "none", background: "none", color: "inherit", fontFamily: "inherit", fontSize: 13, padding: 8, cursor: busy ? "default" : "pointer" }}>back to the pond</button>
    </div>
  </dialog>;
}
