import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { MODEL_PATHS } from "./SceneViewer";

/** Soft line — a touch lighter than chrome so the form reads on the haze. */
const LINE_COLOR = "#8e8e9a";
/** Slow turn — close to SceneViewer's auto-rotate, no bob. */
const ROTATE_SPEED = 0.14;
/** Normalized max dimension after centering. */
const FIT_SIZE = 2.2;
/** How many contour lines the light draws across the form. */
const BAND_COUNT = 7;
/** Line weight, in screen-derivative units — below 1 draws finer than a pixel. */
const LINE_WEIGHT = 0.55;
/** How square-on the surface has to turn away before it reads as silhouette —
    higher keeps the outline to the true edge instead of shading a wide band. */
const SILHOUETTE_THRESHOLD = 0.26;
/** Where the light stands, in view space — upper left, slightly in front. */
const LIGHT_DIRECTION = new THREE.Vector3(-0.45, 0.75, 0.55).normalize();

/** Pick one of the memory forms at random — stable for the page's life if held in state. */
export function pickArtifactModelPath(): string {
  return MODEL_PATHS[Math.floor(Math.random() * MODEL_PATHS.length)];
}

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalMatrix * normal;
    vView = -viewPosition.xyz;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

/* The surface is never filled: every pixel is transparent except along the
   silhouette, where the form turns away from the eye, and along the level
   lines of the light — so the light itself draws the contours. */
const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uLight;
  uniform float uBands;
  uniform float uOpacity;
  uniform float uWeight;
  uniform float uSilhouette;

  varying vec3 vNormal;
  varying vec3 vView;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 view = normalize(vView);

    float facing = abs(dot(normal, view));
    float rim = smoothstep(uSilhouette, 0.0, facing);

    float lit = clamp(dot(normal, normalize(uLight)) * 0.5 + 0.5, 0.0, 1.0);

    float level = lit * uBands;
    float toLine = min(fract(level), 1.0 - fract(level));
    float width = fwidth(level) * uWeight;
    float band = 1.0 - smoothstep(0.0, width, toLine);

    float alpha = max(rim * 0.85, band * (0.18 + 0.5 * lit)) * uOpacity;
    if (alpha < 0.01) discard;

    gl_FragColor = vec4(uColor, alpha);
  }
`;

function ContourModel({
  modelPath,
  spin,
}: {
  modelPath: string;
  /** prefers-reduced-motion: hold still. */
  spin: boolean;
}) {
  const { scene: cached } = useGLTF(modelPath);
  const groupRef = useRef<THREE.Group>(null!);

  // Clone graph + geometry so this canvas never steals a mesh from SceneViewer.
  const scene = useMemo(() => {
    const copy = cached.clone(true);
    copy.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry = mesh.geometry.clone();
      if (!mesh.geometry.getAttribute("normal")) mesh.geometry.computeVertexNormals();
      const prev = mesh.material as THREE.Material | THREE.Material[] | null;
      if (Array.isArray(prev)) prev.forEach((m) => m.dispose());
      else if (prev) prev.dispose();
      mesh.material = new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms: {
          uColor: { value: new THREE.Color(LINE_COLOR) },
          uLight: { value: LIGHT_DIRECTION.clone() },
          uBands: { value: BAND_COUNT },
          uOpacity: { value: 1 },
          uWeight: { value: LINE_WEIGHT },
          uSilhouette: { value: SILHOUETTE_THRESHOLD },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide,
      });
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    });
    return copy;
  }, [cached]);

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
      scene.scale.setScalar(
        Math.min(Math.max(FIT_SIZE / maxDim, 0.02), 50),
      );
    }

    return () => {
      scene.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | null;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else if (material) material.dispose();
      });
    };
  }, [scene]);

  useFrame((_, rawDelta) => {
    if (!groupRef.current || !spin) return;
    const delta = Math.min(rawDelta, 1 / 30);
    groupRef.current.rotation.y += delta * ROTATE_SPEED;
  });

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  );
}

/**
 * A single memory form drawn only in contour — the silhouette plus the level
 * lines of a fixed light, so the form turns through the light without ever
 * filling in. Standalone from SceneViewer so the recording screen stays light.
 */
export function ContourArtifact({
  modelPath,
  spin = true,
  className,
  style,
}: {
  modelPath: string;
  spin?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={className}
      style={{ width: "100%", height: "100%", pointerEvents: "none", ...style }}
      aria-hidden
    >
      <Canvas
        camera={{ position: [0, 0, 4.6], fov: 45, near: 0.1, far: 50 }}
        style={{ background: "transparent" }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 1.5]}
      >
        <Suspense fallback={null}>
          <ContourModel modelPath={modelPath} spin={spin} />
        </Suspense>
      </Canvas>
    </div>
  );
}
