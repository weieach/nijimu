import { useRef, useEffect, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'

RectAreaLightUniformsLib.init()

const HDR_URL = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr'

export default function SceneViewer({
  modelPath = 'https://raw.githubusercontent.com/Noyok1vas/figbuildAssets/main/FormTest.glb',
  className = '',
  style = {},
  autoRotate: autoRotateProp,
  onAutoRotateChange,
  canvasBlurPx = 6,
  matOpacity = 0.4,
  fluidity: fluidityProp,
  setFluidity: setFluidityProp,
  evolve: evolveProp,
  setEvolve: setEvolveProp,
  bumpAmount: bumpAmountProp,
  setBumpAmount: setBumpAmountProp,
  bumpSpike: bumpSpikeProp,
  setBumpSpike: setBumpSpikeProp,
  density: densityProp,
  setDensity: setDensityProp,
  rectAreaLightColors,
}) {
  // ── Controlled / uncontrolled state (same API as before) ──────────────────
  const [autoRotateInternal, setAutoRotateInternal] = useState(true)
  const autoRotate = autoRotateProp !== undefined ? autoRotateProp : autoRotateInternal
  const setAutoRotate = onAutoRotateChange ?? setAutoRotateInternal
  const [isDragging, setIsDragging] = useState(false)
  const [fluidityState, setFluidityState] = useState(0)
  const [evolveState, setEvolveState] = useState(0)
  const [bumpAmountState, setBumpAmountState] = useState(0)
  const [bumpSpikeState, setBumpSpikeState] = useState(0)
  const [densityState, setDensityState] = useState(200)
  const fluidity = fluidityProp !== undefined ? fluidityProp : fluidityState
  const evolve = evolveProp !== undefined ? evolveProp : evolveState
  const bumpAmount = bumpAmountProp !== undefined ? bumpAmountProp : bumpAmountState
  const bumpSpike = bumpSpikeProp !== undefined ? bumpSpikeProp : bumpSpikeState
  const density = densityProp !== undefined ? densityProp : densityState

  // ── Refs ──────────────────────────────────────────────────────────────────
  const containerRef = useRef(null)
  const rendererRef = useRef(null)
  const sceneRef = useRef(null)
  const cameraRef = useRef(null)
  const controlsRef = useRef(null)
  const modelGroupRef = useRef(null)
  const meshRef = useRef(null)
  const originalPositionsRef = useRef(null)
  const originalNormalsRef = useRef(null)
  const animFrameRef = useRef(null)
  const rectAreaLight1Ref = useRef(null)
  const rectAreaLight2Ref = useRef(null)

  // Mutable refs read inside the rAF loop — updated every render
  const paramsRef = useRef({})
  const callbacksRef = useRef({})
  const matColorRef = useRef(rectAreaLightColors?.matColor ?? '#d8dce0')

  paramsRef.current = {
    autoRotate,
    fluidity,
    evolve: evolve * 0.6,
    bumpAmount,
    bumpSpike,
    density,
    matOpacity,
  }
  callbacksRef.current = { setAutoRotate }
  matColorRef.current = rectAreaLightColors?.matColor ?? '#d8dce0'

  // ── Init: renderer, scene, camera, lights, controls, env, model, postfx ──
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.35
    renderer.shadowMap.enabled = true
    renderer.setClearColor(0x000000, 0)
    const rect = container.getBoundingClientRect()
    renderer.setSize(rect.width, rect.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Scene
    const scene = new THREE.Scene()
    scene.environmentIntensity = 1.5
    sceneRef.current = scene

    // Camera
    const camera = new THREE.PerspectiveCamera(45, rect.width / rect.height, 0.1, 1000)
    camera.position.set(0, 0, 5)
    cameraRef.current = camera

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableZoom = true
    controls.enablePan = false
    controls.minDistance = 2
    controls.maxDistance = 10
    controls.addEventListener('start', () => {
      callbacksRef.current.setAutoRotate?.(false)
    })
    controlsRef.current = controls

    // ── Lights ──
    scene.add(new THREE.AmbientLight('#e0ddf0', 0.35))
    scene.add(new THREE.AmbientLight('#e2cece', 0.1))

    const spotLight = new THREE.SpotLight('#ffffff', 60, 40, Math.PI / 4, 0.7, 1.8)
    spotLight.position.set(5, 8, 5)
    spotLight.target.position.set(0, 0, 0)
    spotLight.castShadow = true
    spotLight.shadow.mapSize.set(1024, 1024)
    scene.add(spotLight)
    scene.add(spotLight.target)

    const pl1 = new THREE.PointLight('#FBF3F0', 40, 30, 5)
    pl1.position.set(-4, 2, 3)
    const pl2 = new THREE.PointLight('#FBF3F0', 40, 30, 5)
    pl2.position.set(3, -1, 2)
    const pl3 = new THREE.PointLight('#FBF3F0', 28, 30, 5)
    pl3.position.set(0, 4, -2)
    scene.add(pl1, pl2, pl3)

    const ral1 = new THREE.RectAreaLight(
      rectAreaLightColors?.color1 ?? '#ff997f', 1, 10, 10,
    )
    ral1.position.set(0, 4, 4)
    ral1.rotation.set(-Math.PI / 2, 0, 2)
    scene.add(ral1)
    rectAreaLight1Ref.current = ral1

    const ral2 = new THREE.RectAreaLight(
      rectAreaLightColors?.color2 ?? '#81C0DC', 1, 10, 10,
    )
    ral2.position.set(4, 4, 0)
    ral2.rotation.set(-Math.PI / 2, 0, -2)
    scene.add(ral2)
    rectAreaLight2Ref.current = ral2

    // Shadow ground
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.ShadowMaterial({ opacity: 0.15, color: '#888888' }),
    )
    shadowPlane.rotation.x = -Math.PI / 2
    shadowPlane.position.y = -1.6
    shadowPlane.receiveShadow = true
    scene.add(shadowPlane)

    // Model group
    const modelGroup = new THREE.Group()
    scene.add(modelGroup)
    modelGroupRef.current = modelGroup

    // Load HDR env + GLB model in parallel; add model only after both are ready
    let disposed = false
    const pmremGenerator = new THREE.PMREMGenerator(renderer)
    pmremGenerator.compileEquirectangularShader()

    const hdrPromise = new Promise((resolve) => {
      new RGBELoader().load(
        HDR_URL,
        (texture) => {
          const envMap = pmremGenerator.fromEquirectangular(texture).texture
          texture.dispose()
          pmremGenerator.dispose()
          resolve(envMap)
        },
        undefined,
        () => { pmremGenerator.dispose(); resolve(null) },
      )
    })

    const glbPromise = new Promise((resolve, reject) => {
      new GLTFLoader().load(modelPath, (gltf) => resolve(gltf), undefined, reject)
    })

    Promise.all([hdrPromise, glbPromise]).then(([envMap, gltf]) => {
      if (disposed) return
      if (envMap) scene.environment = envMap

      const model = gltf.scene.clone()
      const box = new THREE.Box3().setFromObject(model)
      const center = new THREE.Vector3()
      box.getCenter(center)
      model.position.sub(center)
      const size = new THREE.Vector3()
      box.getSize(size)
      const maxDim = Math.max(size.x, size.y, size.z)
      if (maxDim > 0) model.scale.setScalar(2.5 / maxDim)

      model.traverse((child) => {
        if (!child.isMesh) return
        child.material = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(matColorRef.current),
          transmission: 0.94,
          thickness: 1.2,
          roughness: 0.05,
          metalness: 0.4,
          ior: 1.0,
          transparent: true,
          opacity: paramsRef.current.matOpacity,
          side: THREE.DoubleSide,
          envMapIntensity: 2.0,
          attenuationColor: new THREE.Color(0x8a90a0),
          attenuationDistance: 0.4,
          sheenColor: new THREE.Color(0xb0c4d0),
          sheenRoughness: 0.35,
        })
        child.castShadow = true
        child.receiveShadow = true
        if (!child.geometry.attributes.normal) child.geometry.computeVertexNormals()
        meshRef.current = child
        originalPositionsRef.current = Float32Array.from(
          child.geometry.attributes.position.array,
        )
        originalNormalsRef.current = Float32Array.from(
          child.geometry.attributes.normal.array,
        )
      })

      modelGroup.add(model)
    })


    // ── Animation loop ──
    let elapsed = 0
    const clock = new THREE.Clock()

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate)
      const delta = clock.getDelta()
      elapsed += delta
      const t = elapsed
      controls.update()

      const p = paramsRef.current
      const group = modelGroupRef.current
      const mesh = meshRef.current
      const origPos = originalPositionsRef.current
      const origNorms = originalNormalsRef.current

      // Environment rotation (evolve)
      if (scene.environment) {
        if (!scene.environmentRotation) {
          scene.environmentRotation = new THREE.Euler(0, 0, 0)
        }
        if (p.evolve > 0) {
          const freq = 1.0 + p.evolve * 2.0
          const freqEnv = freq / 1.2
          const amp = p.evolve * Math.PI
          scene.environmentRotation.set(
            amp * Math.sin(t * freqEnv + 1),
            amp * Math.sin(t * freqEnv + 0.5),
            amp * Math.sin(t * freqEnv + 2),
          )
        } else {
          scene.environmentRotation.set(0, 0, 0)
        }
      }

      // Float, auto-rotate, tilt
      if (group) {
        group.position.y = Math.sin(elapsed * 0.6) * 0.08
        if (p.autoRotate) group.rotation.y += delta * 0.4
        group.rotation.z = Math.sin(t * 0.3) * 0.015
      }

      // Vertex effects
      if (origPos && mesh) {
        const pos = mesh.geometry.attributes.position
        if (pos && origPos.length >= pos.count * 3) {
          const f = p.fluidity * 0.6

          // FLUIDITY
          for (let i = 0; i < pos.count; i++) {
            const ox = origPos[i * 3]
            const oy = origPos[i * 3 + 1]
            const oz = origPos[i * 3 + 2]
            const wave = f > 0
              ? Math.sin(ox * 2.5 + t * f * 3) *
                Math.cos(oz * 2.5 + t * f * 2) * 0.08 * f
              : 0
            pos.setXYZ(i, ox, oy + wave, oz)
          }
          pos.needsUpdate = true
          mesh.geometry.computeVertexNormals()

          // EVOLVE — mesh breathing scale
          if (p.evolve > 0) {
            const freq = 1.0 + p.evolve * 2.0
            const breath = 1 + Math.sin(elapsed * freq) * 0.08
            mesh.scale.set(breath, breath, breath)
          } else {
            mesh.scale.set(1, 1, 1)
          }

          // BUMP — additive displacement along normals
          if (p.bumpAmount > 0 && origNorms) {
            const vertCount = Math.min(
              pos.count,
              Math.floor(origPos.length / 3),
              Math.floor(origNorms.length / 3),
            )
            for (let i = 0; i < vertCount; i++) {
              const nx = origNorms[i * 3]
              const ny = origNorms[i * 3 + 1]
              const nz = origNorms[i * 3 + 2]
              const ox = origPos[i * 3]
              const oy = origPos[i * 3 + 1]
              const oz = origPos[i * 3 + 2]
              const bFreq = p.density
              const n1 = Math.sin(ox * bFreq) * Math.cos(oy * bFreq)
              const n2 = Math.sin(oy * bFreq) * Math.cos(oz * bFreq)
              const n3 = Math.sin(oz * bFreq) * Math.cos(ox * bFreq)
              const raw = (n1 + n2 + n3) / 3
              const shaped = Math.pow(
                Math.max(0, raw),
                1.0 - p.bumpSpike * 0.98,
              )
              const amount = shaped * p.bumpAmount * 0.25
              pos.setXYZ(
                i,
                pos.getX(i) + nx * amount,
                pos.getY(i) + ny * amount,
                pos.getZ(i) + nz * amount,
              )
            }
            pos.needsUpdate = true
            mesh.geometry.computeVertexNormals()
          }

          // When bump is off, reset positions to fluidity-only
          if (p.bumpAmount === 0) {
            for (let i = 0; i < pos.count; i++) {
              const ox = origPos[i * 3]
              const oy = origPos[i * 3 + 1]
              const oz = origPos[i * 3 + 2]
              const wave = f > 0
                ? Math.sin(ox * 2.5 + t * f * 3) *
                  Math.cos(oz * 2.5 + t * f * 2) * 0.08 * f
                : 0
              pos.setXYZ(i, ox, oy + wave, oz)
            }
            pos.needsUpdate = true
            mesh.geometry.computeVertexNormals()
          }
        }
      }

      renderer.render(scene, camera)
    }

    animate()

    // Resize
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect
        if (w > 0 && h > 0) {
          camera.aspect = w / h
          camera.updateProjectionMatrix()
          renderer.setSize(w, h)
        }
      }
    })
    ro.observe(container)

    // Cleanup
    return () => {
      disposed = true
      ro.disconnect()
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      controls.dispose()
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
      modelGroup.traverse((child) => {
        if (child.isMesh) {
          child.geometry?.dispose()
          child.material?.dispose()
        }
      })
      rendererRef.current = null
      sceneRef.current = null
      cameraRef.current = null
      controlsRef.current = null
      modelGroupRef.current = null
      meshRef.current = null
      originalPositionsRef.current = null
      originalNormalsRef.current = null
      rectAreaLight1Ref.current = null
      rectAreaLight2Ref.current = null
    }
  }, [modelPath])

  // ── Sync material color / opacity when color tab or slider changes ────────
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh?.material) return
    const matColor = rectAreaLightColors?.matColor ?? '#d8dce0'
    mesh.material.color.set(matColor)
    mesh.material.opacity = matOpacity
    mesh.material.needsUpdate = true
  }, [rectAreaLightColors?.matColor, matOpacity])

  // ── Sync RectAreaLight colors when color tab changes ──────────────────────
  useEffect(() => {
    if (rectAreaLight1Ref.current && rectAreaLightColors?.color1) {
      rectAreaLight1Ref.current.color.set(rectAreaLightColors.color1)
    }
    if (rectAreaLight2Ref.current && rectAreaLightColors?.color2) {
      rectAreaLight2Ref.current.color.set(rectAreaLightColors.color2)
    }
  }, [rectAreaLightColors?.color1, rectAreaLightColors?.color2])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className={className}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        zIndex: 1,
        cursor: isDragging ? 'grabbing' : 'grab',
        ...style,
      }}
    >
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%' }}
        onPointerDown={() => setIsDragging(true)}
        onPointerUp={() => setIsDragging(false)}
        onPointerLeave={() => setIsDragging(false)}
      />

      {/* Apple-style frosted glass — main blur + saturation boost */}
      {canvasBlurPx > 0 && (
        <div style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 10,
          backdropFilter: `blur(${canvasBlurPx * 1.0}px) contrast(${1 + canvasBlurPx * 0.05}) brightness(${1.02 + canvasBlurPx * 0.02})`,
          WebkitBackdropFilter: `blur(${canvasBlurPx * 1.0}px) contrast(${1 + canvasBlurPx * 0.05}) brightness(${1.02 + canvasBlurPx * 0.02})`,
          background: `rgba(255, 255, 255, ${canvasBlurPx * 0.008})`,
          transition: 'backdrop-filter 0.2s ease',
        }} />
      )}

      {/* Edge vignette blur — heavier blur fading in from edges */}
      {canvasBlurPx > 0 && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 10,
            backdropFilter: `blur(${canvasBlurPx * 2.8}px) saturate(1.2)`,
            WebkitBackdropFilter: `blur(${canvasBlurPx * 2.8}px) saturate(1.2)`,
            maskImage: 'radial-gradient(ellipse 88% 88% at 50% 50%, transparent 40%, black 90%)',
            WebkitMaskImage: 'radial-gradient(ellipse 88% 88% at 50% 50%, transparent 40%, black 90%)',
            transition: 'backdrop-filter 0.2s ease',
          }}
        />
      )}

      {/* Subtle noise texture — very faint, Apple-level subtlety */}
      {canvasBlurPx > 0 && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 11,
            opacity: Math.min(canvasBlurPx * 0.018, 0.12),
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch' result='noise'/%3E%3CfeColorMatrix in='noise' type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'repeat',
            backgroundSize: '512px 512px',
            mixBlendMode: 'soft-light',
            transition: 'opacity 0.2s ease',
          }}
        />
      )}
    </div>
  )
}
