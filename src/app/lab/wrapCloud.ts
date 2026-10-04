/* The wrap's point cloud — the photo leaving the film as a sheet of points
   that flows, folds and melts onto the form. Kept here, whole, outside the
   lab's core shot: `/lab/descent` runs without it unless `?cloud=1` is on
   the URL, in which case the lab builds the geometry, drives these uniforms
   each frame, shows these knob groups on the panel and these tracks on the
   timeline. Nothing in the live create flow imports this file.

   Two motions, by `mode`: 0 — the sheet in a curl-noise field (divergence-
   free, so it folds without bunching), the swirl easing with each point's
   age, then a landing that sweeps the sheet and glides each point to its
   place on the form's lit side; 1 — the hourglass: the sheet funnels to a
   neck below the film, then pours, narrow at first and opening late, across
   the form's upper surface. In both a point melts (smaller, fainter, gone by
   `melt` of its glide) rather than settling as a skin. Points carry the
   photo's tones by default (`blend` 2), or are ink (1) or light (0). */
import * as THREE from "three";

export const CLOUD_MAX = 200000;

export interface CloudTune {
  // the landing (mode 0): begins at landAt (cloud clock), sweeps the sheet over landOver, each point gliding over landEase
  landAt: number; landOver: number; landEase: number;
  // how many points (built — on "again"); their size in pixels and weight on screen;
  // blend 2 is the photo's tones (dark pixels dark, light pixels light), 1 ink (darkens what is behind), 0 light (adds)
  cloudCount: number; pointPx: number; pointAlpha: number; blend: number;
  // the field the sheet flows in: fold size (scale: smaller is broader), strength, fine turbulence, drift over time, the sink, the pull toward the form
  fieldScale: number; fieldAmp: number; fieldDetail: number; evolve: number; sink: number; current: number;
  // the swirl eases off as a point ages (seconds since its own release): from calmAfter, over calmOver, down to a quarter
  calmAfter: number; calmOver: number;
  // 0 keeps the sheet whole (neighbours leave and land together); 1 lets every point go its own way
  grain: number;
  // the hourglass (mode 1): the sheet funnels to a neck neckDrop below the film, neckRadius wide, over gatherS; then pours over
  // pourS — narrow at first, opening (pow(s, spread)) across the form's upper surface, with a twist that unwinds as it lands
  mode: number; neckDrop: number; neckRadius: number; gatherS: number; pourS: number; spread: number; twist: number;
  // colour: 0 is grey by luma, 1 the photo's own colour at colorSat; grainDark / grainBright are the values given to a black and a white pixel
  colorMix: number; colorSat: number; grainDark: number; grainBright: number;
  // a gliding point is gone (smaller, fainter) by this fraction of its glide — snow melting before it lands
  melt: number;
}
export const CLOUD_TUNE_DEFAULT: CloudTune = {
  landAt: 2.8, landOver: 2.6, landEase: 1.2,
  cloudCount: 90000, pointPx: 1.5, pointAlpha: 0.12, blend: 2,
  fieldScale: 0.5, fieldAmp: 0.7, fieldDetail: 0.5, evolve: 0.4, sink: 0.7, current: 0.6,
  calmAfter: 1.4, calmOver: 1.8,
  grain: 0.2,
  mode: 0, neckDrop: 0.9, neckRadius: 0.12, gatherS: 1.6, pourS: 3.0, spread: 2.0, twist: 0.6,
  colorMix: 0, colorSat: 0.45, grainDark: 0.2, grainBright: 0.9,
  melt: 0.8,
};

