/**
 * Frontend signals for the trust-safety pipeline. Hooks the quiz UI calls
 * to collect:
 *   - deviceFingerprint  (FingerprintJS visitorId — cross-browser stable)
 *   - browserId          (UUID in localStorage — survives FP misses)
 *   - screenResolution
 *   - tabSwitchCount     (incremented on every visibility change to hidden)
 *   - copyPasteDetected  (set true on the first paste/copy event)
 *
 * All hooks are lazy / non-blocking — they never throw and gracefully
 * degrade when FingerprintJS fails or runs in SSR. The backend treats
 * every field as optional and uses defaults when missing.
 */
"use client";

import FingerprintJS from "@fingerprintjs/fingerprintjs";
import { useEffect, useRef, useState } from "react";

export interface QuizDeviceSignals {
  deviceFingerprint: string | null;
  browserId: string;
  screenResolution: string;
}

const BROWSER_ID_KEY = "rehearse_browser_id";

/** Stable per-browser UUID stored in localStorage. Falls back to a fresh UUID on SSR. */
function getOrCreateBrowserId(): string {
  if (typeof window === "undefined") return crypto.randomUUID();
  try {
    const cur = window.localStorage.getItem(BROWSER_ID_KEY);
    if (cur) return cur;
    const next = crypto.randomUUID();
    window.localStorage.setItem(BROWSER_ID_KEY, next);
    return next;
  } catch {
    return crypto.randomUUID();
  }
}

function getScreenRes(): string {
  if (typeof window === "undefined") return "";
  return `${window.screen.width}x${window.screen.height}`;
}

/**
 * Loads the FingerprintJS visitorId once on mount and returns the
 * three "static" device signals. Hook waits for the FP load; the
 * deviceFingerprint stays null until it resolves (browserId is set immediately).
 */
export function useQuizDeviceSignals(): QuizDeviceSignals {
  const [deviceFingerprint, setDeviceFingerprint] = useState<string | null>(null);
  const [browserId] = useState<string>(() => getOrCreateBrowserId());
  const [screenResolution] = useState<string>(() => getScreenRes());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        if (!cancelled) setDeviceFingerprint(result.visitorId);
      } catch {
        // Silent — backend handles null device FP
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { deviceFingerprint, browserId, screenResolution };
}

export interface QuizBehavioralCounters {
  /** Read-only refs so the consumer reads the LATEST value at submit time. */
  tabSwitchCountRef: React.MutableRefObject<number>;
  copyPasteDetectedRef: React.MutableRefObject<boolean>;
}

/**
 * Behavioral signal hook — wires window event listeners for the lifetime
 * of the component. Counters live in refs so the consumer always reads
 * the latest value at submit time (no stale-closure issues).
 */
export function useQuizBehavioralCounters(): QuizBehavioralCounters {
  const tabSwitchCountRef = useRef(0);
  const copyPasteDetectedRef = useRef(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      if (document.hidden) tabSwitchCountRef.current += 1;
    };
    const onPaste = () => { copyPasteDetectedRef.current = true; };
    const onCopy = () => { copyPasteDetectedRef.current = true; };
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("paste", onPaste);
    document.addEventListener("copy", onCopy);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("copy", onCopy);
    };
  }, []);

  return { tabSwitchCountRef, copyPasteDetectedRef };
}
