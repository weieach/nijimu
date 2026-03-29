import React, {
  useRef,
  useEffect,
  useLayoutEffect,
  useState,
  Suspense,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  useGLTF,
  OrbitControls,
  Environment,
  ContactShadows,
} from "@react-three/drei";
import * as THREE from "three";
import { getShapeBuildEvolvePhase } from "../hooks/useOscillatingEvolve";

// Available 3D model paths
export const MODEL_PATHS = [
  "https://raw.githubusercontent.com/Noyok1vas/figbuildAssets/main/Form_01.glb",
  "https://raw.githubusercontent.com/Noyok1vas/figbuildAssets/main/Form_02.glb",
  "https://raw.githubusercontent.com/Noyok1vas/figbuildAssets/main/Form_03.glb",
];

// Glass material presets — 5 warmth choices (cool → warm)
export interface MaterialPreset {
  id: string;
  matColor: string;
  matAttenuationColor: string;
  matSheenColor: string;
}

export const MATERIAL_PRESETS: MaterialPreset[] = [
  {
    id: "neutral",
    matColor: "#d8dce0",
    matAttenuationColor: "#b8bcc4",
    matSheenColor: "#b0c4d0",
  },
  {
    id: "purple",
    matColor: "#E5CCE5",
    matAttenuationColor: "#BEA8C8",
    matSheenColor: "#B0BCEA",
  },
  {
    id: "blue",
    matColor: "#C4C7EC",
    matAttenuationColor: "#9A9AB4",
    matSheenColor: "#898B8E",
  },
  {
    id: "green",
    matColor: "#B4E9EB",
    matAttenuationColor: "#98C3C4",
    matSheenColor: "#90DEE1",
  },
  {
    id: "red",
    matColor: "#F7E8E8",
    matAttenuationColor: "#D2B7B7",
    matSheenColor: "#F0DADA",
  },
];

