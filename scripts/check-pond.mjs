// Focused, dependency-free checks for the pond clock and hold lifecycle.
// Run with: node scripts/check-pond.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(path, imports = {}, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  runInNewContext(js, {
    exports: module.exports, module,
    require: name => imports[name] ?? require(name), ...globals,
  });
  return module.exports;
}

const landing = load("../src/app/lib/landingTransition.ts");
const { POND_ENTRY, pondTransition, pondRimTravel, pondRimPose, pondRimSeat, pondSurfaceMask } = load("../src/app/lib/pondTransition.ts", { "./landingTransition": landing });
assert.equal(pondSurfaceMask(1), undefined, "settled pond retains its original appearance");
assert.equal(pondSurfaceMask(2), undefined);
assert.ok(pondSurfaceMask(0).includes("black 480px"), "entry feather spans twice the original height");
assert.ok(pondSurfaceMask(.5).includes("black 240px"), "the feather remains broad midway through entry");
assert.equal(pondTransition(POND_ENTRY.rimEnd / 4, false).departure, .25, "pose easing is not doubled by the clock");
assert.ok(pondRimSeat(500, 460, 500, 460, 1000, pondTransition(1300, false).departure, false).y > 0, "artifacts linger in view rather than rushing offscreen");
for (const arrival of [0, .25, .5, .99]) {
  assert.ok(pondSurfaceMask(arrival).includes("transparent 0"), "moving panel has no opaque leading seam");
}
assert.equal(pondTransition(0, false).departure, 0);
assert.equal(pondTransition(POND_ENTRY.rimEnd, false).departure, 1);
assert.equal(pondTransition(POND_ENTRY.pondStart, false).arrival, 0, "lake waits for the ring's tilt");
assert.equal(pondTransition(POND_ENTRY.pondStart, false).galleryOpacity, 1);
assert.equal(pondTransition(POND_ENTRY.end, false).arrival, 1);
assert.equal(pondTransition(POND_ENTRY.reducedEnd, true).arrival, 1);
assert.equal(pondRimTravel(1000), 1200, "opaque artifacts clear the viewport physically");
assert.equal(pondRimPose(.58, false).tilt, Math.PI / 2);
assert.equal(pondRimPose(.58, true).tilt, 0, "reduced motion skips the rotation");
assert.deepEqual(JSON.parse(JSON.stringify(pondRimSeat(500, 460, 500, 460, 1000, 0, false))), { x: 500, y: 460, scale: 1, z: 0, tilt: 0 });
assert.ok(pondRimSeat(500, 460, 500, 460, 1000, 1, false).y < -420, "focused model fully exits without fading");
const gallerySource = readFileSync(new URL("../src/app/components/PuddleDiveGallery.tsx", import.meta.url), "utf8");
const viewerSource = readFileSync(new URL("../src/app/components/SceneViewer.tsx", import.meta.url), "utf8");
assert.ok(!gallerySource.includes("presentationTilt") && !viewerSource.includes("presentationTilt"), "the array rotates, not the individual artifacts");
for (const progress of [.2, .5, .8]) {
  const left = pondRimSeat(250, 650, 500, 460, 1000, progress, false);
  const right = pondRimSeat(750, 650, 500, 460, 1000, progress, false);
  assert.equal(left.y, right.y, "the rim shares one rotation plane");
  assert.equal(left.scale, right.scale);
  assert.ok(Math.abs(left.x + right.x - 1000) < .0001);
}
for (const reduced of [false, true]) {
  let previous = 0;
  for (let time = 0; time < POND_ENTRY.end + 100; time += 10) {
    const state = pondTransition(time, reduced);
    assert.ok(state.arrival >= previous && state.arrival <= 1);
    assert.ok(state.departure >= 0 && state.departure <= 1);
    assert.equal(state.galleryOpacity, 1, "neither direction fades the memory array");
    previous = state.arrival;
  }
}

const { pondPromptCue, POND_PROMPT_PERIOD, POND_THOUGHTS } = load("../src/app/lib/pondPrompts.ts", { "./landingTransition": landing });
assert.equal(pondPromptCue(0).ripple, 0);
assert.ok(pondPromptCue(.05).ripple > 0, "the impulse is visible while its radius is still tiny");
assert.equal(pondPromptCue(.1).ripple, 1, "do not wait until a large ring has already formed");
assert.ok(pondPromptCue(.4).ripple > 0);
assert.equal(pondPromptCue(.4).opacity, 0, "the ripple precedes its words");
assert.equal(pondPromptCue(2).opacity, 1);
assert.equal(pondPromptCue(7.2).opacity, 0, "words leave before the next pair");
assert.equal(pondPromptCue(8.1).ripple, 0, "the water stills before the next drop");
for (let cycle = 0; cycle < 9; cycle++) {
  assert.equal(pondPromptCue(cycle * POND_PROMPT_PERIOD + 2).index, cycle % POND_THOUGHTS.length);
}
for (let time = 0; time < 30; time += .02) {
  const cue = pondPromptCue(time);
  assert.ok(cue.opacity >= 0 && cue.opacity <= 1);
  assert.ok(cue.ripple >= 0 && cue.ripple <= 1);
  assert.ok(POND_THOUGHTS.filter((_, i) => i === cue.index && cue.opacity > 0).length <= 1);
}

