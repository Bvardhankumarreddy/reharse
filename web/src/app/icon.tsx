import { ImageResponse } from "next/og";

export const size        = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "linear-gradient(135deg, #7C3AED 0%, #3B82F6 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            color: "white",
            fontSize: 20,
            fontWeight: 900,
            fontFamily: "sans-serif",
            letterSpacing: "-1px",
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
