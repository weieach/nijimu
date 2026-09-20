import { MemoryEvent } from "../data/memoryData";

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
    modelPath: string;
    matPresetIndex: number;
    fluidity: number;
    evolve: number;
    bumpAmount: number;
  };
  /** Index into COLOR_PALETTE / MEMORY_COLORS for this memory's tint. */
  colorIndex: number;
  createdAt: string;
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
