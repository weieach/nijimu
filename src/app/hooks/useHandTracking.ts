import { RefObject, useEffect, useRef, useState } from "react";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

/** One landmark point in MediaPipe's normalized 0..1 space. */
export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface UseHandTrackingOptions {
  /** Usually cameraPermission === "granted". When false, nothing is initialized. */
  enabled: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** 1 for pinch gestures, 2 for two-hand distance gestures. */
  numHands: 1 | 2;
  /**
   * Called every frame a hand is visible, with one entry per detected hand.
   * Gesture math lives at the call site — it differs per page.
   * Kept in a ref internally, so an inline arrow function is fine.
   */
  onLandmarks: (hands: Landmark[][]) => void;
  /** Called when the frame contained no hands. */
  onNoHands?: () => void;
}

export interface UseHandTrackingResult {
  /** True once the model is live and the detection loop is running. */
  isTracking: boolean;
  /** Set if camera access or model init failed; pages fall back to manual controls. */
  error: string | null;
}

/**
 * Camera + MediaPipe HandLandmarker lifecycle: model init, video stream,
 * detection loop, teardown. Previously duplicated across five pages.
 */
export function useHandTracking({
  enabled,
  videoRef,
  numHands,
  onLandmarks,
  onNoHands,
}: UseHandTrackingOptions): UseHandTrackingResult {
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Callbacks live in refs so the effect doesn't re-run (and restart the
  // camera) when a page passes a fresh arrow function each render.
  const onLandmarksRef = useRef(onLandmarks);
  const onNoHandsRef = useRef(onNoHands);
  useEffect(() => {
    onLandmarksRef.current = onLandmarks;
    onNoHandsRef.current = onNoHands;
  });

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let landmarker: HandLandmarker | null = null;
    let stream: MediaStream | null = null;
    let rafId: number | null = null;

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        });
        if (cancelled || !videoRef.current) return;

        const video = videoRef.current;
        video.srcObject = stream;
        await video.play().catch(() => {});

        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        if (cancelled) return;

        const options = {
          numHands,
          runningMode: "VIDEO" as const,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        };
        try {
          landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
            ...options,
          });
        } catch {
          // GPU unavailable (sandboxed env / no WebGL) — fall back to CPU
          landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
            ...options,
          });
        }
        if (cancelled) {
          landmarker.close();
          return;
        }

        setIsTracking(true);

        const detect = () => {
          if (cancelled || !landmarker || !videoRef.current) return;
          const v = videoRef.current;
          if (v.readyState === v.HAVE_ENOUGH_DATA) {
            try {
              const results = landmarker.detectForVideo(v, performance.now());
              if (results.landmarks && results.landmarks.length > 0) {
                onLandmarksRef.current(results.landmarks as Landmark[][]);
              } else {
                onNoHandsRef.current?.();
              }
            } catch {
              // Transient per-frame detection errors are expected; keep looping.
            }
          }
          rafId = requestAnimationFrame(detect);
        };
        detect();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Hand tracking unavailable");
          setIsTracking(false);
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((track) => track.stop());
      landmarker?.close();
      setIsTracking(false);
    };
  }, [enabled, numHands, videoRef]);

  return { isTracking, error };
}

/** Euclidean distance between two landmarks (3D unless `flat`, which ignores z). */
export function landmarkDistance(a: Landmark, b: Landmark, flat = false): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = flat ? 0 : a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Average position of a hand's landmarks — its center point. */
export function handCenter(hand: Landmark[]): Landmark {
  const sum = hand.reduce(
    (acc, lm) => ({ x: acc.x + lm.x, y: acc.y + lm.y, z: acc.z + lm.z }),
    { x: 0, y: 0, z: 0 },
  );
  return { x: sum.x / hand.length, y: sum.y / hand.length, z: sum.z / hand.length };
}

/**
 * Debounced "the user actually moved" gate. Each page's first detected frame
 * becomes a baseline; the gesture only goes live after the pose changes by
 * `threshold` for `frames` consecutive frames — this is what stops the shape
 * from jumping the instant a hand appears.
 */
export function createGestureGate(threshold: number, frames = 3) {
  let baseline: number | null = null;
  let count = 0;
  let active = false;
  return {
    /** Feed the current raw measurement; returns true once the gesture is live. */
    update(value: number): boolean {
      if (baseline === null) {
        baseline = value;
        count = 0;
        active = false;
        return false;
      }
      if (Math.abs(value - baseline) > threshold) {
        count += 1;
        if (count >= frames) active = true;
      } else {
        count = 0;
      }
      return active;
    },
  };
}
