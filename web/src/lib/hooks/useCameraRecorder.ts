"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export interface CameraRecorderState {
  active:       boolean;           // camera preview is on
  recording:    boolean;           // MediaRecorder is capturing
  stream:       MediaStream | null;
  downloadUrl:  string | null;     // set when recording ends — offer to download
  camError:     string | null;
  startCamera:  () => Promise<void>;
  stopCamera:   () => void;
  toggleCamera: () => void;
}

/**
 * Manages a webcam stream for self-monitoring during interviews.
 * - Shows a live preview via the returned `stream`
 * - Records the session with MediaRecorder (video + audio)
 * - On stop, sets `downloadUrl` so the user can download the recording
 */
export function useCameraRecorder(): CameraRecorderState {
  const [active,      setActive]      = useState(false);
  const [recording,   setRecording]   = useState(false);
  const [stream,      setStream]      = useState<MediaStream | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [camError,    setCamError]    = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);
  const streamRef   = useRef<MediaStream | null>(null);

  // Revoke object URL on unmount to free memory
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCamera = useCallback(async () => {
    setCamError(null);
    setDownloadUrl(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: true,
      });
      streamRef.current = s;
      setStream(s);
      setActive(true);

      // Start recording
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : "";

      chunksRef.current = [];
      const recorder = new MediaRecorder(s, mimeType ? { mimeType } : undefined);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        setDownloadUrl(URL.createObjectURL(blob));
        setRecording(false);
      };

      recorder.start(1000); // 1-second chunks
      recorderRef.current = recorder;
      setRecording(true);
    } catch (err) {
      const name = err instanceof Error ? (err as { name?: string }).name ?? "" : "";
      const msg  = err instanceof Error ? err.message : "";
      if (name === "NotAllowedError" || msg.toLowerCase().includes("denied") || msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("notallowed")) {
        setCamError(
          "Camera access was denied. To enable: tap the lock icon in your browser's address bar, set Camera to 'Allow', then reload the page."
        );
      } else if (name === "NotFoundError" || msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("device")) {
        setCamError("No camera found. Please connect a camera and try again.");
      } else if (name === "NotReadableError" || msg.toLowerCase().includes("could not start")) {
        setCamError("Camera is in use by another app. Close other apps using the camera and try again.");
      } else if (name === "OverconstrainedError") {
        setCamError("Camera does not support the required settings. Try a different device.");
      } else {
        setCamError("Could not access camera. Please check your device settings.");
      }
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    recorderRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    setActive(false);
  }, []);

  const toggleCamera = useCallback(() => {
    if (active) stopCamera();
    else        startCamera();
  }, [active, startCamera, stopCamera]);

  return { active, recording, stream, downloadUrl, camError, startCamera, stopCamera, toggleCamera };
}
