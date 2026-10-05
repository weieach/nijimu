import { assessmentResponse, MAX_BODY_BYTES } from "./assessment-http.mjs";
export function assessmentApiPlugin(options) {
  return {
    name: "nijimu-assessment-api",
    configureServer(server) {
      server.middlewares.use("/api/assess-memory", (req, res) => {
        const send = ({ status, body }) => { if (res.writableEnded || res.destroyed) return; res.statusCode = status; res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(body)); };
        if (req.method !== "POST") { res.setHeader("Allow", "POST"); send({ status: 405, body: { error: "Method not allowed" } }); req.resume(); return; }
        let size = 0; const chunks = [];
        req.on("data", chunk => { size += chunk.length; if (size > MAX_BODY_BYTES) { send({ status: 413, body: { error: "Request is too large." } }); return; } chunks.push(chunk); });
        req.on("error", () => send({ status: 400, body: { error: "Request interrupted." } }));
        req.on("end", async () => { if (!res.writableEnded) send(await assessmentResponse(Buffer.concat(chunks).toString("utf8"), options)); });
      });
    },
  };
}
