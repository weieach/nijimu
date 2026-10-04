# nijimu — Project Guide for AI Assistants

> This file orients an AI coding assistant (Cursor, Claude, etc.) to the nijimu
> codebase: what it is, how it's built, where things live, and the non-obvious
> rules. Read it before making changes.

## Where work stands (2026-10-03, branch `10.3-Echo`)

Continue on **`10.3-Echo`**. It was cut from `10.3-mesh-Gielis-superformula` at
`dd87f31` (the merge of 9.19-Nicole into the superformula work). Leave
`10.3-mesh-Gielis-superformula` and `main` alone. Chat history does not follow a
new Cursor account; this section is the handoff.

The live create flow is unchanged. The new shot is a lab at **`/lab/descent`**
(`src/app/lab/DescentPrototype.tsx`). Open it on the dev server. `?speed=0.3`
slows the whole shot. It is one canvas and one camera, using the pond's own
wave field (`POND_WAVES_GLSL` exported from `PerspectivePond.tsx`).

Intended sequence, built in the lab and not yet wired into the production route:

1. After recording, stay on the pond. An empty 35mm strip gathers itself out
   of the air in front of the view and hangs there (`CHOOSE_DEPTH`,
   `EMERGE_S`). Touching the strip opens the file picker (a local
   jpeg/png/webp/gif for this visit only); two bundled stills sit small at the
   bottom so the lab runs without one.
2. The photo develops into the strip's window, darks first (`uDevelop`,
   `DEVELOP_S`); a beat later (`LET_GO_S`) the strip is let go and falls —
   flutter, a soft landing, ripples — and floats. The earlier circle-thumbnail
   → strip morph is gone; `uMorph` is 1 from the start.
3. Hold to descend through the film into the water. The form surfaces.
4. Shape, distance, then color. While the form is handled, the water washes
   paler and less saturated so the object is what has the color.
5. On confirm, the film's emulsion lets go and the photo develops on the form
   as its photo map (the existing `MemoryPhotoLayer` look), darks first. The
   particle version of this step — the image falling as a point cloud — is
   kept in `wrapCloud.ts` behind `?cloud=1`, not in the shot (fourth pass,
   below).
6. The form rises, breaks the surface, and is named.

The film's surface (`filmFragment`) is now the film lab's strip, wired in on
2026-10-03: `STRIP_GLSL` + `FILM_LOOK_GLSL` + `SHEET_GLSL` from
`filmStrip.ts`/`filmLook.ts`, with the descent adding only what the shot needs
— the torn outline and worn edge, the develop (darks first, `uDevelop`), the
dissolve into grains (`uDissolve`), the sheen where the curl catches the sky,
and the backlit face from under the water (`uBelow`). The empty window is the
stock a shade lighter at .55 of its alpha; the photo develops into it through
`filmLook` and covers it at `uPhotoOpacity`. `filmUniforms` spreads
`filmLookUniforms()` and `sheetUniforms()` (the default stock, photo opacity
and edge fade), and `prepareFilmPhoto` is applied to the texture where
`request.texture` lands. `uMorph` is gone. Tune in `/lab/film`; what settles
there goes into `FILM_LOOK_DEFAULT`, `STOCKS`/`STOCK_DEFAULT` and
`SHEET_DEFAULT`, and the descent follows. Checked once on the water: the sheet
reads thin and pale there (distance, haze, 68% cover), which the user has not
yet judged. Portrait photos are cropped into the 36×24 frame; turning the
strip for a vertical photo was offered and not decided.

The photo's own film look is a second lab, **`/lab/film`**
(`src/app/lab/FilmPreview.tsx`): one flat strip facing the viewer, nothing
moving, drop or choose a photo, hold the strip to see it as uploaded, sliders
down the right. The look itself is `src/app/lib/filmLook.ts`: a GLSL function
`filmLook(sampler, uv)` plus its uniforms (`filmLookUniforms`, `setFilmLook`,
`prepareFilmPhoto` for the mipmaps it blurs with). The model follows
GrainLab's pipeline (MIT) rewritten for the GPU: tone (flatten, shoulder,
tinted lift) → saturation → midtone lean and shadow/highlight crossover →
bloom and halation from the photo's mipmaps → mottle → frame-relative grain →
vignette → a seed-placed leak. Defaults were first set against three
expired-stock scans the user gave, then against Yoshiyuki Okuyama's wider
work (lifted blue-grey blacks, warm cream highlights, saturation kept, broad
warm leaks from one side); the user has accepted the colour.
`FILM_LOOK_DEFAULT` is the place to write back what the sliders settle on
("copy values" puts them on the clipboard). The strip's own mm constants and
edge print moved to `src/app/lab/filmStrip.ts`, shared by both labs; the edge
print is thin (weight 300, hairline ticks) by request. The stock's colours are
a palette there too (`STOCKS`: grey-pink, grey, and grey-green, which the user
set in the preview and is the default, `STOCK_DEFAULT`; `setStock`), chosen
by swatches at the top of the preview's panel. "+" copies the chosen stock
into the user's own, with colour pickers for its four tints (cool end, base,
warm end, stain) and "remove"; "copy values" writes the palette out as a
`STOCKS` entry so a liked one can be added to the list. Own stocks live in
page state only. The sheet itself is `SHEET_GLSL` in `filmStrip.ts`, shared
by both labs: `sheetStock` (the stock's drift, stains and uneven thickness —
alpha .6–.88, lighter and more transparent where thin, a wash of light across
it), `sheetWindow` (the photo's frame fading into the stock over `uEdgeFade`
mm, unevenly, with a little bleed past the edge), `sheetDyeAlpha` (dark holds,
light lets what is behind through) and `sheetEdge` (the cut edge and the
perforations catch a hair of light, a faint shade inside). `sheetUniforms()`
carries the stock and `SHEET_DEFAULT` (`photoOpacity` .68 — the photo is a
layer of dye over the stock, not full cover, so the stock shows through the
picture and it changes with the strip; `edgeFade` 2.5 mm); both have sliders
in the preview. The preview alone adds a soft cast shadow mesh behind the
strip (`shadowFragment`).

