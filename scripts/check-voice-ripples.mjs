import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as THREE from "three";

const read = path => readFileSync(new URL(`../src/app/${path}`, import.meta.url), "utf8");
const module = { exports: {} };
runInNewContext(ts.transpileModule(read("lib/voicePeaks.ts"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { module, exports: module.exports });
const { createVoicePeakDetector, createVoiceRippleBurstPlanner, pickVoiceRippleSpot, VOICE_PEAK_MIN_MS, POND_DROP_SLOTS } = module.exports;

for (const fps of [30, 60, 120]) {
  const detect = createVoicePeakDetector();
  const peaks = [];
  for (let frame = 0; frame < fps * 5; frame++) {
    const time = frame / fps;
    const level = .015 + .18 * Math.pow(Math.max(0, Math.sin(time * Math.PI * 2)), 2);
    if (detect(level, time * 1000) !== null) peaks.push(time);
  }
  assert.equal(peaks.length, 5, `one peak per softly rising word at ${fps}fps`);
  assert.ok(peaks[1] - peaks[0] < 2, "new rings begin before earlier ones have faded");
}
const quiet = createVoicePeakDetector();
for (let i = 0; i < 1000; i++) assert.equal(quiet(.02 + Math.sin(i) * .005, i * 16), null);
const sustained = createVoicePeakDetector();
let count = 0;
for (let i = 0; i < 300; i++) {
  const level = i < 30 ? i * .01 : i < 260 ? .3 + Math.sin(i) * .003 : 0;
  if (sustained(level, i * 16) !== null) count++;
}
assert.equal(count, 1, "a sustained sound is one crest, not a periodic ripple generator");
const rapid = createVoicePeakDetector();
let last = -Infinity;
for (let i = 0; i < 1000; i++) {
  const now = i * 16;
  if (rapid(.02 + .3 * Math.max(0, Math.sin(i * .6)), now) !== null) {
    assert.ok(now - last >= VOICE_PEAK_MIN_MS, "meter chatter cannot flood the water");
    last = now;
  }
}
// The last slot is only reused after the old wave has lost nearly all amplitude.
assert.ok((POND_DROP_SLOTS - 1) * VOICE_PEAK_MIN_MS >= 7000);

// Reproduce gain settling after eight seconds: the former .08 floor misses all
// subsequent words. Continuous higher-baseline speech must also keep responding.
for (const fps of [24, 60, 120]) {
  for (const baseline of [.006, .25]) {
    const detect = createVoicePeakDetector();
    const windows = Array(6).fill(0);
    for (let frame = 0; frame < 60 * fps; frame++) {
      const time = frame / fps;
      const amplitude = time < 8 ? .22 : .04;
      const level = baseline + amplitude * Math.pow(Math.max(0, Math.sin(time * Math.PI * 2)), 2);
      if (detect(level, time * 1000) !== null) windows[Math.floor(time / 10)]++;
    }
    assert.ok(windows.every(count => count >= 8), `responsive for 60s at ${fps}fps, baseline ${baseline}: ${windows}`);
  }
}
const plan = createVoiceRippleBurstPlanner();
const burst = plan(.45, 0, () => 0);
assert.equal(burst.length, 3, "strong accent can make three ripples");
assert.equal(burst[0].delayMs, 0, "first ripple has no artificial delay");
assert.ok(burst[1].delayMs >= 80 && burst[1].delayMs <= 130 && burst[2].delayMs > burst[1].delayMs);
assert.ok(burst[2].strength < burst[1].strength, "echoes are gentler than their source");
assert.equal(plan(.45, 700, () => 0).length, 1, "nearby accents do not pile up bursts");
assert.equal(plan(.45, 2600, () => 0).length, 3, "later accents can burst again");
assert.equal(plan(.45, 5200, () => .9).length, 1, "not every loud peak makes a burst");

let previous = null;
for (let i = 0; i < 100; i++) {
  const spot = pickVoiceRippleSpot(previous, () => (i * .137) % 1);
  assert.ok(spot.x >= .22 && spot.x <= .78 && spot.y >= .56 && spot.y <= .76);
  if (previous) assert.ok(Math.hypot(spot.x - previous.x, spot.y - previous.y) >= .17);
  for (const aspect of [390 / 844, 1280 / 720, 2560 / 1080]) {
    const camera = new THREE.PerspectiveCamera(48, aspect, .1, 2400);
    camera.position.set(0, 2.8, 10);
    camera.lookAt(0, .05, -24);
    camera.updateMatrixWorld();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(spot.x * 2 - 1, 1 - spot.y * 2), camera);
    const point = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    assert.ok(point && point.z > -12 && point.z < 9, "voice ripple stays near the camera");
  }
  previous = spot;
}
const hook = read("hooks/useVoiceRecorder.ts");
assert.ok(hook.includes('peak !== null && recorderRef.current?.state === "recording"'));
assert.ok(hook.includes("onVoicePeakRef.current?.(peak)"));
const overlay = read("components/PondRecordingOverlay.tsx");
assert.ok(overlay.includes("onVoicePeak: level =>"));
assert.ok(!overlay.includes("RIPPLE_DELAY") && !overlay.includes("rippleTimers"));
assert.ok(overlay.includes("recorder.isRecording && !reducedMotion && !leaving"));
assert.ok(overlay.includes("pendingRipples.current.delete(id)"));
assert.ok(overlay.includes("onClick={() => { cancelRipples(); recorder.stop(); }}"));
assert.ok(overlay.includes("useEffect(() => cancelRipples, [cancelRipples])"));
const pond = read("components/PerspectivePond.tsx");
assert.ok(pond.includes("touchIndex.current++ % (POND_DROP_SLOTS - 1)"));
assert.ok(pond.includes("touch.strength ?? 1.5"));
console.log("Voice ripple checks passed: 60s gain changes, soft peaks, noise rejection, staggered bursts, cooldown, nearby placement and cancellation guards.");
