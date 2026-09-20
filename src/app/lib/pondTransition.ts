import { smoothProgress } from "./landingTransition";

/** Tip the opaque rim, lift it clear, then bring the lake in. Reversible. */
export const POND_ENTRY = { rimEnd: 2900, pondStart: 2450, end: 3950, reducedEnd: 450 } as const;

export const pondRimTravel = (height: number) => height * 1.2;

/** Feather the rising panel's leading edge; remove the mask only once that
 * edge reaches the viewport boundary. The same edge works in reverse. */
export function pondSurfaceMask(arrival: number) {
  const remaining = 1 - Math.max(0, Math.min(1, arrival));
  return remaining === 0 ? undefined
    : `linear-gradient(to bottom, transparent 0, rgba(0,0,0,.16) ${remaining * 96}px, rgba(0,0,0,.65) ${remaining * 264}px, black ${remaining * 480}px)`;
}

/** One shared 3D transform for the circular distribution. Only the seats move:
 * each artifact keeps its own orientation, including its existing idle motion. */
export function pondRimPose(progress: number, reduced: boolean) {
  return {
    tilt: reduced ? 0 : smoothProgress(progress, 0, .58) * Math.PI / 2,
    lift: reduced ? progress : smoothProgress(progress, .2, 1),
  };
}

export function pondRimSeat(x: number, y: number, cx: number, apex: number, height: number, progress: number, reduced: boolean) {
  const pose = pondRimPose(progress, reduced);
  const localY = y - apex;
  const z = -localY * Math.sin(pose.tilt);
  const scale = height * 1.8 / (height * 1.8 - z);
  // Looking up from beneath the rising rim reveals its lower face.
  const eyeY = height * 1.15;
  return { x: cx + (x - cx) * scale,
    y: eyeY + (apex + localY * Math.cos(pose.tilt) - eyeY) * scale - pondRimTravel(height) * pose.lift,
    scale, z, tilt: pose.tilt };
}

export function pondTransition(elapsed: number, reduced: boolean) {
  if (reduced) {
    const arrival = smoothProgress(elapsed, 0, POND_ENTRY.reducedEnd);
    return { departure: arrival, galleryOpacity: 1, arrival };
  }
  return {
    // Pose already eases the rotation and lift. Easing this clock again
    // compresses most of the travel into a rushed burst midway through.
    departure: Math.max(0, Math.min(1, elapsed / POND_ENTRY.rimEnd)),
    galleryOpacity: 1,
    arrival: smoothProgress(elapsed, POND_ENTRY.pondStart, POND_ENTRY.end),
  };
}
