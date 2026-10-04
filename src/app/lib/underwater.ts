import * as THREE from "three";

/*
 * The water the artifact grows in, seen from beneath the surface. These
 * numbers describe one place — the surface overhead, the picture resting on
 * it, the light coming through — and are shared by the backdrop that paints
 * the water and by the artifact's own shader, so the light that drifts across
 * the form is the same light that falls through the ceiling behind it.
 */

/** Height of the surface above the artifact once the camera has settled. */
export const SURFACE_ABOVE = 5.2;
/** How far under the surface the camera is when the dive begins — where the pond's sink left it. */
export const ENTRY_DEPTH = 0.5;
/** The descent from just under the surface to the artifact's level. */
export const DESCENT = {
  durationMs: 4400,
  /** The wash from the pond side is still on screen; it lifts over this. */
  washMs: 1500,
  /** Chrome arrives once the eye has nearly settled (fraction of the descent). */
  chromeAt: 0.64,
} as const;

/** The artifact viewer's lens, mirrored so the backdrop agrees with it. */
export const ARTIFACT_LENS = { fov: 45, cameraZ: 4.8 } as const;
/**
 * The eye looks up a little at rest and almost straight up on entry. Both
 * canvases use this same pitch: the artifact viewer tilts its camera by it
 * (keeping the form centred, so the eye sits a little below the form and
 * looks up at it), and the backdrop paints the water from the same eye.
 */
export const PITCH_REST = THREE.MathUtils.degToRad(8);
export const PITCH_ENTRY = THREE.MathUtils.degToRad(58);

/** How deep the eye is and how far it looks up, for an eased descent 0..1. */
export const eyeDepth = (d: number) => ENTRY_DEPTH + d * (SURFACE_ABOVE - ENTRY_DEPTH);
export const eyePitch = (d: number) => PITCH_ENTRY + (PITCH_REST - PITCH_ENTRY) * d;

/**
 * The artifact viewer's frame has the form at the origin at rest. The eye
 * orbits it at `dist`, pitched up; the surface hangs above by the eye's depth.
 */
export function eyeInArtifactFrame(d: number, dist: number, out: THREE.Vector3): THREE.Vector3 {
  const p = eyePitch(d);
  return out.set(0, -dist * Math.sin(p), dist * Math.cos(p));
}
export const surfaceYInArtifactFrame = (d: number, dist: number) =>
  -dist * Math.sin(eyePitch(d)) + eyeDepth(d);
/** The form keeps its depth in the water; what moves is the eye, so in the
 *  viewer's frame the form is offset by this until the eye has settled. */
export const artifactOffsetY = (d: number, dist: number) =>
  surfaceYInArtifactFrame(d, dist) - ARTIFACT_DEPTH;
/** The form's own depth below the surface once the eye is at rest. */
export const ARTIFACT_DEPTH = SURFACE_ABOVE - ARTIFACT_LENS.cameraZ * Math.sin(PITCH_REST);

/** Where the picture rests on the surface, in the artifact's frame. */
export const SHEET_REST = { x: -2.4, z: -3.2, width: 3.6, yaw: 0.34 } as const;

export function sheetHalfSize(aspect: number): [number, number] {
  const w = SHEET_REST.width;
  const h = Math.min(3.0, w / Math.max(0.3, aspect));
  return [w / 2, h / 2];
}

/** Light comes through the picture and falls onto the artifact. */
export const LIGHT_DIR = new THREE.Vector3(-SHEET_REST.x, -ARTIFACT_DEPTH, -SHEET_REST.z).normalize();

/** Smootherstep — the same curve the pond uses for its own arrivals. */
export const descentEase = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * c * (c * (c * 6 - 15) + 10);
};

/** Uniforms every underwater shader declares; fill them per material. */
export function createUnderwaterUniforms(): Record<string, THREE.IUniform> {
  return {
    uTime: { value: 0 },
    uLightDir: { value: LIGHT_DIR.clone() },
    uSheet: { value: new THREE.Vector4(SHEET_REST.x, SHEET_REST.z, SHEET_REST.width / 2, SHEET_REST.width / 2 * 0.75) },
    uSheetYaw: { value: new THREE.Vector2(Math.cos(SHEET_REST.yaw), Math.sin(SHEET_REST.yaw)) },
    uSheetMap: { value: null },
    uSheetHas: { value: 0 },
    uGhost: { value: 0.22 },
    uVivid: { value: 0.55 },
  };
}

/**
 * How far the memory has come through the three settings (shape 0, distance
 * ½, feeling 1). Step by step the picture leaves the surface and arrives on
 * the form: the light through it grows fuller in colour and the projection
 * clearer, while what's left overhead grows vaguer.
 */
export function stageOfStep(step: string): number {
  return step === "feeling" ? 1 : step === "distance" ? 0.5 : 0;
}

export function setUnderwaterStage(uniforms: Record<string, THREE.IUniform>, stage: number): void {
  const s = Math.min(1, Math.max(0, stage));
  uniforms.uGhost.value = 0.22 - 0.16 * s;
  uniforms.uVivid.value = 0.55 + 0.45 * s;
}

