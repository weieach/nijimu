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
  ringEnd: 3200,
  ringHoldEnd: 3650,
  unfoldEnd: 4550,
  growEnd: 5800,
  end: 6250,
  reducedEnd: 700,
} as const;

export const INK_POINTER_SIZE = 12;

/** Chronological seat for the landing → carousel hand-off: not the first
 * three, not the last three — any one of the middle memories. */
export function pickLandingGalleryIndex(count: number): number {
  const margin = 3;
  if (count <= margin * 2) return Math.max(0, Math.floor((count - 1) / 2));
  const lo = margin;
  const hi = count - margin - 1;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/** Oldest at twelve o'clock, newer memories following clockwise, just as
 * the archive's right-hand neighbours do. Equal dates keep archive order. */
export function inkRingPoint(width: number, height: number, index: number, count: number) {
  const radius = Math.max(60, Math.min(width * 0.34, height * 0.3));
  const angle = index / Math.max(1, count) * Math.PI * 2;
  return { x: width / 2 + Math.sin(angle) * radius, y: height * 0.47 - Math.cos(angle) * radius };
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
