import { useNavigate } from "react-router";
import { BlobScene } from "./BlobScene";
import { writeVariant } from "./HomePage";
import { MEMORY_FIELD_PATH } from "../lib/routes";

export { MEMORY_FIELD_PATH };

/**
 * Original main-branch homescreen: the CSS blob field, restored as the
 * index. "enter" steps into the ripple field instead of starting a memory.
 */
export function LandingPage() {
  const navigate = useNavigate();
  return (
    <BlobScene
      classicChrome
      ctaLabel="Enter"
      showPlus={false}
      onNewMemory={() => {
        writeVariant("ripple2d");
        navigate(MEMORY_FIELD_PATH);
      }}
    />
  );
}
