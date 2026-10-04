import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { useNavigate } from "react-router";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CHROME_GRAY } from "../lib/colors";
import { CAROUSEL_PATH } from "../lib/routes";
import { saveMemory } from "../lib/memoryStore";
import {
  createGestureGate,
  handCenter,
  handOpenness,
  landmarkDistance,
  useHandTracking,
} from "../hooks/useHandTracking";
import { GestureHint } from "../components/GestureHint";
import { MATERIAL_PRESETS } from "../components/SceneViewer";
import { draftColorIndex } from "../components/NamingRim";
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
} from "../components/MemoryPhotoLayer";
import { createArtifactGeometry } from "../hooks/useArtifactGeometry";
import { computeMeshNormals, createArtifactForm, type ArtifactForm } from "../lib/superformula";
import { DEFAULT_OKLCH, meshCoreFromOklch, oklchToHex, rimFromOklch, sampleField, uvFromOklch, type Oklch } from "../lib/oklch";
import { FILM_LOOK_GLSL, filmLookUniforms, prepareFilmPhoto } from "../lib/filmLook";
import { SHEET_GLSL, STRIP_FACE_GLSL, STRIP_GLSL, STRIP_MM, createEdgePrint, sheetUniforms } from "./filmStrip";
import {
  CLOUD_KNOBS, CLOUD_TRACKS, CLOUD_TUNE_DEFAULT, buildCloudGeometry, cloudPhaseBlocks, createCloudMaterial, createCloudUniforms,
  setCloudUniforms, type CloudTune, type PhaseBlock, type TuneKnob,
} from "./wrapCloud";
import photoA from "../../assets/memory-photo.jpg";
import photoB from "../../assets/memory-photo-02.png";

/*
 * Lab: the whole shot from the photo to the named memory, in one canvas.
 *
 * The photo falls onto the pond as a strip of film and floats; the view sinks
 * through it into the water, where the form surfaces and is shaped (shape,
 * distance, color — pointer-driven here, the same three signals the gesture
 * pages produce). On confirm the view draws back, the film's emulsion lets
 * go, and the photo develops on the form — darks first, as on paper in the
 * tray; the form then rises, breaks the surface, and is named where it
 * floats. (With `?cloud=1` the photo instead leaves the film as a point
 * cloud that falls onto the form — `wrapCloud.ts`, kept out of the shot.)
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
const FILM_LENGTH = 2.0;
const FILM_WIDTH = FILM_LENGTH * STRIP_MM.width / STRIP_MM.length;
/** While a photo is chosen the empty strip hangs this far in front of the lens. */
const CHOOSE_DEPTH = 3.7;
/** It surfaces grain by grain over the first moments of the page. */
const EMERGE_S: [number, number] = [0.2, 2.0];
/** The chosen photo develops into the window, and the strip is let go a beat later. */
const DEVELOP_S = 1.4;
const LET_GO_S = 2.1;
const FALL_S = 3.0;
const SETTLE_S = 0.9;
const HOLD_S = 1.1;
const DESCENT_S = 6.2;
const FORM_AT = new THREE.Vector3(0, -5, -1.2);
const FORM_REVEAL_S: [number, number] = [3.9, 7];
/** How far the water gives way to paper while the form is being handled. */
const WATER_WASH = 1.0;
/** The wash comes in as the form surfaces out of the water, seconds into the descent. */
const WASH_IN_S: [number, number] = [4.6, 9.0];

/* The wrap: the view draws back and tilts up so the film overhead and the
   form below are both in frame, and the form lifts a little toward the light;
   the film's emulsion lets go and the print develops on the form. Everything
   about the wrap that is a matter of judgement is a knob here, live on the
   lab's panel; these are the values it opens with. Write back what the
   sliders settle on. The point cloud (the photo leaving the film as points
   that fall onto the form) is kept whole in `wrapCloud.ts` and is **not part
   of the shot** unless `?cloud=1` is on the URL; its knobs extend these. */
interface WrapTune extends CloudTune {
  // framing: the camera and its look while the print develops; the form's seat (formZ under the film, which rests at z 2);
  // how far the view sinks over the wrap
  cameraY: number; cameraZ: number; lookY: number; lookZ: number; formY: number; formZ: number; viewSink: number;
  // the view turned about the look point, in degrees — to watch the fall from another side; the shot itself does not change
  orbitYaw: number; orbitPitch: number;
  // the rise has its own turn: taken up over the first part of the rise, held while the form is in the water,
  // and let go between riseViewUntil and riseViewBack (fractions of the rise) as it comes up to the pond view
  riseYaw: number; risePitch: number; riseViewUntil: number; riseViewBack: number;
  /** How much the form grows for the wrap, as a fraction of its size: .3 is 1.3× across, ~2.2× the volume. */
  grow: number;
  /** Seen from under the water the film is backlit; this is how much of its image still shows (was .42). */
  filmBelow: number;
  // timing: the emulsion lets go over releaseS (the cloud's release spread is fixed when it is built — on "again"); the wrap ends at fallS
  releaseS: number; fallS: number;
  // the print develops on the form over overlayIn…overlayOut (seconds after the emulsion begins to let go):
  // the darks lead by developDarks, the top of the image by developSweep, each part coming up over developSoft
  overlayIn: number; overlayOut: number; developDarks: number; developSweep: number; developSoft: number;
}
const WRAP_TUNE_DEFAULT: WrapTune = {
  ...CLOUD_TUNE_DEFAULT,
  cameraY: -3.0, cameraZ: 8.6, lookY: -1.1, lookZ: 2.0, formY: -2.8, formZ: 2.0, viewSink: 0.45,
  orbitYaw: 0, orbitPitch: 0,
  riseYaw: -18, risePitch: -49, riseViewUntil: 0.45, riseViewBack: 0.85,
  grow: 0.3,
  filmBelow: 0.6,
  releaseS: 2.2, fallS: 8.0,
  overlayIn: 3.2, overlayOut: 7.0, developDarks: 0.8, developSweep: 0.6, developSoft: 0.35,
};
/* The transport: pause, speed, and a seek along the wrap and the rise. The
   page writes `paused`, `speed` and `seek`; the stage reads them each frame
   and writes back `shot` (seconds since confirm), `length`, and whether the
   shot has reached the wrap at all. Only the wrap and the rise can be
   scrubbed — before them the shot latches state (the fall, the hold, the
   descent) that is not worth unwinding. */
interface Transport {
  paused: boolean;
  speed: number;
  /** Seconds since confirm to jump to; the stage clears it once taken. */
  seek: number | null;
  shot: number;
  length: number;
  active: boolean;
}
const WRAP_CAMERA = new THREE.Vector3(0, WRAP_TUNE_DEFAULT.cameraY, WRAP_TUNE_DEFAULT.cameraZ);
const WRAP_LOOK = new THREE.Vector3(0, WRAP_TUNE_DEFAULT.lookY, WRAP_TUNE_DEFAULT.lookZ);
const WRAP_FORM_AT = new THREE.Vector3(0, WRAP_TUNE_DEFAULT.formY, WRAP_TUNE_DEFAULT.formZ);
const WRAP_MOVE_S = 2.2;
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

/* Lab switches on the URL. ?speed=0.25 plays the whole shot at quarter speed.
   ?from=wrap opens on the wrap itself — the photo already on the film, the
   descent done, the form surfaced and handled, confirm just pressed — so the
   grains can be judged without the minute before them; "again" replays from
   the same place. With it, ?photo=0|1 picks the still and ?morph= / ?frost=
   (0–1) set how the form was shaped and misted. */
const PARAMS = new URLSearchParams(window.location.search);
const SPEED = Number(PARAMS.get("speed")) || 1;
const FROM: "wrap" | null = PARAMS.get("from") === "wrap" ? "wrap" : null;
/** `?cloud=1`: the photo leaves the film as a point cloud (`wrapCloud.ts`). Off by default — not part of the shot. */
const CLOUD = PARAMS.get("cloud") === "1";
const toggleCloud = () => {
  const url = new URL(window.location.href);
  if (CLOUD) url.searchParams.delete("cloud"); else url.searchParams.set("cloud", "1");
  window.location.assign(url.toString());
};
const unitParam = (key: string) => {
  const v = Number(PARAMS.get(key));
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
};
const PREVIEW_PHOTO = PHOTOS[Math.min(PHOTOS.length - 1, Math.max(0, Math.floor(Number(PARAMS.get("photo") ?? 1)) || 0))];
const PREVIEW_MORPH = unitParam("morph");
const PREVIEW_FROST = unitParam("frost");

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

/* The strip as the film lab draws it (FilmPreview, filmStrip.ts, filmLook.ts):
   a translucent sheet of pale stock whose thickness is not even, torn ends and
   a worn, light-catching edge, the photo developed through filmLook and laid
   in the window as dye at less than full cover, its frame fading into the
   stock. Geometry is in mm so the perforations keep the real 35mm pitch. On
   top of that, what only the shot needs: the develop (darks first), the
   dissolve into grains, the sheen where the curl catches the sky, and the
   backlit face seen from under the water. */
