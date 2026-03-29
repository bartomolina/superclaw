import { ImageResponse } from "next/og";

const APP_ORANGE = "#f97316";
const EMOJI_FONT_STACK = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

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
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: APP_ORANGE,
          fontSize: 300,
          lineHeight: 1,
          fontFamily: EMOJI_FONT_STACK,
        }}
      >
        🦞
      </div>
    ),
    {
      ...size,
      emoji: "twemoji",
    },
  );
}
