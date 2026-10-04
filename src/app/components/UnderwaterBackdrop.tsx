import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  UNDERWATER_BACKDROP_FRAG,
  UNDERWATER_BACKDROP_VERT,
  createUnderwaterBackdropUniforms,
  underwaterTime,
} from "../lib/underwaterLight";

/**
 * Full-screen underwater water body, drawn in screen space so the pond's
 * descent and the shape steps can show the same frame.
 */
export function UnderwaterBackdrop({
  revealRef,
  tint = null,
  renderOrder = -10,
}: {
  /** 0–1 opacity read every frame; omitted = fully shown. */
  revealRef?: RefObject<number>;
  /** sRGB hex the water leans toward. */
  tint?: string | null;
  renderOrder?: number;
}) {
  const { size } = useThree();
  const uniforms = useMemo(() => createUnderwaterBackdropUniforms(), []);
  const tintTarget = useMemo(() => new THREE.Color(1, 1, 1), []);
  const tintAmount = useRef(0);
  const tintShown = useRef(false);

  useEffect(() => {
    // The shader works in display values, so read the hex without linearising it.
    if (tint) tintTarget.setStyle(tint, THREE.LinearSRGBColorSpace);
    tintAmount.current = tint ? 0.42 : 0;
    if (tint && !tintShown.current) {
      uniforms.uTint.value.copy(tintTarget);
      tintShown.current = true;
    }
  }, [tint, tintTarget, uniforms]);

  useFrame((_, delta) => {
    const ease = 1 - Math.exp(-Math.min(delta, 0.05) * 3.2);
    uniforms.uTime.value = underwaterTime();
    uniforms.uResolution.value.set(size.width, size.height);
    uniforms.uReveal.value = revealRef ? revealRef.current ?? 0 : 1;
    uniforms.uTint.value.lerp(tintTarget, ease);
    uniforms.uTintAmount.value += (tintAmount.current - uniforms.uTintAmount.value) * ease;
  });

  return (
    <mesh renderOrder={renderOrder} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        transparent
        depthTest={false}
        depthWrite={false}
        vertexShader={UNDERWATER_BACKDROP_VERT}
        fragmentShader={UNDERWATER_BACKDROP_FRAG}
        uniforms={uniforms}
      />
    </mesh>
  );
}
