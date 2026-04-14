import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Rehearse — AI Mock Interview Coach";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background grid */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            backgroundImage:
              "linear-gradient(rgba(99,102,241,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.07) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        {/* Glow top-left */}
        <div
          style={{
            position: "absolute",
            top: "-80px",
            left: "-80px",
            width: "400px",
            height: "400px",
            display: "flex",
            background: "radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />

        {/* Glow bottom-right */}
        <div
          style={{
            position: "absolute",
            bottom: "-80px",
            right: "-80px",
            width: "400px",
            height: "400px",
            display: "flex",
            background: "radial-gradient(circle, rgba(139,92,246,0.2) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />

        {/* Logo + name */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "40px",
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "16px",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "32px",
            }}
          >
            🎙
          </div>
          <span
            style={{
              fontSize: "44px",
              fontWeight: 800,
              color: "#ffffff",
              letterSpacing: "-1px",
              display: "flex",
            }}
          >
            Rehearse
          </span>
        </div>

        {/* Headline line 1 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            fontSize: "62px",
            fontWeight: 800,
            color: "#ffffff",
            letterSpacing: "-2px",
          }}
        >
          <span style={{ display: "flex" }}>Ace Your Next</span>
          <span
            style={{
              display: "flex",
              background: "linear-gradient(90deg, #818cf8, #a78bfa)",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            Interview
          </span>
        </div>

        {/* Headline line 2 */}
        <div
          style={{
            display: "flex",
            fontSize: "62px",
            fontWeight: 800,
            color: "#ffffff",
            letterSpacing: "-2px",
            marginBottom: "24px",
          }}
        >
          with AI Coaching
        </div>

        {/* Subheadline */}
        <div
          style={{
            display: "flex",
            fontSize: "24px",
            color: "#94a3b8",
            textAlign: "center",
            maxWidth: "700px",
            lineHeight: 1.5,
            marginBottom: "48px",
          }}
        >
          Practice behavioral, technical &amp; system design rounds. Get honest feedback. Improve faster.
        </div>

        {/* Pills */}
        <div style={{ display: "flex", gap: "16px" }}>
          {["Behavioral", "Technical", "System Design", "AI Feedback"].map((label) => (
            <div
              key={label}
              style={{
                display: "flex",
                padding: "10px 24px",
                borderRadius: "999px",
                background: "rgba(99,102,241,0.15)",
                border: "1px solid rgba(99,102,241,0.35)",
                color: "#a5b4fc",
                fontSize: "18px",
                fontWeight: 600,
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Bottom URL */}
        <div
          style={{
            position: "absolute",
            bottom: "32px",
            display: "flex",
            color: "#475569",
            fontSize: "18px",
            letterSpacing: "0.5px",
          }}
        >
          reharse.inferix.in
        </div>
      </div>
    ),
    { ...size }
  );
}
