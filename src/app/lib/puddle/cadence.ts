// Ripple cadence — the one place that decides how often memories surface on
// the puddle homescreen (both the opening reveal and the idle drip after it).
//
// The dial is *density*, not delay. A drop's caption lives `captionLifeMs`, so
// if the typical gap between drops is captionLifeMs / concurrency, then
// `concurrency` is roughly how many memories share the water at any moment.
// Every other number here is a fraction or multiple of that typical gap, so
// moving one dial re-times the whole sequence coherently.
//
// Deliberate consequence: adding memories lengthens the reveal instead of
// crowding it. Gaps ease from tight to wide across the sequence, so early
// drops fill the field quickly and later ones arrive more spaced. The idle
// drip runs at its own (sparser) density, so there is no seam where the intro
// ends.

export interface RippleCadenceTuning {
  /** How long a caption — and near enough its ripple — lives on the surface. */
  captionLifeMs: number;
  /** Memories sharing the water during the opening reveal. The density dial. */
  introConcurrency: number;
  /** …and once the field has settled into its idle drip. */
  idleConcurrency: number;
  /** Quiet before the first drop lands. */
  openingDelayMs: number;
  /** Gap multiplier at the start of the reveal — under 1 packs early drops
      close together so the field fills quickly at first. */
  introGapEarly: number;
  /** Gap multiplier by the last drop — over 1 spaces the later arrivals more
      widely, so the stagger grows as the reveal runs on. */
  introGapLate: number;
  /** How many early drops skip the pair/pause shaping and stay evenly spaced
      (still under the progressive stretch). After that, rain rhythm takes over. */
  openingEvenDrops: number;
  /** ±fraction wobble on every gap — rain finding its rhythm, not a metronome. */
  gapJitter: number;
  /** Chance a drop arrives as a close pair with the one before it… */
  pairChance: number;
  /** …and the fraction of the typical gap such a pair gets. */
  pairGapFraction: number;
  /** Chance of a long pause instead… */
  pauseChance: number;
  /** …and its multiple of the typical gap. */
  pauseGapFactor: number;
  /** Floor under every gap, so two drops never truly collide. */
  minGapMs: number;
  /** >1 leans the idle drip toward its long end, so a quick succession stays
      a surprise. The mean is still set by `idleConcurrency`. */
  dripBias: number;
  /** Once the last caption has dissolved, the water is never bare longer than
      this — the cap on the idle drip's longest gap. */
  maxQuietMs: number;
}

export const RIPPLE_CADENCE: RippleCadenceTuning = {
  captionLifeMs: 7000,
  // ~2.8 s between opening drops: the next memory arrives while the last is
  // still legible, so the field feels inhabited without ever crowding.
  introConcurrency: 2.5,
  idleConcurrency: 1.0,
  openingDelayMs: 1000,
  introGapEarly: 0.55,
  introGapLate: 1.75,
  openingEvenDrops: 3,
  gapJitter: 0.35,
  pairChance: 0.14,
  pairGapFraction: 0.22,
  pauseChance: 0.12,
  pauseGapFactor: 1.8,
  minGapMs: 800,
  dripBias: 1.6,
  maxQuietMs: 3200,
};

/** The gap a given density implies, in ms. */
export function typicalGapMs(concurrency: number): number {
  return RIPPLE_CADENCE.captionLifeMs / Math.max(concurrency, 0.05);
}

function jittered(ms: number): number {
  const j = RIPPLE_CADENCE.gapJitter;
  return ms * (1 + (Math.random() * 2 - 1) * j);
}

/** Mostly the typical gap; a minority of close pairs, a minority of pauses. */
function shapedGap(typical: number): number {
  const { pairChance, pairGapFraction, pauseChance, pauseGapFactor, minGapMs } = RIPPLE_CADENCE;
  const r = Math.random();
  const base =
    r < pairChance
      ? typical * pairGapFraction
      : r < pairChance + pauseChance
        ? typical * pauseGapFactor
        : typical;
  return Math.max(jittered(base), minGapMs);
}

/** Gap grows across the reveal: tight early, more staggered later (ease-in). */
function progressiveGapFactor(dropIndex: number, count: number): number {
  const { introGapEarly: early, introGapLate: late } = RIPPLE_CADENCE;
  if (count <= 1) return early;
  const t = dropIndex / (count - 1);
  return early + (late - early) * t * t;
}

/**
 * When each intro drop lands, in ms from mount, in reveal order.
 * `endMs` is when the idle drip should take over — one gap past the last drop.
 */
export function introSchedule(count: number): { times: number[]; endMs: number } {
  const typical = typicalGapMs(RIPPLE_CADENCE.introConcurrency);
  const times: number[] = [];
  let at = RIPPLE_CADENCE.openingDelayMs;
  for (let i = 0; i < count; i++) {
    times.push(at);
    const gap = i < RIPPLE_CADENCE.openingEvenDrops ? jittered(typical) : shapedGap(typical);
    at += gap * progressiveGapFactor(i, count);
  }
  return { times, endMs: at };
}

/** Milliseconds until the next idle drip — long-leaning, but never bare too long. */
export function dripGapMs(): number {
  const { minGapMs, dripBias, captionLifeMs, maxQuietMs } = RIPPLE_CADENCE;
  const mean = typicalGapMs(RIPPLE_CADENCE.idleConcurrency);
  // a pow-biased draw over [min, max] averages min + (max - min) * b / (b + 1);
  // solve for the max that lands the mean on the density dial, then clamp so
  // the water is never bare for longer than a caption life + maxQuietMs
  const span = ((mean - minGapMs) * (dripBias + 1)) / dripBias;
  const max = Math.min(minGapMs + span, captionLifeMs + maxQuietMs);
  return minGapMs + (max - minGapMs) * Math.pow(Math.random(), 1 / dripBias);
}
