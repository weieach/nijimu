import { useRef, useState } from "react";
import { SERIF } from "../lib/theme";

type PhotoLibraryTrayProps = {
  open: boolean;
  /** Bundled stills, shown before anything picked this visit. */
  photos: string[];
  selectedUrl?: string;
  onSelect: (url: string) => void;
  onClose: () => void;
};

/** Photos the user picked this visit. Data URLs survive route changes. */
const sessionPhotos: string[] = [];

const MAX_EDGE = 1600;

/** Shrink a local file to a jpeg data URL three.js can load without CORS. */
function readPhotoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height, 1));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      URL.revokeObjectURL(objectUrl);
      if (!ctx) {
        reject(new Error("canvas"));
        return;
      }
      ctx.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.86));
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("unreadable"));
    };
    image.src = objectUrl;
  });
}

export function PhotoLibraryTray({
  open,
  photos,
  selectedUrl,
  onSelect,
  onClose,
}: PhotoLibraryTrayProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [added, setAdded] = useState<string[]>(() => [...sessionPhotos]);
  const [reading, setReading] = useState(false);

  if (!open) return null;

  const itemSize = "clamp(96px, 11vw, 136px)";
  const library = [...photos, ...added];

  const pickFile = async (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/") || reading) return;
    setReading(true);
    try {
      const url = await readPhotoFile(file);
      sessionPhotos.push(url);
      setAdded([...sessionPhotos]);
      onSelect(url);
    } catch {
      // Unreadable (e.g. HEIC the browser cannot decode). Tray stays open.
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

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

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        aria-label="choose a photo"
        onChange={(e) => {
          void pickFile(e.target.files?.[0]);
        }}
        style={{ display: "none" }}
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
        {library.map((url, index) => (
          <button
            key={`${index}-${url.slice(0, 48)}`}
            type="button"
            role="option"
            aria-selected={selectedUrl === url}
            aria-label={url.startsWith("data:") ? "select added photo" : "select photo"}
            onClick={() => onSelect(url)}
            style={{
              width: itemSize,
              height: itemSize,
              flex: `0 0 ${itemSize}`,
              padding: 0,
              overflow: "hidden",
              borderRadius: "50%",
              border:
                selectedUrl === url
                  ? "2px solid rgba(123, 123, 135, 0.92)"
                  : "1px solid rgba(123, 123, 135, 0.25)",
              background: "#e7e7e8",
              boxShadow: "0 10px 30px rgba(40, 36, 48, 0.12)",
              cursor: "pointer",
            }}
          >
            <img
              src={url}
              alt=""
              style={{
                display: "block",
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          </button>
        ))}

        <button
          type="button"
          aria-label="add a photo from this device"
          disabled={reading}
          onClick={() => inputRef.current?.click()}
          style={{
            width: itemSize,
            height: itemSize,
            flex: `0 0 ${itemSize}`,
            borderRadius: "50%",
            border: "none",
            background: "rgba(123, 123, 135, 0.72)",
            color: "rgba(255, 255, 255, 0.9)",
            fontFamily: SERIF,
            fontSize: "clamp(42px, 5vw, 64px)",
            fontWeight: 200,
            lineHeight: 1,
            cursor: reading ? "wait" : "pointer",
          }}
        >
          ＋
        </button>
      </div>
    </div>
  );
}
