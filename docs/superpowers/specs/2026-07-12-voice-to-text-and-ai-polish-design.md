# Voice-to-Text & AI Literary Polish — Design

Date: 2026-07-12
Status: approved (chat), implementation starting with voice-to-text

## Context

nijimu's recording flow is fully mocked: `RecordingStartPage` runs a 10s timer
and types out a hardcoded transcript; `TranscriptPage` receives no state and
falls back to its own sample text. There is no backend (pure Vite SPA).

Decisions made with Mavis:
- Runs locally for now, should have a clean path to public deployment later
- Voice-to-text: browser Web Speech API (free, live, no key)
- Polish: Anthropic API (Claude), key provided by Mavis
- Polish UX: side-by-side choice between original and polished text
- Architecture: Vite dev-server middleware endpoint `/api/polish`
  (portable to a Vercel function unchanged when deploying)

## Feature 1 — Voice-to-text

- New hook `src/app/hooks/useSpeechRecognition.ts` wrapping
  `webkitSpeechRecognition` / `SpeechRecognition`: continuous, interim
  results. Exposes `{ isSupported, start, stop, finalText, interimText, reset }`.
- `RecordingStartPage`:
  - "click to record" starts recognition (browser prompts for mic)
  - live transcript replaces the mock typing effect; interim words render
    slightly faded, finalized words solid
  - recording cap raised 10s → 60s; manual stop unchanged
  - on stop, navigate to `/record/transcript` with
    `state: { transcript }` (fixes the currently-dropped transcript)
  - fallback: unsupported browsers keep today's mock behavior with a small
    "live transcription needs Chrome" hint

## Feature 2 — AI polish endpoint

- Vite plugin registering `POST /api/polish` on the dev server
- `ANTHROPIC_API_KEY` in `nijimu/.env.local` (gitignored, no VITE_ prefix —
  never reaches the client bundle)
- `@anthropic-ai/sdk`, model `claude-opus-4-8` default, `POLISH_MODEL` env
  override
- Contract: `{ transcript: string }` → `{ polished: string }`; errors return
  JSON `{ error }` with appropriate status
- System prompt: rewrite spoken memory as literary written prose — first
  person, preserve all factual details, similar length, quiet contemplative
  tone, return only the rewritten text
- Handler written as a plain function so it can move to a Vercel serverless
  function unchanged

## Feature 3 — Side-by-side choice (TranscriptPage)

- Quiet lowercase "polish" action (existing pill style) once transcript shown
- Loading state ("polishing…"), then two columns: your words / polished;
  stacked on mobile
- Selecting one highlights it; continue carries the chosen text to
  `/record/name`
- Polish is never a gate: failure or skipping keeps the original flowing

## Edge cases

- Transcript under ~10 words: polish action hidden
- Recognition ends early (silence): keep what was captured
- API failure: inline "couldn't polish — your words are safe", original stays
- Word-highlighting works on whichever version is selected

## Testing

Manual via preview server (no test framework in repo): mic recording in
Chrome, curl `/api/polish`, full flow to `/record/saved`. Mic verification
handed to Mavis.
