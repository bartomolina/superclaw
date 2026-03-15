import type { ThemeColors } from "@/utils/theme";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function ElementHighlight({ rect }: { rect: Rect }) {
  return (
    <div
      style={{
        position: "fixed",
        top: rect.y,
        left: rect.x,
        width: rect.width,
        height: rect.height,
        background: "rgba(59,130,246,0.12)",
        border: "2px solid #3b82f6",
        borderRadius: 3,
        pointerEvents: "none",
        zIndex: 2147483646,
        transition: "all 0.05s ease",
      }}
    />
  );
}

export function HoverTooltip({
  rect,
  label,
}: {
  rect: Rect;
  label: string;
}) {
  return (
    <div
      style={{
        position: "fixed",
        top: rect.y - 24,
        left: rect.x,
        background: "#18181b",
        color: "#e4e4e7",
        fontSize: 11,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        padding: "2px 6px",
        borderRadius: 4,
        pointerEvents: "none",
        zIndex: 2147483646,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </div>
  );
}

export function AreaSelectionRect({
  start,
  current,
}: {
  start: { x: number; y: number };
  current: { x: number; y: number };
}) {
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  const w = Math.abs(current.x - start.x);
  const h = Math.abs(current.y - start.y);
  return (
    <div
      style={{
        position: "fixed",
        top: y,
        left: x,
        width: w,
        height: h,
        background: "rgba(59,130,246,0.08)",
        border: "2px dashed #3b82f6",
        borderRadius: 4,
        pointerEvents: "none",
        zIndex: 2147483646,
      }}
    />
  );
}

export function AnnotationBadge({
  rect,
  index,
  colors,
}: {
  rect: Rect;
  index: number;
  colors: ThemeColors;
}) {
  void colors;
  return (
    <div
      style={{
        position: "fixed",
        top: rect.y - 10,
        left: rect.x + rect.width - 10,
        width: 20,
        height: 20,
        borderRadius: "50%",
        background: "#3b82f6",
        color: "#fff",
        fontSize: 11,
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 2147483645,
      }}
    >
      {index + 1}
    </div>
  );
}

export function Toast({
  message,
  colors,
}: {
  message: string;
  colors: ThemeColors;
}) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 72,
        right: 20,
        background: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        fontSize: 13,
        padding: "8px 14px",
        borderRadius: 8,
        boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
        zIndex: 2147483647,
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {message}
    </div>
  );
}
