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
 */

export interface ArtifactSeat {
  /** At the apex, turning; otherwise a neighbour, still once the rim has settled. */
  focused: boolean;
  still: boolean;
  frameloop: "always" | "demand";
}

export type SeatDepth = ReturnType<typeof carouselSeat>;

export interface GalleryOverride {
  items: ArchiveArtifact[];
  renderArtifact: (item: ArchiveArtifact, seat: ArtifactSeat) => ReactNode;
  /** false leaves out the memory's colour wash behind the focused seat. */
  wash?: boolean;
  /** Adjusts where a seat sits and how large it is, given the curve's own answer and the seat's offset from the apex. */
  adjustSeat?: (depth: SeatDepth, offset: number, viewport: { w: number; h: number }) => SeatDepth;
}

export const GalleryOverrideContext = createContext<GalleryOverride | null>(null);
