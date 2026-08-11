// Plain JavaScript (not TypeScript) on purpose — same reason as polish.mjs:
// this file is bundled into a Vercel serverless function by @vercel/node, and
// keeping the function path free of TypeScript avoids its TS-compilation step.

const OPENAI_URL = "https://api.openai.com/v1/audio/transcriptions";

// Recordings cap at 60s of opus (~300 KB). The ceiling is really Vercel's 4.5 MB
// request body limit, so refuse anything approaching it rather than fail opaquely.
const MAX_BYTES = 4 * 1024 * 1024;
// A container header and little else — the microphone heard nothing.
const MIN_BYTES = 2 * 1024;

/** OpenAI infers the format from the filename, so the extension has to be right. */
const EXTENSIONS = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/mpga": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/flac": "flac",
};

/**
 * @param {string | null | undefined} contentType
 * @returns {{ mime: string, filename: string }}
 */
function describeAudio(contentType) {
  const mime = String(contentType || "").split(";")[0].trim().toLowerCase();
  const extension = EXTENSIONS[mime];
  return {
    mime: extension ? mime : "audio/webm",
    filename: `memory.${extension ?? "webm"}`,
  };
}

/**
 * Transcribes a spoken memory with OpenAI's speech-to-text API.
 * @param {Uint8Array} audio raw bytes of the recording
 * @param {string | null | undefined} contentType the recording's mime type
 * @param {string | undefined} apiKey
 * @param {string} [model]
 * @returns {Promise<{ status: number, body: { transcript: string } | { error: string } }>}
 */
export async function transcribeAudio(audio, contentType, apiKey, model = "gpt-4o-transcribe") {
  if (!audio || audio.byteLength < MIN_BYTES) {
    return { status: 400, body: { error: "That recording was empty." } };
  }
  if (audio.byteLength > MAX_BYTES) {
    return { status: 413, body: { error: "That recording is too long to transcribe." } };
  }
  if (!apiKey) {
    return {
      status: 500,
      body: { error: "OPENAI_API_KEY is not set. Add it to nijimu/.env.local" },
    };
  }

  const { mime, filename } = describeAudio(contentType);
  const form = new FormData();
  form.append("file", new Blob([audio], { type: mime }), filename);
  form.append("model", model);
  form.append("response_format", "json");

  let response;
  try {
    response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } catch {
    return { status: 502, body: { error: "Could not reach the transcription service." } };
  }

  if (!response.ok) {
    if (response.status === 401) return { status: 500, body: { error: "Invalid OpenAI API key." } };
    if (response.status === 429) {
      return { status: 429, body: { error: "Rate limited — try again in a moment." } };
    }
    const detail = await response
      .json()
      .then((body) => body?.error?.message)
      .catch(() => null);
    return {
      status: 502,
      body: { error: detail || `Transcription failed (${response.status}).` },
    };
  }

  const transcript = await response
    .json()
    .then((body) => String(body?.text ?? "").trim())
    .catch(() => "");

  if (!transcript) {
    return { status: 422, body: { error: "No words were heard in that recording." } };
  }

  return { status: 200, body: { transcript } };
}
