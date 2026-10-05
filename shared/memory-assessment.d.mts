export interface MemoryAssessment {
  orientation: number;
  comfort: number;
  intensity: number;
  discomfort: number;
  disruption: number;
  mixedness: number;
  insufficientEvidence: boolean;
  summary: string;
  beats: { quote: string; reading: string; orientation: number; intensity: number }[];
}
export const ASSESSMENT_VERSION: string;
export const MAX_TRANSCRIPT_LENGTH: number;
export const SCORE_KEYS: readonly ("orientation" | "comfort" | "intensity" | "discomfort" | "disruption" | "mixedness")[];
export const ASSESSMENT_SCHEMA: Record<string, unknown>;
export function validTranscript(value: unknown): value is string;
export function isAssessment(value: unknown, transcript?: string): value is MemoryAssessment;
