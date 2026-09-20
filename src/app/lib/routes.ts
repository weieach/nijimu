/** The water / ripple memory field — the previous default homescreen. */
export const MEMORY_FIELD_PATH = "/ripple";

/** 3D memory carousel — the screen Enter opens from the landing. */
export const CAROUSEL_PATH = "/memory";

/** Perspective water and reflection prompts, reached beyond either carousel end. */
export const MEMORY_POND_PATH = "/memory/pond";

/** Speak a memory — chrome over the same pond, not a separate water screen. */
export const RECORD_START_PATH = "/record/start";

/** Spoken words and highlights — same pond overlay as recording. */
export const TRANSCRIPT_PATH = "/record/transcript";

/** Camera gate before the MediaPipe shape steps. */
export const SHAPE_BUILD_PATH = "/record/build";

/** MediaPipe shape steps — one screen per gesture. */
export const SHAPE_GROW_PATH = "/record/shape/grow";
export const SHAPE_FEELING_PATH = "/record/shape/feeling";
export const SHAPE_DISTANCE_PATH = "/record/shape/distance";

/** The naming step of the create flow. Rendered by LandingPage (see App.tsx), so
    that saving can turn the naming rim into the /memory gallery in place. */
export const NAMING_PATH = "/record/name";