A third lab, **`/lab/vessel`** (`src/app/lab/VesselPreview.tsx`), is a still
life of a different end state: the memory as one thin, almost clear glass
vessel (the superformula form, `?form=` seed, `?category=`, `?morph=`), with
the 35mm strip from `/lab/film` pressed loosely along its inner wall carrying
the photo — the photo is a thing inside the glass, not a map on its surface.
Nothing moves but a slow turn (`?turn=`, hold to stop, drag to turn; `?yaw=`
opens it turned, 180 is the far face); drop or choose a photo (`?photo=0|1`
or an image URL); sliders down the right in groups glass / refraction / sheet
/ dye / light / scene; "copy values" writes `VESSEL_TUNE_DEFAULT`, which is
where tuned values go back. Two glass looks switch at the top of the panel
(`?glass=frost|refract`, refract is the default): *frost* is the descent's
`formFragment` idea (toned shell, Fresnel rim, two or three frost patches, a
seed bubble); *refraction* has no tone of its own — the scene (backdrop
quad, ground, sheet) is drawn to a render target, blitted, and the glass's
facing and far walls (`glassRefractFragment`, on `FRONT_LAYER`) sample it
displaced along the view-space normal (`bend`), smeared by thickness
(`glassSoft`), darkened where thick (`thickDark`, the feet), with the live
`BubbleViewer` vocabulary for the edge — a dark rim line `pow(g, 3.3)`, a
thin film ring `pow(g, 20)` lit by the key, grazing reflection of a two-stop
room (`envAbove`/`envBelow`, `horizon`, `horizonSoft`). Back/front is decided
by `dot(n, v)`, not `gl_FrontFacing` — three flips the winding for a
`BackSide` material, and the far wall drawn as "facing" was what made the body
milky. `?show=glass|sheet` draws one layer alone. For the sheet the strip's
face was factored out of the descent's `filmFragment` into `STRIP_FACE_GLSL`
(`stripTornOutline`, `stripCoverage`, `stripFace`) in `filmStrip.ts`, and
`filmLook` took a third `bias` argument (mip bias, for the blurred far face);
the descent calls the same functions and renders as before. Not yet judged by
the user: the refraction look at all (it has only been seen in captures:
reads as thin clear glass, the strip legible through it, edges and feet
smeared; whether it wants more body is the `bodyAlpha`/`thickDark`/`bend`
question), the key highlight line, how the sheet sits for a portrait photo
(cropped into the 36×24 frame as in the film lab), and the frost look since
the back-wall fix. The second step the user named — the sheet wrap inside the
descent behind `?wrap=sheet` — was not started.

Small changes the same day: the seed bubble in the glass (a ring the user
read as a stray dot) is removed entirely — shader, knob, uniforms. The lab's
title and its line of instructions are gone; only the "lab — vessel" caption
stays. The refraction look's room takes colour: two colour pickers at the
head of the refraction group, above the horizon and below (`Room`,
`ROOM_DEFAULT` white/white, page state, reset with "reset", noted in "copy
values"); the lightness knobs multiply the colour (a pick sets its lightness
to 1 so what is picked is what is seen), and the horizon and its softness
remain the gradient. The glass's grazing reflection (`env()`) and the
backdrop quad read the same colours, so the glass reflects the room it sits
in. The caption's ink now follows the actual top colour's luma.

The turn is the eye's, since 2026-10-04: the camera orbits the form
(`yaw` from the slow turn and the horizontal drag, `pitch` and `distance`
from the "camera" knob group, the vertical drag writing `pitch`; `?pitch=`,
−35…85°, 4° is the still life) while the form, the key light and the room
stay in the world, so walking round it the lit side comes and goes and the
horizon's reflection slides over the glass — the lighting change the user
asked for comes from that, not from a moving light. The backdrop's horizon
follows the pitch (`backdropFor`). Under the table there is no table: the
ground tone and the mirrored reflection fade as the eye goes below it
(`tableFade`; `uReflect` −1 now marks the thing itself, 0 a reflection faded
out). The perforations are knobs too (the "sheet" group): `holeSize` (0
removes them), `holeWidth`, `holeFade` (1 leaves a faint mark where the cut
would be, not a hole) and the existing rim — in `filmStrip.ts` as
`uHoleShrink`/`uHoleFade`, 0 unless set so the descent and the film lab draw
true 35mm unchanged. The photo can be drained and inverted the same way:
`mono` and `negative` (0–1) at the foot of the "dye" group, applied in
`stripFace` after `filmLook` as `uMono`/`uNegative` (0 unless set), the
dye's density following what is left so a negative's clear sky holds dark.

The form can be changed in the panel too, to try the vessel on softer
bodies without a new mechanism: a "form" group at the top with the twelve
superformula categories as radios (choosing one draws a fresh deviation
inside it through `createArtifactForm`, as the shape step's debug picker
does; "another form" draws again in the same category; `?form=`/`?category=`
still set the opening form), the form described under them
(`describeForm`), and `morph` as a knob (0–1, the shape step's
morphProgress — how far the body has grown from its sphere; was the fixed
`?morph=`, default .6). The glass, its wall map and the sheet rebuild from
it. "copy values" writes the form's description above the values. The
softest bodies the mechanism makes are sphere (the BLOB variant, m 4, n
1.6–2.6) and rounded box (m 4, n 3–8); the user's question was whether the
sheet reads better in one of those than in the star-like default.

