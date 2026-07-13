export interface PolishResult {
  polished: string | null;
  error: string | null;
}

/** Calls the polish endpoint. Never throws — errors come back as { error }. */
export async function requestPolish(transcript: string): Promise<PolishResult> {
  try {
    const res = await fetch("/api/polish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.polished) {
      return { polished: null, error: body.error ?? `Request failed (${res.status})` };
    }
    return { polished: body.polished, error: null };
  } catch {
    return { polished: null, error: "Could not reach the polish service." };
  }
}
