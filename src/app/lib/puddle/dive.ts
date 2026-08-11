// The "dive" gallery variant — flag + hand-tunable timing for the descent
// through the puddle surface into the artifact gallery.
//
// A/B flag: `nijimu.galleryVariant` in sessionStorage, toggled with the V key
// on the homescreen (same convention as the A/B/Z shader-variant shortcuts).
//   'dive'  — camera pushes through the water; puddle defocuses and settles
//             behind the viewer; one artifact resolves out of the blur.
//   'morph' — the existing BlobScene gallery (blobs gather into a carousel)
// 'dive' is the default and only runs on the puddle homescreen (B), triggered
// by G; everywhere else G falls back to the morph gallery, so the two can be
// compared in place.

export type GalleryVariant = "morph" | "dive";

const GALLERY_VARIANT_KEY = "nijimu.galleryVariant";

export function readGalleryVariant(): GalleryVariant {
  try {
    if (sessionStorage.getItem(GALLERY_VARIANT_KEY) === "morph") return "morph";
  } catch {
    // private mode
  }
  return "dive";
}

export function writeGalleryVariant(next: GalleryVariant): void {
  try {
    sessionStorage.setItem(GALLERY_VARIANT_KEY, next);
  } catch {
    // private mode — the toggle just won't survive a refresh
  }
}

/* ───────── hand-tunable descent ───────── */

export interface DiveGalleryTuning {
  /** Descent duration (surface → gallery), ms. */
  diveMs: number;
  /** Return duration (gallery → surface), ms. */
  surfaceMs: number;
  /** prefers-reduced-motion: cross-fade duration, ms (no dolly at all). */
  reducedMs: number;
  /** Easing curve for both directions. Swap for any (0..1)→(0..1) function. */
  ease: (t: number) => number;
  /** Dolly magnification at full depth — fraction of uv pulled toward the focus. */
  zoom: number;
  /** Defocus radius at full depth, in uv of the short screen edge. */
  blur: number;
  /** Contrast collapse toward the still-water color at full depth (0..1). */
  wash: number;
  /** Sim time scale behind the blur — the water keeps living, slowed. */
  gallerySimTimeScale: number;
  /** Fraction of dropStrength for the ripple an arrow press sends behind the
      blur. The ring is colorless on purpose — browsing memories must not dye
      the puddle; the color goes to the wash below instead. */
  arrowRippleStrength: number;
  /** Opacity of the artifact's background wash — the memory's color, laid on
      the space the artifact hangs in rather than into the water. */
  artifactWashOpacity: number;
  /** How far that wash color is lifted toward paper (0..1), so even the
      darkest palette entries tint the space instead of blotting it. */
  artifactWashLift: number;
  /** Crossfade for the wash color when an arrow press swaps memories, ms. */
  artifactWashFadeMs: number;
  /** How long the artifact takes to uncover from the mist — it starts only
      once the descent has fully settled (and on every arrow swap). */
  artifactResolveMs: number;
}

/** Standard ease-in-out cubic — gentle commit, gentle arrival. */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Entering the recording screen. Unlike the gallery descent there is no dolly
 * at all — the water stays exactly where it is and only softens, so the move
 * reads as the words coming out rather than a camera pushing in. Shared by the
 * homescreen's hand-off (PuddleScene) and the backdrop that catches it
 * (PuddleBackdrop), so the two can't drift apart.
 */
export const RECORD_DIVE = {
  /** Hand-off duration on the homescreen, ms. */
  diveMs: 850,
  /** No magnification — the surface never moves. */
  zoom: 0,
  /** Defocus at the hand-off, in uv of the short edge — a light haze. */
  blur: 0.0085,
  /** Contrast collapse at the hand-off (0..1). */
  wash: 0.3,
  /** Where the recording backdrop settles, as a fraction of the above. */
  restDepth: 0.7,
  /** Rise from the hand-off to that rest, ms. */
  entryMs: 900,
};

export const DIVE_TUNING: DiveGalleryTuning = {
  diveMs: 1700,
  surfaceMs: 1300,
  reducedMs: 700,
  ease: easeInOutCubic,
  // 0.8 → ~5x magnification at full depth (1 / (1 - zoom)). The dolly has to
  // clearly outrun the defocus or the move reads as "blurring out" instead of
  // pushing through the surface; magnification also accelerates naturally as
  // zoom climbs, like closing in on the water.
  zoom: 0.8,
  blur: 0.028,
  wash: 0.5,
  gallerySimTimeScale: 0.35,
  arrowRippleStrength: 0.3,
  // the palette is muted and the water is nearly white, so a timid wash is
  // invisible — this is the level at which two memories read as different
  // colors without the halo becoming a graphic element of its own
  artifactWashOpacity: 0.42,
  artifactWashLift: 0.22,
  artifactWashFadeMs: 1100,
  artifactResolveMs: 1800,
};
