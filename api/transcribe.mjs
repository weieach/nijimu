// Vercel serverless function — plain JavaScript so @vercel/node bundles it
// with esbuild and never invokes a TypeScript compile step.
// Deployed at https://nijimu.space/api/transcribe
import { transcribeAudio } from "../server/transcribe.mjs";

/**
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function POST(request) {
  let audio;
  try {
    audio = new Uint8Array(await request.arrayBuffer());
  } catch {
    return Response.json({ error: "Could not read the recording." }, { status: 400 });
  }

  const { status, body } = await transcribeAudio(
    audio,
    request.headers.get("content-type"),
    process.env.OPENAI_API_KEY,
    process.env.TRANSCRIBE_MODEL || undefined,
  );
  return Response.json(body, { status });
}
