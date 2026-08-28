import { useLayoutEffect, useRef, useState } from "react";
import { TransformControls } from "@react-three/drei";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import {
  AmbientFill,
  EditableLight,
  TransformMode,
  areaSizeFromScale,
  pointDistanceFromScale,
} from "../lib/sceneLights";

let rectAreaLibReady = false;
function ensureRectAreaLib() {
  if (rectAreaLibReady) return;
  RectAreaLightUniformsLib.init();
  rectAreaLibReady = true;
}

function eulerTuple(e: THREE.Euler): [number, number, number] {
  return [e.x, e.y, e.z];
}

function vecTuple(v: THREE.Vector3): [number, number, number] {
  return [v.x, v.y, v.z];
}

function LightHelper({
  light,
  selected,
  onSelect,
}: {
  light: EditableLight;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const color = selected ? "#f2e08a" : "#ececec";
  const { width, height } = areaSizeFromScale(light.scale);
  const r = Math.max(0.22, pointDistanceFromScale(light.scale) * 0.04);

  return (
    <group
      onClick={(e) => {
        e.stopPropagation();
        onSelect(light.id);
      }}
    >
      {light.kind === "point" && (
        <mesh renderOrder={20}>
          <sphereGeometry args={[r, 16, 12]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={selected ? 0.95 : 0.7}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
      )}
      {light.kind === "directional" && (
        <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={20}>
          <coneGeometry args={[0.35, 0.85, 12]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={selected ? 0.95 : 0.7}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
      )}
      {light.kind === "area" && (
        <mesh>
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial
            color={light.color}
            transparent
            opacity={selected ? 0.55 : 0.28}
            side={THREE.DoubleSide}
            depthTest={false}
          />
        </mesh>
      )}
      <mesh>
        <sphereGeometry
          args={[light.kind === "point" ? r * 1.15 : 0.32, 12, 8]}
        />
        <meshBasicMaterial
          color={color}
          wireframe
          transparent
          opacity={0.35}
          depthTest={false}
        />
      </mesh>
    </group>
  );
}

function EditableLightNode({
  light,
  editMode,
  selected,
  transformMode,
  onSelect,
  onChange,
  onDragging,
}: {
  light: EditableLight;
  editMode: boolean;
  selected: boolean;
  transformMode: TransformMode;
  onSelect: (id: string) => void;
  onChange: (next: EditableLight) => void;
  onDragging: (dragging: boolean) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [object, setObject] = useState<THREE.Object3D | null>(null);
  const draggingRef = useRef(false);
  const lightRef = useRef(light);
  lightRef.current = light;

  const { width, height } = areaSizeFromScale(light.scale);
  const distance = pointDistanceFromScale(light.scale);

  useLayoutEffect(() => {
    if (light.kind === "area") ensureRectAreaLib();
  }, [light.kind]);

  useLayoutEffect(() => {
    const g = groupRef.current;
    if (!g || draggingRef.current) return;
    g.position.set(...light.position);
    g.rotation.set(...light.rotation);
    if (light.kind === "point") {
      const s = Math.max(0.05, Math.abs(light.scale[0]));
      g.scale.setScalar(s);
    } else {
      g.scale.set(1, 1, 1);
    }
  }, [light.position, light.rotation, light.scale, light.kind]);

  return (
    <>
      <group
        ref={(node) => {
          groupRef.current = node;
          setObject(node);
        }}
        position={light.position}
        rotation={light.rotation}
      >
        {light.kind === "point" && (
          <pointLight
            color={light.color}
            intensity={light.intensity}
            distance={distance}
            decay={0.1}
          />
        )}
        {light.kind === "directional" && (
          <directionalLight color={light.color} intensity={light.intensity} />
        )}
        {light.kind === "area" && (
          <rectAreaLight
            color={light.color}
            intensity={light.intensity}
            width={width}
            height={height}
          />
        )}
        {editMode && (
          <LightHelper
            light={light}
            selected={selected}
            onSelect={onSelect}
          />
        )}
      </group>
      {editMode && selected && object && (
        <TransformControls
          object={object}
          mode={transformMode}
          size={1.35}
          onMouseDown={() => {
            draggingRef.current = true;
            onDragging(true);
          }}
          onMouseUp={() => {
            draggingRef.current = false;
            onDragging(false);
          }}
          onObjectChange={() => {
            if (!draggingRef.current) return;
            const g = groupRef.current;
            const cur = lightRef.current;
            if (!g) return;
            let nextScale = cur.scale;
            if (cur.kind === "point") {
              const s = Math.max(0.05, g.scale.x);
              nextScale = [s, s, s];
            } else if (cur.kind === "area" && transformMode === "scale") {
              nextScale = [
                Math.max(0.15, cur.scale[0] * g.scale.x),
                Math.max(0.15, cur.scale[1] * g.scale.y),
                1,
              ];
              g.scale.set(1, 1, 1);
            }
            onChange({
              ...cur,
              position: vecTuple(g.position),
              rotation: eulerTuple(g.rotation),
              scale: nextScale,
            });
          }}
        />
      )}
    </>
  );
}

export function LightRig({
  lights,
  ambients,
  editMode,
  selectedId,
  transformMode,
  onSelect,
  onChangeLight,
  onDragging,
}: {
  lights: EditableLight[];
  ambients: AmbientFill[];
  editMode: boolean;
  selectedId: string | null;
  transformMode: TransformMode;
  onSelect: (id: string | null) => void;
  onChangeLight: (next: EditableLight) => void;
  onDragging: (dragging: boolean) => void;
}) {
  return (
    <>
      {ambients.map((a) => (
        <ambientLight key={a.id} color={a.color} intensity={a.intensity} />
      ))}
      {lights.map((light) => (
        <EditableLightNode
          key={light.id}
          light={light}
          editMode={editMode}
          selected={selectedId === light.id}
          transformMode={transformMode}
          onSelect={onSelect}
          onChange={onChangeLight}
          onDragging={onDragging}
        />
      ))}
    </>
  );
}
