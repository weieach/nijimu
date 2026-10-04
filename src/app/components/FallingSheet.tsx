import { useEffect, useMemo, useRef, type CSSProperties, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { POND_LENS, pondCameraPose, type PondSinkTarget } from "../lib/pondCamera";

/* The sheet lives in the pond's own camera — same lens, same place — so when
   it comes to rest on y = 0 it lies in the water's perspective by construction. */

/** Where the water begins to hold the sheet; above this it is still air. */
const SETTLE_HEIGHT = 0.9;
const RELEASE_HEIGHT = 8.6;
/** Resting height above the water plane: above the water's own draw, below its ripples' lift. */
const REST_Y = 0.018;

const SHEET_WIDTH = 6.4;
const SHEET_MAX_HEIGHT = 5.2;

export interface SheetLanding {
  /** Stage-relative 0..1 screen position of the point of contact. */
  x: number;
  y: number;
  /** The same spot on the water plane, in the pond's world. */
  world: PondSinkTarget;
  /** The sheet's footprint on the water: half extents and its turn about the vertical. */
  footprint: { hw: number; hh: number; yaw: number };
}

interface Oscillator { amp: number; freq: number; phase: number }

/** Every fall is drawn fresh: how far it drifts, how it sways, how it curls. */
interface FallPlan {
  xStart: number;
  xLand: number;
  zStart: number;
  zLand: number;
  sway: Oscillator[];
  depth: Oscillator;
  yaw: Oscillator;
  yawLand: number;
  pitchBase: number;
  pitch: Oscillator;
  descent: Oscillator;
  bendX: [Oscillator, Oscillator];
  bendY: [Oscillator, Oscillator];
  twist: [Oscillator, Oscillator];
  speed: number;
}

const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const osc = (amp: [number, number], freq: [number, number]): Oscillator => ({
  amp: between(...amp), freq: between(...freq), phase: Math.random() * Math.PI * 2,
});
const wave = (o: Oscillator, t: number) => o.amp * Math.sin(o.freq * t + o.phase);
/* Two incommensurate waves multiplied: the curl comes and goes rather than
   pulsing on a beat. */
const breathe = (pair: [Oscillator, Oscillator], t: number) =>
  wave(pair[0], t) * (0.45 + 0.55 * Math.sin(pair[1].freq * t + pair[1].phase));
const smooth = (t: number) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };

function planFall(): FallPlan {
  const xLand = between(-0.5, 0.6);
  // Near the camera: the sheet lands in the foreground, clear of the horizon.
  const zLand = between(0.4, 1.3);
  return {
    xStart: xLand - between(0.6, 1.6),
    xLand,
    zStart: zLand - between(1.0, 2.0),
    zLand,
    sway: [osc([0.7, 1.15], [0.5, 0.75]), osc([0.22, 0.45], [1.0, 1.5]), osc([0.06, 0.16], [2.0, 2.9])],
    depth: osc([0.2, 0.45], [0.4, 0.7]),
    yaw: osc([0.35, 0.7], [0.3, 0.55]),
    yawLand: between(-0.4, 0.4),
    pitchBase: between(-0.75, -0.45),
    pitch: osc([0.35, 0.6], [0.6, 0.9]),
    descent: osc([0.18, 0.3], [0.5, 0.9]),
    bendX: [osc([0.08, 0.16], [0.7, 1.2]), osc([1, 1], [0.35, 0.6])],
    bendY: [osc([0.05, 0.12], [0.5, 0.9]), osc([1, 1], [0.3, 0.5])],
    twist: [osc([0.03, 0.08], [0.6, 1.1]), osc([1, 1], [0.25, 0.45])],
    speed: between(0.88, 1.02),
  };
}

