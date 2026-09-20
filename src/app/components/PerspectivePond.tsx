import { Component, useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CHROME_GRAY } from "../lib/colors";
import { POND_THOUGHTS, type PondPromptCue } from "../lib/pondPrompts";

export interface PondTouch { x: number; y: number; serial: number }

const waves = /* glsl */ `
  uniform float uTime;
  uniform vec4 uDrops[8];
  // Height plus horizontal displacement, shared by the waves and reflections.
  vec3 rippleField(vec2 p) {
    vec3 field = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      if (uDrops[i].w < .001 || uTime < uDrops[i].z) continue;
      vec2 delta = p - uDrops[i].xy;
      float d = length(delta);
      // Three softly separated crests leave the same point in succession.
      // Each starts at zero radius rather than appearing behind an older ring.
      for (int crest = 0; crest < 3; crest++) {
      float age = uTime - uDrops[i].z - float(crest) * .52;
      if (age < 0.0) continue;
      float radius = age * 1.18;
      float front = d - radius;
      // Rounded crests stay broad enough to feel volumetric, with room for
      // a quiet trough between them instead of closely etched lines.
      float width = min(.24, .09 + age * .045);
      float reached = 1.0 - smoothstep(max(0.0, radius - width * .5), radius + .025, d);
      float birth = smoothstep(0.0, .08, age);
      // As a ring spreads, its energy is shared across a larger circumference.
      // Reduce the normal contrast as well as damping it over time, so the
      // outer rings become lighter instead of retaining a dark etched edge.
      float spread = 1.0 / (1.0 + d * .35);
      float envelope = exp(-.5 * pow((front + width * .7) / width, 2.0)) * exp(-age * .23) * spread * reached * birth;
      float strength = envelope * uDrops[i].w * exp(-float(crest) * .38);
      field.x += strength * .07;
      // Push the water's material coordinates outward with the crest. This
      // bends existing currents and light ribbons instead of drawing atop them.
      field.yz += delta / max(d, .025) * strength * .65;
      }
    }
    return field;
  }
  float waterHeight(vec2 p) {
    vec3 ripple = rippleField(p);
    vec2 flow = p - ripple.yz;
    float h = sin(flow.x * 1.2 + flow.y * .55 + uTime * .48) * .013;
    h += sin(flow.y * 1.9 - flow.x * .31 - uTime * .33) * .007;
    h += ripple.x;
    return h;
  }
`;

const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    // An uninterrupted water plane. Fine wave normals are evaluated per pixel,
    // so expanding the lake cannot make its ripple detail coarser.
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  ${waves}
  varying vec3 vWorld;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
  }
  void main() {
    vec2 p = vWorld.xz;
    vec2 surface = p - rippleField(p).yz;
    float h = waterHeight(p);
    vec3 n = normalize(vec3((h - waterHeight(p + vec2(.035,0))) / .035, 1.0,
      (h - waterHeight(p + vec2(0,.035))) / .035));
    vec3 eye = normalize(cameraPosition - vWorld);
    vec3 reflection = reflect(-eye, n);
    float fresnel = pow(1.0 - max(0.0, dot(n, eye)), 3.0);
    vec3 sky = vec3(.888, .902, .897);
    vec3 deep = vec3(.49, .59, .59);
    vec3 color = mix(deep, sky, .36 + fresnel * .56);
    float clouds = noise(reflection.xz * 3.0 + vec2(uTime * .009, 0));
    color += (clouds - .5) * .085;
    // A broad, broken sky reflection; the ripple normals make its silver edges.
    float light = pow(max(0.0, dot(reflection, normalize(vec3(-.4, .65, -.8)))), 14.0);
    color += light * vec3(.16, .15, .12);
    color += (n.x * .6 + n.z) * .16;
    // Subtle, water-anchored ribbons of reflected light and shadow. Warping
    // breaks up parallel bands; fine striations soften before they can alias
    // at the horizon. Keep the existing gray-green palette, not the reference hue.
    vec2 drift = surface * vec2(.38, .65) + vec2(uTime * .018, -uTime * .012);
    float bend = noise(drift * .7) * 2.0 - 1.0;
    float ribbons = noise(vec2(drift.x * .7, drift.y * 2.4 + bend * 1.3));
    vec2 fibersUV = vec2(surface.x * 1.8, surface.y * 24.0 + bend * 5.0 - uTime * .15);
    float fiberAA = 1.0 - smoothstep(.3, 1.3, length(fwidth(fibersUV)));
    float fibers = (noise(fibersUV) - .5) * fiberAA;
    // Constant scene-wide contrast. Ripples affect lighting only through
    // local normals and displaced coordinates, never a global exposure pulse.
    float surfaceTone = (ribbons - .5) * .022 + fibers * .006;
    color += vec3(surfaceTone);
    float haze = 1.0 - exp(-max(0.0, -p.y - 8.0) * .028);
    color = mix(color, sky, haze);
    // Screen-space paper grain stays fine at the horizon as well as nearby.
    color += (hash(gl_FragCoord.xy) - .5) * .017;
    // Dissolve into the horizon long before any finite geometry edge.
    gl_FragColor = vec4(color, 1.0 - smoothstep(140.0, 400.0, -p.y));
  }
