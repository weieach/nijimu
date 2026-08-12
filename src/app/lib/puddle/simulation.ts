// Rain-puddle simulation for the "puddle" homescreen shader variant.
//
// Framework-free WebGL2. Two coupled ping-pong FBO pairs, both simulated at
// quarter-ish resolution (long edge <= 512) and rendered full-res:
//
//   height (RG16F)  — R = surface height, G = velocity. Damped wave equation,
//                     stepped at a fixed 60 Hz substep so tuning is stable.
//   dye    (RGBA16F) — lingering memory color. Each step it is advected a
//                     little along the height gradient (waves smear color),
//                     diffused (the bleed), and slowly decayed.
//
// Drops are additive gaussian splats into both fields, queued from React and
// flushed at step time.
//
// Dye-decay tradeoff (deliberate): decay half-life is long (~75 s) so color
// lingers well past the ripple, plus a chroma-restore in the render pass so
// overlapping drops stay iridescent instead of averaging to mud. Old drops do
// eventually fade — the idle drip in PuddleScene re-seeds them. Note the decay
// multiply is applied every 12th substep (5 Hz) with a correspondingly larger
// factor; per-substep factors are so close to 1 they round away in fp16.

/* ───────── hand-tunable uniforms ───────── */

export interface PuddleTuning {
  /** Wave propagation coefficient per substep. Keep < 0.5 or the explicit scheme explodes. */
  waveSpeed: number;
  /** Velocity retained per 60 Hz substep. Sets how many seconds a ripple lives (~0.99 ≈ 3–5 s). */
  waveDamping: number;
  /** Height retained per substep — bleeds standing water back to flat. */
  heightRetention: number;
  /** Drop splat radius, in uv units of the short edge. */
  dropRadius: number;
  /** Height depression injected by a drop. */
  dropStrength: number;
  /** How much dye a drop injects (multiplies the memory color). */
  dropDyeAmount: number;
  /** Seconds for lingering dye to fade to half. The linger/mud tradeoff lives here. */
  dyeDecayHalfLife: number;
  /** 0..1 neighbor-blur mix per substep — the watercolor bleed. */
  dyeDiffusion: number;
  /** How far dye is dragged along the wave gradient (uv per unit gradient). */
  dyeAdvection: number;
  /** Overall strength of the oil-slick interference color. */
  iridescenceStrength: number;
  /** Frequency of the thin-film banding — higher = tighter rainbow rings. */
  filmScale: number;
  /** Asphalt grain amount. */
  grainAmount: number;
  /** Amplitude of the idle normal shimmer (render-pass only, no sim cost). */
  idleShimmer: number;
  /** Speed the whole shimmer pattern slides toward the top-left corner, in uv
      of the short edge per second — the puddle as a body of water with a
      current, rather than a standing pattern. */
  idleDrift: number;
  /** Depth of the sustained cavity while a press is held — a heavy object resting in the water. */
  holdDepth: number;
  /** Seconds per breathing cycle of the held cavity; each cycle sheds a ring outward. */
  holdPulsePeriod: number;
  /** The (shorter) cycle the breathing opens at — a press flurries with rings
      before settling into holdPulsePeriod. */
  holdPulseStartPeriod: number;
  /** Seconds over which that opening flurry eases into the steady rhythm. */
  holdPulseSettle: number;
}

export const PUDDLE_TUNING: PuddleTuning = {
  // water, not milk: fast propagation, damping tuned so a ring dies just as
  // it reaches ~half the screen in diameter — no ghost swells past that.
  // (waveSpeed must stay < 0.5.) Radius and strength stay gentle: the calm
  // comes from wide, low swells, the water-feel from how fast they travel.
  waveSpeed: 0.32,
  waveDamping: 0.985,
  heightRetention: 0.9992,
  dropRadius: 0.032,
  dropStrength: 0.85,
  dropDyeAmount: 1.0,
  dyeDecayHalfLife: 75,
  dyeDiffusion: 0.09,
  // dye rides the expanding rings well outward, so a memory's color travels
  // with its ripple group instead of staying a static blot
  dyeAdvection: 2.2,
  iridescenceStrength: 1.0,
  filmScale: 7.0,
  grainAmount: 0.05,
  idleShimmer: 0.0035,
  // the shimmer's wavelets are ~0.12 uv across, so this carries the pattern
  // about two thirds of a wavelength per second — a current you can follow
  // without the surface ever looking like it is scrolling
  idleDrift: 0.08,
  // the held well sits far deeper than a memory's crater, and breathes fast —
  // a ring sheds from its rim every cycle, so holding reads as a live pulse
  holdDepth: 0.44,
  // a held press opens with a short flurry, then settles into a calm breath —
  // enough rings to feel alive, not so many the surface rains
  holdPulsePeriod: 1.05,
  holdPulseStartPeriod: 0.6,
  holdPulseSettle: 0.85,
};

/* ───────── support probe ───────── */

let supportCache: boolean | null = null;

