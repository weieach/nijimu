import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CHROME_GRAY } from "../lib/colors";
import { POND_THOUGHTS, type PondPromptCue } from "../lib/pondPrompts";
import { POND_TRAIL_SLOTS, POND_TRAIL_LIFETIME, samplePondTrail, type TrailPoint, type TrailAnchor } from "../lib/pondTrail";
import { POND_DROP_SLOTS } from "../lib/voicePeaks";
import type { AmbientFill, EditableLight } from "../lib/sceneLights";
import type { ArtifactForm } from "../lib/superformula";
import { BUBBLE_CAMERA_FOV, BubbleModel, DEFAULT_BUBBLE_TINT, bubbleCameraFit, bubbleFitTargetSize } from "./BubbleViewer";
import { MEMORY_PHOTO_FILTER_DEFAULTS, configureMemoryPhotoTexture } from "./MemoryPhotoLayer";
import { PondPhotoPaper, type PondPaper } from "./PondPhotoPaper";
import { UnderwaterBackdrop } from "./UnderwaterBackdrop";

export interface PondTouch { x: number; y: number; serial: number; strength?: number }

const waves = /* glsl */ `
  uniform float uTime;
  uniform vec4 uDrops[${POND_DROP_SLOTS}];
  uniform vec4 uTrails[${POND_TRAIL_SLOTS}];
  uniform vec4 uTrailControls[${POND_TRAIL_SLOTS}];
  uniform vec2 uTrailTimes[${POND_TRAIL_SLOTS}];
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
  }
  // A slow wandering of the whole surface. Deliberately cheap — it is sampled
  // per pixel, and at this amplitude incommensurate drifts read as moving air
  // rather than as a pattern.
  vec2 breath(vec2 p) {
    return vec2(
      sin(p.x * .73 + uTime * .21) + sin(p.y * .52 - uTime * .17),
      sin(p.y * .68 - uTime * .19) + sin(p.x * .44 + uTime * .23)
    ) * .5;
  }
  // One dispersive wave train per touch: a leading crest, a trough behind it,
  // then smaller crests falling back — rather than three separate rings that
  // each have to be born and grow. Height plus the horizontal displacement
  // that the waves and reflections share.
  vec3 rippleField(vec2 p) {
    vec3 field = vec3(0.0);
    vec2 wob = breath(p);
    for (int i = 0; i < ${POND_DROP_SLOTS}; i++) {
      if (uDrops[i].w < .001 || uTime < uDrops[i].z) continue;
      float age = uTime - uDrops[i].z;
      // Long spent: nothing left to add, and the slot is usually still filled.
      if (age > 14.0) continue;
      vec2 raw = p - uDrops[i].xy;
      float rd = length(raw);
      // Disturbance accumulates with the distance a ring has travelled, so it
      // is crisp where it is born and increasingly bent by the chop it crosses.
      vec2 delta = raw + wob * min(.07, .012 + rd * .022);
      float d = length(delta);
      vec2 dir = delta / max(d, .025);
      // The front sprints away from the touch and then settles into a glide,
      // so the ripple reads on the next frame instead of creeping out of a dot.
      float radius = age * 1.02 + .42 * (1.0 - exp(-age * 6.5));
      float front = d - radius;
      float trail = max(0.0, -front);
      // The train lengthens behind the front as the slower waves fall back,
      // and fades quickly enough that three or four rings carry the whole
      // event and the centre settles back to calm.
      float wavelength = .30 + age * .10;
      float train = cos(trail / wavelength * 6.2831853) * exp(-trail * 3.2 / (1.0 + age * .55));
      // Still water ahead of the front.
      float gate = exp(-pow(max(0.0, front) / (.045 + age * .015), 2.0));
      float birth = smoothstep(0.0, .03, age);
      // Energy shared over a growing circumference, and lost to the water.
      float amp = train * gate * birth * exp(-age * .33) / (1.0 + d * .55);
      // The touch itself: a dimple under the finger, present on the same frame
      // and gone before the first ring has travelled far.
      float dimple = -exp(-pow(d / .15, 2.0)) * exp(-age * 8.0) * birth;
      field.x += (amp * .075 + dimple * .05) * uDrops[i].w;
      // Push the water's material coordinates along with the wave. This bends
      // existing currents and light ribbons instead of drawing atop them.
      field.yz += dir * (amp * .62 + dimple * .3) * uDrops[i].w;
    }
    // Treat the joined curves as ONE wake. Summing individual strokes made
    // their end caps brighten into short mechanical streaks.
    vec2 wakePoint = p + wob * .085;
    float wakeDistance = 10000.0;
    float wakeAge = 0.0;
    vec2 wakeDelta = vec2(0.0);
    for (int i = 0; i < ${POND_TRAIL_SLOTS}; i++) {
      float age = uTime - uTrailControls[i].w;
      if (uTrailTimes[i].y < .001 || age < 0.0 || age > ${POND_TRAIL_LIFETIME.toFixed(2)}) continue;
      vec2 a = uTrails[i].xy;
      vec2 b = uTrailControls[i].xy;
      vec2 c = uTrails[i].zw;
      vec2 chord = c - a;
      vec2 bend = a - 2.0 * b + c;
      float along = clamp(dot(wakePoint - a, chord) / max(dot(chord, chord), .0001), 0.0, 1.0);
      // Closest point on the quadratic, not a polygonal approximation.
      for (int step = 0; step < 3; step++) {
        vec2 q = a + 2.0 * along * (b - a) + along * along * bend;
        vec2 tangent = 2.0 * (b - a) + 2.0 * along * bend;
        float denominator = dot(tangent, tangent) + dot(q - wakePoint, 2.0 * bend);
        along = clamp(along - dot(q - wakePoint, tangent) / max(denominator, .0001), 0.0, 1.0);
      }
      vec2 delta = wakePoint - (a + 2.0 * along * (b - a) + along * along * bend);
      float d = length(delta);
      if (d < wakeDistance) {
        wakeDistance = d;
        wakeDelta = delta;
        // Age varies continuously along the path, including across joins.
        wakeAge = uTime - mix(uTrailControls[i].z, uTrailControls[i].w, along);
      }
    }
    if (wakeDistance < 1000.0 && wakeAge < ${POND_TRAIL_LIFETIME.toFixed(2)}) {
      float d = wakeDistance;
      float radius = .035 + wakeAge * .32;
      float crest = exp(-pow((d - radius) / (.06 + wakeAge * .05), 2.0));
      float trough = exp(-pow(d / max(radius * .7, .025), 2.0));
      float life = max(0.0, 1.0 - wakeAge / ${POND_TRAIL_LIFETIME.toFixed(2)});
      float energy = life * life * smoothstep(0.0, .035, wakeAge) * .8;
      field.x += (crest * .014 - trough * .008) * energy;
      field.yz += wakeDelta / max(d, .025) * crest * .12 * energy;
    }
    return field;
  }
  // The slow swell, with the ripple crests left out. Split from waterHeight so
  // a floating body can weigh the two apart; the water itself still takes both.
  float swellFrom(vec3 ripple, vec2 p) {
    vec2 flow = p - ripple.yz;
    float h = sin(flow.x * 1.2 + flow.y * .55 + uTime * .48) * .013
      + sin(flow.y * 1.9 - flow.x * .31 - uTime * .33) * .007;
    // A light wandering chop. The pond is never glass, and this is the water a
    // new ripple has to spread across.
    h += (noise(flow * 3.1 + vec2(uTime * .08, uTime * .055)) - .5) * .0075;
    return h;
  }
  float waterHeight(vec2 p) {
    vec3 ripple = rippleField(p);
    return swellFrom(ripple, p) + ripple.x;
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
  void main() {
    vec2 p = vWorld.xz;
    vec2 surface = p - rippleField(p).yz;
    float h = waterHeight(p);
    vec3 n = normalize(vec3((h - waterHeight(p + vec2(.035,0))) / .035, 1.0,
      (h - waterHeight(p + vec2(0,.035))) / .035));
    float underwater = 1.0 - smoothstep(-.18, .18, cameraPosition.y);
    n = mix(n, -n, underwater);
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
    // From below the same surface becomes the silver ceiling of the stage the
    // form waits in. The change happens only while the camera crosses it, so
    // there is a clear waterline without a flash or a hard cut.
    vec3 ceiling = vec3(dot(color, vec3(.3333))) * vec3(.96, .975, 1.0) + .07;
    color = mix(color, ceiling, underwater * .74);
    // Outside the bright window overhead, the underside mirrors the water body,
    // so the stage behind it (beam, caustics) reads through.
    float overhead = smoothstep(.42, .78, abs(eye.y));
    float mirrored = underwater * (1.0 - overhead);
    color = mix(color, vec3(.70, .715, .745), mirrored * .92);
    float haze = 1.0 - exp(-max(0.0, -p.y - 8.0) * .028);
    color = mix(color, sky, haze * (1.0 - underwater));
    // Screen-space paper grain stays fine at the horizon as well as nearby.
    color += (hash(gl_FragCoord.xy) - .5) * .017;
    // Dissolve into the horizon long before any finite geometry edge. Under
    // water the view is short: the far surface is lost in the silver body.
    float sightline = length(cameraPosition - vWorld);
    float lost = max(underwater * smoothstep(2.0, 14.0, sightline), mirrored * .88);
    gl_FragColor = vec4(color, (1.0 - smoothstep(140.0, 400.0, -p.y)) * (1.0 - lost));
  }
`;

