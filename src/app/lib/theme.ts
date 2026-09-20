// Shared font stacks — the single place to change typography.
// SERIF is Latin-first: English renders in Rowan; CJK glyphs fall through to GenRyuMin.
export const SERIF = "Rowan, 'GenRyuMin2 TW', Georgia, serif";
/** A hair of air for Rowan italic titles — the italic sits tight without it. */
export const SERIF_ITALIC_TRACKING = "0.012em";
export const SERIF_CJK = "'GenRyuMin2 TW', Rowan, Georgia, serif";
export const SERIF_DISPLAY = "'Exposure Trial Plus', Rowan, 'GenRyuMin2 TW', Georgia, serif";
export const SERIF_EXPOSURE = "'Exposure Trial', Rowan, 'GenRyuMin2 TW', Georgia, serif";
export const SANS = "Switzer, sans-serif";
export const SANS_UI = "'SF Pro', system-ui, sans-serif";
/** Quiet captions — transcribing, recording notes, pane asides. */
export const NOTE_SIZE = "clamp(11px, 2.4vw, 12px)";
/** Uppercase meta labels. */
export const LABEL_SIZE = "clamp(10px, 2.2vw, 11px)";
export const META = {
  fontFamily: SANS,
  fontSize: LABEL_SIZE,
  fontWeight: 500,
  letterSpacing: "0.5px",
  color: "#9b9ba3",
  textTransform: "uppercase",
} as const;
/** Pane body copy and highlight prompts. */
export const BODY_SIZE = "clamp(14px, 3.2vw, 15px)";
/** Shared size for instructional copy (pond invitation, thought prompts, hold hint). */
export const INSTRUCTION_SIZE = "clamp(14px, 3.2vw, 16px)";
/** Spoken transcript on the pond. */
export const PROSE_SIZE = "clamp(13px, 2.4vw, 15px)";
/** Pill and text-button labels. */
export const BUTTON_SIZE = "clamp(14px, 2.8vw, 16px)";
export const BUTTON_SIZE_SM = "clamp(13px, 2.6vw, 14px)";
/** Exposure title — glass panes and pond overlay headings. */
export const TITLE_SIZE = "clamp(20px, 4.6vw, 24px)";
export const TITLE_TRACKING = "0.01em";
export const TITLE = {
  fontFamily: SERIF_EXPOSURE,
  fontSize: TITLE_SIZE,
  fontWeight: 400,
  lineHeight: "140%",
  letterSpacing: TITLE_TRACKING,
  fontSynthesis: "none",
} as const;
