/** One clock for the ink field and the mounted gallery's arrival. */
export const INK_ENTRY = {
  headerEnd: 420,
  labelsEnd: 900,
  shrinkEnd: 1900,
  ringEnd: 3200,
  ringHoldEnd: 3650,
  unfoldEnd: 4550,
  growEnd: 5800,
  end: 6250,
  reducedEnd: 700,
} as const;

export const INK_POINTER_SIZE = 6;

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
