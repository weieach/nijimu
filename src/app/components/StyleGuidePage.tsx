import { CSSProperties, ReactNode } from "react";
import { CHROME_GRAY } from "../lib/colors";
import { PAGE_BG } from "./PuddleBackdrop";
import { SANS, SANS_UI, SERIF, SERIF_CJK, SERIF_DISPLAY, SERIF_EXPOSURE } from "../lib/theme";
import { PageHeader } from "./PageHeader";
import { PillButton } from "./PillButton";

const SECTION: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 28,
};

const CAPTION: CSSProperties = {
  fontFamily: SANS,
  fontSize: 11,
  letterSpacing: "0.08em",
  color: "#a8a8b0",
  textTransform: "lowercase",
  margin: "0 0 10px",
};

function Specimen({
  name,
  note,
  children,
  ground,
}: {
  name: string;
  note?: string;
  children: ReactNode;
  ground?: string;
}) {
  return (
    <div>
      <p style={CAPTION}>
        {name}
        {note ? ` — ${note}` : ""}
      </p>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 16,
          padding: ground ? "28px 24px" : 0,
          background: ground,
          borderRadius: ground ? 20 : 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}

const StopIcon = ({ fill }: { fill: string }) => (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden>
    <rect x="4" y="4" width="12" height="12" rx="2" fill={fill} />
  </svg>
);

export function StyleGuidePage() {
  const noop = () => {};

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: PAGE_BG,
        padding: "0 28px 80px",
      }}
    >
      <PageHeader link={false} />

      <main
        style={{
          maxWidth: 640,
          margin: "0 auto",
        }}
      >
        <p
          style={{
            fontFamily: SERIF,
            fontSize: 14,
            color: CHROME_GRAY,
            margin: "0 0 48px",
            textTransform: "lowercase",
          }}
        >
          buttons and labels
        </p>

        <section style={{ ...SECTION, marginBottom: 72 }}>
          <h2
            style={{
              fontFamily: SERIF,
              fontSize: 12,
              fontWeight: 400,
              color: "#acacac",
              letterSpacing: "0.04em",
              textTransform: "lowercase",
              margin: 0,
            }}
          >
            buttons
          </h2>

          <Specimen name="primary" note="PillButton light">
            <PillButton label="continue" onClick={noop} />
            <PillButton label="continue" onClick={noop} trailing="›" />
            <PillButton label="record" onClick={noop} />
          </Specimen>

          <Specimen name="primary disabled">
            <PillButton label="continue" onClick={noop} disabled trailing="›" />
          </Specimen>

          <Specimen name="secondary" note="PillButton outline">
            <PillButton label="view all memories" onClick={noop} variant="outline" />
            <PillButton label="polish" onClick={noop} variant="outline" trailing="✦" />
            <PillButton label="show sample transcript" onClick={noop} variant="outline" />
          </Specimen>

          <Specimen name="secondary disabled">
            <PillButton label="polish" onClick={noop} variant="outline" disabled trailing="✦" />
          </Specimen>

          <Specimen name="dark primary" note="PillButton dark" ground="#1c1c1e">
            <PillButton label="click to record" onClick={noop} variant="dark" />
            <PillButton
              label="stop"
              onClick={noop}
              variant="dark"
              icon={<StopIcon fill="white" />}
            />
          </Specimen>

          <Specimen name="primary with icon">
            <PillButton
              label="stop"
              onClick={noop}
              icon={<StopIcon fill={CHROME_GRAY} />}
            />
          </Specimen>

          <Specimen name="icon" note="back / chrome">
            <button
              type="button"
              aria-label="back"
              onClick={noop}
              style={{
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 0,
                opacity: 0.6,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7b7b87" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="profile"
              onClick={noop}
              style={{
                width: 36,
                height: 36,
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={CHROME_GRAY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </button>
          </Specimen>
        </section>

        <section style={SECTION}>
          <h2
            style={{
              fontFamily: SERIF,
              fontSize: 12,
              fontWeight: 400,
              color: "#acacac",
              letterSpacing: "0.04em",
              textTransform: "lowercase",
              margin: 0,
            }}
          >
            labels
          </h2>

          <Specimen name="wordmark" note="PageHeader">
            <span
              style={{
                fontFamily: SERIF_CJK,
                fontSize: 12,
                letterSpacing: "0.16px",
                color: CHROME_GRAY,
                textTransform: "lowercase",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span>滲む</span>
              <span>nijimu</span>
            </span>
          </Specimen>

          <Specimen name="field" note="slider / control">
            <span
              style={{
                fontFamily: SANS,
                fontSize: 12,
                color: "#8C8C8C",
                textTransform: "lowercase",
              }}
            >
              warmth
            </span>
          </Specimen>

          <Specimen name="field value">
            <span
              style={{
                fontFamily: SANS,
                fontSize: 12,
                color: "#8C8C8C",
              }}
            >
              42%
            </span>
          </Specimen>

          <Specimen name="choice" note="your words / polished">
            <span
              style={{
                fontFamily: SERIF,
                fontSize: 12,
                color: "#7b7b87",
                textTransform: "lowercase",
              }}
            >
              your words
            </span>
            <span
              style={{
                fontFamily: SERIF,
                fontSize: 12,
                color: "#acacac",
                textTransform: "lowercase",
              }}
            >
              polished
            </span>
          </Specimen>

          <Specimen name="profile" note="uppercase meta">
            <span
              style={{
                fontFamily: SANS,
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: "0.5px",
                color: "#9b9ba3",
                textTransform: "uppercase",
              }}
            >
              Member Since
            </span>
          </Specimen>

          <Specimen name="eyebrow" note="instructional meta">
            <span
              style={{
                fontFamily: SANS,
                fontSize: 11,
                color: "#a8a8b0",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
              }}
            >
              click to select · hover to preview
            </span>
          </Specimen>

          <Specimen name="hint" note="caption / status">
            <span
              style={{
                fontFamily: SERIF,
                fontSize: 12,
                lineHeight: 1.45,
                color: CHROME_GRAY,
              }}
            >
              transcribing...
            </span>
          </Specimen>

          <Specimen name="instruction">
            <span
              style={{
                fontFamily: SERIF,
                fontSize: 14,
                lineHeight: 1.5,
                color: CHROME_GRAY,
                textTransform: "lowercase",
              }}
            >
              drag to highlight the words that touch you the most.
            </span>
          </Specimen>

          <Specimen name="prompt" note="SERIF_EXPOSURE">
            <span
              style={{
                fontFamily: SERIF_EXPOSURE,
                fontSize: 18,
                fontWeight: 400,
                fontSynthesis: "none",
                color: CHROME_GRAY,
              }}
            >
              What's been lingering on your mind?
            </span>
          </Specimen>

          <Specimen name="display" note="SERIF_DISPLAY">
            <span
              style={{
                fontFamily: SERIF_DISPLAY,
                fontSize: 16,
                fontWeight: 400,
                lineHeight: 1.6,
                letterSpacing: "0.02em",
                color: "#2D2727",
              }}
            >
              the hallway still smelled like rain
            </span>
          </Specimen>

          <Specimen name="button label" note="SANS / SANS_UI">
            <span
              style={{
                fontFamily: SANS,
                fontSize: 16,
                letterSpacing: "0.01em",
                color: "#7b7b87",
                textTransform: "lowercase",
              }}
            >
              continue
            </span>
            <span
              style={{
                fontFamily: SANS_UI,
                fontSize: 16,
                fontWeight: 300,
                letterSpacing: "0.03em",
                color: "#7b7b87",
                textTransform: "lowercase",
              }}
            >
              click to record
            </span>
          </Specimen>
        </section>
      </main>
    </div>
  );
}
