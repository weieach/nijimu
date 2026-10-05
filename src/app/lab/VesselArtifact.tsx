import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { ArtifactForm } from "../lib/superformula";
import { prepareFilmPhoto } from "../lib/filmLook";
import { createEdgePrint } from "./filmStrip";
import {
  BLANK_PHOTO, FOV, FRONT_LAYER, LOOK_Y, Mist, PITCH_MAX, PITCH_MIN, airFor, backdropVertex, blitFragment, buildDrapedSheet, buildGlass, buildSheet,
  createGlassUniformSet, createSheetUniformSet, fitSheetSize, glassFragment, glassRefractFragment, glassVertex, hash2,
  keyFrom, photoLoader, seedDirections, sheetFragment, sheetVertex, writeGlassUniforms, writeSheetUniforms,
  type Glass, type GlassMode, type Room, type Sheet, type SheetFace, type SheetMode, type VesselTune,
} from "./VesselPreview";

/*
 * One memory as the vessel, in a canvas of its own — what the gallery preview
 * seats where the crystal was. The same glass and sheet as /lab/vessel,
 * drawn with the lab's two-pass refraction on a transparent canvas (the glass
 * shows the room where the frame behind it is empty), without the table or
 * its reflection. The eye opens on the sheet's side of the wall so the picture
 * faces the viewer, and at the apex a drag turns it round and up or down as in
 * the lab (`turn` in the tune adds the lab's slow turn); a neighbour holds
 * still.
 */

export interface VesselArtifactProps {
  form: ArtifactForm;
  /** How far the form has grown from its sphere (the shape step's morph). */
  morph: number;
  photoUrl?: string;
  /** Places this strip's stains and torn ends, and the turn it is first seen at. */
  seed: number;
  tune: VesselTune;
  room: Room;
  glassMode?: GlassMode;
  sheetMode?: SheetMode;
  face?: SheetFace;
  /** At the apex: turning. */
  focused: boolean;
  /** A settled neighbour: nothing moves, the canvas draws on demand. */
  still: boolean;
  frameloop: "always" | "demand";
  /** Keys the built geometry, so a seat that leaves and comes back does not rebuild its cloth. */
  cacheKey: string;
  /** The strip's size in the glass; fitted to the cavity (`fitSheetSize`) unless given. */
  sheetSize?: number;
  /** A press and release without a drag at the apex — the seat is being asked for. */
  onPick?: () => void;
}

interface Built { glass: Glass; sheet: Sheet; distance: number }
const builds = new Map<string, Built>();

/* ───────── the photos, shared by every seat that shows one ─────────
   One texture per URL for the visit: a seat that mounts, leaves and comes
   back (the field keeps all ten mounted, but the editor replaces the gallery)
   does not fetch and decode its picture again, and the ten canvases share the
   decoded image — each renderer uploads it once to its own context. The
   preview preloads its set as it mounts, so by the time the dive has settled
   the pictures are in the stock and nothing develops late. */
export interface SeatPhoto { texture: THREE.Texture; aspect: number }
const photos = new Map<string, SeatPhoto>();
const photosLoading = new Map<string, Promise<SeatPhoto>>();

export function loadSeatPhoto(url: string): Promise<SeatPhoto> {
  const have = photos.get(url);
  if (have) return Promise.resolve(have);
  let pending = photosLoading.get(url);
  if (!pending) {
    pending = photoLoader.loadAsync(url).then((t) => {
      const image = t.image as { width: number; height: number };
      const photo = { texture: prepareFilmPhoto(t), aspect: image.width / image.height };
      photos.set(url, photo);
      photosLoading.delete(url);
      return photo;
    }, (err) => { photosLoading.delete(url); throw err; });
    photosLoading.set(url, pending);
  }
  return pending;
}
/** The photo if it has already arrived. */
export function peekSeatPhoto(url: string): SeatPhoto | undefined {
  return photos.get(url);
}
export function preloadSeatPhotos(urls: string[]) {
  for (const url of urls) loadSeatPhoto(url).catch(() => undefined);
}

