import { useGLTF } from "@react-three/drei";
import { useLocation, useNavigate } from "react-router";
import { CSSProperties, KeyboardEvent, Ref, useEffect, useMemo, useRef, useState } from "react";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { buildArchive, insertChronologically, type ArchiveArtifact } from "../lib/archive";
import { COLOR_PALETTE } from "../lib/colors";
import { saveMemory } from "../lib/memoryStore";
import { SERIF } from "../lib/theme";
import { PAGE_BG } from "./PuddleBackdrop";
import { MODEL_PATHS } from "./SceneViewer";
import { PageHeader } from "./PageHeader";
import { PuddleDiveGallery } from "./PuddleDiveGallery";

interface NameFlowState {
  transcript?: string;
  highlightedWords?: string[];
  matPresetIndex?: number;
  shape?: {
    modelPath?: string;
    fluidity?: number;
    evolve?: number;
    bumpAmount?: number;
  };
}

const TITLE_STYLE: CSSProperties = {
  color: "#2a2a2a",
  margin: 0,
  fontFamily: SERIF,
  fontStyle: "italic",
  fontSize: "clamp(13px, 1.05vw, 16px)",
  lineHeight: 1.35,
  textAlign: "center",
};

const YEAR_STYLE: CSSProperties = {
  color: "#999",
  margin: 0,
  fontFamily: SERIF,
  fontStyle: "normal",
  fontSize: "clamp(11px, 0.9vw, 14px)",
  textAlign: "center",
};

const currentYear = new Date().getFullYear();

/** The memory being made, before it has an id of its own. */
const DRAFT_ID = "nijimu.draft";

function FlickerCaret({
  color = "#2a2a2a",
  fontSize,
}: {
  color?: string;
  fontSize?: CSSProperties["fontSize"];
}) {
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: 1,
        height: "1em",
        fontSize,
        background: color,
        pointerEvents: "none",
        zIndex: 3,
        animation: "nijimu-caret 1.05s steps(1) infinite",
      }}
    />
  );
}

function CaptionField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  autoFocus,
  maxLength,
  inputMode,
  style,
  className,
  focused,
  inputRef,
  onFocus,
  onBlur,
  onKeyDown,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  ariaLabel: string;
  autoFocus?: boolean;
  maxLength?: number;
  inputMode?: "text" | "numeric";
  style: CSSProperties;
  className?: string;
  focused: boolean;
  inputRef?: Ref<HTMLInputElement>;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const empty = value.length === 0;
  const showCaret = focused && empty;
  const sizerRef = useRef<HTMLSpanElement>(null);
  const [fitWidth, setFitWidth] = useState(0);
  const sizerText = value || placeholder;

  useEffect(() => {
    const el = sizerRef.current;
    if (!el) return;
    setFitWidth(Math.ceil(el.getBoundingClientRect().width));
  }, [sizerText, style.fontSize, style.fontFamily, style.fontStyle]);

  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "text",
        maxWidth: "100%",
        position: "relative",
        zIndex: 2,
        width: "fit-content",
        verticalAlign: "middle",
      }}
    >
      <span
        ref={sizerRef}
        aria-hidden
        style={{
          ...style,
          position: "absolute",
          visibility: "hidden",
          whiteSpace: "pre",
          pointerEvents: "none",
        }}
      >
        {sizerText}
      </span>
      {showCaret && (
        <FlickerCaret
          color={String(style.color ?? "#2a2a2a")}
          fontSize={style.fontSize}
        />
      )}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={className}
        autoFocus={autoFocus}
        maxLength={maxLength}
        inputMode={inputMode}
        style={{
          ...style,
          width: fitWidth > 0 ? fitWidth : "auto",
          fieldSizing: "content",
          maxWidth: "70vw",
          background: "transparent",
          border: "none",
          outline: "none",
          padding: 0,
          lineHeight: 1,
          verticalAlign: "middle",
          caretColor: showCaret ? "transparent" : focused ? style.color : "transparent",
        }}
      />
    </label>
  );
}

