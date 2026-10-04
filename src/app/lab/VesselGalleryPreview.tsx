import { useCallback, useMemo, useState } from "react";
import { MemoryCarouselPage } from "../components/MemoryCarouselPage";
import { LIFE_EVENTS } from "../data/memoryData";
import { COLOR_PALETTE } from "../lib/colors";
import type { ArchiveArtifact } from "../lib/archive";
import { GalleryOverrideContext, type ArtifactSeat, type GalleryOverride, type SeatDepth } from "../lib/galleryOverride";
import { createArtifactForm, type ArtifactCategory } from "../lib/superformula";
import {
  ROOM_DEFAULT, VESSEL_TUNE_DEFAULT, VesselPreview, buildGlass, fitSheetSize, smooth01,
  type Room, type VesselState, type VesselTune,
} from "./VesselPreview";
import { VesselArtifact } from "./VesselArtifact";
import photoA from "../../assets/memory-photo.jpg";
import photoB from "../../assets/memory-photo-02.png";

/*
 * Lab: the dive gallery with the vessel on every seat. The gallery itself —
 * its S-curve, caption, timescale, wheel and keys, the way out to the pond —
 * is the live one (MemoryCarouselPage, untouched); through GalleryOverride it
 * is handed ten memories and asked to draw each as the glass vessel from
 * /lab/vessel with a photo inside, the draped sheet under the refraction
 * look, sized to its own cavity, the picture on the glass side of the sheet
 * and facing the viewer, who turns the vessel by dragging it. Ten forms, one
 * from each of ten categories; the photos are src/assets/vessel-gallery, in
 * name order (drop ten in; the bundled stills stand in for any missing).
 *
 * Pressing the vessel at the apex opens it in the lab as an editor for that
 * one memory — its form, glass, sheet, dye, light and photo — and "back to
 * the gallery" returns with the memory drawn as it was left. Edits live in
 * page state for this visit.
 */

const PHOTOS = Object.entries(
  import.meta.glob("../../assets/vessel-gallery/*.{jpg,jpeg,png,webp}", { eager: true, import: "default" }) as Record<string, string>,
).sort(([a], [b]) => a.localeCompare(b)).map(([, url]) => url);
const FALLBACK = [photoA, photoB];

/**
 * Which of the curated memories are seated, and the form each takes. `draw`
 * picks another deviation inside the category: the star and the gear mostly
 * come out as flat discs with no side for a picture to hang on, and these two
 * draws have a body (about half as tall as they are wide).
 */
const SEATS: { event: number; category: ArtifactCategory; draw?: number }[] = [
  { event: 0, category: "sphere" },
  { event: 2, category: "roundedBox" },
  { event: 3, category: "cylinder" },
  { event: 5, category: "prism" },
  { event: 7, category: "diamond" },
  { event: 8, category: "flower" },
  { event: 9, category: "star", draw: 5 },
  { event: 11, category: "gear", draw: 2 },
  { event: 13, category: "hybrid" },
  { event: 15, category: "torn" },
];

/**
 * The lab's settling, with the film's edge quieter: smaller, fainter
 * perforations, less rim. No slow turn — the vessel opens with its picture
 * squarely to the viewer and would turn it away; the viewer turns it by hand.
 */
export const VESSEL_GALLERY_TUNE: VesselTune = {
  ...VESSEL_TUNE_DEFAULT,
  morph: 0.6,
  holeSize: 0.6, holeWidth: 0.75, holeFade: 0.75, holeRim: 0.25,
  mono: 0, negative: 0,
  pitch: 4, turn: 0, ground: 0,
};

/**
 * The room the glass reflects and shows through where nothing is behind it.
 * The lab's grey wall (#b3b3b3) sat in a grey backdrop; over the gallery's
 * pale water it read as a dark cast on every vessel, so here the room is the
 * water's own light.
 */
export const VESSEL_GALLERY_ROOM: Room = { above: "#e6e7ea", below: "#ffffff" };

function seedOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 9973;
  return 1 + (h % 97) / 10;
}

