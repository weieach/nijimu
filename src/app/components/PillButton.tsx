import { CSSProperties, ReactNode } from "react";
import { SANS, SANS_UI } from "../lib/theme";

interface PillButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** light = gray text on light pages (default); dark = white text on dark pages; outline = bordered, transparent */
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
  const textColor = isDark ? "white" : disabled ? DIMMED : "#8C8C8C";

  const background =
    variant === "outline"
      ? "transparent"
      : isDark
        ? "rgba(218, 218, 218, 0.25)"
        : disabled
          ? "rgba(175, 163, 163, 0.1)"
          : "rgba(175, 163, 163, 0.2)";

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
        padding: "12px 24px",
        borderRadius: 100,
        border: variant === "outline" ? "1px solid rgba(175, 163, 163, 0.35)" : "none",
        background,
        cursor: disabled ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {icon}
      <span
        style={{
          fontFamily: isDark ? SANS_UI : SANS,
          fontSize: 16,
          fontWeight: isDark ? 300 : 400,
          lineHeight: 1.5,
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
            fontSize: 14,
            lineHeight: 0,
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