The vessel's sheet has two builds since 2026-10-04, switched by a
"pressed to the wall / draped" radio at the top of the sheet group
(`?sheet=pressed`; draped became the default once the user had tuned it —
the pressed build is unchanged). `VESSEL_TUNE_DEFAULT` and `ROOM_DEFAULT`
(#b3b3b3 above / #ffffff below) hold the user's settling of the refraction
look with the draped sheet: glass rim .38, thickness .3, frost size 1.25;
refraction bend .75, smear .64, thick-dark .21, highlight .34, lightness 1 /
.84; feel sheer .92, furred edge .2, sheen .31, gloss .43; dye lift .06,
soft .45, leak .72, photo opacity .83. The user's ask: the
fold should not run along the inner wall but hang like soft fabric, bending
when it wants to and leaving natural air between its face and the wall.
`buildDrapedSheet` is its own cloth — a 72×24 grid in true strip mm
(`STRIP_MM` × `sheetSize`) hung from one place on the wall (`anchorAngle`,
`anchorHeight`, `tilt`), pressed to the wall for `contact` mm, then peeling
toward the inside over `sag` mm by `peel` degrees, curling across (`curl`)
and twisting (`twist`), then settled as soft cloth against a radius map of
the inset glass (`buildWallMap`, θ/φ bins, blurred twice — the superformula
is star-shaped about its centre). The first settle snapped every vertex to
the wall and the user saw brittle plastic (jagged folds); it is now: 96×48
grid (≈1 mm a cell), 24 passes of loose distance constraints, the wall met
with a radial correction that is blurred across the sheet before it is
applied (a lobe bows the cloth over a width rather than printing a kink),
and a Taubin smooth each pass (Laplacian step, slightly larger step back, so
nothing shrinks) as the bending stiffness of gauze or soaked paper; `soft`
0…1 scales the smoothing, 0 is the crisp version; a last hard clamp keeps
everything inside the glass. The model is the user's own earlier draped-cloth
piece (a catenary plane computed once on the CPU, fine subdivision, smooth
normals, softness from the material): no solver, nothing moves. The feel is
a knob group of its own ("feel", draped only; the uniforms sit neutral when
pressed so the film look is untouched): `sheer` (alpha), `softRim` (a
Fresnel edge that lightens and thins so the outline furs), `sheen` (a broad
grazing light from the key), `gloss` (the film's hard highlight, 1 is film),
`grain` (screen-space, fine). The cloth carries its mm as an attribute
(`aMm`, `uMmAttr` 1), so `sheetFragment` draws the same strip; the pressed
sheet still derives mm from `vRest`. The user preferred the near face of the
sheet (sharp, lit, mip bias 0) to the far face (bias 1.6, dimmed by
`backFace`, cooler) and asked to be able to put that face against the glass:
"picture faces — the inside / the glass" under the sheet radios
(`?face=glass`, `SheetFace`, `uFlip`): the fragment's `facing` is
`gl_FrontFacing` xor the flip and `mm.x` is mirrored with it, so the strip is
truly turned over — the emulsion side reads the right way round from the
glass side and mirrored from inside. Works for both sheet builds. The knob
group "drape" shows only when
draped; `arc`/`band`/`lift`/`fold scale` only when pressed; "copy values"
notes which. Seen: at size 1.2 the strip hangs as one bowed sheet; at 1.5
(bigger than the cavity) it bows into the bowl in broad rounded folds. Not
yet judged by the user: the soft defaults (soft .7, sheer .8, softRim .35,
sheen .35, gloss .15, grain .04) and the light on its underside. The shape
defaults are the user's own settling (size 2.26, hung from 180° at height
1.0, tilt 2, contact 30.5 mm, sag 21 mm, peel 69°, curl .35, twist 15, gap
.03, soft .7) — a sheet much longer than the strip, pressed along most of
its length and peeling only at the end.

A fourth lab, **`/lab/gallery`** (`src/app/lab/VesselGalleryPreview.tsx`,
2026-10-04), is the live dive gallery with its crystals replaced by ten of
these vessels — the user's ask: ten different forms, each with one of ten
photos, the photo sized to its form, draped + refraction as the default,
negative off, the perforations reduced, and the gallery's text, layout and
interaction left exactly as they are. It is done by substitution, not a
copy: `GalleryOverrideContext` (`src/app/lib/galleryOverride.ts`) carries
`{ items, renderArtifact(item, seat) }`; `MemoryCarouselPage`, `PuddleScene`
and `PuddleDiveGallery` read it and, when it is `null` (every live route),
behave as before — `buildArchive()` for the items and `SceneViewer` in the
seat. The preview provides it and renders `MemoryCarouselPage` itself, so
the S-curve (`carouselSeat`), caption, timescale, arrows, wheel/keys,
overscroll to the pond and the exit are the gallery's own. The route is a
child of `RootLayout` so `GlobalControls` is there, and it can be reached
from the landing's top-left dock (`LabDock`, a "gallery" entry under
vessel) and from the live gallery, where a small "vessels" link sits beside
the back arrow in `PuddleDiveGallery` (a router `Link`, drawn only when no
override is present, so the preview itself does not show it) — the two
visible changes to live screens from this work. Its ten items are
`LIFE_EVENTS` 0, 2, 3, 5, 7, 8, 9, 11, 13, 15 with a fresh form in each of
sphere, rounded box, cylinder, prism, diamond, flower, star, gear, hybrid,
torn (`createArtifactForm({ seed: "vessel|<id>", category })`, `evolve`
.6; the star and the gear take a named `draw` — `vessel|star|5`,
`vessel|gear|2` — because those categories mostly come out as flat discs
with no side for a picture), and `look.photoUrl` from
`src/assets/vessel-gallery/01–10.jpg`
(`import.meta.glob`, sorted by name — drop differently named files there to
change the set; 1600 px long side, from the user's "nijimu photo test"
folder, 01–08 landscape, 09–10 portrait cropped into the frame). The tune is
`VESSEL_GALLERY_TUNE` = `VESSEL_TUNE_DEFAULT` with holeSize .6, holeWidth
.75, holeFade .75, holeRim .25, mono 0, negative 0, pitch 4, turn 0 and no
ground (no table, no reflection over the water); the sheet's `face` is
"glass"; the room is `VESSEL_GALLERY_ROOM` (#e6e7ea above / white below) —
the lab's grey wall, reflected by the glass and shown through it wherever
the frame behind is clear, read as a dark grey cast on every vessel over the
pale water (the user asked why everything was dark grey; the photos do go
through `filmLook`, and several of the ten are dark to begin with). The
override also asks for `wash: false` (no colour wash behind the apex) and
gives an `adjustSeat` that, from the first newer neighbour on, scales the
near seats down by up to 28% and moves them out toward the lower right
(`.09w`, `.1h`) so the outer foreground seat no longer covers the first and
second neighbours; both are read by `PuddleDiveGallery` only when an
override is present.

Pressing the vessel at the apex (a press and release without a drag,
`onPick`) opens the lab as an editor for that one memory: the preview
renders `VesselPreview` in place of the gallery with `initial` = the
memory's `VesselState` (tune incl. its fitted `sheetSize`, mode, sheetMode,
face, room, url, seed, form), `photos` = the ten gallery stills,
`yaw` = −anchorAngle, and "← back to the gallery" (`onBack`); `onChange`
hands the whole state back after each change, kept per memory in the
preview's page state with a version that keys the seat's geometry
(`VesselArtifact` `cacheKey` "id|version"; a new key for the same id
disposes the old build), and the memory's `sheetSize` prop then comes from
its tune rather than the fit. Returning renders `MemoryCarouselPage` with
`galleryFocusId` = that memory and `galleryCarried`, so the gallery opens
on it without diving. `VesselPreview` took those optional props for this
(`VesselPreviewProps`; without them the `/lab/vessel` page is unchanged),
and `Stage` a `yaw0`. One resolution fix: the seat canvases are measured
`offsetSize` (as `SceneViewer`'s `measureUnscaled` does) — the seats are
scaled by CSS transforms the resize observer never sees, so a canvas
mounted far down the curve was rendered at that tiny size and stretched at
the apex (the "2003 is blurry" report).

Each seat is a `VesselArtifact` (`src/app/lab/VesselArtifact.tsx`): its own
`<Canvas alpha>` with the lab's two-pass refraction, built once per
`cacheKey` and kept in a module map so a seat that leaves and comes back
does not rebuild its cloth. The sheet is sized to the cavity by
`fitSheetSize(glass)` so the picture covers the side it hangs on — the
user's ask, after a first cut at .86 of the height capped by the waist left
most pictures at half the form: the strip's width (its height, hung
upright) is the glass's full height, so the frame spans about .69 of the
side with the stock's bands above and below; only a form much taller than
it is round holds the strip back to ~.58 of the body's circumference
(1.15·π·bodyRadius, bodyRadius the mean radius of the waist) so the cloth
wraps the near half of the wall and not the back. The eye is set back so
the body fills the seat — by its height and 1.45× its mean radius, not its
farthest point, so a flat or spiky form is not shrunk by one spike. It
opens on the sheet's side of the wall (`yaw` = −`anchorAngle`), so with the
face on the glass the picture faces the viewer squarely and right-reading;
at the apex a drag on the canvas turns it round (.01 rad/px) and up or down
(`pitch`, .25°/px, `PITCH_MIN`…`PITCH_MAX`), pointer-captured, cursor grab —
the gallery already treats a press-and-release off an artifact as handling,
not leaving. `turn` is 0 in the gallery tune since a slow turn would carry
the picture away from the viewer. The `frameloop` is the one the gallery
gives the seat (`always` while focused or moving, `demand` when still). To share the
shaders the lab's uniform plumbing is exported from `VesselPreview.tsx`
(`createSheetUniformSet`/`writeSheetUniforms`, `createGlassUniformSet`/
`writeGlassUniforms`, `fitSheetSize`, the builders and fragments, `lookFor`,
`photoLoader`), and the lab's `Stage` now calls the same writers. One shader
change for the transparent canvas: the refraction's `behind()` samples
`vec4` and the body is `mix(env(0.0), frame.rgb/frame.a, frame.a)`, so where
the render target is clear the glass shows the room, not black — the lab is
unchanged since its backdrop has alpha 1. Not yet judged by the user: the
glass body over the gallery's pale ground (`bodyAlpha` .85), how the
full-height sheet folds in the lobed forms (flower, torn: it is wider than
their waist and bows into the bowl), the star and gear draws, and the first
frame after a resize, which can be dark until the render target has been
drawn once.

