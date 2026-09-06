/**
 * Quiet water on the color-step wash: a finger or cursor stirs a flowing
 * refraction; a pinch (or click) sheds a slight ripple. Lives only on the
 * palette strip — not the page.
 */

export type PaletteWater = {
  stir: (u: number, v: number, speed?: number) => void;
  ripple: (u: number, v: number) => void;
  resize: () => void;
  dispose: () => void;
};

const VERT = `#version 300 es
layout(location = 0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

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
  float r2 = dot(d, d) / max(u_radius * u_radius, 1e-6);
  float g = exp(-r2);
  o = base + u_value * mix(g, (1.0 - r2) * g, u_ring);
}`;

const HEIGHT_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_height;
uniform vec2 u_texel;
uniform float u_waveSpeed;
uniform float u_velDamp;
uniform float u_heightDamp;
void main() {
  vec2 hv = texture(u_height, v_uv).rg;
  float hL = texture(u_height, v_uv - vec2(u_texel.x, 0.0)).r;
  float hR = texture(u_height, v_uv + vec2(u_texel.x, 0.0)).r;
  float hB = texture(u_height, v_uv - vec2(0.0, u_texel.y)).r;
  float hT = texture(u_height, v_uv + vec2(0.0, u_texel.y)).r;
  float lap = hL + hR + hB + hT - 4.0 * hv.x;
  float vel = (hv.y + u_waveSpeed * lap) * u_velDamp;
  float h = (hv.x + vel) * u_heightDamp;
  o = vec4(h, vel, 0.0, 0.0);
}`;

const RENDER_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_height;
uniform sampler2D u_wash;
uniform vec2 u_texel;
uniform vec2 u_flow;
void main() {
  float hL = texture(u_height, v_uv - vec2(u_texel.x, 0.0)).r;
  float hR = texture(u_height, v_uv + vec2(u_texel.x, 0.0)).r;
  float hB = texture(u_height, v_uv - vec2(0.0, u_texel.y)).r;
  float hT = texture(u_height, v_uv + vec2(0.0, u_texel.y)).r;
  vec2 grad = vec2(hR - hL, hT - hB);
  float h = texture(u_height, v_uv).r;
  vec2 warp = grad * 22.0 + u_flow * 0.07;
  vec4 wash = texture(u_wash, clamp(v_uv + warp, 0.0, 1.0));
  float slope = length(grad);
  float shine = min(slope * 7.13, 0.345) + max(h, 0.0) * 0.092;
  float shade = min(max(-h, 0.0) * 0.138, 0.115);
  float a = clamp(abs(h) * 2.415 + slope * 4.14, 0.0, 0.575);
  vec3 hi = mix(vec3(0.98, 0.99, 1.0), wash.rgb, 0.28);
  o = vec4(hi * a * (1.0 + shine - shade), a);
}`;

type Pass = {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
};

type PingPong = {
  read: WebGLTexture;
  write: WebGLTexture;
  readFbo: WebGLFramebuffer;
  writeFbo: WebGLFramebuffer;
};

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function makePass(
  gl: WebGL2RenderingContext,
  vert: WebGLShader,
  fragSrc: string,
  names: string[],
): Pass | null {
  const frag = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
  if (!frag) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  for (const name of names) uniforms[name] = gl.getUniformLocation(program, name);
  return { program, uniforms };
}

function makeTarget(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
): { tex: WebGLTexture; fbo: WebGLFramebuffer } | null {
  const tex = gl.createTexture();
  const fbo = gl.createFramebuffer();
  if (!tex || !fbo) return null;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, w, h, 0, gl.RG, gl.HALF_FLOAT, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fbo };
}

