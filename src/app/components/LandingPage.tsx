import { useNavigate } from "react-router";
import { BlobScene } from "./BlobScene";
import { writeVariant } from "./HomePage";

/** The water / ripple memory field — the previous default homescreen. */
export const MEMORY_FIELD_PATH = "/ripple";

/**
 * Original main-branch homescreen: the CSS blob field, restored as the
 * index. "enter" steps into the ripple field instead of starting a memory.
 */
export function LandingPage() {
  const navigate = useNavigate();
  return (
    <BlobScene
      classicChrome
      ctaLabel="enter"
      showPlus={false}
      onNewMemory={() => {
        writeVariant("ripple2d");
        navigate(MEMORY_FIELD_PATH);
      }}
    />
  );
}
