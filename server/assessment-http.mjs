import { assessMemory } from "./assess-memory.mjs";
export const MAX_BODY_BYTES = 24000;
/** Shared bounded JSON parsing for development and Vercel. */
export async function assessmentResponse(raw, { apiKey, model } = {}) {
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return { status: 413, body: { error: "Request is too large." } };
  let input;
  try { input = JSON.parse(raw); } catch { return { status: 400, body: { error: "Invalid JSON body." } }; }
  return assessMemory(input?.transcript, apiKey, model);
}
