import { useNavigate } from "react-router";
import { BackButton } from "./BackButton";
import { SANS, SERIF, SERIF_EXPOSURE } from "../lib/theme";

export function ProfilePage() {
  const navigate = useNavigate();

  // Mock user data - can be replaced with real data later
  const userData = {
    name: "Alex Chen",
    email: "alex.chen@nijimu.com",
    accountCreated: "March 2026",
    memoriesCount: 12,
    oneLiner: "cataloging moments that shape the quiet architecture of a life"
  };

  return (
    <div
      className="relative w-full h-screen overflow-hidden"
      style={{ background: "#e0e0e0" }}
    >
      {/* nijimu text */}
      <p
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          top: 71,
          fontFamily: SERIF,
          fontStyle: "normal",
          fontSize: 12,
          lineHeight: 1.5,
          color: "#9b9ba3",
          textTransform: "lowercase",
          whiteSpace: "nowrap",
          margin: 0,
        }}
      >
        nijimu
      </p>

      {/* Main content */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(520px, calc(100% - 80px))",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 48,
        }}
      >
        {/* Profile header */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            width: "100%",
          }}
        >
          {/* Avatar circle */}
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #9496a6, #C8D0D4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: SERIF,
              fontSize: 40,
              fontWeight: 500,
              color: "white",
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            {userData.name.split(' ').map(n => n[0]).join('')}
          </div>

          {/* User name */}
          <h1
            style={{
              fontFamily: SERIF,
              fontSize: 36,
              fontWeight: 500,
              lineHeight: "140%",
              letterSpacing: "-1.5px",
              color: "#7b7b87",
              textTransform: "lowercase",
              margin: 0,
            }}
          >
            {userData.name.toLowerCase()}
          </h1>

          {/* One-liner */}
          <p
            style={{
              fontFamily: SERIF_EXPOSURE,
              fontSize: "clamp(16px, calc(16px + (21 - 16) * ((100vw - 390px) / (1024 - 390))), 21px)",
              lineHeight: 1.6,
              color: "rgba(123, 123, 135, 0.7)",
              textAlign: "center",
              fontStyle: "italic",
              margin: 0,
              maxWidth: 420,
            }}
          >
            {userData.oneLiner}
          </p>
        </div>

        {/* Divider line */}
        <div
          style={{
            width: 240,
            height: 1,
            background: "linear-gradient(90deg, transparent, rgba(123, 123, 135, 0.25), transparent)",
          }}
        />

        {/* Account details */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
            width: "100%",
            alignItems: "center",
          }}
        >
          {/* Email */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
            <label
              style={{
                fontFamily: SANS,
                fontSize: 13,
                fontWeight: 500,
                letterSpacing: "0.5px",
                color: "#9b9ba3",
                textTransform: "uppercase",
              }}
            >
              Email
            </label>
            <p
              style={{
                fontFamily: SERIF_EXPOSURE,
                fontSize: 18,
                lineHeight: 1.5,
                color: "#7b7b87",
                margin: 0,
              }}
            >
              {userData.email}
            </p>
          </div>

          {/* Account created */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
            <label
              style={{
                fontFamily: SANS,
                fontSize: 13,
                fontWeight: 500,
                letterSpacing: "0.5px",
                color: "#9b9ba3",
                textTransform: "uppercase",
              }}
            >
              Member Since
            </label>
            <p
              style={{
                fontFamily: SERIF_EXPOSURE,
                fontSize: 18,
                lineHeight: 1.5,
                color: "#7b7b87",
                margin: 0,
              }}
            >
              {userData.accountCreated}
            </p>
          </div>

          {/* Memories count */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
            <label
              style={{
                fontFamily: SANS,
                fontSize: 13,
                fontWeight: 500,
                letterSpacing: "0.5px",
                color: "#9b9ba3",
                textTransform: "uppercase",
              }}
            >
              Memories Archived
            </label>
            <p
              style={{
                fontFamily: SERIF_EXPOSURE,
                fontSize: 18,
                lineHeight: 1.5,
                color: "#7b7b87",
                margin: 0,
              }}
            >
              {userData.memoriesCount} {userData.memoriesCount === 1 ? 'memory' : 'memories'}
            </p>
          </div>
        </div>

        {/* View memories button */}
        <button
          onClick={() => navigate("/memory/scroll")}
          style={{
            marginTop: 24,
            padding: "12px 28px",
            borderRadius: 100,
            border: "1px solid rgba(123, 123, 135, 0.25)",
            background: "transparent",
            cursor: "pointer",
            fontFamily: SANS,
            fontSize: 14,
            fontWeight: 400,
            color: "#7b7b87",
            textTransform: "lowercase",
            transition: "all 0.2s ease",
          }}
        >
          view all memories
        </button>

        {/* Edit profile hint */}
        
      </div>

      {/* Back button */}
      <BackButton />
    </div>
  );
}