// Derive a darkened hex colour for fallback attenuation / sheen
function scaledHex(hex: string, factor: number): string {
  if (!hex.startsWith("#") || hex.length < 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const clamp = (v: number) =>
    Math.min(255, Math.max(0, Math.round(v * factor)));
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g)
    .toString(16)
    .padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`;
}

// ─── 3D Model ────────────────────────────────────────────────────────────────

interface ModelProps {
  modelPath: string;
  matColor: string;
  matAttenuationColor: string;
  matSheenColor: string;
  autoRotate: boolean;
  floatAmplitude?: number;
  fluidity?: number;
  evolve?: number;
  bumpAmount?: number;
  bumpSpike?: number;
  density?: number;
  matOpacity?: number;
  /** Normalized max bounding-box dimension after centering (smaller = more zoom-out in frame). */
  fitTargetSize?: number;
  /** When true, evolve breathing/env motion is driven inside useFrame (shape-build oscillation). */
  oscillatingEvolve?: boolean;
}

function Model({
  modelPath,
  matColor,
  matAttenuationColor,
  matSheenColor,
  autoRotate,
  floatAmplitude = 0.08,
  fluidity = 0,
  evolve = 0,
  bumpAmount = 0,
  bumpSpike = 0,
  density = 200,
  matOpacity = 0.1,
  fitTargetSize = 2.5,
  oscillatingEvolve = false,
}: ModelProps) {
  const { scene } = useGLTF(modelPath);
  const { scene: threeScene } = useThree();
  const groupRef = useRef<THREE.Group>(null!);
  const clock = useRef(0);
  const originalPositions = useRef<Float32Array | null>(null);
  const originalNormals = useRef<Float32Array | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const maxDimRef = useRef<number>(1);
  const oscillatingEvolveRef = useRef(oscillatingEvolve);
  useLayoutEffect(() => {
    oscillatingEvolveRef.current = oscillatingEvolve;
  }, [oscillatingEvolve]);

  const matTransmission = 0.94;
  const matThickness = 3;
  const matRoughness = 0.1;
  const matMetalness = 0.4;
  const matIor = 1.45;
  const matEnvMapIntensity = 0.88;
  const matAttenuationDistance = 0.55;
  const matSheenRoughness = 0.35;

  // Layout + mesh capture when the glTF path changes.
  // Reset transform first so cached glTF + StrictMode double-invoke stay idempotent.
  useEffect(() => {
    scene.position.set(0, 0, 0);
    scene.rotation.set(0, 0, 0);
    scene.scale.set(1, 1, 1);

    const box = new THREE.Box3().setFromObject(scene);
    const center = new THREE.Vector3();
    box.getCenter(center);
    scene.position.sub(center);

    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      scene.scale.setScalar(fitTargetSize / maxDim);
      maxDimRef.current = maxDim;
    }

    scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      const prev = mesh.material as THREE.Material | null;
      if (prev && typeof prev.dispose === "function") prev.dispose();
      mesh.material = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(matColor),
        transmission: matTransmission,
        thickness: matThickness,
        roughness: matRoughness,
        metalness: matMetalness,
        ior: matIor,
        transparent: true,
        opacity: matOpacity,
        side: THREE.DoubleSide,
        envMapIntensity: matEnvMapIntensity,
        attenuationColor: new THREE.Color(matAttenuationColor),
        attenuationDistance: matAttenuationDistance,
        sheenColor: new THREE.Color(matSheenColor),
        sheenRoughness: matSheenRoughness,
      });
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      meshRef.current = mesh;

      const geom = mesh.geometry as THREE.BufferGeometry;
      if (!geom.attributes.normal) geom.computeVertexNormals();
      originalPositions.current = Float32Array.from(
        geom.attributes.position.array as Float32Array,
      );
      originalNormals.current = Float32Array.from(
        geom.attributes.normal.array as Float32Array,
      );
    });
  }, [modelPath, scene, fitTargetSize]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tint update — separate effect so we never re-apply center/scale on preset switch
  useEffect(() => {
    scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const m = (child as THREE.Mesh).material as THREE.MeshPhysicalMaterial;
      if (!m?.isMeshPhysicalMaterial) return;
      m.color.set(matColor);
      m.opacity = matOpacity;
      m.attenuationColor.set(matAttenuationColor);
      m.sheenColor.set(matSheenColor);
      m.needsUpdate = true;
    });
  }, [scene, matColor, matAttenuationColor, matSheenColor, matOpacity]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    clock.current += delta;
    const t = clock.current;

    // Evolve: read oscillation from ref so useFrame never keeps a stale prop closure.
    const osc = oscillatingEvolveRef.current;
    const e = osc ? getShapeBuildEvolvePhase() * 0.6 : evolve;
    // Shape-build: only subtle breathing (env motion carries most of the “evolve” feel).
    const breathAmp = osc ? 0.028 : 0.08;

    // Environment rotation (evolve)
    if (threeScene.environment) {
      const envRot = (threeScene as any).environmentRotation;
      if (!envRot) (threeScene as any).environmentRotation = new THREE.Euler(0, 0, 0);
      if (e > 0) {
        const freq = 1.0 + e * 2.0;
        const freqEnv = freq / 1.2;
        const amp = e * Math.PI;
        (threeScene as any).environmentRotation.set(
          amp * Math.sin(t * freqEnv + 1),
          amp * Math.sin(t * freqEnv + 0.5),
          amp * Math.sin(t * freqEnv + 2),
        );
      } else {
        (threeScene as any).environmentRotation.set(0, 0, 0);
      }
    }

    // Float, auto-rotate, subtle tilt
    groupRef.current.position.y = Math.sin(t * 0.6) * floatAmplitude;
    if (autoRotate) groupRef.current.rotation.y += delta * 0.07;
    groupRef.current.rotation.z = Math.sin(t * 0.3) * 0.015;

    // Vertex effects: fluidity wave + surface bump — one pass from original positions
    if (
      originalPositions.current &&
      meshRef.current?.geometry?.attributes?.position
    ) {
      const pos = meshRef.current.geometry.attributes.position;
      const orig = originalPositions.current;
      const norms = originalNormals.current;
      const f = fluidity * 0.6;
      const useBump = !!norms && bumpAmount > 1e-9;

      for (let i = 0; i < pos.count; i++) {
        const ox = orig[i * 3];
        const oy = orig[i * 3 + 1];
        const oz = orig[i * 3 + 2];
        const wave =
          f > 0
            ? Math.sin(ox * 2.5 + t * f * 3) *
              Math.cos(oz * 2.5 + t * f * 2) *
              0.08 *
              f
            : 0;
        let px = ox;
        let py = oy + wave;
        let pz = oz;

        if (useBump && norms) {
          const nx = norms[i * 3];
          const ny = norms[i * 3 + 1];
          const nz = norms[i * 3 + 2];
          const n1 = Math.sin(ox * density) * Math.cos(oy * density);
          const n2 = Math.sin(oy * density) * Math.cos(oz * density);
          const n3 = Math.sin(oz * density) * Math.cos(ox * density);
          const raw = (n1 + n2 + n3) / 3;
          const shaped = Math.pow(
            Math.max(0, raw),
            1.0 - bumpSpike * 0.98,
          );
          const amount = shaped * bumpAmount * 0.25;
          px += nx * amount;
          py += ny * amount;
          pz += nz * amount;
        }

        pos.setXYZ(i, px, py, pz);
      }
      pos.needsUpdate = true;
      meshRef.current.geometry.computeVertexNormals();
    }

    // Evolve: breathe the whole model (group), not a single mesh — multi-mesh GLBs were invisible before.
    if (groupRef.current) {
      if (e > 0) {
        const freq = 1.0 + e * 2.0;
        const breath = 1 + Math.sin(t * freq) * breathAmp;
        groupRef.current.scale.setScalar(breath);
      } else {
        groupRef.current.scale.set(1, 1, 1);
      }
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  );
}

// ─── Fallback while loading ───────────────────────────────────────────────────

function Loader() {
  return (
    <mesh>
      <sphereGeometry args={[0.3, 16, 16]} />
      <meshBasicMaterial color="#aaaaaa" wireframe />
    </mesh>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SceneViewerProps {
  modelPath?: string;
  className?: string;
  style?: React.CSSProperties;
  autoRotate?: boolean;
  onAutoRotateChange?: (value: boolean) => void;
  canvasBlurPx?: number;
  matOpacity?: number;
  fluidity?: number;
  evolve?: number;
  bumpAmount?: number;
  bumpSpike?: number;
  density?: number;
  ready?: boolean;
  /** Tighter framing for small fixed viewports (cards, connect flow, thumbnails). */
  constrainedViewport?: boolean;
  /** Legacy: colour passed as raw hex for the glass tint + rect area lights */
  rectAreaLightColors?: {
    color1?: string;
    color2?: string;
    matColor?: string;
  };
  /** New: index into MATERIAL_PRESETS (0-4). Takes priority over rectAreaLightColors. */
  matPresetIndex?: number;
  /** Shape-build flow: 10s oscillating evolve inside the render loop (env + subtle scale). */
  shapeBuildOscillatingEvolve?: boolean;
}

// ─── Main Scene ───────────────────────────────────────────────────────────────

export function SceneViewer({
  modelPath = MODEL_PATHS[0],
  className = "",
  style = {},
  autoRotate: autoRotateProp,
  onAutoRotateChange,
  canvasBlurPx = 6,
  matOpacity = 0.4,
  fluidity = 0,
  evolve = 0,
  bumpAmount = 0,
  bumpSpike = 0,
  density = 200,
  ready: readyProp,
  constrainedViewport = false,
  rectAreaLightColors,
  matPresetIndex,
  shapeBuildOscillatingEvolve = false,
}: SceneViewerProps) {
  // Camera settings calibrated so fitTargetSize fills ~60-65% of viewport height
  // (whole shape visible with breathing room). Formula: cameraZ = fitTargetSize / (2*tan(fov/2) * 0.65)
  const fitTargetSize = constrainedViewport ? 2.2 : 2.5;
  const cameraFov = 45;
  const cameraZ = constrainedViewport ? 4.2 : 4.8;
  const orbitMin = constrainedViewport ? 2 : 2;
  const orbitMax = constrainedViewport ? 12 : 12;

  const [autoRotateInternal, setAutoRotateInternal] = useState(true);
  const autoRotate =
    autoRotateProp !== undefined ? autoRotateProp : autoRotateInternal;
  const setAutoRotate = onAutoRotateChange ?? setAutoRotateInternal;

  const [isDragging, setIsDragging] = useState(false);

  const ready = readyProp !== undefined ? readyProp : true;

  // Shape-build flow: never use the `evolve` prop for motion — Model uses getShapeBuildEvolvePhase() in useFrame.
  const modelStaticEvolveScaled = shapeBuildOscillatingEvolve ? 0 : evolve * 0.6;

  // Resolve material colours: matPresetIndex → full preset, else fall back to
  // rectAreaLightColors.matColor with auto-derived attenuation/sheen.
  const preset =
    matPresetIndex !== undefined
      ? (MATERIAL_PRESETS[matPresetIndex] ?? MATERIAL_PRESETS[0])
      : null;

  const matColor =
    preset?.matColor ??
    rectAreaLightColors?.matColor ??
    MATERIAL_PRESETS[0].matColor;
  const matAttenuationColor =
    preset?.matAttenuationColor ?? scaledHex(matColor, 0.85);
  const matSheenColor = preset?.matSheenColor ?? scaledHex(matColor, 0.9);

  const containerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    position: "relative",
    zIndex: 1,
    cursor: isDragging ? "grabbing" : "grab",
    ...style,
  };

  // Don't mount the Canvas until the parent signals ready (avoids iframe conflicts)
  if (!ready) return <div className={className} style={containerStyle} />;

  return (
    <div className={className} style={containerStyle}>
      <Canvas
        camera={{ position: [0, 0, cameraZ], fov: cameraFov, near: 0.1, far: 100 }}
        style={{ background: "transparent" }}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        flat={false}
        linear={false}
        onPointerDown={() => setIsDragging(true)}
        onPointerUp={() => setIsDragging(false)}
        onPointerLeave={() => setIsDragging(false)}
      >
        <ambientLight intensity={5} color="#758FDF" />
        <ambientLight intensity={2} color="#989BE8" />
        <directionalLight
          position={[6, 14, 8]}
          intensity={4.5}
          color="#ffffff"
        />
        <directionalLight
          position={[-5, 2, -3]}
          intensity={0.1}
          color="#758FDF"
        />
        <pointLight
          position={[-4, 2, 3]}
          intensity={1.75}
          color="#e2cece"
          distance={90}
          decay={0.1}
        />
        <pointLight
          position={[3, -1, 2]}
          intensity={1.45}
          color="#b0a8c4"
          distance={90}
          decay={0.1}
        />
        <pointLight
          position={[0, 4, -2]}
          intensity={1.15}
          color="#b0d0cc"
          distance={90}
          decay={0.1}
        />
        <Environment preset="city" environmentIntensity={1.5} />
        <ContactShadows
          position={[0, -1.6, 0]}
          opacity={0.26}
          scale={10}
          blur={3}
          near={0.1}
          far={22}
          resolution={1024}
          color="#555555"
        />
        <Suspense fallback={<Loader />}>
          <Model
            key={modelPath}
            modelPath={modelPath}
            matColor={matColor}
            matAttenuationColor={matAttenuationColor}
            matSheenColor={matSheenColor}
            autoRotate={autoRotate}
            fluidity={fluidity}
            evolve={modelStaticEvolveScaled}
            oscillatingEvolve={shapeBuildOscillatingEvolve}
            bumpAmount={bumpAmount}
            bumpSpike={bumpSpike}
            density={density}
            matOpacity={matOpacity}
            fitTargetSize={fitTargetSize}
          />
        </Suspense>
        <OrbitControls
          enableZoom={true}
          enablePan={false}
          minDistance={orbitMin}
          maxDistance={orbitMax}
          autoRotate={false}
          onStart={() => setAutoRotate(false)}
        />
      </Canvas>

      {/* Frosted glass blur — main layer */}
      {canvasBlurPx > 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 10,
            backdropFilter: `blur(${canvasBlurPx * 1.0}px) contrast(${
              1 + canvasBlurPx * 0.05
            }) brightness(${1.02 + canvasBlurPx * 0.02})`,
            WebkitBackdropFilter: `blur(${canvasBlurPx * 1.0}px) contrast(${
              1 + canvasBlurPx * 0.05
            }) brightness(${1.02 + canvasBlurPx * 0.02})`,
            background: `rgba(255, 255, 255, ${canvasBlurPx * 0.008})`,
            transition: "backdrop-filter 0.2s ease",
          }}
        />
      )}

      {/* Edge vignette blur — heavier blur fading in from edges */}
      {canvasBlurPx > 0 && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 10,
            backdropFilter: `blur(${canvasBlurPx * 2.8}px) saturate(1.2)`,
            WebkitBackdropFilter: `blur(${canvasBlurPx * 2.8}px) saturate(1.2)`,
            maskImage:
              "radial-gradient(ellipse 88% 88% at 50% 50%, transparent 40%, black 90%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 88% 88% at 50% 50%, transparent 40%, black 90%)",
            transition: "backdrop-filter 0.2s ease",
          }}
        />
      )}

      {/* Subtle noise texture */}
      {canvasBlurPx > 0 && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 11,
            opacity: Math.min(canvasBlurPx * 0.018, 0.12),
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch' result='noise'/%3E%3CfeColorMatrix in='noise' type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            backgroundRepeat: "repeat",
            backgroundSize: "512px 512px",
            mixBlendMode: "soft-light",
            transition: "opacity 0.2s ease",
          }}
        />
      )}
    </div>
  );
}
