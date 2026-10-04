import * as THREE from "three";

/*
 * The film look: what a photo gains when it is "developed" onto the strip.
 *
 * A single GLSL function, filmLook(photo, uv), applied wherever the strip
 * shows its window, so the same look can be judged flat on /lab/film and
 * then ride the strip in the descent. The model follows GrainLab's pipeline
 * (MIT, github.com/seamys/grainlab — tone curve → grade → fade → halation →
 * bloom → grain → vignette → leak) rewritten for the GPU: blurs come from
 * the photo's own mipmaps instead of box filters, grain is a hash per cell.
 *
 * The reference is Yoshiyuki Okuyama — the "flowers" frames the user gave
 * (110 film through curtains: cool-green, soft, lifted) and his wider work
 * (y-okuyama.com, measured across fifty frames): blacks that land near 10%
 * and go blue-grey rather than black, highlights that roll to a cream, colour
 * kept fresh rather than drained, and above all light getting in — broad
 * warm leaks and flare that eat into the frame from one side. The leak is
 * therefore on by default, placed by the seed so each strip's differs.
 */

export interface FilmLook {
  /** 0 = the photo as uploaded, 1 = the full look. */
  amount: number;
  /** In stops. */
  exposure: number;
  /** Where black lands, 0–0.25. */
  lift: number;
  /** 1 = as shot; under 1 flattens around middle grey. */
  contrast: number;
  /** How far the highlights roll off toward a shoulder, 0–1. */
  shoulder: number;
  /** 1 = as shot. */
  saturation: number;
  /** Midtone cast: -1 cool-green … 0 none … +1 warm. */
  lean: number;
  /** Shadow / highlight crossover: shadows a touch blue and dull, highlights cream, 0–1. */
  split: number;
  /** Diffusion — how much of the image is the blurred image, 0–1. */
  soft: number;
  /** Glow from the brights, 0–1. */
  bloom: number;
  /** A warm fringe around the brights, 0–1. */
  halation: number;
  /** Grain amplitude, 0–0.1. */
  grain: number;
  /** Grain size relative to the frame (1 ≈ 1200 grains across a 36mm frame), 1–4. */
  grainSize: number;
  /** Corner darkening, 0–1. */
  vignette: number;
  /** Uneven development, 0–1. */
  mottle: number;
  /** Light let into the camera from one side — the side comes from the seed — 0–1. */
  leak: number;
}

export const FILM_LOOK_DEFAULT: FilmLook = {
  amount: 1,
  exposure: 0.1,
  lift: 0.1,
  contrast: 0.82,
  shoulder: 0.65,
  saturation: 0.88,
  lean: -0.35,
  split: 0.6,
  soft: 0.5,
  bloom: 0.5,
  halation: 0.15,
  grain: 0.035,
  grainSize: 2.2,
  vignette: 0.1,
  mottle: 0.35,
  leak: 0.4,
};

export const FILM_LOOK_KEYS = Object.keys(FILM_LOOK_DEFAULT) as (keyof FilmLook)[];

/** `lift` → `uFilmLift`, and so on. */
export function filmLookUniformName(key: keyof FilmLook): string {
  return `uFilm${key[0].toUpperCase()}${key.slice(1)}`;
}

/**
 * The uniforms filmLook() reads. Spread them into a ShaderMaterial's uniforms
 * next to the photo sampler the shader passes in.
 */
export function filmLookUniforms(look: FilmLook = FILM_LOOK_DEFAULT): Record<string, THREE.IUniform> {
  const uniforms: Record<string, THREE.IUniform> = {
    uFilmSeed: { value: Math.random() * 10 },
  };
  for (const key of FILM_LOOK_KEYS) uniforms[filmLookUniformName(key)] = { value: look[key] };
  return uniforms;
}

export function setFilmLook(uniforms: Record<string, THREE.IUniform>, look: FilmLook): void {
  for (const key of FILM_LOOK_KEYS) {
    const u = uniforms[filmLookUniformName(key)];
    if (u) u.value = look[key];
  }
}

