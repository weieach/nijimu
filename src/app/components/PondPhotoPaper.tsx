import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { configureMemoryPhotoTexture } from "./MemoryPhotoLayer";

/** A picture let down onto the pond. A new serial starts a new descent. */
export interface PondPaper {
  url: string;
  serial: number;
}

/*
 * The print lives inside the pond's own perspective scene: the same camera,
 * the same water plane. It is a thin milky film — light passes through it and
 * scatters, so it is never clear and never white — with the photograph set
 * into it and a faint broken gloss across the surface. Being thin, it bends:
 * it curls as it drifts down from above the frame, settles onto the water
 * at its resting height (the pond answers with a ripple), and afterwards
 * keeps wandering a little on the swell.
 */

/** Where the sheet comes to rest — ahead of the camera, below the words. */
const REST = { x: 0.25, z: -1.4 };
const LONG_SIDE = 3.4;
const MARGIN = 0.13;
const FALL_SECONDS = 6.2;
const START_HEIGHT = 7.8;
/** Resting height of the near edge: clear of the water, above its chop. */
const REST_HEIGHT = 0.05;
/** Far edge lifted at rest, so the low camera can still read the print. */
const REST_PITCH = 0.24;
const SPLASH_STRENGTH = 0.8;
const APPEAR_SECONDS = 0.4;
/** How far the film curls while falling, in world units at the sheet's edge. */
const FALL_CURL = 0.95;
/** Mesh resolution — the curl is done per vertex. */
const SEGMENTS: [number, number] = [36, 28];

const glslNoise = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
  }
`;

/** The curl, shared by both meshes so the shadow follows the sheet. */
const glslCurl = /* glsl */ `
  uniform float uBend;
  uniform float uPhase;
  uniform vec2 uSize;
  // One deep cylinder across a diagonal, and a slower wave crossing it: a
  // sheet held by the air rather than a flag in the wind. The curl is zero
  // at the centre so the sheet bends around its middle instead of lifting.
  float lift(vec2 uv) {
    float a = (uv.x - .5) * 1.6 + (uv.y - .5) * .9;
    float b = (uv.y - .5) * 2.2 - (uv.x - .5) * .4;
    float curl = (cos(a * 2.4 + uPhase) - cos(uPhase)) * .5;
    float cross = (sin(b * 1.9 - uPhase * .7) - sin(-uPhase * .7)) * .25;
    return uBend * (curl + cross);
  }
`;

const paperVertex = /* glsl */ `
  ${glslCurl}
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.z += lift(uv);
    // The curl's normal, from the slope of the lift on either side.
    float e = .01;
    float dx = (lift(uv + vec2(e, 0.0)) - lift(uv - vec2(e, 0.0))) / (2.0 * e * uSize.x);
    float dy = (lift(uv + vec2(0.0, e)) - lift(uv - vec2(0.0, e))) / (2.0 * e * uSize.y);
    vec3 n = normalize(vec3(-dx, -dy, 1.0));
    vNormalW = normalize(mat3(modelMatrix) * n);
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const paperFragment = /* glsl */ `
  ${glslNoise}
  uniform sampler2D uPhoto;
  uniform float uOpacity;
  uniform vec2 uBorder;
  uniform float uSeed;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  void main() {
    vec3 v = normalize(cameraPosition - vWorldPos);
    vec3 n = normalize(vNormalW);
    if (dot(n, v) < 0.0) n = -n;
    float facing = max(0.0, dot(n, v));
    float fresnel = pow(1.0 - facing, 3.0);

    // A milky film: light scatters inside it. Faint fibres, never flat.
    vec3 milk = vec3(.955, .95, .935);
    float fibre = noise(vUv * vec2(22.0, 8.0) + uSeed) * .6 + noise(vUv * 80.0 + uSeed) * .4;
    milk += (fibre - .5) * .035;

    // A clean cut edge. The tiny ramp is only there so the square doesn't alias.
    vec2 toEdge = min(vUv, 1.0 - vUv);
    float edge = min(toEdge.x, toEdge.y);
    float sheet = smoothstep(0.0, .0015, edge);
    float body = smoothstep(0.0, .08, edge);

    // The print, set into the film rather than laid on top of it.
    vec2 pUv = (vUv - uBorder) / (1.0 - 2.0 * uBorder);
    vec2 winEdge = min(pUv, 1.0 - pUv);
    float window = smoothstep(0.0, .012, min(winEdge.x, winEdge.y));
    vec3 photo = texture2D(uPhoto, clamp(pUv, 0.0, 1.0)).rgb;
    float luma = dot(photo, vec3(.2126, .7152, .0722));
    photo = mix(vec3(luma), photo, .88);
    photo = (photo - .5) * 1.45 + .5;
    vec3 inked = clamp(mix(milk * photo, photo, .7), 0.0, 1.0);
    vec3 color = mix(milk, inked, window);

    // Surface: the sky's reflection torn into streaks, a broad gleam, and a
    // brighter rim wherever the film turns edge-on to the eye.
    vec3 sky = normalize(vec3(-.4, .65, -.8));
    vec3 h = normalize(sky + v);
    float spec = pow(max(0.0, dot(n, h)), 42.0);
    vec2 streakUv = vec2(vUv.x * 3.0 + vUv.y * 7.0, vUv.x * .8 - vUv.y * .4);
    float streak = smoothstep(.5, .95, noise(streakUv * 2.0 + uSeed + uTime * .04));
    float gloss = spec * (.3 + .7 * streak);
    float sheen = pow(max(0.0, dot(reflect(-v, n), normalize(vec3(.3, .8, .4)))), 6.0) * .16;
    color += gloss * .7 + sheen + fresnel * .2;
    color += (hash(gl_FragCoord.xy) - .5) * .014;

    // The margin stays a milky 0.3–0.4; the print itself stays present.
    float alpha = mix(.32, .4, body);
    alpha = mix(alpha, .9, window) + fresnel * .1 + gloss * .3;
    alpha = min(alpha, .94) * uOpacity * sheet;
    gl_FragColor = vec4(color, alpha);
  }
`;

