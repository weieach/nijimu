/** Shared contract: used by the server and browser. No provider code or secrets. */
export const ASSESSMENT_VERSION = "memory-reading-v1";
export const MAX_TRANSCRIPT_LENGTH = 5000;
export const SCORE_KEYS = ["orientation", "comfort", "intensity", "discomfort", "disruption", "mixedness"];
const scoreProperties = Object.fromEntries(SCORE_KEYS.map(key => [key, {
  type: "number", description: key === "orientation" ? "-1 inward to +1 outward" : "0 to 1",
}]));
export const ASSESSMENT_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    ...scoreProperties,
    insufficientEvidence: { type: "boolean" },
    summary: { type: "string", description: "Brief whole-memory interpretation, at most 300 characters; no diagnosis." },
    beats: { type: "array", description: "Up to four meaningful beats, in narrative order. Exact short quotes from the transcript.", items: {
      type: "object", additionalProperties: false,
      properties: { quote: { type: "string" }, reading: { type: "string" }, orientation: scoreProperties.orientation, intensity: scoreProperties.intensity },
      required: ["quote", "reading", "orientation", "intensity"],
    } },
  },
  required: [...SCORE_KEYS, "insufficientEvidence", "summary", "beats"],
};
export function validTranscript(value) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= MAX_TRANSCRIPT_LENGTH;
}
export function isAssessment(value, transcript) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (Object.keys(value).some(key => !ASSESSMENT_SCHEMA.required.includes(key))) return false;
  for (const key of SCORE_KEYS) {
    const n = value[key];
    if (typeof n !== "number" || !Number.isFinite(n) || n < (key === "orientation" ? -1 : 0) || n > 1) return false;
  }
  if (typeof value.insufficientEvidence !== "boolean" || typeof value.summary !== "string" || value.summary.length > 300) return false;
  if (!Array.isArray(value.beats) || value.beats.length > 4 || (!value.insufficientEvidence && value.beats.length === 0)) return false;
  return value.beats.every(beat => beat && typeof beat === "object" &&
    Object.keys(beat).length === 4 &&
    typeof beat.quote === "string" && beat.quote.trim().length > 0 && beat.quote.length <= 500 &&
    (transcript === undefined || transcript.includes(beat.quote)) &&
    typeof beat.reading === "string" && beat.reading.length <= 300 &&
    Number.isFinite(beat.orientation) && beat.orientation >= -1 && beat.orientation <= 1 &&
    Number.isFinite(beat.intensity) && beat.intensity >= 0 && beat.intensity <= 1);
}