const vertexShader = /* glsl */ `
  uniform float uBendX;
  uniform float uBendY;
  uniform float uTwist;
  uniform vec2 uSize;
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    float u = uv.x - .5;
    float v = uv.y - .5;
    vec3 p = position;
    // Shallow curls across the width and the height, and a diagonal twist —
    // each centred so bending never moves the sheet as a whole.
    p.z += uBendX * (u * u * 4.0 - .333) * uSize.x
         + uBendY * (v * v * 4.0 - .333) * uSize.y
         + uTwist * u * v * 4.0 * uSize.x;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vWorld;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    // Vellum: milky, matte, lit mostly by how a curl turns away from the sky.
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    vec3 eye = normalize(cameraPosition - vWorld);
    n *= sign(dot(n, eye));
    float sky = abs(dot(n, normalize(vec3(.15, 1.0, .45))));
    float shade = .93 + .07 * sky;
    vec3 paper = vec3(.972, .968, .958);
    // The mip bias frosts the print; the sheet is translucent, not clear.
    vec4 tex = texture2D(uMap, vUv, 1.6);
    float lum = dot(tex.rgb, vec3(.299, .587, .114));
    // Mostly drained of colour, lifted, then sunk into the milk of the sheet.
    vec3 ink = mix(vec3(lum), tex.rgb, .3);
    ink = pow(ink, vec3(.8));
    ink = mix(paper, ink, .3);
    vec3 color = ink * shade;
    // The same low sun the water mirrors, caught more softly on the sheet:
    // a broad gloss where it lies toward the light, brighter at a grazing look.
    vec3 reflection = reflect(-eye, n);
    float toSun = max(0.0, dot(reflection, normalize(vec3(0.0, .24, -1.0))));
    float fresnel = pow(1.0 - max(0.0, dot(n, eye)), 3.0);
    float gloss = pow(toSun, 10.0) * .035 + pow(toSun, 70.0) * (.06 + .12 * fresnel);
    color += gloss;
    color += (hash(gl_FragCoord.xy) - .5) * .018;
    float alpha = uOpacity * (.68 + .1 * (1.0 - lum)) + gloss * .3;
    gl_FragColor = vec4(color, alpha);
  }
`;