**Distance in the vessel (2026-10-04, evening).** The live distance step
("time blurs the edges, not the feeling") is a CSS `backdrop-filter` blur
over the whole canvas (`FrostOverlay`, `vividness` 1→0) and, in the descent,
a `uFrost` milk mix; the vessel had nothing. It now has a "distance" knob
group at the top of the panel (`?haze=` opens there): `haze` is the signal
the step would drive, 0 clear (the default everywhere, so nothing else
changed), and the rest say what a full haze does — `hazeBlur` (the finished
frame blurred, px; a post pass in the lab's `Stage` only: the frame goes to a
second target and reaches the screen through a separable 13-tap Gaussian,
`blurFragment`, `frame` → `pong` → screen), `hazePhoto` (mip levels added to
`filmLook`'s bias on both faces; `lookFor` also pushes the dye's `soft` to 1
with it and, with the wash, lowers contrast and saturation and lifts the
blacks), `hazeMist` / `hazeSpread` (the mist: three copies of the glass stood
off it along its normals, `mistVertex`/`mistFragment`, `MIST_SHELLS`, the
`Mist` component — a veil the air's colour, flat through each shell's middle
and thinning to nothing at its own edge, uneven as breath, drawn FrontSide
over the glass on its layer, so the silhouette is a gradient reaching past
the glass rather than a line), `hazeWash` (glass and sheet mix toward
`uAir`, the backdrop behind the form's upper half — `airOf`/`airFor` — and
thin), `hazeEdge` (the refraction's dark rim line, mirror and film ring, the
frost look's spec, the sheet's gloss and perforation rim go; the glass's
alpha stops gathering at the silhouette; the strip's cut feathers out over
up to 5× its wear; the perforations become a mark; the furred edge comes to
both sheets). The shaders take each part already multiplied by the haze
(`uHazePhoto`, `uHazeEdge`, `uHazeWash`, `uHazeMist`, `uHazeSpread`, `uAir`
in both uniform sets); `SheetWrite`/`GlassWrite` took an `air`. The gallery
seat (`VesselArtifact`) draws the same materials and the mist, so a memory
hazed in its editor comes back hazed; only the post blur is the lab's own.
Seen: at .5 the picture is soft and the outline fogged with the vessel still
itself; at 1 a pale grey form in the air; the shells alone, with no post
blur, already make the outline a gradient. Not yet judged by the user: the
defaults (blur 7, photo 2.6, mist .5, reach .16, wash .5, edge .85), whether
the mist should be denser toward the surface or more even, and whether a
hazed memory in the gallery wants the post blur too (a premultiplied blur on
the seat's transparent canvas; not built).

The lab is one shot, not the live route. Do not wire it in until asked.

Done inside the lab since the first cut:

- The three underwater steps take the same MediaPipe gestures as
 `ShapeGrowPage` through `useHandTracking` (two palms apart → shape, one
 palm opening → frost, fingertip over the field → color, pinch to hold), with
 the same ranges. The full-screen drag and the field's own pointer handling
 stay as the fallback when the camera is refused or no hand is seen; the hint
 under the copy says "drag across…" then, and "or drag across…" when the
 camera is live. A small greyed camera window sits bottom-right while a step
 is on. `GestureHint` shows under the copy when tracking.
- Naming saves. "save memory" calls `saveMemory` with the run's
 `ArtifactForm`, `evolve` = the shape step's morph (as `ShapeGrowPage`
 saves it), a material preset and `colorIndex` derived from the OKLCH hue
 the way `NamingRim` does, and a new optional `look` field
 (`MemoryLook` in `memoryStore.ts`: `photoUrl`, `oklch`, `vividness`).
 `ArchiveArtifact` carries `look` through `buildArchive`. The gallery and
 the viewers do not read `look` yet, so the archived blob still shows the
 palette tint and no photo; that render unification is the next foundation
 step. "see it among the others" then navigates to `/memory` with
 `{ galleryOpen, galleryFocusId, galleryCarried }`, the rim's own handoff.
 A device photo's `photoUrl` is an object URL and dies with the visit.
