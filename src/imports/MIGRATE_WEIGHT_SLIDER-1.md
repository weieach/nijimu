# Migration Guide: Weight (Fluidity) Slider

Transfer the Weight slider feature into another web app. This slider controls a vertex wave deformation effect on a Three.js mesh.

---

## What It Does

The Weight slider drives a `fluidity` value (0–1) that animates every vertex on the model's Y axis using a `sin × cos` wave pattern. Higher values = faster and taller waves.

---

## All Source Code Involved

### 1. State (parent page component)

```tsx
const [fluidity, setFluidity] = useState(0); // range: 0 ~ 1
```

### 2. Slider UI

Use your own slider component. Required config:

```
min:  0
max:  1
step: 0.01
value: fluidity
onChange: (v) => setFluidity(v)
```

Display label (optional): `WEIGHT ${Math.round(fluidity * 100)}%`

### 3. Pass to SceneViewer

```tsx
<SceneViewer
  fluidity={fluidity}
  // ...other props
/>
```

### 4. SceneViewer props

```ts
// In the function signature
export function SceneViewer({
  fluidity: fluidityProp,
  // ...
}) {
```

### 5. Controlled / uncontrolled pattern

```ts
const [fluidityState, setFluidityState] = useState(0);
const fluidity = fluidityProp !== undefined ? fluidityProp : fluidityState;
```

### 6. Write to paramsRef (read by animation loop)

```ts
paramsRef.current = {
  // ...other params
  fluidity,
};
```

### 7. Refs needed (set once at model load time)

```ts
const meshRef = useRef(null);
const originalPositionsRef = useRef(null);
const originalNormalsRef = useRef(null);
```

### 8. Save original vertex data (inside GLB load callback)

```ts
model.traverse((child) => {
  if (!child.isMesh) return;
  if (!child.geometry.attributes.normal) child.geometry.computeVertexNormals();

  meshRef.current = child;
  originalPositionsRef.current = Float32Array.from(
    child.geometry.attributes.position.array
  );
  originalNormalsRef.current = Float32Array.from(
    child.geometry.attributes.normal.array
  );
});
```

### 9. Animation loop — the core effect

This runs inside `requestAnimationFrame`. Requires:
- `t` — accumulated elapsed time in seconds
- `p` — `paramsRef.current`
- `mesh` — `meshRef.current`
- `origPos` — `originalPositionsRef.current`

```ts
// Inside the animation loop:
if (origPos && mesh) {
  const pos = mesh.geometry.attributes.position;
  if (pos && origPos.length >= pos.count * 3) {
    const f = p.fluidity * 0.6;

    // ── WAVE DEFORMATION ──
    for (let i = 0; i < pos.count; i++) {
      const ox = origPos[i * 3];       // original X position
      const oy = origPos[i * 3 + 1];   // original Y position
      const oz = origPos[i * 3 + 2];   // original Z position
      const wave = f > 0
        ? Math.sin(ox * 2.5 + t * f * 3) *
          Math.cos(oz * 2.5 + t * f * 2) * 0.08 * f
        : 0;
      pos.setXYZ(i, ox, oy + wave, oz);
    }
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  }
}
```

### 10. Bump-off reset (only needed if you also have the Bump effect)

When bump is disabled (`bumpAmount === 0`), positions must be reset to fluidity-only values. Without this, stale bump offsets remain baked in.

```ts
if (p.bumpAmount === 0) {
  for (let i = 0; i < pos.count; i++) {
    const ox = origPos[i * 3];
    const oy = origPos[i * 3 + 1];
    const oz = origPos[i * 3 + 2];
    const wave = f > 0
      ? Math.sin(ox * 2.5 + t * f * 3) *
        Math.cos(oz * 2.5 + t * f * 2) * 0.08 * f
      : 0;
    pos.setXYZ(i, ox, oy + wave, oz);
  }
  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}
```

If you are **not** migrating the Bump effect, you can skip this block entirely — Section 9 alone is sufficient.

---

## Timer: Clock vs Timer

Your animation loop must use `THREE.Clock`, not `THREE.Timer`:

