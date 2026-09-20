import { CSSProperties } from "react";
import { BODY_SIZE, SANS } from "../lib/theme";

interface TextButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  trailing?: string;
  style?: CSSProperties;
}

/** Bare label control — Switzer, no tracking, no chrome. */
export function TextButton({
  label,
  onClick,
  disabled = false,
  trailing,
  style,
}: TextButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        border: "none",
        background: "transparent",
        cursor: disabled ? "default" : "pointer",
        padding: 0,
        fontFamily: SANS,
        fontSize: BODY_SIZE,
        fontWeight: 400,
        color: "#7b7b87",
        letterSpacing: 0,
        whiteSpace: "nowrap",
        opacity: disabled ? 0.4 : 1,
        ...style,
      }}
    >
      {label}
      {trailing && (
        <span aria-hidden style={{ letterSpacing: "-0.12em", lineHeight: 1 }}>
          {trailing}
        </span>
      )}
    </button>
  );
}
