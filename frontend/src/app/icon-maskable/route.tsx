import { ImageResponse } from "next/og";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#141824",
        }}
      >
        <div
          style={{
            width: 320,
            height: 320,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
            fontSize: 140,
            fontWeight: 700,
            fontFamily: "sans-serif",
            background: "#f97316",
            borderRadius: "50%",
          }}
        >
          IA
        </div>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