/** A slider on the lab's panel. */
export interface TuneKnob<T> { key: keyof T; label: string; min: number; max: number; step: number }
export const CLOUD_KNOBS: { group: string; knobs: TuneKnob<CloudTune>[] }[] = [
  { group: "cloud", knobs: [
    { key: "cloudCount", label: "how many points (on again)", min: 5000, max: CLOUD_MAX, step: 5000 },
    { key: "pointPx", label: "point size (px)", min: 0.5, max: 4, step: 0.1 },
    { key: "pointAlpha", label: "weight on screen", min: 0.01, max: 1, step: 0.01 },
    { key: "blend", label: "light (0) · ink (1) · tones (2)", min: 0, max: 2, step: 1 },
    { key: "grain", label: "grain (0 whole sheet)", min: 0, max: 1, step: 0.01 },
    { key: "melt", label: "point gone by (of its glide)", min: 0.1, max: 1, step: 0.01 },
    { key: "landAt", label: "landing begins", min: 0, max: 10, step: 0.1 },
    { key: "landOver", label: "landing sweeps over", min: 0, max: 8, step: 0.1 },
    { key: "landEase", label: "each point glides in over", min: 0.1, max: 4, step: 0.1 },
  ] },
  { group: "field", knobs: [
    { key: "fieldScale", label: "fold size (smaller is broader)", min: 0.1, max: 2, step: 0.01 },
    { key: "fieldAmp", label: "flow strength", min: 0, max: 3, step: 0.01 },
    { key: "fieldDetail", label: "fine turbulence", min: 0, max: 1, step: 0.01 },
    { key: "evolve", label: "field drifts over time", min: 0, max: 2, step: 0.01 },
    { key: "sink", label: "sink", min: 0, max: 2, step: 0.01 },
    { key: "current", label: "pull toward the form", min: 0, max: 1, step: 0.01 },
    { key: "calmAfter", label: "swirl eases after (s of a point's age)", min: 0, max: 8, step: 0.1 },
    { key: "calmOver", label: "eases over", min: 0.1, max: 6, step: 0.1 },
  ] },
  { group: "hourglass", knobs: [
    { key: "mode", label: "sheet in the field (0) · hourglass (1)", min: 0, max: 1, step: 1 },
    { key: "neckDrop", label: "neck below the film", min: 0.1, max: 3, step: 0.05 },
    { key: "neckRadius", label: "neck width", min: 0.01, max: 1, step: 0.01 },
    { key: "gatherS", label: "gathers to the neck over (s)", min: 0.2, max: 5, step: 0.1 },
    { key: "pourS", label: "pours over (s)", min: 0.3, max: 8, step: 0.1 },
    { key: "spread", label: "opens late (curve)", min: 0.3, max: 5, step: 0.05 },
    { key: "twist", label: "twist", min: 0, max: 3, step: 0.05 },
  ] },
  { group: "colour", knobs: [
    { key: "colorMix", label: "photo's own colour", min: 0, max: 1, step: 0.01 },
    { key: "colorSat", label: "its saturation", min: 0, max: 1, step: 0.01 },
    { key: "grainDark", label: "a black pixel's value", min: 0, max: 1.4, step: 0.01 },
    { key: "grainBright", label: "a white pixel's value", min: 0, max: 1.4, step: 0.01 },
  ] },
];

