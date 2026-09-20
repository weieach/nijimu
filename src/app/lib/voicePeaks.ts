/** Separate syllables can overlap on the water without reacting to meter jitter. */
export const VOICE_PEAK_MIN_MS = 650;
export const POND_DROP_SLOTS = 12;

/** Tracks a crest across frames, including slowly rising, softly spoken words. */
export function createVoicePeakDetector() {
  let valley = 1;
  let peak = 0;
  let rising = false;
  let lastPeakAt = -Infinity;
  let lastSampleAt = 0;
  let recentRange = .06;
  let base = 0;
  return (level: number, now: number): number | null => {
    const elapsed = Math.min(250, Math.max(0, now - lastSampleAt));
    lastSampleAt = now;
    // Forget early loud words as microphone gain and speaking distance change.
    recentRange *= Math.exp(-elapsed / 1200);
    valley = Math.min(valley, level);
    const rise = Math.max(.012, Math.min(.035, recentRange * .16));
    if (!rising && level - valley >= rise) {
      rising = true;
      peak = level;
      base = valley;
    }
    if (!rising) return null;
    peak = Math.max(peak, level);
    const prominence = peak - base;
    recentRange = Math.max(recentRange, prominence);
    // Confirm the local maximum on its falling edge, not on a single noisy frame.
    if (peak - level < Math.max(.004, prominence * .18)) return null;
    const crest = peak;
    rising = false;
    valley = level;
    peak = 0;
    if (crest < .022 || now - lastPeakAt < VOICE_PEAK_MIN_MS) return null;
    lastPeakAt = now;
    return crest;
  };
}

/** Immediate first ring; accents sometimes echo at separate nearby locations. */
export function createVoiceRippleBurstPlanner() {
  let lastBurstAt = -Infinity;
  let recentPeak = .12;
  let lastAt = 0;
  return (level: number, now: number, random = Math.random) => {
    recentPeak = Math.max(level, recentPeak * Math.exp(-Math.max(0, now - lastAt) / 4500));
    lastAt = now;
    const accent = level / Math.max(.04, recentPeak);
    const canBurst = now - lastBurstAt >= 2400 && accent > .78;
    const count = canBurst && random() < .72 ? (accent > .94 && random() < .45 ? 3 : 2) : 1;
    if (count > 1) lastBurstAt = now;
    const spacing = 170 + random() * 90;
    return Array.from({ length: count }, (_, index) => ({
      delayMs: index * spacing,
      strength: ( .85 + accent * .2) * Math.pow(.78, index),
    }));
  };
}

export interface VoiceRippleSpot { x: number; y: number; strength: number }

/** Screen-space bounds stay in the foreground at either mobile or desktop aspect. */
export function pickVoiceRippleSpot(previous: VoiceRippleSpot | null, random = Math.random): VoiceRippleSpot {
  let x = .22 + random() * .56;
  const y = .56 + random() * .20;
  // Keep neighbouring syllables from repeatedly landing on the same patch.
  if (previous && Math.hypot(x - previous.x, y - previous.y) < .17) {
    x = previous.x < .5 ? .62 + random() * .16 : .22 + random() * .16;
  }
  return { x, y, strength: 1 };
}
