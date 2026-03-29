# Migration Guide: Evolve & Weight Sliders

Migrate the **Evolve** and **Weight** slider logic from the FormTest project into another web project. Slider UI styling should use the target project's own components/styles — this document only covers data flow and 3D animation logic.

---

## Overview

| Slider | Internal Variable | Range | Default | Effect |
|--------|-------------------|-------|---------|--------|
| EVOLVE | `evolve` | 0 ~ 1 | 0 | Environment map rotation + model breathing scale |
| WEIGHT | `fluidity` | 0 ~ 1 | 0 | Vertex wave deformation (Y-axis sin/cos ripple) |

---

## Step 1: Add State in the Target Page

Create two state variables in your page component:

```jsx
const [evolve, setEvolve] = useState(0)    // 0 ~ 1
const [fluidity, setFluidity] = useState(0) // 0 ~ 1
```

---

## Step 2: Add Slider UI

Use the target project's own slider component and styling. Just ensure:

- **Evolve slider**: `min=0` `max=1` `step=0.01`, value bound to `evolve`, onChange calls `setEvolve(value)`
- **Weight slider**: `min=0` `max=1` `step=0.01`, value bound to `fluidity`, onChange calls `setFluidity(value)`

Optional display text:

```
EVOLVE ${Math.round(evolve * 100)}%
WEIGHT ${Math.round(fluidity * 100)}%
```

---

## Step 3: Pass Values into SceneViewer

```jsx
<SceneViewer
  evolve={evolve}
  setEvolve={setEvolve}
  fluidity={fluidity}
  setFluidity={setFluidity}
  // ...other props
/>
```

---

## Step 4: Receive Props in SceneViewer

Add to SceneViewer's props:

```js
export default function SceneViewer({
  // ...existing props
  fluidity: fluidityProp,
  setFluidity: setFluidityProp,
  evolve: evolveProp,
  setEvolve: setEvolveProp,
}) {
```

Support controlled/uncontrolled mode (SceneViewer manages its own state if no external control is provided):

```js
const [fluidityState, setFluidityState] = useState(0)
const [evolveState, setEvolveState] = useState(0)
const fluidity = fluidityProp !== undefined ? fluidityProp : fluidityState
const evolve = evolveProp !== undefined ? evolveProp : evolveState
```

---

## Step 5: Write to Animation Params Ref

Add both values to `paramsRef` (a mutable ref read by the `requestAnimationFrame` loop):

```js
paramsRef.current = {
  // ...other params
  fluidity,
  evolve: evolve * 0.6,  // scale factor for smoother slider response
}
```

> **Note**: `evolve` is multiplied by `0.6` when written to the ref. The animation code reads `p.evolve` with an effective range of `0 ~ 0.6`.

---

## Step 6: Animation Loop Logic

The following code goes inside the `requestAnimationFrame` loop. Required variables:
- `p` = `paramsRef.current`
- `t` = accumulated time in seconds
- `elapsed` = same as `t`
- `scene` = THREE.Scene instance
- `mesh` = the model's Mesh object
- `origPos` = original vertex positions `Float32Array` (saved at model load time)
- `origNorms` = original normals `Float32Array` (saved at model load time)

### 6A. Evolve — Environment Map Rotation

```js
// Rotate the HDR environment map on three axes with sin waves,
// producing flowing reflections and light shifts
if (scene.environment) {
  if (!scene.environmentRotation) {
    scene.environmentRotation = new THREE.Euler(0, 0, 0)
  }
  if (p.evolve > 0) {
    const freq = 1.0 + p.evolve * 2.0   // frequency: 1.0 ~ 2.2
    const freqEnv = freq / 1.2           // env rotation frequency slightly lower than breathing
    const amp = p.evolve * Math.PI       // amplitude: 0 ~ 0.6π
    scene.environmentRotation.set(
      amp * Math.sin(t * freqEnv + 1),
      amp * Math.sin(t * freqEnv + 0.5),
      amp * Math.sin(t * freqEnv + 2),
    )
  } else {
    scene.environmentRotation.set(0, 0, 0)
  }
}
```

