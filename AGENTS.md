# nijimu — Project Guide for AI Assistants

> This file orients an AI coding assistant (Cursor, Claude, etc.) to the nijimu
> codebase: what it is, how it's built, where things live, and the non-obvious
> rules. Read it before making changes.

---

## 1. What nijimu is

nijimu (滲む — Japanese for "to blur / bleed into") is a **poetic memory-keeping
web app**. The user speaks a memory aloud, it's transcribed and optionally
rewritten into literary prose by AI, then sculpted into a soft 3D "object" that
joins a field of blurred blobs on the home canvas — each blob is one memory.

It is a mood piece, not a utility app. The aesthetic is quiet, contemplative,
low-contrast, serif-heavy. Copy is lowercase and unhurried. **When editing UI,
match that restraint** — no bright accents, no exclamation marks, no dense
chrome.

The app began as a **Figma Make export** (see `README.md`) and has since been
refactored into a real codebase.

---

## 2. Tech stack

| Concern | Choice | Notes |
|---|---|---|
| Build tool | **Vite 6** | Transpiles via esbuild; does *not* typecheck |
| UI | **React 19** + TypeScript | |
| Routing | **react-router 7** | `createBrowserRouter`, one layout route |
| 3D | **three** + **@react-three/fiber** + **@react-three/drei** | The memory "objects" |
| Hand gestures | **@mediapipe/tasks-vision** | Pinch/hand-distance controls in shape editors |
| Voice→text | **OpenAI speech-to-text** via `/api/transcribe` | Audio recorded with `MediaRecorder`, transcribed server-side; key never reaches the browser |
| AI polish | **@anthropic-ai/sdk** (Claude) | Server-side only; key never reaches the browser |
| Styling | Mostly **inline `style={}`** objects; Tailwind 4 is present but lightly used | |
| Package manager | **pnpm** (pinned in `packageManager`) | `npm install` fails on React 19 peer deps — always use pnpm |
| Deploy target | **Vercel** → nijimu.space | GitHub Pages is abandoned (can't run the API) |

Dependencies are deliberately minimal (9 runtime deps). A large pile of unused
Figma-export deps (MUI, Radix, etc.) was pruned — **don't reintroduce a UI
library**; build with the existing primitives.

---

## 3. Commands

```bash
pnpm install       # use pnpm, never npm
pnpm dev           # Vite dev server on :5180 (includes the /api/polish endpoint)
pnpm build         # vite build + copy-404.mjs (the 404 copy is a harmless GH-Pages leftover)
pnpm typecheck     # tsc --noEmit on the frontend AND the api/ function — run before pushing
```

There is **no test framework**. Verification is: `pnpm typecheck`, `pnpm build`,
and manually exercising the running dev server.

---

## 4. Directory map — where to find things

```
nijimu/
├── src/
│   ├── main.tsx                    # entry — mounts <App/>
│   ├── app/
│   │   ├── App.tsx                 # ROUTER + GlobalControls (music/profile)
│   │   ├── components/             # one file per live screen, plus shared UI
│   │   ├── archive/                # unused former record-loop pages
│   │   ├── hooks/                  # reusable behavior (see §7)
│   │   ├── lib/                    # pure/shared modules (see §6)
│   │   └── data/memoryData.ts      # the 16 curated demo memories + color indices
│   ├── styles/                     # global CSS, fonts, tokens
│   ├── assets/fonts/               # self-hosted Exposure Trial .otf files
│   └── imports/                    # Figma-export raw SVG/asset files (9 kept, still referenced)
├── server/
│   ├── polish.mjs                  # THE AI polish handler (pure JS function; single source of truth)
│   ├── transcribe.mjs              # THE speech-to-text handler (same shape as polish.mjs)
│   ├── vite-plugin-polish.mjs      # mounts POST /api/polish on the Vite DEV server
│   └── vite-plugin-transcribe.mjs  # mounts POST /api/transcribe on the Vite DEV server
├── api/
│   ├── polish.mjs                  # Vercel serverless function — wraps server/polish.mjs for PROD
│   └── transcribe.mjs              # Vercel serverless function — wraps server/transcribe.mjs
├── docs/superpowers/               # design specs + deploy/refactor plans (context, not code)
├── scripts/copy-404.mjs            # GH-Pages SPA fallback (leftover, harmless on Vercel)
├── vercel.json                     # SPA rewrites (everything except /api → index.html)
├── vite.config.ts                  # Vite config + registers the dev polish plugin
├── tsconfig.json                   # FRONTEND typescript config (browser-oriented)
└── package.json
```

---

## 5. Application flow (the two journeys)

Everything is a route in `src/app/App.tsx`, wrapped in a single `RootLayout`
that renders `GlobalControls` (background music + profile button) once, so
**navigating does not remount or restart the music**.

**A. Create a memory** (the main flow):
```
/  (landing)
 └ /memory            MemoryCarouselPage — dive gallery
   └ /memory/pond     MemoryPondPage — hold to record
     └ /record/start      PuddleRecordingPage — records the voice, sends it to /api/transcribe
       └ /record/transcript  PuddleTranscriptPage — words + highlight
         └ /record/name      naming rim on LandingPage — title + year; this visit only
           └ /memory         same gallery, now including the new memory
```

**B. Revisit memories:**
```
/memory/scroll   MemoryScrollPage — vertical dot list with a 3D preview
 └ /memory/revisit  RevisitMemoryPage
   └ /memory/edit/weight | /color | /texture   EditXPage editors
     └ /record/saved  MemorySavedPage — writes the edited memory
```

The previous sculpt loop (`/record/build`, `/record/shape/*`, blob recording,
gray transcript, orb / click / process) lives in `src/app/archive/record-loop/`.

The profile is **not a route** — the profile button in `GlobalControls` opens
`ProfilePanel`, a glass popup over the current page (iridescent WebGL sheen from
`IridescentSheen` + grain), so opening it never leaves the page you were on.

### State passing (important gotcha)
The create flow carries data forward via **react-router `location.state`**
(`navigate(path, { state })`), accumulated step by step. This means **deep-linking
into the middle of the flow loses context** and pages fall back to sample data.
A `location.state` → context/store refactor is noted as future work but not done.

---

## 6. `src/app/lib/` — shared modules

| File | Purpose |
|---|---|
| `theme.ts` | Font-stack constants (`SERIF`, `SANS`, `SANS_UI`, `SERIF_DISPLAY`, …). **Use these instead of inline font strings.** |
| `colors.ts` | `COLOR_PALETTE` (the 9 blob tints w/ light variants) + `MEMORY_COLORS`. Single source — was duplicated in 4 files. |
| `memoryStore.ts` | Session-only user memories. `loadMemories()`, `saveMemory()`, `toMemoryEvent()`. Nothing is written to disk; a reload shows only the curated archive. |
| `polish.ts` | Browser-side `requestPolish(transcript)` — POSTs to `/api/polish`, never throws (returns `{polished, error}`). |
| `transcribe.ts` | Browser-side `requestTranscription(audio)` — POSTs the recording to `/api/transcribe`, never throws. Also holds the **recording→transcript hand-off**: `beginTranscription(audio)` starts the request and returns an id, `getTranscription(id)` picks it up on the next screen. |

Shared components (in `components/`): **`PillButton`** (the rounded button used
everywhere — variants `light`/`dark`/`outline`) and **`PageHeader`** (the
lowercase "nijimu" wordmark link). Prefer these over hand-rolling.

---

## 7. `src/app/hooks/`

| Hook | Purpose |
|---|---|
| `useVoiceRecorder.ts` | The recording session: `MediaRecorder` capture (60s cap), microphone errors, and a loudness meter. Hands the finished `Blob` to `onStop`; exposes `level` + `voicePulse` so the puddle can ripple with the voice. |
| `useHandTracking.ts` | Owns the MediaPipe camera + HandLandmarker **lifecycle** (init, stream, detect loop, teardown, GPU→CPU fallback). Hands raw landmarks back via `onLandmarks`; **each page does its own gesture math** using the exported helpers `landmarkDistance`, `handCenter`, `createGestureGate`. |
| `useOscillatingEvolve.ts` | Shared 10s "breathing" animation cycle for the 3D shapes during the build steps. |

---

## 8. The AI features (how the pieces connect)

### 8a. Transcription — the spoken memory becomes words

```
Browser: PuddleRecordingPage
   └ hooks/useVoiceRecorder  MediaRecorder ──► audio Blob
   └ lib/transcribe.ts  beginTranscription() ──POST /api/transcribe (raw audio body)──┐
                                                                                      │
   DEV:  server/vite-plugin-transcribe.mjs  ──────────────────────────────────────────┤─→ server/transcribe.mjs
   PROD: api/transcribe.mjs (Vercel function) ────────────────────────────────────────┘     transcribeAudio()
                                                                                                  └─→ OpenAI speech-to-text
```

- The request **outlives the recording screen**: `beginTranscription()` fires it,
  returns an id, and the screen navigates on with that id in `location.state`.
  `TranscriptPage` looks the request up and shows "transcribing…" until the words
  land, then types them in. The audio itself never enters `location.state`.
- The body is the **raw recording**, with its mime type in `Content-Type` — no
  multipart parsing in the endpoint. Format follows the browser (webm/opus in
  Chrome, mp4 in Safari); `server/transcribe.mjs` maps it to a filename OpenAI
  will accept.
- Key: `OPENAI_API_KEY` (server-side only). Model default `gpt-4o-transcribe`,
  overridable via `TRANSCRIBE_MODEL`.
- Guardrails: recordings cap at 60s, bodies at 4 MB (Vercel's limit is 4.5 MB).
- Unlike polish, transcription **is** a gate — there is no memory without words,
  so a failure shows the reason and a "record again" way back.

### 8b. Polish — the words become prose

```
Browser: TranscriptPage
   └ lib/polish.ts  requestPolish()  ──POST /api/polish──┐
                                                         │
   DEV:  server/vite-plugin-polish.mjs  ────────────────┤─→ server/polish.mjs
   PROD: api/polish.mjs (Vercel function) ──────────────┘     polishTranscript()
                                                                    └─→ Anthropic API (Claude)
```

- **`server/polish.mjs`** holds the real logic (`polishTranscript()`) and the
  system prompt. It is the single source of truth, imported by both the dev
  plugin and the Vercel function. It is **plain JavaScript on purpose** (see §9).
- The **API key lives only server-side** (`ANTHROPIC_API_KEY` env var, no `VITE_`
  prefix). It is never in the client bundle.
- Model default: `claude-opus-4-8`, overridable via `POLISH_MODEL`.
- Guardrails: transcript must be ≥3 words and ≤5000 chars.
- Polish is **never a gate** — if it fails, the original transcript flows on.

Local setup: copy `.env.local.example` → `.env.local` and set `OPENAI_API_KEY`
(recording) and `ANTHROPIC_API_KEY` (polish). Both also have to exist as Vercel
environment variables for production.

---

## 9. Non-obvious rules & gotchas (read before editing)

1. **The `api/` + `server/` function path is plain JavaScript (`.mjs`), not
   TypeScript — on purpose.** `api/*.mjs` + `server/*.mjs` are JS so Vercel's
   `@vercel/node` bundles them with esbuild and never runs a TypeScript compile
   step (that step repeatedly crashed the Vercel build with "Cannot read
   properties of undefined (reading 'readFile')" on this toolchain). **Keep this
   path JS.** If you must add types, use JSDoc — don't convert these files back
   to `.ts`. The frontend (`src/`) stays TypeScript; `tsconfig.json` covers only
   that. Also don't add `allowImportingTsExtensions` to the root tsconfig or
   import files with a `.ts`/`.tsx` extension.

2. **pnpm only.** `npm install` fails on React 19 peer deps.

3. **No persistence.** User-made memories stay in memory for this visit
   (`lib/memoryStore.ts`) and are gone on reload. The 16 curated memories in
   `data/memoryData.ts` are the archive the app always opens with.

4. **`GlobalControls` must stay in the layout route**, not per-page — otherwise
   the background music restarts on every navigation.

5. **`src/imports/`** is Figma-export residue. Only 9 files there are still
   referenced (some SVG path modules + `NewMomoryIdle`/`PlusSign`). Don't build
   new features on top of it.

6. **Deploy = push.** Vercel auto-deploys `main`. `vercel.json` handles SPA
   routing. No GitHub Actions workflow (the old GH-Pages one was removed).

7. **Styling is mostly inline `style={}`.** That's the existing convention here;
   follow it for consistency rather than introducing CSS modules or a UI kit.

---

## 10. Further context

`docs/superpowers/` holds the design spec for the voice/polish feature and the
refactor + deployment plans. They explain *why* decisions were made and what's
intentionally deferred (e.g. merging the 6 ShapeX/EditX editor pages, moving
flow state off `location.state`, code-splitting the ~1.5 MB bundle). Consult
them before large structural changes so you don't redo settled decisions.
