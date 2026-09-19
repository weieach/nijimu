/**
 * Iridescent sheen — a thin-film rainbow that drifts over a glass surface and
 * every so often gleams across it, like light catching oil on water.
 *
 * Drawn as a WebGL2 layer composited normally over the glass: the film is a
 * pale, low-alpha wash, which on a light surface keeps far more of its colour
 * than `overlay` or `screen` would (both collapse toward the backdrop when the
 * backdrop is already bright). Gleams run on a slow clock with a per-pass
 * random amplitude, so some passes are barely there.
 *
 * Renders nothing when WebGL2 is unavailable — the panel underneath keeps its
 * blur and grain.
 */

import { useEffect, useRef } from "react";

/** A single full-screen triangle, no attribute buffers. */
const VERT = `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  v_uv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform vec2 u_res;
uniform float u_time;

/** Seconds between gleam passes. */
const float PERIOD = 10.0;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 3; i++) {
    sum += amp * vnoise(p);
    p *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

/** Cosine spectrum — the three channels offset into a full hue cycle. */
vec3 spectrum(float t) {
  return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.35, 0.68)));
}

void main() {
  float aspect = u_res.x / max(u_res.y, 1.0);
  vec2 p = v_uv;

  // uneven film thickness, drifting slowly across the glass
  float film = fbm(vec2(p.x * aspect, p.y) * 2.4 + vec2(u_time * 0.021, -u_time * 0.013));

  // the diagonal a gleam travels along, 0 at the near corner
  float axis = dot(p, normalize(vec2(0.82, 0.57)));

  float cycle = u_time / PERIOD;
  float passIdx = floor(cycle);
  float ph = fract(cycle);
  // some passes barely register — the gleam is an event, not a metronome
  float amp = 0.18 + 0.82 * smoothstep(0.3, 0.95, hash(vec2(passIdx, 7.31)));
  float width = 0.24 + 0.12 * hash(vec2(passIdx, 19.7));
  float d = (axis - mix(-0.35, 1.5, ph)) / width;
  float band = exp(-d * d);
  // the envelope keeps it from popping in at the edge of the panel
  float gleam = band * amp * sin(3.14159 * ph);

  // a whisper of film at rest, so the glass is never quite flat
  float rest = (0.22 + 0.5 * film) * (0.34 + 0.66 * (1.0 - smoothstep(0.15, 1.05, axis)));

  float hue = film * 1.15 + dot(p, vec2(0.75, -0.45)) * 0.9 + axis * 0.5
            + u_time * 0.008 + gleam * 0.35;
  // pale at rest, and only a gleam brings the colour up — plus a little white
  // in its core so the pass reads as light crossing the glass
  vec3 col = mix(vec3(0.9, 0.9, 0.93), spectrum(hue), 0.4 + 0.4 * gleam);
  col = mix(col, vec3(1.0), gleam * 0.16);

  float a = rest * 0.16 + gleam * 0.42;
  // release the outermost pixels so the sheen never outlines the panel
  a *= smoothstep(0.0, 0.05, p.x) * (1.0 - smoothstep(0.95, 1.0, p.x))
     * smoothstep(0.0, 0.05, p.y) * (1.0 - smoothstep(0.95, 1.0, p.y));

  o = vec4(col, clamp(a, 0.0, 1.0));
}`;

/** The frame a reduced-motion viewer sees: mid-pass, so the film still shows. */
const STILL_FRAME_SEC = 2.6;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`sheen shader compile failed: ${log}`);
  }
  return shader;
}

function link(gl: WebGL2RenderingContext): WebGLProgram {
  const vert = compile(gl, gl.VERTEX_SHADER, VERT);
  const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const program = gl.createProgram()!;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`sheen program link failed: ${log}`);
  }
  return program;
}

export function IridescentSheen({ opacity = 0.9 }: { opacity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
      stencil: false,
    });
    if (!gl) return;

    let program: WebGLProgram;
    try {
      program = link(gl);
    } catch (err) {
      // A silent missing sheen is hard to notice — say so while developing.
      if (import.meta.env.DEV) console.warn(err);
      return;
    }

    const uRes = gl.getUniformLocation(program, "u_res");
    const uTime = gl.getUniformLocation(program, "u_time");
    gl.useProgram(program);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let width = 0;
    let height = 0;

    const resize = (): boolean => {
      const w = Math.max(Math.round(canvas.clientWidth * dpr), 1);
      const h = Math.max(Math.round(canvas.clientHeight * dpr), 1);
      if (w === width && h === height) return false;
      width = w;
      height = h;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      return true;
    };

    const draw = (timeSec: number) => {
      gl.uniform2f(uRes, width, height);
      gl.uniform1f(uTime, timeSec);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    resize();

    let raf = 0;
    let observer: ResizeObserver | undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      draw(STILL_FRAME_SEC);
      observer = new ResizeObserver(() => {
        if (resize()) draw(STILL_FRAME_SEC);
      });
      observer.observe(canvas);
    } else {
      const start = performance.now();
      const loop = (now: number) => {
        resize();
        draw((now - start) / 1000);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      observer?.disconnect();
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        pointerEvents: "none",
        opacity,
      }}
    />
  );
}
