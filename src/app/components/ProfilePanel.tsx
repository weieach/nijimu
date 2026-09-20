/**
 * The profile, as a small pane of glass floating over whatever page you were on
 * — not a screen of its own. Blurs the page behind it, carries an iridescent
 * sheen that occasionally gleams across it, and a little grain over the top.
 */

import { GlassPane } from "./GlassPane";
import { PillButton } from "./PillButton";
import { useLandingReturn } from "../lib/landingReturn";
import { NOTE_SIZE, SERIF, SERIF_EXPOSURE, TITLE, META } from "../lib/theme";

interface ProfilePanelProps {
  open: boolean;
  onClose: () => void;
}

const userData = {
  name: "Alex Chen",
  accountCreated: "March 2026",
  memoriesCount: 12,
  oneLiner: "cataloging moments that shape the quiet architecture of a life",
};

const detailLabelStyle = {
  ...META,
  margin: 0,
} as const;

const detailValueStyle = {
  fontFamily: SERIF_EXPOSURE,
  fontSize: "clamp(15px, 3.6vw, 17px)",
  fontWeight: 400 as const,
  lineHeight: 1.5,
  color: "#7b7b87",
  margin: 0,
  fontSynthesis: "none" as const,
  textAlign: "center" as const,
  overflowWrap: "anywhere" as const,
  maxWidth: "100%",
};

export function ProfilePanel({ open, onClose }: ProfilePanelProps) {
  const { beginReturn } = useLandingReturn();

  return (
    <GlassPane open={open} onClose={onClose} label="profile" closeLabel="close profile">
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          width: "100%",
        }}
      >
        <div
          style={{
            width: 68,
            height: 68,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #9496a6, #C8D0D4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: SERIF_EXPOSURE,
            fontSize: "clamp(22px, 5.4vw, 27px)",
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

        <h2
          style={{
            ...TITLE,
            color: "#7b7b87",
            textTransform: "lowercase",
            margin: 0,
            textAlign: "center",
            overflowWrap: "anywhere",
            maxWidth: "100%",
          }}
        >
          {userData.name.toLowerCase()}
        </h2>

        <p
          style={{
            fontFamily: SERIF,
            fontSize: NOTE_SIZE,
            fontWeight: 400,
            lineHeight: 1.6,
            color: "rgba(123, 123, 135, 0.7)",
            textAlign: "center",
            margin: 0,
            maxWidth: "min(300px, 100%)",
          }}
        >
          {userData.oneLiner}
        </p>
      </div>

      <div
        style={{
          width: "min(220px, 60%)",
          height: 1,
          background:
            "linear-gradient(90deg, transparent, rgba(123, 123, 135, 0.25), transparent)",
          flexShrink: 0,
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "clamp(16px, 3vh, 20px)",
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
        label="exit to landing page"
        onClick={beginReturn}
        variant="outline"
        style={{ marginTop: 2, flexShrink: 0 }}
      />
    </GlassPane>
  );
}