export function createPaletteWater(
  canvas: HTMLCanvasElement,
  washCanvas: HTMLCanvasElement,
): PaletteWater | null {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
  });
  if (!gl || !gl.getExtension("EXT_color_buffer_float")) return null;

  const vert = compile(gl, gl.VERTEX_SHADER, VERT);
  if (!vert) return null;
  const splatPass = makePass(gl, vert, SPLAT_FRAG, [
    "u_src",
    "u_point",
    "u_radius",
    "u_value",
    "u_aspect",
    "u_ring",
  ]);
  const heightPass = makePass(gl, vert, HEIGHT_FRAG, [
    "u_height",
    "u_texel",
    "u_waveSpeed",
    "u_velDamp",
    "u_heightDamp",
  ]);
  const renderPass = makePass(gl, vert, RENDER_FRAG, [
    "u_height",
    "u_wash",
    "u_texel",
    "u_flow",
  ]);
  if (!splatPass || !heightPass || !renderPass) return null;

  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  if (!vao || !vbo) return null;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  let cw = Math.max(canvas.clientWidth, 64);
  let ch = Math.max(canvas.clientHeight, 48);
  const simScale = 280 / Math.max(cw, ch);
  const simW = Math.max(Math.round(cw * Math.min(simScale, 1)), 48);
  const simH = Math.max(Math.round(ch * Math.min(simScale, 1)), 32);
  const texel: [number, number] = [1 / simW, 1 / simH];
  const aspect = simW / simH;

  const a = makeTarget(gl, simW, simH);
  const b = makeTarget(gl, simW, simH);
  if (!a || !b) return null;
  const height: PingPong = {
    read: a.tex,
    write: b.tex,
    readFbo: a.fbo,
    writeFbo: b.fbo,
  };

  const washTex = gl.createTexture();
  if (!washTex) return null;
  gl.bindTexture(gl.TEXTURE_2D, washTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, washCanvas);

  const queue: { x: number; y: number; radius: number; strength: number; ring: number }[] = [];
  let flowX = 0;
  let flowY = 0;
  let lastU = 0.5;
  let lastV = 0.5;
  let disposed = false;
  let raf = 0;

  const fitCanvas = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(Math.round(canvas.clientWidth * dpr), 1);
    const h = Math.max(Math.round(canvas.clientHeight * dpr), 1);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };
  fitCanvas();

  const swap = () => {
    const t = height.read;
    height.read = height.write;
    height.write = t;
    const f = height.readFbo;
    height.readFbo = height.writeFbo;
    height.writeFbo = f;
  };

  const drawQuad = () => {
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  const splat = (x: number, y: number, radius: number, strength: number, ring: number) => {
    gl.useProgram(splatPass.program);
    gl.viewport(0, 0, simW, simH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, height.writeFbo);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, height.read);
    gl.uniform1i(splatPass.uniforms.u_src, 0);
    gl.uniform2f(splatPass.uniforms.u_point, x, 1 - y);
    gl.uniform1f(splatPass.uniforms.u_radius, radius);
    gl.uniform4f(splatPass.uniforms.u_value, -strength, 0, 0, 0);
    gl.uniform1f(splatPass.uniforms.u_aspect, aspect);
    gl.uniform1f(splatPass.uniforms.u_ring, ring);
    drawQuad();
    swap();
  };

  const stepHeight = () => {
    gl.useProgram(heightPass.program);
    gl.viewport(0, 0, simW, simH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, height.writeFbo);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, height.read);
    gl.uniform1i(heightPass.uniforms.u_height, 0);
    gl.uniform2f(heightPass.uniforms.u_texel, texel[0], texel[1]);
    gl.uniform1f(heightPass.uniforms.u_waveSpeed, 0.22);
    gl.uniform1f(heightPass.uniforms.u_velDamp, 0.972);
    gl.uniform1f(heightPass.uniforms.u_heightDamp, 0.9974);
    drawQuad();
    swap();
  };

  const render = () => {
    fitCanvas();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(renderPass.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, height.read);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, washTex);
    gl.uniform1i(renderPass.uniforms.u_height, 0);
    gl.uniform1i(renderPass.uniforms.u_wash, 1);
    gl.uniform2f(renderPass.uniforms.u_texel, texel[0], texel[1]);
    gl.uniform2f(renderPass.uniforms.u_flow, -flowX, flowY);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    drawQuad();
    gl.disable(gl.BLEND);
  };

  const tick = () => {
    if (disposed) return;
    for (const s of queue) splat(s.x, s.y, s.radius, s.strength, s.ring);
    queue.length = 0;
    flowX *= 0.9;
    flowY *= 0.9;
    stepHeight();
    stepHeight();
    render();
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    stir(u, v, speed = 0) {
      if (disposed) return;
      const du = u - lastU;
      const dv = v - lastV;
      lastU = u;
      lastV = v;
      const travel = Math.hypot(du, dv);
      if (travel < 0.0004 && speed < 0.02) return;
      flowX += du * 2.4;
      flowY += dv * 2.4;
      const mag = Math.min(0.11, 0.028 + travel * 1.8 + Math.min(speed, 2.4) * 0.018);
      queue.push({
        x: u,
        y: v,
        radius: 0.055 + Math.min(travel, 0.08) * 0.4,
        strength: mag,
        ring: 0,
      });
    },
    ripple(u, v) {
      if (disposed) return;
      lastU = u;
      lastV = v;
      queue.push({ x: u, y: v, radius: 0.126, strength: 0.414, ring: 1 });
    },
    resize() {
      fitCanvas();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      gl.deleteProgram(splatPass.program);
      gl.deleteProgram(heightPass.program);
      gl.deleteProgram(renderPass.program);
      gl.deleteShader(vert);
      gl.deleteTexture(height.read);
      gl.deleteTexture(height.write);
      gl.deleteTexture(washTex);
      gl.deleteFramebuffer(height.readFbo);
      gl.deleteFramebuffer(height.writeFbo);
      gl.deleteBuffer(vbo);
      gl.deleteVertexArray(vao);
    },
  };
}
