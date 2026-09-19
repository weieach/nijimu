/**
 * The profile, as a small pane of glass floating over whatever page you were on
 * — not a screen of its own. Blurs the page behind it, carries an iridescent
 * sheen that occasionally gleams across it, and a little grain over the top.
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { IridescentSheen } from "./IridescentSheen";
import { PillButton } from "./PillButton";
import { SANS, SERIF, SERIF_EXPOSURE } from "../lib/theme";

/** Paper grain — same recipe as SceneViewer / the dive gallery veil. */
const GRAIN_URL = `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch' result='noise'/%3E%3CfeColorMatrix in='noise' type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

/** Long enough for the leave animation below to finish before unmounting. */
const LEAVE_MS = 220;

interface ProfilePanelProps {
  open: boolean;
  onClose: () => void;
}

// Mock user data - can be replaced with real data later
const userData = {
  name: "Alex Chen",
  accountCreated: "March 2026",
  memoriesCount: 12,
  oneLiner: "cataloging moments that shape the quiet architecture of a life",
};

const detailLabelStyle = {
  fontFamily: SANS,
  fontSize: 11,
  fontWeight: 500 as const,
  letterSpacing: "0.5px",
  color: "#9b9ba3",
  textTransform: "uppercase" as const,
};

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
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);
  /** Keeps the effects below keyed on `open` alone, so a re-render of the
      chrome around us can't steal focus back from an open pane. */
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) {
      setMounted(true);
      setLeaving(false);
      return;
    }
    if (!mounted) return;
    setLeaving(true);
    const timer = window.setTimeout(() => {
      setMounted(false);
      setLeaving(false);
    }, LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    restoreFocusTo.current = document.activeElement as HTMLElement | null;
    cardRef.current?.focus({ preventScroll: true });
    return () => restoreFocusTo.current?.focus?.({ preventScroll: true });
  }, [open]);

  if (!mounted) return null;

  return (
    <div
      className="nijimuProfileScrim"
      data-leaving={leaving}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99990,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(16px, 5vw, 40px)",
        // No filter of its own: an ancestor with backdrop-filter becomes a
        // backdrop root, and the pane below would then have nothing but this
        // scrim to blur. The dim is all this layer does.
        background:
          "radial-gradient(circle at 50% 50%, rgba(122, 122, 134, 0.1), rgba(108, 108, 122, 0.22))",
      }}
    >
      <div
        ref={cardRef}
        className="nijimuProfileCard"
        data-leaving={leaving}
        role="dialog"
        aria-modal="true"
        aria-label="profile"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          isolation: "isolate",
          outline: "none",
          width: "min(392px, 100%)",
          maxHeight: "min(82dvh, 620px)",
          borderRadius: 30,
          overflow: "hidden",
          border: "1px solid rgba(255, 255, 255, 0.5)",
          background:
            "linear-gradient(158deg, rgba(243, 243, 246, 0.58), rgba(222, 222, 229, 0.44))",
          backdropFilter: "blur(26px) saturate(1.45)",
          WebkitBackdropFilter: "blur(26px) saturate(1.45)",
          boxShadow:
            "0 28px 70px rgba(70, 70, 84, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.6)",
        }}
      >
        <IridescentSheen />

        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 1,
            opacity: 0.3,
            backgroundImage: GRAIN_URL,
            backgroundRepeat: "repeat",
            backgroundSize: "512px 512px",
            mixBlendMode: "soft-light",
          }}
        />

        <button
          onClick={onClose}
          title="Close"
          aria-label="close profile"
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            zIndex: 3,
            width: 30,
            height: 30,
            borderRadius: "50%",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#8a8a96"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="5" y1="5" x2="19" y2="19" />
            <line x1="19" y1="5" x2="5" y2="19" />
          </svg>
        </button>

        <div
          style={{
            position: "relative",
            zIndex: 2,
            boxSizing: "border-box",
            maxHeight: "min(82dvh, 620px)",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "clamp(20px, 4vh, 30px)",
            padding: "clamp(38px, 7vw, 46px) clamp(24px, 6vw, 36px) clamp(30px, 5vw, 38px)",
          }}
        >
          {/* Profile header */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              width: "100%",
            }}
          >
            {/* Avatar circle */}
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
                fontSize: 27,
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
            <h2
              style={{
                fontFamily: SERIF_EXPOSURE,
                fontSize: "clamp(24px, 6vw, 30px)",
                fontWeight: 400,
                lineHeight: "140%",
                letterSpacing: "-1px",
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
            </h2>

            {/* One-liner */}
            <p
              style={{
                fontFamily: SERIF,
                fontSize: 12,
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

          {/* Divider line */}
          <div
            style={{
              width: "min(220px, 60%)",
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
            label="view all memories"
            onClick={() => {
              onClose();
              navigate("/memory/scroll");
            }}
            variant="outline"
            style={{ marginTop: 2, flexShrink: 0 }}
          />
        </div>
      </div>

      <style>{`
        @keyframes nijimuProfileFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes nijimuProfileFadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        /* the pane surfaces rather than snaps — it comes up out of the page */
        @keyframes nijimuProfileCardIn {
          from { opacity: 0; transform: translateY(12px) scale(0.965); }
          to { opacity: 1; transform: none; }
        }
        @keyframes nijimuProfileCardOut {
          from { opacity: 1; transform: none; }
          to { opacity: 0; transform: translateY(6px) scale(0.985); }
        }
        .nijimuProfileScrim {
          animation: nijimuProfileFadeIn 240ms ease both;
        }
        .nijimuProfileScrim[data-leaving="true"] {
          animation: nijimuProfileFadeOut ${LEAVE_MS}ms ease both;
        }
        .nijimuProfileCard {
          animation: nijimuProfileCardIn 320ms cubic-bezier(0.22, 0.8, 0.28, 1) both;
        }
        .nijimuProfileCard[data-leaving="true"] {
          animation: nijimuProfileCardOut ${LEAVE_MS}ms ease both;
        }
        @media (prefers-reduced-motion: reduce) {
          .nijimuProfileCard {
            animation: nijimuProfileFadeIn 200ms ease both;
          }
          .nijimuProfileCard[data-leaving="true"] {
            animation: nijimuProfileFadeOut ${LEAVE_MS}ms ease both;
          }
        }
      `}</style>
    </div>
  );
}
