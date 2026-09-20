// Pure projection/hand-off checks. No browser or WebGL context required.
// Run with: node --jitless scripts/check-carousel.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function load(path) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  runInNewContext(js, { module, exports: module.exports });
  return module.exports;
}
const { carouselSeat, carouselFrame, carouselContainsOffset, inkCurvePoint, inkUnfoldSeat, defaultCarouselIndex } = load("../src/app/lib/carouselLayout.ts");
const { pickLandingGalleryIndex, INK_ENTRY, inkGrowth } = load("../src/app/lib/landingTransition.ts");

for (const [width, height] of [[375, 812], [641, 647], [1366, 1032], [1920, 1080], [844, 390]]) {
  const frame = carouselFrame(width, height);
  const focused = carouselSeat(width, height, 0);
  assert.equal(focused.x, width / 2);
  assert.equal(focused.y, frame.apexY);
  assert.equal(focused.y, height * .47, "array sits slightly lower with its hand-off aligned");
  const outerRight = carouselSeat(width, height, 2);
  const outerBend = (outerRight.x / width - .02 - .5) * 2;
  const unliftedY = height * (.47 + .055 * outerBend + .28 * outerBend ** 3);
  assert.ok(Math.abs(unliftedY - outerRight.y - height * .08) < .00001, "outer right artifact is raised by eight viewport percent");
  assert.equal(focused.size, frame.size * 1.08, "current artifact has a modest size emphasis");
  assert.equal(focused.opacity, 1);
  assert.equal(focused.blurPx, 0, "only the current artifact is sharp");
  for (const offset of [-1, 1]) {
    const adjacent = carouselSeat(width, height, offset);
    assert.ok(Math.abs(adjacent.blurPx * adjacent.scale - 2.3) < .00001,
      "both immediate neighbours have increased apparent blur");
  }
  assert.ok(outerRight.blurPx * outerRight.scale > 3.2, "outermost right artifact retains its depth blur");
  for (const offset of [-5, -4, -3, -2, -1, 1, 2, 3]) {
    assert.ok(carouselSeat(width, height, offset).blurPx > 0, "every non-current artifact is blurred");
  }
  assert.ok(carouselSeat(width, height, 1).scale < 1.25, "immediate right neighbour is slightly smaller");
  let previous = carouselSeat(width, height, -6);
  for (let offset = -5.99; offset <= 3; offset += .01) {
    const seat = carouselSeat(width, height, offset);
    assert.ok(seat.x > previous.x && seat.y > previous.y, "time always advances toward lower right");
    assert.ok(seat.size > previous.size, "newer memories are always larger");
    assert.ok(seat.opacity >= 0 && seat.opacity <= 1);
    assert.ok(Math.abs(seat.size - previous.size) < frame.size * .03, "no scale jumps between slots");
    previous = seat;
  }
  const visible = Array.from({ length: 10 }, (_, i) => carouselSeat(width, height, i - 6))
    .filter(s => s.opacity > .1 && s.x + s.size / 2 > 0 && s.x - s.size / 2 < width && s.y - s.size / 2 < height);
  assert.ok(visible.length >= 7, "at least seven artifacts fit across the perspective stream");
  const older = Array.from({ length: 8 }, (_, i) => carouselSeat(width, height, -i - 1))
    .filter(s => s.opacity > 0);
  assert.equal(older.length, 5, "exactly five older artifacts are visible at rest");
  assert.ok(older[4].size < older[0].size * .3, "five older seats have a stronger size progression");
  for (let i = 1; i < older.length; i++) {
    assert.ok(older[i].blurPx * older[i].scale > older[i - 1].blurPx * older[i - 1].scale,
      "apparent blur increases even as the artifact shrinks");
  }
  assert.ok(carouselSeat(width, height, 2).x - carouselSeat(width, height, 1).x < width * .25,
    "outer foreground artifact is closer to its left neighbour");
  assert.equal(carouselSeat(width, height, -6).opacity, 0, "far seat clears before unmount");
  for (const offset of [-30, -16, -7, -6, 3, 4, 16, 30]) {
    const point = carouselSeat(width, height, offset);
    assert.ok(point.x < -6 || point.x > width + 6 || point.y < -6 || point.y > height + 6,
      "out-of-range ink pointers travel completely beyond the screen");
  }
  assert.ok(focused.x - carouselSeat(width, height, -1).x > width * .17, "extra room to the immediate left");
  assert.ok(focused.x - carouselSeat(width, height, -1).x < width * .18, "left spacing eased back slightly");
  assert.ok(carouselSeat(width, height, 1).x - focused.x > width * .235, "extra room to the immediate right");
  assert.ok(carouselSeat(width, height, 1).x - focused.x < width * .245, "right spacing eased back slightly");
  const front = carouselSeat(width, height, 3);
  assert.ok(front.x - front.size / 2 > width, "foreground seat clears before unmount");
  assert.ok(carouselSeat(width, height, -.00001).x < focused.x);
  assert.ok(carouselSeat(width, height, .00001).x > focused.x);
  for (const count of [1, 2, 16, 100]) {
    let lastX = -1;
    let lastScale = 0;
    for (let index = 0; index < count; index++) {
      const point = inkCurvePoint(width, height, index, count);
      assert.ok(point.x > lastX && point.x > 0 && point.x < width, "ink gathers in chronological order");
      assert.ok(point.y > 0 && point.y < height);
      assert.ok(point.scale > lastScale, "gathered dots get larger toward the foreground");
      lastX = point.x;
      lastScale = point.scale;
    }
  }
  for (const index of [0, 1, 13, 14, 15]) {
    const final = inkUnfoldSeat(width, height, index, 16, 7, 1);
    const seat = carouselSeat(width, height, index - 7);
    assert.ok(Math.abs(final.x - seat.x) < .00001 && Math.abs(final.y - seat.y) < .00001);
    for (let t = 0; t <= 1; t += .01) {
      const point = inkUnfoldSeat(width, height, index, 16, 7, t);
      if (point.x >= 0 && point.x <= width) {
        assert.ok(point.y > -height * .1 && point.y < height,
          "dots still inside the horizontal viewport follow the curve instead of plunging to remote endpoints");
      }
    }
  }
}
for (let count = 0; count <= 100; count++) {
  assert.ok(defaultCarouselIndex(count) >= 0 && defaultCarouselIndex(count) <= Math.max(0, count - 1));
  for (let attempt = 0; attempt < 20; attempt++) {
    const index = pickLandingGalleryIndex(count);
    assert.ok(index >= 0 && index <= Math.max(0, count - 1));
    if (count >= 8) assert.ok(index >= 5 && index <= count - 3, "landing leaves a visible tail and foreground");
  }
}
for (let active = 0; active < 16; active += .1) {
  const mounted = Array.from({ length: 16 }, (_, i) => i - active).filter(carouselContainsOffset);
  assert.ok(mounted.length <= 10, "bounded canvas count during scrolling");
}
assert.equal(inkGrowth({ elapsed: INK_ENTRY.unfoldEnd, reducedMotion: false }), 0);
assert.equal(inkGrowth({ elapsed: INK_ENTRY.growEnd, reducedMotion: false }), 1);
assert.equal(inkGrowth({ elapsed: INK_ENTRY.reducedEnd, reducedMotion: true }), 1);
const blob = readFileSync(new URL("../src/app/components/BlobScene.tsx", import.meta.url), "utf8");
const gallery = readFileSync(new URL("../src/app/components/PuddleDiveGallery.tsx", import.meta.url), "utf8");
assert.ok(blob.includes("carouselSeat(vw, vh, offset)") && gallery.includes("carouselSeat(viewport.w, viewport.h, offset)"), "landing and gallery share exact projected endpoints");
assert.ok(!blob.includes("inkRingPoint") && !gallery.includes("domePoint"), "no circular layout remains in the hand-off");
assert.ok(blob.includes("becomesArtifact ? seat.opacity : 1"), "out-of-range pointers retain opacity during unfolding");
assert.ok(blob.includes("becomesArtifact || entryReduced"), "only visible pointers crossfade, except reduced-motion fallback");
assert.ok(blob.includes("inkUnfoldSeat(vw, vh, slot, blobs.length, landingFocusSlot, unfold)"), "all dots travel along the continuous projected path");
assert.ok(blob.includes("INK_POINTER_SIZE * pointerScale"), "ink dot dimensions inherit perspective depth");
assert.ok(gallery.includes("INK_POINTER_SIZE / geo.size +"), "artifact growth preserves the incoming dot depth scale");
// Exercise the actual float update with a lifted model, including a rapid
// reversal and the final demand-rendered frame of a parked neighbour.
const viewer = readFileSync(new URL("../src/app/components/SceneViewer.tsx", import.meta.url), "utf8");
const floatUpdate = viewer.slice(viewer.indexOf("    if (recenterFloat === undefined)"), viewer.indexOf("    // read off the clock rather than accumulated"));
assert.ok(floatUpdate.includes("floatClock.current = 0"));
assert.ok(gallery.includes("recenterFloat={!focused || !rimSettled || pondDeparture > 0}"));
assert.ok(gallery.includes("floatAmplitude={0.04}"), "carousel levitation amplitude is capped at half its previous range");
const floatState = {
  recenterFloat: true, floatClock: { current: 8 }, stillRef: { current: false },
  groupRef: { current: { position: { y: .08 }, rotation: { z: .015 } } },
  delta: 1 / 60, floatAmplitude: .08, t: 12,
  THREE: { MathUtils: { lerp: (a, b, t) => a + (b - a) * t } },
};
for (let frame = 0; frame < 45; frame++) runInNewContext(floatUpdate, floatState);
assert.ok(Math.abs(floatState.groupRef.current.position.y) < .00001, "lift settles smoothly during navigation");
assert.equal(floatState.floatClock.current, 0);
floatState.stillRef.current = true;
runInNewContext(floatUpdate, floatState);
assert.equal(floatState.groupRef.current.position.y, 0, "parked neighbours are exactly centered");
assert.equal(floatState.groupRef.current.rotation.z, 0);
floatState.stillRef.current = false;
floatState.recenterFloat = false;
runInNewContext(floatUpdate, floatState);
assert.ok(floatState.groupRef.current.position.y < .001, "newly focused memory floats from center, not its old height");
floatState.recenterFloat = true;
runInNewContext(floatUpdate, floatState);
assert.equal(floatState.floatClock.current, 0, "rapid reversal resets the float again");
assert.equal(floatState.t, 12, "rotation clock is preserved");