`;

const RING_INNER = .604;
const RING_OUTER = .607;
const onPond = (p: THREE.Vector3) => p.z > -100 && p.z < 18;
const RING_FADE_IN = .72;
const RING_FADE_FULL = .94;
const smoothunit = (edge0: number, edge1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};
const RING_HEIGHT = 5.8;
const ringVertex = /* glsl */ `
  ${waves}
  uniform vec3 uCenter;
  varying vec2 vLocal;
  vec3 waterNormal(vec2 p) {
    float h = waterHeight(p);
    return normalize(vec3(
      (h - waterHeight(p + vec2(.035, 0.0))) / .035,
      1.0,
      (h - waterHeight(p + vec2(0.0, .035))) / .035
    ));
  }
  void main() {
    vLocal = position.xy;
    vec2 raw = uCenter.xz + vec2(position.x, -position.y);
    vec3 field = rippleField(raw);
    vec2 xz = raw + field.yz * .55;
    float h = waterHeight(xz);
    vec3 n = waterNormal(xz);
    // Sit on the same field the lighting implies, offset along the normal
    // so a crest lifts the stroke instead of burying it.
    vec3 world = vec3(xz.x, h * ${RING_HEIGHT} + .05, xz.y) + n * .02;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;
const ringFragment = /* glsl */ `
  uniform float uProgress;
  uniform float uOpacity;
  uniform vec3 uColor;
  varying vec2 vLocal;
  void main() {
    float r = length(vLocal);
    float aa = fwidth(r) * 1.15;
    float ring = smoothstep(${RING_INNER - .004} - aa, ${RING_INNER}, r)
      * (1.0 - smoothstep(${RING_OUTER}, ${RING_OUTER + .004} + aa, r));
    if (ring < .01) discard;
    float sweep = mod(1.57079632679 - atan(vLocal.y, vLocal.x), 6.28318530718) / 6.28318530718;
    float holding = step(.001, uProgress);
    float alpha = mix(ring, max(ring * .22, ring * step(sweep, uProgress)), holding);
    gl_FragColor = vec4(uColor, alpha * .82 * uOpacity);
  }
`;

interface PondProps {
  arrival: number;
  reducedMotion: boolean;
  touch: PondTouch | null;
  cursorRef?: RefObject<{ x: number; y: number } | null>;
  holdRef?: RefObject<number>;
  hintRef?: RefObject<HTMLDivElement | null>;
  hintRevealRef?: RefObject<number>;
  promptRefs: RefObject<Array<HTMLDivElement | null>>;
  cueRef: RefObject<PondPromptCue>;
  onReady: () => void;
  /** Prompt ripples and the cursor ring wait until the invitation has settled. */
  lifeReady?: boolean;
}

function Water({ arrival, reducedMotion, touch, cursorRef, holdRef, hintRef, hintRevealRef, promptRefs, cueRef, onReady, lifeReady = true }: PondProps) {
  const { camera, size, gl } = useThree();
  const time = useRef(0);
  const ready = useRef(false);
  const touchIndex = useRef(0);
  const seenTouch = useRef(-1);
  const ring = useRef<THREE.Mesh>(null);
  const cursorFade = useRef(0);
  const cursorLast = useMemo(() => new THREE.Vector3(0, .03, -4), []);
  const project = useMemo(() => new THREE.Vector3(), []);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const point = useMemo(() => new THREE.Vector3(), []);
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uDrops: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)) },
  }), []);
  const ringUniforms = useMemo(() => ({
    uProgress: { value: 0 },
    uOpacity: { value: 0 },
    uColor: { value: new THREE.Color(CHROME_GRAY) },
    uTime: uniforms.uTime,
    uDrops: uniforms.uDrops,
    uCenter: { value: new THREE.Vector3() },
  }), [uniforms]);

  useEffect(() => {
    const lost = (event: Event) => { event.preventDefault(); onReady(); };
    gl.domElement.addEventListener("webglcontextlost", lost);
    return () => gl.domElement.removeEventListener("webglcontextlost", lost);
  }, [gl, onReady]);

  useFrame((_, delta) => {
    if (!document.hidden && !reducedMotion) time.current += Math.min(delta, .05);
    uniforms.uTime.value = time.current;
    // This is a perspective camera, never a CSS-flattened overhead texture.
    const cameraArrival = reducedMotion ? 1 : arrival;
    camera.position.set(0, 2.95 - cameraArrival * .15, 10 + (1 - cameraArrival) * .4);
    camera.lookAt(0, .05, -24);
    camera.updateMatrixWorld();
    if (!ready.current) { ready.current = true; onReady(); }
    const cue = cueRef.current;
    const thought = POND_THOUGHTS[cue.index];
    // Slot zero belongs to the only visible prompt. Old prompt ripples cannot
    // accumulate; the other slots are reserved for the user's own touches.
    uniforms.uDrops.value[0].set(size.width < 600 ? 0 : thought.x, thought.z,
      reducedMotion ? -1.5 : time.current - cue.age, lifeReady ? cue.ripple : 0);
    if (touch && touch.serial !== seenTouch.current) {
      seenTouch.current = touch.serial;
      raycaster.setFromCamera(new THREE.Vector2(touch.x * 2 - 1, 1 - touch.y * 2), camera);
      if (raycaster.ray.intersectPlane(plane, point) && onPond(point)) {
        uniforms.uDrops.value[1 + (touchIndex.current++ % 7)].set(point.x, point.z, time.current, 1.5);
      }
    }
    const nearX = size.width < 600 ? 0 : POND_THOUGHTS[0].x;
    const nearDist = Math.hypot(camera.position.x - nearX, camera.position.y - .12, camera.position.z - POND_THOUGHTS[0].z);
    POND_THOUGHTS.forEach((thought, i) => {
      const label = promptRefs.current[i];
      if (!label) return;
      const tx = size.width < 600 ? 0 : thought.x;
      project.set(tx, .12, thought.z).project(camera);
      const x = (project.x * .5 + .5) * size.width;
      const y = (-project.y * .5 + .5) * size.height;
      const scale = Math.min(1, nearDist / Math.hypot(camera.position.x - tx, camera.position.y - .12, camera.position.z - thought.z));
      label.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px) scale(${scale})`;
    });
    const cursor = cursorRef?.current;
    const mark = ring.current;
    const hint = hintRef?.current;
    const progress = holdRef?.current ?? 0;
    ringUniforms.uProgress.value = progress;
    let target = 0;
    let nearness = 0;
    if (cursor) {
      ndc.set(cursor.x * 2 - 1, 1 - cursor.y * 2);
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(plane, point) && onPond(point)) {
        cursorLast.set(point.x, .03, point.z);
        const dist = Math.hypot(camera.position.x - point.x, camera.position.y - .03, camera.position.z - point.z);
        nearness = Math.min(1, nearDist / dist);
        target = lifeReady ? smoothunit(RING_FADE_IN, RING_FADE_FULL, nearness) : 0;
      }
    }
    cursorFade.current += (target - cursorFade.current) * (1 - Math.exp(-(reducedMotion ? 18 : 7) * Math.min(delta, .05)));
    const fade = cursorFade.current;
    ringUniforms.uOpacity.value = fade;
    ringUniforms.uCenter.value.copy(cursorLast);
    if (mark) mark.visible = fade > .01;
    if (hint) {
      const reveal = hintRevealRef?.current ?? 0;
      const show = arrival * reveal * fade;
      if (show <= .01) {
        hint.style.opacity = "0";
        hint.style.filter = "blur(6px)";
      } else {
        const at = cursorLast;
        const dist = Math.hypot(camera.position.x - at.x, camera.position.y - at.y, camera.position.z - at.z);
        const howNear = nearness || Math.min(1, nearDist / dist);
        const gap = .1 + .52 * howNear;
        project.set(at.x + gap, .03, at.z + gap * .7).project(camera);
        hint.style.opacity = String(show);
        hint.style.filter = reducedMotion || reveal === 1 ? "none" : `blur(${(1 - reveal) * 6}px)`;
        hint.style.transform = `translate(${(project.x * .5 + .5) * size.width}px, ${(-project.y * .5 + .5) * size.height}px) scale(${howNear})`;
      }
    }
  });

  return <>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -900]}>
      <planeGeometry args={[2000, 2000]} />
      <shaderMaterial transparent vertexShader={vertexShader} fragmentShader={fragmentShader} uniforms={uniforms} />
    </mesh>
    <mesh ref={ring} visible={false} renderOrder={3} frustumCulled={false}>
      <ringGeometry args={[RING_INNER - .012, RING_OUTER + .012, 192, 8]} />
      <shaderMaterial transparent depthTest={false} depthWrite={false} side={THREE.DoubleSide}
        vertexShader={ringVertex} fragmentShader={ringFragment} uniforms={ringUniforms} />
    </mesh>
  </>;
}

class PondBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function StillPond({ onReady, cueRef }: Pick<PondProps, "onReady" | "cueRef">) {
  const ripple = useRef<HTMLDivElement>(null);
  useEffect(onReady, [onReady]);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (ripple.current) {
        const cue = cueRef.current;
        ripple.current.style.opacity = String(cue.ripple * Math.exp(-cue.age * .23));
        ripple.current.style.transform = `perspective(500px) rotateX(68deg) scale(${.005 + cue.age * .16})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cueRef]);
  return <div aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(#e2e6e2 28%, #cbd5d2 49%, #91aaa8 100%)" }}>
    <div ref={ripple} style={{ position: "absolute", inset: "38% -30% -50%", transformOrigin: "50% 30%", transform: "perspective(500px) rotateX(68deg) scale(.005)", background: "radial-gradient(ellipse at 50% 30%, transparent 26%, #e6edeb22 29%, transparent 32%, transparent 35%, #e6edeb33 38%, transparent 41%, transparent 44%, #e6edeb55 47%, transparent 50%)" }} />
  </div>;
}

export function PerspectivePond(props: PondProps) {
  const fallback = <StillPond onReady={props.onReady} cueRef={props.cueRef} />;
  return <PondBoundary fallback={fallback}>
    <Canvas camera={{ fov: 48, near: .1, far: 2400, position: [0, 2.8, 10] }}
      dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }} fallback={fallback}
      style={{ position: "absolute", inset: 0 }}>
      <Water {...props} />
    </Canvas>
  </PondBoundary>;
}
