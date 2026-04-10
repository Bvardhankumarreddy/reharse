"use client";

import { useEffect, useRef } from "react";
import { clsx } from "clsx";

interface Props {
  stream:      MediaStream | null;
  recording:   boolean;
  downloadUrl: string | null;
  onStop:      () => void;
}

/**
 * Picture-in-picture camera preview overlay.
 * Positioned fixed in the bottom-right corner during the interview.
 * Shows a red pulsing dot while recording, and a download button when done.
 */
export default function CameraPreview({ stream, recording, downloadUrl, onStop }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Attach MediaStream to the video element whenever stream changes
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  if (!stream && !downloadUrl) return null;

  return (
    <div
      className={clsx(
        "fixed bottom-20 right-4 z-50 rounded-2xl overflow-hidden shadow-float border-2 transition-all",
        recording ? "border-red-500" : "border-border",
      )}
      style={{ width: 200, height: 150 }}
    >
      {/* Live video feed */}
      {stream && (
        <video
          ref={videoRef}
          autoPlay
          muted       // muted so there's no echo — audio IS recorded but not played back
          playsInline
          className="w-full h-full object-cover scale-x-[-1]"  // mirror for natural selfie view
        />
      )}

      {/* Recording badge */}
      {recording && (
        <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 rounded-full px-2 py-0.5">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-white text-[10px] font-semibold">REC</span>
        </div>
      )}

      {/* Stop button */}
      {stream && (
        <button
          onClick={onStop}
          className="absolute top-2 right-2 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80 transition-colors"
          title="Stop camera"
        >
          <span className="material-symbols-outlined text-white text-[14px]">close</span>
        </button>
      )}

      {/* Download banner shown once recording is saved */}
      {downloadUrl && !stream && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-2 p-3">
          <span className="material-symbols-outlined text-white text-[28px]"
            style={{ fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 24" }}>
            videocam
          </span>
          <p className="text-white text-[11px] font-semibold text-center">Recording ready</p>
          <a
            href={downloadUrl}
            download="rehearse-session.webm"
            className="px-3 py-1 bg-blue text-white rounded-full text-[11px] font-semibold hover:opacity-90 transition-opacity"
          >
            Download
          </a>
        </div>
      )}
    </div>
  );
}