function Sheet({ url, aspect, reducedMotion, onLand, sinkRef, sinkTargetRef }: {
  url: string;
  aspect: number;
  reducedMotion: boolean;
  onLand: (at: SheetLanding) => void;
  sinkRef?: RefObject<number>;
  sinkTargetRef?: RefObject<PondSinkTarget | null>;
}) {
  const { camera } = useThree();
  const lookAt = useMemo(() => new THREE.Vector3(), []);
  const mesh = useRef<THREE.Mesh>(null);
  const plan = useMemo(planFall, [url]);
  const landed = useRef(false);
  const time = useRef(0);
  const restTime = useRef(0);
  const state = useRef({ x: plan.xStart, y: RELEASE_HEIGHT, z: plan.zStart, roll: 0, prevX: plan.xStart });
  const landCallback = useRef(onLand);
  landCallback.current = onLand;

  const height = Math.min(SHEET_MAX_HEIGHT, SHEET_WIDTH / Math.max(0.2, aspect));
  const width = height === SHEET_MAX_HEIGHT ? SHEET_MAX_HEIGHT * aspect : SHEET_WIDTH;

  const texture = useMemo(() => {
    const t = new THREE.TextureLoader().load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [url]);
  useEffect(() => () => texture.dispose(), [texture]);

  const uniforms = useMemo(() => ({
    uMap: { value: texture },
    uOpacity: { value: 1 },
    uBendX: { value: 0 },
    uBendY: { value: 0 },
    uTwist: { value: 0 },
    uSize: { value: new THREE.Vector2(width, height) },
  }), [texture, width, height]);

  const settle = () => {
    if (landed.current) return;
    landed.current = true;
    const world = { x: state.current.x, z: state.current.z };
    const at = new THREE.Vector3(world.x, 0, world.z).project(camera);
    landCallback.current({
      x: at.x * 0.5 + 0.5,
      y: -at.y * 0.5 + 0.5,
      world,
      footprint: { hw: width / 2, hh: height / 2, yaw: plan.yawLand },
    });
  };

  useFrame((_, delta) => {
    pondCameraPose(1, sinkRef?.current ?? 0, sinkTargetRef?.current ?? null, camera.position, lookAt);
    camera.lookAt(lookAt);
    camera.updateMatrixWorld();
    const m = mesh.current;
    if (!m) return;
    m.rotation.order = "YXZ";
    const s = state.current;

    if (reducedMotion && !landed.current) {
      s.x = plan.xLand; s.z = plan.zLand; s.y = 0;
      m.position.set(s.x, REST_Y, s.z);
      m.rotation.set(-Math.PI / 2, plan.yawLand, 0);
      settle();
      return;
    }

    const dt = document.hidden ? 0 : Math.min(delta, 0.05);

    if (!landed.current) {
      time.current += dt;
      const t = time.current;
      const progress = 1 - s.y / RELEASE_HEIGHT;
      // Sway grows as the sheet gathers air, and is taken out of it by the water.
      const air = Math.sqrt(Math.sin(Math.PI * Math.min(1, progress)));
      const settling = smooth((SETTLE_HEIGHT - s.y) / SETTLE_HEIGHT);
      const sway = plan.sway.reduce((sum, o) => sum + wave(o, t), 0) * air * (1 - settling);
      const drift = plan.xStart + (plan.xLand - plan.xStart) * smooth(progress);
      s.x = drift + sway;
      s.z = plan.zStart + (plan.zLand - plan.zStart) * smooth(progress) + wave(plan.depth, t) * air * (1 - settling);
      // Steady fall, a little quicker through a glide, easing onto the water.
      const rate = plan.speed * (1 + wave(plan.descent, t)) * (1 - settling * 0.65);
      s.y = Math.max(0, s.y - rate * dt);

      const vx = dt > 0 ? (s.x - s.prevX) / dt : 0;
      s.prevX = s.x;
      // Banking into the glide, with some lag — the sheet turns after the air does.
      const rollTarget = THREE.MathUtils.clamp(-vx * 0.4, -0.55, 0.55);
      s.roll += (rollTarget - s.roll) * (1 - Math.exp(-4 * dt));

      const pitchAir = plan.pitchBase + wave(plan.pitch, t);
      const yawAir = wave(plan.yaw, t);
      const flat = settling;
      m.position.set(s.x, s.y + REST_Y, s.z);
      m.rotation.set(
        THREE.MathUtils.lerp(pitchAir, -Math.PI / 2, flat),
        THREE.MathUtils.lerp(yawAir, plan.yawLand, flat),
        s.roll * (1 - flat),
      );
      const curl = 1 - flat * 0.85;
      uniforms.uBendX.value = breathe(plan.bendX, t) * curl;
      uniforms.uBendY.value = breathe(plan.bendY, t) * curl;
      uniforms.uTwist.value = breathe(plan.twist, t) * curl;
      if (s.y <= 0) settle();
      return;
    }

    // At rest: a faint lift on the swell, and the last of the curl relaxing.
    restTime.current += dt;
    const r = restTime.current;
    const relax = Math.exp(-r * 0.6);
    m.position.set(s.x, REST_Y + 0.012 * Math.sin(r * 0.7) + 0.006 * Math.sin(r * 1.9 + 1), s.z);
    m.rotation.set(-Math.PI / 2 + 0.012 * Math.sin(r * 0.5), plan.yawLand + 0.01 * Math.sin(r * 0.33), 0.008 * Math.sin(r * 0.8 + 2));
    uniforms.uBendX.value = 0.015 * Math.sin(r * 0.6) + breathe(plan.bendX, time.current) * 0.15 * relax;
    uniforms.uBendY.value = 0.01 * Math.sin(r * 0.45 + 1) + breathe(plan.bendY, time.current) * 0.15 * relax;
    uniforms.uTwist.value = breathe(plan.twist, time.current) * 0.15 * relax;
  });

  return (
    <mesh ref={mesh} position={[plan.xStart, RELEASE_HEIGHT, plan.zStart]} frustumCulled={false} renderOrder={1}>
      <planeGeometry args={[width, height, 28, 28]} />
      <shaderMaterial transparent depthWrite={false} side={THREE.DoubleSide}
        vertexShader={vertexShader} fragmentShader={fragmentShader} uniforms={uniforms} />
    </mesh>
  );
}

/**
 * A sheet of vellum with a picture on it, let go above the pond. It drifts
 * down through the air the way paper does — leaning, turning, curling now and
 * then — and lies down on the water in the pond's own perspective.
 */
export function FallingSheet({ url, aspect, reducedMotion = false, onLand, sinkRef, sinkTargetRef, style }: {
  url: string;
  aspect: number;
  reducedMotion?: boolean;
  onLand: (at: SheetLanding) => void;
  sinkRef?: RefObject<number>;
  sinkTargetRef?: RefObject<PondSinkTarget | null>;
  style?: CSSProperties;
}) {
  return (
    <Canvas
      camera={{ fov: POND_LENS.fov, near: POND_LENS.near, far: 200, position: [0, 2.8, 10] }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true, premultipliedAlpha: true }}
      style={{ position: "absolute", inset: 0, pointerEvents: "none", ...style }}
    >
      <Sheet url={url} aspect={aspect} reducedMotion={reducedMotion} onLand={onLand} sinkRef={sinkRef} sinkTargetRef={sinkTargetRef} />
    </Canvas>
  );
}