const filmFragment = /* glsl */ `
  ${STRIP_GLSL}
  ${FILM_LOOK_GLSL}
  ${SHEET_GLSL}
  ${STRIP_FACE_GLSL}
  uniform sampler2D uPhoto;
  uniform sampler2D uEdgePrint;
  uniform vec2 uSize;
  uniform float uImageAspect;
  uniform float uFloat;
  uniform float uSeed;
  uniform float uDissolve;
  uniform float uBelow;
  uniform float uDevelop;
  varying vec2 vLocal;
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vec2 toWorld = uSize / STRIP;
    vec2 mm = vLocal / toWorld;

    // the torn outline, worn and scuffed, the perforations cut (filmStrip.ts)
    float d = stripTornOutline(mm, uSeed);
    float dh = stripHole(mm);
    float alpha = stripCoverage(mm, uSeed, d, dh, 1.0);
    // the dissolve: the emulsion lets go in a drifting grain, image first
    float grain = filmNoise(mm * vec2(.9, 1.6) + uSeed * 5.0) * .7 + filmNoise(mm * 4.0) * .3;
    float gone = 1.0 - smoothstep(uDissolve - .3, uDissolve, grain * .8 + .1);
    alpha *= 1.0 - gone;
    if (alpha < .01) discard;

    // the face: stock, the photo developing into the window as dye, the cut edge, the edge print
    vec3 color;
    float a;
    stripFace(mm, uSeed, d, dh, sheetWindow(mm, uSeed), uPhoto, uImageAspect, 0.0, uEdgePrint, uDevelop, color, a);

    // a soft sheen where the curl catches the sky, nothing glossy
    vec3 n = normalize(vNormal);
    vec3 eye = normalize(cameraPosition - vWorld);
    if (dot(n, eye) < 0.0) n = -n;
    float sheen = pow(max(0.0, dot(reflect(-eye, n), normalize(vec3(-.3, .8, -.5)))), 18.0);
    color = color * (.92 + .08 * n.y) + sheen * .16;
    color *= mix(1.0, .965, uFloat);
    if (!gl_FrontFacing) {
      // from under the water the film is backlit, light coming through it; uBelow is how much of the image survives that
      color = mix(vec3(.92, .95, .94), color * 1.05, uBelow);
    }
    gl_FragColor = vec4(color, alpha * clamp(a, 0.0, 1.0));
  }
`;

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

/* The touch. While the form is being handled the frame is drawn once more
   through the water near the hands: a soft lens gathers around each hand and
   bends what is behind it — the form's edge, the motes, the light — the way a
   glass vessel bends when a hand reaches for it under water. A moving hand
   leaves a wake that trails it; the disturbance shimmers; at its thickest the
   light splits by a hair. Nothing is added to the scene, only its light bent. */
const touchVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;
const touchFragment = /* glsl */ `
  uniform sampler2D tScene;
  uniform vec2 uHand[2];
  uniform vec2 uWake[2];
  uniform float uPress[2];
  uniform float uAspect;
  uniform float uTime;
  uniform float uAmount;
  varying vec2 vUv;
  float touchHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float touchNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(touchHash(i), touchHash(i + vec2(1, 0)), f.x),
               mix(touchHash(i + vec2(0, 1)), touchHash(i + vec2(1, 1)), f.x), f.y);
  }
  void main() {
    vec2 aspect = vec2(uAspect, 1.0);
    vec2 shift = vec2(0.0);
    float near = 0.0;
    for (int i = 0; i < 2; i++) {
      float press = uPress[i];
      if (press < .002) continue;
      vec2 d = (vUv - uHand[i]) * aspect;
      float r2 = dot(d, d);
      // the lens: strongest a hand's width out from the centre, where the water is pushed aside
      float lens = exp(-r2 / .034);
      shift -= d * lens * .18 * press;
      // the wake: wider and softer, trailing the hand's motion
      float wake = exp(-r2 / .09);
      shift -= uWake[i] * wake * press;
      // the surface of the disturbance is never still
      vec2 shimmer = vec2(
        touchNoise(d * 5.0 + vec2(uTime * .7, -uTime * .5)),
        touchNoise(d * 5.0 + 3.1 - uTime * .6)) - .5;
      shift += shimmer * lens * .012 * press;
      near = max(near, lens * press);
    }
    shift = shift / aspect * uAmount;
    near *= uAmount;
    vec4 c = texture2D(tScene, vUv + shift);
    // the light splits by a hair where the water is thickest
    float split = near * .1;
    c.r = texture2D(tScene, vUv + shift * (1.0 + split)).r;
    c.b = texture2D(tScene, vUv + shift * (1.0 - split)).b;
    // and the gathered water catches a touch more light
    c.rgb += near * .02;
    gl_FragColor = c;
  }
`;

/** What the window holds before a photo: a single pale texel. */
const BLANK_PHOTO = (() => {
  const texture = new THREE.DataTexture(new Uint8Array([236, 239, 239, 255]), 1, 1);
  texture.needsUpdate = true;
  return texture;
})();

/** The photo chosen for the strip hanging in front of the view. */
interface FallRequest {
  texture: THREE.Texture;
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
  /** Where the hands are over the frame (0–1, y up) — the camera's, or the
      pointer standing in for them. The water is bent around them. */
  hands: { x: number; y: number }[];
  /** Set once by the page to begin the wrap, then the rise. */
  wrap: boolean;
  rise: boolean;
}

interface StageProps {
  stage: RefObject<StageState>;
  /** Assigned by the page when the run starts, so the page can save it. */
  form: ArtifactForm;
  /** "wrap" opens on the wrap, the shot before it taken as done. */
  from: "wrap" | null;
  /** The wrap's knobs, read every frame; the panel writes them. */
  tune: RefObject<WrapTune>;
  transport: RefObject<Transport>;
  crossingRef: RefObject<HTMLDivElement | null>;
  glowRef: RefObject<HTMLDivElement | null>;
  hintRef: RefObject<HTMLDivElement | null>;
  /** The button laid over the hanging strip; kept on it as it sways. */
  pickRef: RefObject<HTMLButtonElement | null>;
  captionRef: RefObject<HTMLDivElement | null>;
  onFallStart: () => void;
  onSettled: () => void;
  onDescend: () => void;
  onUnder: () => void;
  onWrapped: () => void;
  onRisen: () => void;
  /** A seek has taken the shot back to before the wrap ended, or before the rise ended. */
  onRewound: (to: "wrapping" | "rising") => void;
}