/** WebGL2 + renderable half-float targets. Cached; safe to call in render. */
export function isPuddleSupported(): boolean {
  if (supportCache !== null) return supportCache;
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2");
    supportCache = !!gl && !!gl.getExtension("EXT_color_buffer_float");
  } catch {
    supportCache = false;
  }
  return supportCache;
}

/* ───────── shaders ───────── */

const VERT = `#version 300 es
layout(location = 0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Additive splat into whichever field is bound as u_src.
// u_ring = 0: plain gaussian (dye blots).
// u_ring = 1: volume-conserving crater + raised rim (mexican hat). A real drop
// doesn't remove water — it displaces it into a ring around the impact, and
// that zero-mean profile is what makes the wave equation launch a crisp
// expanding ring instead of slowly refilling a hole (the "milk" look).
const SPLAT_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_src;
uniform vec2 u_point;
uniform float u_radius;
uniform vec4 u_value;
uniform float u_aspect;
uniform float u_ring;
void main() {
  vec4 base = texture(u_src, v_uv);
  vec2 d = v_uv - u_point;
  d.x *= u_aspect;
  float r2 = dot(d, d) / (u_radius * u_radius);
  float g = exp(-r2);
  o = base + u_value * mix(g, (1.0 - r2) * g, u_ring);
}`;

// Damped wave equation, semi-implicit (velocity first, then position),
// height + velocity packed in one texture so a single ping-pong suffices.
// While a press is held, the surface is springed toward a sustained cavity
// (u_pressAmp slowly breathes, shedding rings from the rim) — continuous
// forcing instead of repeated splats, so the center never flip-flops.
const HEIGHT_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_height;
uniform vec2 u_texel;
uniform float u_waveSpeed;
uniform float u_velDamp;
uniform float u_heightDamp;
uniform vec2 u_press;
uniform float u_pressAmp;
uniform float u_pressRadius;
uniform float u_aspect;
void main() {
  vec2 hv = texture(u_height, v_uv).rg;
  float hL = texture(u_height, v_uv - vec2(u_texel.x, 0.0)).r;
  float hR = texture(u_height, v_uv + vec2(u_texel.x, 0.0)).r;
  float hB = texture(u_height, v_uv - vec2(0.0, u_texel.y)).r;
  float hT = texture(u_height, v_uv + vec2(0.0, u_texel.y)).r;
  float lap = hL + hR + hB + hT - 4.0 * hv.x;
  float vel = (hv.y + u_waveSpeed * lap) * u_velDamp;
  if (u_pressAmp > 0.0) {
    vec2 pd = v_uv - u_press;
    pd.x *= u_aspect;
    float pg = exp(-dot(pd, pd) / (u_pressRadius * u_pressRadius));
    // spring toward the cavity profile, strongest under the press. Stiffness
    // sets the cavity's own response period (~0.35 s here); it has to be
    // quicker than the fastest breath it is asked to follow, or the opening
    // flurry is smoothed away before it can shed a ring.
    vel += ((-u_pressAmp * pg) - hv.x) * (0.09 * pg);
  }
  float h = (hv.x + vel) * u_heightDamp;
  o = vec4(h, vel, 0.0, 0.0);
}`;

// Dye: advect slightly along the wave gradient, diffuse, decay.
const DYE_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_dye;
uniform sampler2D u_height;
uniform vec2 u_texel;
uniform float u_advect;
uniform float u_diffuse;
uniform float u_decay;
void main() {
  float hL = texture(u_height, v_uv - vec2(u_texel.x, 0.0)).r;
  float hR = texture(u_height, v_uv + vec2(u_texel.x, 0.0)).r;
  float hB = texture(u_height, v_uv - vec2(0.0, u_texel.y)).r;
  float hT = texture(u_height, v_uv + vec2(0.0, u_texel.y)).r;
  vec2 grad = vec2(hR - hL, hT - hB);
  vec4 c = texture(u_dye, v_uv - grad * u_advect);
  vec4 nsum = texture(u_dye, v_uv - vec2(u_texel.x, 0.0))
            + texture(u_dye, v_uv + vec2(u_texel.x, 0.0))
            + texture(u_dye, v_uv - vec2(0.0, u_texel.y))
            + texture(u_dye, v_uv + vec2(0.0, u_texel.y));
  c = mix(c, nsum * 0.25, u_diffuse);
  o = max(c * u_decay, vec4(0.0));
}`;

