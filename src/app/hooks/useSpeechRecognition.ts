import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Minimal typings for the Web Speech API (not in lib.dom for all TS configs).
 */
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

function getRecognitionConstructor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseSpeechRecognitionResult {
  /** Whether this browser supports the Web Speech API. */
  isSupported: boolean;
  /** Finalized (confirmed) transcript text. */
  finalText: string;
  /** In-flight interim words, not yet finalized. */
  interimText: string;
  /** True while recognition is actively listening. */
  isListening: boolean;
  /** Last recognition error, if any ("not-allowed", "no-speech", ...). */
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

/**
 * Live voice-to-text via the browser's Web Speech API.
 * Continuous with interim results; auto-restarts if the engine ends itself
 * mid-session (Chrome stops after silence) while the caller is still recording.
 */
export function useSpeechRecognition(): UseSpeechRecognitionResult {
  const [finalText, setFinalText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Distinguishes user-requested stop from the engine ending on its own.
  const shouldListenRef = useRef(false);

  const isSupported = getRecognitionConstructor() !== null;

  const start = useCallback(() => {
    const Ctor = getRecognitionConstructor();
    if (!Ctor || shouldListenRef.current) return;

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          setFinalText((prev) => (prev ? `${prev} ${text.trim()}` : text.trim()));
        } else {
          interim += text;
        }
      }
      setInterimText(interim);
    };

    recognition.onerror = (event) => {
      // "no-speech" fires on silence; the onend auto-restart handles it.
      if (event.error !== "no-speech" && event.error !== "aborted") {
        setError(event.error);
        shouldListenRef.current = false;
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      setInterimText("");
      if (shouldListenRef.current) {
        // Engine timed out (silence) but the user is still recording — resume.
        try {
          recognition.start();
        } catch {
          shouldListenRef.current = false;
          setIsListening(false);
        }
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
    shouldListenRef.current = true;
    setError(null);
    setIsListening(true);
    recognition.start();
  }, []);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const reset = useCallback(() => {
    setFinalText("");
    setInterimText("");
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      recognitionRef.current?.abort();
    };
  }, []);

  return { isSupported, finalText, interimText, isListening, error, start, stop, reset };
}