/** A memory's vessel as the preview first draws it. */
function baseState(i: number): VesselState {
  const { event, category, draw } = SEATS[i];
  const e = LIFE_EVENTS[event];
  const seed = draw === undefined ? `vessel|${e.id}` : `vessel|${category}|${draw}`;
  const form = createArtifactForm({ seed, category });
  const tune = { ...VESSEL_GALLERY_TUNE, sheetSize: fitSheetSize(buildGlass(form, VESSEL_GALLERY_TUNE.morph)) };
  return {
    tune, mode: "refract", sheetMode: "draped", face: "glass", room: VESSEL_GALLERY_ROOM,
    url: PHOTOS[i] ?? FALLBACK[i % FALLBACK.length], seed: seedOf(e.id), form,
  };
}

const BASE: VesselState[] = SEATS.map((_, i) => baseState(i));

/**
 * The seats on the near side of the apex, drawn back: the outer foreground
 * seat used to come forward large enough to cover the first and second
 * neighbours. From the first neighbour on it is scaled down and moved further
 * out toward the lower right, so more of it is off the frame.
 */
function adjustSeat(depth: SeatDepth, offset: number, viewport: { w: number; h: number }): SeatDepth {
  if (offset <= 1) return depth;
  const w = smooth01((offset - 1) / 1);
  const scale = depth.scale * (1 - 0.28 * w);
  return {
    ...depth,
    scale,
    size: depth.size * (1 - 0.28 * w),
    x: depth.x + viewport.w * 0.09 * w,
    y: depth.y + viewport.h * 0.1 * w,
    blurPx: depth.blurPx * (depth.scale / scale),
  };
}

/** /lab/gallery — the live dive gallery, seated with vessels. */
export function VesselGalleryPreview() {
  // each memory's vessel as the editor left it (or as first drawn), and how many times it has changed —
  // the count keys the seat's built geometry, so a returned memory is rebuilt once as it now is
  const [vessels, setVessels] = useState(() => BASE.map((state) => ({ state, version: 0 })));
  const [editing, setEditing] = useState<number | null>(null);
  const [returnTo, setReturnTo] = useState<string | undefined>(undefined);

  const items = useMemo<ArchiveArtifact[]>(() => SEATS.map(({ event }, i) => {
    const e = LIFE_EVENTS[event];
    const s = vessels[i].state;
    return {
      id: e.id,
      year: e.year,
      event: e.event,
      colorIndex: e.color % COLOR_PALETTE.length,
      shape: { form: s.form, fluidity: 0.7, evolve: s.tune.morph, bumpAmount: 0 },
      look: { photoUrl: s.url },
    };
  }), [vessels]);

  const renderArtifact = useCallback((item: ArchiveArtifact, seat: ArtifactSeat) => {
    const i = items.findIndex((it) => it.id === item.id);
    if (i < 0) return null;
    const s = vessels[i].state;
    return (
      <VesselArtifact
        cacheKey={`${item.id}|${vessels[i].version}`}
        form={s.form}
        morph={s.tune.morph}
        photoUrl={s.url}
        seed={s.seed}
        tune={s.tune}
        room={s.room}
        glassMode={s.mode}
        sheetMode={s.sheetMode}
        face={s.face}
        sheetSize={s.tune.sheetSize}
        focused={seat.focused}
        still={seat.still}
        frameloop={seat.frameloop}
        onPick={() => { setReturnTo(item.id); setEditing(i); }}
      />
    );
  }, [items, vessels]);

  const override = useMemo<GalleryOverride>(() => ({ items, renderArtifact, wash: false, adjustSeat }), [items, renderArtifact]);

  if (editing !== null) {
    const i = editing;
    const s = vessels[i].state;
    return (
      <VesselPreview
        key={items[i].id}
        initial={s}
        photos={PHOTOS}
        yaw={-s.tune.anchorAngle}
        backLabel="back to the gallery"
        onBack={() => setEditing(null)}
        onChange={(next) => setVessels((all) => {
          const cur = all[i].state;
          const same = (Object.keys(next) as (keyof VesselState)[]).every((k) => cur[k] === next[k]);
          return same ? all : all.map((v, k) => (k === i ? { state: next, version: v.version + 1 } : v));
        })}
      />
    );
  }

  return (
    <GalleryOverrideContext.Provider value={override}>
      <main style={{ position: "relative", width: "100%", height: "100dvh", overflow: "hidden", background: "#e4e4e6" }}>
        <div aria-label="memory gallery" style={{ position: "absolute", inset: 0 }}>
          <MemoryCarouselPage galleryFocusId={returnTo} galleryCarried={returnTo !== undefined} />
        </div>
      </main>
    </GalleryOverrideContext.Provider>
  );
}