const shadowVertex = /* glsl */ `
  ${glslCurl}
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.z += lift(uv) * .5;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const shadowFragment = /* glsl */ `
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec2 d = abs(vUv - .5);
    float box = max(d.x, d.y);
    float a = (1.0 - smoothstep(.3, .5, box)) * .1 * uOpacity;
    gl_FragColor = vec4(.26, .32, .33, a);
  }
`;

const easeInOutSine = (p: number) => (1 - Math.cos(Math.PI * p)) / 2;
const smoothunit = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};
/** The water's slow swell, read the way the water shader reads it (chop left out). */
const swellAt = (x: number, z: number, t: number) =>
  Math.sin(x * 1.2 + z * .55 + t * .48) * .013 + Math.sin(z * 1.9 - x * .31 - t * .33) * .007;

export function PondPhotoPaper({ paper, timeRef, reducedMotion, onSplash, onLanded }: {
  paper: PondPaper | null;
  /** The pond's clock, frozen under reduced motion. */
  timeRef: RefObject<number>;
  reducedMotion: boolean;
  onSplash: (x: number, z: number, strength: number) => void;
  onLanded?: () => void;
}) {
  const { size } = useThree();
  const group = useRef<THREE.Group>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const elapsed = useRef(0);
  const landed = useRef(false);
  const landedAt = useRef(0);
  const landedCallback = useRef(onLanded);
  landedCallback.current = onLanded;

  useEffect(() => {
    elapsed.current = 0;
    landed.current = false;
    if (!paper) { setTexture(null); return; }
    let alive = true;
    new THREE.TextureLoader().load(paper.url, (loaded) => {
      if (!alive) { loaded.dispose(); return; }
      setTexture(configureMemoryPhotoTexture(loaded));
    });
    return () => { alive = false; };
  }, [paper?.url, paper?.serial]);
  useEffect(() => () => { texture?.dispose(); }, [texture]);

  const dims = useMemo(() => {
    const image = texture?.image as { width?: number; height?: number } | undefined;
    const aspect = image?.width && image?.height ? image.width / image.height : 1.5;
    const photoW = aspect >= 1 ? LONG_SIDE : LONG_SIDE * aspect;
    const photoH = aspect >= 1 ? LONG_SIDE / aspect : LONG_SIDE;
    const w = photoW + MARGIN * 2;
    const h = photoH + MARGIN * 2;
    return { w, h, borderX: MARGIN / w, borderY: MARGIN / h };
  }, [texture]);

  const curl = useMemo(() => ({
    uBend: { value: 0 },
    uPhase: { value: 0 },
    uSize: { value: new THREE.Vector2(1, 1) },
  }), []);
  const uniforms = useMemo(() => ({
    ...curl,
    uPhoto: { value: null as THREE.Texture | null },
    uOpacity: { value: 0 },
    uBorder: { value: new THREE.Vector2() },
    uSeed: { value: 0 },
    uTime: { value: 0 },
  }), [curl]);
  const shadowUniforms = useMemo(() => ({ ...curl, uOpacity: { value: 0 } }), [curl]);
  useEffect(() => {
    uniforms.uPhoto.value = texture;
    uniforms.uBorder.value.set(dims.borderX, dims.borderY);
    uniforms.uSeed.value = ((paper?.serial ?? 0) % 97) * .37;
    curl.uSize.value.set(dims.w, dims.h);
  }, [texture, dims, paper?.serial, uniforms, curl]);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g || !texture || !paper) return;
    if (!reducedMotion && !document.hidden) elapsed.current += Math.min(delta, .05);
    const t = reducedMotion ? FALL_SECONDS : elapsed.current;
    const p = Math.min(1, t / FALL_SECONDS);
    const fall = easeInOutSine(p);
    const drift = 1 - p;
    // Narrow screens keep the sheet from spanning the whole pond.
    const fit = Math.min(1, Math.max(.55, (size.width / size.height) / 1.35));
    const restX = REST.x * fit;
    // The near edge is the pivot, so the rest point is where that edge lands.
    const restZ = REST.z + dims.h / 2;

    if (p >= 1 && !landed.current) {
      landed.current = true;
      landedAt.current = t;
      onSplash(restX, restZ - dims.h * .45, SPLASH_STRENGTH);
      landedCallback.current?.();
    }

    const now = timeRef.current;
    let x: number, y: number, z: number, pitch: number, roll: number, yaw: number, bend: number, phase: number;
    if (p < 1) {
      // Drifting down: wide sway, turning over a little, lifted now and then
      // by the air it rides — and curled by that same air, less as it slows.
      x = restX + Math.sin(p * Math.PI * 2.3) * .7 * drift + drift * drift * .7;
      z = restZ + Math.cos(p * Math.PI * 1.7) * .45 * drift + drift * .9;
      y = START_HEIGHT + (REST_HEIGHT - START_HEIGHT) * fall + Math.sin(p * Math.PI * 2.3) * .14 * drift;
      pitch = REST_PITCH + drift * .9 + Math.sin(p * Math.PI * 3.1) * .34 * drift;
      roll = Math.sin(p * Math.PI * 2.1 + .7) * .42 * drift;
      yaw = -.06 + Math.sin(p * Math.PI * 1.3) * .22 * drift;
      bend = FALL_CURL * (drift * .75 + drift * drift * .25) + .03;
      phase = t * 2.4;
    } else {
      // Resting: it meets the water at its resting height and then wanders
      // slowly on the swell. No dip on contact — that read as a skipped frame.
      const age = t - landedAt.current;
      const settle = 1 - Math.exp(-age * 1.6);
      x = restX + Math.sin(age * .23 + 1) * .16 * settle + Math.sin(now * .11) * .05;
      z = restZ + settle * .22 + Math.cos(age * .17) * .12 * settle + Math.min(age, 40) * .003;
      const swell = swellAt(x, z - dims.h / 2, now);
      const ahead = swellAt(x, z - dims.h, now);
      const aside = swellAt(x + dims.w / 2, z - dims.h / 2, now) - swellAt(x - dims.w / 2, z - dims.h / 2, now);
      y = REST_HEIGHT + swell * 1.5;
      pitch = REST_PITCH + (ahead - swell) / (dims.h / 2) * 1.5;
      roll = (aside / dims.w) * 1.5 + Math.sin(age * .31) * .012 * settle;
      yaw = -.06 + Math.sin(age * .12) * .09 * settle + age * .002;
      bend = .03 + Math.sin(now * .7 + 1) * .015;
      phase = FALL_SECONDS * 2.4 + age * .35;
    }
    g.position.set(x, y, z);
    g.rotation.set(pitch, yaw, roll);
    curl.uBend.value = reducedMotion ? .05 : bend;
    curl.uPhase.value = phase;
    uniforms.uTime.value = now;
    const appear = reducedMotion ? 1 : smoothunit(t / APPEAR_SECONDS);
    uniforms.uOpacity.value = appear;
    shadowUniforms.uOpacity.value = appear * (1 - Math.min(1, (y - REST_HEIGHT) / 1.4));
  });

  const geometryKey = `${dims.w.toFixed(3)}x${dims.h.toFixed(3)}`;
  return (
    <group ref={group} visible={!!texture && !!paper}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.012, -dims.h / 2]} scale={[1.22, 1.3, 1]} renderOrder={2} frustumCulled={false}>
        <planeGeometry key={geometryKey} args={[dims.w, dims.h, ...SEGMENTS]} />
        <shaderMaterial transparent depthWrite={false} vertexShader={shadowVertex} fragmentShader={shadowFragment} uniforms={shadowUniforms} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -dims.h / 2]} renderOrder={3} frustumCulled={false}>
        <planeGeometry key={geometryKey} args={[dims.w, dims.h, ...SEGMENTS]} />
        <shaderMaterial transparent depthWrite={false} side={THREE.DoubleSide}
          vertexShader={paperVertex} fragmentShader={paperFragment} uniforms={uniforms} />
      </mesh>
    </group>
  );
}
