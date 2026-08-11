import { CSSProperties } from "react";
import { useNavigate } from "react-router";
import { CHROME_GRAY } from "../lib/colors";
import { SERIF } from "../lib/theme";

interface PageHeaderProps {
  /** absolute = pinned top-center (full-bleed pages); block = in-flow with bottom margin (light pages) */
  layout?: "absolute" | "block";
  /** light pages use chrome gray; dark pages use a lighter gray on dark grounds */
  tone?: "light" | "dark";
  /** When false, render a non-link mark (homescreen chrome). Default true. */
  link?: boolean;
  style?: CSSProperties;
}

/** Site-wide wordmark: 滲む + nijimu, matching the puddle homescreen chrome. */
export function PageHeader({
  layout = "block",
  tone = "light",
  link = true,
  style,
}: PageHeaderProps) {
  const navigate = useNavigate();

  const layoutStyle: CSSProperties =
    layout === "absolute"
      ? {
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          top: 30,
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
    fontFamily: SERIF,
    fontStyle: "normal",
    fontSize: 12,
    letterSpacing: "0.16px",
    lineHeight: 1.5,
    color: tone === "dark" ? "#d7d6d6" : CHROME_GRAY,
    whiteSpace: "nowrap",
    textDecoration: "none",
    display: "flex",
    alignItems: "center",
    gap: 12,
    ...layoutStyle,
    ...style,
  };

  const children = (
    <>
      <span>滲む</span>
      <span>nijimu</span>
    </>
  );

  if (!link) {
    return <p style={markStyle}>{children}</p>;
  }

  return (
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
}
