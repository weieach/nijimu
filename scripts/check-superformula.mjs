// Superformula category sampling and mesh checks. No browser or WebGL context required.
// Run with: node scripts/check-superformula.mjs
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
  runInNewContext(js, { module, exports: module.exports, Math, Float32Array, Float64Array, Uint16Array, Uint32Array, Map, Object, Number, String });
  return module.exports;
}

const {
  ARTIFACT_CATEGORIES,
  CATEGORY_SPECS,
  HYBRID_SOURCES,
  baseForm,
  buildArtifactMesh,
  closesAround,
  createArtifactForm,
  formForMemory,
  formFromState,
  formKey,
  getArtifactMesh,
  isArtifactForm,
  superRadius,
} = load("../src/app/lib/superformula.ts");

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

/** Does `p` fall inside one of the set's variants, ties and steps included? */
function withinSet(variants, p) {
  return variants.some((range) => {
    const inside = (r, v) => v >= r.min - 1e-9 && v <= r.max + 1e-9;
    if (!inside(range.m, p.m) || !inside(range.n1, p.n1)) return false;
    if (range.n2 === "n1" ? p.n2 !== p.n1 : !inside(range.n2, p.n2)) return false;
    if (range.n3 === "n1" ? p.n3 !== p.n1 : range.n3 === "n2" ? p.n3 !== p.n2 : !inside(range.n3, p.n3)) return false;
    if (range.m.step === "integer" && !Number.isInteger(p.m)) return false;
    if (range.m.step === "even" && p.m % 2 !== 0) return false;
    if (range.m.step === "fractional" && Number.isInteger(p.m)) return false;
    if (range.apart && Math.abs(p.n2 - p.n3) < range.apart - 1e-9) return false;
    return true;
  });
}

// Every category's sample config is the reference's, and sits inside its own range.
const samples = {
  sphere: [[0, 1, 1, 1], [0, 1, 1, 1]],
  roundedBox: [[4, 4, 4, 4], [4, 4, 4, 4]],
  sharpCube: [[4, 20, 20, 20], [4, 20, 20, 20]],
  diamond: [[4, 1, 1, 1], [4, 1, 1, 1]],
  cylinder: [[0, 1, 1, 1], [4, 20, 20, 20]],
  prism: [[6, 20, 20, 20], [4, 20, 20, 20]],
  star: [[5, 0.3, 0.3, 0.3], [1, 0.3, 0.3, 0.3]],
  flower: [[7, 0.2, 1.7, 1.7], [7, 0.2, 1.7, 1.7]],
  urchin: [[12, 0.5, 0.5, 0.5], [12, 0.5, 0.5, 0.5]],
  gear: [[6, 1, 7, 8], [4, 10, 10, 10]],
  hybrid: [[5, 0.3, 0.3, 0.3], [4, 20, 20, 20]],
  torn: [[7.3, 0.2, 1.7, 1.7], [7, 0.2, 1.7, 1.7]],
};
for (const category of ARTIFACT_CATEGORIES) {
  const form = baseForm(category);
  const [top, side] = samples[category];
  assert.deepEqual([form.top.m, form.top.n1, form.top.n2, form.top.n3], top, `${category} top sample`);
  assert.deepEqual([form.side.m, form.side.n1, form.side.n2, form.side.n3], side, `${category} side sample`);
  if (category !== "hybrid") {
    assert.ok(withinSet(CATEGORY_SPECS[category].top, form.top), `${category} sample top within range`);
    assert.ok(withinSet(CATEGORY_SPECS[category].side, form.side), `${category} sample side within range`);
  }
}

// Log-scale ranges need a positive floor.
for (const spec of Object.values(CATEGORY_SPECS)) {
  for (const range of [...spec.top, ...spec.side]) {
    for (const r of [range.m, range.n1, range.n2, range.n3]) {
      if (typeof r === "object" && r.log) assert.ok(r.min > 0, `${spec.label}: log range starts above 0`);
      if (typeof r === "object") assert.ok(r.min <= r.base && r.base <= r.max, `${spec.label}: base inside range`);
    }
  }
}

// Deviations never leave the category; hybrids pair two different categories.
const seen = new Set();
const deviated = new Set();
for (let i = 0; i < 4000; i++) {
  const form = createArtifactForm({ seed: `check|${i}` });
  seen.add(form.category);
  assert.ok(isArtifactForm(form), "a generated form validates");
  if (form.category === "hybrid") {
    const [topFrom, sideFrom] = form.hybridOf;
    assert.notEqual(topFrom, sideFrom, "hybrid sets come from different categories");
    assert.ok(HYBRID_SOURCES.includes(topFrom) && HYBRID_SOURCES.includes(sideFrom));
    assert.ok(withinSet(CATEGORY_SPECS[topFrom].top, form.top), `hybrid top within ${topFrom}`);
    assert.ok(withinSet(CATEGORY_SPECS[sideFrom].side, form.side), `hybrid side within ${sideFrom}`);
  } else {
    const spec = CATEGORY_SPECS[form.category];
    assert.ok(withinSet(spec.top, form.top), `${form.category} top within range: ${JSON.stringify(form.top)}`);
    assert.ok(withinSet(spec.side, form.side), `${form.category} side within range: ${JSON.stringify(form.side)}`);
    if (formKey(form) !== formKey(baseForm(form.category))) deviated.add(form.category);
  }
}
assert.equal(seen.size, ARTIFACT_CATEGORIES.length, "every category gets assigned");
for (const c of ["roundedBox", "sharpCube", "diamond", "cylinder", "prism", "star", "flower", "urchin", "gear", "torn"]) {
  assert.ok(deviated.has(c), `${c} forms deviate from the sample config`);
}

