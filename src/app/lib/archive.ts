import { LIFE_EVENTS, MemoryEvent } from "../data/memoryData";
import { COLOR_PALETTE } from "./colors";
import { loadMemories, toMemoryEvent, SavedMemory, type MemoryLook } from "./memoryStore";
import { ArtifactForm, formForMemory } from "./superformula";

/*
 * The archive, as the carousel reads it.
 *
 * Two screens show the same rim of memories — the naming step (with the memory
 * being made at the apex) and the homescreen dive gallery — so the list they
 * draw from has to be built in one place. Any drift in the order, or in the
 * seeded form a curated memory gets, shows up as artifacts changing shape and
 * swapping seats when the flow moves from one screen to the other.
 */

export interface ArchiveArtifact {
  /** The memory's id — stable across screens, so it can key the rim slots. */
  id: string;
  year: string;
  event: string;
  colorIndex: number;
  shape: {
    form: ArtifactForm;
    fluidity: number;
    evolve: number;
    bumpAmount: number;
  };
  /** Drop anchor in puddle uv (y up) — only the homescreen has water to ripple. */
  anchor?: { x: number; y: number };
  /** Photo, color and frost from the sculpting steps, when the memory has them. */
  look?: MemoryLook;
}

// Deterministic per-memory texture, so a curated memory keeps its surface
// across visits and across screens. (Its form is seeded the same way, in
// formForMemory.)
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const yearOf = (year: string) => parseInt(year) || 0;

/** A saved memory replays the form it was given and the surface the user
    sculpted; a curated one gets a seeded form and surface, alternating
    between barely-bumped and openly textured. */
function artifactFor(event: MemoryEvent, index: number, saved?: SavedMemory): ArchiveArtifact {
  const rand = mulberry32(hashString(`shape|${event.id}|${event.year}|${event.event}`));
  // The first draw once picked a GLB model. It is still taken, so every
  // curated memory keeps the texture it had.
  rand();
  return {
    id: event.id,
    year: event.year,
    event: event.event,
    colorIndex: event.color % COLOR_PALETTE.length,
    shape: saved
      ? {
          form: saved.shape.form,
          fluidity: saved.shape.fluidity,
          evolve: saved.shape.evolve,
          bumpAmount: saved.shape.bumpAmount,
        }
      : {
          form: formForMemory(event.id),
          fluidity: rand() * 0.5 + 0.5,
          evolve: rand() * 0.5 + 0.5,
          bumpAmount: index % 2 === 0 ? rand() * 0.03 : 0.03 + rand() * 0.12,
        },
    ...(saved?.look ? { look: saved.look } : {}),
  };
}

/**
 * Every memory, oldest at the left, newest at the right — the rim's direction.
 * The sort is stable, so memories sharing a year keep list order and a memory
 * just saved sits last among them.
 */
export function buildArchive(saved: SavedMemory[] = loadMemories()): ArchiveArtifact[] {
  const artifacts = [
    ...LIFE_EVENTS.map((event, i) => artifactFor(event, i)),
    ...saved.map((memory, i) =>
      artifactFor(toMemoryEvent(memory), LIFE_EVENTS.length + i, memory),
    ),
  ];
  return artifacts.sort((a, b) => yearOf(a.year) - yearOf(b.year));
}

/**
 * Where a memory being made falls in time. It goes after everything at least
 * as old as it — the seat it will hold once it is saved and the archive is
 * rebuilt, so the rim the naming step shows is the rim the gallery keeps.
 */
export function insertChronologically(
  archive: ArchiveArtifact[],
  draft: ArchiveArtifact,
): { items: ArchiveArtifact[]; index: number } {
  const year = yearOf(draft.year);
  let index = 0;
  while (index < archive.length && yearOf(archive[index].year) <= year) index++;
  return {
    items: [...archive.slice(0, index), draft, ...archive.slice(index)],
    index,
  };
}
