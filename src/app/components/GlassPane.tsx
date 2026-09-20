import { type ReactNode, useEffect, useRef, useState } from "react";
import { IridescentSheen } from "./IridescentSheen";
import { LANDING_RETURN } from "../lib/landingReturn";

/** Paper grain — same recipe as SceneViewer / the dive gallery veil. */
const GRAIN_URL = `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch' result='noise'/%3E%3CfeColorMatrix in='noise' type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

const LEAVE_MS = LANDING_RETURN.profileLeaveMs;
const PANEL_RADIUS = 30;

export function GlassPane({
  open,
  onClose,
  onExited,
  label,
  labelledBy,
  closeLabel = "close",
  closeDisabled = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Fires after the leave animation finishes. */
  onExited?: () => void;
  label?: string;
  labelledBy?: string;
  closeLabel?: string;
  closeDisabled?: boolean;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onExitedRef = useRef(onExited);
  onExitedRef.current = onExited;

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
      onExitedRef.current?.();
    }, LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !closeDisabled) onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, closeDisabled]);

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
      onClick={() => { if (!closeDisabled) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99990,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(16px, 5vw, 40px)",
        backgroundColor: "rgba(108, 108, 122, 0.2)",
      }}
    >
      <div
        ref={cardRef}
        className="nijimuProfileCard"
        data-leaving={leaving}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          outline: "none",
          width: "min(424px, 100%)",
          maxHeight: "min(82dvh, 620px)",
          borderRadius: PANEL_RADIUS,
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
        <IridescentSheen radius={PANEL_RADIUS} />

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
          aria-label={closeLabel}
          disabled={closeDisabled}
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
            cursor: closeDisabled ? "default" : "pointer",
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
          {children}
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
        @keyframes nijimuProfileDimIn {
          from { background-color: rgba(108, 108, 122, 0); }
        }
        @keyframes nijimuProfileDimOut {
          to { background-color: rgba(108, 108, 122, 0); }
        }
        @keyframes nijimuProfileCardIn {
          from { opacity: 0; transform: translateY(12px) scale(0.965); }
          to { opacity: 1; transform: none; }
        }
        @keyframes nijimuProfileCardOut {
          from { opacity: 1; transform: none; }
          to { opacity: 0; transform: translateY(6px) scale(0.985); }
        }
        .nijimuProfileScrim {
          animation: nijimuProfileDimIn 240ms ease both;
        }
        .nijimuProfileScrim[data-leaving="true"] {
          animation: nijimuProfileDimOut ${LEAVE_MS}ms ease both;
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
