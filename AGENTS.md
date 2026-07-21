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
| Voice→text | **Web Speech API** (browser-native) | No dependency; Chrome-only, graceful fallback |
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
pnpm dev           # Vite dev server on :5173 (includes the /api/polish endpoint)
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
│   │   ├── App.tsx                 # ROUTER: all 20 routes + GlobalControls (music/profile)
│   │   ├── components/             # one file per screen, plus shared UI
│   │   ├── hooks/                  # reusable behavior (see §7)
│   │   ├── lib/                    # pure/shared modules (see §6)
│   │   └── data/memoryData.ts      # the 16 curated demo memories + color indices
│   ├── styles/                     # global CSS, fonts, tokens
│   ├── assets/fonts/               # self-hosted Exposure Trial .otf files
│   └── imports/                    # Figma-export raw SVG/asset files (9 kept, still referenced)
├── server/
│   ├── polish.ts                   # THE AI polish handler (pure function; single source of truth)
│   └── vite-plugin-polish.ts       # mounts POST /api/polish on the Vite DEV server
├── api/
│   ├── polish.ts                   # Vercel serverless function — wraps server/polish.ts for PROD
│   └── tsconfig.json               # Node-oriented TS config for the function (see §9, important)
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
/  (home blob field)
 └ /record/start      RecordingStartPage — live voice→text (or mock fallback)
   └ /record/transcript  TranscriptPage — shows transcript; optional AI "polish" → side-by-side choice; highlight words
     └ /record/name    NameMemoryPage — title + year
       └ /record/build BuildObjectPage — camera permission prompt; picks a random 3D model
         └ /record/shape/weight → /color → /texture   the three ShapeXPage editors (hand gestures / sliders)
           └ /record/connect  ConnectMemoriesPage — link to past memories
             └ /record/saved  MemorySavedPage — PERSISTS the memory to localStorage
```

**B. Revisit memories:**
```
/memory/scroll   MemoryScrollPage — vertical dot list with a 3D preview
 └ /memory/revisit  RevisitMemoryPage
   └ /memory/edit/weight | /color | /texture   EditXPage editors
```

Other routes: `/profile` (ProfilePage), `/record/orb` (OrbPage — **orphaned**, no
UI links to it), `/record/click` and `/record/process` (early recording variants).

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
| `memoryStore.ts` | **localStorage persistence.** `loadMemories()`, `saveMemory()`, `toMemoryEvent()`. Key: `nijimu.memories.v1`. |
| `polish.ts` | Browser-side `requestPolish(transcript)` — POSTs to `/api/polish`, never throws (returns `{polished, error}`). |

Shared components (in `components/`): **`PillButton`** (the rounded button used
everywhere — variants `light`/`dark`/`outline`) and **`PageHeader`** (the
lowercase "nijimu" wordmark link). Prefer these over hand-rolling.

---

## 7. `src/app/hooks/`

| Hook | Purpose |
|---|---|
| `useSpeechRecognition.ts` | Wraps the Web Speech API. Returns `{ isSupported, finalText, interimText, isListening, error, start, stop, reset }`. Auto-restarts on silence. Chrome-only; callers fall back to a mock transcript when `!isSupported`. |
| `useHandTracking.ts` | Owns the MediaPipe camera + HandLandmarker **lifecycle** (init, stream, detect loop, teardown, GPU→CPU fallback). Hands raw landmarks back via `onLandmarks`; **each page does its own gesture math** using the exported helpers `landmarkDistance`, `handCenter`, `createGestureGate`. |
| `useOscillatingEvolve.ts` | Shared 10s "breathing" animation cycle for the 3D shapes during the build steps. |

---

## 8. The AI polish feature (how the pieces connect)

```
Browser: TranscriptPage
   └ lib/polish.ts  requestPolish()  ──POST /api/polish──┐
                                                         │
   DEV:  server/vite-plugin-polish.ts  ─────────────────┤─→ server/polish.ts
   PROD: api/polish.ts (Vercel function) ───────────────┘     polishTranscript()
                                                                    └─→ Anthropic API (Claude)
```

- **`server/polish.ts`** holds the real logic (`polishTranscript()`) and the
  system prompt. It is the single source of truth, imported by both the dev
  plugin and the Vercel function.
- The **API key lives only server-side** (`ANTHROPIC_API_KEY` env var, no `VITE_`
  prefix). It is never in the client bundle.
- Model default: `claude-opus-4-8`, overridable via `POLISH_MODEL`.
- Guardrails: transcript must be ≥3 words and ≤5000 chars.
- Polish is **never a gate** — if it fails, the original transcript flows on.

Local setup: copy `.env.local.example` → `.env.local` and set `ANTHROPIC_API_KEY`.

---

## 9. Non-obvious rules & gotchas (read before editing)

1. **Two separate tsconfigs, on purpose.** `tsconfig.json` is browser/Vite
   (`types: ["vite/client"]`, DOM libs). `api/tsconfig.json` is Node
   (`types: ["node"]`, emit-friendly) so Vercel's `@vercel/node` can compile the
   serverless function. **Do not merge them** and **do not add
   `allowImportingTsExtensions` to the root** — that flag forces `noEmit` and
   breaks the Vercel function build. Don't import `.ts`/`.tsx` with the file
   extension anywhere.

2. **pnpm only.** `npm install` fails on React 19 peer deps.

3. **No persistence backend.** The only storage is `localStorage` via
   `lib/memoryStore.ts`. The 16 curated memories in `data/memoryData.ts` are
   demo data; saved memories are *appended* to them on home + scroll.

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