// Final composite: a still pool the same color as the original home
// background (#ededee), so the chrome text reads identically in both
// variants. Dye bleeds into the surface like watercolor (multiplied, not
// glowing), with a subtle iridescent shift and wave shading where disturbed.
const RENDER_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_height;
uniform sampler2D u_dye;
uniform vec2 u_texel;
uniform float u_time;
uniform float u_iri;
uniform float u_filmScale;
uniform float u_grain;
uniform float u_shimmer;
// uv the shimmer field is sampled at, per second; the pattern itself travels
// the opposite way, so this points down-right to make the shadows flow up-left
uniform vec2 u_drift;
// 1 = apply screen-space finishing (grain + vignette) here, as usual.
// 0 = the dive pass re-applies them after its zoom, so they stay glued to the
//     screen instead of magnifying with the water like a scaled image.
uniform float u_postFx;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  float hL = texture(u_height, v_uv - vec2(u_texel.x, 0.0)).r;
  float hR = texture(u_height, v_uv + vec2(u_texel.x, 0.0)).r;
  float hB = texture(u_height, v_uv - vec2(0.0, u_texel.y)).r;
  float hT = texture(u_height, v_uv + vec2(0.0, u_texel.y)).r;
  float h = texture(u_height, v_uv).r;
  vec2 grad = vec2(hR - hL, hT - hB);

  // idle shimmer: a slow, smooth perturbation of the surface normal. The field
  // is sampled at a sliding point, so the whole pattern travels as one body of
  // water; each wavelet keeps a small oscillation of its own, well under the
  // drift, so the surface morphs as it goes instead of sliding like wallpaper.
  vec2 suv = v_uv + u_time * u_drift;
  grad += u_shimmer * vec2(
    sin(dot(suv, vec2(41.0, 29.0)) + u_time * 0.22) + sin(dot(suv, vec2(13.0, 53.0)) - u_time * 0.14),
    cos(dot(suv, vec2(23.0, 47.0)) - u_time * 0.19) + cos(dot(suv, vec2(59.0, 17.0)) + u_time * 0.12)
  );

  float slope = length(grad);
  vec3 n = normalize(vec3(-grad * 20.0, 1.0));

  vec4 dyeS = texture(u_dye, v_uv);
  float dyeAmt = max(dyeS.r, max(dyeS.g, dyeS.b));

  // chroma restore: pull mixed dye back toward its dominant hue so many
  // overlapping memories stay distinct instead of averaging to mud
  float lum = dot(dyeS.rgb, vec3(0.299, 0.587, 0.114));
  vec3 dye = clamp(mix(vec3(lum), dyeS.rgb, 2.2), 0.0, 4.0);
  vec3 tint = dye / max(max(dye.r, max(dye.g, dye.b)), 1e-4);

  // color only where the surface has been disturbed; kept translucent so the
  // water never goes dark — a wash, not a stain
  float mask = min(smoothstep(0.01, 1.1, dyeAmt), 0.62);

  // the original home background, with a whisper of paper grain
  vec3 base = vec3(0.9294, 0.9294, 0.9333);
  base += (hash(floor(gl_FragCoord.xy * 0.75)) - 0.5) * u_grain * u_postFx;

  // watercolor bleed: dye multiplies onto the light surface, tint lifted
  // toward white so even dark palette entries stay a soft gray-wash
  tint = mix(tint, vec3(1.0), 0.24);
  vec3 col = base * mix(vec3(1.0), tint, mask * 0.8);

  // thin-film iridescence on everything disturbed (dye or live ripples),
  // swept through a soft japanese-gradient palette — sakura pink, lavender,
  // mizu blue, pale gold — rather than a full oil-slick rainbow. The local
  // dye hue rotates the palette's phase, so each memory's ripple group
  // interferes in its own gradient rather than one shared rainbow.
  float iriMask = max(mask, smoothstep(0.004, 0.08, slope) * 0.5);
  float phase = u_filmScale * (dyeAmt * 2.6 + h * 5.0 + slope * 10.0)
              + dot(tint, vec3(0.0, 2.4, 4.8)) * mask;
  vec3 film = vec3(0.92, 0.88, 0.90) + vec3(0.13, 0.14, 0.13) * cos(phase + vec3(0.0, 1.35, 2.7));
  col *= mix(vec3(1.0), film, iriMask * u_iri);

  // wave shading: crests catch light, troughs darken (flat water = exactly
  // base). Where a memory's dye lives, the trough shadow deepens toward its
  // hue instead of gray — each ripple group shades in its own color.
  vec3 lightDir = normalize(vec3(0.35, 0.55, 0.75));
  float diff = dot(n, lightDir) - lightDir.z;
  col *= 1.0 + diff * 0.42;
  // absolute-depth cue: slope shading saturates on steep rings, so past that
  // point a harder press stopped reading. Water pressed well down darkens
  // with its true depth; heaped crests pick up a little extra light. The
  // floor sits just past the deepest memory, so only a press ever reaches it.
  col *= 1.0 + clamp(h * 0.14, -0.42, 0.12);
  col -= max(-diff, 0.0) * (vec3(1.0) - tint) * mask * 0.3;
  float spec = pow(max(dot(reflect(-lightDir, n), vec3(0.0, 0.0, 1.0)), 0.0), 48.0);
  col += spec * min(slope * 9.0, 1.0) * 0.09;

  // vignette, matching the original's soft rgba(0,0,0,0.08) edge
  vec2 vc = v_uv - 0.5;
  col *= 1.0 - dot(vc, vc) * 0.16 * u_postFx;

  o = vec4(col, 1.0);
}`;

// Dive pass (gallery descent): the composited scene, re-projected as the
// camera pushes toward a point on the surface and through it.
//  - dolly:  uv is magnified around u_focus — the camera moving in, never the
//            image scaling away
//  - defocus: 16-tap poisson disc, randomly rotated per pixel so the blur
//            dithers instead of banding
//  - wash:   contrast collapses toward the still-water color — the surface
//            settling behind the viewer as depth mist, not darkness
const DIVE_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_scene;
uniform vec2 u_focus;
uniform float u_zoom;      // fraction of uv pulled toward the focus (0..1)
uniform float u_blur;      // defocus radius, in uv of the short edge
uniform float u_wash;      // 0..1 contrast collapse toward the surface color
uniform float u_grain;     // screen-space paper grain, applied after the zoom
uniform vec2 u_aspectFix;  // short-edge uv radius -> per-axis uv

const vec2 POISSON[16] = vec2[](
  vec2(-0.94201624, -0.39906216), vec2( 0.94558609, -0.76890725),
  vec2(-0.09418410, -0.92938870), vec2( 0.34495938,  0.29387760),
  vec2(-0.91588581,  0.45771432), vec2(-0.81544232, -0.87912464),
  vec2(-0.38277543,  0.27676845), vec2( 0.97484398,  0.75648379),
  vec2( 0.44323325, -0.97511554), vec2( 0.53742981, -0.47373420),
  vec2(-0.26496911, -0.41893023), vec2( 0.79197514,  0.19090188),
  vec2(-0.24188840,  0.99706507), vec2(-0.81409955,  0.91437590),
  vec2( 0.19984126,  0.78641367), vec2( 0.14383161, -0.14100790)
);

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = u_focus + (v_uv - u_focus) * (1.0 - u_zoom);

  vec3 c;
  if (u_blur > 1e-5) {
    float a = hash(gl_FragCoord.xy) * 6.2831853;
    mat2 rot = mat2(cos(a), sin(a), -sin(a), cos(a));
    c = vec3(0.0);
    for (int i = 0; i < 16; i++) {
      c += texture(u_scene, uv + rot * POISSON[i] * u_blur * u_aspectFix).rgb;
    }
    c /= 16.0;
  } else {
    c = texture(u_scene, uv).rgb;
  }

  vec3 base = vec3(0.9294, 0.9294, 0.9333);
  c = base + (c - base) * (1.0 - u_wash);

  // grain + vignette re-applied here, in final screen space — the paper
  // texture must stay glued to the glass, not magnify with the water (the
  // scene pass skips both while diving; see u_postFx there)
  c += (hash(floor(gl_FragCoord.xy * 0.75)) - 0.5) * u_grain;
  vec2 vc = v_uv - 0.5;
  c *= 1.0 - dot(vc, vc) * 0.16;

  o = vec4(c, 1.0);
}`;

