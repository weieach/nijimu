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
  /** Depth of the sustained cavity while a press is held — a heavy object resting in the water. */
  holdDepth: number;
  /** Seconds per breathing cycle of the held cavity; each cycle sheds a ring outward. */
  holdPulsePeriod: number;
}

export const PUDDLE_TUNING: PuddleTuning = {
  waveSpeed: 0.22,
  waveDamping: 0.986,
  heightRetention: 0.9992,
  dropRadius: 0.03,
  dropStrength: 0.9,
  dropDyeAmount: 1.0,
  dyeDecayHalfLife: 75,
  dyeDiffusion: 0.09,
  dyeAdvection: 1.4,
  iridescenceStrength: 0.9,
  filmScale: 7.0,
  grainAmount: 0.05,
  idleShimmer: 0.0035,
  holdDepth: 0.15,
  holdPulsePeriod: 1.3,
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
    // gentle spring toward the cavity profile, strongest under the press
    vel += ((-u_pressAmp * pg) - hv.x) * (0.035 * pg);
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

  // idle shimmer: a slow, smooth perturbation of the surface normal
  grad += u_shimmer * vec2(
    sin(dot(v_uv, vec2(41.0, 29.0)) + u_time * 0.7) + sin(dot(v_uv, vec2(13.0, 53.0)) - u_time * 0.43),
    cos(dot(v_uv, vec2(23.0, 47.0)) - u_time * 0.6) + cos(dot(v_uv, vec2(59.0, 17.0)) + u_time * 0.37)
  );

  float slope = length(grad);
  vec3 n = normalize(vec3(-grad * 24.0, 1.0));

  vec4 dyeS = texture(u_dye, v_uv);
  float dyeAmt = max(dyeS.r, max(dyeS.g, dyeS.b));

  // chroma restore: pull mixed dye back toward its dominant hue so many
  // overlapping memories stay distinct instead of averaging to mud
  float lum = dot(dyeS.rgb, vec3(0.299, 0.587, 0.114));
  vec3 dye = clamp(mix(vec3(lum), dyeS.rgb, 2.2), 0.0, 4.0);
  vec3 tint = dye / max(max(dye.r, max(dye.g, dye.b)), 1e-4);

  // color only where the surface has been disturbed; kept translucent so the
  // water never goes dark — a wash, not a stain
  float mask = min(smoothstep(0.01, 1.1, dyeAmt), 0.55);

  // the original home background, with a whisper of paper grain
  vec3 base = vec3(0.9294, 0.9294, 0.9333);
  base += (hash(floor(gl_FragCoord.xy * 0.75)) - 0.5) * u_grain;

  // watercolor bleed: dye multiplies onto the light surface, tint lifted
  // toward white so even dark palette entries stay a soft gray-wash
  tint = mix(tint, vec3(1.0), 0.3);
  vec3 col = base * mix(vec3(1.0), tint, mask * 0.75);

  // thin-film iridescence on everything disturbed (dye or live ripples),
  // swept through a soft japanese-gradient palette — sakura pink, lavender,
  // mizu blue, pale gold — rather than a full oil-slick rainbow
  float iriMask = max(mask, smoothstep(0.004, 0.08, slope) * 0.5);
  float phase = u_filmScale * (dyeAmt * 2.6 + h * 5.0 + slope * 10.0);
  vec3 film = vec3(0.92, 0.88, 0.90) + vec3(0.08, 0.09, 0.08) * cos(phase + vec3(0.0, 1.35, 2.7));
  col *= mix(vec3(1.0), film, iriMask * u_iri);

  // wave shading: crests catch light, troughs darken (flat water = exactly base)
  vec3 lightDir = normalize(vec3(0.35, 0.55, 0.75));
  float diff = dot(n, lightDir) - lightDir.z;
  col *= 1.0 + diff * 0.45;
  float spec = pow(max(dot(reflect(-lightDir, n), vec3(0.0, 0.0, 1.0)), 0.0), 48.0);
  col += spec * min(slope * 9.0, 1.0) * 0.1;

  // vignette, matching the original's soft rgba(0,0,0,0.08) edge
  vec2 vc = v_uv - 0.5;
  col *= 1.0 - dot(vc, vc) * 0.16;

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
  /** Queue a weak colorless pointer disturbance. */
  addStir(x: number, y: number): void;
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
  let simTime = 0; // seconds of simulated time, drives the press pulse
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
    simTime += 1 / 60;
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
    // held cavity breathes around its resting depth; each cycle sheds a ring
    let amp = 0;
    if (pressPoint) {
      const pulse = Math.sin((simTime * Math.PI * 2) / Math.max(tuning.holdPulsePeriod, 0.1));
      amp = tuning.holdDepth * (0.85 + 0.22 * pulse);
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
      queue.push({ x, y, radius: tuning.dropRadius * radiusScale, strength, dye: dyeColor, dyeScale });
    },

    addStir(x, y) {
      queue.push({ x, y, radius: tuning.dropRadius * 0.55, strength: tuning.dropStrength * 0.09, dye: null, dyeScale: 0 });
    },

    setPress(x, y) {
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
