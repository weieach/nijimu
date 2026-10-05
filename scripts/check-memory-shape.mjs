import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as contract from "../shared/memory-assessment.mjs";
import { assessMemory } from "../server/assess-memory.mjs";
import { assessmentResponse, MAX_BODY_BYTES } from "../server/assessment-http.mjs";
import { POST } from "../api/assess-memory.mjs";

function load(path, imports = {}, globals = {}) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  runInNewContext(code, { module, exports: module.exports, require: name => { assert.ok(name in imports, name); return imports[name]; }, ...globals });
  return module.exports;
}
const geometry = load("../src/app/lib/superformula.ts");
const shape = load("../src/app/lib/memoryShape.ts", { "./superformula": geometry, "../../../shared/memory-assessment.mjs": contract });
const transcript = "I felt joyful and reached toward everyone around me.";
const assessment = { orientation: 1, comfort: 0.8, intensity: 0.95, discomfort: 0, disruption: 0, mixedness: 0.1, insufficientEvidence: false, summary: "Joyful, intense openness.", beats: [{ quote: "I felt joyful", reading: "joy", orientation: 1, intensity: 0.95 }] };
assert.ok(contract.isAssessment(assessment, transcript));
assert.ok(contract.validTranscript("我记得那个秋天的午后。"), "Chinese does not need spaces / three words");
assert.ok(!contract.isAssessment({ ...assessment, orientation: 1.01 }));
assert.ok(!contract.isAssessment({ ...assessment, comfort: NaN }));
assert.ok(!contract.isAssessment({ ...assessment, intensity: "0.8" }));
assert.ok(!contract.isAssessment({ ...assessment, beats: [{ ...assessment.beats[0], quote: "invented evidence" }] }, transcript));
assert.ok(!contract.isAssessment({ ...assessment, beats: [] }, transcript));
const assigned = shape.assignMemoryShape(assessment, "one", "api", "test", transcript);
assert.equal(assigned.family, "floral", "positive excitement remains sharp");
assert.ok(assigned.coordinates.sharpness > 0.8);
assert.ok(shape.isMemoryAssignment(assigned, transcript));
assert.ok(!shape.isMemoryAssignment(assigned, `${transcript} But that is not what I remember most.`), "changed whole transcript invalidates an old reading");
assert.ok(!shape.isMemoryAssignment({ ...assigned, form: geometry.baseForm("sphere") }, transcript), "tampered / mismatched form is not carried");
assert.equal(shape.assignMemoryShape({ ...assessment, orientation: -1, intensity: 0, comfort: 1 }, "one").family, "shell");
assert.equal(shape.assignMemoryShape({ ...assessment, orientation: 1, intensity: 0, comfort: 1 }, "one").family, "bowl");
assert.equal(shape.assignMemoryShape({ ...assessment, orientation: -1, intensity: 0.1, discomfort: 1, disruption: 1, comfort: 0 }, "one").family, "tower", "quiet pain can be sharp");
assert.equal(shape.assignMemoryShape({ ...assessment, insufficientEvidence: true }, "one").family, null);
assert.equal(shape.assignMemoryShape(null, "one").family, null);
const tie = shape.assignMemoryShape({ ...assessment, orientation: 0, intensity: 0.5, comfort: 0 }, "one");
assert.equal(tie.family, null, "a tie has no family label");
assert.ok(tie.anchor && geometry.isArtifactForm(tie.form), "the map still gives a tie its form");
assert.equal(shape.assignMemoryShape(null, "one").anchor, null, "no reading keeps the neutral sphere");
assert.equal(geometry.formKey(shape.assignMemoryShape(null, "one").form), geometry.formKey(geometry.baseForm("sphere")));
assert.equal(JSON.stringify(assigned), JSON.stringify(shape.assignMemoryShape(assessment, "one", "api", "test", transcript)), "saved mapping repeats exactly");
assert.notEqual(geometry.formKey(shape.familyForm("shell", "one")), geometry.formKey(shape.familyForm("shell", "two")), "variation stays local");
// The trends the map was drawn with: outward adds profile flares, sharp reaches farther.
assert.ok(shape.MAP_TRENDS.sideM.bOut > 0, "outward has more profile lobes");
assert.ok(shape.MAP_TRENDS.reach.bSharp > 0, "sharp reaches farther past its body");
for (const a of shape.MAP_ANCHORS) {
  const at = shape.formAt(a.outward, a.sharpness, "anchor");
  assert.equal(at.anchor, a.id, `${a.id} is its own nearest`);
  assert.equal(at.form.top.m, a.form.top.m);
  assert.ok(Math.abs(at.form.side.m - a.form.side.m) <= shape.VARIATION.profile + 0.05, `${a.id} keeps its profile near its own`);
  const room = Math.exp(shape.VARIATION.exponent) + 0.001;
  for (const set of ["top", "side"]) for (const key of ["n1", "n2", "n3"]) {
    const ratio = at.form[set][key] / a.form[set][key];
    assert.ok(ratio < room && ratio > 1 / room, `${a.id} ${set}.${key} stays within the seed's room at its own place`);
  }
}
for (let i = 0; i <= 10; i++) {
  for (let j = 0; j <= 10; j++) {
    for (const seed of ["a", "b"]) {
      const { form } = shape.formAt(i / 10, j / 10, seed);
      assert.ok(geometry.isArtifactForm(form), `form at ${i / 10},${j / 10}`);
      const mesh = geometry.buildArtifactMesh(form);
      assert.ok(mesh.vertexCount <= 30000);
      assert.ok([...mesh.positions, ...mesh.normals, ...mesh.sphere].every(Number.isFinite));
      assert.ok(Math.max(...mesh.positions.map(Math.abs)) <= 1.000001);
      assert.ok(mesh.index.every(index => index < mesh.vertexCount));
    }
  }
}
// Scale participates in cache identity, with legacy forms unchanged.
const original = geometry.baseForm("sphere");
const scaled = { ...original, proportion: { radial: 0.8, vertical: 1.2 } };
assert.notEqual(geometry.formKey(original), geometry.formKey(scaled));
assert.ok(!geometry.isArtifactForm({ ...original, proportion: { radial: Infinity, vertical: 1 } }));

