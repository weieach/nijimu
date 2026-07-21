import { polishTranscript } from "./polish.mjs";

/**
 * Mounts POST /api/polish on the Vite dev server, mirroring the production
 * Vercel function in api/polish.mjs. The API key stays server-side; it is
 * never part of the client bundle.
 * @param {{ apiKey: string | undefined, model?: string }} options
 * @returns {import("vite").Plugin}
 */
export function polishApiPlugin({ apiKey, model }) {
  return {
    name: "nijimu-polish-api",
    configureServer(server) {
      server.middlewares.use("/api/polish", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        let raw = "";
        req.on("data", (chunk) => (raw += chunk));
        req.on("end", async () => {
          res.setHeader("Content-Type", "application/json");
          let transcript = "";
          try {
            transcript = String(JSON.parse(raw)?.transcript ?? "");
          } catch {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "Invalid JSON body" }));
            return;
          }

          const { status, body } = await polishTranscript(transcript, apiKey, model);
          res.statusCode = status;
          res.end(JSON.stringify(body));
        });
      });
    },
  };
}