```ts
// Correct
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta(); // returns seconds since last call
  elapsed += delta;
  const t = elapsed;
  // ... rest of animation
}
```

`THREE.Timer` requires manual `.update(timestamp)` calls and will return `0` from `.getDelta()` without them, freezing all animations.

---

## How the Math Works

```
wave = sin(ox * 2.5 + t * f * 3) * cos(oz * 2.5 + t * f * 2) * 0.08 * f
```

| Part | Role |
|------|------|
| `f = fluidity * 0.6` | Effective strength, range 0 – 0.6 |
| `ox * 2.5` / `oz * 2.5` | Spatial frequency — vertex position seeds the wave, creating a surface pattern |
| `t * f * 3` / `t * f * 2` | Time phase — drives animation speed; higher f = faster |
| `sin(...) * cos(...)` | Two perpendicular waves multiplied → checkerboard-like ripple |
| `0.08 * f` | Amplitude — max displacement ≈ 0.048 units at full slider |

The wave only affects the **Y axis** — vertices move up and down, the X/Z positions stay at their originals.

---

## Minimal Standalone Example

If you just want the Weight effect with nothing else:

```tsx
import { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export function WeightDemo({ modelPath, fluidity = 0 }) {
  const containerRef = useRef(null);
  const meshRef = useRef(null);
  const origPosRef = useRef(null);
  const paramsRef = useRef({ fluidity });
  paramsRef.current.fluidity = fluidity;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight("#ffffff", 0.5));
    scene.add(new THREE.DirectionalLight("#ffffff", 1));

    const camera = new THREE.PerspectiveCamera(
      45, container.clientWidth / container.clientHeight, 0.5, 50
    );
    camera.position.set(0, 0, 5);

    const controls = new OrbitControls(camera, renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    new GLTFLoader().load(modelPath, (gltf) => {
      const model = gltf.scene.clone();
      const box = new THREE.Box3().setFromObject(model);
      const center = new THREE.Vector3();
      box.getCenter(center);
      model.position.sub(center);
      const maxDim = Math.max(...box.getSize(new THREE.Vector3()).toArray());
      if (maxDim > 0) model.scale.setScalar(2.5 / maxDim);

      model.traverse((child) => {
        if (!child.isMesh) return;
        if (!child.geometry.attributes.normal) child.geometry.computeVertexNormals();
        meshRef.current = child;
        origPosRef.current = Float32Array.from(child.geometry.attributes.position.array);
      });

      group.add(model);
    });

    let elapsed = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      requestAnimationFrame(animate);
      elapsed += clock.getDelta();
      controls.update();

      const mesh = meshRef.current;
      const origPos = origPosRef.current;
      if (mesh && origPos) {
        const pos = mesh.geometry.attributes.position;
        const f = paramsRef.current.fluidity * 0.6;
        for (let i = 0; i < pos.count; i++) {
          const ox = origPos[i * 3];
          const oy = origPos[i * 3 + 1];
          const oz = origPos[i * 3 + 2];
          const wave = f > 0
            ? Math.sin(ox * 2.5 + elapsed * f * 3) *
              Math.cos(oz * 2.5 + elapsed * f * 2) * 0.08 * f
            : 0;
          pos.setXYZ(i, ox, oy + wave, oz);
        }
        pos.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [modelPath]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
```

Usage:

```tsx
const [fluidity, setFluidity] = useState(0);

<input type="range" min={0} max={1} step={0.01}
  value={fluidity} onChange={(e) => setFluidity(+e.target.value)} />
<WeightDemo
  modelPath="https://raw.githubusercontent.com/Noyok1vas/figbuildAssets/main/Form_01.glb"
  fluidity={fluidity}
/>
```

---

## Checklist

- [ ] Add `fluidity` state in your page component
- [ ] Add slider UI bound to `fluidity`
- [ ] Pass `fluidity` to SceneViewer as prop
- [ ] Save original vertex positions at model load time (`Float32Array.from(...)`)
- [ ] Use `THREE.Clock` (not `THREE.Timer`) for time tracking
- [ ] Add wave deformation loop inside `requestAnimationFrame`
- [ ] Call `pos.needsUpdate = true` and `computeVertexNormals()` after modifying vertices
