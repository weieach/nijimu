const CYCLE_MS = 10_000;
const HALF_MS = CYCLE_MS / 2;

/** Shared start time so weight → color → texture stay in the same 10s cycle. */
let shapeBuildEvolveAnchorMs: number | null = null;

/** Call when starting a new shape-build session (e.g. from BuildObjectPage). */
export function resetShapeBuildEvolveAnchor() {
  shapeBuildEvolveAnchorMs = null;
}

/** Remove legacy per-step `evolve` from router state so it never overrides the shared oscillation. */
export function stripLegacyEvolveFromState(state: unknown): Record<string, unknown> {
  if (!state || typeof state !== "object" || Array.isArray(state)) return {};
  const { evolve: _, ...rest } = state as Record<string, unknown>;
  return rest;
}

function ensureAnchorMs(): number {
  if (shapeBuildEvolveAnchorMs === null) {
    shapeBuildEvolveAnchorMs = performance.now();
  }
  return shapeBuildEvolveAnchorMs;
}

/**
 * Current evolve phase 0→1→0 over 10s (linear ramp each half), same as shared anchor.
 * Read from inside R3F useFrame — do not rely on React state for per-frame updates.
 */
export function getShapeBuildEvolvePhase(): number {
  const start = ensureAnchorMs();
  const elapsed = (performance.now() - start) % CYCLE_MS;
  return elapsed < HALF_MS
    ? elapsed / HALF_MS
    : (CYCLE_MS - elapsed) / HALF_MS;
}
