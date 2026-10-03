import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CHROME_GRAY } from "../lib/colors";
import { INSTRUCTION_SIZE, META, NOTE_SIZE, SANS, SERIF, TITLE } from "../lib/theme";
import { flowProgress, smoothProgress } from "../lib/landingTransition";
import { POND_DROP_SLOTS } from "../lib/voicePeaks";
import { POND_TRAIL_SLOTS } from "../lib/pondTrail";
import { POND_WAVES_GLSL } from "../components/PerspectivePond";
import { TextButton } from "../components/TextButton";
import { PillButton } from "../components/PillButton";
import { OklchColorField } from "../components/OklchColorField";
import { CAPTION_TITLE_GAP, CAPTION_TITLE_STYLE, CAPTION_YEAR_STYLE } from "../components/PuddleDiveGallery";
import { MODEL_SPACE } from "../components/SceneViewer";
import {
  MEMORY_PHOTO_FILTER_DEFAULTS,
  buildPhotoUv,
  createMemoryPhotoMaterial,
  setMemoryPhotoFade,
} from "../components/MemoryPhotoLayer";
import { createArtifactGeometry } from "../hooks/useArtifactGeometry";
import { computeMeshNormals, createArtifactForm } from "../lib/superformula";
import { DEFAULT_OKLCH, meshCoreFromOklch, oklchToHex, rimFromOklch, sampleField, uvFromOklch, type Oklch } from "../lib/oklch";
import photoA from "../../assets/memory-photo.jpg";
import photoB from "../../assets/memory-photo-02.png";

/*
 * Lab: the whole shot from the photo to the named memory, in one canvas.
 *
 * The photo falls onto the pond as a strip of film and floats; the view sinks
 * through it into the water, where the form surfaces and is shaped (shape,
 * distance, color — pointer-driven here, the same three signals the gesture
 * pages produce). On confirm the film overhead dissolves into particles that
 * settle onto the form as its photo; the form then rises, breaks the surface,
 * and is named where it floats.
 *
 * The water is the pond's own wave field (POND_WAVES_GLSL) with an underside
 * added. While the form is being handled the water loses color and
 * saturation, so the thing in hand is what has the color.
 */

type Phase =
  | "choose" | "falling" | "floating" | "descending"
  | "shape" | "distance" | "color"
  | "wrapping" | "rising" | "naming" | "saved";
type Step = "shape" | "distance" | "color";

const POND_CAMERA = new THREE.Vector3(0, 2.8, 10);
const POND_LOOK = new THREE.Vector3(0, 0.05, -24);
/** Where the film comes to rest — lower third of the pond view. */
const FILM_AT = new THREE.Vector3(0, 0, 2);
const FILM_YAW = 0.14;
/** A cut of 35mm: one 36×24 frame and a little of its neighbours, in mm. */
const STRIP_MM = { length: 46, width: 35 };
const FILM_LENGTH = 2.0;
const FILM_WIDTH = FILM_LENGTH * STRIP_MM.width / STRIP_MM.length;
/** The film starts this far in front of the lens, matched to the thumbnail. */
const START_DEPTH = 2.4;
const FALL_S = 2.4;
const SETTLE_S = 0.9;
const HOLD_S = 1.1;
const DESCENT_S = 6.2;
const FORM_AT = new THREE.Vector3(0, -5, -1.2);
const FORM_REVEAL_S: [number, number] = [3.9, 7];
/** How far the water gives way to paper while the form is being handled. */
const WATER_WASH = 1.0;
/** The wash comes in as the form surfaces out of the water, seconds into the descent. */
const WASH_IN_S: [number, number] = [4.6, 9.0];

/* The wrap: the view draws back so the film overhead and the form are both in
   frame, and the form lifts a little toward the light. */
const WRAP_CAMERA = new THREE.Vector3(0, -2.6, 7.6);
const WRAP_LOOK = new THREE.Vector3(0, -2.0, 1.0);
const WRAP_FORM_AT = new THREE.Vector3(0, -3.1, -0.2);
const WRAP_MOVE_S = 2.2;
/* The photo leaves the film over RELEASE_S — a few grains from the edge first,
   then more — and everything has sunk, been caught and faded by WRAP_FALL_S.
   Sinking speeds span 3× between the lightest and heaviest grain. */
const RELEASE_S = 2.2;
const WRAP_FALL_S = 7.2;
const PARTICLE_COUNT = 5200;
const SINK_SPEED: [number, number] = [0.72, 2.1];

/* The rise: up through the surface, to the seat where the memory is named. */
const RISE_S = 6.0;
const NAME_FORM_AT = new THREE.Vector3(0, 0.95, 2.0);
const RISE_PATH = new THREE.CatmullRomCurve3([
  WRAP_CAMERA.clone(),
  new THREE.Vector3(0, -1.8, 7.6),
  new THREE.Vector3(0, 0.5, 8.8),
  new THREE.Vector3(0, 2.3, 9.7),
  POND_CAMERA.clone(),
], false, "centripetal");
const RISE_LOOK = new THREE.CatmullRomCurve3([
  WRAP_LOOK.clone(),
  new THREE.Vector3(0, -1.0, 1.0),
  new THREE.Vector3(0, 0.2, 1.6),
  new THREE.Vector3(0, 0.8, 1.9),
  NAME_FORM_AT.clone(),
], false, "centripetal");
const RISE_FORM = new THREE.CatmullRomCurve3([
  WRAP_FORM_AT.clone(),
  new THREE.Vector3(0, -2.2, 0.4),
  new THREE.Vector3(0, -0.6, 1.4),
  new THREE.Vector3(0, 0.6, 1.9),
  NAME_FORM_AT.clone(),
], false, "centripetal");

/* The descent, as one continuous path: settle toward the print, look down
   onto it, pass through, then level out in the water facing the form. */
const DESCENT_PATH = new THREE.CatmullRomCurve3([
  POND_CAMERA.clone(),
  new THREE.Vector3(0, 2.0, 6.2),
  new THREE.Vector3(0, 0.9, 3.2),
  new THREE.Vector3(0, 0.22, 2.1),
  new THREE.Vector3(0, -0.7, 2.0),
  new THREE.Vector3(0, -2.4, 2.4),
  new THREE.Vector3(0, -3.9, 3.0),
  new THREE.Vector3(0, -4.6, 3.4),
], false, "centripetal");
const DESCENT_LOOK = new THREE.CatmullRomCurve3([
  POND_LOOK.clone(),
  new THREE.Vector3(0, -0.2, -6),
  new THREE.Vector3(0, -0.1, 1.4),
  new THREE.Vector3(0, -1.0, 1.95),
  new THREE.Vector3(0, -3.0, 1.7),
  new THREE.Vector3(0, -4.5, 0.4),
  new THREE.Vector3(0, -5.0, -0.6),
  FORM_AT.clone(),
], false, "centripetal");

const PHOTOS = [photoA, photoB];

/** ?speed=0.25 plays the whole shot at quarter speed, for judging the timing. */
const SPEED = Number(new URLSearchParams(window.location.search).get("speed")) || 1;

/** The water's body, seen from inside it: pale toward the surface, deep below.
    uWash gives it up almost entirely while the form is handled: the landing
    page's paper tones, a trace of the water left in them, soft clouds at very
    low chroma — and uTint lets the chosen color settle into those clouds. */
const VOLUME_GLSL = /* glsl */ `
  uniform float uWash;
  uniform vec3 uTint;
  uniform float uTintAmount;
  uniform float uClock;
  float washHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float washNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(washHash(i), washHash(i + vec2(1, 0)), f.x),
               mix(washHash(i + vec2(0, 1)), washHash(i + vec2(1, 1)), f.x), f.y);
  }
  vec3 volumeColor(vec3 dir) {
    vec3 deep = vec3(.30, .39, .40);
    vec3 mid = vec3(.55, .64, .63);
    vec3 high = vec3(.80, .86, .84);
    vec3 c = mix(deep, mid, smoothstep(-.9, .1, dir.y));
    c = mix(c, high, smoothstep(.1, .9, dir.y));
    // the paper: #c8c9ce low, #ededee high, as the landing gradient
    vec3 paper = mix(vec3(.784, .788, .808), vec3(.93, .93, .934), smoothstep(-.8, .7, dir.y));
    float cloud = washNoise(dir.xy * 2.4 + vec2(uClock * .012, dir.z * .5)) * .65
                + washNoise(dir.xy * 6.0 - vec2(0.0, uClock * .02)) * .35;
    vec3 washed = mix(paper, c, .08) + (cloud - .5) * .035;
    washed = mix(washed, uTint, uTintAmount * (.22 + .3 * cloud));
    return mix(c, washed, uWash);
  }
`;

const waterVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/* Above: the pond's surface shading, unchanged. Below: Snell's window — the
   sky only reaches the eye inside ~48° of straight up; beyond it the surface
   mirrors the depths. */
const waterFragment = /* glsl */ `
  ${POND_WAVES_GLSL}
  ${VOLUME_GLSL}
  varying vec3 vWorld;
  void main() {
    vec2 p = vWorld.xz;
    vec2 surface = p - rippleField(p).yz;
    float h = waterHeight(p);
    vec3 n = normalize(vec3((h - waterHeight(p + vec2(.035,0))) / .035, 1.0,
      (h - waterHeight(p + vec2(0,.035))) / .035));
    vec3 eye = normalize(cameraPosition - vWorld);
    vec3 sky = vec3(.888, .902, .897);
    if (cameraPosition.y >= 0.0) {
      vec3 reflection = reflect(-eye, n);
      float fresnel = pow(1.0 - max(0.0, dot(n, eye)), 3.0);
      vec3 deep = vec3(.49, .59, .59);
      vec3 color = mix(deep, sky, .36 + fresnel * .56);
      float clouds = noise(reflection.xz * 3.0 + vec2(uTime * .009, 0));
      color += (clouds - .5) * .085;
      float light = pow(max(0.0, dot(reflection, normalize(vec3(-.4, .65, -.8)))), 14.0);
      color += light * vec3(.16, .15, .12);
      color += (n.x * .6 + n.z) * .16;
      vec2 drift = surface * vec2(.38, .65) + vec2(uTime * .018, -uTime * .012);
      float bend = noise(drift * .7) * 2.0 - 1.0;
      float ribbons = noise(vec2(drift.x * .7, drift.y * 2.4 + bend * 1.3));
      vec2 fibersUV = vec2(surface.x * 1.8, surface.y * 24.0 + bend * 5.0 - uTime * .15);
      float fiberAA = 1.0 - smoothstep(.3, 1.3, length(fwidth(fibersUV)));
      float fibers = (noise(fibersUV) - .5) * fiberAA;
      color += vec3((ribbons - .5) * .022 + fibers * .006);
      float haze = 1.0 - exp(-max(0.0, -p.y - 8.0) * .028);
      color = mix(color, sky, haze);
      color += (hash(gl_FragCoord.xy) - .5) * .017;
      gl_FragColor = vec4(color, 1.0 - smoothstep(140.0, 400.0, -p.y));
      return;
    }
    vec3 up = -eye;
    float cosUp = max(0.0, dot(up, n));
    float window = smoothstep(.60, .74, cosUp);
    float clouds = noise((p + n.xz * 3.0) * .35 + vec2(uTime * .02, 0.0));
    vec3 through = sky * 1.04 + (clouds - .5) * .06;
    vec3 mirrored = volumeColor(vec3(up.x, -up.y, up.z)) * .92;
    vec3 color = mix(mirrored, through, window);
    color += smoothstep(.56, .66, cosUp) * (1.0 - smoothstep(.66, .78, cosUp)) * .05;
    float dist = length(cameraPosition - vWorld);
    color = mix(color, volumeColor(up), 1.0 - exp(-dist * .045));
    color += (hash(gl_FragCoord.xy) - .5) * .017;
    gl_FragColor = vec4(color, 1.0);
  }
`;

/* A full-screen pass behind everything: the water's body, with slow shafts of
   light falling from the surface. Transparent above water, so the page's own
   gradient stays the sky. */
const volumeVertex = /* glsl */ `
  varying vec2 vNdc;
  void main() {
    vNdc = position.xy;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;
const volumeFragment = /* glsl */ `
  ${POND_WAVES_GLSL}
  ${VOLUME_GLSL}
  uniform mat4 uInvProjection;
  uniform mat4 uCameraWorld;
  uniform float uUnder;
  varying vec2 vNdc;
  void main() {
    vec4 v = uInvProjection * vec4(vNdc, 1.0, 1.0);
    vec3 dir = normalize((uCameraWorld * vec4(v.xyz / v.w, 0.0)).xyz);
    vec3 color = volumeColor(dir);
    vec2 s = dir.xz / max(.25, dir.y + .45);
    float shaft = pow(noise(vec2(s.x * 3.0 + uTime * .05, s.y * .6)), 3.0);
    color += shaft * smoothstep(-.2, .5, dir.y) * .08 * (1.0 - uWash * .7);
    color += (hash(gl_FragCoord.xy) - .5) * .017;
    gl_FragColor = vec4(color, uUnder);
  }