/** The glass and its sheet for one memory, built once per key and kept; a new key for the same memory replaces the old build. */
function buildVessel(key: string, form: ArtifactForm, morph: number, tune: VesselTune, sheetMode: SheetMode, seed: number, sheetSizeGiven?: number): Built {
  const have = builds.get(key);
  if (have) return have;
  const id = key.split("|")[0];
  for (const [k, b] of builds) {
    if (k !== key && k.split("|")[0] === id) {
      b.glass.geometry.dispose(); b.sheet.geometry.dispose();
      builds.delete(k);
    }
  }
  const glass = buildGlass(form, morph);
  // the strip sized to this cavity, so a small or narrow form holds a smaller sheet
  const sheetSize = sheetSizeGiven ?? fitSheetSize(glass);
  const sheet = sheetMode === "draped"
    ? buildDrapedSheet(glass, tune.inset, {
      sheetSize, anchorAngle: tune.anchorAngle, anchorHeight: tune.anchorHeight, tilt: tune.tilt, contact: tune.contact,
      sag: tune.sag, peel: tune.peel, curl: tune.curl, twist: tune.twist, gap: tune.gap, soft: tune.soft,
    })
    : buildSheet(glass, tune.inset, tune.arc, tune.band, tune.lift, tune.foldScale, seed);
  // the eye far enough back that the body fills the seat with the gallery's margin — by its height and
  // a typical radius, not its farthest point, so a flat or spiky form is not shrunk by one spike
  let halfHeight = 0.5;
  let radial = 0;
  let n = 0;
  const p = glass.positions;
  for (let k = 0; k < p.length; k += 3) {
    halfHeight = Math.max(halfHeight, Math.abs(p[k + 1] - LOOK_Y));
    radial += Math.hypot(p[k], p[k + 2]);
    n++;
  }
  const reach = Math.max(halfHeight, (radial / Math.max(n, 1)) * 1.45);
  const built = { glass, sheet, distance: (reach * 1.12) / Math.sin((FOV / 2) * (Math.PI / 180)) };
  builds.set(key, built);
  return built;
}

