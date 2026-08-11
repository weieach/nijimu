// 2D ripple texture — "rings of light" homescreen variant (Z key).
//
// Same height + dye ping-pong sim as the puddle variant, but rendered as
// wide soft bands of emitted light on paper rather than watercolor shading:
// gaussian crests, additive soft-clipped overlaps, a thin crisp contour only
// where rings cross, and scanned-paper grain weighted toward the midtones.
//
// Few, big, slow rings: wider drops and slower propagation than the puddle.
// Dye decay half-life stays long (~75 s); old drops eventually fade and the
// idle drip re-seeds them. Decay is applied every 12th substep (fp16).

/* ───────── hand-tunable uniforms ───────── */

export interface Ripple2dTuning {
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
  /** Overall gain of the emitted ring light. */
  iridescenceStrength: number;
  /** Unused by the airy render; kept so older tunings still typecheck. */
  filmScale: number;
  /** Scanned-paper grain amount. */
  grainAmount: number;
  /** Amplitude of the idle height shimmer (render-pass only, no sim cost). */
  idleShimmer: number;
  /** Depth of the sustained cavity while a press is held. */
  holdDepth: number;
  /** Seconds per breathing cycle of the held cavity. */
  holdPulsePeriod: number;
  /** The (shorter) cycle the breathing opens at — a press flurries with rings
      before settling into holdPulsePeriod. */
  holdPulseStartPeriod: number;
  /** Seconds over which that opening flurry eases into the steady rhythm. */
  holdPulseSettle: number;
}