/** A phase on the lab's timeline; an edge with a setter writes the knob behind it when dragged. */
export interface PhaseBlock<T> {
  track: string; label: string; from: number; to: number; group: string;
  setFrom?: (k: T, seconds: number) => Partial<T>;
  setTo?: (k: T, seconds: number) => Partial<T>;
}
export const CLOUD_TRACKS = ["cloud", "swirl", "gather", "pour", "lands"];
/** The cloud's phases, from `release` (the first point's release, on the shot clock). A point's own age runs from its own release. */
export function cloudPhaseBlocks(k: CloudTune, release: number): PhaseBlock<CloudTune>[] {
  const landFrom = release + k.landAt;
  const landBegin = (_: CloudTune, s: number) => ({ landAt: s - release });
  if (k.mode >= 0.5) return [
    { track: "gather", label: "the sheet funnels to the neck", from: release, to: release + k.gatherS, group: "hourglass",
      setTo: (_, s) => ({ gatherS: s - release }) },
    { track: "pour", label: "pours · opens over the form · melts", from: release + k.gatherS, to: release + k.gatherS + k.pourS, group: "hourglass",
      setFrom: (_, s) => ({ gatherS: s - release }), setTo: (kk, s) => ({ pourS: s - release - kk.gatherS }) },
  ];
  return [
    { track: "cloud", label: "the sheet flows", from: release, to: landFrom, group: "field", setTo: landBegin },
    { track: "swirl", label: "full swirl", from: release, to: release + k.calmAfter, group: "field",
      setTo: (_, s) => ({ calmAfter: s - release }) },
    { track: "swirl", label: "eases to a quarter", from: release + k.calmAfter, to: release + k.calmAfter + k.calmOver, group: "field",
      setFrom: (_, s) => ({ calmAfter: s - release }), setTo: (kk, s) => ({ calmOver: s - release - kk.calmAfter }) },
    { track: "lands", label: "landing sweeps the sheet · points melt", from: landFrom, to: landFrom + k.landOver + k.landEase, group: "cloud",
      setFrom: landBegin, setTo: (kk, s) => ({ landOver: s - release - kk.landAt - kk.landEase }) },
  ];
}

/* The photo, let go of the film as a point cloud. The image is a sheet of
   many tiny points; the sheet stays whole as it leaves — neighbours leave
   together, flow together, land together — and a smooth, divergence-free
   field (curl noise, with a slow sink and a slight pull toward the form)
   folds and stretches it the way smoke folds, so where the sheet doubles
   over it reads denser. Each point's path is the field integrated from its
   own release in fixed steps, a pure function of the cloud clock, so the
   shot can be scrubbed. From uLandAt a landing sweeps across the sheet and
   each point glides toward its place on the form — and melts on the way,
   smaller and fainter, gone by uMelt of the glide, as snow is gone before
   it quite reaches the ground; the print develops on the form where the
   sheet has landed. A point whose pixel has no place on the form (the
   image's corners, outside the photo disc) thins away in the water. The
   points carry the photo's tones (uBlend 2: a dark pixel is a dark point,
   a light one light, normal blending); or they are ink that darkens what
   is behind (1, dst·(1−src)); or light added (0). uClock is seconds since
   the film began to let go. */
