"use client";

import { useState, useRef, useCallback, useEffect } from "react";

/**
 * Browser-native speech-to-text using the Web Speech API.
 * Accuracy improvements over the naive implementation:
 *  - Auto-restarts recognition after silence / Chrome's ~1min limit
 *  - Requests mic with noise suppression + echo cancellation so the
 *    recognition engine receives cleaner audio
 *  - maxAlternatives=1 keeps results deterministic
 *
 * onInterim: live partial text while the user is still speaking
 * onFinal:   committed chunk once a natural pause is detected
 */
export function useVoiceRecorder(
  onInterim: (text: string) => void,
  onFinal:   (text: string) => void,
) {
  const [recording, setRecording] = useState(false);
  const [micError,  setMicError]  = useState<string | null>(null);

  const recognitionRef  = useRef<SpeechRecognition | null>(null);
  const shouldRunRef    = useRef(false);   // true while the user wants recording on
  const onInterimRef    = useRef(onInterim);
  const onFinalRef      = useRef(onFinal);

  // Keep refs current so closures don't stale
  useEffect(() => { onInterimRef.current = onInterim; }, [onInterim]);
  useEffect(() => { onFinalRef.current   = onFinal;   }, [onFinal]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      shouldRunRef.current = false;
      recognitionRef.current?.abort();
    };
  }, []);

  // ── Request mic with high-quality audio processing ──────────────────────────
  const acquireMic = useCallback(async (): Promise<boolean> => {
    try {
      // This call just validates permission + warms up the audio pipeline.
      // The Web Speech API manages its own stream internally, but requesting
      // with these constraints first makes Chrome use a better audio graph.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation:  true,
          noiseSuppression:  true,
          autoGainControl:   true,
          channelCount:      1,
          sampleRate:        16000,  // optimal for speech models
        },
      });
      // Release immediately — SpeechRecognition opens its own stream
      stream.getTracks().forEach((t) => t.stop());
      return true;
    } catch (err) {
      const name = err instanceof Error ? (err as { name?: string }).name ?? "" : "";
      const msg  = err instanceof Error ? err.message : "";
      if (name === "NotAllowedError" || msg.toLowerCase().includes("denied") || msg.toLowerCase().includes("permission")) {
        setMicError(
          "Microphone access was denied. To enable: tap the lock icon in your browser's address bar, set Microphone to 'Allow', then reload."
        );
      } else if (name === "NotFoundError" || msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("device")) {
        setMicError("No microphone found. Please connect a microphone and try again.");
      } else if (name === "NotReadableError" || msg.toLowerCase().includes("could not start")) {
        setMicError("Microphone is in use by another app. Close other apps using the mic and try again.");
      } else {
        setMicError("Could not access microphone. Please check your device settings.");
      }
      return false;
    }
  }, []);

  // ── Create + start a fresh recognition instance ──────────────────────────────
  const spawnRecognition = useCallback(() => {
    const SpeechRecognitionCtor =
      typeof window !== "undefined"
        ? (window.SpeechRecognition ?? (window as unknown as Record<string, typeof SpeechRecognition>).webkitSpeechRecognition)
        : null;

    if (!SpeechRecognitionCtor) {
      setMicError("Speech recognition is not supported in this browser. Try Chrome or Edge.");
      shouldRunRef.current = false;
      setRecording(false);
      return;
    }

    const r                = new SpeechRecognitionCtor();
    r.continuous           = true;
    r.interimResults       = true;
    r.maxAlternatives      = 1;
    r.lang                 = "en-US";
    recognitionRef.current = r;

    r.onresult = (e: SpeechRecognitionEvent) => {
      let interim    = "";
      let finalChunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalChunk += res[0].transcript;
        else             interim    += res[0].transcript;
      }
      if (interim)    onInterimRef.current(interim);
      if (finalChunk) onFinalRef.current(finalChunk.trim());
    };

    r.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === "not-allowed") {
        setMicError("Microphone permission denied.");
        shouldRunRef.current = false;
        setRecording(false);
      }
      // "no-speech" and "aborted" are normal; others are transient — let onend restart
    };

    r.onend = () => {
      // Auto-restart unless the user manually stopped
      if (shouldRunRef.current) {
        try { recognitionRef.current?.start(); } catch { /* already started */ }
      } else {
        setRecording(false);
      }
    };

    try {
      r.start();
    } catch {
      // Recognition already running in another tab / instance
      setMicError("Speech recognition is already active.");
      shouldRunRef.current = false;
      setRecording(false);
    }
  }, []);

  // ── Public API ────────────────────────────────────────────────────────────────

  const start = useCallback(async () => {
    setMicError(null);
    if (shouldRunRef.current) return;  // already running

    const ok = await acquireMic();
    if (!ok) return;

    shouldRunRef.current = true;
    setRecording(true);
    spawnRecognition();
  }, [acquireMic, spawnRecognition]);

  const stop = useCallback(() => {
    shouldRunRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setRecording(false);
  }, []);

  const toggle = useCallback(() => {
    if (shouldRunRef.current) stop();
    else                      start();
  }, [start, stop]);

  return { recording, micError, start, stop, toggle };
}
