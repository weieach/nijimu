import { useGLTF } from "@react-three/drei";
import { useNavigate } from "react-router";
import {
  CSSProperties,
  KeyboardEvent,
  ReactNode,
  Ref,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { buildArchive, insertChronologically, type ArchiveArtifact } from "../lib/archive";
import { CHROME_GRAY, COLOR_PALETTE } from "../lib/colors";
import { saveMemory, type SavedMemory } from "../lib/memoryStore";
import { MEMORY_FIELD_PATH } from "../lib/routes";
import { SERIF } from "../lib/theme";
import { MODEL_PATHS } from "./SceneViewer";
import {
  CAPTION_TITLE_GAP,
  CAPTION_TITLE_STYLE,
  CAPTION_YEAR_STYLE,
  PuddleDiveGallery,
  type DiveGalleryItem,
  type DivePhase,
  type DiveArrival,
} from "./PuddleDiveGallery";

/*
 * NamingRim — the naming step of the create flow, as a rim.
 *
 * The memory being made hangs at the apex of the same dome the home gallery
 * uses; a title and a year are typed into the caption beneath it. The step is
 * built as a hook + host rather than a page so that the homescreen can render
 * it *inside* its own scene: saving then only changes props on the gallery
 * that is already on screen, and the artifacts — WebGL canvases each — are
 * never torn down and rebuilt. Nothing that was already there moves; only the
 * water, the timescale and the arrows arrive.
 *
 * NameMemoryPage still exists as a standalone fallback for homescreens that
 * don't have the dive gallery.
 */

/** What the shape steps hand to the naming step in location.state. */
export interface NameFlowState {
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

/** One visit to the naming step. The id is the memory's final id from the
    start, so the slot it holds on the rim is the slot it keeps once saved. */
export interface NamingSession {
  draftId: string;
  state: NameFlowState;
}

const currentYear = new Date().getFullYear();

/** How long the save button takes to leave before the words settle. */
const SAVE_FADE_MS = 380;

/** The tint the material preset implies, as a palette index. */
export function draftColorIndex(matPresetIndex: number | undefined): number {
  return Math.round(((matPresetIndex ?? 0) / 4) * (COLOR_PALETTE.length - 1));
}

export function draftShapeOf(state: NameFlowState | null): ArchiveArtifact["shape"] {
  return {
    modelPath: state?.shape?.modelPath ?? MODEL_PATHS[0],
    fluidity: state?.shape?.fluidity ?? 0,
    evolve: state?.shape?.evolve ?? 0.5,
    bumpAmount: state?.shape?.bumpAmount ?? 0,
  };
}

/** The memory as it will be saved, before it has words. The homescreen uses
    this to give the draft its place on the water ahead of the save. */
export function draftAsSaved(session: NamingSession): SavedMemory {
  const { state } = session;
  const shape = draftShapeOf(state);
  return {
    id: session.draftId,
    title: "",
    year: "",
    transcript: state.transcript ?? "",
    highlightedWords: state.highlightedWords ?? [],
    shape: { ...shape, matPresetIndex: state.matPresetIndex ?? 0 },
    colorIndex: draftColorIndex(state.matPresetIndex),
    createdAt: "",
  };
}

function FlickerCaret({
  color = CHROME_GRAY,
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
  }, [sizerText, style.fontSize, style.fontFamily, style.fontStyle, style.fontWeight]);

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
          color={String(style.color ?? CHROME_GRAY)}
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
          verticalAlign: "middle",
          caretColor: showCaret ? "transparent" : focused ? style.color : "transparent",
        }}
      />
    </label>
  );
}

/** What the naming step needs the dome to show. */
export interface NamingRim {
  items: DiveGalleryItem[];
  activeIdx: number;
  caption: ReactNode;
  /** The neighbours only gather once the memory has a year to stand in. */
  neighborsVisible: boolean;
  /** Back to the previous step. */
  exit: () => void;
}

/**
 * The naming step's state and its rim. Pass `null` when the step isn't active;
 * the hook then costs nothing and returns null, so a component can host either
 * the naming rim or the settled gallery without changing shape.
 */
