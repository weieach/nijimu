import * as THREE from "three";

/*
 * The cut of 35mm both labs draw: one 36×24 frame and a little of its
 * neighbours. Geometry is in millimetres so the perforations keep the real
 * pitch whatever size the strip is shown at.
 */

export const STRIP_MM = { length: 46, width: 35 };

/** Constants for a fragment shader working in mm: the strip, its window, the perforations. */
export const STRIP_GLSL = /* glsl */ `
  const vec2 STRIP = vec2(${STRIP_MM.length.toFixed(1)}, ${STRIP_MM.width.toFixed(1)});
  const vec2 WINDOW = vec2(18.0, 12.0);
  const float PITCH = 4.75;
  const float HOLE_Y = 14.1;
  const vec2 HOLE = vec2(.99, 1.395);
  /* The perforations can be made less of: uHoleShrink takes that fraction off each
     side (x across the strip's length, y its width; 1 and they are gone), uHoleFade
     is how far the cut stops short of going through (1 and it is only a mark).
     Both are 0 unless set, so a shader that does not carry them draws true 35mm. */
  uniform vec2 uHoleShrink;
  uniform float uHoleFade;
  float stripRoundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
  /** Signed distance to the nearest perforation, mm; far away once they are gone. */
  float stripHole(vec2 mm) {
    vec2 b = HOLE * clamp(1.0 - uHoleShrink, 0.0, 1.0);
    if (min(b.x, b.y) < .02) return 1e3;
    float hx = mod(mm.x + PITCH * .5, PITCH) - PITCH * .5;
    return stripRoundedBox(vec2(hx, abs(mm.y) - HOLE_Y), b, min(.42, min(b.x, b.y)));
  }
`;

/** The stock's colours: an even base, the two tints it drifts between across
    the strip (the first where the drift is low, the second where it is high),
    and the colour of its stains. All sit at the same lightness and about the
    same, small, chroma — the strips differ in hue, not in weight. */
export interface StockPalette {
  name: string;
  base: [number, number, number];
  low: [number, number, number];
  high: [number, number, number];
  stain: [number, number, number];
}

export const STOCKS: StockPalette[] = [
  // the first cut, against an Ilford contact strip: cool grey into brown-pink
  { name: "grey-pink", base: [.815, .822, .83], low: [.77, .80, .83], high: [.845, .775, .76], stain: [.82, .72, .70] },
  // nearly neutral: a cooler grey into a warmer one
  { name: "grey", base: [.805, .81, .815], low: [.76, .775, .80], high: [.83, .815, .795], stain: [.77, .75, .735] },
  // the user's own, set in the preview: grey into a pale green-grey, a warm grey stain
  { name: "grey-green", base: [.816, .824, .831], low: [.776, .788, .804], high: [.804, .855, .820], stain: [.827, .796, .773] },
];

/** The stock the labs start on. */
export const STOCK_DEFAULT = 2;

/** The four colours of a palette, in the order they are shown and edited. */
export const STOCK_PARTS: { key: keyof Omit<StockPalette, "name">; label: string }[] = [
  { key: "low", label: "cool end" },
  { key: "base", label: "base" },
  { key: "high", label: "warm end" },
  { key: "stain", label: "stain" },
];

export function stockHex(c: [number, number, number]): string {
  return "#" + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("");
}