// Verify the restored pre-reference renderer and its original viewpoint.
const THREE = require("three");
const pondSource = readFileSync(new URL("../src/app/components/PerspectivePond.tsx", import.meta.url), "utf8");
assert.ok(pondSource.includes("float waterHeight(vec2 p)"));
assert.ok(pondSource.includes("float spread = 1.0 / (1.0 + d * .35)"));
assert.ok(pondSource.includes("exp(-age * .23) * spread"), "expanding ripples lose contrast with distance and age");
assert.ok(pondSource.includes("radius + .025, d"), "water outside the travelling front cannot ripple early");
assert.ok(pondSource.includes("spread * reached * birth"), "the near-zero impulse starts softly and remains causal");
assert.ok(!pondSource.includes("uRippleEnergy"), "new ripples cannot reset the pond-wide contrast");
assert.ok(pondSource.includes("(ribbons - .5) * .022 + fibers * .006"), "ambient lighting contrast remains constant");
assert.ok(pondSource.includes("crest < 3") && pondSource.includes("float(crest) * .52"), "three crests are emitted sequentially");
assert.ok(pondSource.includes("if (age < 0.0) continue"), "trailing crests cannot exist before their birth");
assert.ok(pondSource.includes("field.x += strength * .07"), "rounded rings have more volume");
assert.ok(!pondSource.includes("sin(front") && !pondSource.includes("repeating-radial-gradient"), "use a few rounded crests, not a dense etched wave train");
assert.ok(pondSource.includes("vec2 surface = p - rippleField(p).yz"), "ripple displaces the water texture");
assert.ok(pondSource.includes("vec2 flow = p - ripple.yz"), "the existing waves move with the same displacement");
const pondPageSource = readFileSync(new URL("../src/app/components/MemoryPondPage.tsx", import.meta.url), "utf8");
assert.ok(!pondPageSource.includes('background: "#7d9290"'), "prompt dots are removed");
assert.ok(!pondSource.includes("createFlowLake"), "the later flow-map engine is not active");
assert.ok(!pondSource.includes("float bank"), "the lake remains free of river banks");
for (const [width, height] of [[390, 844], [1500, 1010], [1920, 1080]]) {
  const camera = new THREE.PerspectiveCamera(48, width / height, .1, 2400);
  camera.position.set(0, 2.8, 10);
  camera.lookAt(0, .05, -24);
  camera.updateMatrixWorld();
  for (const prompt of POND_THOUGHTS) {
    const point = new THREE.Vector3(width < 600 ? 0 : prompt.x, .12, prompt.z).project(camera);
    assert.ok(Math.abs(point.x) < .65, "prompt remains inside the viewport");
    assert.ok(point.y > -.65 && point.y < .4, "prompt stays above the hold controls");
  }
}

// Minimal hook scheduler: exercise the actual hook's callbacks/RAF/cleanup
// without adding a DOM test framework to this project.
function holdHarness(enabled = true) {
  let now = 0, id = 0, progress = 0, completions = 0;
  const frames = new Map(), effects = [], cleanup = [];
  const listeners = new Map();
  const events = {
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: name => listeners.delete(name),
  };
  const document = { ...events, hidden: false };
  const React = {
    useState: () => [0, value => { progress = value; }],
    useRef: current => ({ current }),
    useCallback: callback => callback,
    useEffect: callback => effects.push(callback),
  };
  const { useHoldToCreate } = load("../src/app/hooks/useHoldToCreate.ts", { react: React }, {
    performance: { now: () => now },
    requestAnimationFrame: callback => { frames.set(++id, callback); return id; },
    cancelAnimationFrame: key => frames.delete(key),
    window: events, document,
  });
  const hold = useHoldToCreate(() => { completions++; }, enabled);
  effects.forEach(effect => cleanup.push(effect()));
  return {
    hold, document, listeners,
    advance(ms) {
      now += ms;
      const callbacks = [...frames.values()]; frames.clear();
      callbacks.forEach(callback => callback(now));
    },
    unmount: () => cleanup.forEach(fn => fn?.()),
    get progress() { return progress; },
    get completions() { return completions; },
    get pending() { return frames.size; },
  };
}

const full = holdHarness();
full.hold.start(); full.hold.start();
assert.equal(full.pending, 1, "repeat keydown cannot start a second hold");
full.advance(1999);
assert.equal(full.completions, 0);
full.advance(1);
assert.equal(full.completions, 1);
full.hold.start(); full.advance(3000);
assert.equal(full.completions, 1, "commit only once");

const release = holdHarness();
release.hold.start(); release.advance(800); release.hold.cancel(); release.advance(2200);
assert.equal(release.completions, 0);
assert.equal(release.progress, 0);
release.hold.start(); release.advance(2000);
assert.equal(release.completions, 1, "a canceled press can be retried");

for (const event of ["blur", "visibilitychange"]) {
  const paused = holdHarness();
  paused.hold.start(); paused.advance(600);
  paused.document.hidden = true;
  paused.listeners.get(event)(); paused.advance(3000);
  assert.equal(paused.completions, 0, `${event} cancels the hold`);
}
const disabled = holdHarness(false);
disabled.hold.start(); disabled.advance(3000);
assert.equal(disabled.completions, 0);
const unmounted = holdHarness();
unmounted.hold.start(); unmounted.unmount();
assert.equal(unmounted.pending, 0);
assert.equal(unmounted.listeners.size, 0);
console.log("Pond checks passed: restored renderer; original prompt projection; staged entry; sequential prompts; hold and cancellation.");