### 6B. Evolve — Model Breathing Scale

```js
// Uniform sin-wave scale on the entire model, creating a "breathing" effect
if (p.evolve > 0) {
  const freq = 1.0 + p.evolve * 2.0
  const breath = 1 + Math.sin(elapsed * freq) * 0.08  // ±8% scale
  mesh.scale.set(breath, breath, breath)
} else {
  mesh.scale.set(1, 1, 1)
}
```

### 6C. Weight (Fluidity) — Vertex Wave Deformation

```js
const f = p.fluidity * 0.6  // effective strength factor

// Iterate every vertex, add sin*cos wave displacement on Y axis
for (let i = 0; i < pos.count; i++) {
  const ox = origPos[i * 3]      // original X
  const oy = origPos[i * 3 + 1]  // original Y
  const oz = origPos[i * 3 + 2]  // original Z
  const wave = f > 0
    ? Math.sin(ox * 2.5 + t * f * 3) *
      Math.cos(oz * 2.5 + t * f * 2) * 0.08 * f
    : 0
  pos.setXYZ(i, ox, oy + wave, oz)
}
pos.needsUpdate = true
mesh.geometry.computeVertexNormals()
```

**Parameter breakdown:**

| Expression | Purpose |
|------------|---------|
| `ox * 2.5` | Spatial frequency — controls ripple density |
| `t * f * 3` | Time-driven phase — higher f = faster animation |
| `0.08 * f` | Amplitude — higher f = taller waves, max ≈ 0.048 |
| `sin * cos` | Two orthogonal waves multiplied produce a checkerboard-like ripple pattern |

---

## Step 7: Save Original Vertex Data at Model Load Time

In the GLB model load callback, traverse meshes and save original vertex positions and normals. This is the baseline for per-frame deformation:

```js
model.traverse((child) => {
  if (!child.isMesh) return

  // Ensure normals exist
  if (!child.geometry.attributes.normal) {
    child.geometry.computeVertexNormals()
  }

  // Save original data (used for per-frame reset + deformation)
  meshRef.current = child
  originalPositionsRef.current = Float32Array.from(
    child.geometry.attributes.position.array,
  )
  originalNormalsRef.current = Float32Array.from(
    child.geometry.attributes.normal.array,
  )
})
```

Required refs:

```js
const meshRef = useRef(null)
const originalPositionsRef = useRef(null)
const originalNormalsRef = useRef(null)
```

---

## Full Animation Loop Pseudocode

```js
let elapsed = 0
const clock = new THREE.Clock()

function animate() {
  requestAnimationFrame(animate)
  const delta = clock.getDelta()
  elapsed += delta
  const t = elapsed

  const p = paramsRef.current
  const mesh = meshRef.current
  const origPos = originalPositionsRef.current

  // ① Evolve: environment rotation
  // → paste 6A code

  // ② Evolve: breathing scale
  if (origPos && mesh) {
    // → paste 6B code
  }

  // ③ Weight: vertex wave
  if (origPos && mesh) {
    const pos = mesh.geometry.attributes.position
    if (pos && origPos.length >= pos.count * 3) {
      // → paste 6C code
    }
  }

  renderer.render(scene, camera)
}
```

---

## Dependencies

| Dependency | Purpose |
|------------|---------|
| `three` | Three.js core (Euler, Vector3, geometry attributes) |
| `react` | useState, useRef, useEffect |
| Target project's Slider component | UI interaction, replaces the original `<input type="range">` |

---

## Important Notes

1. **Original vertices must be saved once at model load time.** Each frame computes deformation from the original positions — never accumulate deformations (causes drift).
2. **Evolve's two effects (env rotation + breathing scale) are independent.** You can migrate only one if needed.
3. **Weight's wave deformation rewrites all vertices every frame.** If other deformations (e.g. Bump) coexist, apply them in order: Fluidity first → then Bump.
4. **Performance**: Vertex deformation is CPU-intensive. For high-poly models (>50k vertices), consider a GPU approach (vertex shader).
5. **`computeVertexNormals()`** is called every frame which is expensive but ensures correct lighting. If performance is a concern, reduce call frequency.
