import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "AccessAudit — ADA Accessibility Compliance for Agencies";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #3b82f6, #7c3aed)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "16px",
              background: "rgba(255,255,255,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "32px",
              fontWeight: 800,
              color: "white",
            }}
          >
            A
          </div>
          <span
            style={{
              fontSize: "40px",
              fontWeight: 800,
              color: "white",
            }}
          >
            AccessAudit
          </span>
        </div>
        <div
          style={{
            fontSize: "28px",
            fontWeight: 600,
            color: "rgba(255,255,255,0.9)",
            maxWidth: "700px",
            textAlign: "center",
            lineHeight: 1.4,
          }}
        >
          ADA Accessibility Compliance for Agencies
        </div>
        <div
          style={{
            marginTop: "16px",
            fontSize: "18px",
            color: "rgba(255,255,255,0.7)",
          }}
        >
          Scan &middot; Fix &middot; Report &middot; Certify
        </div>
      </div>
    ),
    { ...size }
  );
}
