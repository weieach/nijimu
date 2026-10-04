import { Component, useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CHROME_GRAY } from "../lib/colors";
import { POND_THOUGHTS, type PondPromptCue } from "../lib/pondPrompts";
import { POND_TRAIL_SLOTS, POND_TRAIL_LIFETIME, samplePondTrail, type TrailPoint, type TrailAnchor } from "../lib/pondTrail";
import { POND_DROP_SLOTS } from "../lib/voicePeaks";
import { POND_LENS, pondCameraPose, type PondSinkTarget } from "../lib/pondCamera";

export interface PondTouch {
  x: number;
  y: number;
  serial: number;
  strength?: number;
  /** A flat body laid on the water rather than a point: its footprint, in pond world units. */
  sheet?: { x: number; z: number; hw: number; hh: number; yaw: number };
}

const waves = /* glsl */ `
  uniform float uTime;
  uniform vec4 uDrops[${POND_DROP_SLOTS}];
  uniform vec4 uSheetDrop;   // centre x, z, time laid down, strength
  uniform vec4 uSheetShape;  // half width, half height, cos yaw, sin yaw
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
      sin(p.x * .73 + uTime * .3) + sin(p.y * .52 - uTime * .24),
      sin(p.y * .68 - uTime * .27) + sin(p.x * .44 + uTime * .33)
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
      // No two touches ring alike. Each is seeded by where it landed: the front
      // runs a little ahead on some sides and behind on others — more so the
      // farther it travels — and the crest is stronger where it runs ahead, so
      // a ring breaks up as it spreads instead of staying a drawn circle.
      float seed = hash(uDrops[i].xy) * 6.2831853;
      float ang = atan(dir.y, dir.x);
      float uneven = sin(ang * 3.0 + seed) * .55
        + sin(ang * 5.0 - seed * 1.7 + age * .35) * .3
        + sin(ang * 2.0 + seed * 2.3 - age * .2) * .15;
      // The front sprints away from the touch and then settles into a glide,
      // so the ripple reads on the next frame instead of creeping out of a dot.
      float radius = (age * 1.02 + .42 * (1.0 - exp(-age * 6.5))) * (1.0 + uneven * (.015 + age * .025));
      float front = d - radius;
      float trail = max(0.0, -front);
      // The train lengthens behind the front as the slower waves fall back,
      // and fades quickly enough that three or four rings carry the whole
      // event and the centre settles back to calm. Its spacing is the touch's
      // own, within a tenth either way.
      float wavelength = (.30 + age * .10) * (.9 + .2 * hash(uDrops[i].xy + 3.7));
      float train = cos(trail / wavelength * 6.2831853) * exp(-trail * 3.2 / (1.0 + age * .55));
      // Still water ahead of the front.
      float gate = exp(-pow(max(0.0, front) / (.045 + age * .015), 2.0));
      float birth = smoothstep(0.0, .03, age);
      // Energy shared over a growing circumference, and lost to the water.
      float amp = train * gate * birth * exp(-age * .33) / (1.0 + d * .55);
      amp *= .8 + .3 * uneven;
      // The touch itself: a dimple under the finger, present on the same frame
      // and gone before the first ring has travelled far.
      float dimple = -exp(-pow(d / .15, 2.0)) * exp(-age * 8.0) * birth;
      field.x += (amp * .075 + dimple * .05) * uDrops[i].w;
      // Push the water's material coordinates along with the wave. This bends
      // existing currents and light ribbons instead of drawing atop them.
      field.yz += dir * (amp * .8 + dimple * .3) * uDrops[i].w;
    }
    // A sheet laid on the water. The wave leaves from the whole edge at once,
    // so the front keeps the sheet's outline — a rounded rectangle easing to a
    // circle as it travels — and is gentler than a touch: broad, low, soon spent.
    if (uSheetDrop.w > .001 && uTime >= uSheetDrop.z) {
      float age = uTime - uSheetDrop.z;
      if (age < 12.0) {
        vec2 raw = p - uSheetDrop.xy;
        vec2 wobble = breath(p) * .03;
        vec2 local = vec2(
          raw.x * uSheetShape.z - raw.y * uSheetShape.w,
          raw.x * uSheetShape.w + raw.y * uSheetShape.z) + wobble;
        float corner = .18;
        vec2 q = abs(local) - uSheetShape.xy + corner;
        float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - corner;
        vec2 gLocal = q.x > 0.0 || q.y > 0.0 ? normalize(max(q, 0.0)) * sign(local) : sign(local) * step(q.yx, q.xy);
        vec2 dir = vec2(gLocal.x * uSheetShape.z + gLocal.y * uSheetShape.w, -gLocal.x * uSheetShape.w + gLocal.y * uSheetShape.z);
        float radius = age * .7 + .25 * (1.0 - exp(-age * 5.0));
        float front = sd - radius;
        float trail = max(0.0, -front);
        float wavelength = .55 + age * .14;
        float train = cos(trail / wavelength * 6.2831853) * exp(-trail * 2.0 / (1.0 + age * .5));
        float gate = exp(-pow(max(0.0, front) / (.08 + age * .02), 2.0));
        float birth = smoothstep(0.0, .05, age);
        float amp = train * gate * birth * exp(-age * .42) / (1.0 + max(sd, 0.0) * .4);
        // The water gives under the sheet as it settles, then comes back.
        float press = -smoothstep(.25, -.15, sd) * exp(-age * 2.2) * birth;
        field.x += (amp * .048 + press * .03) * uSheetDrop.w;
        field.yz += dir * (amp * .45 + press * .2) * uSheetDrop.w;
      }
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
  // One wind over the whole pond. Every scale of the surface — swell, chop,
  // grain, the ribbons of light — is carried on the same flow coordinate in
  // this direction, finer waves running a little faster than broad ones, so
  // the water and whatever it reflects move as one body.
  const vec2 WIND = vec2(.5435, .8399);
  vec2 flowAt(vec3 ripple, vec2 p) {
    // A passing ripple drags the surface along with it; otherwise the surface
    // drifts downwind even when nothing has touched it. The drift is not
    // rigid: the slow breath of the whole pond bends the flow, so the broad
    // folds of the water shift and squeeze as they go rather than sliding
    // past as one printed sheet.
    return p - ripple.yz * 1.8 + WIND * uTime * .14 + breath(p) * .3;
  }
  float swellFrom(vec3 ripple, vec2 p) {
    vec2 flow = flowAt(ripple, p);
    float h = sin(flow.x * 1.2 + flow.y * .55 + uTime * .48) * .014
      + sin(flow.y * 1.9 - flow.x * .31 - uTime * .33) * .008;
    // A light wandering chop. The pond is never glass, and this is the water a
    // new ripple has to spread across. Two octaves, so the surface never
    // settles into one repeating texture.
    h += (noise(flow * 3.1 + WIND * uTime * .12) - .5) * .011;
    h += (noise(flow * 6.3 + WIND * uTime * .2 + 11.0) - .5) * .0045;
    return h;
  }
  float waterHeight(vec2 p) {
    vec3 ripple = rippleField(p);
    return swellFrom(ripple, p) + ripple.x;
  }
  // The finest grain of the same surface: too small for the ring to feel and
  // too small to survive the horizon, so the fragment adds it on top of the
  // swell where it can fade it with distance. Same flow, same wind.
  float grainAt(vec2 flow) {
    return (noise(flow * 12.0 + WIND * uTime * .35) - .5) * .0009
      + (noise(flow * 24.0 + WIND * uTime * .55 + 7.0) - .5) * .00035;
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
    vec3 ripple = rippleField(p);
    vec2 flow = flowAt(ripple, p);
    // One surface, one normal. Swell, ripples and grain are a single height
    // field, and everything the light does — the shading, the sun's
    // reflection — follows from its shape. The grain fades before the horizon
    // can turn it into shimmer, and a ripple crest stirs it up while the
    // trough behind smooths it, so a ripple changes the texture it crosses.
    float detail = 1.0 - smoothstep(.3, 1.1, length(fwidth(flow * 12.0)));
    float stir = 1.0 + clamp(ripple.x * 40.0, -.7, 1.5);
    float grain = detail * stir;
    float h = swellFrom(ripple, p) + ripple.x + grainAt(flow) * grain;
    float hx = waterHeight(p + vec2(.02, 0)) + grainAt(flow + vec2(.02, 0)) * grain;
    float hz = waterHeight(p + vec2(0, .02)) + grainAt(flow + vec2(0, .02)) * grain;
    vec3 n = normalize(vec3((h - hx) / .02, 1.0, (h - hz) / .02));
    vec3 eye = normalize(cameraPosition - vWorld);
    vec3 reflection = reflect(-eye, n);
    float fresnel = pow(1.0 - max(0.0, dot(n, eye)), 3.0);
    // The page's own paper tone, and the water a shade below it: the pond is
    // lit by the same sky it sits under, only deeper, never a colour of its own.
    vec3 sky = vec3(.888, .902, .897);
    vec3 deep = sky * vec3(.76, .80, .80);
    vec3 color = mix(deep, sky, .24 + fresnel * .66);
    float clouds = noise(reflection.xz * 3.0 + WIND * uTime * .04);
    color += (clouds - .5) * .06;
    color += (n.x * .6 + n.z) * .14;
    // Sunlight. A sun just risen, low ahead of the viewer, is mirrored in the
    // surface wherever it tilts toward the light. The lobe is wide enough that
    // the light gathers into patches the size of the swell rather than
    // breaking into points, so the reflection has the same grain as the water
    // and moves and breaks only as a ripple reshapes the surface beneath it.
    // The path is brightest at its centre, where the sun itself sits, and the
    // glow around it is the same reflection seen through the haze.
    vec3 sunDir = normalize(vec3(0.0, .24, -1.0));
    float toSun = max(0.0, dot(reflection, sunDir));
    float light = pow(toSun, 220.0);
    float glow = pow(toSun, 12.0);
    // A long path: from the viewer's feet out to where the haze takes it.
    float centre = exp(-(p.x * p.x / 16.0 + pow((p.y + 5.0) / 15.0, 2.0)));
    float reach = (1.0 - smoothstep(-30.0, -60.0, p.y)) * (.25 + .75 * centre);
    color += glow * reach * vec3(.05, .046, .036);
    color += light * reach * (.45 + .55 * fresnel) * vec3(.38, .36, .32);
    // Subtle, water-anchored ribbons of reflected light and shadow — the broad
    // folds of the body of water, carried on the same flow as everything
    // else. Warping breaks up parallel bands; fine striations soften before
    // they can alias at the horizon. Keep the existing gray-green palette,
    // not the reference hue.
    vec2 drift = flow * vec2(.38, .65) + WIND * uTime * .06;
    float bend = noise(drift * .7) * 2.0 - 1.0;
    float ribbons = noise(vec2(drift.x * .7, drift.y * 2.4 + bend * 1.3));
    vec2 fibersUV = vec2(flow.x * 1.8, flow.y * 24.0 + bend * 5.0 + WIND.y * uTime * .6);
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
  /** 0 = standing at the pond; 1 = gone down through the water. */
  sinkRef?: RefObject<number>;
  /** The spot the camera leans onto as it sinks. */
  sinkTargetRef?: RefObject<PondSinkTarget | null>;
}

function Water({ arrival, reducedMotion, touch, cursorRef, holdRef, hintRef, hintRevealRef, promptRefs, cueRef, onReady, lifeReady = true, promptRipples = true, sinkRef, sinkTargetRef }: PondProps) {
  const { camera, size, gl } = useThree();
  const time = useRef(0);
  const lookAt = useMemo(() => new THREE.Vector3(), []);
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
    uSheetDrop: { value: new THREE.Vector4(0, 0, 0, 0) },
    uSheetShape: { value: new THREE.Vector4(1, 1, 1, 0) },
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
    uSheetDrop: uniforms.uSheetDrop,
    uSheetShape: uniforms.uSheetShape,
    uCenter: { value: new THREE.Vector3() },
    uTap: { value: 0 },
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
    pondCameraPose(cameraArrival, sinkRef?.current ?? 0, sinkTargetRef?.current ?? null, camera.position, lookAt);
    camera.lookAt(lookAt);
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
      if (touch.sheet) {
        const { x, z, hw, hh, yaw } = touch.sheet;
        uniforms.uSheetDrop.value.set(x, z, time.current, touch.strength ?? 1);
        uniforms.uSheetShape.value.set(hw, hh, Math.cos(yaw), Math.sin(yaw));
      } else {
        raycaster.setFromCamera(new THREE.Vector2(touch.x * 2 - 1, 1 - touch.y * 2), camera);
        if (raycaster.ray.intersectPlane(plane, point) && onPond(point)) {
        uniforms.uDrops.value[1 + (touchIndex.current++ % (POND_DROP_SLOTS - 1))].set(point.x, point.z, time.current, touch.strength ?? 1.5);
        }
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
  return <div aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(#e2e6e2 28%, #d4dad7 49%, #b9c3c1 100%)" }}>
    <div ref={ripple} style={{ position: "absolute", inset: "38% -30% -50%", transformOrigin: "50% 30%", transform: "perspective(500px) rotateX(68deg) scale(.005)", background: "radial-gradient(ellipse at 50% 30%, transparent 26%, #e6edeb22 29%, transparent 32%, transparent 35%, #e6edeb33 38%, transparent 41%, transparent 44%, #e6edeb55 47%, transparent 50%)" }} />
  </div>;
}

export function PerspectivePond(props: PondProps) {
  const fallback = <StillPond onReady={props.onReady} cueRef={props.cueRef} />;
  return <PondBoundary fallback={fallback}>
    <Canvas camera={{ fov: POND_LENS.fov, near: POND_LENS.near, far: POND_LENS.far, position: [0, 2.8, 10] }}
      dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }} fallback={fallback}
      style={{ position: "absolute", inset: 0 }}>
      <Water {...props} />
    </Canvas>
  </PondBoundary>;
}
