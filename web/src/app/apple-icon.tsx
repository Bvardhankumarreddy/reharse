import { ImageResponse } from "next/og";

export const size        = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          borderRadius: 40,
          background: "linear-gradient(135deg, #7C3AED 0%, #3B82F6 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            color: "white",
            fontSize: 110,
            fontWeight: 900,
            fontFamily: "sans-serif",
            letterSpacing: "-4px",
            lineHeight: 1,
          }}
        >
          R
        </span>
      </div>
    ),
    { ...size },
  );
}
