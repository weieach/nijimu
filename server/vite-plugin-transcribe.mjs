import { transcribeAudio } from "./transcribe.mjs";

/**
 * Mounts POST /api/transcribe on the Vite dev server, mirroring the production
 * Vercel function in api/transcribe.mjs. The body is the raw audio recorded in
 * the browser; the API key stays server-side.
 * @param {{ apiKey: string | undefined, model?: string }} options
 * @returns {import("vite").Plugin}
 */
export function transcribeApiPlugin({ apiKey, model }) {
  return {
    name: "nijimu-transcribe-api",
    configureServer(server) {
      server.middlewares.use("/api/transcribe", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        /** @type {Buffer[]} */
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", async () => {
          const audio = Buffer.concat(chunks);
          const { status, body } = await transcribeAudio(
            audio,
            req.headers["content-type"],
            apiKey,
            model,
          );
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(body));
        });
      });
    },
  };
}
