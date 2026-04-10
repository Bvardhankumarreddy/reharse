"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Speaks text aloud using the browser's Web Speech API.
 * Returns speaking state and a mute toggle.
 */
export function useInterviewerTTS(enabled: boolean) {
  const [speaking, setSpeaking] = useState(false);
  const [muted,    setMuted]    = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Pick a natural-sounding voice (prefer en-US)
  function getVoice(): SpeechSynthesisVoice | null {
    const voices = window.speechSynthesis.getVoices();
    return (
      voices.find((v) => v.name.includes("Google US English")) ??
      voices.find((v) => v.lang === "en-US" && !v.name.includes("Google")) ??
      voices.find((v) => v.lang.startsWith("en")) ??
      null
    );
  }

  const speak = useCallback((text: string) => {
    if (!enabled || muted || typeof window === "undefined") return;
    if (!("speechSynthesis" in window)) return;

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate   = 0.92;
    utterance.pitch  = 1.0;
    utterance.volume = 1.0;

    // Voices may load asynchronously — try immediately, retry once after load
    const tryVoice = () => { const v = getVoice(); if (v) utterance.voice = v; };
    tryVoice();
    if (!utterance.voice) {
      window.speechSynthesis.onvoiceschanged = () => { tryVoice(); window.speechSynthesis.onvoiceschanged = null; };
    }

    utterance.onstart = () => setSpeaking(true);
    utterance.onend   = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [enabled, muted]);

  const stop = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      if (!m) stop(); // if muting, stop current speech
      return !m;
    });
  }, [stop]);

  // Stop speech on unmount
  useEffect(() => () => stop(), [stop]);

  return { speak, stop, speaking, muted, toggleMute };
}