const RING_INNER = .604;
const RING_OUTER = .607;
const onPond = (p: THREE.Vector3) => p.z > -100 && p.z < 18;
const RING_FADE_IN = .72;
const RING_FADE_FULL = .94;
const SUBMERGE_SECONDS = 5.2;
const POND_FOV = 48;
const UNDERWATER_CENTER = new THREE.Vector3(0, -4, -4);
const smoothunit = (edge0: number, edge1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};
// The ring floats on the pond instead of being painted onto it: it rides the
// slow swell, rests clear of the surface, and feels a ripple crest only as the
// air that crest pushes ahead of itself. A touch is the one thing that brings
// it down to the water.
const RING_HEIGHT = 1.5;  // vertical scale applied to swell and crest together
const RING_FLOAT = 0.084; // resting height above the water plane (~4px on screen)
const RING_TOUCH = 0.005; // height while a touch holds it against the surface
const RING_CREST = 0.65;  // how much of a crest's saturated lift reaches it
const RING_TILT = 0.22;   // per-vertex sampling vs. one rigid body at the centre
const RING_DRIFT = 0.12;  // how far the current carries it — as a whole, never a stretch
// Quick down onto the water, a moment of contact, then a slower float back up.
const TAP_DOWN = .07, TAP_HOLD = .025, TAP_UP = .34;
// A hold only takes the ring over once it is genuinely under way — 120ms into
// the 2s hold. A click shorter than that runs the envelope and bounces back on
// its own. The threshold is low enough that the envelope is still 98% down when
// the hold takes over, so the handoff cannot be seen.
const HOLD_PIN = .06;
const ringVertex = /* glsl */ `
  ${waves}
  uniform vec3 uCenter;
  uniform float uTap;
  varying vec2 vLocal;
  void main() {
    vLocal = position.xy;
    vec2 raw = uCenter.xz + vec2(position.x, -position.y);
    // Everything the water does to the ring is read once, under its centre, and
    // applied to every vertex alike. Sampling the current per vertex would push
    // each one radially away from a ripple's origin and swell the circle; the
    // ring is a fixed size and only ever moves as one piece.
    vec3 centre = rippleField(uCenter.xz);
    vec2 xz = raw + centre.yz * ${RING_DRIFT};
    vec3 field = rippleField(xz);
    // Height still takes a little local sampling so it can tilt with the water.
    float swell = mix(swellFrom(centre, uCenter.xz), swellFrom(field, xz), ${RING_TILT});
    float crest = mix(centre.x, field.x, ${RING_TILT});
    // A crest reaches the ring as the air it pushes ahead of itself rather than
    // as buoyancy. The lift saturates, so resting at a ripple's centre raises
    // the ring barely more than resting at its edge does.
    float lift = crest / (1.0 + abs(crest) * 22.0) * ${RING_CREST};
    // Resting clear of the water, brought down onto it by a touch.
    float rest = mix(${RING_FLOAT}, ${RING_TOUCH}, uTap);
    vec3 world = vec3(xz.x, rest + (swell + lift) * ${RING_HEIGHT}, xz.y);
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

/** What the shape page will open with, so the descent can end on its first frame. */
export interface UnderwaterHandoff {
  form: ArtifactForm;
  lights: EditableLight[];
  ambients: AmbientFill[];
  material: {
    roughness: number;
    reflectivity: number;
    transparency: number;
    fog: number;
    metalness?: number;
  };
}

/**
 * The shape page's own BubbleModel, standing in the water below the pond
 * with the same lights, fit, and photo light, still a sphere.
 */
function HandoffForm({ handoff, photoUrl, progressRef }: {
  handoff: UnderwaterHandoff;
  photoUrl?: string;
  progressRef: RefObject<number>;
}) {
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!photoUrl) return;
    let live = true;
    let loaded: THREE.Texture | null = null;
    new THREE.TextureLoader().load(photoUrl, (next) => {
      loaded = next;
      if (!live) { next.dispose(); return; }
      configureMemoryPhotoTexture(next);
      setTexture(next);
    });
    return () => { live = false; loaded?.dispose(); setTexture(null); };
  }, [photoUrl]);
  useFrame(() => {
    const u = materialRef.current?.uniforms;
    if (!u) return;
    const p = progressRef.current ?? 0;
    u.uReveal.value = smoothunit(.42, .76, p);
    u.uUnderwater.value = smoothunit(.4, .9, p);
    u.uProjectionStrength.value = texture ? smoothunit(.5, .82, p) * .82 : 0;
  });
  return <group position={UNDERWATER_CENTER}>
    <BubbleModel form={handoff.form} autoRotate={!photoUrl} morphProgress={0}
      fitTargetSize={bubbleFitTargetSize()} {...DEFAULT_BUBBLE_TINT} transmit={0}
      {...handoff.material} projectedPhotoTexture={texture} projectionStrength={0}
      photoFilter={MEMORY_PHOTO_FILTER_DEFAULTS} lights={handoff.lights} ambients={handoff.ambients}
      underwater origin={UNDERWATER_CENTER} userSpin={false} materialRef={materialRef} renderOrder={6} />
  </group>;
}

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
  promptRipples?: boolean;
  /** A picture let down onto the water; it lands with a ripple of its own. */
  paper?: PondPaper | null;
  onPaperLanded?: () => void;
  /** Move this same camera through the surface toward the waiting sphere. */
  submerge?: boolean;
  /** The form and lights waiting below; required for the descent to show them. */
  handoff?: UnderwaterHandoff | null;
  onSubmergeComplete?: () => void;
}

function Water({ arrival, reducedMotion, touch, cursorRef, holdRef, hintRef, hintRevealRef, promptRefs, cueRef, onReady, lifeReady = true, promptRipples = true, paper = null, onPaperLanded, submerge = false, handoff = null, onSubmergeComplete }: PondProps) {
  const { camera, size, gl } = useThree();
  const time = useRef(0);
  const submergeStarted = useRef<number | null>(null);
  const submergeProgress = useRef(0);
  const submergeFinished = useRef(false);
  // Behind the water: the volume below the surface, shown once the camera is under it.
  const depthReveal = useRef(0);
  // Over the water and the floating print: the surface dissolving into the stage.
  const stageReveal = useRef(0);
  const underwaterCamera = useMemo(() => {
    const z = handoff ? bubbleCameraFit(handoff.form).z : 4.8;
    return UNDERWATER_CENTER.clone().add(new THREE.Vector3(0, 0, z));
  }, [handoff]);
  const completionRef = useRef(onSubmergeComplete);
  completionRef.current = onSubmergeComplete;
  const ready = useRef(false);
  const touchIndex = useRef(0);
  const trailIndex = useRef(0);
  const trailAnchor = useRef<TrailAnchor | null>(null);
  const seenTouch = useRef(-1);
  const ring = useRef<THREE.Mesh>(null);
  const cursorFade = useRef(0);
  const tapAt = useRef(-99);
  const cursorLast = useMemo(() => new THREE.Vector3(0, .03, -4), []);
  const project = useMemo(() => new THREE.Vector3(), []);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const point = useMemo(() => new THREE.Vector3(), []);
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uDrops: { value: Array.from({ length: POND_DROP_SLOTS }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uTrails: { value: Array.from({ length: POND_TRAIL_SLOTS }, () => new THREE.Vector4()) },
    uTrailControls: { value: Array.from({ length: POND_TRAIL_SLOTS }, () => new THREE.Vector4()) },
    uTrailTimes: { value: Array.from({ length: POND_TRAIL_SLOTS }, () => new THREE.Vector2(-99, 0)) },
  }), []);
  const ringUniforms = useMemo(() => ({
    uProgress: { value: 0 },
    uOpacity: { value: 0 },
    uColor: { value: new THREE.Color(CHROME_GRAY) },
    uTime: uniforms.uTime,
    uDrops: uniforms.uDrops,
    uTrails: uniforms.uTrails,
    uTrailControls: uniforms.uTrailControls,
    uTrailTimes: uniforms.uTrailTimes,
    uCenter: { value: new THREE.Vector3() },
    uTap: { value: 0 },
  }), [uniforms]);

  useEffect(() => {
    const lost = (event: Event) => { event.preventDefault(); onReady(); };
    gl.domElement.addEventListener("webglcontextlost", lost);
    return () => gl.domElement.removeEventListener("webglcontextlost", lost);
  }, [gl, onReady]);

  // The sheet touching down is a touch like any other, in world coordinates.
  const splash = useCallback((x: number, z: number, strength: number) => {
    uniforms.uDrops.value[1 + (touchIndex.current++ % (POND_DROP_SLOTS - 1))].set(x, z, time.current, strength);
  }, [uniforms]);

  useEffect(() => {
    if (submerge) {
      submergeStarted.current = null;
      submergeFinished.current = false;
    } else {
      submergeProgress.current = 0;
      submergeStarted.current = null;
    }
  }, [submerge]);

  useFrame((_, delta) => {
    if (!document.hidden && !reducedMotion) time.current += Math.min(delta, .05);
    uniforms.uTime.value = time.current;
    // This is a perspective camera, never a CSS-flattened overhead texture.
    const cameraArrival = reducedMotion ? 1 : arrival;
    const lens = camera as THREE.PerspectiveCamera;
    if (submerge) {
      if (submergeStarted.current === null) submergeStarted.current = time.current;
      const raw = reducedMotion
        ? 1
        : Math.min(1, (time.current - submergeStarted.current) / SUBMERGE_SECONDS);
      const p = smoothunit(0, 1, raw);
      submergeProgress.current = p;
      const startCamera = new THREE.Vector3(0, 2.95 - cameraArrival * .15, 10 + (1 - cameraArrival) * .4);
      const startTarget = new THREE.Vector3(0, .05, -24);
      camera.position.lerpVectors(startCamera, underwaterCamera, p);
      const target = startTarget.lerp(UNDERWATER_CENTER, smoothunit(.05, .92, p));
      camera.lookAt(target);
      // Arrive on the shape page's lens, not just its position.
      lens.fov = POND_FOV + (BUBBLE_CAMERA_FOV - POND_FOV) * smoothunit(.3, 1, p);
      lens.updateProjectionMatrix();
      depthReveal.current = 1 - smoothunit(-.06, .24, camera.position.y);
      stageReveal.current = smoothunit(.5, .92, p);
      if (raw >= 1 && !submergeFinished.current) {
        submergeFinished.current = true;
        queueMicrotask(() => completionRef.current?.());
      }
    } else {
      if (lens.fov !== POND_FOV) { lens.fov = POND_FOV; lens.updateProjectionMatrix(); }
      depthReveal.current = 0;
      stageReveal.current = 0;
      camera.position.set(0, 2.95 - cameraArrival * .15, 10 + (1 - cameraArrival) * .4);
      camera.lookAt(0, .05, -24);
    }
    camera.updateMatrixWorld();
    if (!ready.current) { ready.current = true; onReady(); }
    const cue = cueRef.current;
    const thought = POND_THOUGHTS[cue.index];
    // Slot zero belongs to the only visible prompt. Old prompt ripples cannot
    // accumulate; the other slots are reserved for the user's own touches.
    uniforms.uDrops.value[0].set(size.width < 600 ? 0 : thought.x, thought.z,
      reducedMotion ? -1.5 : time.current - cue.age, lifeReady && promptRipples ? cue.ripple : 0);
    if (touch && touch.serial !== seenTouch.current) {
      seenTouch.current = touch.serial;
      tapAt.current = time.current;
      raycaster.setFromCamera(new THREE.Vector2(touch.x * 2 - 1, 1 - touch.y * 2), camera);
      if (raycaster.ray.intersectPlane(plane, point) && onPond(point)) {
        uniforms.uDrops.value[1 + (touchIndex.current++ % (POND_DROP_SLOTS - 1))].set(point.x, point.z, time.current, touch.strength ?? 1.5);
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
    // A hold under way pins the ring against the water until it is released; a
    // plain click never reaches the threshold and floats straight back up.
    if (progress > HOLD_PIN) tapAt.current = time.current - TAP_DOWN;
    const tapAge = time.current - tapAt.current;
    let tap = 0;
    if (tapAge >= 0 && tapAge < TAP_DOWN) { const t = tapAge / TAP_DOWN; tap = t * (2 - t); }
    else if (tapAge >= TAP_DOWN && tapAge < TAP_DOWN + TAP_HOLD) tap = 1;
    else if (tapAge >= 0) tap = 1 - smoothunit(TAP_DOWN + TAP_HOLD, TAP_DOWN + TAP_HOLD + TAP_UP, tapAge);
    // The clock is frozen under reduced motion, so the envelope cannot run.
    ringUniforms.uTap.value = reducedMotion ? (progress > HOLD_PIN ? 1 : 0) : tap;
    let target = 0;
    let nearness = 0;
    let trailPoint: TrailPoint | null = null;
    if (cursor) {
      ndc.set(cursor.x * 2 - 1, 1 - cursor.y * 2);
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(plane, point) && onPond(point)) {
        cursorLast.set(point.x, .03, point.z);
        const dist = Math.hypot(camera.position.x - point.x, camera.position.y - .03, camera.position.z - point.z);
        nearness = Math.min(1, nearDist / dist);
        target = lifeReady ? smoothunit(RING_FADE_IN, RING_FADE_FULL, nearness) : 0;
        if (!reducedMotion && arrival === 1 && target > .05) {
          trailPoint = { x: point.x, z: point.z, time: time.current };
        }
      }
    }
    const trail = samplePondTrail(trailAnchor.current, trailPoint);
    trailAnchor.current = trail.anchor;
    if (trail.segment) {
      const slot = trailIndex.current++ % POND_TRAIL_SLOTS;
      const { from, control, to, strength } = trail.segment;
      uniforms.uTrails.value[slot].set(from.x, from.z, to.x, to.z);
      uniforms.uTrailControls.value[slot].set(control.x, control.z, from.time, to.time);
      uniforms.uTrailTimes.value[slot].set(time.current, strength);
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
      <shaderMaterial transparent side={THREE.DoubleSide}
        vertexShader={vertexShader} fragmentShader={fragmentShader} uniforms={uniforms} />
    </mesh>
    <mesh ref={ring} visible={false} renderOrder={3} frustumCulled={false}>
      <ringGeometry args={[RING_INNER - .012, RING_OUTER + .012, 192, 8]} />
      <shaderMaterial transparent depthTest={false} depthWrite={false} side={THREE.DoubleSide}
        vertexShader={ringVertex} fragmentShader={ringFragment} uniforms={ringUniforms} />
    </mesh>
    <PondPhotoPaper paper={paper} timeRef={time} reducedMotion={reducedMotion} onSplash={splash} onLanded={onPaperLanded} />
    {submerge && <>
      <UnderwaterBackdrop revealRef={depthReveal} renderOrder={-10} />
      <UnderwaterBackdrop revealRef={stageReveal} renderOrder={4} />
      {handoff && <HandoffForm handoff={handoff} photoUrl={paper?.url} progressRef={submergeProgress} />}
    </>}
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