export const cloudVertex = /* glsl */ `
  attribute vec3 aStart;
  attribute vec3 aEnd;
  attribute vec3 aColor;
  attribute float aLuma;
  attribute float aDelay;
  attribute vec2 aSheet;
  attribute float aSeed;
  attribute float aLands;
  attribute vec3 aTop;
  uniform float uMode;
  uniform vec3 uNeck;
  uniform float uNeckRadius;
  uniform float uGatherS;
  uniform float uPourS;
  uniform float uSpread;
  uniform float uTwist;
  uniform float uClock;
  uniform float uDpr;
  uniform float uPx;
  uniform mat4 uForm;
  uniform vec3 uFormAt;
  uniform float uScale;
  uniform float uAmp;
  uniform float uDetail;
  uniform float uEvolve;
  uniform float uSink;
  uniform float uCurrent;
  uniform float uCalmAfter;
  uniform float uCalmOver;
  uniform float uGrain;
  uniform float uLandAt;
  uniform float uLandOver;
  uniform float uLandEase;
  uniform float uMelt;
  uniform float uBlend;
  uniform vec3 uInkColor;
  uniform float uColorMix;
  uniform float uColorSat;
  uniform vec2 uRange;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSize;
  float hash3(vec3 p) {
    p = fract(p * .3183099 + .1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  // value noise with its analytic gradient (quintic, so the gradient is smooth)
  vec3 noiseGrad(vec3 x) {
    vec3 i = floor(x), w = fract(x);
    vec3 u = w * w * w * (w * (w * 6.0 - 15.0) + 10.0);
    vec3 du = 30.0 * w * w * (w * (w - 2.0) + 1.0);
    float a = hash3(i), b = hash3(i + vec3(1, 0, 0)), c = hash3(i + vec3(0, 1, 0)), d = hash3(i + vec3(1, 1, 0));
    float e = hash3(i + vec3(0, 0, 1)), f = hash3(i + vec3(1, 0, 1)), g = hash3(i + vec3(0, 1, 1)), h = hash3(i + vec3(1, 1, 1));
    float k1 = b - a, k2 = c - a, k3 = e - a, k4 = a - b - c + d, k5 = a - c - e + g, k6 = a - b - e + f, k7 = -a + b + c - d + e - f - g + h;
    return 2.0 * du * vec3(k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z,
                           k2 + k5 * u.z + k4 * u.x + k7 * u.z * u.x,
                           k3 + k6 * u.x + k5 * u.y + k7 * u.x * u.y);
  }
  // the curl of three noise potentials: divergence-free, so the sheet folds without tearing or bunching
  vec3 curlAt(vec3 p) {
    vec3 g1 = noiseGrad(p);
    vec3 g2 = noiseGrad(p + vec3(31.4, 17.2, 9.1));
    vec3 g3 = noiseGrad(p + vec3(-12.7, 44.3, 27.9));
    return vec3(g3.y - g2.z, g1.z - g3.x, g2.x - g1.y);
  }
  // tm is the cloud clock (the field itself drifts with it); own is the point's age since its release —
  // the swirl is full at first and eases to a quarter, so the way on is mostly down and toward the form
  vec3 field(vec3 q, float tm, float own) {
    vec3 p = q * uScale + uEvolve * tm * vec3(.07, .05, .09);
    vec3 v = curlAt(p) + curlAt(p * 2.3 + vec3(7.1, -3.3, 5.7) + uEvolve * tm * vec3(.11, -.08, .06)) * uDetail * .5;
    float calm = mix(1.0, .25, smoothstep(uCalmAfter, uCalmAfter + uCalmOver, own));
    v *= uAmp * .35 * calm;
    v.y -= uSink;
    v.xz += (uFormAt.xz - q.xz) * uCurrent * .25;
    return v;
  }
  const int STEPS = 10;
  const float STEP = .5;
  void main() {
    // the sheet lets go from its top edge; uGrain lets single points lag behind their neighbours
    float age = uClock - aDelay - aSeed * uGrain * .8;
    vec3 p;
    float k;
    float lands;
    float landStart;
    if (uMode > .5) {
      // the hourglass. gather: the sheet funnels to the neck, each point to its own spot within the neck's width
      float g = smoothstep(0.0, uGatherS, age);
      g = g * g * (3.0 - 2.0 * g);
      float ang = aSeed * 6.283;
      vec3 neck = uNeck + vec3(cos(ang), 0.0, sin(ang)) * uNeckRadius * sqrt(fract(aSeed * 7.31));
      vec3 gathered = mix(aStart, neck, g);
      // pour: down from the neck; narrow at first, opening across the form's top; a twist that unwinds on the way
      vec3 end = (uForm * vec4(aTop, 1.0)).xyz;
      float s = clamp((age - uGatherS) / uPourS, 0.0, 1.0);
      float open = pow(s, uSpread);
      vec2 lateral = end.xz - neck.xz;
      float tw = uTwist * (1.0 - s) * 2.5;
      lateral = vec2(lateral.x * cos(tw) - lateral.y * sin(tw), lateral.x * sin(tw) + lateral.y * cos(tw));
      float ys = mix(s, s * s, .35);
      vec3 poured = vec3(neck.x + lateral.x * open, mix(neck.y, end.y, ys), neck.z + lateral.y * open);
      p = age < uGatherS ? gathered : poured;
      k = smoothstep(.6, 1.0, s);
      lands = 1.0;
      landStart = uGatherS + uPourS * .6;
    } else {
      vec3 q = aStart;
      // the path: the field integrated from the release, in steps of half a second
      for (int i = 0; i < STEPS; i++) {
        float s = clamp(age - float(i) * STEP, 0.0, STEP);
        if (s <= 0.0) break;
        q += field(q, aDelay + float(i) * STEP, float(i) * STEP + .25) * s;
      }
      float beyond = max(0.0, age - float(STEPS) * STEP);
      if (beyond > 0.0) q += field(q, aDelay + float(STEPS) * STEP, float(STEPS) * STEP) * beyond * .6;
      // the landing: a sweep across the sheet (down it, with a lean), then each point's own glide
      float sweep = clamp((1.0 - aSheet.y) * .8 + sin(aSheet.x * 5.1 + aSeed * .3) * .1 + .1 + aSeed * uGrain * .5, 0.0, 1.0);
      landStart = uLandAt + sweep * uLandOver;
      k = smoothstep(landStart, landStart + uLandEase, age);
      k = k * k * (3.0 - 2.0 * k);
      vec3 end = (uForm * vec4(aEnd, 1.0)).xyz;
      p = mix(q, end, k * aLands);
      lands = aLands;
    }
    // the melt: on the glide the point shrinks and thins, gone by uMelt of the way
    float melt = smoothstep(0.0, uMelt, k) * lands;
    vec4 view = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * view;
    float dist = max(.5, -view.z);
    vSize = uPx * uDpr * clamp(6.0 / dist, .5, 1.5) * (1.0 - .8 * melt);
    gl_PointSize = vSize;
    // the pixel's value, a black pixel at uRange.x and a white one at uRange.y; grey by luma or the photo's own colour
    float val = mix(uRange.x, uRange.y, aLuma);
    vec3 own = mix(vec3(aLuma), aColor, uColorSat);
    vec3 ownAt = min(own * (val / max(aLuma, .06)), vec3(1.2));
    vec3 tone = mix(val * vec3(.96, .975, 1.0), ownAt, uColorMix);
    // ink: what the point takes out of the light behind it
    vec3 absorb = (1.0 - mix(uInkColor, own * .55, uColorMix)) * val;
    vColor = uBlend > 1.5 ? tone : (uBlend > .5 ? absorb : tone);
    // present once it has left the film; melting on the glide; a point with no place thins away in the water
    float born = smoothstep(0.0, .35, age);
    float lost = 1.0 - smoothstep(landStart, landStart + uLandEase + .8, age);
    vAlpha = born * mix(lost, 1.0 - melt, lands);
  }
`;
export const cloudFragment = /* glsl */ `
  uniform float uAlpha;
  uniform float uBlend;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSize;
  void main() {
    // a point is a square up to about two pixels; larger, it softens to a disc
    float d = length(gl_PointCoord - .5);
    float disc = mix(1.0, 1.0 - smoothstep(.2, .5, d), smoothstep(1.5, 3.0, vSize));
    float a = disc * vAlpha * uAlpha;
    if (a < .002) discard;
    // tones blend normally (colour, coverage); ink and light are premultiplied for their blend functions
    gl_FragColor = uBlend > 1.5 ? vec4(vColor, a) : vec4(vColor * a, a);
  }
`;