function Stage({ stage, form: artifactForm, from, tune, transport, crossingRef, glowRef, hintRef, pickRef, captionRef, onFallStart, onSettled, onDescend, onUnder, onWrapped, onRisen, onRewound }: StageProps) {
  const { camera, size, gl } = useThree();
  const time = useRef(0);
  const jumped = useRef(false);
  const dropIndex = useRef(0);
  const fall = useRef<{
    at: number; pos: THREE.Vector3; quat: THREE.Quaternion; right: THREE.Vector3;
    width: number; height: number;
  } | null>(null);
  const developAt = useRef<number | null>(null);
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
  const touches = useRef([
    { at: new THREE.Vector2(-10, -10), wake: new THREE.Vector2(), press: 0 },
    { at: new THREE.Vector2(-10, -10), wake: new THREE.Vector2(), press: 0 },
  ]);
  const tint = useMemo(() => new THREE.Color(), []);
  const scratch = useMemo(() => ({
    v: new THREE.Vector3(), forward: new THREE.Vector3(), q: new THREE.Quaternion(),
    flutter: new THREE.Quaternion(), euler: new THREE.Euler(),
    flat: new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, FILM_YAW, 0, "YXZ")),
    cameraAt: new THREE.Vector3(), lookAt: new THREE.Vector3(), formAt: new THREE.Vector3(),
    wrapCamera: WRAP_CAMERA.clone(), wrapLook: WRAP_LOOK.clone(), wrapForm: WRAP_FORM_AT.clone(),
  }), []);

  /* The form: a superformula artifact of its own, grown from its sphere pose.
     Growth is written on the CPU, as BubbleViewer does, so the photo overlay —
     which shares the geometry — follows every vertex. */
  const artifact = useMemo(() => createArtifactGeometry(artifactForm), [artifactForm]);
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
  const filmUniforms = useMemo(() => {
    // one seed for the strip's tears and stains and for where the light gets in
    const seed = Math.random() * 10;
    const look = filmLookUniforms();
    look.uFilmSeed.value = seed;
    return {
      ...waves,
      ...look,
      ...sheetUniforms(),
      // unexposed stock until a photo is chosen; the strip is whole from the start
      uPhoto: { value: BLANK_PHOTO as THREE.Texture },
      uDevelop: { value: 0 },
      uSize: { value: new THREE.Vector2(FILM_LENGTH, FILM_WIDTH) },
      uImageAspect: { value: 1 },
      uEdgePrint: { value: createEdgePrint(1 + Math.floor(Math.random() * 36)) },
      uFloat: { value: 0 },
      uSink: { value: 0 },
      uCurl: { value: 1 },
      uFlex: { value: 0 },
      uSeed: { value: seed },
      // starts fully dissolved, and gathers itself over EMERGE_S
      uDissolve: { value: 1.2 },
      uBelow: { value: WRAP_TUNE_DEFAULT.filmBelow },
    };
  }, [waves]);
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
  // the point cloud (only with ?cloud=1): its uniforms and material live in wrapCloud.ts
  const particleUniforms = useMemo(() => createCloudUniforms(WRAP_TUNE_DEFAULT), []);
  const particleMaterial = useMemo(() => createCloudMaterial(particleUniforms), [particleUniforms]);
  useEffect(() => () => particleMaterial.dispose(), [particleMaterial]);
  const [particleGeometry, setParticleGeometry] = useState<THREE.BufferGeometry | null>(null);
  useEffect(() => () => particleGeometry?.dispose(), [particleGeometry]);

  /* The touch pass: the scene is drawn to a target, then to the screen through
     the water around the hands. The quad copies the frame as it is where
     nothing bends it. */
  const touch = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(1, 1, { samples: 4, depthBuffer: true, stencilBuffer: false });
    const material = new THREE.ShaderMaterial({
      vertexShader: touchVertex,
      fragmentShader: touchFragment,
      uniforms: {
        tScene: { value: target.texture },
        uHand: { value: [new THREE.Vector2(-10, -10), new THREE.Vector2(-10, -10)] },
        uWake: { value: [new THREE.Vector2(), new THREE.Vector2()] },
        uPress: { value: [0, 0] },
        uAspect: { value: 1 },
        uTime: { value: 0 },
        uAmount: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    quad.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(quad);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return { target, material, quad, scene, camera };
  }, []);
  useEffect(() => () => { touch.target.dispose(); touch.material.dispose(); touch.quad.geometry.dispose(); }, [touch]);
  useEffect(() => {
    const dpr = gl.getPixelRatio();
    touch.target.setSize(Math.round(size.width * dpr), Math.round(size.height * dpr));
    touch.material.uniforms.uAspect.value = size.width / size.height;
  }, [touch, gl, size]);
  useFrame(({ gl: renderer, scene, camera: view }) => {
    renderer.setRenderTarget(touch.target);
    renderer.render(scene, view);
    renderer.setRenderTarget(null);
    renderer.render(touch.scene, touch.camera);
  }, 1);

  /* On confirm: the print that will develop on the form — the shared
     `MemoryPhotoLayer` look on a copy of the form's geometry, patched to
     develop rather than fade in — and, with ?cloud=1, the point cloud. */
  const buildWrap = (filmMesh: THREE.Mesh, formMesh: THREE.Mesh, texture: THREE.Texture, size: THREE.Vector2) => {
    const { rest } = artifact;
    const uv = buildPhotoUv(rest.sphere, MODEL_SPACE);
    if (CLOUD) {
      setParticleGeometry(buildCloudGeometry({
        sphere: rest.sphere, vertexCount: rest.vertexCount, uv,
        positions: formMesh.geometry.getAttribute("position").array as Float32Array,
        filmMesh, texture, stripSize: size,
        count: tune.current.cloudCount, releaseS: tune.current.releaseS,
      }));
    }

    // the print: shares the form's geometry, developing from nothing
    formMesh.geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    // a little of the film's fade stays with it: less color, a touch more presence
    const material = createMemoryPhotoMaterial(texture, 1, { ...MEMORY_PHOTO_FILTER_DEFAULTS, saturate: 0.6, contrast: 1.06, opacity: 0.62 });
    developOnForm(material);
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
    const tr = transport.current;
    const knobs = tune.current;
    const dt = tr.paused ? 0 : Math.min(delta, 0.05) * tr.speed;
    if (!document.hidden) time.current += dt;
    const s = stage.current;

    /* The seek. The wrap and the rise are functions of the time since
       confirm, so moving the clock is enough — except for what latched on the
       way: the wrap's end, the rise's start and end, the film hidden, the
       surface broken. Those are set to where the target time would have them. */
    const wrapEnds = WRAP_MOVE_S * 0.5 + knobs.fallS;
    tr.length = wrapEnds + RISE_S + 0.5;
    tr.active = wrapAt.current !== null;
    if (tr.seek !== null && wrapAt.current !== null) {
      const target = Math.min(tr.length, Math.max(0, tr.seek));
      tr.seek = null;
      time.current = wrapAt.current + target;
      if (target < wrapEnds) {
        if (wrapped.current) {
          wrapped.current = false;
          riseAt.current = null; risen.current = false; broke.current = false;
          s.rise = false;
          if (film.current) film.current.visible = true;
          onRewound("wrapping");
        }
      } else {
        if (!wrapped.current) {
          wrapped.current = true;
          if (film.current) film.current.visible = false;
          setDevelop(photoMaterial.current, knobs, 1);
          s.rise = true;
          onWrapped();
        }
        riseAt.current = wrapAt.current + wrapEnds;
        const k = (target - wrapEnds) / RISE_S;
        broke.current = k >= 1;
        if (k < 1 && risen.current) { risen.current = false; onRewound("rising"); }
      }
    }
    const t = time.current;
    waves.uTime.value = t;
    tr.shot = wrapAt.current === null ? 0 : t - wrapAt.current;

    /* ?from=wrap: the first frame is set up as the end of the color step —
       the photo developed and the strip afloat, the descent long over, the
       form surfaced with its shape and mist, the water washed — and the wrap
       is begun on it. Everything timed from these marks reads as finished. */
    if (from === "wrap" && !jumped.current && s.request && film.current && form.current) {
      jumped.current = true;
      const longAgo = t - 60;
      const request = s.request;
      s.request = null;
      const image = request.texture.image as { width: number; height: number };
      filmUniforms.uPhoto.value = prepareFilmPhoto(request.texture);
      filmUniforms.uImageAspect.value = image.width / image.height;
      filmUniforms.uDevelop.value = 1.45;
      filmUniforms.uDissolve.value = 0;
      filmUniforms.uFloat.value = 1;
      filmUniforms.uCurl.value = 0.7;
      filmUniforms.uSink.value = 1;
      developAt.current = longAgo;
      fall.current = {
        at: longAgo, pos: FILM_AT.clone(), quat: scratch.flat.clone(),
        right: new THREE.Vector3(1, 0, 0), width: FILM_LENGTH, height: FILM_WIDTH,
      };
      landedAt.current = longAgo;
      settled.current = true;
      hold.current = 1;
      descentAt.current = longAgo;
      reachedBottom.current = true;
      smooth.current.wash = WATER_WASH;
      smooth.current.dye = 1;
      smooth.current.morph = s.morph;
      smooth.current.frost = s.frost;
      writeMorph(s.morph);
      water.uTintAmount.value = 1;
      s.wrap = true;
    }

    /* The camera, in order: still on the pond; down the descent path; drawn
       back for the wrap; up the rise path; still again, on the named memory. */
    const { cameraAt, lookAt, formAt } = scratch;
    formAt.copy(FORM_AT);
    filmUniforms.uBelow.value = knobs.filmBelow;
    // the wrap's framing is live from the panel; the rise sets out from wherever it is
    scratch.wrapCamera.set(0, knobs.cameraY, knobs.cameraZ);
    scratch.wrapLook.set(0, knobs.lookY, knobs.lookZ);
    scratch.wrapForm.set(0, knobs.formY, knobs.formZ);
    if (riseAt.current === null) {
      RISE_PATH.points[0].copy(scratch.wrapCamera);
      RISE_LOOK.points[0].copy(scratch.wrapLook);
      RISE_FORM.points[0].copy(scratch.wrapForm);
    }
    if (riseAt.current !== null) {
      const k = Math.min(1, (t - riseAt.current) / RISE_S);
      const u = flowProgress(k, 0, 1);
      cameraAt.copy(RISE_PATH.getPoint(u));
      lookAt.copy(RISE_LOOK.getPoint(u));
      formAt.copy(RISE_FORM.getPoint(u));
      // carry the wrap's slow sink into the start of the rise, so there is no step
      const carry = knobs.viewSink * (1 - smoothProgress(k, 0, 0.45));
      cameraAt.y -= carry;
      lookAt.y -= carry * 0.8;
      if (k >= 1 && !risen.current) { risen.current = true; onRisen(); }
    } else if (wrapAt.current !== null) {
      const k = flowProgress(t - wrapAt.current, 0, WRAP_MOVE_S);
      cameraAt.copy(DESCENT_PATH.getPoint(1)).lerp(scratch.wrapCamera, k);
      lookAt.copy(DESCENT_LOOK.getPoint(1)).lerp(scratch.wrapLook, k);
      formAt.lerp(scratch.wrapForm, k);
      // then the view sinks a little with the grains
      const sink = smoothProgress(t - wrapAt.current, WRAP_MOVE_S, WRAP_MOVE_S + knobs.fallS) * knobs.viewSink;
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
    // the orbit: once the wrap has begun, the view can be turned about its look point to watch from another side;
    // the rise takes its own turn (from below, looking up at the form against the light), and lets it go as it surfaces
    let yawDeg = knobs.orbitYaw, pitchDeg = knobs.orbitPitch;
    if (riseAt.current !== null) {
      const k = Math.min(1, (t - riseAt.current) / RISE_S);
      const into = smoothProgress(k, 0, 0.22);
      const held = 1 - smoothProgress(k, knobs.riseViewUntil, Math.max(knobs.riseViewUntil + 0.05, knobs.riseViewBack));
      yawDeg = THREE.MathUtils.lerp(knobs.orbitYaw, knobs.riseYaw * held, into);
      pitchDeg = THREE.MathUtils.lerp(knobs.orbitPitch, knobs.risePitch * held, into);
    }
    if (wrapAt.current !== null && (yawDeg !== 0 || pitchDeg !== 0)) {
      const offset = scratch.v.copy(cameraAt).sub(lookAt);
      const yaw = THREE.MathUtils.degToRad(yawDeg);
      const pitch = THREE.MathUtils.degToRad(pitchDeg);
      const flat = Math.hypot(offset.x, offset.z);
      const heading = Math.atan2(offset.x, offset.z) + yaw;
      const elevation = Math.min(1.45, Math.max(-1.45, Math.atan2(offset.y, flat) + pitch));
      const r = offset.length();
      cameraAt.set(lookAt.x + r * Math.cos(elevation) * Math.sin(heading), lookAt.y + r * Math.sin(elevation), lookAt.z + r * Math.cos(elevation) * Math.cos(heading));
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

    /* The hands in the water. Each slot follows its hand with a little lag
       and keeps the hand's motion as a wake; a hand that leaves fades where it
       was. The left hand keeps the left slot, so two hands never swap. */
    const tu = touch.material.uniforms;
    const hands = s.hands.length > 1 ? [...s.hands].sort((a, b) => a.x - b.x) : s.hands;
    for (let i = 0; i < 2; i++) {
      const slot = touches.current[i];
      const hand = hands[i];
      if (hand) {
        if (slot.press < 0.01) { slot.at.set(hand.x, hand.y); slot.wake.set(0, 0); }
        const k = 1 - Math.exp(-9 * dt);
        const dx = (hand.x - slot.at.x) * k, dy = (hand.y - slot.at.y) * k;
        slot.at.x += dx; slot.at.y += dy;
        // the wake is the smoothed motion, in frame-widths per second, held back by the water
        if (dt > 0) {
          const kw = 1 - Math.exp(-4 * dt);
          slot.wake.x += ((dx / dt) * 0.02 - slot.wake.x) * kw;
          slot.wake.y += ((dy / dt) * 0.02 - slot.wake.y) * kw;
          if (slot.wake.length() > 0.025) slot.wake.setLength(0.025);
        }
        slot.press = ease(slot.press, 1, 5);
      } else {
        slot.press = ease(slot.press, 0, 3);
        slot.wake.multiplyScalar(Math.exp(-3 * dt));
      }
      (tu.uHand.value as THREE.Vector2[])[i].copy(slot.at);
      (tu.uWake.value as THREE.Vector2[])[i].copy(slot.wake);
      (tu.uPress.value as number[])[i] = slot.press;
    }
    tu.uTime.value = t;
    // only while the form is in hand, and only under the water
    tu.uAmount.value = ease(tu.uAmount.value, s.step !== null ? under.value : 0, 2.5);
    if (glowRef.current) glowRef.current.style.opacity = String(1 - under.value);
    if (crossingRef.current) {
      const crossing = descentAt.current === null ? 0 : Math.exp(-((camY / 0.28) ** 2));
      crossingRef.current.style.opacity = String(crossing);
      crossingRef.current.style.backdropFilter = `blur(${(crossing * 14).toFixed(1)}px)`;
      crossingRef.current.style.setProperty("-webkit-backdrop-filter", `blur(${(crossing * 14).toFixed(1)}px)`);
    }

    /* The strip, before it is let go: it gathers itself out of nothing in
       front of the view and hangs there, empty, turning a little on the air.
       The photo develops into its window; a beat later the hand opens. */
    const mesh = film.current;
    if (mesh && fall.current === null) {
      filmUniforms.uDissolve.value = 1.2 * (1 - smoothProgress(t, EMERGE_S[0], EMERGE_S[1]));
      camera.getWorldDirection(scratch.forward);
      scratch.v.set(0, 1, 0).applyQuaternion(camera.quaternion);
      mesh.position.copy(camera.position).addScaledVector(scratch.forward, CHOOSE_DEPTH)
        .addScaledVector(scratch.v, -0.12 + 0.025 * Math.sin(t * 0.7));
      scratch.euler.set(-0.08 + 0.05 * Math.sin(t * 0.5), 0.06 * Math.sin(t * 0.37 + 1.0), 0.03 * Math.sin(t * 0.43), "YXZ");
      mesh.quaternion.copy(camera.quaternion).multiply(scratch.flutter.setFromEuler(scratch.euler));
      filmUniforms.uFlex.value = 0.08 * Math.sin(t * 0.8);
      const request = s.request;
      if (request) {
        s.request = null;
        const image = request.texture.image as { width: number; height: number };
        filmUniforms.uPhoto.value = prepareFilmPhoto(request.texture);
        filmUniforms.uImageAspect.value = image.width / image.height;
        developAt.current = t;
      }
      if (developAt.current !== null) {
        const since = t - developAt.current;
        filmUniforms.uDevelop.value = 1.45 * smoothProgress(since, 0, DEVELOP_S);
        if (since >= LET_GO_S) {
          fall.current = {
            at: t,
            pos: mesh.position.clone(),
            quat: mesh.quaternion.clone(),
            right: new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion),
            width: FILM_LENGTH,
            height: FILM_WIDTH,
          };
          onFallStart();
        }
      }
      // the pick button rides the strip
      const pick = pickRef.current;
      if (pick) {
        scratch.v.copy(mesh.position).project(camera);
        const cx = (scratch.v.x * 0.5 + 0.5) * size.width, cy = (-scratch.v.y * 0.5 + 0.5) * size.height;
        scratch.v.set(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(FILM_LENGTH * 0.5).add(mesh.position).project(camera);
        const hw = Math.abs((scratch.v.x * 0.5 + 0.5) * size.width - cx);
        scratch.v.set(0, 1, 0).applyQuaternion(camera.quaternion).multiplyScalar(FILM_WIDTH * 0.5).add(mesh.position).project(camera);
        const hh = Math.abs((-scratch.v.y * 0.5 + 0.5) * size.height - cy);
        pick.style.transform = `translate(-50%, -50%) translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px)`;
        pick.style.width = `${(hw * 2).toFixed(1)}px`;
        pick.style.height = `${(hh * 2).toFixed(1)}px`;
      }
    }

    /* The fall: from where it hung to the water, fluttering, settling flat. */
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
      scratch.euler.set(0.55 * Math.sin(k * Math.PI * 2.6 + 0.9) * decay, 0, 0.4 * Math.sin(k * Math.PI * 2.6) * decay, "XYZ");
      mesh.quaternion.copy(scratch.q).multiply(scratch.flutter.setFromEuler(scratch.euler));
      // the curl flexes with the air on the way down; the water presses some of it out
      filmUniforms.uCurl.value = 1 - 0.3 * filmUniforms.uFloat.value;
      filmUniforms.uFlex.value = 0.6 * Math.sin(k * Math.PI * 2.6 + 1.7) * decay * smoothProgress(k, 0.0, 0.3);
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
      // for the wrap the form fills out — about twice its volume — and stays that size up through the rise
      const grown = wrapAt.current === null ? 0 : flowProgress(t - wrapAt.current, 0, WRAP_MOVE_S);
      body.scale.setScalar(0.9 * (0.86 + 0.14 * reveal) * (1 + knobs.grow * grown));
      // it turns slowly; for the wrap it comes round to face the light, and holds
      if (wrapAt.current !== null && riseAt.current === null) {
        const home = Math.round(body.rotation.y / (Math.PI * 2)) * Math.PI * 2;
        body.rotation.y = ease(body.rotation.y, home, 2.2);
      } else body.rotation.y += dt * (risen.current ? 0.08 : 0.15);
      body.updateMatrixWorld();
    }

    /* The wrap: the film lets go of its image from the top down and the print
       develops on the form. With ?cloud=1 the image falls as points between. */
    if (s.wrap && wrapAt.current === null && mesh && body && filmUniforms.uPhoto.value) {
      wrapAt.current = t;
      buildWrap(mesh, body, filmUniforms.uPhoto.value, filmUniforms.uSize.value);
    }
    if (wrapAt.current !== null && !wrapped.current) {
      // seconds since the film began to let go
      const clock = t - wrapAt.current - WRAP_MOVE_S * 0.5;
      if (CLOUD) {
        const pu = particleUniforms;
        pu.uClock.value = clock;
        // the knobs, every frame, so a slider moves the cloud that is already in the water
        setCloudUniforms(pu, particleMaterial, knobs, gl.getPixelRatio(), mesh ? mesh.position : null);
        if (body) { pu.uForm.value.copy(body.matrixWorld); pu.uFormAt.value.copy(body.position); }
      }
      // the emulsion lets go: thin at first, then the rest, a little after the release
      filmUniforms.uDissolve.value = Math.min(1.2, Math.max(0, clock + 0.3) / (knobs.releaseS + 1.2) * 1.2);
      // the print develops on the form: darks first, the top leading
      setDevelop(photoMaterial.current, knobs, smoothProgress(clock, knobs.overlayIn, Math.max(knobs.overlayIn + 0.1, knobs.overlayOut)));
      if (clock >= knobs.fallS) {
        wrapped.current = true;
        if (mesh) mesh.visible = false;
        setDevelop(photoMaterial.current, knobs, 1);
        onWrapped();
      }
    } else if (body && CLOUD) {
      particleUniforms.uForm.value.copy(body.matrixWorld);
      particleUniforms.uFormAt.value.copy(body.position);
      // points still in the water when the wrap was called finish their way
      if (wrapAt.current !== null) particleUniforms.uClock.value = t - wrapAt.current - WRAP_MOVE_S * 0.5;
    }

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
    <mesh ref={film} renderOrder={2} frustumCulled={false}>
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
    {CLOUD && particleGeometry && (
      <points ref={particles} geometry={particleGeometry} material={particleMaterial} renderOrder={6} frustumCulled={false} />
    )}
  </>;
}

/** Growth eases in and out, so a hand's first and last inch do little. */
const easeMorph = (m: number) => m * m * (3 - 2 * m);

/** Words set against the washed water, which is paper by then: the chrome grey. */
const UNDER_INK = CHROME_GRAY;

/* The gesture ranges, as ShapeGrowPage reads them. The hint under the copy
   names the drag only while no camera is driving the step. */
const STEP_COPY: Record<Step, { title: string; lines: [string, string]; drag: string }> = {
  shape: {
    title: "shape",
    lines: ["each memory already has a shape.", "open your hands, and let these words find theirs."],
    drag: "or drag across to grow it",
  },
  distance: {
    title: "distance",
    lines: ["time blurs the edges, not the feeling.", "a faded memory can hold more."],
    drag: "or drag across to let it mist over",
  },
  color: {
    title: "color",
    lines: ["remembering dyes what happened.", "how does it feel, returning to it today?"],
    drag: "",
  },
};

/** Two palms together → sphere; apart → the settled form. */
function distanceToMorph(distance: number): number {
  return clamp01((distance - 0.15) / (0.55 - 0.15));
}
/** Fist → 0, open palm → 1. */
function opennessToUnit(openness: number): number {
  return clamp01((openness - 0.09) / (0.28 - 0.09));
}
function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
function map01(value: number, min: number, max: number): number {
  return clamp01((value - min) / (max - min));
}

const loader = new THREE.TextureLoader();

/* The print develops on the form rather than fading in flat: as on paper
   in the tray, the darks come first, and here the top of the image — where
   the sheet landed first — leads the rest. The overlay is the shared
   `MemoryPhotoLayer` material; its fragment is patched where it computes
   alpha. uDevelop is 0…1; uDarks and uSweep are how far each leads; uSoft
   is how gradually any one part comes up. */
function developOnForm(material: THREE.ShaderMaterial) {
  Object.assign(material.uniforms, {
    uDevelop: { value: 0 },
    uDarks: { value: WRAP_TUNE_DEFAULT.developDarks },
    uSweep: { value: WRAP_TUNE_DEFAULT.developSweep },
    uSoft: { value: WRAP_TUNE_DEFAULT.developSoft },
  });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace("uniform float uFade;", "uniform float uFade;\nuniform float uDevelop;\nuniform float uDarks;\nuniform float uSweep;\nuniform float uSoft;")
      .replace(
        "float alpha = tex.a * uBaseOpacity * edge * uFade;",
        `float devLuma = dot(tex.rgb, vec3(0.2126, 0.7152, 0.0722));
  float need = devLuma * uDarks + (1.0 - vPhotoUv.y) * uSweep;
  float reveal = smoothstep(need, need + uSoft, uDevelop * (1.0 + uDarks + uSweep + uSoft));
  float alpha = tex.a * uBaseOpacity * edge * uFade * reveal;`,
      );
  };
  material.needsUpdate = true;
}
function setDevelop(material: THREE.ShaderMaterial | null, k: WrapTune, progress: number) {
  if (!material?.uniforms.uDevelop) return;
  material.uniforms.uDevelop.value = Math.min(1, Math.max(0, progress));
  material.uniforms.uDarks.value = k.developDarks;
  material.uniforms.uSweep.value = k.developSweep;
  material.uniforms.uSoft.value = Math.max(0.02, k.developSoft);
}

/* The wrap's knobs, grouped as the panel shows them. Ranges are generous;
   the defaults above are the current judgement. */
type Knob = TuneKnob<WrapTune>;
const WRAP_KNOBS: { group: string; knobs: Knob[] }[] = [
  { group: "framing", knobs: [
    { key: "cameraY", label: "camera height", min: -5, max: 0, step: 0.05 },
    { key: "cameraZ", label: "camera distance", min: 3, max: 14, step: 0.05 },
    { key: "lookY", label: "look height", min: -4, max: 1.5, step: 0.05 },
    { key: "lookZ", label: "look depth", min: -3, max: 4, step: 0.05 },
    { key: "formY", label: "form height", min: -5, max: -1, step: 0.05 },
    { key: "formZ", label: "form depth (film at 2)", min: -2, max: 4, step: 0.05 },
    { key: "orbitYaw", label: "view turned (°)", min: -180, max: 180, step: 1 },
    { key: "orbitPitch", label: "view raised (°)", min: -80, max: 80, step: 1 },
    { key: "riseYaw", label: "rise: view turned (°)", min: -180, max: 180, step: 1 },
    { key: "risePitch", label: "rise: view raised (°)", min: -80, max: 80, step: 1 },
    { key: "riseViewUntil", label: "rise: held until (of rise)", min: 0, max: 1, step: 0.01 },
    { key: "riseViewBack", label: "rise: back to the pond by", min: 0.05, max: 1, step: 0.01 },
    { key: "grow", label: "form grows by", min: 0, max: 1, step: 0.01 },
    { key: "viewSink", label: "view sinks over the wrap", min: 0, max: 1.2, step: 0.01 },
    { key: "filmBelow", label: "film seen from below", min: 0, max: 1, step: 0.01 },
  ] },
  { group: "timing", knobs: [
    { key: "releaseS", label: "emulsion lets go over (on again)", min: 0.3, max: 6, step: 0.1 },
    { key: "fallS", label: "wrap ends at", min: 3, max: 16, step: 0.1 },
  ] },
  { group: "print", knobs: [
    { key: "overlayIn", label: "print develops from", min: 0, max: 10, step: 0.1 },
    { key: "overlayOut", label: "print developed by", min: 0.5, max: 14, step: 0.1 },
    { key: "developDarks", label: "darks lead by", min: 0, max: 2, step: 0.01 },
    { key: "developSweep", label: "top leads by", min: 0, max: 2, step: 0.01 },
    { key: "developSoft", label: "each part comes up over", min: 0.05, max: 1.5, step: 0.01 },
  ] },
  // the point cloud's knobs join the panel only when the cloud is on
  ...(CLOUD ? (CLOUD_KNOBS as { group: string; knobs: Knob[] }[]) : []),
];

/** The panel of knobs, down the right; folds to a word. A phase picked on the
    timeline names a group here, which scrolls into view and is marked. */
function WrapTunePanel({ tune, onChange, focus }: { tune: WrapTune; onChange: (next: WrapTune) => void; focus: string | null }) {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const sections = useRef<Record<string, HTMLElement | null>>({});
  useEffect(() => {
    if (!focus) return;
    if (!open) setOpen(true);
    const id = window.requestAnimationFrame(() => sections.current[focus]?.scrollIntoView({ behavior: "smooth", block: "start" }));
    return () => window.cancelAnimationFrame(id);
  }, [focus, open]);
  const copy = async () => {
    const lines = (Object.keys(WRAP_TUNE_DEFAULT) as (keyof WrapTune)[]).map((k) => `  ${k}: ${Number(tune[k].toFixed(3))},`);
    try {
      await navigator.clipboard.writeText(`{\n${lines.join("\n")}\n}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard refused — the values are still on screen */ }
  };
  return (
    <>
      <TextButton label={open ? "hide knobs" : "knobs"} onClick={() => setOpen((o) => !o)}
        style={{ position: "fixed", right: 28, top: 22, zIndex: 40, fontSize: NOTE_SIZE }} />
      {open && (
        <aside aria-label="wrap knobs" style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 250, padding: "56px 24px 28px 22px",
          boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 8, zIndex: 35, overflowY: "auto",
          borderLeft: "1px solid rgba(123, 123, 135, 0.14)", background: "rgba(236, 237, 236, 0.55)", backdropFilter: "blur(6px)" }}>
          {WRAP_KNOBS.map(({ group, knobs }) => (
            <section key={group} ref={(el) => { sections.current[group] = el; }}
              style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8, scrollMarginTop: 56 }}>
              <p style={{ ...META, margin: "0 0 2px", color: CHROME_GRAY,
                textDecoration: focus === group ? "underline" : "none", textUnderlineOffset: 4 }}>{group}</p>
              {knobs.map(({ key, label, min, max, step }) => (
                <label key={key} style={{ display: "block" }}>
                  <span style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: NOTE_SIZE, color: CHROME_GRAY }}>
                    <span>{label}</span>
                    <span style={{ opacity: 0.6, fontVariantNumeric: "tabular-nums" }}>{tune[key].toFixed(step < 0.01 ? 3 : 2)}</span>
                  </span>
                  <input type="range" className="wrap-range" min={min} max={max} step={step} value={tune[key]}
                    onChange={(e) => onChange({ ...tune, [key]: Number(e.target.value) })} />
                </label>
              ))}
            </section>
          ))}
          <div style={{ display: "flex", gap: 18, marginTop: 14 }}>
            <TextButton label="reset" onClick={() => onChange(WRAP_TUNE_DEFAULT)} style={{ fontSize: NOTE_SIZE }} />
            <TextButton label={copied ? "copied" : "copy values"} onClick={() => void copy()} style={{ fontSize: NOTE_SIZE }} />
          </div>
          {/* the point cloud is kept aside (wrapCloud.ts); this reloads the lab with it on or off */}
          <TextButton label={CLOUD ? "without the point cloud" : "with the point cloud"} onClick={toggleCloud}
            style={{ fontSize: NOTE_SIZE, marginTop: 6, alignSelf: "flex-start", opacity: 0.7 }} />
        </aside>
      )}
    </>
  );
}

/* The timeline. Seconds since confirm run left to right; each track is one
   thing the shot does, each block the span it does it in, computed from the
   knobs so the blocks move as the sliders do — and the other way: an edge
   dragged writes the knob behind it, a block dragged by its body shifts both
   edges when both are knobs. Pressing a block seeks to its start and names
   its knob group to the panel; pressing or dragging the empty track seeks. */
type WrapBlock = PhaseBlock<WrapTune>;
const KNOB_RANGE = new Map(WRAP_KNOBS.flatMap((g) => g.knobs.map((k) => [k.key, k] as const)));
function clampKnobs(k: WrapTune, next: Partial<WrapTune>): WrapTune {
  const out = { ...k };
  for (const key of Object.keys(next) as (keyof WrapTune)[]) {
    const r = KNOB_RANGE.get(key);
    const v = next[key] as number;
    out[key] = r ? Math.round(Math.min(r.max, Math.max(r.min, v)) / r.step) * r.step : v;
  }
  return out;
}
function phaseBlocks(k: WrapTune): WrapBlock[] {
  const release = WRAP_MOVE_S * 0.5;
  const wrapEnds = release + k.fallS;
  const fallEnd = (_: WrapTune, s: number) => ({ fallS: s - release });
  const releaseEnd = (_: WrapTune, s: number) => ({ releaseS: s - release });
  const motion: WrapBlock[] = CLOUD ? cloudPhaseBlocks(k, release) : [];
  const riseHeld = wrapEnds + RISE_S * k.riseViewUntil;
  return [
    { track: "camera", label: "draw back · form grows", from: 0, to: WRAP_MOVE_S, group: "framing" },
    { track: "camera", label: "view sinks", from: WRAP_MOVE_S, to: wrapEnds, group: "framing", setTo: fallEnd },
    { track: "camera", label: "rise view held", from: wrapEnds, to: riseHeld, group: "framing",
      setTo: (_, s) => ({ riseViewUntil: (s - wrapEnds) / RISE_S }) },
    { track: "camera", label: "back to the pond", from: riseHeld, to: wrapEnds + RISE_S * k.riseViewBack, group: "framing",
      setFrom: (_, s) => ({ riseViewUntil: (s - wrapEnds) / RISE_S }), setTo: (_, s) => ({ riseViewBack: (s - wrapEnds) / RISE_S }) },
    { track: "film", label: "emulsion lets go", from: release, to: release + k.releaseS, group: "timing", setTo: releaseEnd },
    { track: "film", label: "clear base", from: release + k.releaseS, to: wrapEnds, group: "framing", setFrom: releaseEnd, setTo: fallEnd },
    ...motion,
    { track: "print", label: "print develops", from: release + k.overlayIn, to: release + Math.max(k.overlayIn + 0.1, k.overlayOut), group: "print",
      setFrom: (_, s) => ({ overlayIn: s - release }), setTo: (_, s) => ({ overlayOut: s - release }) },
    { track: "rise", label: "rise · surface · named", from: wrapEnds, to: wrapEnds + RISE_S, group: "framing", setFrom: fallEnd },
  ];
}
const TRACKS = ["camera", "film", ...(CLOUD ? CLOUD_TRACKS : []), "print", "rise"];

type Drag =
  | { kind: "seek" }
  | { kind: "edge"; block: WrapBlock; edge: "from" | "to"; x0: number; base: WrapTune }
  | { kind: "body"; block: WrapBlock; x0: number; base: WrapTune; moved: boolean };

const TL_FONT = { fontFamily: SANS, fontSize: 11, fontWeight: 300, letterSpacing: "0.1px", color: CHROME_GRAY } as const;
const TL_LINE = "rgba(85, 85, 95, 0.32)";

function Timeline({ transport, tune, onChange, onFocus }: {
  transport: RefObject<Transport>; tune: WrapTune; onChange: (next: WrapTune) => void; onFocus: (group: string) => void;
}) {
  const [, tick] = useState(0);
  const [open, setOpen] = useState(true);
  const tracksRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 80);
    return () => window.clearInterval(id);
  }, []);
  const tr = transport.current;
  if (!tr.active) return null;
  const blocks = phaseBlocks(tune);
  const tracks = TRACKS.filter((track) => blocks.some((b) => b.track === track));
  const now = blocks.filter((b) => tr.shot >= b.from && tr.shot < b.to).map((b) => b.label);
  const length = tr.length;
  const at = (seconds: number) => `${(Math.min(length, Math.max(0, seconds)) / length * 100).toFixed(2)}%`;
  const seekTo = (seconds: number) => { tr.seek = seconds; tick((n) => n + 1); };
  const secondsAt = (clientX: number) => {
    const r = tracksRef.current?.getBoundingClientRect();
    return r ? (clientX - r.left) / r.width * length : 0;
  };
  const secondsPer = (dx: number) => {
    const r = tracksRef.current?.getBoundingClientRect();
    return r ? dx / r.width * length : 0;
  };
  const begin = (e: ReactPointerEvent, d: Drag) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    drag.current = d;
    try { tracksRef.current?.setPointerCapture(e.pointerId); } catch { /* a pointer the browser no longer knows; the drag still works while over the tracks */ }
    if (d.kind === "seek") seekTo(secondsAt(e.clientX));
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === "seek") { seekTo(secondsAt(e.clientX)); return; }
    const dt = secondsPer(e.clientX - d.x0);
    if (d.kind === "edge") {
      const s = (d.edge === "from" ? d.block.from : d.block.to) + dt;
      const set = d.edge === "from" ? d.block.setFrom : d.block.setTo;
      if (!set) return;
      onChange(clampKnobs(d.base, set(d.base, s)));
      if (tr.paused) seekTo(s);
      return;
    }
    if (Math.abs(e.clientX - d.x0) < 3 && !d.moved) return;
    d.moved = true;
    if (d.block.setFrom && d.block.setTo) {
      const first = clampKnobs(d.base, d.block.setFrom(d.base, d.block.from + dt));
      onChange(clampKnobs(first, d.block.setTo(first, d.block.to + dt)));
      if (tr.paused) seekTo(d.block.from + dt);
    }
  };
  const end = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === "body" && !d.moved) { seekTo(d.block.from); onFocus(d.block.group); }
  };
  const button = (label: string, title: string, onClick: () => void) => (
    <button type="button" title={title} aria-label={title} onClick={onClick}
      style={{ ...TL_FONT, border: "none", background: "transparent", padding: "2px 5px", cursor: "pointer" }}>{label}</button>
  );
  const ticks = Array.from({ length: Math.floor(length) + 1 }, (_, i) => i);
  const rowH = 22;
  const handle = (block: WrapBlock, edge: "from" | "to") => (
    <span role="presentation" title={edge === "from" ? "drag to move the start" : "drag to move the end"}
      onPointerDown={(e) => begin(e, { kind: "edge", block, edge, x0: e.clientX, base: tune })}
      style={{ position: "absolute", top: -2, bottom: -2, [edge === "from" ? "left" : "right"]: -4, width: 8, cursor: "ew-resize" }} />
  );
  return (
    <div role="group" aria-label="timeline" style={{ ...TL_FONT, position: "fixed", left: 28, right: 290, bottom: 22, zIndex: 36,
      padding: "6px 12px 8px", boxSizing: "border-box", background: "rgba(236, 237, 236, 0.58)", backdropFilter: "blur(6px)",
      borderRadius: 8, border: `1px solid rgba(123, 123, 135, 0.12)` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: open ? 8 : 0 }}>
        {button("‹‹", "back one second", () => seekTo(tr.shot - 1))}
        {button("‹", "back a tenth", () => seekTo(tr.shot - 0.1))}
        {button(tr.paused ? "play" : "pause", tr.paused ? "play" : "pause", () => { tr.paused = !tr.paused; tick((n) => n + 1); })}
        {button("›", "forward a tenth", () => seekTo(tr.shot + 0.1))}
        {button("››", "forward one second", () => seekTo(tr.shot + 1))}
        <span style={{ fontVariantNumeric: "tabular-nums", minWidth: "4.2em", marginLeft: 8 }}>{tr.shot.toFixed(2)} s</span>
        <span style={{ flex: 1, opacity: 0.6, marginLeft: 10, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
          {now.join(" · ")}
        </span>
        <label style={{ ...TL_FONT, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.7 }}>×{tr.speed.toFixed(2)}</span>
          <input type="range" className="wrap-range" aria-label="speed" min={0.05} max={2} step={0.05} value={tr.speed}
            onChange={(e) => { tr.speed = Number(e.target.value); tick((n) => n + 1); }} style={{ width: 80 }} />
        </label>
        {button(open ? "fold" : "phases", open ? "hide the phases" : "show the phases", () => setOpen((o) => !o))}
      </div>
      {open && <div style={{ display: "grid", gridTemplateColumns: "52px 1fr", columnGap: 12 }}>
        <div>
          {tracks.map((track) => (
            <div key={track} style={{ height: rowH, lineHeight: `${rowH}px`, opacity: 0.6 }}>{track}</div>
          ))}
        </div>
        <div ref={tracksRef} style={{ position: "relative", cursor: "col-resize", touchAction: "none", userSelect: "none" }}
          onPointerDown={(e) => begin(e, { kind: "seek" })}
          onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
          {tracks.map((track) => (
            <div key={track} style={{ position: "relative", height: rowH, borderBottom: `1px solid rgba(123, 123, 135, 0.1)` }}>
              {blocks.filter((b) => b.track === track).map((b) => {
                const live = tr.shot >= b.from && tr.shot < b.to;
                const movable = !!(b.setFrom && b.setTo);
                return (
                  <div key={b.label} role="button" tabIndex={0} aria-label={`${b.label}, ${b.from.toFixed(1)} to ${b.to.toFixed(1)} seconds`}
                    title={`${b.label} · ${b.from.toFixed(1)}–${b.to.toFixed(1)} s`}
                    onPointerDown={(e) => begin(e, { kind: "body", block: b, x0: e.clientX, base: tune, moved: false })}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); seekTo(b.from); onFocus(b.group); } }}
                    style={{ position: "absolute", top: 4, bottom: 4, left: at(b.from), width: `calc(${at(b.to)} - ${at(b.from)})`,
                      boxSizing: "border-box", border: `1px solid ${TL_LINE}`, borderRadius: 2, padding: "0 6px", overflow: "visible",
                      whiteSpace: "nowrap", cursor: movable ? "grab" : "pointer", lineHeight: `${rowH - 10}px`,
                      background: live ? "rgba(85, 85, 95, 0.08)" : "transparent", opacity: live ? 1 : 0.72 }}>
                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis" }}>{b.label}</span>
                    {b.setFrom && handle(b, "from")}
                    {b.setTo && handle(b, "to")}
                  </div>
                );
              })}
            </div>
          ))}
          {/* the seconds */}
          <div style={{ position: "relative", height: 14 }}>
            {ticks.map((s) => (
              <span key={s} style={{ position: "absolute", left: at(s), transform: "translateX(-50%)", top: 2, opacity: 0.5,
                fontVariantNumeric: "tabular-nums" }}>{s}</span>
            ))}
          </div>
          {/* the playhead */}
          <div aria-hidden style={{ position: "absolute", top: 0, bottom: 14, left: at(tr.shot), width: 1, background: "rgba(85, 85, 95, 0.7)", pointerEvents: "none" }} />
        </div>
      </div>}
    </div>
  );
}

function DescentRun({ onAgain, tune, transport }: { onAgain: () => void; tune: RefObject<WrapTune>; transport: RefObject<Transport> }) {
  const navigate = useNavigate();
  const stage = useRef<StageState>({
    request: null, holding: false, step: null,
    morph: FROM ? PREVIEW_MORPH : 0, frost: FROM ? PREVIEW_FROST : 0,
    oklch: DEFAULT_OKLCH, hands: [], wrap: false, rise: false,
  });
  // The memory's form and id are fixed when the run starts, as the recording
  // step fixes them on the live pond.
  const [form] = useState(() => createArtifactForm());
  const [memoryId] = useState(() => crypto.randomUUID());
  const hostRef = useRef<HTMLDivElement>(null);
  const crossingRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>(FROM === "wrap" ? "wrapping" : "choose");
  const [loading, setLoading] = useState<string | null>(null);
  const [lifted, setLifted] = useState<string | null>(null);
  const [morph, setMorph] = useState(stage.current.morph);
  const [frost, setFrost] = useState(stage.current.frost);
  // opening on the wrap, the still is on the film before the stage mounts
  const [ready, setReady] = useState(FROM === null);
  useEffect(() => {
    if (FROM === null) return;
    let live = true;
    void loader.loadAsync(PREVIEW_PHOTO).then((texture) => {
      if (!live) return;
      stage.current.request = { texture };
      setLifted(PREVIEW_PHOTO);
      setReady(true);
    });
    return () => { live = false; };
  }, []);
  const [colorUv, setColorUv] = useState(() => uvFromOklch(DEFAULT_OKLCH));
  const [colorHeld, setColorHeld] = useState(false);
  const [handsDetected, setHandsDetected] = useState(0);
  const [memoryName, setMemoryName] = useState("");
  const [year, setYear] = useState("");
  const drag = useRef<{ x: number; from: number } | null>(null);

  const step: Step | null = phase === "shape" || phase === "distance" || phase === "color" ? phase : null;
  stage.current.step = step;
  const stepRef = useRef(step);
  stepRef.current = step;

  useEffect(() => {
    if (phase === "naming") nameRef.current?.focus();
  }, [phase]);

  const setSignal = (value: number) => {
    const v = clamp01(value);
    if (stepRef.current === "shape") { stage.current.morph = v; setMorph(v); }
    else if (stepRef.current === "distance") { stage.current.frost = v; setFrost(v); }
  };
  const colorUvRef = useRef(colorUv);
  const pickColor = (u: number, v: number) => {
    const uv = { u: clamp01(u), v: clamp01(v) };
    colorUvRef.current = uv;
    setColorUv(uv);
    stage.current.oklch = sampleField(uv.u, uv.v);
  };
  const colorHeldRef = useRef(false);
  const pinchFrames = useRef(0);
  /** Who last put hands in the water: the camera wins while it sees any. */
  const handsFrom = useRef<"camera" | "pointer" | null>(null);
  const morphGate = useRef(createGestureGate(0.015));
  const frostGate = useRef(createGestureGate(0.015));
  useEffect(() => {
    // fresh baselines each step, so a hand already in frame does not jump the form
    morphGate.current = createGestureGate(0.015);
    frostGate.current = createGestureGate(0.015);
    colorHeldRef.current = false;
    pinchFrames.current = 0;
    setColorHeld(false);
    stage.current.hands = [];
    handsFrom.current = null;
  }, [step]);

  /* The same three gestures as ShapeGrowPage: two palms apart for shape, one
     palm opening for distance, a fingertip over the field for color (pinch to
     hold). The camera opens when the form surfaces; the drag below stays as
     the fallback when it is refused or no hand is seen. */
  const tracking = useHandTracking({
    enabled: step !== null,
    videoRef,
    numHands: step === "shape" ? 2 : 1,
    onLandmarks: (hands) => {
      setHandsDetected(hands.length);
      // the camera is mirrored, as the corner window shows it; landmark y runs down
      handsFrom.current = "camera";
      stage.current.hands = hands.map((hand) => {
        const c = handCenter(hand);
        return { x: 1 - c.x, y: 1 - c.y };
      });
      const tab = stepRef.current;
      if (tab === "shape") {
        if (hands.length < 2) return;
        const distance = landmarkDistance(handCenter(hands[0]), handCenter(hands[1]));
        if (morphGate.current.update(distance)) setSignal(distanceToMorph(distance));
      } else if (tab === "distance") {
        const openness = handOpenness(hands[0]);
        // open palm frosts the glass; a fist clears it
        if (frostGate.current.update(openness)) setSignal(opennessToUnit(openness));
      } else if (tab === "color") {
        const hand = hands[0];
        const pinch = landmarkDistance(hand[4], hand[8], true);
        if (pinch < 0.052) {
          pinchFrames.current += 1;
          if (!colorHeldRef.current && pinchFrames.current >= 2) { colorHeldRef.current = true; setColorHeld(true); }
        } else {
          pinchFrames.current = 0;
          if (colorHeldRef.current && pinch > 0.08) { colorHeldRef.current = false; setColorHeld(false); }
        }
        if (colorHeldRef.current) return;
        const nextU = 1 - map01(hand[8].x, 0.12, 0.88);
        const nextV = map01(hand[8].y, 0.16, 0.84);
        const current = colorUvRef.current;
        pickColor(current.u + (nextU - current.u) * 0.24, current.v + (nextV - current.v) * 0.24);
      }
    },
    onNoHands: () => {
      setHandsDetected(0);
      if (handsFrom.current === "camera") { handsFrom.current = null; stage.current.hands = []; }
      if (colorHeldRef.current) { colorHeldRef.current = false; pinchFrames.current = 0; setColorHeld(false); }
    },
  });
  const handsNeeded = step === "shape" ? 2 : 1;
  const gestureLive = tracking.isTracking && handsDetected >= handsNeeded;

  const continueStep = () => {
    if (phase === "shape") setPhase("distance");
    else if (phase === "distance") setPhase("color");
    else if (phase === "color") { stage.current.wrap = true; setPhase("wrapping"); }
  };
  const currentYear = new Date().getFullYear();
  const yearSettled = year.length === 4 && Number(year) <= currentYear;
  const canSave = phase === "naming" && memoryName.trim() !== "" && yearSettled;

  /* Saved the way the naming rim saves, plus what the rim drops: the photo,
     the pick and the frost. The archive carries them; the gallery does not
     draw them yet. */
  const save = () => {
    if (!canSave) return;
    const oklch = stage.current.oklch;
    const matPresetIndex = Math.min(
      Math.round((((oklch.h % 360) + 360) % 360) / 360 * (MATERIAL_PRESETS.length - 1)),
      MATERIAL_PRESETS.length - 1,
    );
    saveMemory({
      id: memoryId,
      title: memoryName.trim(),
      year,
      transcript: "",
      highlightedWords: [],
      shape: { form, matPresetIndex, fluidity: 0, evolve: stage.current.morph, bumpAmount: 0 },
      colorIndex: draftColorIndex(matPresetIndex),
      look: { ...(lifted ? { photoUrl: lifted } : {}), oklch, vividness: 1 - stage.current.frost },
      createdAt: new Date().toISOString(),
    });
    setPhase("saved");
  };

  const pick = async (url: string) => {
    if (phase !== "choose" || loading) return;
    setLoading(url);
    try {
      const texture = await loader.loadAsync(url);
      stage.current.request = { texture };
      setLifted(url);
    } catch {
      setLoading(null);
    }
  };

  const setHolding = (holding: boolean) => { stage.current.holding = holding; };
  const choosing = phase === "choose" && !lifted && !loading;

  /* While the camera sees no hand, the pointer is the hand in the water. */
  const pointerAsHand = (e: ReactPointerEvent) => {
    if (!step || handsFrom.current === "camera") return;
    const host = hostRef.current?.getBoundingClientRect();
    if (!host) return;
    handsFrom.current = "pointer";
    stage.current.hands = [{ x: (e.clientX - host.left) / host.width, y: 1 - (e.clientY - host.top) / host.height }];
  };
  const pointerOut = () => {
    if (handsFrom.current === "pointer") { handsFrom.current = null; stage.current.hands = []; }
  };

  return (
    <main ref={hostRef} style={{ position: "relative", width: "100%", height: "100dvh", overflow: "hidden",
      background: "linear-gradient(#ededE8, #e2e6e2 42%, #b6c8c3)" }}
      onPointerMove={pointerAsHand}
      onPointerLeave={pointerOut}>
      {ready && <Canvas camera={{ fov: 48, near: 0.1, far: 2400, position: POND_CAMERA.toArray() }}
        dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }} style={{ position: "absolute", inset: 0 }}>
        <Stage stage={stage} form={form} from={FROM} tune={tune} transport={transport} crossingRef={crossingRef} glowRef={glowRef} hintRef={hintRef} pickRef={pickRef} captionRef={captionRef}
          onFallStart={() => setPhase("falling")}
          onSettled={() => setPhase("floating")}
          onDescend={() => setPhase("descending")}
          onUnder={() => setPhase("shape")}
          onWrapped={() => { stage.current.rise = true; setPhase("rising"); }}
          onRisen={() => setPhase("naming")}
          onRewound={(to) => setPhase(to)} />
      </Canvas>}
      <div ref={glowRef} aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at 48% 24%, #fff9, transparent 58%)" }} />
      <div ref={crossingRef} aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0,
        background: "rgba(232, 238, 236, 0.35)" }} />

      <p style={{ ...META, position: "absolute", top: 26, left: 28, margin: 0, zIndex: 20 }}>lab — descent</p>

      {/* The camera, a small mirrored window in the corner while the hands steer. */}
      <video ref={videoRef} playsInline muted aria-hidden
        style={{ position: "absolute", right: 28, bottom: 28, width: 128, height: 96, objectFit: "cover",
          borderRadius: 10, transform: "scaleX(-1)", zIndex: 20, pointerEvents: "none",
          opacity: step && tracking.isTracking ? 0.42 : 0, transition: "opacity 700ms ease",
          filter: "grayscale(1) contrast(0.9)", mixBlendMode: "multiply" }} />

      <div style={{ position: "absolute", left: "50%", top: 96, transform: "translateX(-50%)", width: "min(28em, 90vw)",
        textAlign: "center", pointerEvents: "none", opacity: choosing ? 1 : 0, transition: "opacity 700ms ease",
        animation: FROM ? "none" : "descentFadeIn 1400ms ease 900ms backwards" }}>
        <p style={{ ...TITLE, margin: 0, color: CHROME_GRAY }}>a photo that holds this memory</p>
        <p style={{ margin: "10px 0 0", fontFamily: SERIF, fontSize: NOTE_SIZE, lineHeight: 1.45, color: CHROME_GRAY }}>
          touch the film to choose one. it will rest on the water.
        </p>
      </div>

      {/* The strip itself is the picker: an unseen button kept over it by the stage. */}
      <button ref={pickRef} type="button" aria-label="choose a photo for the film"
        onClick={() => inputRef.current?.click()} disabled={!choosing}
        style={{ position: "absolute", top: 0, left: 0, border: "none", padding: 0, background: "transparent",
          cursor: choosing ? "pointer" : "default", zIndex: 10, pointerEvents: choosing ? "auto" : "none" }} />
      <input ref={inputRef} type="file" accept="image/*" aria-label="choose a photo" style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void pick(URL.createObjectURL(file));
        }} />

      {/* The bundled stills, small and to one side, so the lab can run without a photo of one's own. */}
      <div role="listbox" aria-label="photo library" style={{ position: "absolute", left: 0, right: 0, bottom: 34,
        display: "flex", justifyContent: "center", alignItems: "center", gap: 14,
        opacity: choosing ? 1 : 0, transition: "opacity 500ms ease 150ms", animation: FROM ? "none" : "descentFadeIn 1400ms ease 1500ms backwards",
        pointerEvents: choosing ? "auto" : "none", zIndex: 10 }}>
        <span style={{ fontFamily: SANS, fontSize: NOTE_SIZE, color: CHROME_GRAY, opacity: 0.6, marginRight: 6 }}>or one of these</span>
        {PHOTOS.map((url) => (
          <button key={url} type="button" role="option" aria-selected={lifted === url} aria-label="select photo"
            onClick={() => void pick(url)}
            style={{ width: 48, height: 48, flex: "0 0 48px", padding: 0, overflow: "hidden",
              borderRadius: "50%", border: "1px solid rgba(123, 123, 135, 0.25)", background: "#e7e7e8",
              boxShadow: "0 6px 18px rgba(40, 36, 48, 0.1)", cursor: "pointer", opacity: 0.85 }}>
            <img src={url} alt="" style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} />
          </button>
        ))}
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
          <OklchColorField u={colorUv.u} v={colorUv.v} held={colorHeld} onPick={({ u, v }) => pickColor(u, v)} />
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
            {STEP_COPY[step].drag && (
              // with the camera on, the gesture hint takes this seat and the words move under it
              <p style={{ margin: tracking.isTracking ? "118px 0 0" : "26px 0 0", fontFamily: SANS, fontSize: NOTE_SIZE, color: UNDER_INK,
                opacity: gestureLive ? 0 : 0.7, transition: "opacity 900ms ease, margin 600ms ease" }}>
                {tracking.isTracking ? STEP_COPY[step].drag : STEP_COPY[step].drag.replace(/^or /, "")}
              </p>
            )}
          </div>
          {/* GestureHint sits 210px below its parent; from here that is under the copy */}
          <div style={{ position: "absolute", left: "50%", top: 80, transform: "translateX(-50%)", zIndex: 6,
            pointerEvents: "none", opacity: tracking.isTracking ? 0.8 : 0, transition: "opacity 900ms ease" }}>
            <GestureHint kind={step} active={gestureLive} />
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
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            style={{ ...CAPTION_YEAR_STYLE, width: "6em" }} />
        )}
        <TextButton label="save memory" onClick={save} disabled={!canSave}
          style={{ position: "absolute", top: "100%", marginTop: 48, opacity: canSave ? 1 : 0, transition: "opacity 400ms ease" }} />
      </div>
      {/* once kept, the gallery opens on it — the way the naming rim hands over */}
      {phase === "saved" && (
        <TextButton label="see it among the others"
          onClick={() => navigate(CAROUSEL_PATH, { state: { galleryOpen: true, galleryFocusId: memoryId, galleryCarried: true } })}
          style={{ position: "absolute", left: "50%", bottom: 40, transform: "translateX(-50%)", zIndex: 20,
            animation: "descentFadeIn 900ms ease 600ms backwards" }} />
      )}

      <style>{`
        @keyframes descentFadeIn { from { opacity: 0; } to { opacity: 1; } }
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
  // the knobs outlive a run, so "again" replays with the sliders where they were
  const [tune, setTune] = useState<WrapTune>(WRAP_TUNE_DEFAULT);
  const tuneRef = useRef(tune);
  tuneRef.current = tune;
  // the transport too: a paused lab stays paused through "again", at the wrap's first frame
  const transport = useRef<Transport>({ paused: false, speed: SPEED, seek: null, shot: 0, length: 1, active: false });
  // the knob group the timeline last pointed at
  const [focus, setFocus] = useState<string | null>(null);
  return (
    <>
      <DescentRun key={run} onAgain={() => { transport.current.active = false; setRun((r) => r + 1); }} tune={tuneRef} transport={transport} />
      <WrapTunePanel tune={tune} onChange={setTune} focus={focus} />
      <Timeline transport={transport} tune={tune} onChange={setTune} onFocus={setFocus} />
      <style>{`
        .wrap-range { -webkit-appearance: none; appearance: none; width: 100%; height: 16px; margin: 0; background: transparent; cursor: pointer; display: block; }
        .wrap-range::-webkit-slider-runnable-track { height: 1px; background: rgba(123, 123, 135, 0.4); }
        .wrap-range::-moz-range-track { height: 1px; background: rgba(123, 123, 135, 0.4); }
        .wrap-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 9px; height: 9px; border-radius: 50%; margin-top: -4px; background: #7b7b87; border: none; }
        .wrap-range::-moz-range-thumb { width: 9px; height: 9px; border-radius: 50%; background: #7b7b87; border: none; }
        .wrap-range:focus-visible { outline: none; }
        .wrap-range:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 3px rgba(123, 123, 135, 0.25); }
      `}</style>
    </>
  );
}
