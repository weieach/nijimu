import ridgeUrl from "../../assets/memory-photo.jpg";
import campUrl from "../../assets/memory-photo-02.png";

export interface MemoryPhoto {
  id: string;
  url: string;
  /** Spoken description for the print — the image itself carries no caption. */
  label: string;
}

/** The pictures a memory can carry. Chosen on the pond, wrapped onto the form later. */
export const MEMORY_PHOTOS: MemoryPhoto[] = [
  { id: "ridge", url: ridgeUrl, label: "a rope team crossing a snow ridge" },
  { id: "camp", url: campUrl, label: "friends resting in the snow at camp" },
];
