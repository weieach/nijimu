/** One clock for the ink field and the mounted gallery's arrival. */
export const INK_ENTRY = {
  /** Landing sentence fades before the rest of the header moves. */
  descEnd: 470,
  /** Enter and the caret leave; the wordmark has not changed yet. */
  headerEnd: 940,
  labelsEnd: 1640,
  /** Landing 滲む nijimu row settles into the PageHeader seat. */
  markEnd: 2470,
  shrinkEnd: 2470,
  pathEnd: 4230,
  /** A beat on the gathered dots, not a stop. It used to run 450ms, which read
   *  as the entry stalling before the artifacts opened. */
  pathHoldEnd: 4420,
  unfoldEnd: 6110,
  growEnd: 7670,
  end: 8125,
  reducedEnd: 700,
} as const;

export const INK_POINTER_SIZE = 12;

/** Leave room for the longer, receding tail and two foreground memories. */
export function pickLandingGalleryIndex(count: number): number {
  if (count < 8) return Math.max(0, count - 3);
  const lo = 5;
  const hi = count - 3;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

export function smoothProgress(time: number, start: number, end: number): number {
  const t = Math.max(0, Math.min(1, (time - start) / (end - start)));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Easing for the landing entry only. smoothProgress is quintic smootherstep,
 * which is flat in both velocity and acceleration at each end: a stage spends
 * its first fifth covering 5% of its distance, so the eye reads the join
 * between stages as a stall, and the middle has to rush to make up for it
 * (peak speed 1.875x the average).
 *
 * A raised cosine leaves and arrives more openly while peaking lower — 1.571x
 * the average speed, and a sixth less peak acceleration — so the same distance
 * in the same time feels carried rather than flung. The pond keeps
 * smoothProgress; its prompt cadence is asserted against that exact curve.
 */
export function flowProgress(time: number, start: number, end: number): number {
  const t = Math.max(0, Math.min(1, (time - start) / (end - start)));
  return (1 - Math.cos(Math.PI * t)) / 2;
}

export interface InkArrival {
  elapsed: number;
  reducedMotion: boolean;
}

export function inkGrowth(arrival: InkArrival): number {
  return flowProgress(arrival.elapsed,
    arrival.reducedMotion ? 320 : INK_ENTRY.unfoldEnd,
    arrival.reducedMotion ? INK_ENTRY.reducedEnd : INK_ENTRY.growEnd);
}

/** Soft color behind the arriving artifact — a little ahead of the growth. */
export function inkWash(arrival: InkArrival): number {
  return flowProgress(arrival.elapsed,
    arrival.reducedMotion ? 180 : INK_ENTRY.unfoldEnd - 600,
    arrival.reducedMotion ? INK_ENTRY.reducedEnd : INK_ENTRY.growEnd - 350);
}
