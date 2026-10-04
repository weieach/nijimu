import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CHROME_GRAY } from "../lib/colors";
import { META, NOTE_SIZE, SANS, SERIF, TITLE } from "../lib/theme";
import { TextButton } from "../components/TextButton";
import {
  FILM_LOOK_DEFAULT,
  FILM_LOOK_GLSL,
  filmLookUniforms,
  prepareFilmPhoto,
  setFilmLook,
  type FilmLook,
} from "../lib/filmLook";
import {
  SHEET_DEFAULT, SHEET_GLSL, STOCKS, STOCK_DEFAULT, STOCK_PARTS, STRIP_GLSL, STRIP_MM, createEdgePrint, setStock, sheetUniforms,
  stockFromHex, stockHex, type StockPalette,
} from "./filmStrip";
import photoA from "../../assets/memory-photo.jpg";
import photoB from "../../assets/memory-photo-02.png";

/*
 * Lab: the film look, flat. One strip facing the viewer, nothing moving,
 * so the photo's development — tone, cast, softness, grain — can be judged
 * on its own before it rides the strip in the descent. Drop a photo on the
 * page or choose one; hold the strip to see the photo as it was uploaded.
 * The sliders are the look's parameters (lib/filmLook.ts); "copy" puts the
 * current values on the clipboard as the defaults would be written.
 */

const PHOTOS = [photoA, photoB];

const stripVertex = /* glsl */ `
  varying vec2 vMm;
  void main() {
    vMm = position.xy * vec2(${STRIP_MM.length.toFixed(1)}, ${STRIP_MM.width.toFixed(1)});
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/* The strip's outline, shared by the sheet and its shadow: the torn short
   ends and the perforations, as signed distances in mm. */
const OUTLINE_GLSL = /* glsl */ `
  uniform float uSeed;
  varying vec2 vMm;
  float hash1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
  float noise1(float x) {
    float i = floor(x), f = fract(x);
    return mix(hash1(i), hash1(i + 1.0), f * f * (3.0 - 2.0 * f));
  }
  float stripOutline(vec2 mm) {
    float side = sign(mm.x) * 13.0;
    float torn = (noise1(mm.y * .32 + side + uSeed * 7.0) * .75
      + noise1(mm.y * 1.3 + side + uSeed) * .2
      + noise1(mm.y * 6.0 + side) * .05) * 1.4;
    return stripRoundedBox(mm, vec2(STRIP.x * .5 - torn, STRIP.y * .5), .35);
  }
`;

/* The sheet's shadow on the paper: soft, a little cooler than the paper,
   lighter under the window where the light comes through the dye. */
const shadowFragment = /* glsl */ `
  ${STRIP_GLSL}
  ${OUTLINE_GLSL}
  void main() {
    vec2 mm = vMm;
    float d = stripOutline(mm);
    // a blur, not an outline: the falloff is 8 mm wide and most of it lies under the sheet,
    // so only its far side shows. The perforations are not cut out — at this blur they would
    // read as a second row of holes, a second sheet
    float a = 1.0 - smoothstep(-6.0, 2.0, d);
    vec2 q = abs(mm) / WINDOW;
    float window = (1.0 - smoothstep(.7, 1.1, q.x)) * (1.0 - smoothstep(.7, 1.1, q.y));
    gl_FragColor = vec4(vec3(.58, .60, .62), a * mix(.14, .07, window));
  }
