// The water hand-off between the puddle homescreen and the recording screen.
//
// A WebGL sim's state lives in GPU textures tied to its canvas, so the only
// way the ripples survive a route change is to carry the canvas itself across:
// the homescreen offers its {canvas, sim} instead of disposing them, and the
// recording backdrop adopts and keeps stepping them. Whatever was in motion —
// the rebound of the press, a caption's ripple mid-life — simply plays out.

import { PuddleSimulation } from "./simulation";

export interface WaterHandoff {
  canvas: HTMLCanvasElement;
  sim: PuddleSimulation;
}

let pending: WaterHandoff | null = null;

/** Park the living water for the next screen. An unclaimed offer is disposed. */
export function offerWater(next: WaterHandoff): void {
  if (pending) pending.sim.dispose();
  pending = next;
}

/** Claim the water, if a screen just handed it off. */
export function takeWater(): WaterHandoff | null {
  const h = pending;
  pending = null;
  return h;
}
