import { CSSProperties } from "react";
import { useNavigate } from "react-router";
import { SERIF } from "../lib/theme";

interface PageHeaderProps {
  /** absolute = pinned top-center (dark full-bleed pages); block = in-flow with bottom margin (light pages) */
  layout?: "absolute" | "block";
  /** light pages use #9b9ba3, dark pages use #d7d6d6 */
  tone?: "light" | "dark";
  style?: CSSProperties;
}

/** The lowercase "nijimu" wordmark link back home, previously copy-pasted on 11 pages. */
export function PageHeader({ layout = "block", tone = "light", style }: PageHeaderProps) {
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
          display: "block",
          marginTop: 30,
          marginRight: 0,
          marginLeft: 0,
          marginBottom: "clamp(60px, 15vh, 100px)",
          textAlign: "center",
        };

  return (
    <a
      href={import.meta.env.BASE_URL}
      onClick={(e) => {
        e.preventDefault();
        navigate("/");
      }}
      style={{
        fontFamily: SERIF,
        fontStyle: "normal",
        fontSize: 12,
        lineHeight: 1.5,
        color: tone === "dark" ? "#d7d6d6" : "#9b9ba3",
        textTransform: "lowercase",
        whiteSpace: "nowrap",
        textDecoration: "none",
        cursor: "pointer",
        ...layoutStyle,
        ...style,
      }}
    >
      nijimu
    </a>
  );
}
