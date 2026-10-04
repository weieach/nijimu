import { useNavigate } from "react-router";
import { CHROME_GRAY } from "../lib/colors";
import { SANS } from "../lib/theme";
import { SHAPE_DISTANCE_PATH, SHAPE_FEELING_PATH, SHAPE_GROW_PATH } from "../lib/routes";

/**
 * Shortcuts from the landing field to the editors that open on their own,
 * without walking the create flow. The four labs carry their own sliders;
 * the gallery lab is the dive gallery seated with vessels. The three shape
 * steps are the live ones; they open on a sample form.
 */
const ENTRIES: { to: string; label: string; hint: string; icon: IconName }[] = [
  { to: "/lab/descent", label: "descent", hint: "the shot, with its knobs", icon: "descent" },
  { to: "/lab/film", label: "film", hint: "the photo's look", icon: "film" },
  { to: "/lab/vessel", label: "vessel", hint: "the glass, with its sliders", icon: "vessel" },
  { to: "/lab/gallery", label: "gallery", hint: "the memories as vessels", icon: "gallery" },
  { to: SHAPE_GROW_PATH, label: "shape", hint: "the form", icon: "shape" },
  { to: SHAPE_FEELING_PATH, label: "color", hint: "how it feels", icon: "color" },
  { to: SHAPE_DISTANCE_PATH, label: "distance", hint: "how much it holds", icon: "distance" },
];

/** Where the gap sits: after the labs, before the live steps. */
const LIVE_FROM = 4;

type IconName = "descent" | "film" | "vessel" | "gallery" | "shape" | "color" | "distance";

function Icon({ name }: { name: IconName }) {
  const common = {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (name === "descent") {
    return (
      <svg {...common}>
        <path d="M3 16c2.2-1.4 4.2-1.4 6.2 0s4 1.4 6.2 0 4-1.4 5.6 0" />
        <path d="M8 8.5h8M7 6.2h1.2M9.6 6.2h1.2M12.2 6.2h1.2M14.8 6.2h1.2" />
      </svg>
    );
  }
  if (name === "film") {
    return (
      <svg {...common}>
        <rect x="3" y="6" width="18" height="12" rx="1.2" />
        <path d="M7 6v12M17 6v12M9.2 9.2h5.6v5.6H9.2z" />
      </svg>
    );
  }
  if (name === "vessel") {
    return (
      <svg {...common}>
        <path d="M9 4.5c.4 1.6-.2 2.4-1.2 3.2C6 9 5 10.4 5 13.2 5 17 8 19.5 12 19.5s7-2.5 7-6.3c0-2.8-1-4.2-2.8-5.5-1-.8-1.6-1.6-1.2-3.2" />
        <path d="M9.2 4.5h5.6" />
      </svg>
    );
  }
  if (name === "gallery") {
    // three vessels along the gallery's curve, the near one largest
    return (
      <svg {...common}>
        <path d="M3 8.5c.6 1.6 1.9 2.4 3.2 1.6s1.3-2.4.6-3.4" />
        <path d="M8.8 11.4c.5 2.2 2.3 3.4 4.2 2.6 1.9-.8 2.2-2.9 1.4-4.6" />
        <path d="M14.2 14.8c.4 2.9 2.8 4.7 5 3.8 2.1-.9 2.3-3.5 1.4-5.6" />
      </svg>
    );
  }
  if (name === "shape") {
    return (
      <svg {...common}>
        <path d="M12 4.2c2.4 1.6 4.6 2.2 6.2 4.2 1.2 1.6 1.4 3.6.4 5.4-1.2 2.2-3.6 3.6-6.6 4-3-.4-5.4-1.8-6.6-4-1-1.8-.8-3.8.4-5.4C7.4 6.4 9.6 5.8 12 4.2z" />
      </svg>
    );
  }
  if (name === "color") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="7.2" />
        <path d="M12 4.8v14.4" />
        <path d="M12 12h7.2" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="3.1" />
      <circle cx="12" cy="12" r="7.2" />
    </svg>
  );
}

/** A quiet column in the landing's top-left, one button per editor. */
export function LabDock() {
  const navigate = useNavigate();
  return (
    <nav
      aria-label="editors"
      style={{
        position: "absolute",
        top: 18,
        left: 16,
        zIndex: 80,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      {ENTRIES.map((entry, i) => (
        <button
          key={entry.to}
          type="button"
          title={entry.hint}
          onClick={() => navigate(entry.to)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            margin: 0,
            marginTop: i === LIVE_FROM ? 10 : 0,
            padding: "5px 8px",
            border: "none",
            background: "transparent",
            color: CHROME_GRAY,
            cursor: "pointer",
            fontFamily: SANS,
            fontSize: 11,
            letterSpacing: "0.04em",
            lineHeight: 1,
            textTransform: "lowercase",
          }}
        >
          <Icon name={entry.icon} />
          {entry.label}
        </button>
      ))}
    </nav>
  );
}