- The touch. During the three steps the frame is drawn through a post pass
 (`touchFragment`; a second `useFrame(…, 1)` in `Stage` renders the scene to
 a `WebGLRenderTarget`, then to the screen). Around each hand a soft lens
 bends what is behind it, a moving hand leaves a wake, the light splits by a
 hair. Hand positions come from `handCenter` of the MediaPipe landmarks
 (mirrored); while the camera sees no hand the pointer stands in
 (`StageState.hands`, `handsFrom`). Tuning lives in the shader constants
 (`.18` lens, `.1` split) and in the wake smoothing in the frame loop.
- The wrap: grains are about twice as large (`gl_PointSize` 8.5–16 px), a
 little softer and lighter each; the form grows 1.3× (`WRAP_GROW`, ≈2.2×
 volume) over `WRAP_MOVE_S` and keeps that size through the rise. The camera
 did not move. Details below.

### The wrap, in detail (the film → particles → photo map)

What the user asked for: on confirm the floating film overhead dissolves into
particles that sink and attach to the form's surface, arriving as the existing
`MemoryPhotoLayer` look. The sinking must be staggered and natural — grains
of different weight and size, weight slightly changing speed, uneven spacing,
never a dense sheet filling the water; light and flowing. Later: the grains
were too small (fixed, above), and the form should be 1–2× larger in volume
with the camera unchanged (fixed, `WRAP_GROW`).

Built (`buildParticles`, `particleVertex`/`particleFragment`, the wrap block
of `Stage`'s frame loop):

- Timing. Confirm on the color step sets `stage.wrap`; `wrapAt` is taken, the
 camera lerps to `WRAP_CAMERA`/`WRAP_LOOK` over `WRAP_MOVE_S` 2.2 s with the
 film overhead and the form in frame, the form turns to face front and grows.
 The particle clock starts half-way through that move. Grains release over
 `RELEASE_S` 2.2 s (top edge of the image first, a few early, then the
 rest); everything has sunk, been caught and faded by `WRAP_FALL_S` 7.2 s.
 Then the film is hidden, `onWrapped` fires and the rise begins. The view
 sinks 0.45 with the grains during the fall and that sink is carried into
 the start of the rise so there is no step.
- Grains. `PARTICLE_COUNT` 5200 is a ceiling; each grain is a vertex on the
 form's camera-facing hemisphere (`rest.sphere z > .05`, inside the photo
 disc), its photo pixel via `buildPhotoUv`, and the pixel's place on the
 film window (75% × 66% of the strip). A grid of occupied cells enforces a
 minimum spacing; vertices are visited in random order; darker image parts
 keep more grains (`.3 + .7(1-luma)²`), so the image stays faintly legible
 mid-fall. Colour is luma-based cool white (`f = .5 + .45·luma`), not the
 photo's hue. Weight `pow(rand, 2.2)` — skewed light.