/** How strongly the surface light shows on the form at a stage. */
export const causticStrength = (stage: number) => 0.6 + 0.7 * Math.min(1, Math.max(0, stage));

export function setSheetUniforms(
  uniforms: Record<string, THREE.IUniform>,
  texture: THREE.Texture | null,
  aspect: number,
): void {
  const [hw, hh] = sheetHalfSize(aspect);
  (uniforms.uSheet.value as THREE.Vector4).set(SHEET_REST.x, SHEET_REST.z, hw, hh);
  uniforms.uSheetMap.value = texture;
  uniforms.uSheetHas.value = texture ? 1 : 0;
}

/**
 * Loads the picture for a set of underwater uniforms. The sheet only counts
 * as present once its pixels have arrived — an object URL from an earlier
 * visit can no longer be read, and must leave no dark patch on the surface.
 * Returns the cleanup for a React effect.
 */
export function loadSheetTexture(
  uniforms: Record<string, THREE.IUniform>,
  url: string | undefined,
  aspect: number,
): () => void {
  setSheetUniforms(uniforms, null, aspect);
  if (!url) return () => {};
  let live = true;
  const texture = new THREE.TextureLoader().load(url, () => {
    if (live) setSheetUniforms(uniforms, texture, aspect);
  });
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return () => {
    live = false;
    texture.dispose();
    setSheetUniforms(uniforms, null, aspect);
  };
}

/**
 * The pond's surface as the pond itself draws it — the same swell, the same
 * sun path, the same ribbons — without the ripple inputs it takes from touch.
 * `pondSurface` shades the surface point (s.x, 0, s.y) for an eye at `eye`;
 * mirror the eye across the water and the result is the pond seen from under.
 * Keep in step with the shading in PerspectivePond.
 */
export const POND_SURFACE_GLSL = /* glsl */ `
  const vec2 PS_WIND = vec2(.5435, .8399);
  const vec3 PS_SKY = vec3(.888, .902, .897);
  float psHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float psNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(psHash(i), psHash(i + vec2(1,0)), f.x), mix(psHash(i + vec2(0,1)), psHash(i + vec2(1,1)), f.x), f.y);
  }
  vec2 psBreath(vec2 p) {
    return vec2(
      sin(p.x * .73 + uTime * .3) + sin(p.y * .52 - uTime * .24),
      sin(p.y * .68 - uTime * .27) + sin(p.x * .44 + uTime * .33)
    ) * .5;
  }
  vec2 psFlow(vec2 p) { return p + PS_WIND * uTime * .14 + psBreath(p) * .3; }
  float psSwell(vec2 p) {
    vec2 flow = psFlow(p);
    float h = sin(flow.x * 1.2 + flow.y * .55 + uTime * .48) * .014
      + sin(flow.y * 1.9 - flow.x * .31 - uTime * .33) * .008;
    h += (psNoise(flow * 3.1 + PS_WIND * uTime * .12) - .5) * .011;
    h += (psNoise(flow * 6.3 + PS_WIND * uTime * .2 + 11.0) - .5) * .0045;
    return h;
  }
  float psGrain(vec2 flow) {
    return (psNoise(flow * 12.0 + PS_WIND * uTime * .35) - .5) * .0009
      + (psNoise(flow * 24.0 + PS_WIND * uTime * .55 + 7.0) - .5) * .00035;
  }
  // sunDir is the pond's low sun from above; from below, refraction gathers
  // the sky into a narrower cone, so the caller may hand in a steeper one.
  vec3 pondSurface(vec2 s, vec3 eye, float detail, float relief, vec3 sunDir, float shine) {
    vec2 flow = psFlow(s);
    float h = psSwell(s) + psGrain(flow) * detail;
    float hx = psSwell(s + vec2(.02, 0)) + psGrain(flow + vec2(.02, 0)) * detail;
    float hz = psSwell(s + vec2(0, .02)) + psGrain(flow + vec2(0, .02)) * detail;
    vec3 n = normalize(vec3((h - hx) / .02 * relief, 1.0, (h - hz) / .02 * relief));
    vec3 e = normalize(eye - vec3(s.x, 0.0, s.y));
    vec3 reflection = reflect(-e, n);
    float fresnel = pow(1.0 - max(0.0, dot(n, e)), 3.0);
    vec3 deep = PS_SKY * vec3(.76, .80, .80);
    vec3 color = mix(deep, PS_SKY, .24 + fresnel * .66);
    float clouds = psNoise(reflection.xz * 3.0 + PS_WIND * uTime * .04);
    color += (clouds - .5) * .06;
    color += (n.x * .6 + n.z) * .14;
    float toSun = max(0.0, dot(reflection, sunDir));
    float light = pow(toSun, 220.0);
    float glow = pow(toSun, 12.0);
    float centre = exp(-(s.x * s.x / 16.0 + pow((s.y + 5.0) / 15.0, 2.0)));
    float reach = (1.0 - smoothstep(-30.0, -60.0, s.y)) * (.25 + .75 * centre) * shine;
    color += glow * reach * vec3(.05, .046, .036);
    color += light * reach * (.45 + .55 * fresnel) * vec3(.38, .36, .32);
    vec2 drift = flow * vec2(.38, .65) + PS_WIND * uTime * .06;
    float bend = psNoise(drift * .7) * 2.0 - 1.0;
    float ribbons = psNoise(vec2(drift.x * .7, drift.y * 2.4 + bend * 1.3));
    color += (ribbons - .5) * .022;
    return color;
  }
`;

