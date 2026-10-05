# nijimu

This is a code bundle for nijimu. 

## Running the code

Run `npm i` to install the dependencies.

Run `npm run dev` to start the development server.

## Pages

- `/`: landing — enter opens the 3D memory carousel
- `/memory`: 3D memory carousel
- `/memory/pond`: hold to record a memory
- `/ripple`: home canvas where memories sit as a watercolor puddle, blob field, or ripple field
- `/record/start`: speak a memory aloud — the recording step of the create flow
- `/record/transcript`: shows the spoken words and word highlights
- `/record/name`: give the memory a title and year
- `/record/saved`: confirmation after editing a saved memory
- `/memory/scroll`: vertical list of memories with a live 3D preview
- `/memory/revisit`: open a saved memory and its 3D object
- `/memory/edit/weight`: re-sculpt an existing memory's weight
- `/memory/edit/color`: re-tint an existing memory
- `/memory/edit/texture`: re-texture an existing memory
---

`/style` — design system of buttons and labels (unlinked from the rest of the app)

The profile has no page of its own: the profile button opens a glass popup over
whatever page you are on.


## Fonts

Stacks live in `src/app/lib/theme.ts`. Faces are loaded in `src/styles/fonts.css`.

| Font | How it's loaded | Used as |
|---|---|---|
| **Rowan** | Self-hosted woff2 (Light–Bold, roman + italic) | Latin serif — English titles, body (`SERIF`) |
| **GenRyuMin2 TW** | Self-hosted woff2 subset (Regular; SIL OFL) | East Asian serif — the 滲む wordmark (`SERIF_CJK`); CJK fallback on `SERIF` |
| **Exposure Trial** | Self-hosted `ExposureTrial-20.otf` (optical grade −20) | Recording / profile display (`SERIF_EXPOSURE`) |
| **Exposure Trial Plus** | Self-hosted `ExposureTrial+10.otf` (optical grade +10) | Transcript / polish display (`SERIF_DISPLAY`) |
| **Switzer** | Self-hosted woff2 (Thin–Black, roman + italic) | UI sans — labels, light / outline buttons, editor chrome (`SANS`) |

Named but not loaded: **SF Pro** (`SANS_UI` — Apple system font on dark buttons, then `system-ui`).

System / leftover fallbacks: **Georgia** (serif fallback; also hardcoded in a few pages), **Helvetica Neue / Helvetica / Arial** (`RecordingProcessPage`), and **SF Mono / Monaco / monospace** (timer on `/record/click` and shape-editor numeric readouts).

```
SERIF          = Rowan, 'GenRyuMin2 TW', Georgia, serif
SERIF_CJK      = 'GenRyuMin2 TW', Rowan, Georgia, serif
SERIF_DISPLAY  = 'Exposure Trial Plus', Rowan, 'GenRyuMin2 TW', Georgia, serif
SERIF_EXPOSURE = 'Exposure Trial', Rowan, 'GenRyuMin2 TW', Georgia, serif
SANS           = Switzer, sans-serif
SANS_UI        = 'SF Pro', system-ui, sans-serif
```

## Homescreen shortcuts (`/ripple`)

| Key | Action |
|---|---|
| **A** | Original blob field (compare) |
| **B** | Puddle field |
| **Z** | Ripple2d field (default on this route) |
| **G** | Open memory artifact gallery (on the puddle homescreen: the dive-through-the-water gallery) |
| **V** | Toggle gallery variant: dive ↔ morph (A/B; dive is the default and only runs on the puddle homescreen) |
| **← / →** | Browse gallery |
| **Esc** | Exit gallery |


## Memory-to-form study (`/lab/meaning`)

This lab connects a full recorded or typed transcript to the photo/descent lab.
The live create route is unchanged. Start the app with `pnpm dev`, open
`http://localhost:5180/lab/meaning`, record/paste a memory, then **find its form**.
The four mesh cards and score sliders also work without an API key, explicitly
labelled as manual studies. **Take it to the water** carries the assignment into
`/lab/descent`; choosing a photo, sculpting and naming retain it. If you continue
before requesting a reading, it runs while choosing the photo. API failure never
blocks descent; the fallback is an unassigned sphere, not fabricated sentiment.

Assessment reuses the transcription `OPENAI_API_KEY` server-side in `.env.local`
(or Vercel); no separate key is needed. The optional `ASSESS_MODEL` defaults to
`gpt-4.1-mini`. Restart Vite after changing
environment values. Only the transcript is sent for assessment, not the photo.
The API uses [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
with response storage disabled, then validates ranges, bounded text and exact evidence quotes independently.

### How the parameter families are derived

For `a=b=1` and `n2=n3=n`, the radius on a lobe axis is 1, while the radius
halfway to the next axis is `2^((n/2 - 1)/n1)`. Thus `n<2` creates valleys,
`n>2` creates bulges, and `n=2` makes a circle. Reducing `n1` amplifies the
valley/bulge. The longitude curve describes the cross-section around the body;
the latitude curve describes its silhouette from bottom to top. These relations
come directly from the formula implemented in `superformula.ts`.

Full-strength base tuples below are `(m, n1, n2, n3)`:

| Family | Longitude / top | Latitude / side | Radial : vertical proportion | Visual intention |
|---|---|---|---|---|
| Shell | `(6, .9, 1.45, 1.45)` | `(2, .8, 1.25, 1.25)` | `.95 : 1.05` | Soft ribs around a gathered dome |
| Bowl | `(4, 2, 2, 2)` | `(6, 1.8, 3.8, 3.8)` | `1.15 : .9` | Circular cross-section with smooth flares around a waist |
| Tower | `(4, .75, 1.25, 1.25)` | `(8, .65, .85, .85)` | `.75 : 1.25` | Narrow body, pinched profile bands, stacked tiers |
| Floral | `(6, .32, .5, .5)` | `(2, .55, .9, .9)` | `1.15 : .9` | Deep radial valleys and projecting petals |

`FAMILY_PATTERNS` in `src/app/lib/memoryShape.ts` is the tuning source. Seeded
variation is ±6% in exponents, with 4/6/8 longitude ribs for shell/floral;
`n2=n3` and even `m` preserve closure. Proportion is an explicit scale after the
formula and before normalization, saved with the form. These are closed
silhouettes, not literal hollow bowls or spiral shells. All four families remain
star-shaped about their centre, compatible with the existing radial wall map.

The assessment returns inward/outward orientation independently of positivity.
Sharpness is `clamp(max(intensity, .7*discomfort + .3*disruption) - .15*comfort)`;
joyful intensity can therefore be sharp. The coefficients are artistic starting
values, not psychological measures. Bilinear quadrant weights select the family;
a small winning margin softens its exponents toward the circular `n=2` state,
and a tie uses a neutral sphere. The weights are not confidence probabilities.
Mixed feelings remain visible in the evidence; they do not add arbitrary spikes.

Each assignment records its model/rubric/mapping version, seed, source, transcript
revision fingerprint, scores, family and exact form. The fingerprint detects
stale handoffs, not malicious tampering. Memories remain session-only. Model
responses may vary; stored assignments and their seeded geometry do not reroll.

Verification: `node scripts/check-memory-shape.mjs`,
`node scripts/check-superformula.mjs`, `pnpm typecheck`, and `pnpm build`.
For keyboard-only lab runs use `/lab/meaning?camera=off` (or
`/lab/descent?camera=off`). Shape and distance accept arrow keys, Home and End.
The full synthetic browser journey was also checked through naming and gallery.
The new tests use synthetic transcripts and a mocked provider; assess real model
quality against human-labelled full memories separately.
