import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/app/lib/pondTrail.ts", import.meta.url), "utf8");
const module = { exports: {} };
runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { module, exports: module.exports });
const { samplePondTrail, POND_TRAIL_SLOTS, POND_TRAIL_LIFETIME } = module.exports;
let anchor = samplePondTrail(null, { x: 0, z: -3, time: 0 }).anchor;
assert.equal(samplePondTrail(anchor, { x: 0, z: -3, time: .12 }).segment, null, "resting cursor creates no wake");
assert.equal(samplePondTrail(anchor, { x: .001, z: -3, time: .12 }).segment, null, "ignore tiny jitter");
const times = [];
for (let frame = 1; frame <= 240; frame++) {
  const time = frame / 60;
  const sample = samplePondTrail(anchor, { x: time * 2, z: -3, time });
  anchor = sample.anchor;
  if (sample.segment) {
    assert.ok(sample.segment.to.x > sample.segment.from.x);
    assert.ok(sample.segment.strength > 0 && sample.segment.strength <= 1);
    if (times.length >= POND_TRAIL_SLOTS) {
      assert.ok(time - times[times.length - POND_TRAIL_SLOTS] > POND_TRAIL_LIFETIME,
        "pool never overwrites a still-visible wake");
    }
    times.push(time);
  }
}
assert.ok(times.length > 25 && times.length <= 40, "bounded sampling produces a continuous moving wake");
assert.equal(samplePondTrail(anchor, null).anchor, null, "leaving the lake breaks the trail");
assert.equal(samplePondTrail(null, { x: -4, z: -8, time: 5 }).segment, null, "re-entry does not bridge across the lake");
assert.equal(samplePondTrail(anchor, { x: 5, z: -3, time: 8 }).segment, null, "pause/resume does not create a long trail");
const first = samplePondTrail({ x: 0, z: 0, time: 0 }, { x: 1, z: 0, time: .12 });
const second = samplePondTrail(first.anchor, { x: 1, z: 1, time: .24 });
assert.equal(first.segment.to.x, second.segment.from.x);
assert.equal(first.segment.to.z, second.segment.from.z);
assert.equal(first.segment.to.time, second.segment.from.time, "age is continuous across the join");
for (const axis of ["x", "z"]) {
  assert.equal(first.segment.to[axis] - first.segment.control[axis],
    second.segment.control[axis] - second.segment.from[axis], "joined curves have matching tangents");
}
const { from, control, to } = second.segment;
const curveMid = { x: .25 * from.x + .5 * control.x + .25 * to.x,
  z: .25 * from.z + .5 * control.z + .25 * to.z };
assert.ok(Math.hypot(curveMid.x - (from.x + to.x) / 2, curveMid.z - (from.z + to.z) / 2) > .1,
  "a turn follows a genuinely curved path, not its straight chord");
const pond = readFileSync(new URL("../src/app/components/PerspectivePond.tsx", import.meta.url), "utf8");
assert.ok(pond.includes("uTrails: uniforms.uTrails"), "ring and water share the disturbance");
assert.ok(pond.includes("uTrailControls: uniforms.uTrailControls"));
assert.ok(pond.includes("if (d < wakeDistance)"), "one wake prevents overlapping end caps from making streaks");
assert.ok(pond.includes("!reducedMotion && arrival === 1 && target > .05"), "only a visible interactive cursor emits trails");
assert.ok(pond.includes("trailIndex.current++ % POND_TRAIL_SLOTS"), "bounded GPU trail storage");
console.log("Pond trail checks passed: motion sampling, jitter suppression, fading pool, interruption/re-entry and reduced motion.");
