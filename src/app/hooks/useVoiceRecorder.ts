import { useCallback, useEffect, useRef, useState } from "react";

const MAX_RECORDING_SECONDS = 60;
/** Floor between voice pulses, so a sentence is a few rings, not a shiver. */
const VOICE_PULSE_MIN_MS = 380;
/** Above this, the microphone is hearing a voice rather than a room. */
const VOICE_PULSE_LEVEL = 0.08;
/** The meter feeds React at a walking pace — the water animates on its own clock. */
const LEVEL_UPDATE_MS = 100;
const LEVEL_UPDATE_STEP = 0.04;

/** First container the browser will actually record; Safari only offers mp4. */
const PREFERRED_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return PREFERRED_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

function canRecord(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}

export type VoiceRecorderError = "unsupported" | "not-allowed" | "failed";

/**
 * The recording session behind both recording screens: it captures the audio
 * itself and hands the finished recording to `onStop` for transcription, while
 * `level` and `voicePulse` follow the loudness so a backdrop can react to the
 * voice as it speaks.
 */
export function useVoiceRecorder({
  onStop,
}: {
  /** Called once the recording has flushed. `null` when nothing was captured. */
  onStop?: (audio: Blob | null) => void;
} = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [level, setLevel] = useState(0);
  const [voicePulse, setVoicePulse] = useState(0);
  const [error, setError] = useState<VoiceRecorderError | null>(null);

  const [isSupported] = useState(canRecord);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const frameRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const durationRef = useRef(0);

  const onStopRef = useRef(onStop);
  onStopRef.current = onStop;

  /** stop() has to be callable from the interval it clears, so it lives behind a ref. */
  const stopRef = useRef<() => void>(() => {});

  const teardown = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    setLevel(0);
  }, []);

  /** Watches the loudness of the live stream — this is what the water listens to. */
  const startMetering = useCallback((stream: MediaStream) => {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;

    const context = new Ctx();
    audioContextRef.current = context;
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    context.createMediaStreamSource(stream).connect(analyser);

    const samples = new Float32Array(analyser.fftSize);
    let smoothed = 0;
    let reported = 0;
    let lastLevelAt = 0;
    let lastPulseAt = 0;

    const tick = () => {
      frameRef.current = requestAnimationFrame(tick);
      analyser.getFloatTimeDomainData(samples);

      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      const rms = Math.sqrt(sum / samples.length);
      smoothed = smoothed * 0.8 + Math.min(1, rms * 4) * 0.2;

      const now = performance.now();
      if (now - lastLevelAt > LEVEL_UPDATE_MS && Math.abs(smoothed - reported) > LEVEL_UPDATE_STEP) {
        lastLevelAt = now;
        reported = smoothed;
        setLevel(smoothed);
      }
      if (smoothed > VOICE_PULSE_LEVEL && now - lastPulseAt > VOICE_PULSE_MIN_MS) {
        lastPulseAt = now;
        setVoicePulse((pulse) => pulse + 1);
      }
    };
    tick();
  }, []);

  const start = useCallback(async () => {
    if (recorderRef.current) return;
    if (!isSupported) {
      setError("unsupported");
      return;
    }
    setError(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setError((err as DOMException)?.name === "NotAllowedError" ? "not-allowed" : "failed");
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];

    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      teardown();
      setError("failed");
      return;
    }

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const chunks = chunksRef.current;
      chunksRef.current = [];
      recorderRef.current = null;
      const audio = chunks.length
        ? new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" })
        : null;
      teardown();
      setIsRecording(false);
      onStopRef.current?.(audio);
    };

    recorderRef.current = recorder;
    recorder.start(250);
    setIsRecording(true);
    setDuration(0);
    durationRef.current = 0;
    startMetering(stream);

    timerRef.current = window.setInterval(() => {
      durationRef.current += 1;
      setDuration(durationRef.current);
      if (durationRef.current >= MAX_RECORDING_SECONDS) stopRef.current();
    }, 1000);
  }, [isSupported, startMetering, teardown]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recorder.state !== "inactive") {
      // the recording flushes asynchronously — onstop hands it on
      recorder.stop();
      return;
    }
    recorderRef.current = null;
    teardown();
    setIsRecording(false);
    onStopRef.current?.(null);
  }, [teardown]);
  stopRef.current = stop;

  // leaving mid-recording releases the microphone and drops the audio
  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      teardown();
    };
  }, [teardown]);

  return {
    isSupported,
    isRecording,
    duration,
    maxDuration: MAX_RECORDING_SECONDS,
    /** 0–1 loudness of the voice right now. */
    level,
    /** Ticks up as the voice carries — the puddle sends a ring per tick. */
    voicePulse,
    /** 'not-allowed' when the microphone was refused. */
    error,
    start,
    stop,
  };
}
