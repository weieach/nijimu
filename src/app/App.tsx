import { createBrowserRouter, Outlet, RouterProvider, useNavigate } from "react-router";
import { useEffect, useRef, useState } from "react";
import { HomePage } from "./components/HomePage";
import { RecordingStartPage } from "./components/RecordingStartPage";
import { RecordingProcessPage } from "./components/RecordingProcessPage";
import { TranscriptPage } from "./components/TranscriptPage";
import { OrbPage } from "./components/OrbPage";
import { ClickToRecordPage } from "./components/ClickToRecordPage";
import { NameMemoryPage } from "./components/NameMemoryPage";
import { BuildObjectPage } from "./components/BuildObjectPage";
import { ShapeEditorPage } from "./components/ShapeEditorPage";
import { ShapeWeightPage } from "./components/ShapeWeightPage";
import { ShapeColorPage } from "./components/ShapeColorPage";
import { ShapeTexturePage } from "./components/ShapeTexturePage";
import { ConnectMemoriesPage } from "./components/ConnectMemoriesPage";
import { MemorySavedPage } from "./components/MemorySavedPage";
import { ProfilePage } from "./components/ProfilePage";
import { MemoryScrollPage } from "./components/MemoryScrollPage";
import { RevisitMemoryPage } from "./components/RevisitMemoryPage";
import { EditWeightPage } from "./components/EditWeightPage";
import { EditColorPage } from "./components/EditColorPage";
import { EditTexturePage } from "./components/EditTexturePage";

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
  {
    Component: RootLayout,
    children: [
      { path: "/", Component: HomePage },
      { path: "/record/click", Component: ClickToRecordPage },
      { path: "/record/start", Component: RecordingStartPage },
      { path: "/record/process", Component: RecordingProcessPage },
      { path: "/record/transcript", Component: TranscriptPage },
      { path: "/record/name", Component: NameMemoryPage },
      { path: "/record/build", Component: BuildObjectPage },
      { path: "/record/shape", Component: ShapeEditorPage },
      { path: "/record/shape/weight", Component: ShapeWeightPage },
      { path: "/record/shape/color", Component: ShapeColorPage },
      { path: "/record/shape/texture", Component: ShapeTexturePage },
      { path: "/record/connect", Component: ConnectMemoriesPage },
      { path: "/record/saved", Component: MemorySavedPage },
      { path: "/record/orb", Component: OrbPage },
      { path: "/profile", Component: ProfilePage },
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
  const [muted, setMuted] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const audio = new Audio(SOUNDTRACK_URL);
    audio.loop = true;
    audio.volume = 0.35;
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

  return (
    <>
      {/* Profile button */}
      <button
        onClick={() => navigate("/profile")}
        title="Profile"
        style={{
          position: "fixed",
          top: 22,
          right: 68,
          zIndex: 99999,
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.28)",
          background: "rgba(0,0,0,0.18)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 0.2s ease, border-color 0.2s ease",
          padding: 0,
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(255,255,255,0.75)"
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
        style={{
          position: "fixed",
          top: 22,
          right: 22,
          zIndex: 99999,
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.28)",
          background: "rgba(0,0,0,0.18)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 0.2s ease, border-color 0.2s ease",
          padding: 0,
        }}
      >
        {muted ? (
          /* Muted — speaker with X */
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        ) : (
          /* Unmuted — speaker with waves */
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        )}
      </button>
    </>
  );
}

export default function App() {
  return <RouterProvider router={router} />;
}