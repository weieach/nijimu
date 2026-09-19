import { CHROME_GRAY } from "../lib/colors";

/** Top-right switch between the G-key carousel and the card grid.
 *  Sits left of the profile / music chrome (those are at right 68 and 22). */
export function GalleryViewToggle({
  view,
  onToggle,
  visible = true,
}: {
  view: "carousel" | "grid";
  onToggle: () => void;
  visible?: boolean;
}) {
  if (!visible) return null;

  const toGrid = view === "carousel";

  return (
    <button
      type="button"
      title={toGrid ? "grid view" : "gallery view"}
      aria-label={toGrid ? "switch to grid view" : "switch to gallery view"}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      style={{
        position: "fixed",
        top: 22,
        right: 114,
        zIndex: 99999,
        width: 36,
        height: 36,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        opacity: 0.85,
      }}
    >
      {toGrid ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <rect x="1.5" y="1.5" width="5" height="5" stroke={CHROME_GRAY} strokeWidth="1.2" />
          <rect x="9.5" y="1.5" width="5" height="5" stroke={CHROME_GRAY} strokeWidth="1.2" />
          <rect x="1.5" y="9.5" width="5" height="5" stroke={CHROME_GRAY} strokeWidth="1.2" />
          <rect x="9.5" y="9.5" width="5" height="5" stroke={CHROME_GRAY} strokeWidth="1.2" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <circle cx="8" cy="8" r="3.2" stroke={CHROME_GRAY} strokeWidth="1.2" />
          <circle cx="2.6" cy="8" r="1.6" stroke={CHROME_GRAY} strokeWidth="1.2" />
          <circle cx="13.4" cy="8" r="1.6" stroke={CHROME_GRAY} strokeWidth="1.2" />
        </svg>
      )}
    </button>
  );
}
