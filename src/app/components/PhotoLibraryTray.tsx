type PhotoLibraryTrayProps = {
  open: boolean;
  photoUrl: string;
  selectedUrl?: string;
  onSelect: (url: string) => void;
  onClose: () => void;
};

export function PhotoLibraryTray({
  open,
  photoUrl,
  selectedUrl,
  onSelect,
  onClose,
}: PhotoLibraryTrayProps) {
  if (!open) return null;

  const itemSize = "clamp(96px, 11vw, 136px)";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        pointerEvents: "none",
      }}
    >
      <button
        type="button"
        aria-label="close photo library"
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          border: 0,
          padding: 0,
          background: "transparent",
          pointerEvents: "auto",
          cursor: "default",
        }}
      />

      <div
        role="listbox"
        aria-label="photo library"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 28,
          display: "flex",
          alignItems: "center",
          gap: "clamp(18px, 2.4vw, 32px)",
          overflowX: "auto",
          overscrollBehaviorX: "contain",
          WebkitOverflowScrolling: "touch",
          padding: "18px max(28px, 5vw)",
          pointerEvents: "auto",
          scrollbarWidth: "none",
        }}
      >
        <button
          type="button"
          role="option"
          aria-selected={selectedUrl === photoUrl}
          aria-label="select snow mountain photo"
          onClick={() => onSelect(photoUrl)}
          style={{
            width: itemSize,
            height: itemSize,
            flex: `0 0 ${itemSize}`,
            padding: 0,
            overflow: "hidden",
            borderRadius: "50%",
            border:
              selectedUrl === photoUrl
                ? "2px solid rgba(123, 123, 135, 0.92)"
                : "1px solid rgba(123, 123, 135, 0.25)",
            background: "#e7e7e8",
            boxShadow: "0 10px 30px rgba(40, 36, 48, 0.12)",
            cursor: "pointer",
          }}
        >
          <img
            src={photoUrl}
            alt=""
            style={{
              display: "block",
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        </button>

        <button
          type="button"
          disabled
          aria-label="add a new photo, coming soon"
          style={{
            width: itemSize,
            height: itemSize,
            flex: `0 0 ${itemSize}`,
            borderRadius: "50%",
            border: "none",
            background: "rgba(123, 123, 135, 0.72)",
            color: "rgba(255, 255, 255, 0.9)",
            fontFamily: "serif",
            fontSize: "clamp(42px, 5vw, 64px)",
            fontWeight: 200,
            lineHeight: 1,
            cursor: "default",
          }}
        >
          ＋
        </button>
      </div>
    </div>
  );
}