`;

/* The film. A cut strip never lies flat: it cups across its width and warps
   toward its torn ends. The water presses most of that out, never all of it,
   and every vertex then rides the surface on its own, so a passing ripple
   bends the strip instead of tilting it as a slab. While it falls it flexes
   with the air. Normals come from the same shape, sampled a step away. */
const filmVertex = /* glsl */ `
  ${POND_WAVES_GLSL}
  uniform vec2 uSize;
  uniform float uFloat;
  uniform float uSink;
  uniform float uCurl;
  uniform float uFlex;
  uniform float uSeed;
  varying vec2 vLocal;
  varying vec3 vWorld;
  varying vec3 vNormal;
  vec3 sheet(vec2 local) {
    vec2 n = local / (uSize * .5);
    float w = uSize.y;
    float z = uCurl * w * (
        .11 * n.y * n.y
      + .035 * n.x * n.x
      + .025 * sin(n.x * 2.2 + n.y * .8 + uSeed)
      + .02 * smoothstep(.6, 1.0, abs(n.x)) * sin(n.y * 4.0 + uSeed * 2.0))
      + uFlex * w * .12 * (n.x * n.x - .33);
    vec4 world = modelMatrix * vec4(local, z, 1.0);
    if (uFloat > 0.0) {
      vec3 field = rippleField(world.xz);
      float h = swellFrom(field, world.xz) + field.x;
      world.y += (h * 1.3 + .012 - uSink * .06) * uFloat;
      world.xz += field.yz * .08 * uFloat;
    }
    return world.xyz;
  }
  void main() {
    vLocal = position.xy * uSize;
    vec3 p = sheet(vLocal);
    vec2 e = uSize * .01;
    vNormal = normalize(cross(sheet(vLocal + vec2(e.x, 0.0)) - p, sheet(vLocal + vec2(0.0, e.y)) - p));
    vWorld = p;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

/* Pale, faded stock — a near-white base, a little cool ink, soft frame edges.
   The photo keeps its content but is lifted and pulled toward that ink, so it
   reads as an image held in film rather than a print laid on top. Geometry is
   in mm so the perforations keep the real 35mm pitch. While the thumbnail's
   circle is still opening, the film's features have not arrived yet. */
const filmFragment = /* glsl */ `
  uniform sampler2D uPhoto;
  uniform sampler2D uEdgePrint;
  uniform vec2 uSize;
  uniform float uImageAspect;
  uniform float uMorph;
  uniform float uFloat;
  uniform float uSeed;
  uniform float uDissolve;
  varying vec2 vLocal;
  varying vec3 vWorld;
  varying vec3 vNormal;
  const vec2 STRIP = vec2(${STRIP_MM.length.toFixed(1)}, ${STRIP_MM.width.toFixed(1)});
  const vec2 WINDOW = vec2(18.0, 12.0);
  const float PITCH = 4.75;
  const float HOLE_Y = 14.1;
  const vec2 HOLE = vec2(.99, 1.395);
  float hash1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
  float noise1(float x) {
    float i = floor(x), f = fract(x);
    return mix(hash1(i), hash1(i + 1.0), f * f * (3.0 - 2.0 * f));
  }
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise2(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
  }
  float roundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
  void main() {
    float feature = smoothstep(.35, 1.0, uMorph);
    vec2 hs = uSize * .5;
    vec2 toWorld = uSize / STRIP;
    vec2 mm = vLocal / toWorld;

    // outline: the circle opens into the strip; its short ends are torn
    float side = sign(mm.x) * 13.0;
    float torn = (noise1(mm.y * .32 + side + uSeed * 7.0) * .75
      + noise1(mm.y * 1.3 + side + uSeed) * .2
      + noise1(mm.y * 6.0 + side) * .05) * 1.4 * feature;
    float shortSide = min(hs.x, hs.y);
    float d = roundedBox(vLocal, vec2(hs.x - torn * toWorld.x, hs.y), mix(shortSide, shortSide * .02, uMorph));
    float aa = fwidth(d);
    float alpha = 1.0 - smoothstep(-aa, aa, d);
    float hx = mod(mm.x + PITCH * .5, PITCH) - PITCH * .5;
    float dh = roundedBox(vec2(hx, abs(mm.y) - HOLE_Y), HOLE, .42);
    alpha *= 1.0 - (1.0 - smoothstep(-fwidth(dh), fwidth(dh), dh)) * feature;
    // the dissolve: the emulsion lets go in a drifting grain, image first
    float grain = noise2(mm * vec2(.9, 1.6) + uSeed * 5.0) * .7 + noise2(mm * 4.0) * .3;
    float gone = 1.0 - smoothstep(uDissolve - .3, uDissolve, grain * .8 + .1);
    alpha *= 1.0 - gone;
    if (alpha < .01) discard;

    // the base: near-white, uneven density, a faint blue stain drifting in
    vec3 base = vec3(.935, .945, .948) + (noise2(mm * .35 + uSeed) - .5) * .025;
    float stain = smoothstep(.58, .92, noise2(vec2(mm.x * .09, mm.y * .03) + uSeed * 3.0));
    base = mix(base, vec3(.70, .78, .86), stain * .45);
    base = mix(base, vec3(.80, .84, .87), smoothstep(15.5, 17.5, abs(mm.y)) * .5);

    // the frame: the whole circle while it is a thumbnail, the 36×24 window once it is film
    vec2 windowWorld = mix(STRIP * .5 + 1.0, WINDOW, feature) * toWorld;
    vec2 q = vLocal / (windowWorld * 2.0);
    float boxAspect = windowWorld.x / windowWorld.y;
    vec2 uv = q;
    if (boxAspect > uImageAspect) uv.y *= uImageAspect / boxAspect;
    else uv.x *= boxAspect / uImageAspect;
    vec3 photo = texture2D(uPhoto, uv + .5).rgb;
    float luma = dot(photo, vec3(.2126, .7152, .0722));
    vec3 ink = mix(vec3(.30, .40, .52), vec3(.94, .95, .95), luma);
    vec3 faded = mix(photo, ink, .45 * feature);
    faded = mix(faded, faded * .8 + .17, feature);
    vec2 soft = .6 / (windowWorld / toWorld);
    float inFrame = (1.0 - smoothstep(.5 - soft.x * feature - fwidth(q.x), .5, abs(q.x)))
      * (1.0 - smoothstep(.5 - soft.y * feature - fwidth(q.y), .5, abs(q.y)));
    vec3 color = mix(base, faded, inFrame);

    vec4 print = texture2D(uEdgePrint, mm / STRIP + .5);
    color = mix(color, vec3(.33, .45, .58), print.a * .6 * feature);

    // a soft sheen where the curl catches the sky, nothing glossy
    vec3 n = normalize(vNormal);
    vec3 eye = normalize(cameraPosition - vWorld);
    if (dot(n, eye) < 0.0) n = -n;
    float sheen = pow(max(0.0, dot(reflect(-eye, n), normalize(vec3(-.3, .8, -.5)))), 18.0);
    color = color * (.9 + .1 * n.y) + sheen * .28 * feature;
    color *= mix(1.0, .965, uFloat);
    if (!gl_FrontFacing) {
      // from under the water the film is backlit, light coming through it
      color = mix(vec3(.92, .95, .94), color * 1.05, .42);
    }
    gl_FragColor = vec4(color, alpha * mix(1.0, mix(.9, .97, inFrame), feature));
  }
`;

/** The edge printing — stock name along the top, frame numbers and a ruler
    along the bottom — drawn once, in mm, onto a transparent texture. */
function createEdgePrint(frame: number): THREE.CanvasTexture {
  const pxPerMm = 40;
  const canvas = document.createElement("canvas");
  canvas.width = STRIP_MM.length * pxPerMm;
  canvas.height = STRIP_MM.width * pxPerMm;
  const ctx = canvas.getContext("2d");
  const mm = (v: number) => v * pxPerMm;
  if (ctx) {
    ctx.fillStyle = "#000";
    ctx.textBaseline = "alphabetic";
    ctx.font = `600 ${mm(1.4)}px ui-monospace, Menlo, monospace`;
    ctx.fillText("NIJIMU 100", mm(5), mm(1.65));
    ctx.fillText("NIJIMU 100", mm(33), mm(1.65));
    ctx.font = `600 ${mm(1.5)}px ui-monospace, Menlo, monospace`;
    ctx.fillText(String(frame), mm(7.5), mm(34.6));
    ctx.fillText(`${frame}A`, mm(36), mm(34.6));
    ctx.beginPath();
    ctx.moveTo(mm(12.5), mm(33.3));
    ctx.lineTo(mm(13.7), mm(33.9));
    ctx.lineTo(mm(12.5), mm(34.5));
    ctx.fill();
    for (let i = 0; i <= 12; i++) {
      const tall = i % 4 === 0 ? 1.1 : 0.6;
      ctx.fillRect(mm(16 + i * 1.2), mm(33.2), mm(0.32), mm(tall));
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

const motesVertex = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uPixel;
  varying float vFade;
  void main() {
    vec3 p = position;
    p.x += sin(uTime * .17 + aSeed * 12.0) * .1;
    p.y += sin(uTime * .3 + aSeed * 6.283) * .08;
    vec4 view = viewMatrix * modelMatrix * vec4(p, 1.0);
    float dist = -view.z;
    gl_Position = projectionMatrix * view;
    gl_PointSize = clamp(uPixel * 16.0 / dist, 1.0, 6.0) * (.5 + aSeed);
    vFade = smoothstep(.3, 1.2, dist) * (1.0 - smoothstep(6.0, 14.0, dist));
  }
`;
const motesFragment = /* glsl */ `
  uniform float uUnder;
  uniform float uWash;
  varying float vFade;
  void main() {
    float d = length(gl_PointCoord - .5);
    float a = (1.0 - smoothstep(.15, .5, d)) * vFade * uUnder * .5 * (1.0 - uWash * .75);
    if (a < .004) discard;
    gl_FragColor = vec4(.93, .96, .95, a);
  }
`;

const formVertex = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewW;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewW = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
/* Glass in the water. uFrost mists it (the distance step); uCore / uRim dye it
   once the color step has a pick (uDye). Above the surface (uAir) it hardens a
   little: more rim, less of the water's own color inside it. */
const formFragment = /* glsl */ `
  ${VOLUME_GLSL}
  uniform float uReveal;
  uniform float uFrost;
  uniform float uDye;
  uniform float uAir;
  uniform vec3 uCore;
  uniform vec3 uRim;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(vViewW);
    float facing = max(0.0, dot(n, v));
    float fresnel = pow(1.0 - facing, 2.2);
    vec3 core = mix(vec3(.62, .70, .70), uCore, uDye);
    // against the dark water the edge is light; against the paper it turns a cool grey, as the landing blobs do
    vec3 rimBase = mix(vec3(.93, .96, .95), vec3(.66, .71, .73), uWash * .85);
    vec3 rim = mix(rimBase, mix(uRim, rimBase, .5), uDye);
    vec3 color = mix(core, rim, fresnel);
    color += pow(max(0.0, dot(reflect(-v, n), normalize(vec3(-.3, 1.0, .4)))), 40.0) * .35;
    // frost: the body goes milky and opaque, the rim softens; lit a little from above so it keeps its volume
    vec3 milk = mix(vec3(.87, .89, .895), core, .35) * (.94 + .08 * n.y);
    color = mix(color, milk, uFrost * (.75 - .35 * fresnel));
    float alpha = mix(.18 + .7 * fresnel, .62 + .3 * fresnel, uFrost);
    // in air the glass is clearer and its edge darker
    color = mix(color, mix(color, uRim * .85 + .1, fresnel * .5), uAir * uDye);
    alpha = mix(alpha, alpha * .9 + .08 * fresnel, uAir);
    // it surfaces out of the water's own color rather than fading in on top of it
    color = mix(color, volumeColor(-v), (1.0 - uReveal) * .9);
    gl_FragColor = vec4(color, alpha * uReveal);
  }
`;

/* The photo, let go of the film and settling on the form the way dust settles
   through still water. Each grain has a weight: the heavy ones are a little
   larger, sink faster and straighter; the light ones drift, pause and lift on
   the water, and arrive last. Nothing pulls a grain toward the form until it
   has sunk to the form's height — then it is caught where it belongs. uClock
   is seconds since the film began to let go. */
const particleVertex = /* glsl */ `
  attribute vec3 aStart;
  attribute vec3 aEnd;
  attribute vec3 aColor;
  attribute float aDelay;
  attribute float aWeight;
  attribute float aSeed;
  uniform float uClock;
  uniform float uPixel;
  uniform vec2 uSpeed;
  uniform mat4 uForm;
  varying vec3 vColor;
  varying float vAlpha;
  vec3 curl(vec3 p, float t) {
    return vec3(
      sin(p.y * 1.7 + p.z * .9 + t * .5),
      sin(p.z * 1.3 + p.x * 1.1 - t * .35) * .4,
      sin(p.x * 1.5 + p.y * .8 + t * .6));
  }
  void main() {
    float age = uClock - aDelay;
    float light = 1.0 - aWeight;
    float speed = mix(uSpeed.x, uSpeed.y, aWeight);
    vec3 end = (uForm * vec4(aEnd, 1.0)).xyz;
    // the sink: terminal velocity, with a slow buoyant bob that the light grains feel most
    float settle = smoothstep(0.0, .5, age);
    float bob = sin(age * (1.4 + aSeed * 1.2) + aSeed * 6.283) * .5 + .5;
    float lift = light * .14 * bob * settle;
    float drop = speed * max(0.0, age) * (.72 + .28 * settle);
    vec3 p = aStart;
    p.y -= drop - lift;
    // a slow current carries the column toward the form's side; lateral drift from the curl, by lightness
    float fall = max(.1, (aStart.y - end.y) / speed);
    p.xz += (end.xz - aStart.xz) * .6 * smoothstep(0.0, fall, age);
    p += curl(aStart * 2.0 + aSeed * 7.0, age) * (.05 + .22 * light) * settle;
    // the catch: as the grain comes down to the form's height, it is taken and held
    float sinkY = aStart.y - drop;
    float catchK = smoothstep(end.y + 1.3, end.y + .05, sinkY);
    catchK = catchK * catchK * (3.0 - 2.0 * catchK);
    p = mix(p, end, catchK);
    vec4 view = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * view;
    float dist = max(.5, -view.z);
    gl_PointSize = clamp(uPixel * (4.2 + 3.4 * aWeight + 1.2 * aSeed) / dist, 1.0, 7.0);
    vColor = aColor;
    // present once it has left the film; once held, it fades into the surface — the light grains first
    float born = smoothstep(0.0, .25, age);
    float landAge = (aStart.y - (end.y + .05)) / speed;
    float linger = mix(.45, 1.5, aWeight);
    float faded = 1.0 - smoothstep(landAge + .2, landAge + .2 + linger, age);
    vAlpha = born * faded;
  }
`;
const particleFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - .5);
    float a = (1.0 - smoothstep(.2, .5, d)) * vAlpha * .85;
    if (a < .005) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

/** The photo's pixels, read once so each particle can carry its own. */
function readPhoto(texture: THREE.Texture): { data: Uint8ClampedArray; w: number; h: number } | null {
  const image = texture.image as CanvasImageSource & { width: number; height: number };
  const w = 160, h = 160;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(image, 0, 0, w, h);
    return { data: ctx.getImageData(0, 0, w, h).data, w, h };
  } catch {
    return null;
  }
}

interface FallRequest {
  texture: THREE.Texture;
  /** Thumbnail centre and diameter, in canvas pixels. */
  cx: number;
  cy: number;
  diameter: number;
}

/** What the page hands the stage, frame by frame, without re-rendering it. */
interface StageState {
  request: FallRequest | null;
  holding: boolean;
  /** The sculpting step the page is on, if any. */
  step: Step | null;
  /** The three signals the gesture pages produce. */
  morph: number;
  frost: number;
  oklch: Oklch;
  /** Set once by the page to begin the wrap, then the rise. */
  wrap: boolean;
  rise: boolean;
}

interface StageProps {
  stage: RefObject<StageState>;
  crossingRef: RefObject<HTMLDivElement | null>;
  glowRef: RefObject<HTMLDivElement | null>;
  hintRef: RefObject<HTMLDivElement | null>;
  captionRef: RefObject<HTMLDivElement | null>;
  onFallStart: () => void;
  onSettled: () => void;
  onDescend: () => void;
  onUnder: () => void;
  onWrapped: () => void;
  onRisen: () => void;
}

function Stage({ stage, crossingRef, glowRef, hintRef, captionRef, onFallStart, onSettled, onDescend, onUnder, onWrapped, onRisen }: StageProps) {
  const { camera, size, gl } = useThree();
  const time = useRef(0);
  const dropIndex = useRef(0);
  const fall = useRef<{
    at: number; pos: THREE.Vector3; quat: THREE.Quaternion; right: THREE.Vector3;
    diameter: number; width: number; height: number;
  } | null>(null);
  const landedAt = useRef<number | null>(null);
  const settled = useRef(false);
  const hold = useRef(0);
  const wasHolding = useRef(false);
  const descentAt = useRef<number | null>(null);
  const reachedBottom = useRef(false);
  const wrapAt = useRef<number | null>(null);
  const wrapped = useRef(false);
  const riseAt = useRef<number | null>(null);
  const risen = useRef(false);
  const broke = useRef(false);
  const film = useRef<THREE.Mesh>(null);
  const form = useRef<THREE.Mesh>(null);
  const particles = useRef<THREE.Points>(null);
  const photoMaterial = useRef<THREE.ShaderMaterial | null>(null);
  const smooth = useRef({ morph: 0, frost: 0, wash: 0, dye: 0, spin: 0 });
  const written = useRef(-1);
  const tint = useMemo(() => new THREE.Color(), []);
  const scratch = useMemo(() => ({
    v: new THREE.Vector3(), forward: new THREE.Vector3(), q: new THREE.Quaternion(),
    flutter: new THREE.Quaternion(), euler: new THREE.Euler(),
    flat: new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, FILM_YAW, 0, "YXZ")),
    cameraAt: new THREE.Vector3(), lookAt: new THREE.Vector3(), formAt: new THREE.Vector3(),
  }), []);

  /* The form: a superformula artifact of its own, grown from its sphere pose.
     Growth is written on the CPU, as BubbleViewer does, so the photo overlay —
     which shares the geometry — follows every vertex. */
  const artifact = useMemo(() => createArtifactGeometry(createArtifactForm()), []);
  const normals = useMemo(() => new Float32Array(artifact.rest.normals.length), [artifact]);
  useEffect(() => () => artifact.geometry.dispose(), [artifact]);
  const writeMorph = (m: number) => {
    const { rest, geometry } = artifact;
    const out = geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = out.array as Float32Array;
    const e = easeMorph(m);
    for (let i = 0; i < arr.length; i++) arr[i] = rest.sphere[i] + (rest.positions[i] - rest.sphere[i]) * e;
    out.needsUpdate = true;
    computeMeshNormals(arr, rest.index, normals);
    const n = geometry.getAttribute("normal") as THREE.BufferAttribute;
    (n.array as Float32Array).set(normals);
    n.needsUpdate = true;
    written.current = m;
  };

  const waves = useMemo(() => ({
    uTime: { value: 0 },
    uDrops: { value: Array.from({ length: POND_DROP_SLOTS }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uTrails: { value: Array.from({ length: POND_TRAIL_SLOTS }, () => new THREE.Vector4()) },
    uTrailControls: { value: Array.from({ length: POND_TRAIL_SLOTS }, () => new THREE.Vector4()) },
    uTrailTimes: { value: Array.from({ length: POND_TRAIL_SLOTS }, () => new THREE.Vector2(-99, 0)) },
  }), []);
  const under = useMemo(() => ({ value: 0 }), []);
  const water = useMemo(() => ({
    uWash: { value: 0 },
    uTint: { value: new THREE.Color("#a4b6be") },
    uTintAmount: { value: 0 },
    uClock: { value: 0 },
  }), []);
  const surfaceUniforms = useMemo(() => ({ ...waves, ...water }), [waves, water]);
  const volumeUniforms = useMemo(() => ({
    ...waves, ...water, uUnder: under,
    uInvProjection: { value: new THREE.Matrix4() },
    uCameraWorld: { value: new THREE.Matrix4() },
  }), [waves, water, under]);
  const filmUniforms = useMemo(() => ({
    ...waves,
    uPhoto: { value: null as THREE.Texture | null },
    uSize: { value: new THREE.Vector2(1, 1) },
    uImageAspect: { value: 1 },
    uEdgePrint: { value: createEdgePrint(1 + Math.floor(Math.random() * 36)) },
    uMorph: { value: 0 },
    uFloat: { value: 0 },
    uSink: { value: 0 },
    uCurl: { value: 0 },
    uFlex: { value: 0 },
    uSeed: { value: Math.random() * 10 },
    uDissolve: { value: 0 },
  }), [waves]);
  const motesUniforms = useMemo(() => ({
    uTime: waves.uTime, uUnder: under, uWash: water.uWash, uPixel: { value: gl.getPixelRatio() },
  }), [waves, water, under, gl]);
  const formUniforms = useMemo(() => ({
    ...water,
    uReveal: { value: 0 },
    uFrost: { value: 0 },
    uDye: { value: 0 },
    uAir: { value: 0 },
    uCore: { value: new THREE.Color(meshCoreFromOklch(DEFAULT_OKLCH)) },
    uRim: { value: new THREE.Color(rimFromOklch(DEFAULT_OKLCH)) },
  }), [water]);
  const particleUniforms = useMemo(() => ({
    uClock: { value: -1 },
    uPixel: { value: gl.getPixelRatio() },
    uSpeed: { value: new THREE.Vector2(SINK_SPEED[0], SINK_SPEED[1]) },
    uForm: { value: new THREE.Matrix4() },
  }), [gl]);
  const [particleGeometry, setParticleGeometry] = useState<THREE.BufferGeometry | null>(null);
  useEffect(() => () => particleGeometry?.dispose(), [particleGeometry]);

  /* Each grain: a vertex on the form's lit side, the photo pixel the overlay
     will show there, and where that pixel sits on the floating film. Few of
     them, kept apart, leaning toward the photo's darker parts — so the image
     stays faintly legible while it falls and the screen never fills. */
  const buildParticles = (filmMesh: THREE.Mesh, formMesh: THREE.Mesh, texture: THREE.Texture, size: THREE.Vector2) => {
    const photo = readPhoto(texture);
    const { rest } = artifact;
    const uv = buildPhotoUv(rest.sphere, MODEL_SPACE);
    const positions = formMesh.geometry.getAttribute("position").array as Float32Array;
    const start = new Float32Array(PARTICLE_COUNT * 3);
    const end = new Float32Array(PARTICLE_COUNT * 3);
    const color = new Float32Array(PARTICLE_COUNT * 3);
    const delay = new Float32Array(PARTICLE_COUNT);
    const weight = new Float32Array(PARTICLE_COUNT);
    const seed = new Float32Array(PARTICLE_COUNT);
    const p = new THREE.Vector3();
    filmMesh.updateMatrixWorld();
    const n = rest.vertexCount;
    const lumaAt = (u: number, w: number) => {
      if (!photo) return 0.5;
      const px = Math.min(photo.w - 1, Math.floor(u * photo.w));
      const py = Math.min(photo.h - 1, Math.floor((1 - w) * photo.h));
      const k = (py * photo.w + px) * 4;
      return (0.2126 * photo.data[k] + 0.7152 * photo.data[k + 1] + 0.0722 * photo.data[k + 2]) / 255;
    };
    // minimum spacing on the image, kept with a grid of occupied cells
    const spacing = Math.sqrt(0.785 / PARTICLE_COUNT) * 0.78;
    const cells = Math.ceil(1 / spacing);
    const taken = new Uint8Array(cells * cells);
    // vertices in a random order, so the first-come spacing has no bias
    const order = Array.from({ length: n }, (_, k) => k);
    for (let k = n - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [order[k], order[j]] = [order[j], order[k]]; }
    let i = 0;
    for (let o = 0; o < n && i < PARTICLE_COUNT; o++) {
      const v = order[o];
      // the overlay only shows on the hemisphere facing the camera
      if (rest.sphere[v * 3 + 2] < 0.05) continue;
      const u = uv[v * 2], w = uv[v * 2 + 1];
      const r = Math.hypot(u - 0.5, w - 0.5);
      if (r > 0.5) continue;
      const cell = Math.min(cells - 1, Math.floor(u * cells)) + Math.min(cells - 1, Math.floor(w * cells)) * cells;
      if (taken[cell]) continue;
      const luma = lumaAt(u, w);
      // darker parts of the image keep more of their grains
      if (Math.random() > 0.3 + 0.7 * (1 - luma) * (1 - luma)) continue;
      taken[cell] = 1;
      // on the strip: the frame window holds the photo's middle
      p.set((u - 0.5) * size.x * 0.75, (w - 0.5) * size.y * 0.66, 0.02).applyMatrix4(filmMesh.matrixWorld);
      start.set([p.x, p.y, p.z], i * 3);
      end.set([positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]], i * 3);
      // mid-fall the image should still be readable: its darks stay dark-ish, its lights pale
      const f = 0.5 + luma * 0.45;
      color.set([f * 0.97, f * 0.985, f], i * 3);
      // weight, skewed light
      const wt = Math.pow(Math.random(), 2.2);
      weight[i] = wt;
      // release: the upper edge first; a few grains in the first second or two, then more
      delay[i] = (1 - w) * 0.9 + Math.pow(Math.random(), 0.55) * (RELEASE_S - 0.9);
      seed[i] = Math.random();
      i++;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(start, 3));
    geometry.setAttribute("aStart", new THREE.BufferAttribute(start, 3));
    geometry.setAttribute("aEnd", new THREE.BufferAttribute(end, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
    geometry.setAttribute("aDelay", new THREE.BufferAttribute(delay, 1));
    geometry.setAttribute("aWeight", new THREE.BufferAttribute(weight, 1));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    geometry.setDrawRange(0, i);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50);
    setParticleGeometry(geometry);

    // the overlay the particles become: shares the form's geometry, hidden until they land
    formMesh.geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    // a little of the film's fade stays with it: less color, a touch more presence
    const material = createMemoryPhotoMaterial(texture, 0, { ...MEMORY_PHOTO_FILTER_DEFAULTS, saturate: 0.6, contrast: 1.06, opacity: 0.62 });
    const overlay = new THREE.Mesh(formMesh.geometry, material);
    overlay.scale.setScalar(1.012);
    overlay.renderOrder = 10;
    overlay.frustumCulled = false;
    formMesh.add(overlay);
    photoMaterial.current = material;
  };
  const motes = useMemo(() => {
    const count = 700;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 12;
      positions[i * 3 + 1] = -0.3 - Math.random() * 9;
      positions[i * 3 + 2] = -7 + Math.random() * 13;
      seeds[i] = Math.random();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    return geometry;
  }, []);

  const drop = (x: number, z: number, at: number, strength: number) => {
    waves.uDrops.value[dropIndex.current++ % POND_DROP_SLOTS].set(x, z, at, strength);
  };

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05) * SPEED;
    if (!document.hidden) time.current += dt;
    const t = time.current;
    waves.uTime.value = t;
    const s = stage.current;

    /* The camera, in order: still on the pond; down the descent path; drawn
       back for the wrap; up the rise path; still again, on the named memory. */
    const { cameraAt, lookAt, formAt } = scratch;
    formAt.copy(FORM_AT);
    if (riseAt.current !== null) {
      const k = Math.min(1, (t - riseAt.current) / RISE_S);
      const u = flowProgress(k, 0, 1);
      cameraAt.copy(RISE_PATH.getPoint(u));
      lookAt.copy(RISE_LOOK.getPoint(u));
      formAt.copy(RISE_FORM.getPoint(u));
      // carry the wrap's slow sink into the start of the rise, so there is no step
      const carry = 0.45 * (1 - smoothProgress(k, 0, 0.45));
      cameraAt.y -= carry;
      lookAt.y -= carry * 0.8;
      if (k >= 1 && !risen.current) { risen.current = true; onRisen(); }
    } else if (wrapAt.current !== null) {
      const k = flowProgress(t - wrapAt.current, 0, WRAP_MOVE_S);
      cameraAt.copy(DESCENT_PATH.getPoint(1)).lerp(WRAP_CAMERA, k);
      lookAt.copy(DESCENT_LOOK.getPoint(1)).lerp(WRAP_LOOK, k);
      formAt.lerp(WRAP_FORM_AT, k);
      // then the view sinks a little with the grains
      const sink = smoothProgress(t - wrapAt.current, WRAP_MOVE_S, WRAP_MOVE_S + WRAP_FALL_S) * 0.45;
      cameraAt.y -= sink;
      lookAt.y -= sink * 0.8;
    } else if (descentAt.current === null) {
      cameraAt.copy(POND_CAMERA);
      lookAt.copy(POND_LOOK);
    } else {
      const k = Math.min(1, (t - descentAt.current) / DESCENT_S);
      const u = flowProgress(k, 0, 1);
      cameraAt.copy(DESCENT_PATH.getPoint(u));
      lookAt.copy(DESCENT_LOOK.getPoint(u));
      if (k >= 1 && !reachedBottom.current) { reachedBottom.current = true; onUnder(); }
    }
    camera.position.copy(cameraAt);
    camera.lookAt(lookAt);
    camera.updateMatrixWorld();

    /* The water lets go of its color while the form is being handled, and
       takes it back as the form leaves. The color pick weathers it faintly. */
    const sm = smooth.current;
    const ease = (from: number, to: number, rate: number) => from + (to - from) * (1 - Math.exp(-rate * dt));
    // in with the form as it surfaces at the end of the descent; out again over the rise
    const washIn = descentAt.current === null ? 0 : smoothProgress(t - descentAt.current, WASH_IN_S[0], WASH_IN_S[1]);
    sm.wash = ease(sm.wash, riseAt.current !== null ? 0 : WATER_WASH * washIn, riseAt.current !== null ? 0.55 : 1.4);
    water.uWash.value = sm.wash;
    water.uClock.value = t;
    const colorStep = s.step === "color" || wrapAt.current !== null;
    sm.dye = ease(sm.dye, colorStep ? 1 : 0, 1.6);
    // the pick reaches the water as a faint, light tint — a cloud's worth, not a dye
    tint.set(oklchToHex({ l: Math.max(0.9, s.oklch.l), c: s.oklch.c * 0.7, h: s.oklch.h }));
    water.uTint.value.lerp(tint, 1 - Math.exp(-3 * dt));
    water.uTintAmount.value = ease(water.uTintAmount.value, colorStep ? 1 : 0, 1.4);
    volumeUniforms.uInvProjection.value.copy(camera.projectionMatrixInverse);
    volumeUniforms.uCameraWorld.value.copy(camera.matrixWorld);

    const camY = camera.position.y;
    under.value = 1 - smoothProgress(camY, -0.35, 0.05);
    if (glowRef.current) glowRef.current.style.opacity = String(1 - under.value);
    if (crossingRef.current) {
      const crossing = descentAt.current === null ? 0 : Math.exp(-((camY / 0.28) ** 2));
      crossingRef.current.style.opacity = String(crossing);
      crossingRef.current.style.backdropFilter = `blur(${(crossing * 14).toFixed(1)}px)`;
      crossingRef.current.style.setProperty("-webkit-backdrop-filter", `blur(${(crossing * 14).toFixed(1)}px)`);
    }

    const request = s.request;
    const mesh = film.current;
    if (request && mesh) {
      s.request = null;
      const persp = camera as THREE.PerspectiveCamera;
      const dir = scratch.v.set((request.cx / size.width) * 2 - 1, 1 - (request.cy / size.height) * 2, 0.5)
        .unproject(camera).sub(camera.position).normalize();
      camera.getWorldDirection(scratch.forward);
      const image = request.texture.image as { width: number; height: number };
      filmUniforms.uPhoto.value = request.texture;
      filmUniforms.uImageAspect.value = image.width / image.height;
      fall.current = {
        at: t,
        pos: camera.position.clone().addScaledVector(dir, START_DEPTH / dir.dot(scratch.forward)),
        quat: camera.quaternion.clone(),
        right: new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion),
        diameter: (request.diameter / size.height) * 2 * START_DEPTH * Math.tan(THREE.MathUtils.degToRad(persp.fov / 2)),
        width: FILM_LENGTH,
        height: FILM_WIDTH,
      };
      mesh.visible = true;
      onFallStart();
    }

    const f = fall.current;
    if (f && mesh) {
      const k = Math.min(1, (t - f.at) / FALL_S);
      const glide = flowProgress(k, 0, 1);
      const decay = (1 - k) ** 1.6;
      mesh.position.lerpVectors(f.pos, FILM_AT, glide);
      // it drops along its own curve: a breath of lift, then a soft landing
      mesh.position.y = THREE.MathUtils.lerp(f.pos.y, FILM_AT.y, smoothProgress(k, 0.08, 1))
        + (k < 1 / 2.2 ? 0.2 * Math.sin(Math.PI * k * 2.2) : 0);
      mesh.position.addScaledVector(f.right, 0.28 * Math.sin(k * Math.PI * 2.6) * decay);
      scratch.q.copy(f.quat).slerp(scratch.flat, smoothProgress(k, 0.05, 0.85));
      scratch.euler.set(0.55 * Math.sin(k * Math.PI * 2.6 + 0.9) * decay, 0, 0.4 * Math.sin(k * Math.PI * 2.6) * decay);
      mesh.quaternion.copy(scratch.q).multiply(scratch.flutter.setFromEuler(scratch.euler));
      const grow = smoothProgress(k, 0, 0.75);
      filmUniforms.uSize.value.set(
        THREE.MathUtils.lerp(f.diameter, f.width, grow),
        THREE.MathUtils.lerp(f.diameter, f.height, grow),
      );
      filmUniforms.uMorph.value = smoothProgress(k, 0.05, 0.6);
      // the strip springs into its curl as it opens, and flexes with the air
      filmUniforms.uCurl.value = smoothProgress(k, 0.2, 0.9) * (1 - 0.3 * filmUniforms.uFloat.value);
      filmUniforms.uFlex.value = 0.6 * Math.sin(k * Math.PI * 2.6 + 1.7) * decay * smoothProgress(k, 0.1, 0.4);
      if (k >= 1 && landedAt.current === null) {
        landedAt.current = t;
        drop(FILM_AT.x, FILM_AT.z, t, 1.6);
        drop(FILM_AT.x - f.width * 0.45, FILM_AT.z + f.height * 0.3, t + 0.12, 0.5);
        drop(FILM_AT.x + f.width * 0.4, FILM_AT.z - f.height * 0.35, t + 0.2, 0.4);
      }
    }

    if (landedAt.current !== null) {
      filmUniforms.uFloat.value = smoothProgress(t - landedAt.current, 0, 0.6);
      if (!settled.current && t - landedAt.current > SETTLE_S) { settled.current = true; onSettled(); }
    }

    if (settled.current && descentAt.current === null) {
      if (s.holding && !wasHolding.current) drop(FILM_AT.x, FILM_AT.z, t, 0.55);
      wasHolding.current = s.holding;
      hold.current = s.holding
        ? Math.min(1, hold.current + dt / HOLD_S)
        : Math.max(0, hold.current - dt / 0.5);
      filmUniforms.uSink.value = smoothProgress(hold.current, 0, 1);
      if (hold.current >= 1) {
        descentAt.current = t;
        drop(FILM_AT.x, FILM_AT.z, t, 1.1);
        onDescend();
      }
    }

    const hint = hintRef.current;
    if (hint && f) {
      scratch.v.set(FILM_AT.x, 0, FILM_AT.z + f.height / 2 + 0.35).project(camera);
      hint.style.transform = `translate(-50%, 0) translate(${((scratch.v.x * 0.5 + 0.5) * size.width).toFixed(1)}px, ${((-scratch.v.y * 0.5 + 0.5) * size.height).toFixed(1)}px)`;
    }

    /* The form. Its three signals follow the page's values with a little lag,
       the way the gesture pages smooth MediaPipe; growth is written to the
       geometry only when it has actually moved. */
    const body = form.current;
    if (body) {
      const reveal = descentAt.current === null ? 0
        : smoothProgress(t - descentAt.current, FORM_REVEAL_S[0], FORM_REVEAL_S[1]);
      formUniforms.uReveal.value = reveal;
      body.visible = reveal > 0.001;
      sm.morph = ease(sm.morph, s.morph, 7);
      sm.frost = ease(sm.frost, s.frost, 7);
      if (Math.abs(sm.morph - written.current) > 0.0015) writeMorph(sm.morph);
      formUniforms.uFrost.value = sm.frost;
      formUniforms.uDye.value = sm.dye;
      // lighter and quieter than the editor's core tint, to sit on the paper
      formUniforms.uCore.value.lerp(tint.set(meshCoreFromOklch({ ...s.oklch, l: Math.min(0.92, s.oklch.l + 0.05), c: s.oklch.c * 0.8 })), 1 - Math.exp(-4 * dt));
      formUniforms.uRim.value.lerp(tint.set(rimFromOklch(s.oklch)), 1 - Math.exp(-4 * dt));
      formUniforms.uAir.value = 1 - smoothProgress(-formAt.y, -0.2, 0.3);
      const bob = riseAt.current !== null && risen.current ? Math.sin(t * 0.9) * 0.03 : Math.sin(t * 0.6) * 0.05;
      body.position.set(formAt.x, formAt.y + bob, formAt.z);
      body.scale.setScalar(0.9 * (0.86 + 0.14 * reveal));
      // it turns slowly; for the wrap it comes round to face the light, and holds
      if (wrapAt.current !== null && riseAt.current === null) {
        const home = Math.round(body.rotation.y / (Math.PI * 2)) * Math.PI * 2;
        body.rotation.y = ease(body.rotation.y, home, 2.2);
      } else body.rotation.y += dt * (risen.current ? 0.08 : 0.15);
      body.updateMatrixWorld();
    }

    /* The wrap: the film lets go of its image from the top down; the particles
       sink and gather on the form; the overlay then takes over from them. */
    if (s.wrap && wrapAt.current === null && mesh && body && filmUniforms.uPhoto.value) {
      wrapAt.current = t;
      buildParticles(mesh, body, filmUniforms.uPhoto.value, filmUniforms.uSize.value);
    }
    if (wrapAt.current !== null && !wrapped.current) {
      // seconds since the film began to let go
      const clock = t - wrapAt.current - WRAP_MOVE_S * 0.5;
      particleUniforms.uClock.value = clock;
      // the emulsion goes with its grains: thin at first, then the rest, a little after the release
      filmUniforms.uDissolve.value = Math.min(1.2, Math.max(0, clock + 0.3) / (RELEASE_S + 1.2) * 1.2);
      if (body) particleUniforms.uForm.value.copy(body.matrixWorld);
      // the heavy grains arrive patchily; the print fades in beneath them and fills the gaps
      setMemoryPhotoFade(photoMaterial.current, smoothProgress(clock, 2.4, 6.0));
      if (clock >= WRAP_FALL_S) { wrapped.current = true; if (mesh) mesh.visible = false; onWrapped(); }
    } else if (body) particleUniforms.uForm.value.copy(body.matrixWorld);

    /* The rise. The surface breaks once, where the form comes up through it. */
    if (s.rise && riseAt.current === null && wrapped.current) riseAt.current = t;
    if (riseAt.current !== null && !broke.current && body && body.position.y > -0.05) {
      broke.current = true;
      drop(body.position.x, body.position.z, t, 1.5);
      drop(body.position.x + 0.5, body.position.z + 0.3, t + 0.25, 0.5);
      drop(body.position.x - 0.4, body.position.z - 0.3, t + 0.4, 0.4);
    }

    /* The caption sits under the memory, wherever it has floated to. */
    const caption = captionRef.current;
    if (caption && body) {
      scratch.v.copy(body.position).add(scratch.forward.set(0, -0.78 * body.scale.x - 0.25, 0)).project(camera);
      caption.style.transform = `translate(-50%, 0) translate(${((scratch.v.x * 0.5 + 0.5) * size.width).toFixed(1)}px, ${((-scratch.v.y * 0.5 + 0.5) * size.height).toFixed(1)}px)`;
    }
  });

  return <>
    <mesh frustumCulled={false} renderOrder={-10}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial name="volume" transparent depthTest={false} depthWrite={false}
        vertexShader={volumeVertex} fragmentShader={volumeFragment} uniforms={volumeUniforms} />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -900]} renderOrder={0}>
      <planeGeometry args={[2000, 2000]} />
      <shaderMaterial name="surface" transparent depthTest={false} depthWrite={false} side={THREE.DoubleSide}
        vertexShader={waterVertex} fragmentShader={waterFragment} uniforms={surfaceUniforms} />
    </mesh>
    <mesh ref={film} visible={false} renderOrder={2} frustumCulled={false}>
      <planeGeometry args={[1, 1, 64, 48]} />
      <shaderMaterial name="film" transparent depthTest={false} depthWrite={false} side={THREE.DoubleSide}
        vertexShader={filmVertex} fragmentShader={filmFragment} uniforms={filmUniforms} />
    </mesh>
    <points geometry={motes} renderOrder={3} frustumCulled={false}>
      <shaderMaterial name="motes" transparent depthTest={false} depthWrite={false}
        vertexShader={motesVertex} fragmentShader={motesFragment} uniforms={motesUniforms} />
    </points>
    <mesh ref={form} visible={false} renderOrder={4} geometry={artifact.geometry} frustumCulled={false}>
      <shaderMaterial name="form" transparent depthTest={false} depthWrite={false}
        vertexShader={formVertex} fragmentShader={formFragment} uniforms={formUniforms} />
    </mesh>
    {particleGeometry && (
      <points ref={particles} geometry={particleGeometry} renderOrder={6} frustumCulled={false}>
        <shaderMaterial name="particles" transparent depthTest={false} depthWrite={false}
          vertexShader={particleVertex} fragmentShader={particleFragment} uniforms={particleUniforms} />
      </points>
    )}
  </>;
}

/** Growth eases in and out, so a hand's first and last inch do little. */
const easeMorph = (m: number) => m * m * (3 - 2 * m);

/** Words set against the washed water, which is paper by then: the chrome grey. */
const UNDER_INK = CHROME_GRAY;

const STEP_COPY: Record<Step, { title: string; lines: [string, string]; hint: string }> = {
  shape: {
    title: "shape",
    lines: ["each memory already has a shape.", "open your hands, and let these words find theirs."],
    hint: "drag across to grow it",
  },
  distance: {
    title: "distance",
    lines: ["time blurs the edges, not the feeling.", "a faded memory can hold more."],
    hint: "drag across to let it mist over",
  },
  color: {
    title: "color",
    lines: ["remembering dyes what happened.", "how does it feel, returning to it today?"],
    hint: "",
  },
};

const loader = new THREE.TextureLoader();

function DescentRun({ onAgain }: { onAgain: () => void }) {
  const stage = useRef<StageState>({
    request: null, holding: false, step: null,
    morph: 0, frost: 0, oklch: DEFAULT_OKLCH, wrap: false, rise: false,
  });
  const hostRef = useRef<HTMLDivElement>(null);
  const crossingRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("choose");
  const [loading, setLoading] = useState<string | null>(null);
  const [lifted, setLifted] = useState<string | null>(null);
  const [morph, setMorph] = useState(0);
  const [frost, setFrost] = useState(0);
  const [colorUv, setColorUv] = useState(() => uvFromOklch(DEFAULT_OKLCH));
  const [memoryName, setMemoryName] = useState("");
  const [year, setYear] = useState("");
  const drag = useRef<{ x: number; from: number } | null>(null);

  const step: Step | null = phase === "shape" || phase === "distance" || phase === "color" ? phase : null;
  stage.current.step = step;

  useEffect(() => {
    if (phase === "naming") nameRef.current?.focus();
  }, [phase]);

  const setSignal = (value: number) => {
    const v = Math.min(1, Math.max(0, value));
    if (phase === "shape") { stage.current.morph = v; setMorph(v); }
    else if (phase === "distance") { stage.current.frost = v; setFrost(v); }
  };
  const continueStep = () => {
    if (phase === "shape") setPhase("distance");
    else if (phase === "distance") setPhase("color");
    else if (phase === "color") { stage.current.wrap = true; setPhase("wrapping"); }
  };
  const currentYear = new Date().getFullYear();
  const yearSettled = year.length === 4 && Number(year) <= currentYear;
  const canSave = phase === "naming" && memoryName.trim() !== "" && yearSettled;

  const pick = async (url: string, button: HTMLElement) => {
    if (phase !== "choose" || loading) return;
    setLoading(url);
    const rect = button.getBoundingClientRect();
    const host = hostRef.current?.getBoundingClientRect();
    try {
      const texture = await loader.loadAsync(url);
      stage.current.request = {
        texture,
        cx: rect.left + rect.width / 2 - (host?.left ?? 0),
        cy: rect.top + rect.height / 2 - (host?.top ?? 0),
        diameter: rect.width,
      };
      setLifted(url);
    } catch {
      setLoading(null);
    }
  };

  const setHolding = (holding: boolean) => { stage.current.holding = holding; };
  const itemSize = "clamp(96px, 11vw, 136px)";

  return (
    <main ref={hostRef} style={{ position: "relative", width: "100%", height: "100dvh", overflow: "hidden",
      background: "linear-gradient(#ededE8, #e2e6e2 42%, #b6c8c3)" }}>
      <Canvas camera={{ fov: 48, near: 0.1, far: 2400, position: POND_CAMERA.toArray() }}
        dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }} style={{ position: "absolute", inset: 0 }}>
        <Stage stage={stage} crossingRef={crossingRef} glowRef={glowRef} hintRef={hintRef} captionRef={captionRef}
          onFallStart={() => setPhase("falling")}
          onSettled={() => setPhase("floating")}
          onDescend={() => setPhase("descending")}
          onUnder={() => setPhase("shape")}
          onWrapped={() => { stage.current.rise = true; setPhase("rising"); }}
          onRisen={() => setPhase("naming")} />
      </Canvas>
      <div ref={glowRef} aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at 48% 24%, #fff9, transparent 58%)" }} />
      <div ref={crossingRef} aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0,
        background: "rgba(232, 238, 236, 0.35)" }} />

      <p style={{ ...META, position: "absolute", top: 26, left: 28, margin: 0, zIndex: 20 }}>lab — descent</p>

      <div style={{ position: "absolute", left: "50%", top: 171, transform: "translateX(-50%)", width: "min(28em, 90vw)",
        textAlign: "center", pointerEvents: "none", opacity: phase === "choose" ? 1 : 0, transition: "opacity 700ms ease" }}>
        <p style={{ ...TITLE, margin: 0, color: CHROME_GRAY }}>a photo that holds this memory</p>
        <p style={{ margin: "10px 0 0", fontFamily: SERIF, fontSize: NOTE_SIZE, lineHeight: 1.45, color: CHROME_GRAY }}>
          it will rest on the water.
        </p>
      </div>

      <div role="listbox" aria-label="photo library" style={{ position: "absolute", left: 0, right: 0, bottom: 28,
        display: "flex", justifyContent: "center", gap: "clamp(18px, 2.4vw, 32px)", padding: "18px max(28px, 5vw)",
        opacity: phase === "choose" ? 1 : 0, transition: "opacity 500ms ease 150ms",
        pointerEvents: phase === "choose" ? "auto" : "none", zIndex: 10 }}>
        {PHOTOS.map((url) => (
          <button key={url} type="button" role="option" aria-selected={lifted === url} aria-label="select photo"
            onClick={(e) => void pick(url, e.currentTarget)}
            style={{ width: itemSize, height: itemSize, flex: `0 0 ${itemSize}`, padding: 0, overflow: "hidden",
              borderRadius: "50%", border: "1px solid rgba(123, 123, 135, 0.25)", background: "#e7e7e8",
              boxShadow: "0 10px 30px rgba(40, 36, 48, 0.12)", cursor: "pointer",
              visibility: lifted === url ? "hidden" : "visible" }}>
            <img src={url} alt="" style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} />
          </button>
        ))}
        <input ref={inputRef} type="file" accept="image/*" aria-label="choose a photo" style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            const button = inputRef.current?.nextElementSibling as HTMLElement | null;
            if (file && button) void pick(URL.createObjectURL(file), button);
          }} />
        <button type="button" aria-label="add a photo from this device" onClick={() => inputRef.current?.click()}
          style={{ width: itemSize, height: itemSize, flex: `0 0 ${itemSize}`, borderRadius: "50%", border: "none",
            background: "rgba(123, 123, 135, 0.72)", color: "rgba(255, 255, 255, 0.9)", fontFamily: SERIF,
            fontSize: "clamp(42px, 5vw, 64px)", fontWeight: 200, lineHeight: 1, cursor: "pointer",
            visibility: lifted && !PHOTOS.includes(lifted) ? "hidden" : "visible" }}>
          ＋
        </button>
      </div>

      {phase === "floating" && (
        <button type="button" aria-label="hold to go under" aria-describedby="descent-hint"
          onPointerDown={(e) => { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); setHolding(true); }}
          onPointerUp={() => setHolding(false)}
          onPointerCancel={() => setHolding(false)}
          onLostPointerCapture={() => setHolding(false)}
          onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); setHolding(true); } }}
          onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setHolding(false); } }}
          onContextMenu={(e) => e.preventDefault()}
          autoFocus
          style={{ position: "absolute", inset: 0, border: "none", outline: "none", background: "transparent",
            touchAction: "none", cursor: "default", zIndex: 5 }} />
      )}
      <div ref={hintRef} id="descent-hint" aria-hidden style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none",
        whiteSpace: "nowrap", fontFamily: SANS, fontSize: INSTRUCTION_SIZE, color: CHROME_GRAY, zIndex: 6,
        opacity: phase === "floating" ? 1 : 0, filter: phase === "floating" ? "none" : "blur(6px)",
        transition: "opacity 720ms ease, filter 720ms ease" }}>
        hold to go under
      </div>

      {/* ── the three steps, under the water ── */}
      {step && step !== "color" && (
        <div role="slider" aria-label={`${step} — drag across`} aria-valuenow={Math.round((step === "shape" ? morph : frost) * 100)}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic events have no pointer to capture */ }
            drag.current = { x: e.clientX, from: step === "shape" ? morph : frost };
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            setSignal(drag.current.from + (e.clientX - drag.current.x) / (window.innerWidth * 0.45));
          }}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
          style={{ position: "absolute", inset: 0, zIndex: 5, touchAction: "none", cursor: "ew-resize" }} />
      )}
      {step === "color" && (
        <>
          {/* a pale veil under the wash, so the band reads as light on the paper rather than a strip */}
          <div aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "30vh", zIndex: 9, pointerEvents: "none",
            background: "linear-gradient(to bottom, rgba(236,237,238,0) 0%, rgba(236,237,238,.55) 45%, rgba(236,237,238,.7) 100%)" }} />
          <OklchColorField u={colorUv.u} v={colorUv.v}
            onPick={({ u, v, color }) => { setColorUv({ u, v }); stage.current.oklch = color; }} />
        </>
      )}
      {step && (
        <>
          <div style={{ position: "absolute", left: "50%", top: 100, transform: "translateX(-50%)", textAlign: "center",
            width: "min(28em, 90vw)", pointerEvents: "none", zIndex: 6, animation: "descentStepIn 900ms ease backwards" }}
            key={step}>
            <p style={{ ...TITLE, margin: 0, color: UNDER_INK }}>{STEP_COPY[step].title}</p>
            <p style={{ margin: "14px 0 0", fontFamily: SERIF, fontSize: INSTRUCTION_SIZE, lineHeight: 1.45, color: UNDER_INK }}>
              {STEP_COPY[step].lines[0]}<br />{STEP_COPY[step].lines[1]}
            </p>
            {STEP_COPY[step].hint && (
              <p style={{ margin: "26px 0 0", fontFamily: SANS, fontSize: NOTE_SIZE, color: UNDER_INK, opacity: 0.7 }}>
                {STEP_COPY[step].hint}
              </p>
            )}
          </div>
          <PillButton label="continue" trailing="›" onClick={continueStep}
            style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: step === "color" ? "calc(24vh + 28px)" : 40, zIndex: 30 }} />
        </>
      )}

      {/* ── the caption: typed while the memory floats, then left as words ── */}
      <div ref={captionRef} style={{ position: "absolute", top: 0, left: 0, zIndex: 8, display: "flex", flexDirection: "column",
        alignItems: "center", opacity: phase === "naming" || phase === "saved" ? 1 : 0, transition: "opacity 900ms ease",
        pointerEvents: phase === "naming" ? "auto" : "none" }}>
        <div style={{ marginBottom: CAPTION_TITLE_GAP }}>
          {phase === "saved" ? <p style={CAPTION_TITLE_STYLE}>{memoryName}</p> : (
            <input ref={nameRef} value={memoryName} onChange={(e) => setMemoryName(e.target.value)} placeholder="name this memory..."
              aria-label="memory name" className="descent-field" style={{ ...CAPTION_TITLE_STYLE, width: "16em" }} />
          )}
        </div>
        {phase === "saved" ? <p style={CAPTION_YEAR_STYLE}>{year}</p> : (
          <input value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="year"
            inputMode="numeric" maxLength={4} aria-label="year" className="descent-field"
            onKeyDown={(e) => { if (e.key === "Enter" && canSave) setPhase("saved"); }}
            style={{ ...CAPTION_YEAR_STYLE, width: "6em" }} />
        )}
        <TextButton label="save memory" onClick={() => setPhase("saved")} disabled={!canSave}
          style={{ position: "absolute", top: "100%", marginTop: 48, opacity: canSave ? 1 : 0, transition: "opacity 400ms ease" }} />
      </div>

      <style>{`
        @keyframes descentStepIn { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        .descent-field { background: transparent; border: none; outline: none; padding: 0; }
        .descent-field::placeholder { color: inherit; opacity: .35; font-style: inherit; }
      `}</style>

      {phase !== "choose" && (
        <TextButton label="again" onClick={onAgain}
          style={{ position: "absolute", left: 28, bottom: 28, zIndex: 20, color: phase === "descending" ? "#e8eeec" : "#7b7b87",
            transition: "color 600ms ease" }} />
      )}
    </main>
  );
}

/** /lab/descent — photo onto the water, and down through it. */
export function DescentPrototype() {
  const [run, setRun] = useState(0);
  return <DescentRun key={run} onAgain={() => setRun((r) => r + 1)} />;
}
