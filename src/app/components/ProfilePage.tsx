import { useNavigate } from "react-router";
import { BackButton } from "./BackButton";
import { PageHeader } from "./PageHeader";
import { PillButton } from "./PillButton";
import { SANS, SERIF, SERIF_EXPOSURE } from "../lib/theme";

/** Paper grain — same recipe as SceneViewer / the dive gallery veil. */
const GRAIN_URL = `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch' result='noise'/%3E%3CfeColorMatrix in='noise' type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

export function ProfilePage() {
  const navigate = useNavigate();

  // Mock user data - can be replaced with real data later
  const userData = {
    name: "Alex Chen",
    accountCreated: "March 2026",
    memoriesCount: 12,
    oneLiner: "cataloging moments that shape the quiet architecture of a life"
  };

  const detailLabelStyle = {
    fontFamily: SANS,
    fontSize: "clamp(11px, 2.8vw, 13px)",
    fontWeight: 500 as const,
    letterSpacing: "0.5px",
    color: "#9b9ba3",
    textTransform: "uppercase" as const,
  };

  const detailValueStyle = {
    fontFamily: SERIF_EXPOSURE,
    fontSize: "clamp(15px, 3.6vw, 18px)",
    fontWeight: 400 as const,
    lineHeight: 1.5,
    color: "#7b7b87",
    margin: 0,
    fontSynthesis: "none" as const,
    textAlign: "center" as const,
    overflowWrap: "anywhere" as const,
    maxWidth: "100%",
  };

  return (
    <div
      className="relative w-full"
      style={{
        background: "#e0e0e0",
        minHeight: "100dvh",
        overflowX: "hidden",
        overflowY: "auto",
      }}
    >
      {/* Paper grain, fixed so it stays glued to the glass while the page scrolls */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          // above page content + header, below GlobalControls (99999)
          zIndex: 200,
          opacity: 0.45,
          backgroundImage: GRAIN_URL,
          backgroundRepeat: "repeat",
          backgroundSize: "512px 512px",
          mixBlendMode: "soft-light",
        }}
      />

      <PageHeader layout="absolute" />

      {/* Main content — centers when tall; scrolls on short viewports */}
      <div
        style={{
          boxSizing: "border-box",
          minHeight: "100dvh",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          paddingTop: "clamp(88px, 14vh, 120px)",
          paddingBottom: "clamp(40px, 8vh, 72px)",
          paddingLeft: "clamp(20px, 5vw, 40px)",
          paddingRight: "clamp(20px, 5vw, 40px)",
        }}
      >
        <div
          style={{
            width: "min(520px, 100%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "clamp(28px, 5vh, 48px)",
          }}
        >
          {/* Profile header */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "clamp(10px, 1.5vh, 12px)",
              width: "100%",
            }}
          >
            {/* Avatar circle */}
            <div
              style={{
                width: "clamp(72px, 18vw, 96px)",
                height: "clamp(72px, 18vw, 96px)",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #9496a6, #C8D0D4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: SERIF_EXPOSURE,
                fontSize: "clamp(28px, 7vw, 40px)",
                fontWeight: 400,
                color: "white",
                textTransform: "uppercase",
                letterSpacing: "1px",
                flexShrink: 0,
                fontSynthesis: "none",
              }}
            >
              {userData.name.split(" ").map((n) => n[0]).join("")}
            </div>

            {/* User name */}
            <h1
              style={{
                fontFamily: SERIF_EXPOSURE,
                fontSize: "clamp(26px, 6.5vw, 36px)",
                fontWeight: 400,
                lineHeight: "140%",
                letterSpacing: "clamp(-1px, -0.2vw, -1.5px)",
                color: "#7b7b87",
                textTransform: "lowercase",
                margin: 0,
                textAlign: "center",
                overflowWrap: "anywhere",
                maxWidth: "100%",
                fontSynthesis: "none",
              }}
            >
              {userData.name.toLowerCase()}
            </h1>

            {/* One-liner */}
            <p
              style={{
                fontFamily: SERIF,
                fontSize: "clamp(11px, 2.8vw, 13px)",
                fontWeight: 400,
                lineHeight: 1.6,
                color: "rgba(123, 123, 135, 0.7)",
                textAlign: "center",
                margin: 0,
                maxWidth: "min(420px, 100%)",
              }}
            >
              {userData.oneLiner}
            </p>
          </div>

          {/* Divider line */}
          <div
            style={{
              width: "min(240px, 55%)",
              height: 1,
              background:
                "linear-gradient(90deg, transparent, rgba(123, 123, 135, 0.25), transparent)",
              flexShrink: 0,
            }}
          />

          {/* Account details */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "clamp(18px, 3.5vh, 24px)",
              width: "100%",
              alignItems: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                alignItems: "center",
                width: "100%",
              }}
            >
              <label style={detailLabelStyle}>Member Since</label>
              <p style={detailValueStyle}>{userData.accountCreated}</p>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                alignItems: "center",
                width: "100%",
              }}
            >
              <label style={detailLabelStyle}>Memories Archived</label>
              <p style={detailValueStyle}>
                {userData.memoriesCount}{" "}
                {userData.memoriesCount === 1 ? "memory" : "memories"}
              </p>
            </div>
          </div>

          <PillButton
            label="view all memories"
            onClick={() => navigate("/memory/scroll")}
            variant="outline"
            style={{ marginTop: "clamp(4px, 1.5vh, 24px)", flexShrink: 0 }}
          />
        </div>
      </div>

      <BackButton />
    </div>
  );
}