export function stockFromHex(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** The strip-level settings the preview tunes and the descent inherits. */
export const SHEET_DEFAULT = {
  /** How much of the window the photo covers; the rest is the stock showing through. */
  photoOpacity: 0.68,
  /** Over how many mm the photo's edge thins into the stock. */
  edgeFade: 2.5,
  /** The stock's translucency where it is thick and where it is thin. */
  stockThick: 0.88,
  stockThin: 0.6,
  /** How much the perforations' cut edges catch the light, 0–1. */
  holeRim: 1,
  /** How much is taken off the perforations, along and across the strip (0 is true 35mm, 1 none). */
  holeShrink: [0, 0] as [number, number],
  /** How far short of cutting through the perforations stop (0 cut, 1 a faint mark). */
  holeFade: 0,
  /** The photo drained to grey (0 as the film look leaves it, 1 grey). */
  mono: 0,
  /** The photo as a negative (0 the positive print, 1 the negative). */
  negative: 0,
};

/**
 * The sheet: how the stock is coloured and how much light it passes, how the
 * photo's dye sits in the window, and how a cut edge reads. Shared by both
 * labs. Needs STRIP_GLSL and FILM_LOOK_GLSL (for filmNoise) pasted before it.
 * Everything is in mm, `seed` placing this strip's drift and stains.
 */
export const SHEET_GLSL = /* glsl */ `
  uniform vec3 uStockBase;
  uniform vec3 uStockLow;
  uniform vec3 uStockHigh;
  uniform vec3 uStockStain;
  uniform float uPhotoOpacity;
  uniform float uEdgeFade;
  uniform float uStockThick;
  uniform float uStockThin;
  uniform float uHoleRim;
  /* The photo after its film look: uMono drains its colour to grey, uNegative turns
     it into the negative (both 0…1, 0 unless set — the positive print as developed). */
  uniform float uMono;
  uniform float uNegative;

  /* The stock: an even base with a slow drift between two tints across the strip, a stain
     or two, a little darker toward the long edges. Then its thickness, which is not even —
     slow patches with a finer weave inside — so it reads lighter and passes more light
     where it is thin, and a broad wash of light lies across it. */
  void sheetStock(vec2 mm, float seed, out vec3 base, out float stockAlpha) {
    vec3 evenBase = uStockBase + (filmNoise(mm * .35 + seed) - .5) * .03;
    float drift = filmNoise(vec2(mm.x * .035, mm.y * .05) + seed * 3.0) * .8 + (mm.x / STRIP.x + .5) * .2;
    base = mix(evenBase, uStockLow, (1.0 - smoothstep(.2, .5, drift)) * .5);
    base = mix(base, uStockHigh, smoothstep(.5, .85, drift) * .55);
    float stain = smoothstep(.6, .9, filmNoise(vec2(mm.x * .12, mm.y * .09) + seed * 5.0));
    base = mix(base, uStockStain, stain * .35);
    base = mix(base, base * .96, smoothstep(15.5, 17.5, abs(mm.y)) * .5);
    float thick = filmNoise(mm * vec2(.07, .11) + seed * 2.0) * .6 + filmNoise(mm * vec2(.28, .42) - seed) * .4;
    float thin = smoothstep(.3, .75, thick);
    float wash = smoothstep(-.3, 1.1, dot(mm / STRIP, vec2(.55, .85)) + (filmNoise(mm * .04 + seed) - .5) * .6);
    base = mix(base, base * 1.05 + .025, thin * .6 + wash * .3);
    stockAlpha = mix(uStockThick, uStockThin, thin) - wash * .08;
  }

  /* The window has no hard frame: the dye thins out over uEdgeFade mm around its edge,
     unevenly, and a little of it bleeds past the edge into the stock. */
  float sheetWindow(vec2 mm, float seed) {
    float dw = stripRoundedBox(mm, WINDOW, .4);
    float bleed = (filmNoise(mm * .5 + seed * 6.0) - .5) * uEdgeFade * .7
      + (filmNoise(mm * 1.7 - seed) - .5) * uEdgeFade * .25;
    return 1.0 - smoothstep(-uEdgeFade * .7, uEdgeFade * .3 + fwidth(dw), dw + bleed);
  }

  /* The image is dye: dense where it is dark, and in its lights what is behind comes through. */
  float sheetDyeAlpha(float luma) {
    return mix(.58, .97, smoothstep(.95, .3, luma));
  }

  /* The cut edge has a thickness: it catches a hair of light, is denser seen through, and a
     faint shade lies just inside it. The perforations are cut the same way. d and dh are the
     signed distances to the outline and to the nearest perforation, mm. */
  void sheetEdge(float d, float dh, inout vec3 color, inout float a) {
    float inside = -d;
    float rim = smoothstep(0.0, .22, inside) * (1.0 - smoothstep(.22, .8, inside));
    float shade = smoothstep(.8, 1.5, inside) * (1.0 - smoothstep(1.5, 2.8, inside));
    float holeRim = smoothstep(0.0, .18, dh) * (1.0 - smoothstep(.18, .6, dh)) * uHoleRim * (1.0 - uHoleFade);
    color += rim * .07 + holeRim * .06 - shade * .022;
    a += (1.0 - smoothstep(0.0, .9, inside)) * .22 + holeRim * .18;
  }
`;

/**
 * The strip's face, factored out of the descent's filmFragment so a curved
 * sheet can draw the same strip: the torn outline, the worn coverage, and
 * the stock with the photo as dye in its window, the cut edge and the edge
 * print. Needs STRIP_GLSL, FILM_LOOK_GLSL and SHEET_GLSL pasted before it.
 * mm is the fragment's place on the strip; what the caller does with the
 * result (develop, dissolve, sheen, the far face) stays the caller's.
 */
export const STRIP_FACE_GLSL = /* glsl */ `
  float stripHash1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
  float stripNoise1(float x) {
    float i = floor(x), f = fract(x);
    return mix(stripHash1(i), stripHash1(i + 1.0), f * f * (3.0 - 2.0 * f));
  }
  /* The outline: a rounded box whose short ends are torn. Signed distance, mm. */
  float stripTornOutline(vec2 mm, float seed) {
    float side = sign(mm.x) * 13.0;
    float torn = (stripNoise1(mm.y * .32 + side + seed * 7.0) * .75
      + stripNoise1(mm.y * 1.3 + side + seed) * .2
      + stripNoise1(mm.y * 6.0 + side) * .05) * 1.4;
    return stripRoundedBox(mm, vec2(STRIP.x * .5 - torn, STRIP.y * .5), .35);
  }
  /* Coverage at mm: the edge is worn — it blurs out over a fraction of a millimetre, more where
     it has been handled; wear scales that feather (1 = .35–1.6 mm) — thinned along the long
     edges in scuffs where the base shows through, and the perforations are cut. */
  float stripCoverage(vec2 mm, float seed, float d, float dh, float wear) {
    float aa = fwidth(d);
    float along = mm.x * .7 + mm.y * .25;
    float feather = (.35 + .9 * stripNoise1(along * .9 + seed * 3.0) + .35 * stripNoise1(along * 5.0 + seed)) * wear;
    float alpha = 1.0 - smoothstep(-feather - aa, aa, d);
    float scuff = filmNoise(vec2(mm.x * .45, mm.y * 2.0) + seed * 4.0);
    alpha *= 1.0 - smoothstep(13.0, 17.0, abs(mm.y)) * smoothstep(.45, .85, scuff) * .35;
    // the perforation: cut through, or with uHoleFade only part way — a thinner place in the stock
    float cut = smoothstep(-fwidth(dh) - .12, fwidth(dh), dh);
    alpha *= mix(cut, mix(.55, 1.0, cut), uHoleFade);
    return alpha;
  }
  /* The face: the stock, and in its window the photo developed through filmLook and laid in as
     dye at less than full cover; the cut edge; the edge print. inFrame is the window's extent
     (sheetWindow, or wider where the caller lets the dye bleed); develop 0…1.45 brings the image
     up darks first; bias blurs the photo (the far face). color and a are the face's colour and
     its translucency — the outline's coverage is stripCoverage, kept apart. */
  void stripFace(vec2 mm, float seed, float d, float dh, float inFrame, sampler2D photo, float imageAspect, float bias,
      sampler2D edgePrint, float develop, out vec3 color, out float a) {
    vec3 base;
    float stockAlpha;
    sheetStock(mm, seed, base, stockAlpha);

    // the window: the photo covers the 36×24 frame, cropped to it
    vec2 q = mm / (WINDOW * 2.0);
    float boxAspect = WINDOW.x / WINDOW.y;
    vec2 uv = q;
    if (boxAspect > imageAspect) uv.y *= imageAspect / boxAspect;
    else uv.x *= boxAspect / imageAspect;
    vec3 image = filmLook(photo, uv + .5, bias);
    // grey, then the negative; the dye's density follows what is left
    image = mix(image, vec3(filmLuma(image)), uMono);
    image = mix(image, 1.0 - image, uNegative);
    float luma = filmLuma(image);
    float windowAlpha = sheetDyeAlpha(luma);
    // the stock's own tint shows through the dye a little
    image = mix(image, image * base * 1.15, .18);
    // the empty window: clear stock, a shade lighter than the rest and thinner. The photo
    // develops into it unevenly, its darks first, the way an image comes up in the tray,
    // and even developed covers it only in part, so the stock shows through the picture
    vec3 blank = base * vec3(1.02, 1.025, 1.03);
    float comesUp = luma * .6 + filmNoise(mm * 1.1 + seed * 2.0) * .4;
    float up = smoothstep(comesUp, comesUp + .45, develop);
    float cover = inFrame * uPhotoOpacity * up;
    color = mix(mix(base, blank, inFrame), image, cover);
    a = mix(mix(stockAlpha, stockAlpha * .55, inFrame), windowAlpha, cover);
    sheetEdge(d, dh, color, a);

    vec4 print = texture2D(edgePrint, mm / STRIP + .5);
    color = mix(color, vec3(.40, .42, .47), print.a * .5);
  }
`;

/** The uniforms SHEET_GLSL reads, set to the default stock and sheet. */
export function sheetUniforms(stock: StockPalette = STOCKS[STOCK_DEFAULT]) {
  const uniforms = {
    uStockBase: { value: new THREE.Vector3() },
    uStockLow: { value: new THREE.Vector3() },
    uStockHigh: { value: new THREE.Vector3() },
    uStockStain: { value: new THREE.Vector3() },
    uPhotoOpacity: { value: SHEET_DEFAULT.photoOpacity },
    uEdgeFade: { value: SHEET_DEFAULT.edgeFade },
    uStockThick: { value: SHEET_DEFAULT.stockThick },
    uStockThin: { value: SHEET_DEFAULT.stockThin },
    uHoleRim: { value: SHEET_DEFAULT.holeRim },
    uHoleShrink: { value: new THREE.Vector2(...SHEET_DEFAULT.holeShrink) },
    uHoleFade: { value: SHEET_DEFAULT.holeFade },
    uMono: { value: SHEET_DEFAULT.mono },
    uNegative: { value: SHEET_DEFAULT.negative },
  };
  setStock(uniforms, stock);
  return uniforms;
}

export function setStock(uniforms: ReturnType<typeof sheetUniforms>, stock: StockPalette) {
  uniforms.uStockBase.value.fromArray(stock.base);
  uniforms.uStockLow.value.fromArray(stock.low);
  uniforms.uStockHigh.value.fromArray(stock.high);
  uniforms.uStockStain.value.fromArray(stock.stain);
}

/** The edge printing — stock name along the top, frame numbers and a ruler
    along the bottom — drawn once, in mm, onto a transparent texture. */
export function createEdgePrint(frame: number): THREE.CanvasTexture {
  const pxPerMm = 40;
  const canvas = document.createElement("canvas");
  canvas.width = STRIP_MM.length * pxPerMm;
  canvas.height = STRIP_MM.width * pxPerMm;
  const ctx = canvas.getContext("2d");
  const mm = (v: number) => v * pxPerMm;
  if (ctx) {
    // thin, as printed through the edge of the negative: SF Mono light where it exists
    const face = "'SF Mono', ui-monospace, Menlo, monospace";
    ctx.fillStyle = "#000";
    ctx.strokeStyle = "#000";
    ctx.textBaseline = "alphabetic";
    ctx.font = `300 ${mm(1.4)}px ${face}`;
    ctx.fillText("NIJIMU 100", mm(5), mm(1.65));
    ctx.fillText("NIJIMU 100", mm(33), mm(1.65));
    ctx.font = `300 ${mm(1.5)}px ${face}`;
    ctx.fillText(String(frame), mm(7.5), mm(34.6));
    ctx.fillText(`${frame}A`, mm(36), mm(34.6));
    ctx.lineWidth = mm(0.12);
    ctx.beginPath();
    ctx.moveTo(mm(12.5), mm(33.3));
    ctx.lineTo(mm(13.7), mm(33.9));
    ctx.lineTo(mm(12.5), mm(34.5));
    ctx.closePath();
    ctx.stroke();
    for (let i = 0; i <= 12; i++) {
      const tall = i % 4 === 0 ? 1.1 : 0.6;
      ctx.fillRect(mm(16 + i * 1.2), mm(33.2), mm(0.14), mm(tall));
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}
