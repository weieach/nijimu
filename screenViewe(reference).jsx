import { useRef, useEffect, useState, Suspense } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF, OrbitControls, Environment, ContactShadows } from '@react-three/drei'
import { EffectComposer, DepthOfField } from '@react-three/postprocessing'
import * as THREE from 'three'

const FIGBUILD_ASSETS_BASE =
  'https://raw.githubusercontent.com/Noyok1vas/figbuildAssets/main'

export const FORM_MODEL_URLS = [
  `${FIGBUILD_ASSETS_BASE}/Form_01.glb`,
  `${FIGBUILD_ASSETS_BASE}/Form_02.glb`,
  `${FIGBUILD_ASSETS_BASE}/Form_03.glb`,
]

// ─── 3D Model ────────────────────────────────────────────────────────────────

function Model({
  modelPath,
  autoRotate,
  floatAmplitude = 0.08,
  fluidity = 0,
  evolve = 0,
  bumpAmount = 0,
  bumpSpike = 0,
  density = 200,
  matOpacity = 0.1,
}) {
  const { scene } = useGLTF(modelPath)
  const { scene: threeScene } = useThree()
  const groupRef = useRef()
  const clock = useRef(0)
  const originalPositions = useRef(null)
  const originalNormals = useRef(null)
  const meshRef = useRef(null)
  const modelBounds = useRef({ minX: -1, maxX: 1 })

  // 材质参数：改下面数值后保存，effect 会因依赖变化重新跑并应用新材质
  const matColor = 0xd8dce0
  const matTransmission = 0.94
  const matThickness = 0.5
  const matRoughness = 0.2
  const matMetalness = 0.4
  const matIor = 1.45
  const matTransparent = true
  const matEnvMapIntensity = 0.88
  const matAttenuationColor = 0xb8bcc4
  const matAttenuationDistance = 0.55
  const matSheenColor = 0xb0c4d0
  const matSheenRoughness = 0.35

  useEffect(() => {
    const box = new THREE.Box3().setFromObject(scene)
    const center = new THREE.Vector3()
    box.getCenter(center)
    scene.position.sub(center)

    const size = new THREE.Vector3()
    box.getSize(size)
    modelBounds.current = { minX: -size.x / 2, maxX: size.x / 2 }
    const maxDim = Math.max(size.x, size.y, size.z)
    if (maxDim > 0) {
      scene.scale.setScalar(2.5 / maxDim)
    }

    scene.traverse((child) => {
      if (child.isMesh) {
        const mat = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(matColor),
          transmission: matTransmission,
          thickness: matThickness,
          roughness: matRoughness,
          metalness: matMetalness,
          ior: matIor,
          transparent: matTransparent,
          opacity: matOpacity,
          side: THREE.DoubleSide,
          envMapIntensity: matEnvMapIntensity,
          attenuationColor: new THREE.Color(matAttenuationColor),
          attenuationDistance: matAttenuationDistance,
          sheenColor: new THREE.Color(matSheenColor),
          sheenRoughness: matSheenRoughness,
        })
        // 不设 mat.envMap，让渲染器用 scene.environment + scene.environmentRotation，ENV 旋转滑块才生效
        child.material = mat
        child.castShadow = true
        child.receiveShadow = true
        meshRef.current = child
        if (!child.geometry.attributes.normal) child.geometry.computeVertexNormals()
        originalPositions.current = Float32Array.from(
          child.geometry.attributes.position.array
        )
        originalNormals.current = Float32Array.from(
          child.geometry.attributes.normal.array
        )
      }
    })
  }, [
    scene,
    threeScene,
    matColor,
    matTransmission,
    matThickness,
    matRoughness,
    matMetalness,
    matIor,
    matTransparent,
    matOpacity,
    matEnvMapIntensity,
    matAttenuationColor,
    matAttenuationDistance,
    matSheenColor,
    matSheenRoughness,
  ])

  useFrame((_, delta) => {
    if (!groupRef.current) return
    clock.current += delta
    const t = clock.current
    if (threeScene.environment) {
      if (!threeScene.environmentRotation) threeScene.environmentRotation = new THREE.Euler(0, 0, 0)
      if (evolve > 0) {
        // 环境光 swing：周期为模型呼吸的 1.2 倍（频率 = freq/1.2），三轴等幅
        const minFreq = 1.0
        const maxFreq = 3.0
        const freq = minFreq + evolve * (maxFreq - minFreq)
        const freqEnv = freq / 1.2
        const swingAmplitude = evolve * Math.PI
        const swingX = swingAmplitude * Math.sin(t * freqEnv + 1)
        const swingY = swingAmplitude * Math.sin(t * freqEnv + 0.5)
        const swingZ = swingAmplitude * Math.sin(t * freqEnv + 2)
        threeScene.environmentRotation.set(swingX, swingY, swingZ)
      } else {
        threeScene.environmentRotation.set(0, 0, 0)
      }
    }
    groupRef.current.position.y = Math.sin(clock.current * 0.6) * floatAmplitude
    if (autoRotate) groupRef.current.rotation.y += delta * 0.4
    groupRef.current.rotation.z = Math.sin(t * 0.3) * 0.015

    // STEP 1: FLUIDITY — keep exactly as is
    if (originalPositions.current && meshRef.current) {
      const pos = meshRef.current.geometry.attributes.position
      const orig = originalPositions.current
      for (let i = 0; i < pos.count; i++) {
        const ox = orig[i * 3]
        const oy = orig[i * 3 + 1]
        const oz = orig[i * 3 + 2]
        const f = fluidity * 0.6
        const wave = f > 0
          ? Math.sin(ox * 2.5 + t * f * 3) *
            Math.cos(oz * 2.5 + t * f * 2) * 0.08 * f
          : 0
        pos.setXYZ(i, ox, oy + wave, oz)
      }
      pos.needsUpdate = true
      meshRef.current.geometry.computeVertexNormals()
    }

    // STEP 2: EVOLVE — mesh scale only, no vertex manipulation
    if (meshRef.current) {
      if (evolve > 0) {
        const minFreq = 1.0   // slider=0 时最慢呼吸
        const maxFreq = 3.0   // slider=1 时最快呼吸
        const freq = minFreq + evolve * (maxFreq - minFreq)
        const breath = 1 + Math.sin(clock.current * freq) * 0.08
        meshRef.current.scale.set(breath, breath, breath)
      } else {
        meshRef.current.scale.set(1, 1, 1)
      }
    }

    // STEP 3: Static surface bump — additive on current pos (stacks with FLUIDITY)
    if (
      meshRef.current?.geometry?.attributes?.position &&
      originalPositions.current &&
      originalNormals.current
    ) {
      const pos = meshRef.current.geometry.attributes.position
      const orig = originalPositions.current
      const norms = originalNormals.current

      for (let i = 0; i < pos.count; i++) {
        const ox = orig[i * 3]
        const oy = orig[i * 3 + 1]
        const oz = orig[i * 3 + 2]
        const nx = norms[i * 3]
        const ny = norms[i * 3 + 1]
        const nz = norms[i * 3 + 2]

        if (bumpAmount > 0) {
          const freq = density
          const n1 = Math.sin(ox * freq) * Math.cos(oy * freq)
          const n2 = Math.sin(oy * freq) * Math.cos(oz * freq)
          const n3 = Math.sin(oz * freq) * Math.cos(ox * freq)
          const raw = (n1 + n2 + n3) / 3
          const rectified = Math.max(0, raw)
          const power = 1.0 - bumpSpike * 0.98
          const shaped = Math.pow(rectified, power)
          const amount = shaped * bumpAmount * 0.25

          pos.setXYZ(i,
            pos.getX(i) + nx * amount,
            pos.getY(i) + ny * amount,
            pos.getZ(i) + nz * amount
          )
        }
      }
      pos.needsUpdate = true
      meshRef.current.geometry.computeVertexNormals()
    }

    // When bumpAmount = 0: remove bump only (keep FLUIDITY)
    if (bumpAmount === 0 && meshRef.current && originalPositions.current) {
      const pos = meshRef.current.geometry.attributes.position
      const orig = originalPositions.current
      const f = fluidity * 0.6
      const wave = (i) => {
        const ox = orig[i * 3]
        const oz = orig[i * 3 + 2]
        return f > 0
          ? Math.sin(ox * 2.5 + t * f * 3) * Math.cos(oz * 2.5 + t * f * 2) * 0.08 * f
          : 0
      }
      for (let i = 0; i < pos.count; i++) {
        pos.setXYZ(i, orig[i * 3], orig[i * 3 + 1] + wave(i), orig[i * 3 + 2])
      }
      pos.needsUpdate = true
      meshRef.current.geometry.computeVertexNormals()
    }

  })

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  )
}

