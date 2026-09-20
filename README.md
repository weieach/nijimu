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
| **GenRyuMin2 TW** | CDN Fonts | East Asian serif — the 滲む wordmark (`SERIF_CJK`); CJK fallback on `SERIF` |
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

