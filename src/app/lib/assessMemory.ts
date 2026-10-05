import { ASSESSMENT_VERSION, isAssessment, validTranscript, type MemoryAssessment } from "../../../shared/memory-assessment.mjs";
export interface AssessmentResult { assessment: MemoryAssessment | null; model?: string; error: string | null }
/** Full transcript only; photo, audio, and geometry never go to this endpoint. */
export async function requestMemoryAssessment(transcript: string, signal?: AbortSignal): Promise<AssessmentResult> {
  if (!validTranscript(transcript)) return { assessment: null, error: "Add a memory of up to 5000 characters." };
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 18000);
  try {
    const res = await fetch("/api/assess-memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript }), signal: controller.signal });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { assessment: null, error: typeof body.error === "string" ? body.error : "The memory could not be read." };
    if (body.version !== ASSESSMENT_VERSION || !isAssessment(body.assessment, transcript)) return { assessment: null, error: "The memory reading did not pass validation." };
    return { assessment: body.assessment, model: typeof body.model === "string" ? body.model : undefined, error: null };
  } catch { return { assessment: null, error: controller.signal.aborted ? "The reading timed out or was cancelled. You can continue with a neutral form." : "The memory could not be read. You can continue with a neutral form." }; }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