- Motion (GPU). Terminal velocity `SINK_SPEED` 0.72–2.1 by weight (3×
 range); a slow buoyant bob the light grains feel most; a current carrying
 the column 60% toward the form's side; curl-noise drift, stronger for light
 grains. Nothing pulls a grain until it has sunk to within 1.3 of its end
 height, then it is caught and held (`catchK`), with `uForm` = the form's
 matrixWorld so the grains follow the growing, turning form.
- Hand-off to the map. Once held, a grain fades (light first, linger
 0.45–1.5 s) while `setMemoryPhotoFade` brings the overlay up over clock
 2.4–6.0 s; the overlay is `createMemoryPhotoMaterial` with
 `saturate .6, contrast 1.06, opacity .62` on a 1.012× copy of the form
 geometry. The film's emulsion goes with its grains (`uDissolve` over
 `RELEASE_S + 1.2`).
- Size is in world units: `gl_PointSize = uViewScale·size·(1 + byWeight·weight
 + .3·seed)/dist`, with `uViewScale` = viewport height in device px over
 2·tan(fov/2), so a grain is the same size in the water whatever the screen.
- The 700 ambient motes (`motesVertex`) are separate — dust in the water,
 not the photo; they fade with the wash.

Second pass (2026-10-03, later): everything about the wrap that is a matter
of judgement is a knob — `WrapTune` / `WRAP_TUNE_DEFAULT` at the top of the
file, a panel of sliders down the lab's right side (`WrapTunePanel`, "hide
knobs" folds it, "copy values" puts the object on the clipboard). `Stage`
reads the knobs every frame, so framing, grain size, colour, speeds and the
hand-off move while grains are already falling; count and release spread are
baked when the grains are built and take effect on "again". The knobs live
in `DescentPrototype`, so "again" keeps them. **`?from=wrap`** opens the lab on
the wrap itself (photo on the film, descent done, form surfaced and washed;
`?photo=0|1`, `?morph=`, `?frost=`), with "again" replaying from there —
`Stage`'s first frame sets the marks (`descentAt`, `fall`, `landedAt`, …) as
long past. Defaults in `WRAP_TUNE_DEFAULT` are the second pass's judgement:
camera (0,-3,7) looking at (0,-1.1,.2) so the film sits in the top band and
the form in the lower third; grains: the user's own settling, 3000 of size
.013, drift 2.14, caught from 1.0 (the rest of that group unchanged); darks
.58 / lights 1.0 so grains read as light, not sediment; the print rises at clock 3.6–7.0 and
the wrap ends at 8.0; `filmBelow` .6 — the film seen from under the water
used to keep only 42% of its image (`filmFragment`, back face) and was
invisible once the emulsion dissolved. Grains now carry the photo's pixel
(`aColor`) and luma (`aLuma`); `colorMix` 0→1 moves from cool white to the
photo's own hue at `colorSat`. `bindToOverlay` 1 keeps a caught grain until
the print has risen under it instead of fading after `linger`.

**Third pass (2026-10-03, night) — the point cloud.** The user showed four
TouchDesigner demos of theirs (dense sheets of tiny points folding like
smoke, bright where the sheet doubles over; one of them dark smoke on pale
grey) and asked for the particles to be refounded on that. What changed,
and supersedes the grain model described above (`buildParticles`,
`cloudVertex`/`cloudFragment`, the wrap block):