/* ───────── GL plumbing ───────── */

interface Pass {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

interface PingPong {
  read: WebGLTexture;
  write: WebGLTexture;
  readFbo: WebGLFramebuffer;
  writeFbo: WebGLFramebuffer;
}

interface Splat {
  x: number;
  y: number;
  radius: number;
  /** Height depression; 0 for dye-only splats (reduced motion / pure color). */
  strength: number;
  /** Linear-ish RGB dye color, or null for a colorless stir/ring. */
  dye: [number, number, number] | null;
  /** Multiplier on dropDyeAmount. */
  dyeScale: number;
  /** Ms until this splat lands — the fallback jet's second ring arrives late. */
  delayMs: number;
  /** 0 = smooth gaussian dimple, 1 = crater + rim (see SPLAT_FRAG). Falling
      drops ring; a dragged finger carves a smooth groove, so closely spaced
      trail stirs merge into one wake instead of interfering as many rings. */
  ring: number;
}

const STEP_MS = 1000 / 60;
const MAX_SUBSTEPS = 3;
const DECAY_CADENCE = 12; // apply dye decay every N substeps (fp16 rounding, see header)

/* The Worthington jet: a hard drop throws a plume up out of the water, and it
   falls back a beat later as a smaller drop — the paired concentric rings that
   make rain on water instantly recognizable. */
const JET_MIN_STRENGTH_FRACTION = 0.5; // of dropStrength; stirs never jet
const JET_STRENGTH = 0.4;
const JET_RADIUS = 0.6;
const JET_DELAY_MS = 210;
const JET_DELAY_JITTER_MS = 130;

/** Per-frame camera state for the gallery descent. All values are final (pre-eased). */
export interface PuddleDiveState {
  /** uv point the camera pushes toward. */
  x: number;
  y: number;
  /** Fraction of uv pulled toward the focus — dolly magnification. 0 = no dolly. */
  zoom: number;
  /** Defocus radius, in uv of the short edge. */
  blur: number;
  /** 0..1 contrast collapse toward the still-water color. */
  wash: number;
}

export interface PuddleSimulation {
  /** Queue a drop. x/y in uv space (0..1, y up). strength 0 = dye only. */
  addDrop(
    x: number,
    y: number,
    radiusScale: number,
    strength: number,
    dye: [number, number, number] | null,
    dyeScale?: number,
  ): void;
  /**
   * Queue a weak colorless pointer disturbance. `depth` scales it — 1 for the
   * shallow trail mid-stroke, more where a finger enters or leaves the water.
   */
  addStir(x: number, y: number, depth?: number): void;
  /** Hold a sustained cavity at x/y (uv) — rings shed continuously from its rim. */
  setPress(x: number, y: number): void;
  /** Release the held cavity; the water rebounds on its own. */
  clearPress(): void;
  /** Flush splats and advance the sim by dtMs (fixed 60 Hz substeps inside). */
  step(dtMs: number): void;
  /** Composite the current state to the canvas. timeSec drives the idle shimmer. */
  render(timeSec: number): void;
  /**
   * Gallery descent camera. Non-null routes render() through an offscreen
   * scene target + the dive pass (dolly toward the focus, defocus, wash).
   * Never touches the height/dye state — the memories survive the descent.
   */
  setDive(state: PuddleDiveState | null): void;
  /**
   * Snapshot the height + dye fields, and put them back later. The dive uses
   * this so nothing that happens underwater — the rings an arrow press sends,
   * the dye those rings smear, the decay that runs while you browse — leaves a
   * mark on the surface you came from. Restoring frees the snapshot.
   */
  captureState(): void;
  restoreState(): void;
  /** Run dye-only steps synchronously (reduced-motion pre-settle). */
  runDyeSettle(steps: number): void;
  /** Match canvas backing store to its CSS size. Sim resolution stays fixed. */
  resize(): void;
  dispose(): void;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(`puddle shader compile failed: ${log}`);
  }
  return s;
}

