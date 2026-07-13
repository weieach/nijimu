import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You polish spoken memories for nijimu, a quiet, contemplative memory-keeping app.

The user spoke a personal memory aloud and it was transcribed. Rewrite it as literary written prose.

Rules:
- Keep the first person voice. It is their memory, not a story about them.
- Preserve every factual detail — people, places, times, objects, feelings. Invent nothing.
- Keep roughly the same length as the original.
- Aim for quiet, unhurried, sensory prose. No melodrama, no clichés, no exclamation marks.
- Fix transcription artifacts (dropped punctuation, run-ons, filler words like "um" and "you know").
- Return only the rewritten text — no preamble, no quotes, no commentary.`;

export interface PolishSuccess {
  polished: string;
}
export interface PolishFailure {
  error: string;
}

/**
 * Rewrites a raw spoken transcript as literary prose via the Anthropic API.
 * Plain function so it can move to a serverless function unchanged.
 */
export async function polishTranscript(
  transcript: string,
  apiKey: string | undefined,
  model = "claude-opus-4-8",
): Promise<{ status: number; body: PolishSuccess | PolishFailure }> {
  if (!apiKey) {
    return {
      status: 500,
      body: { error: "ANTHROPIC_API_KEY is not set. Add it to nijimu/.env.local" },
    };
  }
  if (!transcript || transcript.trim().split(/\s+/).length < 3) {
    return { status: 400, body: { error: "Transcript is too short to polish." } };
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: transcript.trim() }],
    });

    if (response.stop_reason === "refusal") {
      return { status: 502, body: { error: "The model declined to rewrite this text." } };
    }

    const polished = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    if (!polished) {
      return { status: 502, body: { error: "The model returned an empty rewrite." } };
    }

    return { status: 200, body: { polished } };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return { status: 500, body: { error: "Invalid Anthropic API key." } };
    }
    if (err instanceof Anthropic.RateLimitError) {
      return { status: 429, body: { error: "Rate limited — try again in a moment." } };
    }
    if (err instanceof Anthropic.APIError) {
      return { status: 502, body: { error: `Anthropic API error (${err.status}).` } };
    }
    return { status: 502, body: { error: "Could not reach the Anthropic API." } };
  }
}
