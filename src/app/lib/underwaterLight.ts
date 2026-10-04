import * as THREE from "three";

/**
 * The underwater stage shared by the pond's descent and the shape steps: a
 * silver water body lit evenly from the surface overhead, with soft caustics
 * on the surface above and the floor below. Both canvases read the page
 * clock, so the water keeps moving through the hand-off instead of restarting.
 */
export const underwaterTime = () => performance.now() / 1000;

/** Toward the bright surface the light falls from. The camera looks down -z. */
export const UNDERWATER_BEAM_DIR = new THREE.Vector3(-0.12, 0.94, 0.32).normalize();

/** The water body without its light — what shows while a canvas is starting. */
export const UNDERWATER_CSS_BACKGROUND =
  "linear-gradient(180deg, #dcdee2 0%, #c5c8ce 24%, #b3b6bd 50%, #a9acb4 76%, #b4b6bc 100%)";

const beamLiteral = `vec3(${UNDERWATER_BEAM_DIR.x.toFixed(4)}, ${UNDERWATER_BEAM_DIR.y.toFixed(4)}, ${UNDERWATER_BEAM_DIR.z.toFixed(4)})`;

/** Tileable field of light focused by a moving surface; higher powers sharpen the threads. */
const CAUSTIC_FIELD = /* glsl */ `
float causticField(vec2 uv, float t) {
  vec2 p = mod(uv * 6.2831853, 6.2831853) - 250.0;
  vec2 i = p;
  float c = 1.0;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - 3.5 / float(n + 1));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / .005), p.y / (cos(i.y + tt) / .005)));
  }
  c /= 4.0;
  return clamp(1.17 - pow(c, 1.4), 0.0, 1.2);
}
`;

export const UNDERWATER_FORM_UNIFORMS = /* glsl */ `
uniform float uUnderwater;
`;

/**
 * The surface light meeting the form: a soft sheen on the faces turned up
 * toward it, the bright surface mirrored near the silhouette, and light
 * leaking through the far edges.
 */
export const UNDERWATER_FORM_FUNCTION = /* glsl */ `
const vec3 UNDERWATER_BEAM = ${beamLiteral};
vec3 underwaterBeam(vec3 n, vec3 v, float facing) {
  vec3 L = UNDERWATER_BEAM;
  float ndl = dot(n, L);
  float nh = max(dot(n, normalize(L + v)), 0.0);
  float lit = smoothstep(-.2, .8, ndl);
  float grazing = clamp(facing, 0.0, 1.0);
  float edge = pow(grazing, 1.8) * lit;
  float sheen = pow(nh, 14.0) * .3;
  vec3 r = reflect(-v, n);
  float sky = smoothstep(-.05, .9, r.y);
  float mirror = sky * (.05 + .95 * pow(grazing, 3.0));
  float through = pow(max(-ndl, 0.0), 1.4) * pow(grazing, 1.6) * .3;
  float body = max(ndl, 0.0) * .07;
  return vec3(1.0, .997, .99) * (sheen + edge * 1.1 + body + mirror * .7 + through);
}
`;

export function createUnderwaterFormUniforms(amount = 0) {
  return {
    uUnderwater: { value: amount },
  };
}

export const UNDERWATER_BACKDROP_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const UNDERWATER_BACKDROP_FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec2 uResolution;
uniform float uReveal;
uniform vec3 uTint;
uniform float uTintAmount;
varying vec2 vUv;
${CAUSTIC_FIELD}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 p = vec2((uv.x - .5) * aspect, uv.y - .5);

  // Silver water: brightest just under the surface, deepest above the floor.
  vec3 low = vec3(.655, .67, .705);
  vec3 mid = vec3(.70, .715, .745);
  vec3 top = vec3(.865, .872, .89);
  vec3 color = mix(low, mid, smoothstep(.1, .5, uv.y));
  color = mix(color, top, smoothstep(.5, 1.0, uv.y));

  // Light scattered down from the whole surface, widest straight overhead.
  float overhead = exp(-pow(p.x / (.9 * max(aspect, .6)), 2.0)) * smoothstep(-.35, .5, p.y);
  color += vec3(.055) * overhead;

  // The surface seen from below, receding toward eye level.
  float above = uv.y - .5;
  if (above > .2) {
    vec2 sp = vec2(p.x, 1.0) / above * 1.1 + vec2(uTime * .004, uTime * .003);
    float net = pow(causticField(sp, uTime * .16), 3.0);
    float fade = smoothstep(.3, .5, above);
    color += vec3(net) * fade * (.035 + .05 * overhead);
  }

  // A pale floor far below, crossed by its own slower light.
  float below = .5 - uv.y;
  if (below > .2) {
    vec2 fp = vec2(p.x * .55, 1.0) / below * 1.2 + vec2(-uTime * .003, 0.0);
    float net = pow(causticField(fp, uTime * .12 + 11.0), 3.0);
    float floorBand = smoothstep(.3, .44, below);
    color = mix(color, color + vec3(.03), floorBand);
    color += vec3(net) * floorBand * .045;
  }

  color *= 1.0 - .07 * length(p * vec2(.6, 1.0));

  vec3 lum = vec3(.299, .587, .114);
  color = mix(color, color * uTint / max(dot(uTint, lum), .001), uTintAmount);
  color += (hash21(gl_FragCoord.xy) - .5) * .008;
  gl_FragColor = vec4(color, uReveal);
}
`;

export function createUnderwaterBackdropUniforms() {
  return {
    uTime: { value: underwaterTime() },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uReveal: { value: 1 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uTintAmount: { value: 0 },
  };
}
