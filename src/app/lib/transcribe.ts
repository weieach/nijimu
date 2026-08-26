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

const STORAGE_KEY = "nijimu.transcription.v1";

/* Transcription outlives the recording screen: the words are still being heard
   while the water fades out. The request is kept here rather than in
   `location.state` (which only holds serializable values) and handed to the
   transcript screen by id. A sessionStorage backup covers remounts / HMR. */
const pending = new Map<string, PendingTranscription>();

function persist(id: string, result: TranscriptionResult) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ id, ...result }));
  } catch {
    // private mode / quota — the in-memory map is enough for the happy path
  }
}

function readPersisted(id: string): TranscriptionResult | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { id?: string; transcript?: string | null; error?: string | null };
    if (saved.id !== id) return null;
    return { transcript: saved.transcript ?? null, error: saved.error ?? null };
  } catch {
    return null;
  }
}

/**
 * Starts transcribing in the background and returns the id to carry to the
 * transcript screen in `location.state`.
 */
export function beginTranscription(audio: Blob): string {
  const id = `t${Date.now()}`;
  const entry: PendingTranscription = { promise: null!, result: null };
  entry.promise = requestTranscription(audio).then((result) => {
    entry.result = result;
    persist(id, result);
    return result;
  });
  pending.clear();
  pending.set(id, entry);
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return id;
}

/** The in-flight (or already settled) transcription for an id, if it's still around. */
export function getTranscription(id: string | undefined): PendingTranscription | null {
  if (!id) return null;
  const live = pending.get(id);
  if (live) return live;

  // Remount / HMR lost the Map — recover from the sessionStorage backup.
  const saved = readPersisted(id);
  if (!saved) return null;
  const recovered: PendingTranscription = {
    promise: Promise.resolve(saved),
    result: saved,
  };
  pending.set(id, recovered);
  return recovered;
}