- The image is a sheet, not grains. `cloudCount` (default 90 000, ceiling
 `CLOUD_MAX` 200 000, on "again") points on a lightly jittered grid over the
 film window; each takes its pixel and — inverting `buildPhotoUv`'s planar
 projection — its place on the form's lit side, blended from the nearest
 form vertices binned by photo-uv. Points whose uv falls outside the photo
 disc (the image's corners) have no place (`aLands` 0) and thin away.
- The sheet stays whole. Release sweeps down the sheet (`aDelay` from the
 row, a slight lean); the landing sweeps the sheet too (`landAt`,
 `landOver`, each point gliding over `landEase`). `grain` 0→1 adds per-point
 lag to both, from a coherent sheet to loose points. No weights.
- Motion is a field. Curl of three value-noise potentials with analytic
 gradients (divergence-free, so the sheet folds without bunching), two
 octaves (`fieldScale`, `fieldAmp`, `fieldDetail`), drifting slowly with
 time (`evolve`), plus a sink and a pull toward the form's column
 (`current`). Each point's path is the field integrated from its own release
 in ten fixed half-second steps in the vertex shader — a pure function of the
 cloud clock, so the timeline can still scrub it. The swirl eases with a
 point's own age: full until `calmAfter` (1.4 s), down to a quarter over
 `calmOver` (1.8 s) — the user liked the first movement (around 3 s on the
 shot clock) and found what followed too wide, spreading to the sides; after
 the ease the way on is mostly the sink (.7) and the pull toward the form's
 column (`current` .6), with `fieldAmp` down to .7. The timeline shows this
 on a "swirl" track, from the first release.
- Points carry the photo's tones by default (`blend` 2, normal blending): a
 black pixel is a point of value `grainDark` .2, a white one `grainBright`
 .9, grey or the photo's own colour by `colorMix`. The first cut was ink
 (`blend` 1: `CustomBlending` dst·(1−src), slate `uInkColor`) and read as
 black on the water — the user asked for the photo's tones instead. `blend`
 0 is additive light, the TouchDesigner-on-black reading. The material's
 `blending` is switched per frame. Size is in pixels (`pointPx` 1.5, mild
 distance attenuation), a square below ~2 px and a soft disc above.
- Nothing attaches. The user asked that points not settle as a solid skin
 on the form (the first cut formed a visible ball) but melt like snow before
 the ground: on its glide a point shrinks (to 20%) and fades, gone by `melt`
 .8 of the way. `linger`/`bindToOverlay` are gone with that.
- The print develops rather than fading in flat. `developOnForm` patches the
 shared `MemoryPhotoLayer` material (`onBeforeCompile`, at its alpha line):
 reveal is a threshold on `luma·developDarks + (1−uv.y)·developSweep` that
 `uDevelop` (0…1 over `overlayIn`…`overlayOut`, cloud clock) moves past,
 each part coming up over `developSoft` — darks first, the top of the image
 (where the sheet lands first) leading, as on paper in the tray. The user
 asked for exactly this feel from the image's first appearance on the form.
- Timeline tracks are now camera, film, cloud ("the sheet flows", its end
 dragging `landAt`), swirl, lands (`landAt` … `+landOver+landEase`), print,
 rise.
- The form sits under the film. The film rests at z 2 and the form used to
 glide to z −0.2 for the wrap, so the sheet fell 2.2 units in front of it
 and read as landing on its near side; the user asked for straight down.
 `formZ` (default 2.0, = `FILM_AT.z`) is a knob; the camera default moved
 back to z 8.6 looking at z 2.0. `orbitYaw`/`orbitPitch` (degrees) turn the
 view about its look point once the wrap has begun — to watch the fall from
 another side without changing the shot. The rise has its own turn
 (`riseYaw` −18, `risePitch` −49: from below, looking up at the form
 against the light — the user's pick), taken up over the first 22% of the
 rise, held until `riseViewUntil` .45 and let go by `riseViewBack` .85 as
 the form comes up to the pond view; the camera track shows both spans.
- The hourglass (`mode` 1; 0 is the sheet in the field, the default). The
 user's image: the film becomes sand. The sheet funnels to a neck
 (`neckDrop` .9 below the film, `neckRadius` .12) over `gatherS` 1.6 s,
 then pours over `pourS` 3 s — down from the neck, lateral spread
 `pow(s, spread)` (2.0: narrow long, opening late) toward each point's place
 on the form's **upper** surface (`aTop`: the sheet laid over the top
 hemisphere, image top at the far side, nearest-vertex blend binned by x/z),
 with a `twist` that unwinds as it lands. The melt applies on the last 40%
 of the pour. The field, landing sweep and swirl knobs do nothing in this
 mode; the timeline shows gather/pour tracks instead of cloud/swirl/lands.

Seen once, at 4.2 s: the sheet reads as a folded grey veil over the water,
lighter and darker with the image, convincingly like the references; the
form below still plain (development begins at 3.2 on the cloud clock). The
melt and the development were not seen — the Cursor browser tab stops
painting within seconds of opening now. Judge: whether 90k points at
`pointAlpha` .12 is the right weight; whether the long straight glide from
the sheet's height to the form reads as melting or as flying in (if the
latter, raise `landAt` so the field has sunk the sheet nearer first, or
lower `melt`); whether the development's darks-first/top-first mix is
right. The field's magnitude (`uAmp * .35` inside `field`) and the
integration (`STEPS` 10 × `STEP` .5) are the two constants not on the
panel.

