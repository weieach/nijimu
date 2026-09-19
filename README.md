# nijimu

This is a code bundle for nijimu. 

## Running the code

Run `npm i` to install the dependencies.

Run `npm run dev` to start the development server.

## Pages

- `/`: home canvas where memories sit as a watercolor puddle, blob field, or ripple field
- `/record/start`: speak a memory aloud — the main recording step of the create flow
- `/record/click`: early click-to-record screen over the blob field
- `/record/process`: early recording screen that transcribes speech as you go
- `/record/transcript`: shows the spoken words, optional AI polish, and word highlights
- `/record/name`: give the memory a title and year
- `/record/build`: camera-permission prompt before sculpting the 3D object
- `/record/shape`: all-in-one 3D editor for evolve, bump, fluidity, and color
- `/record/shape/grow`: grow and pick the 3D form with hand gestures
- `/record/shape/weight`: sculpt the object's weight and fluidity with pinch or sliders
- `/record/shape/color`: tint the object from the palette, by gesture or slider
- `/record/shape/texture`: set the object's surface texture
- `/record/saved`: confirmation that the memory was written to local storage
- `/record/orb`: leftover pinch-to-scale orb experiment (not linked from the UI)
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
| **GenRyuMin2 TW** | CDN Fonts | Main serif — wordmark, titles, most body copy (`SERIF`) |
| **Rowan** | Self-hosted woff2 (Light–Bold, roman + italic) | Serif fallback; also hardcoded on leftover `/record/orb` and `/record/process` |
| **Exposure Trial** | Self-hosted `ExposureTrial-20.otf` (optical grade −20) | Recording / profile display (`SERIF_EXPOSURE`) |
| **Exposure Trial Plus** | Self-hosted `ExposureTrial+10.otf` (optical grade +10) | Transcript / polish display (`SERIF_DISPLAY`) |
| **Switzer** | Self-hosted woff2 (Thin–Black, roman + italic) | UI sans — labels, light / outline buttons, editor chrome (`SANS`) |

Named but not loaded: **SF Pro** (`SANS_UI` — Apple system font on dark buttons, then `system-ui`).

System / leftover fallbacks: **Georgia** (serif fallback; also hardcoded in a few pages), **Helvetica Neue / Helvetica / Arial** (`RecordingProcessPage`), and **SF Mono / Monaco / monospace** (timer on `/record/click` and shape-editor numeric readouts).

```
SERIF          = 'GenRyuMin2 TW', Rowan, Georgia, serif
SERIF_DISPLAY  = 'Exposure Trial Plus', Rowan, Georgia, serif
SERIF_EXPOSURE = 'Exposure Trial', Rowan, Georgia, serif
SANS           = Switzer, sans-serif
SANS_UI        = 'SF Pro', system-ui, sans-serif
```

## Homescreen shortcuts

| Key | Action |
|---|---|
| **A** | Original homescreen (blobs) |
| **B** | Puddle homescreen |
| **Z** | Ripple2d homescreen |
| **G** | Open memory artifact gallery (on the puddle homescreen: the dive-through-the-water gallery) |
| **V** | Toggle gallery variant: dive ↔ morph (A/B; dive is the default and only runs on the puddle homescreen) |
| **← / →** | Browse gallery |
| **Esc** | Exit gallery |

