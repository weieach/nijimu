import { MemoryEvent } from "../data/memoryData";

const KEY = "nijimu.memories.v1";

/** A memory the user actually recorded, shaped, and saved. */
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

export function loadMemories(): SavedMemory[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Guard against hand-edited or older-shaped data
    return Array.isArray(parsed) ? parsed.filter((m) => m?.id && m?.shape) : [];
  } catch {
    return [];
  }
}

export function saveMemory(memory: SavedMemory): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...loadMemories(), memory]));
  } catch {
    // Quota exceeded or private mode — the memory stays session-only rather
    // than breaking the save screen.
  }
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
