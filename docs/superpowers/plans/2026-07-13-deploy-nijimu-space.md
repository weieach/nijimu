# Deploy nijimu to nijimu.space — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** nijimu live at https://nijimu.space with working voice recording and AI polish.

**Architecture:** Vercel hosts the Vite static build plus one serverless function (`api/polish.ts`, already committed) that wraps the same `polishTranscript` handler the dev server uses. `vercel.json` (already committed) rewrites non-API routes to `index.html` for client-side routing. The Anthropic key lives only in Vercel env vars and `nijimu/.env.local`.

**Tech Stack:** Vite 6, pnpm 10 (pinned via `packageManager`), Vercel (framework preset: Vite), Anthropic API.

---

## Already done (pre-verified 2026-07-13, committed on `main`)

- ✅ `api/polish.ts` Vercel function + `vercel.json` SPA rewrites (commit `4cbd98a`)
- ✅ Input guardrails: <3 words → 400, >5000 chars → 400, validation before key check
- ✅ `package-lock.json` removed, `"packageManager": "pnpm@10.5.2"` pinned (commit `e054b02`) — without this Vercel could pick npm and fail on React 19 peer deps
- ✅ `pnpm build` passes locally (~5.5s; only a benign chunk-size warning)
- ✅ Push access to `github.com/weieach/nijimu` confirmed via `git push --dry-run`

---

### Task 1: Local end-to-end test with the real API key

Needs Mavis (key + microphone). Do this before deploying so any prompt/quality tuning happens locally.

**Files:**
- Create: `nijimu/.env.local` (gitignored — never commit)

- [ ] **Step 1: Create the env file**

```bash
cd "/Users/mavix/Desktop/New Web/nijimu"
cp .env.local.example .env.local
# then edit .env.local and paste the real key:
# ANTHROPIC_API_KEY=sk-ant-...
```

- [ ] **Step 2: Verify the dev server picked it up**

Vite restarts itself when `.env.local` changes (watch the preview server log for "restarting server"). Then:

```bash
curl -s -X POST http://localhost:5173/api/polish \
  -H 'Content-Type: application/json' \
  -d '{"transcript": "I remember the day we sat by the river watching the sun set behind the mountains and everything felt slow and warm and I did not want it to end"}'
```

Expected: HTTP 200, `{"polished": "..."}` with a literary rewrite. If 500 "not set", the server hasn't restarted — restart the `nijimu` preview server.

- [ ] **Step 3: Full browser flow (Chrome, real mic)**

Open http://localhost:5173/record/start → record a short memory → stop → transcript page → **polish** → pick a version → highlight words → continue through naming to `/record/saved`.

Expected: live words appear while speaking; polished version reads well and preserves details. If polish quality is off, tune `SYSTEM_PROMPT` in `server/polish.ts:3` and repeat.

### Task 2: Push to GitHub

**Files:** none (git only)

- [ ] **Step 1: Push main**

```bash
cd "/Users/mavix/Desktop/New Web/nijimu"
git push origin main
```

Expected: `0cab020..<latest>  main -> main`. (Dry-run already succeeded; credentials are stored.)

### Task 3: Create the Vercel project

Dashboard flow (no CLI needed; `vercel` CLI is not installed on this machine).

- [ ] **Step 1: Import the repo**

Go to https://vercel.com/new → Import Git Repository → select `weieach/nijimu` (authorize GitHub access to that account if prompted).

- [ ] **Step 2: Confirm auto-detected settings**

- Framework Preset: **Vite** (auto)
- Build Command: `pnpm build` / default (`vite build && node scripts/copy-404.mjs` — the 404 copy is a harmless GitHub Pages leftover)
- Output Directory: `dist`
- Install Command: default (pnpm, via the lockfile + `packageManager` pin)
- Root Directory: `./` (the repo root **is** the app; the local nesting inside the portfolio folder is irrelevant to Vercel)

- [ ] **Step 3: Add the env var before first deploy**

In the same import screen, Environment Variables:
- `ANTHROPIC_API_KEY` = the real key (Production + Preview)
- (optional) `POLISH_MODEL` = `claude-haiku-4-5` if polish cost matters more than quality — otherwise omit; default is `claude-opus-4-8`

Do NOT set `VITE_BASE_PATH` — the app must build with base `/` for a custom domain.

- [ ] **Step 4: Deploy and confirm build**

Click Deploy. Expected: build log shows pnpm installing and `✓ built in ~6s`; deployment gets a `*.vercel.app` URL.

### Task 4: Verify on the vercel.app URL (before touching DNS)

- [ ] **Step 1: API check**

```bash
curl -s -X POST https://<project>.vercel.app/api/polish \
  -H 'Content-Type: application/json' \
  -d '{"transcript": "I remember the day we sat by the river watching the sun set behind the mountains and everything felt slow"}'
```

Expected: HTTP 200 with `{"polished": ...}`. A 500 here means the env var is missing/typo'd in Vercel.

- [ ] **Step 2: SPA rewrite check**

Open `https://<project>.vercel.app/record/transcript` directly (deep link, not via navigation). Expected: transcript page renders with the sample memory, no 404.

- [ ] **Step 3: Full flow check**

In Chrome on the vercel.app URL: record (mic works — HTTPS) → polish → choose → highlight → name → saved.

### Task 5: Attach nijimu.space

- [ ] **Step 1: Add the domain in Vercel**

Project → Settings → Domains → Add → `nijimu.space`. Also add `www.nijimu.space` and set it to redirect to the apex.

- [ ] **Step 2: Configure DNS at the registrar**

Vercel will display the exact records (an A record for the apex + CNAME for www, or a nameserver switch). Copy the values **from the dashboard** — don't use remembered IPs. Nameserver switch is the lower-maintenance option if the registrar allows it.

- [ ] **Step 3: Wait for verification + certificate**

Expected: domain shows "Valid Configuration" in Vercel (minutes for A/CNAME, up to a few hours for nameserver propagation). HTTPS cert is automatic.

### Task 6: Post-launch verification on nijimu.space

- [ ] **Step 1: Repeat Task 4's three checks against https://nijimu.space**

- [ ] **Step 2: Confirm auto-deploy loop**

Make any trivial commit, `git push origin main`, and confirm Vercel deploys it automatically. From here on, deploys = push.

---

## Backlog (post-launch, not blocking)

- **Rate-limit `/api/polish`** before sharing the site widely — every call costs API credits. Vercel WAF rate-limiting rules need no code changes; Vercel BotID is the heavier option.
- Code-split the 1.6 MB JS bundle (three.js + MediaPipe dominate) via `manualChunks` or dynamic imports for faster first load.
- `robots.txt` / OG meta tags for the domain, if the site should present well when shared.