// Run the real keyboard, wheel and touch handlers against both archive ends.
const inputSource = gallery.slice(gallery.indexOf("  /* arrows — keyboard */"), gallery.indexOf("  /* preload the artifacts"));
assert.ok(inputSource.includes('addEventListener("touchend"'));
for (const oldest of [true, false]) {
  const handlers = {};
  const exits = [];
  const moves = [];
  let now = 0;
  runInNewContext(ts.transpileModule(inputSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText, {
    useEffect: fn => fn(),
    window: { innerHeight: 800, addEventListener: (name, fn) => { handlers[name] = fn; } },
    performance: { now: () => now += 1000 },
    phase: "gallery", growth: 1, pondDeparture: 0, showArrows: true,
    hasOlder: !oldest, hasNewer: oldest, reducedMotion: true,
    rimSettledRef: { current: true }, onNavigate: dir => moves.push(dir),
    onExit: () => exits.push("home"), onOverscrollExit: () => exits.push("pond"),
  });
  const target = { tagName: "DIV", closest: () => null };
  handlers.keydown({ target, key: oldest ? "ArrowLeft" : "ArrowRight" });
  handlers.wheel({ target, deltaMode: 0, deltaX: 0, deltaY: oldest ? -100 : 100, preventDefault() {} });
  handlers.touchstart({ target, touches: [{ clientX: 100, clientY: 100 }] });
  handlers.touchend({ changedTouches: [{ clientX: oldest ? 200 : 0, clientY: 100 }] });
  assert.equal(exits.length, oldest ? 0 : 3, "only overscrolling the newest end opens the pond");
  assert.equal(moves.length, 0, "boundary gestures do not request out-of-range memories");
}
console.log("Carousel checks passed: monotonic perspective; responsive density; continuous scale; bounded canvases; chronological ink hand-off; reduced motion.");
