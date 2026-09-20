import { createContext, useContext } from "react";

/** Exit-to-landing choreography: popup, then the scene, then the field, then the header. */
export const LANDING_RETURN = {
  profileLeaveMs: 220,
  sceneFadeMs: 780,
  holdMs: 140,
  contentFadeMs: 920,
  headerDelayMs: 1280,
  headerFadeMs: 1100,
} as const;

export const LANDING_PAPER = "#e4e4e6";

export type LandingReturnPhase = "idle" | "scene-out" | "holding" | "landing";

export interface LandingReturnApi {
  phase: LandingReturnPhase;
  beginReturn: () => void;
}

export const LandingReturnContext = createContext<LandingReturnApi>({
  phase: "idle",
  beginReturn: () => {},
});

export function useLandingReturn() {
  return useContext(LandingReturnContext);
}
