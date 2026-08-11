import { CSSProperties, ReactNode } from "react";
import { SANS, SANS_UI } from "../lib/theme";

interface PillButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** light = gray text on light pages (default); dark = white text on dark pages; outline = bordered secondary */
  variant?: "light" | "dark" | "outline";
  /** trailing glyph, e.g. "›" or "✦" */
  trailing?: string;
  /** leading node, e.g. a stop-icon SVG */
  icon?: ReactNode;
  /** positioning only — visuals live here */
  style?: CSSProperties;
  className?: string;
}

const DIMMED = "rgba(140, 140, 140, 0.5)";
const TRACKING = "0.03em";
/** Shared chrome — cool gray to match light-page UI */
const LIGHT_TEXT = "#7b7b87";
const OUTLINE_BORDER = "1px solid rgba(123, 123, 135, 0.28)";
const LIGHT_FILL = "rgba(123, 123, 135, 0.16)";
const LIGHT_FILL_DISABLED = "rgba(123, 123, 135, 0.08)";

export function PillButton({
  label,
  onClick,
  disabled = false,
  variant = "light",
  trailing,
  icon,
  style,
  className,
}: PillButtonProps) {
  const isDark = variant === "dark";
  const isOutline = variant === "outline";
  const textColor = isDark
    ? "white"
    : disabled
      ? DIMMED
      : LIGHT_TEXT;

  const background = isOutline
    ? "transparent"
    : isDark
      ? "rgba(218, 218, 218, 0.25)"
      : disabled
        ? LIGHT_FILL_DISABLED
        : LIGHT_FILL;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: "12px 28px",
        borderRadius: 100,
        border: isOutline ? OUTLINE_BORDER : "none",
        background,
        cursor: disabled ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
        transition: "opacity 0.2s ease, border-color 0.2s ease, color 0.2s ease",
        ...style,
      }}
    >
      {icon}
      <span
        style={{
          fontFamily: isDark ? SANS_UI : SANS,
          fontSize: isOutline ? 14 : 16,
          fontWeight: isDark ? 300 : 400,
          lineHeight: 1.5,
          letterSpacing: TRACKING,
          color: textColor,
          textShadow: isDark ? "0px 4px 100px black" : "none",
          textTransform: "lowercase",
        }}
      >
        {label}
      </span>
      {trailing && (
        <span
          style={{
            fontFamily: SANS_UI,
            fontSize: isOutline ? 12 : 14,
            lineHeight: 0,
            letterSpacing: TRACKING,
            color: textColor,
            fontVariationSettings: "'wdth' 100",
          }}
        >
          {trailing}
        </span>
      )}
    </button>
  );
}
