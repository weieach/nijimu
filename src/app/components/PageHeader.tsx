import { CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router";
import { CHROME_GRAY } from "../lib/colors";
import { CAROUSEL_PATH, NAMING_PATH } from "../lib/routes";
import { SERIF_CJK } from "../lib/theme";
import { GalleryViewToggle } from "./GalleryViewToggle";

/** Target seat the landing wordmark flies to. Keep the mark in sync. */
export const PAGE_HEADER_MARK = {
  top: 30,
  fontSize: 12,
  gap: 12,
  letterSpacing: "0.16px",
} as const;

interface PageHeaderProps {
  /** absolute = pinned top-center (full-bleed pages); block = in-flow with bottom margin (light pages) */
  layout?: "absolute" | "block";
  /** light pages use chrome gray; dark pages use a lighter gray on dark grounds */
  tone?: "light" | "dark";
  /** When false, render a non-link mark (homescreen chrome). Default true. */
  link?: boolean;
  /** Three-circle gallery control. Hidden on landing and on the carousel itself
      (that screen already keeps a plus in this corner). */
  carousel?: boolean;
  /** Replaces the default jump to /memory — the pond plays its return instead. */
  onCarousel?: () => void;
  style?: CSSProperties;
}

/** Site-wide wordmark: 滲む + nijimu, matching the puddle homescreen chrome. */
export function PageHeader({
  layout = "block",
  tone = "light",
  link = true,
  carousel,
  onCarousel,
  style,
}: PageHeaderProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const layoutStyle: CSSProperties =
    layout === "absolute"
      ? {
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          top: PAGE_HEADER_MARK.top,
          margin: 0,
          zIndex: 100,
        }
      : {
          marginTop: 30,
          marginRight: "auto",
          marginLeft: "auto",
          marginBottom: "clamp(60px, 15vh, 100px)",
          width: "fit-content",
        };

  const markStyle: CSSProperties = {
    fontFamily: SERIF_CJK,
    fontStyle: "normal",
    fontSize: PAGE_HEADER_MARK.fontSize,
    letterSpacing: PAGE_HEADER_MARK.letterSpacing,
    lineHeight: 1.5,
    color: tone === "dark" ? "#d7d6d6" : CHROME_GRAY,
    whiteSpace: "nowrap",
    textDecoration: "none",
    textTransform: "lowercase",
    display: "flex",
    alignItems: "center",
    gap: PAGE_HEADER_MARK.gap,
    ...layoutStyle,
    ...style,
  };

  const children = (
    <>
      <span>滲む</span>
      <span>nijimu</span>
    </>
  );

  const showCarousel = carousel ?? (pathname !== "/" && pathname !== CAROUSEL_PATH && pathname !== NAMING_PATH);

  const mark = !link ? (
    <p style={markStyle}>{children}</p>
  ) : (
    <a
      href={import.meta.env.BASE_URL}
      onClick={(e) => {
        e.preventDefault();
        navigate("/");
      }}
      style={{ ...markStyle, cursor: "pointer" }}
    >
      {children}
    </a>
  );

  return (
    <>
      {mark}
      {showCarousel && (
        <GalleryViewToggle
          view="carousel"
          label="gallery view"
          onToggle={onCarousel ?? (() => navigate(CAROUSEL_PATH))}
        />
      )}
    </>
  );
}