/** The photo's pixels, read once so each point can carry its own. */
export function readPhoto(texture: THREE.Texture): { data: Uint8ClampedArray; w: number; h: number } | null {
  const image = texture.image as CanvasImageSource & { width: number; height: number };
  const w = 160, h = 160;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(image, 0, 0, w, h);
    return { data: ctx.getImageData(0, 0, w, h).data, w, h };
  } catch {
    return null;
  }
}

export function createCloudUniforms(d: CloudTune = CLOUD_TUNE_DEFAULT) {
  return {
    uClock: { value: -1 },
    uDpr: { value: 1 },
    uPx: { value: d.pointPx },
    uAlpha: { value: d.pointAlpha },
    uForm: { value: new THREE.Matrix4() },
    uFormAt: { value: new THREE.Vector3() },
    uScale: { value: d.fieldScale },
    uAmp: { value: d.fieldAmp },
    uDetail: { value: d.fieldDetail },
    uEvolve: { value: d.evolve },
    uSink: { value: d.sink },
    uCurrent: { value: d.current },
    uCalmAfter: { value: d.calmAfter },
    uCalmOver: { value: d.calmOver },
    uGrain: { value: d.grain },
    uMode: { value: d.mode },
    uNeck: { value: new THREE.Vector3(0, -d.neckDrop, 2) },
    uNeckRadius: { value: d.neckRadius },
    uGatherS: { value: d.gatherS },
    uPourS: { value: d.pourS },
    uSpread: { value: d.spread },
    uTwist: { value: d.twist },
    uLandAt: { value: d.landAt },
    uLandOver: { value: d.landOver },
    uLandEase: { value: d.landEase },
    uMelt: { value: d.melt },
    uBlend: { value: d.blend },
    uInkColor: { value: new THREE.Color(0.2, 0.22, 0.27) },
    uColorMix: { value: d.colorMix },
    uColorSat: { value: d.colorSat },
    uRange: { value: new THREE.Vector2(d.grainDark, d.grainBright) },
  };
}
export type CloudUniforms = ReturnType<typeof createCloudUniforms>;

