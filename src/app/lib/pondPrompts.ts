import { smoothProgress } from "./landingTransition";

/** First pond visit plays the invitation; later visits start at rest. */
let pondInstructionSeen = false;
export const hasSeenPondInstruction = () => pondInstructionSeen;
export const markPondInstructionSeen = () => { pondInstructionSeen = true; };

export const POND_THOUGHTS = [
  { text: "when was the last time your heart felt heavy?", x: -2.4, z: -4 },
  { text: "who made an ordinary day feel different?", x: 2.6, z: -7.2 },
  { text: "what is a small moment you wish you could return to?", x: -1.6, z: -10.4 },
];

/** One drop, then its words, then stillness before the next pair. Seconds. */
export const POND_PROMPT_PERIOD = 8.4;
const unit = (value: number) => Math.max(0, Math.min(1, value));
export function pondPromptCue(elapsed: number) {
  const cycle = Math.floor(Math.max(0, elapsed) / POND_PROMPT_PERIOD);
  const age = Math.max(0, elapsed) % POND_PROMPT_PERIOD;
  const appear = unit(smoothProgress(age, .55, 1.45));
  return {
    index: cycle % POND_THOUGHTS.length,
    age,
    opacity: unit(appear * (1 - smoothProgress(age, 5.7, 7))),
    lift: (1 - appear) * 9,
    ripple: unit(smoothProgress(age, 0, .1) * (1 - smoothProgress(age, 6.6, 8))),
  };
}
export type PondPromptCue = ReturnType<typeof pondPromptCue>;