function VesselObject({
  form, morph, photoUrl, seed, tune, room, glassMode = "refract", sheetMode = "draped", face = "inside", focused, still, cacheKey, sheetSize, onPick,
}: VesselArtifactProps) {
  const { camera, gl, scene, size, invalidate } = useThree();
  // opens with the eye on the sheet's side of the wall, so the picture faces the viewer squarely;
  // the pressed sheet has no one place, so it opens at a turn of its own
  const yaw = useRef(sheetMode === "draped" ? (-tune.anchorAngle * Math.PI) / 180 : hash2(seed, 3.1) * Math.PI * 2);
  const pitch = useRef(tune.pitch);

  // at the apex the vessel is in hand: a drag turns the eye round it and up or down, as in the lab
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  useEffect(() => {
    if (!focused) return;
    const el = gl.domElement;
    let last: { id: number; x: number; y: number } | null = null;
    let travelled = 0;
    const down = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      last = { id: e.pointerId, x: e.clientX, y: e.clientY };
      travelled = 0;
      try { el.setPointerCapture(e.pointerId); } catch { /* a pointer the browser no longer holds */ }
      el.style.cursor = "grabbing";
    };
    const move = (e: PointerEvent) => {
      if (!last || e.pointerId !== last.id) return;
      travelled += Math.hypot(e.clientX - last.x, e.clientY - last.y);
      yaw.current += (e.clientX - last.x) * 0.01;
      pitch.current = Math.min(PITCH_MAX, Math.max(PITCH_MIN, pitch.current - (e.clientY - last.y) * 0.25));
      last = { id: e.pointerId, x: e.clientX, y: e.clientY };
      invalidate();
    };
    const up = (e: PointerEvent) => {
      if (!last || e.pointerId !== last.id) return;
      last = null;
      el.style.cursor = "grab";
      if (e.type === "pointerup" && travelled < 6) onPickRef.current?.();
    };
    el.style.cursor = "grab";
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.style.cursor = "";
      el.style.touchAction = "";
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [focused, gl, invalidate]);

  const pass = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(1, 1, { samples: 4, depthBuffer: true, stencilBuffer: false });
    const blit = new THREE.ShaderMaterial({
      vertexShader: backdropVertex, fragmentShader: blitFragment,
      uniforms: { tScene: { value: target.texture } },
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blit);
    quad.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(quad);
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return { target, blit, quad, scene, ortho };
  }, []);
  useEffect(() => () => { pass.target.dispose(); pass.blit.dispose(); pass.quad.geometry.dispose(); }, [pass]);
  useEffect(() => {
    const dpr = gl.getPixelRatio();
    pass.target.setSize(Math.max(1, Math.round(size.width * dpr)), Math.max(1, Math.round(size.height * dpr)));
    invalidate();
  }, [pass, gl, size, invalidate]);

  const built = useMemo(() => buildVessel(cacheKey, form, morph, tune, sheetMode, seed, sheetSize), [cacheKey, form, morph, tune, sheetMode, seed, sheetSize]);
  const edgePrint = useMemo(() => createEdgePrint(1 + Math.floor(hash2(seed, 7.7) * 36)), [seed]);
  useEffect(() => () => edgePrint.dispose(), [edgePrint]);
  const key = keyFrom(tune.keyAzimuth, tune.keyElevation);
  const patches = useMemo(() => seedDirections(seed, 3, 1.1), [seed]);
  const sheetU = useMemo(() => createSheetUniformSet(edgePrint), [edgePrint]);
  const glassU = useMemo(() => createGlassUniformSet(pass.target.texture), [pass]);
  const groundY = built.glass.lo - 0.02;
  // the air a receded memory fades toward: the room, as the lab's backdrop would show it
  const air = airFor(tune, glassMode, room);
  writeSheetUniforms(sheetU, { tune, seed, sheet: built.sheet, sheetMode, face, key, edgePrint, groundY, reflect: -1, air });
  writeGlassUniforms(glassU, { tune, seed, key, patches, room, groundY, reflect: -1, air });

  // the picture, from the shared stock: already there if it was preloaded, else set as it arrives
  const photo = photoUrl ? peekSeatPhoto(photoUrl) : undefined;
  sheetU.uPhoto.value = photo?.texture ?? BLANK_PHOTO;
  sheetU.uImageAspect.value = photo?.aspect ?? 1.5;
  useEffect(() => {
    if (!photoUrl || photo) return;
    let live = true;
    loadSeatPhoto(photoUrl).then((p) => {
      if (!live) return;
      sheetU.uPhoto.value = p.texture;
      sheetU.uImageAspect.value = p.aspect;
      invalidate();
    }).catch(() => undefined);
    return () => { live = false; };
  }, [photoUrl, photo, sheetU, invalidate]);

  /* The shaders are compiled off the frame before anything is drawn: ten
     seats mounting together used to compile on the same first frame, a long
     one, with each canvas showing whatever half of it had been linked. Until
     this resolves the canvas stays clear, which the arrival's fade covers. */
  // a ref, not state: the frame the invalidate asks for can run before React would commit a state change
  const compiledFor = useRef<GlassMode | null>(null);
  useEffect(() => {
    let live = true;
    camera.layers.enableAll();
    Promise.all([gl.compileAsync(scene, camera), gl.compileAsync(pass.scene, pass.ortho)])
      .catch(() => undefined)
      .then(() => { if (live) { compiledFor.current = glassMode; invalidate(); } });
    return () => { live = false; };
  }, [gl, scene, camera, pass, glassMode, invalidate]);

  const refract = glassMode === "refract";
  useFrame(({ gl: renderer, scene, camera: view, clock }, dt) => {
    if (compiledFor.current !== glassMode) return;
    if (focused && !still) yaw.current += tune.turn * Math.min(dt, 0.1);
    // the glow's clock: it moves only while the seat's frameloop runs (focused or moving); a still seat holds its frame
    glassU.uTime.value = clock.elapsedTime;
    const y = yaw.current, p = (pitch.current * Math.PI) / 180, d = built.distance;
    camera.position.set(-Math.sin(y) * Math.cos(p) * d, LOOK_Y + Math.sin(p) * d, Math.cos(y) * Math.cos(p) * d);
    camera.lookAt(0, LOOK_Y, 0);
    if (!refract) {
      view.layers.enableAll();
      renderer.render(scene, view);
      return;
    }
    glassU.uResolution.value.set(pass.target.width, pass.target.height);
    view.layers.set(0);
    renderer.setRenderTarget(pass.target);
    renderer.render(scene, view);
    renderer.setRenderTarget(null);
    renderer.render(pass.scene, pass.ortho);
    renderer.clearDepth();
    view.layers.set(FRONT_LAYER);
    renderer.autoClear = false;
    renderer.render(scene, view);
    renderer.autoClear = true;
    view.layers.enableAll();
  }, 1);

  return <>
    <mesh geometry={built.glass.geometry} renderOrder={0} frustumCulled={false} layers={refract ? FRONT_LAYER : 0}>
      <shaderMaterial key={glassMode} transparent depthWrite={false} side={THREE.BackSide}
        vertexShader={glassVertex} fragmentShader={refract ? glassRefractFragment : glassFragment} uniforms={glassU} />
    </mesh>
    <mesh geometry={built.sheet.geometry} renderOrder={1} frustumCulled={false}>
      <shaderMaterial transparent depthWrite={false} side={THREE.DoubleSide}
        vertexShader={sheetVertex} fragmentShader={sheetFragment} uniforms={sheetU} />
    </mesh>
    <mesh geometry={built.glass.geometry} renderOrder={2} frustumCulled={false} layers={refract ? FRONT_LAYER : 0}>
      <shaderMaterial key={glassMode} transparent depthWrite={false} side={THREE.FrontSide}
        vertexShader={glassVertex} fragmentShader={refract ? glassRefractFragment : glassFragment} uniforms={glassU} />
    </mesh>
    {/* the distance's mist, as the editor shows it (the editor's post blur is the lab's own and is not drawn here) */}
    <Mist geometry={built.glass.geometry} uniforms={glassU} layer={refract ? FRONT_LAYER : 0} renderOrder={3} on={tune.haze * (tune.hazeMist + tune.hazeGlow) > 0} />
  </>;
}

export function VesselArtifact(props: VesselArtifactProps) {
  return (
    // offsetSize: the seat is scaled by a CSS transform along the curve, and a resize observer does not see
    // transforms — measured by its bounds, a canvas first mounted far down the curve would be rendered at
    // that tiny size and stretched when it reached the apex
    <Canvas camera={{ position: [0, 0.6, 9], fov: FOV, near: 0.1, far: 50 }}
      dpr={[1, 2]} gl={{ antialias: true, alpha: true }} frameloop={props.frameloop}
      resize={{ offsetSize: true }}
      style={{ width: "100%", height: "100%" }}>
      <VesselObject {...props} />
    </Canvas>
  );
}
