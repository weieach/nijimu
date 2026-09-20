import { createBrowserRouter, Outlet, RouterProvider, useLocation } from "react-router";
import { useEffect, useRef, useState } from "react";
import { CHROME_GRAY } from "./lib/colors";
import { HomePage } from "./components/HomePage";
import { LandingPage } from "./components/LandingPage";
import { CAROUSEL_PATH, MEMORY_FIELD_PATH, MEMORY_POND_PATH, NAMING_PATH } from "./lib/routes";
import { PuddleRecordingPage } from "./components/PuddleRecordingPage";
import { PuddleTranscriptPage } from "./components/PuddleTranscriptPage";
import { MemorySavedPage } from "./components/MemorySavedPage";
import { ProfilePanel } from "./components/ProfilePanel";
import { MemoryScrollPage } from "./components/MemoryScrollPage";
import { RevisitMemoryPage } from "./components/RevisitMemoryPage";
import { EditWeightPage } from "./components/EditWeightPage";
import { EditColorPage } from "./components/EditColorPage";
import { EditTexturePage } from "./components/EditTexturePage";
import { StyleGuidePage } from "./components/StyleGuidePage";

const SOUNDTRACK_URL =
  "https://cdn.jsdelivr.net/gh/Noyok1vas/figbuildAssets/prodarmaan%20-%20somber%20springtime.mp3";

/** GitHub Pages subpath: Vite sets BASE_URL from vite.config base (e.g. /repo/). */
const routerBasename =
  import.meta.env.BASE_URL === "/" || import.meta.env.BASE_URL === ""
    ? undefined
    : import.meta.env.BASE_URL.replace(/\/$/, "") || undefined;

function RootLayout() {
  return (
    <>
      <GlobalControls />
      <Outlet />
    </>
  );
}

const router = createBrowserRouter([
  { path: "/style", Component: StyleGuidePage },
  {
    Component: RootLayout,
    children: [
      {
        /* Landing, the dive carousel, the pond, and naming share one layout:
           Enter preloads the gallery behind the ink, and saving a memory turns
           the naming rim into that same gallery in place. The children render
           nothing themselves; LandingPage reads the path. */
        Component: LandingPage,
        children: [
          { path: "/", element: null },
          { path: CAROUSEL_PATH, element: null },
          { path: MEMORY_POND_PATH, element: null },
          { path: NAMING_PATH, element: null },
        ],
      },
      { path: MEMORY_FIELD_PATH, Component: HomePage },
      { path: "/record/start", Component: PuddleRecordingPage },
      { path: "/record/transcript", Component: PuddleTranscriptPage },
      { path: "/record/saved", Component: MemorySavedPage },
      { path: "/memory/scroll", Component: MemoryScrollPage },
      { path: "/memory/revisit", Component: RevisitMemoryPage },
      { path: "/memory/edit/weight", Component: EditWeightPage },
      { path: "/memory/edit/color", Component: EditColorPage },
      { path: "/memory/edit/texture", Component: EditTexturePage },
    ],
  },
], { basename: routerBasename });

function GlobalControls() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const audio = new Audio(SOUNDTRACK_URL);
    audio.loop = true;
    audio.volume = 0.35;
    audio.muted = true;
    audioRef.current = audio;

    const attempt = audio.play();
    if (attempt !== undefined) {
      attempt.catch(() => {
        const resume = () => {
          audio.play().catch(() => {});
          window.removeEventListener("pointerdown", resume);
          window.removeEventListener("keydown", resume);
        };
        window.addEventListener("pointerdown", resume, { once: true });
        window.addEventListener("keydown", resume, { once: true });
      });
    }

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted]);

  /** The pane belongs to the page it opened over — leaving that page closes it. */
  useEffect(() => {
    setProfileOpen(false);
  }, [pathname]);

  const iconButtonStyle = {
    position: "fixed" as const,
    zIndex: 99999,
    width: 36,
    height: 36,
    borderRadius: "50%",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  };

  const iconStroke = CHROME_GRAY;

  return (
    <>
      {/* Profile button */}
      <button
        onClick={() => setProfileOpen((open) => !open)}
        title="Profile"
        aria-expanded={profileOpen}
        style={{ ...iconButtonStyle, top: 22, right: 68 }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke={iconStroke}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </button>

      {/* Music button */}
      <button
        onClick={() => setMuted((m) => !m)}
        title={muted ? "Unmute" : "Mute"}
        style={{ ...iconButtonStyle, top: 22, right: 22 }}
      >
        {muted ? (
          /* Muted — speaker with X */
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        ) : (
          /* Unmuted — speaker with waves */
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={iconStroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        )}
      </button>

      <ProfilePanel open={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  );
}

export default function App() {
  return <RouterProvider router={router} />;
}
