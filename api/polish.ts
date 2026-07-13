// Vercel serverless function — same handler the Vite dev server uses.
// Deployed at https://nijimu.space/api/polish
import { polishTranscript } from "../server/polish";

export async function POST(request: Request): Promise<Response> {
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
