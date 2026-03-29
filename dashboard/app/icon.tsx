import { ImageResponse } from "next/og";

const APP_ORANGE = "#f97316";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: APP_ORANGE,
        }}
      />
    ),
    size,
  );
}
