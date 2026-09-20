export const POND_TRAIL_SLOTS = 10;
export const POND_TRAIL_LIFETIME = 0.9;
const SAMPLE_INTERVAL = 0.1;

export interface TrailPoint { x: number; z: number; time: number }
export interface TrailAnchor extends TrailPoint { curveStart?: TrailPoint }

/** Midpoint quadratic curves share both endpoints and tangent direction.
 * This follows turns without joining isolated straight cursor samples. */
export function samplePondTrail(previous: TrailAnchor | null, point: TrailPoint | null) {
  if (!point) return { anchor: null, segment: null };
  if (!previous || point.time - previous.time > 0.25) return { anchor: point, segment: null };
  const distance = Math.hypot(point.x - previous.x, point.z - previous.z);
  if (distance > 12) return { anchor: point, segment: null };
  if (point.time - previous.time < SAMPLE_INTERVAL || distance < 0.035) {
    return { anchor: previous, segment: null };
  }
  const to = { x: (previous.x + point.x) / 2, z: (previous.z + point.z) / 2,
    time: (previous.time + point.time) / 2 };
  return { anchor: { ...point, curveStart: to }, segment: {
    from: previous.curveStart ?? previous, control: previous, to,
    strength: Math.min(1, 0.35 + distance * 0.6),
  } };
}