export const RIPPLE2D_TUNING: Ripple2dTuning = {
  // few, big, slow: wide drops (long wavelength = few trailing rings)
  waveSpeed: 0.12,
  waveDamping: 0.99,
  heightRetention: 0.9992,
  dropRadius: 0.06,
  dropStrength: 0.9,
  dropDyeAmount: 1.0,
  dyeDecayHalfLife: 75,
  dyeDiffusion: 0.09,
  dyeAdvection: 1.4,
  iridescenceStrength: 0.9,
  filmScale: 7.0,
  grainAmount: 0.05,
  idleShimmer: 0.0035,
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
export function isRipple2dSupported(): boolean {
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

// Additive gaussian splat into whichever field is bound as u_src.
const SPLAT_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_src;
uniform vec2 u_point;
uniform float u_radius;
uniform vec4 u_value;
uniform float u_aspect;
void main() {
  vec4 base = texture(u_src, v_uv);
  vec2 d = v_uv - u_point;
  d.x *= u_aspect;
  float g = exp(-dot(d, d) / (u_radius * u_radius));
  o = base + u_value * g;
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

// Final composite — "rings of light" (airy 2d ripple texture).
// Each ripple is a wide soft band of emitted light on paper, not a surface
// feature: only the wave crests glow, with a long gaussian falloff. Overlap
// is additive but soft-clipped (exponential shoulder) so crossings plateau
// instead of blowing to white. The single hard element in the image is a
// crisp iso-contour that only exists where one ring crosses another.
// Uniform fine grain, weighted toward the midtones — scanned paper.
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

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  // wide 5-tap sample of the height field softens the band profile further
  float h = texture(u_height, v_uv).r * 0.4
          + texture(u_height, v_uv + vec2(u_texel.x * 1.8, 0.0)).r * 0.15
          + texture(u_height, v_uv - vec2(u_texel.x * 1.8, 0.0)).r * 0.15
          + texture(u_height, v_uv + vec2(0.0, u_texel.y * 1.8)).r * 0.15
          + texture(u_height, v_uv - vec2(0.0, u_texel.y * 1.8)).r * 0.15;

  // faint idle breathing so a settled frame isn't dead flat
  h += u_shimmer * (
    sin(dot(v_uv, vec2(31.0, 17.0)) + u_time * 0.5) +
    cos(dot(v_uv, vec2(11.0, 41.0)) - u_time * 0.4)
  );

  // rings read as emitted light: crests only, pre-clip intensity
  float I = max(h, 0.0) * (u_iri * 6.0);

  vec4 dyeS = texture(u_dye, v_uv);
  float dyeAmt = max(dyeS.r, max(dyeS.g, dyeS.b));
  float lum = dot(dyeS.rgb, vec3(0.299, 0.587, 0.114));
  vec3 tint = dyeAmt > 1e-4
    ? clamp(mix(vec3(lum), dyeS.rgb, 2.2) / max(dyeAmt, 1e-4), 0.0, 1.0)
    : vec3(1.0);
  float mask = min(smoothstep(0.01, 1.1, dyeAmt), 0.5);

  // paper, faintly washed by lingering memory dye
  vec3 base = vec3(0.895, 0.895, 0.9);
  base *= mix(vec3(1.0), tint, mask * 0.22);

  // additive light with a compressed highlight shoulder — overlaps plateau
  float Ic = 1.0 - exp(-I * 1.35);
  vec3 glow = mix(vec3(0.995), tint * 0.5 + 0.5, min(dyeAmt, 1.0) * 0.35);
  vec3 col = mix(base, glow, Ic * 0.92);

  // the one hard edge: a thin crisp contour, present only in overlaps
  float over = (I - 1.55) / max(fwidth(I), 1e-4);
  float contour = 1.0 - smoothstep(0.0, 1.6, abs(over));
  col -= contour * 0.14;

  // scanned-paper grain: uniform, slightly heavier in the midtones
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  float g = hash(floor(gl_FragCoord.xy * 0.75)) - 0.5;
  col += g * u_grain * (0.55 + 0.45 * (4.0 * l * (1.0 - l)));

  // soft edge falloff
  vec2 vc = v_uv - 0.5;
  col *= 1.0 - dot(vc, vc) * 0.18;

  o = vec4(col, 1.0);
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
}

const STEP_MS = 1000 / 60;
const MAX_SUBSTEPS = 3;
const DECAY_CADENCE = 12; // apply dye decay every N substeps (fp16 rounding, see header)

export interface Ripple2dSimulation {
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
    throw new Error(`ripple2d shader compile failed: ${log}`);
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
    throw new Error(`ripple2d program link failed: ${gl.getProgramInfoLog(program)}`);
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
export function createRipple2dSimulation(
  canvas: HTMLCanvasElement,
  tuning: Ripple2dTuning = RIPPLE2D_TUNING,
): Ripple2dSimulation | null {
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

  let vert: WebGLShader;
  let splatPass: Pass, heightPass: Pass, dyePass: Pass, renderPass: Pass;
  let height: PingPong, dye: PingPong;
  try {
    vert = compile(gl, gl.VERTEX_SHADER, VERT);
    splatPass = makePass(gl, vert, SPLAT_FRAG, ["u_src", "u_point", "u_radius", "u_value", "u_aspect"]);
    heightPass = makePass(gl, vert, HEIGHT_FRAG, [
      "u_height", "u_texel", "u_waveSpeed", "u_velDamp", "u_heightDamp",
      "u_press", "u_pressAmp", "u_pressRadius", "u_aspect",
    ]);
    dyePass = makePass(gl, vert, DYE_FRAG, ["u_dye", "u_height", "u_texel", "u_advect", "u_diffuse", "u_decay"]);
    renderPass = makePass(gl, vert, RENDER_FRAG, [
      "u_height", "u_dye", "u_texel", "u_time", "u_iri", "u_filmScale", "u_grain", "u_shimmer",
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

  // dye decay applied every DECAY_CADENCE substeps — see header comment
  const decayFactor = Math.pow(0.5, (DECAY_CADENCE / 60) / Math.max(tuning.dyeDecayHalfLife, 1));

  function drawQuad(): void {
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }

  function runSplat(field: PingPong, s: Splat, value: [number, number, number, number]): void {
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
    drawQuad();
    swap(field);
  }

  function flushSplats(): void {
    for (const s of queue) {
      if (s.strength !== 0) {
        // depress the surface; the wave equation rings it outward
        runSplat(height, s, [-s.strength, 0, 0, 0]);
      }
      if (s.dye) {
        const a = tuning.dropDyeAmount * s.dyeScale;
        runSplat(dye, { ...s, radius: s.radius * 1.25 }, [s.dye[0] * a, s.dye[1] * a, s.dye[2] * a, 0]);
      }
    }
    queue.length = 0;
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
    gl!.uniform1f(heightPass.uniforms.u_pressRadius, tuning.dropRadius * 1.4);
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
      queue.push({ x, y, radius: tuning.dropRadius * radiusScale, strength, dye: dyeColor, dyeScale });
    },

    addStir(x, y, depth = 1) {
      queue.push({
        x,
        y,
        radius: tuning.dropRadius * 0.55 * (1 + (depth - 1) * 0.35),
        strength: tuning.dropStrength * 0.08 * depth,
        dye: null,
        dyeScale: 0,
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
      flushSplats();
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
      gl.useProgram(renderPass.program);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
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
      drawQuad();
    },

    runDyeSettle(steps) {
      if (disposed) return;
      flushSplats();
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
