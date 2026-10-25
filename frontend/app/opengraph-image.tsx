import { ImageResponse } from "next/og";

export const alt = "QueueLess — Smart Hospital Queue & OPD Flow";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
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
          background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 60%, #3b82f6 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
          }}
        >
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 24,
              background: "white",
              color: "#2563eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 56,
              fontWeight: 900,
            }}
          >
            Q
          </div>
          <div style={{ fontSize: 88, fontWeight: 900, letterSpacing: -2 }}>
            QueueLess
          </div>
        </div>

        <div
          style={{
            marginTop: 36,
            fontSize: 36,
            fontWeight: 600,
            color: "#dbeafe",
          }}
        >
          Smart Hospital Queue &amp; OPD Flow
        </div>

        <div
          style={{
            marginTop: 20,
            fontSize: 24,
            color: "#93c5fd",
          }}
        >
          Live OPD queues · Priority-aware tokens · Real-time wait times
        </div>
      </div>
    ),
    size
  );
}