`;

/* The stock as the descent draws it — pale grey, a drift toward brown-pink,
   torn ends, worn edges — without its morph, float and dissolve, and then
   made a sheet: a thickness that is not even, so light comes through it in
   patches; a cut edge that catches light; a window whose dye is dense in the
   darks and lets the paper through in the lights. */
const stripFragment = /* glsl */ `
  ${STRIP_GLSL}
  ${FILM_LOOK_GLSL}
  ${OUTLINE_GLSL}
  ${SHEET_GLSL}
  uniform sampler2D uPhoto;
  uniform sampler2D uEdgePrint;
  uniform float uImageAspect;
  void main() {
    vec2 mm = vMm;
    float d = stripOutline(mm);
    float aa = fwidth(d);
    float along = mm.x * .7 + mm.y * .25;
    float wear = .35 + .9 * filmNoise(vec2(along * .9 + uSeed * 3.0, 0.0)) + .35 * noise1(along * 5.0 + uSeed);
    float alpha = 1.0 - smoothstep(-wear - aa, aa, d);
    float scuff = filmNoise(vec2(mm.x * .45, mm.y * 2.0) + uSeed * 4.0);
    alpha *= 1.0 - smoothstep(13.0, 17.0, abs(mm.y)) * smoothstep(.45, .85, scuff) * .35;
    float dh = stripHole(mm);
    alpha *= smoothstep(-fwidth(dh) - .12, fwidth(dh), dh);
    if (alpha < .01) discard;

    vec3 base;
    float stockAlpha;
    sheetStock(mm, uSeed, base, stockAlpha);

    // the window: the photo covers the 36×24 frame, cropped to it
    vec2 q = mm / (WINDOW * 2.0);
    float boxAspect = WINDOW.x / WINDOW.y;
    vec2 uv = q;
    if (boxAspect > uImageAspect) uv.y *= uImageAspect / boxAspect;
    else uv.x *= boxAspect / uImageAspect;
    vec3 photo = filmLook(uPhoto, uv + .5);
    float inFrame = sheetWindow(mm, uSeed);
    float windowAlpha = sheetDyeAlpha(filmLuma(photo));
    // the stock's own tint shows through the dye a little
    photo = mix(photo, photo * base * 1.15, .18);
    // the image is a layer of dye on the stock, not full cover: at less than full opacity the
    // stock's drift and stains come through it, so the photo changes with the strip
    float cover = inFrame * uPhotoOpacity;
    vec3 color = mix(base, photo, cover);
    float a = mix(stockAlpha, windowAlpha, cover);
    sheetEdge(d, dh, color, a);

    vec4 print = texture2D(uEdgePrint, mm / STRIP + .5);
    color = mix(color, vec3(.40, .42, .47), print.a * .5);

    gl_FragColor = vec4(color, alpha * clamp(a, 0.0, 1.0));
  }
