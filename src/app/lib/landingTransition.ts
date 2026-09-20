/** One clock for the ink field and the mounted gallery's arrival. */
export const INK_ENTRY = {
  /** Landing sentence fades before the rest of the header moves. */
  descEnd: 360,
  /** Enter and the caret leave; the wordmark has not changed yet. */
  headerEnd: 720,
  labelsEnd: 1260,
  /** Landing 滲む nijimu row settles into the PageHeader seat. */
  markEnd: 1900,
  shrinkEnd: 1900,
  pathEnd: 3200,
  pathHoldEnd: 3650,
  unfoldEnd: 4550,
  growEnd: 5800,
  end: 6250,
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

export interface InkArrival {
  elapsed: number;
  reducedMotion: boolean;
}

export function inkGrowth(arrival: InkArrival): number {
  return smoothProgress(arrival.elapsed,
    arrival.reducedMotion ? 320 : INK_ENTRY.unfoldEnd,
    arrival.reducedMotion ? INK_ENTRY.reducedEnd : INK_ENTRY.growEnd);
}

/** Soft color behind the arriving artifact — a little ahead of the growth. */
export function inkWash(arrival: InkArrival): number {
  return smoothProgress(arrival.elapsed,
    arrival.reducedMotion ? 180 : INK_ENTRY.unfoldEnd - 600,
    arrival.reducedMotion ? INK_ENTRY.reducedEnd : INK_ENTRY.growEnd - 350);
}