/** The diffusion samples the photo's mipmaps; make sure a texture carries them. */
export function prepareFilmPhoto(texture: THREE.Texture): THREE.Texture {
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/**
 * The look itself. Declares its uniforms; paste once into a fragment shader
 * and call filmLook(sampler, uv). uv is in the photo's own 0–1 space.
 */
export const FILM_LOOK_GLSL = /* glsl */ `
  uniform float uFilmAmount;
  uniform float uFilmExposure;
  uniform float uFilmLift;
  uniform float uFilmContrast;
  uniform float uFilmShoulder;
  uniform float uFilmSaturation;
  uniform float uFilmLean;
  uniform float uFilmSplit;
  uniform float uFilmSoft;
  uniform float uFilmBloom;
  uniform float uFilmHalation;
  uniform float uFilmGrain;
  uniform float uFilmGrainSize;
  uniform float uFilmVignette;
  uniform float uFilmMottle;
  uniform float uFilmLeak;
  uniform float uFilmSeed;

  float filmHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float filmNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(filmHash(i), filmHash(i + vec2(1, 0)), f.x),
               mix(filmHash(i + vec2(0, 1)), filmHash(i + vec2(1, 1)), f.x), f.y);
  }
  float filmLuma(vec3 c) { return dot(c, vec3(.2126, .7152, .0722)); }
  vec3 filmScreen(vec3 under, vec3 light) { return 1.0 - (1.0 - under) * (1.0 - clamp(light, 0.0, 1.0)); }

  /* bias is added to every mip level sampled — 0 is the look as tuned; a positive
     bias is the same image seen through something (the far side of a sheet). */
  vec3 filmLook(sampler2D photo, vec2 uv, float bias) {
    vec3 shot = texture2D(photo, uv, bias).rgb;
    // diffusion: the lens and the emulsion both soften; the mip chain is the blur,
    // the wide one taken four times a little apart so its blocks do not show
    vec3 soft = texture2D(photo, uv, 2.2 + bias).rgb;
    vec2 o = vec2(.006, .009);
    vec3 wide = (texture2D(photo, uv + o, 4.0 + bias).rgb + texture2D(photo, uv - o, 4.0 + bias).rgb
      + texture2D(photo, uv + vec2(o.x, -o.y), 4.0 + bias).rgb + texture2D(photo, uv + vec2(-o.x, o.y), 4.0 + bias).rgb) * .25;
    vec3 c = mix(shot, soft, uFilmSoft);
    c *= exp2(uFilmExposure);

    // tone: flattened around middle grey, the highlights rolled onto a shoulder, the toe lifted
    // by a veil that is not quite neutral
    c = mix(vec3(.46), c, uFilmContrast);
    vec3 over = smoothstep(vec3(.55), vec3(1.15), c);
    c = mix(c, .55 + (c - .55) * .58, over * uFilmShoulder);
    c = uFilmLift * vec3(.95, .99, 1.04) + c * (1.0 - uFilmLift);

    // colour: a little less of it; the midtones lean; the crossover is cool in the shadows and
    // cream in the light — the light in these pictures is always warmer than what it falls on
    float l = filmLuma(c);
    c = mix(vec3(l), c, uFilmSaturation);
    float mid = 1.0 - smoothstep(0.0, .5, abs(l - .5));
    vec3 lean = mix(vec3(.92, 1.01, 1.04), vec3(1.06, 1.0, .91), step(0.0, uFilmLean));
    c *= mix(vec3(1.0), lean, abs(uFilmLean) * (.35 + .65 * mid));
    float shadow = 1.0 - smoothstep(0.0, .42, l);
    vec3 dull = mix(vec3(l), c, .65) + vec3(-.012, -.006, .02);
    c = mix(c, dull, shadow * uFilmSplit);
    float high = smoothstep(.6, 1.0, l);
    c = mix(c, mix(vec3(l), c, .5) + vec3(.022, .004, -.03), high * uFilmSplit);

    // the brights spill, wide and a little cream; a thinner orange fringe where they are hottest
    vec3 glow = max(wide - .42, 0.0) * 1.7;
    c = filmScreen(c, glow * vec3(1.0, .96, .88) * uFilmBloom);
    float bright = smoothstep(.6, 1.0, filmLuma(wide));
    c = filmScreen(c, vec3(1.0, .62, .38) * bright * uFilmHalation * .45);

    // the emulsion: unevenly developed, and grainy — most in the shadows, least in the highlights
    float mottle = filmNoise(uv * vec2(5.0, 7.0) + uFilmSeed) * .65 + filmNoise(uv * vec2(13.0, 17.0) - uFilmSeed) * .35;
    c *= 1.0 + (mottle - .5) * uFilmMottle * .16;
    // grain belongs to the frame, not to the photo's pixels: a 36×24 frame holds ~1200 grains across at size 1
    vec2 cell = floor(uv * vec2(1200.0, 800.0) / uFilmGrainSize);
    float g = (filmHash(cell + uFilmSeed) + filmHash(cell * 1.31 + uFilmSeed + 3.7) + filmHash(cell * .77 + 9.1 - uFilmSeed) - 1.5) * .82;
    float weight = mix(1.0, .3, smoothstep(.45, .95, l)) * (1.0 + .6 * shadow);
    vec3 colourGrain = vec3(filmHash(cell + 1.3), filmHash(cell + 2.9), filmHash(cell + 4.1)) - .5;
    c += (g + colourGrain * .25) * uFilmGrain * weight;

    // the corners fall off a little
    vec2 q = uv - .5;
    c *= 1.0 - uFilmVignette * .5 * smoothstep(.15, 1.0, dot(q, q) * 2.0);

    // the leak: light got in. A broad lobe from one side (the seed picks which), its edge wandering,
    // orange-cream where it is thickest and pink where it thins; and a hot spot near its heart that
    // goes nearly white and eats what is under it
    float angle = uFilmSeed * 2.39996;
    vec2 dir = vec2(cos(angle), sin(angle));
    float along = dot(q, dir);
    float across = dot(q, vec2(-dir.y, dir.x));
    float wander = filmNoise(vec2(across * 3.0 + uFilmSeed, along * 2.0 - uFilmSeed)) - .5;
    float lobe = smoothstep(.0, .6, along + wander * .3 - abs(across) * .3 + .1);
    vec3 leakColor = mix(vec3(1.0, .6, .68), vec3(1.0, .82, .58), smoothstep(.25, 1.0, lobe));
    c = filmScreen(c, leakColor * lobe * uFilmLeak);
    vec2 heart = dir * .36 + vec2(-dir.y, dir.x) * (filmHash(vec2(uFilmSeed)) - .5) * .3;
    vec2 h = (q - heart) * vec2(1.0, 1.4);
    float spot = exp(-dot(h, h) * 14.0);
    c = filmScreen(c, vec3(1.0, .95, .86) * spot * uFilmLeak * 1.1);

    return mix(shot, clamp(c, 0.0, 1.0), uFilmAmount);
  }
  vec3 filmLook(sampler2D photo, vec2 uv) { return filmLook(photo, uv, 0.0); }
`;
