// Vercel serverless function — plain JavaScript so @vercel/node bundles it
// with esbuild and never invokes a TypeScript compile step.
// Deployed at https://nijimu.space/api/polish
import { polishTranscript } from "../server/polish.mjs";

/**
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function POST(request) {
  let transcript = "";
  try {
    const json = await request.json();
    transcript = String(json?.transcript ?? "");
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { status, body } = await polishTranscript(
    transcript,
    process.env.ANTHROPIC_API_KEY,
    process.env.POLISH_MODEL || undefined,
  );
  return Response.json(body, { status });
}
