export interface TranscriptionResult {
  transcript: string | null;
  error: string | null;
}

/** Sends the recorded audio to /api/transcribe. Never throws — errors come back as { error }. */
export async function requestTranscription(audio: Blob): Promise<TranscriptionResult> {
  try {
    const res = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": audio.type || "audio/webm" },
      body: audio,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.transcript) {
      return { transcript: null, error: body.error ?? `Request failed (${res.status})` };
    }
    return { transcript: body.transcript, error: null };
  } catch {
    return { transcript: null, error: "Could not reach the transcription service." };
  }
}

interface PendingTranscription {
  promise: Promise<TranscriptionResult>;
  /** Set once it settles, so a re-mounted transcript screen doesn't wait again. */
  result: TranscriptionResult | null;
}

/* Transcription outlives the recording screen: the words are still being heard
   while the water fades out. The request is kept here rather than in
   `location.state` (which only holds serializable values) and handed to the
   transcript screen by id, so a stale one can never be picked up by accident. */
const pending = new Map<string, PendingTranscription>();

/**
 * Starts transcribing in the background and returns the id to carry to the
 * transcript screen in `location.state`.
 */
export function beginTranscription(audio: Blob): string {
  const id = `t${Date.now()}`;
  const entry: PendingTranscription = { promise: null!, result: null };
  entry.promise = requestTranscription(audio).then((result) => {
    entry.result = result;
    return result;
  });
  pending.clear();
  pending.set(id, entry);
  return id;
}

/** The in-flight (or already settled) transcription for an id, if it's still around. */
export function getTranscription(id: string | undefined): PendingTranscription | null {
  return id ? (pending.get(id) ?? null) : null;
}