/** Shared GLSL: the folds of light on the surface, and the picture in it. */
export const UNDERWATER_GLSL = /* glsl */ `
  uniform float uTime;
  uniform vec3 uLightDir;
  uniform vec4 uSheet;
  uniform vec2 uSheetYaw;
  uniform sampler2D uSheetMap;
  uniform float uSheetHas;
  // How much of the picture is left on the surface, and how fully its
  // colours come through in the light that falls from it.
  uniform float uGhost;
  uniform float uVivid;

  float uwHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  // Where the surface gathers light: a warped lattice of three sine fields,
  // soft lines where each crosses zero and a glow where two agree. The
  // pattern is fixed in place — nothing travels across the surface. Only its
  // brightness breathes, each field and each patch on its own slow beat, so
  // the light swells here and dims there the way light under water does.
  float uwBreath(float t, float phase, float rate) {
    return 0.55 + 0.45 * sin(t * rate + phase) * (0.75 + 0.25 * sin(t * rate * 0.37 + phase * 1.7));
  }
  float uwFolds(vec2 p, float t) {
    vec2 q = p + 0.38 * vec2(sin(p.y * 1.25), cos(p.x * 1.05));
    float a = sin(q.x * 2.0 + sin(q.y * 0.9) * 0.8);
    float b = sin(q.y * 1.8 + sin(q.x * 0.75) * 0.9);
    float c = sin((q.x + q.y) * 1.35 + sin((q.x - q.y) * 1.1) * 0.7);
    float la = 1.0 - abs(a), lb = 1.0 - abs(b), lc = 1.0 - abs(c);
    float phase = sin(p.x * 0.6 + p.y * 0.45) * 2.2 + cos(p.x * 0.33 - p.y * 0.7) * 1.6;
    float ba = uwBreath(t, phase, 0.55);
    float bb = uwBreath(t, phase + 2.1, 0.43);
    float bc = uwBreath(t, phase + 4.2, 0.67);
    float lines = pow(la, 3.0) * 0.4 * ba + pow(lb, 3.0) * 0.4 * bb + pow(lc, 2.5) * 0.3 * bc;
    float cells = pow(la * lb, 1.6) * 0.5 * (ba + bb) * 0.5 + pow(lb * lc, 1.6) * 0.35 * (bb + bc) * 0.5;
    return (lines + cells) * 1.25;
  }

  // The picture resting on the surface. rgb is the light that comes through
  // it (white where there is no picture); a is how much of the sheet is
  // there. vivid is how much of the picture survives: near 0 it is a ghost
  // on the water overhead; at 1 it is stained glass, colour and shade intact.
  vec4 uwSheetAt(vec2 s, float vivid) {
    vec2 d = s - uSheet.xy;
    vec2 local = vec2(d.x * uSheetYaw.x + d.y * uSheetYaw.y, -d.x * uSheetYaw.y + d.y * uSheetYaw.x);
    vec2 uv = local / (2.0 * uSheet.zw) + 0.5;
    vec2 edge = smoothstep(0.0, 0.08, uv) * smoothstep(0.0, 0.08, 1.0 - uv);
    float cover = edge.x * edge.y * uSheetHas;
    vec3 tex = texture2D(uSheetMap, clamp(vec2(uv.x, 1.0 - uv.y), 0.0, 1.0), 1.5).rgb;
    float lum = dot(tex, vec3(.299, .587, .114));
    vec3 full = mix(vec3(lum), tex, 0.5 + 0.7 * vivid);
    full = mix(vec3(0.3), vec3(1.15), full);
    vec3 glass = mix(vec3(1.0), full, vivid);
    return vec4(mix(vec3(1.0), glass, cover), cover);
  }

  // The point on the surface the light at p came through.
  vec2 uwSurfaceEntry(vec3 p, float surfaceY) {
    float along = (p.y - surfaceY) / uLightDir.y;
    return (p - uLightDir * along).xz;
  }

  // Light reaching a point under the surface: the picture projected along
  // the light, patterned by the folds above it, thinner the deeper it is.
  // foldMix is how much the folds break the light up (1 = pure caustic).
  vec3 uwLightAt(vec3 p, float surfaceY, float scale, float fade, float foldMix) {
    vec2 s = uwSurfaceEntry(p, surfaceY);
    vec4 sheet = uwSheetAt(s, uVivid);
    float depth = max(0.0, surfaceY - p.y);
    float folds = uwFolds(s * scale, uTime);
    return sheet.rgb * mix(1.0, folds, foldMix) * exp(-depth * fade);
  }
`;