/** Tones blend normally; ink darkens what is behind it (dst · (1 − src)); light adds. `blending` is switched per frame by `blend`. */
export function createCloudMaterial(uniforms: CloudUniforms) {
  return new THREE.ShaderMaterial({
    name: "cloud",
    vertexShader: cloudVertex,
    fragmentShader: cloudFragment,
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NormalBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.ZeroFactor,
    blendDst: THREE.OneMinusSrcColorFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  });
}

/** The knobs onto the uniforms, every frame, so a slider moves the cloud already in the water. `filmAt` is the film's position (the neck hangs under it). */
export function setCloudUniforms(pu: CloudUniforms, material: THREE.ShaderMaterial, k: CloudTune, dpr: number, filmAt: THREE.Vector3 | null) {
  pu.uDpr.value = dpr;
  pu.uPx.value = k.pointPx;
  pu.uAlpha.value = k.pointAlpha;
  pu.uScale.value = k.fieldScale;
  pu.uAmp.value = k.fieldAmp;
  pu.uDetail.value = k.fieldDetail;
  pu.uEvolve.value = k.evolve;
  pu.uSink.value = k.sink;
  pu.uCurrent.value = k.current;
  pu.uCalmAfter.value = k.calmAfter;
  pu.uCalmOver.value = Math.max(0.05, k.calmOver);
  pu.uGrain.value = k.grain;
  pu.uMode.value = k.mode >= 0.5 ? 1 : 0;
  if (filmAt) pu.uNeck.value.set(filmAt.x, filmAt.y - k.neckDrop, filmAt.z);
  pu.uNeckRadius.value = k.neckRadius;
  pu.uGatherS.value = Math.max(0.05, k.gatherS);
  pu.uPourS.value = Math.max(0.1, k.pourS);
  pu.uSpread.value = Math.max(0.1, k.spread);
  pu.uTwist.value = k.twist;
  pu.uLandAt.value = k.landAt;
  pu.uLandOver.value = k.landOver;
  pu.uLandEase.value = Math.max(0.05, k.landEase);
  pu.uMelt.value = Math.max(0.05, k.melt);
  pu.uColorMix.value = k.colorMix;
  pu.uColorSat.value = k.colorSat;
  pu.uRange.value.set(k.grainDark, k.grainBright);
  const blend = Math.round(k.blend);
  pu.uBlend.value = blend;
  material.blending = blend === 2 ? THREE.NormalBlending : blend === 1 ? THREE.CustomBlending : THREE.AdditiveBlending;
}

