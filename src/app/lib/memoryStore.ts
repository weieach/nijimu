import { MemoryEvent } from "../data/memoryData";
import type { ArtifactForm } from "./superformula";

const KEY = "nijimu.memories.v1";

/** A memory the user recorded in this visit. Never written to disk. */
export interface SavedMemory {
  id: string;
  title: string;
  year: string;
  transcript: string;
  highlightedWords: string[];
  /** The shape the user sculpted — replayed verbatim, never re-randomized. */
  shape: {
    /** Assigned when the memory was recorded; see lib/superformula.ts. */
    form: ArtifactForm;
    matPresetIndex: number;
    fluidity: number;
    evolve: number;
    bumpAmount: number;
  };
  /** Index into COLOR_PALETTE / MEMORY_COLORS for this memory's tint. */
  colorIndex: number;
  /** What the sculpting steps chose beyond the form. Optional: the curated
      archive has none, and the gallery does not draw it yet. */
  look?: MemoryLook;
  createdAt: string;
}

export interface MemoryLook {
  /** The wrapped photo — an asset URL, or a data / object URL for this visit. */
  photoUrl?: string;
  /** The color step's pick. */
  oklch?: { l: number; c: number; h: number };
  /** 1 = clear glass, 0 = fully frosted (the distance step). */
  vividness?: number;
}

/** This tab only. A reload starts from the curated archive again. */
let session: SavedMemory[] = [];

function forgetPersisted(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // private mode
  }
}

forgetPersisted();

export function loadMemories(): SavedMemory[] {
  forgetPersisted();
  return session;
}

export function saveMemory(memory: SavedMemory): void {
  forgetPersisted();
  session = [...session, memory];
}

/** Presents a saved memory in the same shape as the curated LIFE_EVENTS. */
export function toMemoryEvent(memory: SavedMemory): MemoryEvent {
  return {
    id: memory.id,
    year: memory.year,
    event: memory.title,
    color: memory.colorIndex,
  };
}
