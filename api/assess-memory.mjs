import { assessmentResponse, MAX_BODY_BYTES } from "../server/assessment-http.mjs";
export async function POST(request) {
  const chunks = []; let size = 0;
  const reader = request.body?.getReader();
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) { await reader.cancel(); return Response.json({ error: "Request is too large." }, { status: 413 }); }
        chunks.push(Buffer.from(value));
      }
    } catch { return Response.json({ error: "Request interrupted." }, { status: 400 }); }
  }
  const { status, body } = await assessmentResponse(Buffer.concat(chunks).toString("utf8"), {
    apiKey: process.env.OPENAI_API_KEY, model: process.env.ASSESS_MODEL || undefined,
  });
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