/* The cloud's geometry: the photo as a sheet of points. A grid over the
   film's window with the image's aspect, lightly jittered; each point takes
   its pixel, and — inverting the overlay's planar projection — its place on
   the form's lit side, blended from the nearest form vertices in photo-uv
   (`aEnd`); and its place on the form's upper surface for the hourglass
   (`aTop`). A point whose uv falls outside the photo disc has no place on
   the lit side (`aLands` 0) and will thin away in mode 0. */
export function buildCloudGeometry(args: {
  /** The form's sphere rest positions (local), its vertex count, and its photo uv per vertex. */
  sphere: Float32Array; vertexCount: number; uv: Float32Array;
  /** The form geometry's positions (local; `uForm` carries them to the world). */
  positions: Float32Array;
  filmMesh: THREE.Mesh; texture: THREE.Texture;
  /** The strip's size in world units; the window is 75% × 66% of it. */
  stripSize: THREE.Vector2;
  count: number; releaseS: number;
}): THREE.BufferGeometry {
  const { sphere, vertexCount: n, uv, positions, filmMesh, texture, stripSize: size } = args;
  const photo = readPhoto(texture);
  const e = new THREE.Vector3();
  /* Vertices binned on a unit square by some key, and a lookup that blends
     the nearest of them into `e` by closeness. Two of these: the lit
     hemisphere by photo uv (where the print will show a pixel), and the
     upper hemisphere by its x/z (where sand poured from above lands). */
  const BIN = 48;
  const binned = (key: (v: number) => [number, number] | null) => {
    const bins: number[][] = Array.from({ length: BIN * BIN }, () => []);
    const keys = new Float32Array(n * 2);
    for (let v = 0; v < n; v++) {
      const k = key(v);
      if (!k || k[0] < 0 || k[0] > 1 || k[1] < 0 || k[1] > 1) { keys[v * 2] = -9; continue; }
      keys[v * 2] = k[0]; keys[v * 2 + 1] = k[1];
      bins[Math.min(BIN - 1, Math.floor(k[0] * BIN)) + Math.min(BIN - 1, Math.floor(k[1] * BIN)) * BIN].push(v);
    }
    return (u: number, w: number) => {
      const bu = Math.floor(u * BIN), bw = Math.floor(w * BIN);
      let sum = 0;
      e.set(0, 0, 0);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const cx = bu + dx, cy = bw + dy;
        if (cx < 0 || cy < 0 || cx >= BIN || cy >= BIN) continue;
        for (const v of bins[cx + cy * BIN]) {
          const d2 = (keys[v * 2] - u) ** 2 + (keys[v * 2 + 1] - w) ** 2;
          const wgt = 1 / (d2 + 1e-5);
          e.x += positions[v * 3] * wgt; e.y += positions[v * 3 + 1] * wgt; e.z += positions[v * 3 + 2] * wgt;
          sum += wgt;
        }
      }
      if (sum === 0) return false;
      e.divideScalar(sum);
      return true;
    };
  };
  const byPhotoUv = binned((v) => sphere[v * 3 + 2] < 0.02 ? null : [uv[v * 2], uv[v * 2 + 1]]);
  let radius = 0;
  for (let v = 0; v < n; v++) radius = Math.max(radius, Math.hypot(positions[v * 3], positions[v * 3 + 2]));
  const byTop = binned((v) => positions[v * 3 + 1] < 0.02 ? null : [positions[v * 3] / radius * 0.5 + 0.5, positions[v * 3 + 2] / radius * 0.5 + 0.5]);
  // the place on the form for the pixel at (u, w)
  const landing = (u: number, w: number) => Math.hypot(u - 0.5, w - 0.5) <= 0.5 && byPhotoUv(u, w);
  // the place on the form's top for sand from (u, w) of the sheet: the image laid over it, its top at the far side
  const topOf = (u: number, w: number) => {
    const x = (u - 0.5) * 0.92, z = -(w - 0.5) * 0.92;
    const r = Math.hypot(x, z);
    const s = r > 0.46 ? 0.46 / r : 1;
    return byTop(x * s + 0.5, z * s + 0.5);
  };
  const pixel: [number, number, number] = [0.5, 0.5, 0.5];
  // the photo's pixel at (u, w), written into `pixel`; its luma returned
  const sampleAt = (u: number, w: number) => {
    if (!photo) { pixel[0] = pixel[1] = pixel[2] = 0.5; return 0.5; }
    const px = Math.min(photo.w - 1, Math.floor(u * photo.w));
    const py = Math.min(photo.h - 1, Math.floor((1 - w) * photo.h));
    const k = (py * photo.w + px) * 4;
    pixel[0] = photo.data[k] / 255; pixel[1] = photo.data[k + 1] / 255; pixel[2] = photo.data[k + 2] / 255;
    return 0.2126 * pixel[0] + 0.7152 * pixel[1] + 0.0722 * pixel[2];
  };
  // the grid: the window's aspect, as many points as asked for
  const count = Math.min(CLOUD_MAX, Math.max(100, Math.round(args.count)));
  const windowW = size.x * 0.75, windowH = size.y * 0.66;
  const rows = Math.max(2, Math.round(Math.sqrt(count * windowH / windowW)));
  const cols = Math.max(2, Math.round(count / rows));
  const total = rows * cols;
  const start = new Float32Array(total * 3);
  const end = new Float32Array(total * 3);
  const color = new Float32Array(total * 3);
  const lumas = new Float32Array(total);
  const delay = new Float32Array(total);
  const sheet = new Float32Array(total * 2);
  const seed = new Float32Array(total);
  const lands = new Float32Array(total);
  const top = new Float32Array(total * 3);
  const p = new THREE.Vector3();
  filmMesh.updateMatrixWorld();
  let i = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const u = (c + 0.5 + (Math.random() - 0.5) * 0.6) / cols;
    const w = (r + 0.5 + (Math.random() - 0.5) * 0.6) / rows;
    const luma = sampleAt(u, w);
    p.set((u - 0.5) * windowW, (w - 0.5) * windowH, 0.02).applyMatrix4(filmMesh.matrixWorld);
    start.set([p.x, p.y, p.z], i * 3);
    const has = landing(u, w);
    lands[i] = has ? 1 : 0;
    end.set(has ? [e.x, e.y, e.z] : [p.x, p.y, p.z], i * 3);
    top.set(topOf(u, w) ? [e.x, e.y, e.z] : [0, radius, 0], i * 3);
    color.set(pixel, i * 3);
    lumas[i] = luma;
    sheet[i * 2] = u; sheet[i * 2 + 1] = w;
    // the release sweeps down the sheet, with a slight lean so it is not a ruler; the shader adds the grain
    delay[i] = ((1 - w) * 0.85 + Math.sin(u * 4.7) * 0.05 + 0.1) * args.releaseS;
    seed[i] = Math.random();
    i++;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(start, 3));
  geometry.setAttribute("aStart", new THREE.BufferAttribute(start, 3));
  geometry.setAttribute("aEnd", new THREE.BufferAttribute(end, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
  geometry.setAttribute("aLuma", new THREE.BufferAttribute(lumas, 1));
  geometry.setAttribute("aDelay", new THREE.BufferAttribute(delay, 1));
  geometry.setAttribute("aSheet", new THREE.BufferAttribute(sheet, 2));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  geometry.setAttribute("aLands", new THREE.BufferAttribute(lands, 1));
  geometry.setAttribute("aTop", new THREE.BufferAttribute(top, 3));
  geometry.setDrawRange(0, i);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50);
  return geometry;
}
