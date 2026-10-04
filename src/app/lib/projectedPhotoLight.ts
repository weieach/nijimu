import * as THREE from "three";
import { UNDERWATER_BEAM_DIR } from "./underwaterLight";

const beam = UNDERWATER_BEAM_DIR;

/**
 * Shared underwater "light through the photograph" shader. The transition
 * sphere and the real form use this exact code so the light survives the
 * Canvas hand-off without changing character.
 */
export const PROJECTED_PHOTO_UNIFORMS = /* glsl */ `
uniform sampler2D uProjectedPhoto;
uniform float uProjectionStrength;
uniform float uProjectionTime;
varying vec3 vPhotoProjectPos;
`;

export const PROJECTED_PHOTO_FUNCTION = /* glsl */ `
vec3 projectedPhotoLight(vec3 n) {
  // Front-project the photograph onto the form, then let water motion disturb
  // it. It should read as transmitted colour and shadow, not a crisp projector.
  vec2 uv = vPhotoProjectPos.xy * .42 + .5;
  vec2 flow = vec2(
    sin(uv.y * 13.0 + uProjectionTime * .42),
    sin(uv.x * 11.0 - uProjectionTime * .34)
  ) * .012;
  flow += vec2(
    sin((uv.x + uv.y) * 19.0 - uProjectionTime * .2),
    cos((uv.x - uv.y) * 17.0 + uProjectionTime * .27)
  ) * .006;
  vec2 q = uv + flow;

  // Five taps are enough to make the projected image feel refracted rather
  // than printed while preserving its broad light and dark masses.
  vec2 px = vec2(.008);
  vec3 photo = texture2D(uProjectedPhoto, q).rgb * .36;
  photo += texture2D(uProjectedPhoto, q + vec2(px.x, 0.0)).rgb * .16;
  photo += texture2D(uProjectedPhoto, q - vec2(px.x, 0.0)).rgb * .16;
  photo += texture2D(uProjectedPhoto, q + vec2(0.0, px.y)).rgb * .16;
  photo += texture2D(uProjectedPhoto, q - vec2(0.0, px.y)).rgb * .16;

  float luma = dot(photo, vec3(.2126, .7152, .0722));
  vec3 transmitted = mix(vec3(luma), photo, .58);
  transmitted = (transmitted - .5) * 1.12 + .5;

  vec2 edge = min(q, 1.0 - q);
  float mask = smoothstep(0.0, .13, min(edge.x, edge.y));
  // The photograph floats in the same opening the beam comes through.
  vec3 beam = vec3(${beam.x.toFixed(4)}, ${beam.y.toFixed(4)}, ${beam.z.toFixed(4)});
  float fromAbove = .34 + .66 * max(dot(n, beam), 0.0);
  float caustic = .8 + .2 * sin(q.x * 25.0 + sin(q.y * 17.0) + uProjectionTime * .65);
  // A small milk floor keeps the projector's footprint available even where
  // the photograph is dark; the receiving material uses it to withhold light.
  return (clamp(transmitted, 0.0, 1.0) + vec3(.07))
    * mask * fromAbove * caustic * uProjectionStrength;
}
`;

export function createProjectedPhotoUniforms(texture: THREE.Texture | null = null) {
  return {
    uProjectedPhoto: { value: texture },
    uProjectionStrength: { value: 0 },
    uProjectionTime: { value: 0 },
  };
}