`;

const loader = new THREE.TextureLoader();

/** Unexposed stock until the photo arrives. */
const BLANK_PHOTO = (() => {
  const texture = new THREE.DataTexture(new Uint8Array([236, 239, 239, 255]), 1, 1);
  texture.needsUpdate = true;
  return texture;
})();

function Strip({ url, look, stock, photoOpacity, edgeFade, seed }:
  { url: string; look: FilmLook; stock: StockPalette; photoOpacity: number; edgeFade: number; seed: number }) {
  const { size } = useThree();
  // the look, the stock and the seed are written into these on every render; only the photo lives here
  const uniforms = useMemo(() => ({
    ...filmLookUniforms(),
    ...sheetUniforms(),
    uPhoto: { value: BLANK_PHOTO as THREE.Texture },
    uEdgePrint: { value: createEdgePrint(1 + Math.floor(Math.random() * 36)) },
    uImageAspect: { value: 1.5 },
    uSeed: { value: 0 },
  }) as Record<string, THREE.IUniform> & ReturnType<typeof sheetUniforms>
    & { uPhoto: THREE.IUniform<THREE.Texture>; uImageAspect: THREE.IUniform<number> }, []);
  const shadowUniforms = useMemo(() => ({ uSeed: { value: 0 } }), []);
  setFilmLook(uniforms, look);
  setStock(uniforms, stock);
  uniforms.uPhotoOpacity.value = photoOpacity;
  uniforms.uEdgeFade.value = edgeFade;
  // one seed for the strip's tears and stains, its shadow, and where the light gets in
  uniforms.uSeed.value = seed;
  uniforms.uFilmSeed.value = seed;
  shadowUniforms.uSeed.value = seed;

  useEffect(() => {
    let live = true;
    let texture: THREE.Texture | null = null;
    loader.loadAsync(url).then((t) => {
      if (!live) { t.dispose(); return; }
      texture = t;
      const image = t.image as { width: number; height: number };
      uniforms.uPhoto.value = prepareFilmPhoto(t);
      uniforms.uImageAspect.value = image.width / image.height;
    }).catch(() => undefined);
    return () => { live = false; texture?.dispose(); };
  }, [url, uniforms]);

  // the strip takes most of the width left of the sliders, and never more than its mm scale ×18
  const width = Math.min((size.width - 300) * 0.86, STRIP_MM.length * 18);
  const height = width * STRIP_MM.width / STRIP_MM.length;
  const px = width / STRIP_MM.length;
  return <>
    {/* the shadow it throws on the paper, lit from the upper left: off to the lower right
        by more than its blur, so it falls to one side instead of ringing the sheet */}
    <mesh scale={[width, height, 1]} position={[-130 + 2.6 * px, -3.6 * px, -1]} renderOrder={0}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial transparent depthTest={false} depthWrite={false}
        vertexShader={stripVertex} fragmentShader={shadowFragment} uniforms={shadowUniforms} />
    </mesh>
    <mesh scale={[width, height, 1]} position={[-130, 0, 0]} renderOrder={1}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial transparent depthTest={false} depthWrite={false}
        vertexShader={stripVertex} fragmentShader={stripFragment} uniforms={uniforms} />
    </mesh>
  </>;
}

interface Knob { key: keyof FilmLook; label: string; min: number; max: number; step: number }
const KNOBS: Knob[] = [
  { key: "soft", label: "softness", min: 0, max: 1, step: 0.01 },
  { key: "bloom", label: "bloom", min: 0, max: 1, step: 0.01 },
  { key: "halation", label: "halation", min: 0, max: 1, step: 0.01 },
  { key: "exposure", label: "exposure", min: -1, max: 1, step: 0.01 },
  { key: "lift", label: "black lift", min: 0, max: 0.25, step: 0.005 },
  { key: "contrast", label: "contrast", min: 0.5, max: 1.2, step: 0.01 },
  { key: "shoulder", label: "shoulder", min: 0, max: 1, step: 0.01 },
  { key: "saturation", label: "saturation", min: 0, max: 1.2, step: 0.01 },
  { key: "lean", label: "lean  cool · warm", min: -1, max: 1, step: 0.01 },
  { key: "split", label: "crossover", min: 0, max: 1, step: 0.01 },
  { key: "grain", label: "grain", min: 0, max: 0.1, step: 0.001 },
  { key: "grainSize", label: "grain size", min: 1, max: 4, step: 0.1 },
  { key: "mottle", label: "mottle", min: 0, max: 1, step: 0.01 },
  { key: "vignette", label: "vignette", min: 0, max: 1, step: 0.01 },
  { key: "leak", label: "light leak", min: 0, max: 1, step: 0.01 },
];

/** /lab/film — the developed photo on a flat strip, with the look's knobs. */
export function FilmPreview() {
  const [look, setLook] = useState<FilmLook>(FILM_LOOK_DEFAULT);
  const [url, setUrl] = useState<string>(PHOTOS[0]);
  const [asShot, setAsShot] = useState(false);
  const [copied, setCopied] = useState(false);
  const [seed, setSeed] = useState(() => Math.random() * 10);
  // the bundled stocks and then the user's own, which can be edited and removed
  const [stocks, setStocks] = useState<StockPalette[]>(STOCKS);
  const [stockIndex, setStockIndex] = useState(STOCK_DEFAULT);
  const [photoOpacity, setPhotoOpacity] = useState(SHEET_DEFAULT.photoOpacity);
  const [edgeFade, setEdgeFade] = useState(SHEET_DEFAULT.edgeFade);
  const stock = stocks[stockIndex] ?? stocks[0];
  const custom = stockIndex >= STOCKS.length;
  const inputRef = useRef<HTMLInputElement>(null);

  const addStock = () => {
    const n = stocks.length - STOCKS.length + 1;
    setStocks((all) => [...all, { ...stock, name: `own ${n}` }]);
    setStockIndex(stocks.length);
  };
  const removeStock = () => {
    setStocks((all) => all.filter((_, i) => i !== stockIndex));
    setStockIndex(Math.max(0, stockIndex - 1));
  };
  const tint = (key: (typeof STOCK_PARTS)[number]["key"], hex: string) =>
    setStocks((all) => all.map((s, i) => i === stockIndex ? { ...s, [key]: stockFromHex(hex) } : s));

  const takeFile = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    setUrl(URL.createObjectURL(file));
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); takeFile(e.dataTransfer.files?.[0]); };
  const shown = asShot ? { ...look, amount: 0 } : look;

  const copy = async () => {
    const lines = (Object.keys(look) as (keyof FilmLook)[]).map((k) => `  ${k}: ${Number(look[k].toFixed(3))},`);
    try {
      const palette = custom
        ? `\n{ name: "${stock.name}", ${STOCK_PARTS.map(({ key }) => `${key}: [${stock[key].map((v) => Number(v.toFixed(3))).join(", ")}]`).join(", ")} }`
        : ` ${stock.name}`;
      await navigator.clipboard.writeText(`{\n${lines.join("\n")}\n}\n// stock:${palette}\n// photo opacity: ${photoOpacity.toFixed(2)}, edge fade: ${edgeFade.toFixed(1)} mm`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard refused — the values are still on screen */ }
  };

  return (
    <main onDragOver={(e) => e.preventDefault()} onDrop={onDrop}
      style={{ position: "relative", width: "100%", height: "100dvh", overflow: "hidden",
        background: "linear-gradient(#ededE8, #e4e6e3 50%, #d6dcd9)" }}>
      <Canvas orthographic camera={{ position: [0, 0, 10], zoom: 1, near: 0.1, far: 100 }}
        dpr={[1, 2]} gl={{ antialias: true, alpha: true }} style={{ position: "absolute", inset: 0 }}>
        <Strip url={url} look={shown} stock={stock} photoOpacity={photoOpacity} edgeFade={edgeFade} seed={seed} />
      </Canvas>

      <p style={{ ...META, position: "absolute", top: 26, left: 28, margin: 0, zIndex: 20 }}>lab — film</p>

      <div style={{ position: "absolute", left: "calc(50% - 130px)", top: 56, transform: "translateX(-50%)", width: "min(30em, 70vw)",
        textAlign: "center", pointerEvents: "none" }}>
        <p style={{ ...TITLE, margin: 0, color: CHROME_GRAY }}>the photo, developed</p>
        <p style={{ margin: "8px 0 0", fontFamily: SERIF, fontSize: NOTE_SIZE, lineHeight: 1.45, color: CHROME_GRAY }}>
          drop a photo anywhere, or choose one below. hold the strip to see the photo as it was.
        </p>
      </div>

      {/* the strip is the compare control: press to see the photo as uploaded */}
      <button type="button" aria-label="hold to see the photo as it was" aria-pressed={asShot}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic events have no pointer to capture */ }
          setAsShot(true);
        }}
        onPointerUp={() => setAsShot(false)} onPointerCancel={() => setAsShot(false)} onLostPointerCapture={() => setAsShot(false)}
        onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); setAsShot(true); } }}
        onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setAsShot(false); } }}
        onContextMenu={(e) => e.preventDefault()}
        style={{ position: "absolute", left: 0, top: 0, bottom: 0, right: 300, border: "none", outline: "none",
          background: "transparent", touchAction: "none", cursor: "default", zIndex: 5 }} />

      <div style={{ position: "absolute", left: "calc(50% - 130px)", bottom: 34, transform: "translateX(-50%)", display: "flex",
        alignItems: "center", gap: 14, zIndex: 10 }}>
        <TextButton label="choose a photo" onClick={() => inputRef.current?.click()} />
        <span style={{ fontFamily: SANS, fontSize: NOTE_SIZE, color: CHROME_GRAY, opacity: 0.6, marginLeft: 10 }}>or one of these</span>
        {PHOTOS.map((p) => (
          <button key={p} type="button" aria-label="select photo" aria-pressed={url === p} onClick={() => setUrl(p)}
            style={{ width: 44, height: 44, flex: "0 0 44px", padding: 0, overflow: "hidden", borderRadius: "50%",
              border: `1px solid rgba(123, 123, 135, ${url === p ? 0.6 : 0.25})`, background: "#e7e7e8",
              boxShadow: "0 6px 18px rgba(40, 36, 48, 0.1)", cursor: "pointer", opacity: 0.85 }}>
            <img src={p} alt="" style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} />
          </button>
        ))}
        <span aria-live="polite" style={{ fontFamily: SANS, fontSize: NOTE_SIZE, color: CHROME_GRAY, opacity: asShot ? 0.7 : 0,
          transition: "opacity 300ms ease", marginLeft: 10 }}>as uploaded</span>
      </div>
      <input ref={inputRef} type="file" accept="image/*" aria-label="choose a photo" style={{ display: "none" }}
        onChange={(e) => takeFile(e.target.files?.[0])} />

      {/* the knobs */}
      <aside aria-label="film look" style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 260, padding: "64px 28px 28px 24px",
        boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 10, zIndex: 10, overflowY: "auto",
        borderLeft: "1px solid rgba(123, 123, 135, 0.14)", background: "rgba(236, 237, 236, 0.5)", backdropFilter: "blur(6px)" }}>
        {/* the stock: each swatch runs from the tint where the drift is low to where it is high */}
        <div style={{ marginBottom: 8 }}>
          <span style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: NOTE_SIZE, color: CHROME_GRAY }}>
            <span>stock</span>
            <span style={{ opacity: 0.6 }}>{stock.name}</span>
          </span>
          <div role="radiogroup" aria-label="stock" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {stocks.map((s, i) => {
              const on = i === stockIndex;
              return (
                <button key={i} type="button" role="radio" aria-checked={on} aria-label={s.name} onClick={() => setStockIndex(i)}
                  style={{ width: 44, height: 22, padding: 0, borderRadius: 3, cursor: "pointer",
                    border: `1px solid rgba(123, 123, 135, ${on ? 0.7 : 0.22})`, boxShadow: on ? "0 0 0 2px rgba(236, 237, 236, 1), 0 0 0 3px rgba(123, 123, 135, 0.35)" : "none",
                    background: `linear-gradient(100deg, ${stockHex(s.low)}, ${stockHex(s.base)} 45%, ${stockHex(s.high)})` }} />
              );
            })}
            {/* a new stock starts as a copy of the one chosen, then takes its own colours */}
            <button type="button" aria-label="add a stock from this one" onClick={addStock}
              style={{ width: 44, height: 22, padding: 0, borderRadius: 3, cursor: "pointer", border: "1px dashed rgba(123, 123, 135, 0.4)",
                background: "transparent", color: CHROME_GRAY, fontFamily: SANS, fontSize: NOTE_SIZE, lineHeight: 1, opacity: 0.7 }}>+</button>
          </div>
          {custom && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              {STOCK_PARTS.map(({ key, label }) => (
                <label key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: SANS,
                  fontSize: NOTE_SIZE, color: CHROME_GRAY, cursor: "pointer" }}>
                  <span>{label}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ opacity: 0.6, fontVariantNumeric: "tabular-nums" }}>{stockHex(stock[key])}</span>
                    <input type="color" className="film-color" aria-label={`${label} colour`} value={stockHex(stock[key])}
                      onChange={(e) => tint(key, e.target.value)} />
                  </span>
                </label>
              ))}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 2 }}>
                <TextButton label="remove this stock" onClick={removeStock} style={{ fontSize: NOTE_SIZE }} />
              </div>
            </div>
          )}
        </div>
        <label style={{ display: "block", marginBottom: 4 }}>
          <span style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: NOTE_SIZE, color: CHROME_GRAY }}>
            <span>photo opacity</span>
            <span style={{ opacity: 0.6, fontVariantNumeric: "tabular-nums" }}>{photoOpacity.toFixed(2)}</span>
          </span>
          <input type="range" className="film-range" min={0.3} max={1} step={0.01} value={photoOpacity}
            onChange={(e) => setPhotoOpacity(Number(e.target.value))} />
        </label>
        <label style={{ display: "block", marginBottom: 4 }}>
          <span style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: NOTE_SIZE, color: CHROME_GRAY }}>
            <span>edge fade</span>
            <span style={{ opacity: 0.6, fontVariantNumeric: "tabular-nums" }}>{edgeFade.toFixed(1)} mm</span>
          </span>
          <input type="range" className="film-range" min={0.3} max={8} step={0.1} value={edgeFade}
            onChange={(e) => setEdgeFade(Number(e.target.value))} />
        </label>
        {KNOBS.map(({ key, label, min, max, step }) => (
          <label key={key} style={{ display: "block" }}>
            <span style={{ display: "flex", justifyContent: "space-between", fontFamily: SANS, fontSize: NOTE_SIZE, color: CHROME_GRAY }}>
              <span>{label}</span>
              <span style={{ opacity: 0.6, fontVariantNumeric: "tabular-nums" }}>{look[key].toFixed(step < 0.01 ? 3 : 2)}</span>
            </span>
            <input type="range" className="film-range" min={min} max={max} step={step} value={look[key]}
              onChange={(e) => setLook((l) => ({ ...l, [key]: Number(e.target.value) }))} />
          </label>
        ))}
        <div style={{ display: "flex", gap: 18, marginTop: 10 }}>
          <TextButton label="another strip" onClick={() => setSeed(Math.random() * 10)} style={{ fontSize: NOTE_SIZE }} />
          <TextButton label="reset" onClick={() => { setLook(FILM_LOOK_DEFAULT); setPhotoOpacity(SHEET_DEFAULT.photoOpacity); setEdgeFade(SHEET_DEFAULT.edgeFade); }} style={{ fontSize: NOTE_SIZE }} />
          <TextButton label={copied ? "copied" : "copy values"} onClick={() => void copy()} style={{ fontSize: NOTE_SIZE }} />
        </div>
      </aside>

      <style>{`
        .film-range { -webkit-appearance: none; appearance: none; width: 100%; height: 18px; margin: 0; background: transparent; cursor: pointer; display: block; }
        .film-range::-webkit-slider-runnable-track { height: 1px; background: rgba(123, 123, 135, 0.4); }
        .film-range::-moz-range-track { height: 1px; background: rgba(123, 123, 135, 0.4); }
        .film-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 9px; height: 9px; border-radius: 50%; margin-top: -4px; background: #7b7b87; border: none; }
        .film-range::-moz-range-thumb { width: 9px; height: 9px; border-radius: 50%; background: #7b7b87; border: none; }
        .film-range:focus-visible { outline: none; }
        .film-range:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 3px rgba(123, 123, 135, 0.25); }
        .film-color { -webkit-appearance: none; appearance: none; width: 28px; height: 18px; padding: 0; border: 1px solid rgba(123, 123, 135, 0.35); border-radius: 3px; background: transparent; cursor: pointer; }
        .film-color::-webkit-color-swatch-wrapper { padding: 0; }
        .film-color::-webkit-color-swatch { border: none; border-radius: 2px; }
        .film-color::-moz-color-swatch { border: none; border-radius: 2px; }
      `}</style>
    </main>
  );
}
