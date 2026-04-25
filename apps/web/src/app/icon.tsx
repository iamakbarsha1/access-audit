import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "6px",
          background: "linear-gradient(135deg, #3b82f6, #7c3aed)",
          fontFamily: "system-ui, sans-serif",
          fontSize: "20px",
          fontWeight: 800,
          color: "white",
        }}
      >
        A
      </div>
    ),
    { ...size }
  );
}