// Forced categories stay in their category.
for (const category of ARTIFACT_CATEGORIES) {
  for (let i = 0; i < 200; i++) {
    const form = createArtifactForm({ category, seed: `${category}|${i}` });
    assert.equal(form.category, category);
  }
}

// Seeded forms are stable; the curated archive's forms are spread across categories.
assert.equal(formKey(formForMemory("3")), formKey(formForMemory("3")), "a memory keeps its form");
assert.notEqual(formKey(formForMemory("3")), formKey(formForMemory("4")), "memories differ");
const curated = new Set(Array.from({ length: 16 }, (_, i) => formForMemory(String(i)).category));
assert.ok(curated.size >= 5, `the sixteen curated memories span several categories (${curated.size})`);

// Flow state: the form rides as `form` or `shape.form`; junk is refused.
const flower = baseForm("flower");
assert.equal(formFromState({ form: flower }), flower);
assert.equal(formFromState({ shape: { form: flower } }), flower);
assert.equal(formFromState({ shape: { modelPath: "Form_01.glb" } }), null);
assert.equal(formFromState(null), null);
assert.equal(isArtifactForm({ ...flower, top: { ...flower.top, n1: 0 } }), false);

// The formula itself.
assert.ok(near(superRadius(1.234, { m: 0, n1: 3, n2: 7, n3: 0.4 }), 1), "m = 0 is a circle");
assert.ok(near(superRadius(0.7, { m: 4, n1: 2, n2: 2, n3: 2 }), 1, 1e-12), "m = 4, n = 2 is a circle");
assert.ok(near(superRadius(Math.PI / 4, { m: 4, n1: 1, n2: 1, n3: 1 }), Math.SQRT1_2, 1e-12), "diamond edge");
assert.equal(superRadius(Math.PI / 4, { m: 4, n1: 0.01, n2: 50, n3: 50 }), 50, "radius is clamped");
assert.ok(closesAround({ m: 5, n1: 0.3, n2: 0.3, n3: 0.3 }));
assert.ok(!closesAround({ m: 5, n1: 1, n2: 7, n3: 8 }), "odd m with lopsided lobes is open");
assert.ok(!closesAround({ m: 7.3, n1: 0.2, n2: 1.7, n3: 1.7 }));

// Meshes: finite, normalised, outward-facing, indices in range; torn forms keep their seam open.
function checkMesh(form, label) {
  const mesh = buildArtifactMesh(form);
  const { positions, sphere, normals, index, vertexCount } = mesh;
  assert.equal(positions.length, vertexCount * 3);
  assert.ok(vertexCount <= 30000, `${label}: vertex budget (${vertexCount})`);
  let maxAbs = 0;
  for (let k = 0; k < positions.length; k++) {
    assert.ok(Number.isFinite(positions[k]) && Number.isFinite(sphere[k]) && Number.isFinite(normals[k]), `${label}: finite`);
    maxAbs = Math.max(maxAbs, Math.abs(positions[k]));
  }
  assert.ok(near(maxAbs, 1, 1e-5), `${label}: normalised (${maxAbs})`);
  for (let t = 0; t < index.length; t++) assert.ok(index[t] < vertexCount, `${label}: index in range`);
  // the growth sphere faces out everywhere, so its winding is right
  let outward = 0;
  for (let k = 0; k < sphere.length; k += 3) {
    outward += normals[k] * positions[k] + normals[k + 1] * positions[k + 1] + normals[k + 2] * positions[k + 2] > 0 ? 1 : 0;
  }
  return { mesh, outwardShare: outward / vertexCount };
}
const sphereCheck = checkMesh(baseForm("sphere"), "sphere");
assert.equal(sphereCheck.outwardShare, 1, "sphere normals all face outward");
assert.ok(checkMesh(baseForm("sharpCube"), "cube").outwardShare > 0.99, "cube normals face outward");
for (let i = 0; i < 300; i++) {
  const form = createArtifactForm({ seed: `mesh|${i}` });
  checkMesh(form, `${form.category} #${i}`);
}
const closedCube = buildArtifactMesh(baseForm("sharpCube"));
const tornMesh = buildArtifactMesh(baseForm("torn"));
// longitude segments, as buildArtifactMesh picks them
const lonOf = (p) => Math.min(224, Math.max(128, Math.ceil((48 + 12 * p.m * (p.n1 < 1 ? 1.5 : 1)) / 8) * 8));
const latOf = (p) => Math.min(128, Math.max(64, Math.ceil((32 + 8 * p.m * (p.n1 < 1 ? 1.5 : 1)) / 8) * 8));
const cube = baseForm("sharpCube");
const torn = baseForm("torn");
assert.equal(closedCube.vertexCount, lonOf(cube.top) * (latOf(cube.side) - 1) + 2, "closed forms share the seam column");
assert.equal(tornMesh.vertexCount, (lonOf(torn.top) + 1) * (latOf(torn.side) - 1) + 2, "torn forms get their own seam column");

// The cache hands back the same mesh for the same form.
assert.equal(getArtifactMesh(baseForm("urchin")), getArtifactMesh(baseForm("urchin")));

console.log("superformula checks passed");