The timeline (`Timeline`, along the bottom once the wrap has begun): the
shot runs from confirm, left to right, with the camera, film, cloud,
lands, print and rise as tracks and each phase an outlined block whose span
is computed from the knobs (`phaseBlocks`) — so the blocks move as the
sliders do, and the other way: dragging a block's edge writes the knob
behind it (`setFrom`/`setTo`, clamped to the slider's range), dragging a
block with both edges editable shifts both (the print), and a fixed edge
(the camera's 2.2 s, the rise's 6 s) has no handle. Pressing a block seeks
to its start and underlines its knob group in the panel; pressing the empty
track seeks there; while paused a dragged edge carries the playhead with it.
Above the tracks: ‹‹ ‹ play/pause › ›› step by a second and a tenth, the
clock, the phases under the playhead, speed, and "fold". Seeking works
because the wrap and the rise are functions of `t − wrapAt`: `Transport`
(`paused`, `speed`, `seek`) is a ref the frame loop reads first; a seek sets
`time.current` and re-latches `wrapped`/`riseAt`/`risen`/`broke`, the film's
visibility and the page phase (`onRewound`).

Seen in a browser this time (Cursor's own browser: it stops painting when its
webview is hidden while `document.hidden` stays false, and its screenshot
tool then returns a stale frame — reopen the tab beside the chat and check a
clock; the CDP `Page.captureScreenshot` is current). Before the pass the film
hung at the very top edge and left the frame as the view sank, the grains were
1–3 px, and the print was already on the form while most grains were in the
air. Not yet judged by the user: the new defaults, colour on vs off, bind on
vs off.

**Fourth pass (2026-10-04) — the cloud set aside.** The user decided the
core experience does not have particles for now; the work is to be kept on
this branch, switchable, but not the default. So: everything about the point
cloud (both motions, the hourglass, melt, the knobs, the timeline tracks, the
shaders, `readPhoto`, the geometry build) moved whole into
**`src/app/lab/wrapCloud.ts`** — `CloudTune`/`CLOUD_TUNE_DEFAULT`,
`CLOUD_KNOBS`, `CLOUD_TRACKS`/`cloudPhaseBlocks`, `createCloudUniforms`,
`createCloudMaterial`, `setCloudUniforms`, `buildCloudGeometry`. The lab's
`WrapTune extends CloudTune`, so the defaults, "copy values" and "reset"
still carry the cloud's values, but the lab only builds the geometry,
drives the uniforms, draws the `<points>`, shows the cloud's knob groups and
timeline tracks when **`?cloud=1`** is on the URL (`CLOUD` in
`DescentPrototype.tsx`; a "with / without the point cloud" button at the foot
of the knobs panel reloads with it toggled). Nothing in the live create flow
imports `wrapCloud.ts`.

The core wrap, without the cloud, is now: the view draws back and the form
grows (`WRAP_MOVE_S`), the film's emulsion lets go from the top down over
`releaseS` (`uDissolve`) leaving a clear base, the print develops on the form
over `overlayIn`…`overlayOut` (darks first, the top of the image leading —
`developOnForm`/`setDevelop`, the knob group "print"), the wrap ends at
`fallS`, and the form rises with its own view (`riseYaw`/`risePitch`). The
panel shows framing / timing / print only. Checked in a browser in both modes
after the move; the shot ran through to naming without errors.

Not built / not judged:

- Whether the gap the cloud leaves — the image lifting off the film and
 nothing crossing the water to the form — wants something quieter in its
 place (a wash, the print's own light), or is right as a cut.
- Grains come only from the lit hemisphere; the back of the form gets its
 map from the overlay alone.
- No interaction between the grains and the hands (the touch pass bends them
 like everything else, but they do not part around a hand).
- No reduced-motion path for the wrap.

Gaps still inside the lab, in the order they matter:

- The lab starts at the empty strip. Recording and the transcript/highlight
  step stay on the live pond. The agreed order, when this is wired, is
  record → transcript highlight → photo → film.
- No reduced-motion path. The timeline steps and scrubs the wrap and the
 rise only; nothing before the confirm can be stepped back through
 (`?from=wrap` jumps to the wrap, but only from a fresh load).
- Left unjudged: the form reads thin under frost on the color step, the wrap
  framing, and the sky after the rise, which is very bright.

Color picking (`src/app/lib/oklch.ts`, `FIELD`) was pulled toward the landing
palette: lower chroma, less candy green and yellow, darker toward slate. This
changes the live color step as well as the lab. The photo tray
(`PhotoLibraryTray`) can add a device photo; the data URL lives in module
memory for this visit and is gone on reload.

GenRyuMin2 TW Regular is self-hosted
(`src/assets/fonts/GenRyuMin2TW-Regular.woff2`, SIL OFL). The CDN import is gone.

Discussed and not built: a more watercolor landing-ink transition. Revisit
already exists at `/memory/revisit`; it is the existing editor path, not a new
immersive viewer.

Shape work starts in `ShapeGrowPage.tsx`, `BubbleViewer.tsx`, `SceneViewer.tsx`,
and `src/app/lib/superformula.ts`. `formDraft.ts` keeps some editor settings in
sessionStorage; recorded memories stay in memory only. Historical plans under
`docs/superpowers/` describe earlier states. Follow current source and this
guide when they conflict. `.env.local` is gitignored and stays on this machine.

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
pnpm dev           # Vite dev server on :5180 (includes polish + transcribe endpoints)
pnpm build         # vite build + copy-404.mjs (the 404 copy is a harmless GH-Pages leftover)
pnpm typecheck     # tsc --noEmit on src + vite.config.ts — run before pushing
```

There is **no test framework**. Verification is: `pnpm typecheck`, `pnpm build`,
and manually exercising the running dev server. Standalone Node assertions also
exist in `scripts/check-*.mjs` for carousel, pond, transcription routing, and voice
behavior; these are not wired into a package test script.

---

## 4. Directory map — where to find things

```
nijimu/
├── src/
│   ├── main.tsx                    # entry — mounts <App/>
│   ├── app/
│   │   ├── App.tsx                 # ROUTER + GlobalControls (music/profile)
│   │   ├── components/             # one file per live screen, plus shared UI
│   │   ├── lab/                    # /lab/descent — in-progress create shot; /lab/film — the photo's film look, flat; /lab/vessel — the memory as a glass vessel, still; /lab/gallery — the dive gallery seated with ten vessels; wrapCloud.ts — the point cloud, kept aside (?cloud=1)
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
     └ /record/start      PondRecordingOverlay on MemoryPondPage — records and transcribes
       └ /record/transcript  PuddleTranscriptPage — words + highlight
         └ /record/build       BuildObjectPage — camera gate
           └ /record/shape/grow     ShapeGrowPage — form + hand controls
             └ /record/shape/color   ShapeColorPage
               └ /record/shape/texture ShapeTexturePage
                 └ /record/name    naming rim on LandingPage — title + year; this visit only
                   └ /memory       same gallery, now including the new memory
```

**B. Revisit memories:**
```
/memory/scroll   MemoryScrollPage — vertical dot list with a 3D preview
 └ /memory/revisit  RevisitMemoryPage
   └ /memory/edit/weight | /color | /texture   EditXPage editors
     └ /record/saved  MemorySavedPage — writes the edited memory
```

Landing, carousel, pond, recording, transcript, and naming share a mounted
`LandingPage` layout; its route children render no separate page themselves.
The restored build/grow/color/texture pages are live sibling routes in `App.tsx`.
Other former screens (blob recording, gray transcript, orb / click / process,
and older sculpt variants) remain in `src/app/archive/record-loop/`.

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
Browser: PondRecordingOverlay (mounted by MemoryPondPage)
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

**Current UI status:** the backend and browser helper remain implemented, but
`requestPolish()` is only called by the archived gray `TranscriptPage`. The live
`PuddleTranscriptPage` transcribes and highlights words without invoking polish.
The following describes the retained polish implementation, not an active step
in the current create journey.

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
