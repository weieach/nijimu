/* ───────── particle text: letters drift in from scatter and focus ─────────
   The way words surface on the puddle screens — captions, the cursor hint,
   and the recording screen's arrival all speak through it. */

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Include once in the <style> of any page that renders ParticleText. */
export const PARTICLE_TEXT_KEYFRAMES = `
  @keyframes puddleLetterIn {
    from {
      opacity: 0;
      filter: blur(6px);
      transform: translate(var(--dx), var(--dy)) scale(1.2);
    }
    55% { opacity: 1; }
    to {
      opacity: 1;
      filter: blur(0);
      transform: translate(0, 0) scale(1);
    }
  }
`;

/** Scatter timing: how long the letters of a run keep arriving, in seconds. */
const SCATTER_SPREAD_S = 0.4;
/** Ordered timing: a touch of slop so a swept line still breathes. */
const SWEEP_JITTER_S = 0.05;

export function ParticleText({
  text,
  seed,
  animate,
  inline = false,
  wrap = false,
  delay = 0,
  sweep,
}: {
  text: string;
  seed: number;
  animate: boolean;
  /** Keep the run on the surrounding text line instead of starting its own. */
  inline?: boolean;
  /** Let long runs break between words (each word still gathers as one). */
  wrap?: boolean;
  /** Seconds before the first letters begin to gather. */
  delay?: number;
  /**
   * Seconds for the reveal to travel from the first letter to the last. Set it
   * and the line gathers in reading order; leave it off and the letters arrive
   * scattered, the way the homescreen captions do.
   */
  sweep?: number;
}) {
  const rand = mulberry32(seed);
  const Line = inline ? "span" : "div";

  return (
    <>
      {text.split("\n").map((line, li) => {
        const words = line.split(" ");
        const total = wrap ? words.reduce((n, w) => n + w.length, 0) : line.length;
        let emitted = 0;

        const letter = (ch: string, key: number) => {
          const dx = (rand() - 0.5) * 30;
          const dy = (rand() - 0.5) * 24;
          const at = total > 1 ? emitted / (total - 1) : 0;
          emitted++;
          const d =
            delay +
            (sweep === undefined
              ? rand() * SCATTER_SPREAD_S
              : at * sweep + rand() * SWEEP_JITTER_S);
          return (
            <span
              key={key}
              style={{
                display: "inline-block",
                animation: animate
                  ? `puddleLetterIn 1.1s cubic-bezier(0.22, 1, 0.36, 1) ${d}s backwards`
                  : "none",
                ["--dx" as string]: `${dx}px`,
                ["--dy" as string]: `${dy}px`,
              }}
            >
              {ch === " " ? "\u00A0" : ch}
            </span>
          );
        };

        return (
          <Line key={li} style={{ whiteSpace: wrap ? "normal" : "nowrap" }}>
            {wrap
              ? words.map((word, wi) => (
                  <span key={wi}>
                    {wi > 0 && " "}
                    <span style={{ display: "inline-block", whiteSpace: "nowrap" }}>
                      {word.split("").map((ch, i) => letter(ch, i))}
                    </span>
                  </span>
                ))
              : line.split("").map((ch, i) => letter(ch, i))}
          </Line>
        );
      })}
    </>
  );
}