// Provider tests do not make paid calls or send personal text.
let request;
const complete = (text = JSON.stringify(assessment)) => ({ model: "fixture-model", status: "completed", output: [{ type: "message", content: [{ type: "output_text", text }] }] });
const provider = async (url, options) => {
  assert.equal(url, "https://api.openai.com/v1/responses");
  assert.equal(options.headers.Authorization, "Bearer test-key");
  assert.ok(options.signal instanceof AbortSignal);
  request = JSON.parse(options.body);
  return Response.json(complete());
};
const success = await assessMemory(transcript, "test-key", undefined, provider);
assert.equal(success.status, 200);
assert.equal(success.body.model, "fixture-model");
assert.equal(JSON.parse(request.input[0].content).transcript, transcript, "entire account is sent without summarizing / truncating");
assert.equal(request.model, "gpt-4.1-mini");
assert.equal(request.text.format.type, "json_schema");
assert.equal(request.text.format.strict, true);
assert.equal(request.store, false);
assert.equal((await assessMemory(transcript, undefined)).status, 503);
assert.equal((await assessMemory("x".repeat(5001), "test-key", undefined, provider)).status, 400);
assert.equal((await assessMemory({}, "test-key", undefined, provider)).status, 400);
for (const status of ["incomplete", "failed"]) {
  assert.equal((await assessMemory(transcript, "key", undefined, async () => Response.json({ ...complete(), status }))).status, 502);
}
assert.equal((await assessMemory(transcript, "key", undefined, async () => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "refused" }] }] }))).status, 502);
for (const status of [401, 429, 500]) {
  const failure = await assessMemory(transcript, "key", undefined, async () => Response.json({ error: "secret provider details" }, { status }));
  assert.equal(failure.status, status === 429 ? 429 : 502);
  assert.ok(!JSON.stringify(failure).includes("secret provider details"));
}
assert.equal((await assessMemory(transcript, "key", undefined, async () => { throw new Error("network failure"); })).status, 502);
assert.equal((await assessMemory(transcript, "key", undefined, async () => new Response("not JSON"))).status, 502);
assert.equal((await assessMemory(transcript, "key", undefined, async () => Response.json(complete("{}")))).status, 502);
assert.equal((await assessmentResponse("{" )).status, 400);
assert.equal((await assessmentResponse(" ".repeat(MAX_BODY_BYTES+1))).status, 413);
assert.equal((await POST(new Request("http://localhost/api/assess-memory", { method: "POST", body: " ".repeat(MAX_BODY_BYTES+1) }))).status, 413);
assert.equal((await POST(new Request("http://localhost/api/assess-memory", { method: "POST", body: "{" }))).status, 400);

// Browser boundary validates independently and forwards aborts.
const client = fetch => load("../src/app/lib/assessMemory.ts", { "../../../shared/memory-assessment.mjs": contract }, { fetch, AbortController, setTimeout, clearTimeout });
const goodClient = client(async () => Response.json({ assessment, version: contract.ASSESSMENT_VERSION, model: "test" }));
assert.ok((await goodClient.requestMemoryAssessment(transcript)).assessment);
const forgedClient = client(async () => Response.json({ assessment: { ...assessment, beats: [{ ...assessment.beats[0], quote: "made up" }] }, version: contract.ASSESSMENT_VERSION }));
assert.equal((await forgedClient.requestMemoryAssessment(transcript)).assessment, null);
const controller = new AbortController();
const delayedClient = client((url, { signal }) => new Promise((resolve,reject) => { signal.addEventListener("abort", () => reject(new Error("cancelled"))); }));
const pending = delayedClient.requestMemoryAssessment(transcript, controller.signal); controller.abort();
assert.equal((await pending).assessment, null);
console.log("memory assignment: contract, geometry, replay, stale text, provider, HTTP and cancellation checks passed");
