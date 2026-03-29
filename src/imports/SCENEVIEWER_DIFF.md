# SceneViewer Diff: FormTest vs Target Project

Comparison between the working `screenViewer.jsx` (FormTest) and the target `SceneViewer.tsx` where evolve/weight sliders don't work.

---

## Critical Bugs (cause sliders to not work)

### Bug 1: `THREE.Timer` never updated — all animations frozen

| | FormTest (working) | Target (broken) |
|---|---|---|
| Timer | `new THREE.Clock()` | `new THREE.Timer()` |
| Usage | `clock.getDelta()` auto-tracks time | `timer.getDelta()` requires `timer.update(timestamp)` first |

`THREE.Timer.getDelta()` returns `0` unless `timer.update()` is called each frame. Since the target never calls `timer.update()`:
- `delta` = 0 every frame
- `elapsed` stays at 0 forever
- All time-driven animations (wave, breathing, env rotation) are frozen

**Fix:**

```ts
// Replace
const timer = new THREE.Timer();
// With
const clock = new THREE.Clock();

// Replace
const delta = timer.getDelta();
// With
const delta = clock.getDelta();
```

### Bug 2: Fake environment map — evolve rotation has no visible effect

| | FormTest (working) | Target (broken) |
|---|---|---|
| Env map | Real HDR via `RGBELoader` + `PMREMGenerator` | 6× 1x1 pixel base64 PNG via `CubeTextureLoader` |
| HDR source | `studio_small_09_1k.hdr` from Poly Haven | None |

The target uses six identical 1-pixel gray images as a "fake" environment map. Since all directions have the same color, rotating it (`scene.environmentRotation`) produces zero visible change. Additionally, `environmentRotation` is designed for PMREM environment maps and may not apply to raw `CubeTexture`.

**Fix:**

```ts
// Add import
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

// Replace the CubeTextureLoader block with:
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();
new RGBELoader().load(
  'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr',
  (texture) => {
    if (disposed) return;
    scene.environment = pmremGenerator.fromEquirectangular(texture).texture;
    texture.dispose();
    pmremGenerator.dispose();
  },
  undefined,
  () => { pmremGenerator.dispose(); } // error fallback
);
```

---

## Other Differences (visual quality, not slider-breaking)

### Renderer

| Setting | FormTest | Target |
|---|---|---|
| `toneMapping` | `AgXToneMapping` | `ACESFilmicToneMapping` |
| `toneMappingExposure` | 1.35 | 1.35 |
| `shadowMap.type` | `VSMShadowMap` | default (`PCFShadowMap`) |
| `preserveDrawingBuffer` | removed | `true` |
| `powerPreference` | `'high-performance'` | not set |

### Camera

| Setting | FormTest | Target |
|---|---|---|
| `near` | 0.5 | 0.1 |
| `far` | 50 | 1000 |

FormTest uses a tighter depth range for better Z-buffer precision.

### Shadow (SpotLight)

| Setting | FormTest | Target |
|---|---|---|
| `shadow.mapSize` | 2048×2048 | 1024×1024 |
| `shadow.bias` | -0.0002 | default (0) |
| `shadow.normalBias` | 0.02 | default (0) |
| `shadow.radius` | 4 | not set |
| `shadow.blurSamples` | 16 | not set |
| `shadow.camera.near` | 1 | default |
| `shadow.camera.far` | 30 | default |
| `penumbra` | 0.8 | 0.7 |
| `intensity` | 50 | 60 |

### Lights

| Light | FormTest | Target |
|---|---|---|
| PointLight intensity | 25 / 25 / 18 | 40 / 40 / 28 |
| PointLight decay | 2 (physically correct) | 5 (extreme falloff) |
| PointLight distance | 25 | 30 |
| AmbientLight colors | `#e8e6f0` 0.3 + `#e8d8d4` 0.08 | `#e0ddf0` 0.35 + `#e2cece` 0.1 |
| environmentIntensity | 1.2 | 1.5 |

### Material

| Property | FormTest | Target |
|---|---|---|
| `specularIntensity` | 0.8 | not set |
| `specularColor` | `#ffffff` | not set |
| `attenuationColor` | `0x9098a8` | `0x8a90a0` |
| `attenuationDistance` | 0.5 | 0.4 |
| `sheenRoughness` | 0.4 | 0.35 |

All other material properties (transmission, thickness, roughness, metalness, ior, envMapIntensity) are identical.

### Extra: Target has features FormTest doesn't

| Feature | Details |
|---|---|
| `ready` prop | SceneViewer won't initialize until `ready === true` |
| Fallback sphere | If GLB fails to load, creates a `SphereGeometry(1, 64, 64)` with the same material |
| TypeScript types | Full interface `SceneViewerProps` with typed refs |
| `try/catch` around init | Catches and logs initialization errors |

---

## Summary: What to fix for sliders to work

1. **Replace `THREE.Timer` with `THREE.Clock`** — this alone will unfreeze all animations
2. **Replace fake CubeTexture with real HDR** — this makes evolve's environment rotation visible
3. (Optional) Apply the renderer/shadow/light/material improvements from FormTest for better visual quality