function makePass(gl: WebGL2RenderingContext, vert: WebGLShader, fragSrc: string, uniformNames: string[]): Pass {
  const frag = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
  const program = gl.createProgram()!;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`puddle program link failed: ${gl.getProgramInfoLog(program)}`);
  }
  const uniforms: Pass["uniforms"] = {};
  for (const name of uniformNames) uniforms[name] = gl.getUniformLocation(program, name);
  return { program, uniforms };
}

function makeTarget(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  internalFormat: number,
  format: number,
): { tex: WebGLTexture; fbo: WebGLFramebuffer } {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, gl.HALF_FLOAT, null);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  return { tex, fbo };
}

function makePingPong(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  internalFormat: number,
  format: number,
): PingPong {
  const a = makeTarget(gl, w, h, internalFormat, format);
  const b = makeTarget(gl, w, h, internalFormat, format);
  return { read: a.tex, write: b.tex, readFbo: a.fbo, writeFbo: b.fbo };
}

function swap(p: PingPong): void {
  const t = p.read;
  p.read = p.write;
  p.write = t;
  const f = p.readFbo;
  p.readFbo = p.writeFbo;
  p.writeFbo = f;
}

/* ───────── factory ───────── */

/** Returns null when WebGL2 / float render targets are unavailable. */
export function createPuddleSimulation(
  canvas: HTMLCanvasElement,
  tuning: PuddleTuning = PUDDLE_TUNING,
): PuddleSimulation | null {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
  });
  if (!gl || !gl.getExtension("EXT_color_buffer_float")) return null;

  /* sim resolution: long edge <= 512, aspect from the mount-time viewport.
     Fixed for the lifetime of the sim so resizes never wipe the state. */
  const cw = Math.max(canvas.clientWidth, 1);
  const ch = Math.max(canvas.clientHeight, 1);
  const simScale = 512 / Math.max(cw, ch);
  const simW = Math.max(Math.round(cw * Math.min(simScale, 1)), 32);
  const simH = Math.max(Math.round(ch * Math.min(simScale, 1)), 32);
  const texel: [number, number] = [1 / simW, 1 / simH];
  const aspect = simW / simH;
  /* Shimmer drift, aspect-corrected so the current runs on the screen diagonal
     rather than being stretched flat on a wide viewport. */
  const driftUv: [number, number] = [
    (tuning.idleDrift * Math.SQRT1_2) / aspect,
    -tuning.idleDrift * Math.SQRT1_2,
  ];

  let vert: WebGLShader;
  let splatPass: Pass, heightPass: Pass, dyePass: Pass, renderPass: Pass;
  let height: PingPong, dye: PingPong;
  try {
    vert = compile(gl, gl.VERTEX_SHADER, VERT);
    splatPass = makePass(gl, vert, SPLAT_FRAG, ["u_src", "u_point", "u_radius", "u_value", "u_aspect", "u_ring"]);
    heightPass = makePass(gl, vert, HEIGHT_FRAG, [
      "u_height", "u_texel", "u_waveSpeed", "u_velDamp", "u_heightDamp",
      "u_press", "u_pressAmp", "u_pressRadius", "u_aspect",
    ]);
    dyePass = makePass(gl, vert, DYE_FRAG, ["u_dye", "u_height", "u_texel", "u_advect", "u_diffuse", "u_decay"]);
    renderPass = makePass(gl, vert, RENDER_FRAG, [
      "u_height", "u_dye", "u_texel", "u_time", "u_iri", "u_filmScale", "u_grain", "u_shimmer",
      "u_drift", "u_postFx",
    ]);
    height = makePingPong(gl, simW, simH, gl.RG16F, gl.RG);
    dye = makePingPong(gl, simW, simH, gl.RGBA16F, gl.RGBA);
  } catch {
    return null;
  }

  // fullscreen triangle
  const vao = gl.createVertexArray()!;
  const vbo = gl.createBuffer()!;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);

  const queue: Splat[] = [];
  let accumulator = 0;
  let substepCount = 0;
  /* Seconds the current press has been held. It ticks on the same fixed
     substep as the waves and restarts with each new press, so the cavity keeps
     an even rhythm no matter when the press began or how the frame rate wanders. */
  let pressTime = 0;
  let pressPoint: [number, number] | null = null;
  let disposed = false;

  /* dive (gallery descent) resources — created lazily on first use so the
     homescreen pays nothing until the user actually dives */
  let diveState: PuddleDiveState | null = null;
  let divePass: Pass | null = null;
  let sceneTarget: { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number } | null = null;

  function makeSceneTarget(w: number, h: number) {
    const tex = gl!.createTexture()!;
    gl!.bindTexture(gl!.TEXTURE_2D, tex);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA8, w, h, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, null);
    const fbo = gl!.createFramebuffer()!;
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
    gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, tex, 0);
    return { tex, fbo, w, h };
  }

  function dropSceneTarget(): void {
    if (!sceneTarget) return;
    gl!.deleteTexture(sceneTarget.tex);
    gl!.deleteFramebuffer(sceneTarget.fbo);
    sceneTarget = null;
  }

  /* pre-dive snapshot of the two fields — see captureState / restoreState */
  let snapHeight: { tex: WebGLTexture; fbo: WebGLFramebuffer } | null = null;
  let snapDye: { tex: WebGLTexture; fbo: WebGLFramebuffer } | null = null;

  function dropSnapshot(): void {
    for (const s of [snapHeight, snapDye]) {
      if (!s) continue;
      gl!.deleteTexture(s.tex);
      gl!.deleteFramebuffer(s.fbo);
    }
    snapHeight = null;
    snapDye = null;
  }

  /** Same size, same format — a straight color blit, no shader needed. */
  function blitField(src: WebGLFramebuffer, dst: WebGLFramebuffer): void {
    gl!.bindFramebuffer(gl!.READ_FRAMEBUFFER, src);
    gl!.bindFramebuffer(gl!.DRAW_FRAMEBUFFER, dst);
    gl!.blitFramebuffer(0, 0, simW, simH, 0, 0, simW, simH, gl!.COLOR_BUFFER_BIT, gl!.NEAREST);
    gl!.bindFramebuffer(gl!.READ_FRAMEBUFFER, null);
    gl!.bindFramebuffer(gl!.DRAW_FRAMEBUFFER, null);
  }

  /** Half the canvas backing store — the result is defocused anyway. */
  function ensureDiveResources(): boolean {
    if (!divePass) {
      try {
        divePass = makePass(gl!, vert, DIVE_FRAG, [
          "u_scene", "u_focus", "u_zoom", "u_blur", "u_wash", "u_grain", "u_aspectFix",
        ]);
      } catch {
        return false; // fall back to the un-dived composite
      }
    }
    const w = Math.max(Math.round(gl!.drawingBufferWidth / 2), 1);
    const h = Math.max(Math.round(gl!.drawingBufferHeight / 2), 1);
    if (!sceneTarget || sceneTarget.w !== w || sceneTarget.h !== h) {
      dropSceneTarget();
      sceneTarget = makeSceneTarget(w, h);
    }
    return true;
  }

  // dye decay applied every DECAY_CADENCE substeps — see header comment
  const decayFactor = Math.pow(0.5, (DECAY_CADENCE / 60) / Math.max(tuning.dyeDecayHalfLife, 1));

  function drawQuad(): void {
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }

  function runSplat(field: PingPong, s: Splat, value: [number, number, number, number], ring: number): void {
    gl!.useProgram(splatPass.program);
    gl!.viewport(0, 0, simW, simH);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, field.writeFbo);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, field.read);
    gl!.uniform1i(splatPass.uniforms.u_src, 0);
    gl!.uniform2f(splatPass.uniforms.u_point, s.x, s.y);
    gl!.uniform1f(splatPass.uniforms.u_radius, s.radius);
    gl!.uniform4f(splatPass.uniforms.u_value, value[0], value[1], value[2], value[3]);
    gl!.uniform1f(splatPass.uniforms.u_aspect, aspect);
    gl!.uniform1f(splatPass.uniforms.u_ring, ring);
    drawQuad();
    swap(field);
  }

  /** Land every splat whose delay has elapsed; keep the rest waiting. */
  function flushSplats(dtMs: number): void {
    for (let i = queue.length - 1; i >= 0; i--) {
      const s = queue[i];
      s.delayMs -= dtMs;
      if (s.delayMs > 0) continue;
      queue.splice(i, 1);
      if (s.strength !== 0) {
        runSplat(height, s, [-s.strength, 0, 0, 0], s.ring);
      }
      if (s.dye) {
        const a = tuning.dropDyeAmount * s.dyeScale;
        runSplat(dye, { ...s, radius: s.radius * 1.25 }, [s.dye[0] * a, s.dye[1] * a, s.dye[2] * a, 0], 0);
      }
    }
  }

  function heightStep(): void {
    gl!.useProgram(heightPass.program);
    gl!.viewport(0, 0, simW, simH);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, height.writeFbo);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, height.read);
    gl!.uniform1i(heightPass.uniforms.u_height, 0);
    gl!.uniform2f(heightPass.uniforms.u_texel, texel[0], texel[1]);
    gl!.uniform1f(heightPass.uniforms.u_waveSpeed, tuning.waveSpeed);
    gl!.uniform1f(heightPass.uniforms.u_velDamp, tuning.waveDamping);
    gl!.uniform1f(heightPass.uniforms.u_heightDamp, tuning.heightRetention);
    /* Held cavity breathes around its resting depth; each cycle sheds a ring.
       The breath opens at its shallow end (-cos), so the well sinks in rather
       than slamming, and it opens *fast* — the rate eases from the start period
       to the steady one, so a press throws off several quick rings before
       settling. Phase is the integral of that easing rate, which is what keeps
       crests evenly spaced as it slows instead of skipping or doubling one. */
    let amp = 0;
    if (pressPoint) {
      pressTime += 1 / 60;
      const rateEnd = 1 / Math.max(tuning.holdPulsePeriod, 0.1);
      const rateStart = 1 / Math.max(tuning.holdPulseStartPeriod, 0.1);
      const settle = Math.max(tuning.holdPulseSettle, 0.05);
      const cycles =
        rateEnd * pressTime +
        (rateStart - rateEnd) * settle * (1 - Math.exp(-pressTime / settle));
      amp = tuning.holdDepth * (0.85 + 0.3 * -Math.cos(cycles * Math.PI * 2));
    }
    gl!.uniform2f(heightPass.uniforms.u_press, pressPoint?.[0] ?? 0, pressPoint?.[1] ?? 0);
    gl!.uniform1f(heightPass.uniforms.u_pressAmp, amp);
    gl!.uniform1f(heightPass.uniforms.u_pressRadius, tuning.dropRadius * 2.2);
    gl!.uniform1f(heightPass.uniforms.u_aspect, aspect);
    drawQuad();
    swap(height);
  }

  function dyeStep(): void {
    substepCount++;
    gl!.useProgram(dyePass.program);
    gl!.viewport(0, 0, simW, simH);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, dye.writeFbo);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, dye.read);
    gl!.uniform1i(dyePass.uniforms.u_dye, 0);
    gl!.activeTexture(gl!.TEXTURE1);
    gl!.bindTexture(gl!.TEXTURE_2D, height.read);
    gl!.uniform1i(dyePass.uniforms.u_height, 1);
    gl!.uniform2f(dyePass.uniforms.u_texel, texel[0], texel[1]);
    gl!.uniform1f(dyePass.uniforms.u_advect, tuning.dyeAdvection);
    gl!.uniform1f(dyePass.uniforms.u_diffuse, tuning.dyeDiffusion);
    gl!.uniform1f(dyePass.uniforms.u_decay, substepCount % DECAY_CADENCE === 0 ? decayFactor : 1.0);
    drawQuad();
    swap(dye);
  }

  return {
    addDrop(x, y, radiusScale, strength, dyeColor, dyeScale = 1) {
      const radius = tuning.dropRadius * radiusScale;
      queue.push({ x, y, radius, strength, dye: dyeColor, dyeScale, delayMs: 0, ring: 1 });
      // hard drops jet: a smaller colorless second drop lands a beat later
      if (strength >= tuning.dropStrength * JET_MIN_STRENGTH_FRACTION) {
        queue.push({
          x,
          y,
          radius: radius * JET_RADIUS,
          strength: strength * JET_STRENGTH,
          dye: null,
          dyeScale: 0,
          delayMs: JET_DELAY_MS + Math.random() * JET_DELAY_JITTER_MS,
          ring: 1,
        });
      }
    },

    addStir(x, y, depth = 1) {
      // shallow next to any memory drop — the pointer grazes the water, it
      // doesn't fall into it. The trail is a smooth dimple (no rim) so a drag
      // reads as one coherent wake; only the deep entry/exit presses shed a
      // soft partial ring.
      queue.push({
        x,
        y,
        radius: tuning.dropRadius * 0.55 * (1 + (depth - 1) * 0.35),
        strength: tuning.dropStrength * 0.08 * depth,
        dye: null,
        dyeScale: 0,
        delayMs: 0,
        ring: depth > 1 ? 0.5 : 0,
      });
    },

    setPress(x, y) {
      // only a fresh press restarts the breath — moving the pointer drags the
      // cavity along, it doesn't begin a new one
      if (!pressPoint) pressTime = 0;
      pressPoint = [x, y];
    },

    clearPress() {
      pressPoint = null;
    },

    step(dtMs) {
      if (disposed) return;
      flushSplats(dtMs);
      accumulator += Math.min(dtMs, 60);
      let n = Math.floor(accumulator / STEP_MS);
      if (n > MAX_SUBSTEPS) {
        n = MAX_SUBSTEPS;
        accumulator = 0;
      } else {
        accumulator -= n * STEP_MS;
      }
      for (let i = 0; i < n; i++) {
        heightStep();
        dyeStep();
      }
    },

    render(timeSec) {
      if (disposed) return;
      const dived = diveState !== null && ensureDiveResources();

      // composite pass — to the canvas, or to the scene target when diving
      gl.useProgram(renderPass.program);
      if (dived && sceneTarget) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, sceneTarget.fbo);
        gl.viewport(0, 0, sceneTarget.w, sceneTarget.h);
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, height.read);
      gl.uniform1i(renderPass.uniforms.u_height, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, dye.read);
      gl.uniform1i(renderPass.uniforms.u_dye, 1);
      gl.uniform2f(renderPass.uniforms.u_texel, texel[0], texel[1]);
      gl.uniform1f(renderPass.uniforms.u_time, timeSec);
      gl.uniform1f(renderPass.uniforms.u_iri, tuning.iridescenceStrength);
      gl.uniform1f(renderPass.uniforms.u_filmScale, tuning.filmScale);
      gl.uniform1f(renderPass.uniforms.u_grain, tuning.grainAmount);
      gl.uniform1f(renderPass.uniforms.u_shimmer, tuning.idleShimmer);
      gl.uniform2f(renderPass.uniforms.u_drift, driftUv[0], driftUv[1]);
      // while diving, grain + vignette move to the dive pass (screen space)
      gl.uniform1f(renderPass.uniforms.u_postFx, dived ? 0 : 1);
      drawQuad();

      // dive pass — dolly toward the focus, defocus, contrast wash
      if (dived && sceneTarget && divePass && diveState) {
        const shortEdge = Math.min(sceneTarget.w, sceneTarget.h);
        gl.useProgram(divePass.program);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneTarget.tex);
        gl.uniform1i(divePass.uniforms.u_scene, 0);
        gl.uniform2f(divePass.uniforms.u_focus, diveState.x, diveState.y);
        gl.uniform1f(divePass.uniforms.u_zoom, diveState.zoom);
        gl.uniform1f(divePass.uniforms.u_blur, diveState.blur);
        gl.uniform1f(divePass.uniforms.u_wash, diveState.wash);
        gl.uniform1f(divePass.uniforms.u_grain, tuning.grainAmount);
        gl.uniform2f(
          divePass.uniforms.u_aspectFix,
          shortEdge / sceneTarget.w,
          shortEdge / sceneTarget.h,
        );
        drawQuad();
      }
    },

    setDive(state) {
      diveState = state ? { ...state } : null;
      if (!state) dropSceneTarget(); // free the offscreen target once surfaced
    },

    captureState() {
      if (disposed) return;
      dropSnapshot();
      snapHeight = makeTarget(gl, simW, simH, gl.RG16F, gl.RG);
      snapDye = makeTarget(gl, simW, simH, gl.RGBA16F, gl.RGBA);
      blitField(height.readFbo, snapHeight.fbo);
      blitField(dye.readFbo, snapDye.fbo);
    },

    restoreState() {
      if (disposed || !snapHeight || !snapDye) return;
      // into the read buffers — the write halves are overwritten next step
      blitField(snapHeight.fbo, height.readFbo);
      blitField(snapDye.fbo, dye.readFbo);
      dropSnapshot();
    },

    runDyeSettle(steps) {
      if (disposed) return;
      flushSplats(Infinity); // land everything now — this path renders a still
      for (let i = 0; i < steps; i++) dyeStep();
    },

    resize() {
      if (disposed) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(Math.round(canvas.clientWidth * dpr), 1);
      const h = Math.max(Math.round(canvas.clientHeight * dpr), 1);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      dropSceneTarget();
      dropSnapshot();
      if (divePass) gl.deleteProgram(divePass.program);
      for (const p of [height, dye]) {
        gl.deleteTexture(p.read);
        gl.deleteTexture(p.write);
        gl.deleteFramebuffer(p.readFbo);
        gl.deleteFramebuffer(p.writeFbo);
      }
      for (const pass of [splatPass, heightPass, dyePass, renderPass]) gl.deleteProgram(pass.program);
      gl.deleteShader(vert);
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
    },
  };
}