// ─── Physical lights for transmission ────────────────────────────────────────

function PhysicalLights() {
  const { gl } = useThree()
  useEffect(() => {
    gl.physicallyCorrectLights = true
  }, [gl])
  return null
}

// ─── Fallback while loading ───────────────────────────────────────────────────

function Loader() {
  return (
    <mesh>
      <sphereGeometry args={[0.3, 16, 16]} />
      <meshBasicMaterial color="#aaaaaa" wireframe />
    </mesh>
  )
}

// ─── Main Scene ───────────────────────────────────────────────────────────────

export default function SceneViewer({
  modelPath: modelPathProp,
  className = '',
  style = {},
  autoRotate: autoRotateProp,
  onAutoRotateChange,
  canvasBlurPx = 6,
  matOpacity = 0.1,
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
}) {
  const [autoRotateInternal, setAutoRotateInternal] = useState(true)
  const autoRotate = autoRotateProp !== undefined ? autoRotateProp : autoRotateInternal
  const setAutoRotate = onAutoRotateChange ?? setAutoRotateInternal
  const [isDragging, setIsDragging] = useState(false)
  const [fluidityState, setFluidityState] = useState(0)
  const [evolveState, setEvolveState] = useState(0)
  const [bumpAmountState, setBumpAmountState] = useState(0)
  const [bumpSpikeState, setBumpSpikeState] = useState(0)
  const [densityState, setDensityState] = useState(200)
  const [formModelIndex, setFormModelIndex] = useState(0)
  const fluidity = fluidityProp !== undefined ? fluidityProp : fluidityState
  const setFluidity = setFluidityProp ?? setFluidityState
  const evolve = evolveProp !== undefined ? evolveProp : evolveState
  const setEvolve = setEvolveProp ?? setEvolveState
  const bumpAmount = bumpAmountProp !== undefined ? bumpAmountProp : bumpAmountState
  const setBumpAmount = setBumpAmountProp ?? setBumpAmountState
  const bumpSpike = bumpSpikeProp !== undefined ? bumpSpikeProp : bumpSpikeState
  const setBumpSpike = setBumpSpikeProp ?? setBumpSpikeState
  const density = densityProp !== undefined ? densityProp : densityState
  const setDensity = setDensityProp ?? setDensityState

  const resolvedModelPath =
    modelPathProp ?? FORM_MODEL_URLS[formModelIndex] ?? FORM_MODEL_URLS[0]

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
      {!modelPathProp && (
        <div
          role="tablist"
          aria-label="Form variant"
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            zIndex: 20,
            display: 'flex',
            gap: 6,
            pointerEvents: 'auto',
          }}
        >
          {FORM_MODEL_URLS.map((url, i) => (
            <button
              key={url}
              type="button"
              role="tab"
              aria-selected={formModelIndex === i}
              onClick={() => setFormModelIndex(i)}
              style={{
                padding: '4px 8px',
                fontSize: 10,
                letterSpacing: '0.06em',
                fontFamily: 'inherit',
                color: '#252019',
                background:
                  formModelIndex === i
                    ? 'rgba(255,255,255,0.45)'
                    : 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(37, 33, 28, 0.45)',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              FORM {String(i + 1).padStart(2, '0')}
            </button>
          ))}
        </div>
      )}
      <Canvas
        camera={{ position: [0, 0, 1], fov: 45 }}
        style={{ background: 'transparent' }}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        flat={false}
        linear={false}
        onPointerDown={() => setIsDragging(true)}
        onPointerUp={() => setIsDragging(false)}
        onPointerLeave={() => setIsDragging(false)}
      >
        <PhysicalLights />
        <ambientLight intensity={0.5} color="#dce0f2" />
        <ambientLight intensity={0.25} color="#e2cece" />
        <ambientLight intensity={0.2} color="#b0d0cc" />
        <ambientLight intensity={0.2} color="#b0a8c4" />
        <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow />
        <directionalLight position={[-5, 2, -3]} intensity={0.6} color="#b4c8f0" />
        <pointLight position={[-4, 2, 3]} intensity={2.2} color="#e2cece" distance={90} decay={0.1} />
        <pointLight position={[3, -1, 2]} intensity={1.9} color="#b0a8c4" distance={90} decay={0.1} />
        <pointLight position={[0, 4, -2]} intensity={1.5} color="#b0d0cc" distance={90} decay={0.1} />
        <Environment preset="city" environmentIntensity={1.1} />
        <ContactShadows
          position={[0, -1.6, 0]}
          opacity={0.15}
          scale={6}
          blur={3}
          far={1.5}
          color="#888888"
        />
        <Suspense fallback={<Loader />}>
          <Model
            key={resolvedModelPath}
            modelPath={resolvedModelPath}
            autoRotate={autoRotate}
            fluidity={fluidity}
            evolve={evolve * 0.6}
            bumpAmount={bumpAmount}
            bumpSpike={bumpSpike}
            density={density}
            matOpacity={matOpacity}
          />
        </Suspense>
        <OrbitControls
          enableZoom={true}
          enablePan={false}
          minDistance={2}
          maxDistance={10}
          autoRotate={false}
          onStart={() => setAutoRotate(false)}
        />
        <EffectComposer>
        
          <DepthOfField
  focusDistance={0.01}      // 更小 = 焦点更近
  focalLength={0.1}        // 短焦，景深更浅
  bokehScale={4}
  focusRange={0.05}
  target={[0, 0, 1.5]}       // 新增：焦点指向模型前方
  height={700}
/>
        </EffectComposer>
      </Canvas>

      <div style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 10,
        backdropFilter: `blur(${canvasBlurPx * 1.5}px) brightness(${1 + canvasBlurPx * 0.012}) contrast(${1 + canvasBlurPx * 0.015})`,
        WebkitBackdropFilter: `blur(${canvasBlurPx * 1.5}px) brightness(${1 + canvasBlurPx * 0.012}) contrast(${1 + canvasBlurPx * 0.015})`,
        background: `rgba(255, 255, 255, ${canvasBlurPx * 0.02})`,
        transition: 'backdrop-filter 0.15s ease',
      }} />
      {/* Edge blur: extra blur toward the edges */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 10,
          backdropFilter: `blur(${canvasBlurPx * 2.5}px)`,
          WebkitBackdropFilter: `blur(${canvasBlurPx * 2.5}px)`,
          maskImage: 'radial-gradient(ellipse 90% 90% at 50% 50%, transparent 42%, black 88%)',
          WebkitMaskImage: 'radial-gradient(ellipse 90% 90% at 50% 50%, transparent 42%, black 88%)',
          transition: 'backdrop-filter 0.15s ease',
        }}
      />
      {/* Noise overlay: stronger when blur is higher */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 11,
          opacity: canvasBlurPx * 0.045,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch' result='noise'/%3E%3CfeColorMatrix in='noise' type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '256px 256px',
          mixBlendMode: 'overlay',
          transition: 'opacity 0.15s ease',
        }}
      />
    </div>
  )
}

FORM_MODEL_URLS.forEach((url) => useGLTF.preload(url))