export function useNamingRim(session: NamingSession | null, reducedMotion: boolean): NamingRim | null {
  const navigate = useNavigate();
  const state = session?.state ?? null;
  const draftId = session?.draftId ?? "";
  const [memoryName, setMemoryName] = useState("");
  const [year, setYear] = useState("");
  const [yearHint, setYearHint] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<"name" | "year" | null>(null);
  const [fieldsVisible, setFieldsVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const yearInputRef = useRef<HTMLInputElement>(null);
  const [archive] = useState(() => (session ? buildArchive() : []));

  useEffect(() => {
    if (!yearHint) return;
    const t = window.setTimeout(() => setYearHint(null), 2600);
    return () => window.clearTimeout(t);
  }, [yearHint]);

  const matPresetIndex = state?.matPresetIndex ?? 0;
  const colorIndex = draftColorIndex(matPresetIndex);
  const draftYear = year.trim() || String(currentYear);
  const draftShape = useMemo(() => draftShapeOf(state), [state]);
  const active = session !== null;

  useEffect(() => {
    if (!active) return;
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
  }, [active, draftShape.modelPath, reducedMotion]);

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
      id: draftId,
      year: rimYear ?? draftYear,
      event: memoryName,
      colorIndex,
      shape: draftShape,
    };
    if (!rimYear) return { items: [draft], activeIdx: 0 };
    const placed = insertChronologically(archive, draft);
    return { items: placed.items, activeIdx: placed.index };
  }, [archive, colorIndex, draftId, draftShape, draftYear, memoryName, rimYear]);

  const canContinue = memoryName.trim() !== "" && yearSettled && !saving;

  const persistAndOpenGallery = () => {
    if (!canContinue) return;
    setSaving(true);

    const commit = () => {
      const shape = state?.shape;
      if (shape?.modelPath) {
        saveMemory({
          id: draftId,
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
         the apex, same neighbours, so only the water and the chrome arrive.
         With nothing saved (a deep link into the flow) there is no seat to
         hand over, so it falls back to the ordinary descent. The naming step
         is replaced in history: there is no draft to come back to. */
      navigate(MEMORY_FIELD_PATH, {
        replace: true,
        state: shape?.modelPath
          ? { galleryOpen: true, galleryFocusId: draftId, galleryCarried: true }
          : { galleryOpen: true },
      });
    };

    // the button leaves first, so the words are alone when they settle
    if (reducedMotion) commit();
    else window.setTimeout(commit, SAVE_FADE_MS);
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

  if (!session) return null;

  /* Same DOM shape as StaticCaption — a column, the title in a block with the
     shared gap below it, then the year — so when the fields become words
     nothing shifts. */
  const caption = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        position: "relative",
        zIndex: 2,
        opacity: fieldsVisible ? 1 : 0,
        transition: reducedMotion ? "none" : "opacity 0.9s ease",
        pointerEvents: fieldsVisible && !saving ? "auto" : "none",
      }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div style={{ marginBottom: CAPTION_TITLE_GAP }}>
        <CaptionField
          value={memoryName}
          onChange={setMemoryName}
          placeholder="name this memory..."
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
          style={CAPTION_TITLE_STYLE}
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
          if (event.key === "Enter" && canContinue) {
            event.preventDefault();
            persistAndOpenGallery();
            return;
          }
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            focusName();
          }
        }}
        style={CAPTION_YEAR_STYLE}
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
      {memoryName.trim() !== "" && yearSettled && (
        <button
          type="button"
          onClick={persistAndOpenGallery}
          disabled={saving}
          style={{
            /* out of flow, so its coming and going never moves the words */
            position: "absolute",
            top: "100%",
            marginTop: 56,
            border: "none",
            background: "transparent",
            cursor: saving ? "default" : "pointer",
            fontFamily: SERIF,
            fontSize: 12,
            color: "#7b7b87",
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
            opacity: saving ? 0 : 1,
            filter: saving ? "blur(4px)" : "none",
            transition: reducedMotion
              ? "none"
              : `opacity ${SAVE_FADE_MS}ms ease, filter ${SAVE_FADE_MS}ms ease`,
          }}
        >
          save to archive
        </button>
      )}
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
          color: ${CHROME_GRAY};
          opacity: 0.35;
        }
      `}</style>
    </div>
  );

  return {
    items,
    activeIdx,
    caption,
    neighborsVisible: yearSettled,
    exit: () => navigate(-1),
  };
}

/** The settled gallery's props, minus what the host supplies itself. */
export interface DiveGalleryProps {
  inkArrival?: import("../lib/landingTransition").InkArrival;
  items: DiveGalleryItem[];
  activeIdx: number;
  phase: DivePhase;
  onNavigate: (delta: number) => void;
  onExit: () => void;
  onOverscrollExit?: () => void;
  onToggleGrid?: () => void;
  arrival: DiveArrival;
}

/**
 * One PuddleDiveGallery, whichever step it is showing. While `naming` is set
 * it is the naming rim — editable caption, no water, no ruler, neighbours
 * gathering on the year. When `naming` goes away the same element becomes the
 * gallery: only its props change, so every artifact stays exactly where and
 * what it was, and `arrival: 'carried'` tells it so.
 */
export function DiveGalleryHost({
  naming,
  reducedMotion,
  gallery,
}: {
  naming: NamingSession | null;
  reducedMotion: boolean;
  gallery: DiveGalleryProps;
}) {
  const rim = useNamingRim(naming, reducedMotion);
  if (rim) {
    return (
      <PuddleDiveGallery
        items={rim.items}
        activeIdx={rim.activeIdx}
        phase="gallery"
        reducedMotion={reducedMotion}
        onNavigate={() => {}}
        onExit={rim.exit}
        exitOnBackdropClick={false}
        caption={rim.caption}
        showTimeScale={false}
        showArrows={false}
        waterEffect={false}
        neighborsVisible={rim.neighborsVisible}
      />
    );
  }
  return <PuddleDiveGallery {...gallery} reducedMotion={reducedMotion} />;
}
