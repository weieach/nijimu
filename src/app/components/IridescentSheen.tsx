/**
 * Iridescent sheen — a thin-film rainbow held along the rim of a glass panel,
 * with a gleam that every so often runs a lap around the border, like light
 * catching the edge of wet glass.
 *
 * Confined to the border by a rounded-rect distance field, so the face of the
 * panel stays clear and nothing washes over the words. Composited normally: the
 * film is a pale, low-alpha wash, which on a light surface keeps far more of
 * its colour than `overlay` or `screen` would (both collapse toward the
 * backdrop when the backdrop is already bright).
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
/** Corner radius and rim depth, both in device pixels. */
uniform float u_radius;
uniform float u_band;

/** Seconds per lap. */
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
  vec2 halfSize = u_res * 0.5;
  vec2 q = (v_uv - 0.5) * u_res;

  // rounded-rect distance: 0 on the border, growing inward
  vec2 corner = abs(q) - (halfSize - u_radius);
  float sd = length(max(corner, vec2(0.0))) + min(max(corner.x, corner.y), 0.0) - u_radius;
  float inward = -sd;

  // the light lives in the rim and lets go before it reaches the words
  float rim = (1.0 - smoothstep(0.0, u_band, inward)) * smoothstep(-1.5, 1.0, inward);
  rim *= rim;
  if (rim <= 0.0) {
    o = vec4(0.0);
    return;
  }

  // where we are around the border, 0..1 — normalised so the lap keeps an even
  // pace down the long sides rather than racing them
  vec2 n = q / max(halfSize, vec2(1.0));
  float ang = atan(n.y, n.x) / 6.28318 + 0.5;

  // uneven film thickness, sampled in 2D so the border has no seam
  float film = fbm(n * 2.2 + vec2(u_time * 0.02, -u_time * 0.013));

  float cycle = u_time / PERIOD;
  float passIdx = floor(cycle);
  float ph = fract(cycle);
  // some laps barely register — the gleam is an event, not a metronome
  float amp = 0.18 + 0.82 * smoothstep(0.3, 0.95, hash(vec2(passIdx, 7.31)));
  float width = 0.05 + 0.03 * hash(vec2(passIdx, 19.7));
  // each lap sets off from a different point on the border
  float travel = ang - (hash(vec2(passIdx, 3.17)) + ph);
  travel -= floor(travel + 0.5);
  // the envelope brings it up and lets it go, so no lap starts or ends abruptly
  float gleam = exp(-(travel * travel) / (width * width)) * amp * sin(3.14159 * ph);

  // a whisper of film at rest, so the rim is never quite dead
  float rest = 0.35 + 0.65 * film;

  // two full hue cycles around the border — an integer, so the seam is seamless
  float hue = film * 1.1 + ang * 2.0 + u_time * 0.01 + gleam * 0.3;
  // pale at rest, and only a gleam brings the colour up — plus a little white
  // in its core so the lap reads as light running the edge
  vec3 col = mix(vec3(0.9, 0.9, 0.93), spectrum(hue), 0.3 + 0.3 * gleam);
  col = mix(col, vec3(1.0), gleam * 0.12);

  float a = (rest * 0.1 + gleam * 0.26) * rim;
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

interface IridescentSheenProps {
  opacity?: number;
  /** Corner radius of the surface, CSS px — match the panel's own. */
  radius?: number;
  /** How far the light reaches in from the border, CSS px. */
  band?: number;
}

export function IridescentSheen({
  opacity = 0.9,
  radius = 30,
  band = 18,
}: IridescentSheenProps) {
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
    const uRadius = gl.getUniformLocation(program, "u_radius");
    const uBand = gl.getUniformLocation(program, "u_band");
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
      gl.uniform1f(uRadius, radius * dpr);
      gl.uniform1f(uBand, Math.max(band * dpr, 1));
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
  }, [radius, band]);

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