export function NameMemoryPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state as NameFlowState | null) ?? null;
  const [memoryName, setMemoryName] = useState("");
  const [year, setYear] = useState("");
  const [yearHint, setYearHint] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<"name" | "year" | null>(null);
  const [fieldsVisible, setFieldsVisible] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const yearInputRef = useRef<HTMLInputElement>(null);
  const [archive] = useState(() => buildArchive());
  const [reducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    if (!yearHint) return;
    const t = window.setTimeout(() => setYearHint(null), 2600);
    return () => window.clearTimeout(t);
  }, [yearHint]);

  const matPresetIndex = state?.matPresetIndex ?? 0;
  const colorIndex = Math.round((matPresetIndex / 4) * (COLOR_PALETTE.length - 1));
  const draftYear = year.trim() || String(currentYear);
  const draftShape = useMemo(
    () => ({
      modelPath: state?.shape?.modelPath ?? MODEL_PATHS[0],
      fluidity: state?.shape?.fluidity ?? 0,
      evolve: state?.shape?.evolve ?? 0.5,
      bumpAmount: state?.shape?.bumpAmount ?? 0,
    }),
    [state?.shape?.bumpAmount, state?.shape?.evolve, state?.shape?.fluidity, state?.shape?.modelPath],
  );

  useEffect(() => {
    let cancelled = false;
    useGLTF.preload(draftShape.modelPath);

    const reveal = () => {
      if (cancelled) return;
      const paint = () => {
        if (cancelled) return;
        setFieldsVisible(true);
        setFocusedField("name");
      };
      if (reducedMotion) {
        paint();
        return;
      }
      // Let the artifact paint first, then fade the fields in.
      window.setTimeout(() => {
        requestAnimationFrame(paint);
      }, 280);
    };

    const loader = new GLTFLoader();
    loader.load(draftShape.modelPath, reveal, undefined, reveal);

    return () => {
      cancelled = true;
    };
  }, [draftShape.modelPath, reducedMotion]);

  useEffect(() => {
    if (!fieldsVisible) return;
    nameInputRef.current?.focus();
    setFocusedField("name");
  }, [fieldsVisible]);

  const focusName = () => {
    nameInputRef.current?.focus();
    setFocusedField("name");
  };

  const focusYear = () => {
    yearInputRef.current?.focus();
    setFocusedField("year");
  };

  /** A year is only a year once all four digits are in and it has happened. */
  const yearSettled = year.length === 4 && Number(year) <= currentYear;

  /* The year the rim is struck from. It outlives an edit to the field, so
     clearing the year lets the neighbours sink back out from where they stand
     instead of re-shuffling around a half-typed one on their way down. */
  const [rimYear, setRimYear] = useState<string | null>(null);
  useEffect(() => {
    if (yearSettled) setRimYear(year);
  }, [year, yearSettled]);

  /* The rim, with the memory being made standing in it. Until there is a year
     it has no place in time, so it hangs alone; once the year settles it takes
     the seat it will keep in the archive and the memories on either side of it
     are the ones it will actually sit between. */
  const { items, activeIdx } = useMemo(() => {
    const draft: ArchiveArtifact = {
      id: DRAFT_ID,
      year: rimYear ?? draftYear,
      event: memoryName,
      colorIndex,
      shape: draftShape,
    };
    if (!rimYear) return { items: [draft], activeIdx: 0 };
    const placed = insertChronologically(archive, draft);
    return { items: placed.items, activeIdx: placed.index };
  }, [archive, colorIndex, draftShape, draftYear, memoryName, rimYear]);

  const canContinue = memoryName.trim() !== "" && yearSettled;

  const persistAndOpenGallery = () => {
    if (!canContinue) return;

    const id = crypto.randomUUID();
    const shape = state?.shape;
    if (shape?.modelPath) {
      saveMemory({
        id,
        title: memoryName.trim(),
        year,
        transcript: state?.transcript ?? "",
        highlightedWords: state?.highlightedWords ?? [],
        shape: {
          modelPath: shape.modelPath,
          matPresetIndex,
          fluidity: shape.fluidity ?? 0,
          evolve: shape.evolve ?? 0.5,
          bumpAmount: shape.bumpAmount ?? 0,
        },
        colorIndex,
        createdAt: new Date().toISOString(),
      });
    }

    /* The gallery continues the rim that is already on screen: same memory at
       the apex, same neighbours, so only the water and the chrome arrive. With
       nothing saved (a deep link into the flow) there is no seat to hand over,
       so it falls back to the ordinary descent. */
    navigate("/", {
      state: shape?.modelPath
        ? { galleryOpen: true, galleryFocusId: id, galleryCarried: true }
        : { galleryOpen: true },
    });
  };

  const handleYearChange = (next: string) => {
    if (/\D/.test(next)) {
      setYearHint("use a four-digit year");
    }
    const digits = next.replace(/\D/g, "").slice(0, 4);
    if (digits.length === 4 && Number(digits) > currentYear) {
      setYearHint("that year hasn't happened yet");
      return;
    }
    if (!/\D/.test(next)) setYearHint(null);
    setYear(digits);
  };

  const editableCaption = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        position: "relative",
        zIndex: 2,
        opacity: fieldsVisible ? 1 : 0,
        transition: reducedMotion ? "none" : "opacity 0.9s ease",
        pointerEvents: fieldsVisible ? "auto" : "none",
      }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div style={{ marginBottom: "0.8em" }}>
        <CaptionField
          value={memoryName}
          onChange={setMemoryName}
          placeholder="name this memory"
          ariaLabel="memory name"
          autoFocus={fieldsVisible}
          inputRef={nameInputRef}
          focused={fieldsVisible && focusedField === "name"}
          onFocus={() => setFocusedField("name")}
          onBlur={() => setFocusedField((current) => (current === "name" ? null : current))}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              if (!memoryName.trim()) return;
              event.preventDefault();
              focusYear();
              return;
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              focusYear();
            }
          }}
          style={TITLE_STYLE}
        />
      </div>
      <CaptionField
        value={year}
        onChange={handleYearChange}
        placeholder="year"
        ariaLabel="year"
        maxLength={4}
        inputMode="numeric"
        className="nijimu-year-field"
        inputRef={yearInputRef}
        focused={fieldsVisible && focusedField === "year"}
        onFocus={() => setFocusedField("year")}
        onBlur={() => setFocusedField((current) => (current === "year" ? null : current))}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            focusName();
          }
        }}
        style={YEAR_STYLE}
      />
      {yearHint && (
        <p
          role="status"
          style={{
            position: "absolute",
            top: "100%",
            margin: "10px 0 0",
            padding: "6px 12px",
            fontFamily: SERIF,
            fontSize: 11,
            fontStyle: "italic",
            color: "#7b7b87",
            background: "rgba(255,255,255,0.82)",
            borderRadius: 8,
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          {yearHint}
        </p>
      )}
      {canContinue && (
        <button
          type="button"
          onClick={persistAndOpenGallery}
          style={{
            marginTop: 56,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            fontFamily: SERIF,
            fontSize: 12,
            color: "#7b7b87",
            letterSpacing: "0.04em",
          }}
        >
          save to archive
        </button>
      )}
    </div>
  );

  /* The rim hangs off the sides of a wide dome, so the page is pinned to the
     viewport and clips: a memory at the end of the arc is cut by the edge of the
     screen rather than growing the document and raising scrollbars. */
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
        background: PAGE_BG,
      }}
    >
      <PageHeader layout="absolute" link={false} />
      <PuddleDiveGallery
        items={items}
        activeIdx={activeIdx}
        phase="gallery"
        reducedMotion={reducedMotion}
        onNavigate={() => {}}
        onExit={() => navigate(-1)}
        exitOnBackdropClick={false}
        caption={editableCaption}
        showTimeScale={false}
        showArrows={false}
        waterEffect={false}
        neighborsVisible={yearSettled}
      />

      <style>{`
        @keyframes nijimu-caret {
          0%, 49% { opacity: 0.7; }
          50%, 100% { opacity: 0; }
        }
        input::placeholder {
          color: inherit;
          opacity: 0.35;
          font-style: inherit;
        }
        .nijimu-year-field::placeholder {
          color: #2a2a2a;
          opacity: 0.35;
        }
      `}</style>
    </div>
  );
}
