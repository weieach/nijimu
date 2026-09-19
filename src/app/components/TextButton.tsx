import { CSSProperties } from "react";
import { SANS } from "../lib/theme";

interface TextButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  style?: CSSProperties;
}

/** Bare label control — Switzer, no tracking, no chrome. */
export function TextButton({
  label,
  onClick,
  disabled = false,
  style,
}: TextButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        border: "none",
        background: "transparent",
        cursor: disabled ? "default" : "pointer",
        padding: 0,
        fontFamily: SANS,
        fontSize: 12,
        fontWeight: 400,
        color: "#7b7b87",
        letterSpacing: 0,
        whiteSpace: "nowrap",
        opacity: disabled ? 0.4 : 1,
        ...style,
      }}
    >
      {label}
    </button>
  );
}
