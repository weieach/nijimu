import { createContext, type ReactNode } from "react";
import type { ArchiveArtifact } from "./archive";
import type { carouselSeat } from "./carouselLayout";

/*
 * A preview of the gallery with other things in it. The dive gallery keeps
 * its layout, copy and interaction; only what sits on each seat is swapped,
 * and which memories are seated — and, if the preview asks, the colour wash
 * behind the apex is left out and a seat's place on the curve is adjusted.
 * Nothing provides this on the live routes, so they read null and draw as
 * they always have. The lab at /lab/gallery provides it.
 *
 * A preview may also hold a second arrangement of the same seats — the
 * field, where the memories hang in the air by distance rather than along
 * the years — and move the seats between the two. The gallery then mounts
 * every memory, takes each seat's place from `adjustSeat` (which blends the
 * two itself), and in the field reads a press on a memory as a pick and the
 * pointer over one as the caption's subject, instead of stepping the rim.
 */

export interface ArtifactSeat {
  /** At the apex, turning; otherwise a neighbour, still once the rim has settled. */
  focused: boolean;
  still: boolean;
  frameloop: "always" | "demand";
  /** How far away the seat reads (the vessel's own distance, 0 clear); set by the field. */
  haze?: number;
}

export type SeatDepth = ReturnType<typeof carouselSeat>;

/** A seat's place with what the field adds to it. */
export interface SeatPlace extends SeatDepth {
  haze?: number;
  /** A turn of the seat on the page, in degrees. */
  rotate?: number;
  /** Draws over seats with a smaller order; the curve orders by the chronological offset × 100. */
  order?: number;
}

export interface GalleryField {
  /** Whether the seats are asked for in the field (the target state). */
  on: boolean;
  /** How far the whole has gone: 0 the curve, 1 the field. */
  progress: number;
  /** The memory under the pointer in the field — the caption shows its words. */
  hovered: string | null;
  onHover: (id: string | null) => void;
  /** A press and release on a memory in the field. */
  onPick: (item: ArchiveArtifact) => void;
}

export interface GalleryOverride {
  items: ArchiveArtifact[];
  renderArtifact: (item: ArchiveArtifact, seat: ArtifactSeat) => ReactNode;
  /** false leaves out the memory's colour wash behind the focused seat. */
  wash?: boolean;
  /**
   * How the seats arrive and leave. "water" is the gallery's own — a deep
   * blur clearing, the colour tinted toward the water and back, the SVG
   * refraction wobble over the apex. "plain" is a rise and a fade with none
   * of that, for things that carry their own colour and are costly to filter.
   */
  arrival?: "water" | "plain";
  /** Adjusts where a seat sits and how large it is, given the curve's own answer and the seat's offset from the apex. */
  adjustSeat?: (depth: SeatDepth, offset: number, viewport: { w: number; h: number }, item: ArchiveArtifact) => SeatPlace;
  field?: GalleryField;
  /** Chrome of the preview's own, shown and hidden with the gallery's. */
  chrome?: ReactNode;
}

export const GalleryOverrideContext = createContext<GalleryOverride | null>(null);
