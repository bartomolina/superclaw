import { useState, useEffect, useCallback, useRef } from "react";
import {
  IconPointer,
  IconAreaSelect,

  IconSettings,
  IconCopy,
  IconSend,
  IconTrash,
  IconClose,
} from "./Icons";
import { AnnotationPopover } from "./AnnotationPopover";
import {
  ElementHighlight,
  HoverTooltip,
  AreaSelectionRect,
  AnnotationBadge,
  Toast,
} from "./Overlays";
import {
  identifyElement,
  buildHoverLabel,
  annotationsToMarkdown,
  type ElementMeta,
} from "@/utils/element-identification";
import { buildAnnotationSubmissionPayload } from "@/utils/annotation-payload";
import { getThemeColors, resolveIsDark } from "@/utils/theme";
import { theme as themeStorage } from "@/utils/storage";

type Mode = "idle" | "picking" | "area-select" | "annotating";

interface StoredAnnotation {
  meta: ElementMeta;
  note: string;
  boardId: string;
  columnId: string;
  agentId: string;
}

export function Toolbar() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [themeSetting, setThemeSetting] = useState<"light" | "dark" | "system">(
    "system",
  );
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const [hoverLabel, setHoverLabel] = useState("");
  const [annotations, setAnnotations] = useState<StoredAnnotation[]>([]);
  const [annotatingMeta, setAnnotatingMeta] = useState<ElementMeta | null>(
    null,
  );
  const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 });
  const [areaStart, setAreaStart] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [areaCurrent, setAreaCurrent] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [pushLoading, setPushLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const uiRootRef = useRef<HTMLDivElement | null>(null);

  const isDark = resolveIsDark(themeSetting);
  const colors = getThemeColors(isDark);

  // Load theme from storage
  useEffect(() => {
    themeStorage.getValue().then(setThemeSetting);
    const unwatch = themeStorage.watch(setThemeSetting);
    return () => unwatch();
  }, []);

  // Listen for TOGGLE from background
  useEffect(() => {
    const handler = (msg: { type: string }) => {
      if (msg.type === "TOGGLE") setOpen((prev) => !prev);
    };
    browser.runtime.onMessage.addListener(handler);
    return () => browser.runtime.onMessage.removeListener(handler);
  }, []);

  // Update badge when annotations change
  useEffect(() => {
    browser.runtime.sendMessage({
      type: "UPDATE_BADGE",
      count: open ? annotations.length : 0,
    });
  }, [annotations.length, open]);

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setMode("idle");
      setHoverRect(null);
      setAnnotatingMeta(null);
      browser.runtime.sendMessage({ type: "UPDATE_BADGE", count: 0 });
    }
  }, [open]);

  const isInsideExtensionUi = useCallback((event: Event) => {
    const root = uiRootRef.current;
    if (!root) return false;

    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    return path.some((target) => target instanceof Node && root.contains(target));
  }, []);

  // Element picking
  useEffect(() => {
    if (!open || (mode !== "picking" && mode !== "area-select")) return;

    const onMouseMove = (e: MouseEvent) => {
      if (mode === "area-select" && areaStart) {
        setAreaCurrent({ x: e.clientX, y: e.clientY });
        return;
      }
      if (isInsideExtensionUi(e)) {
        setHoverRect(null);
        setHoverLabel("");
        return;
      }
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
      if (!el) {
        setHoverRect(null);
        setHoverLabel("");
        return;
      }
      setHoverRect(el.getBoundingClientRect());
      setHoverLabel(buildHoverLabel(el));
    };

    const onClick = (e: MouseEvent) => {
      if (mode !== "picking") return;
      if (isInsideExtensionUi(e)) return;
      const el = document.elementFromPoint(
        e.clientX,
        e.clientY,
      ) as HTMLElement;
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();

      // Check for text selection
      const selection = window.getSelection();
      if (selection && selection.toString().trim()) {
        const range = selection.getRangeAt(0);
        const ancestor = range.commonAncestorContainer;
        const targetEl =
          ancestor.nodeType === Node.ELEMENT_NODE
            ? (ancestor as HTMLElement)
            : (ancestor.parentElement as HTMLElement);
        if (targetEl) {
          const meta = identifyElement(targetEl);
          meta.text = selection.toString().trim().slice(0, 200);
          const rect = range.getBoundingClientRect();
          setAnnotatingMeta(meta);
          setPopoverPos({ x: rect.right + 8, y: rect.top });
          setMode("annotating");
          setHoverRect(null);
          return;
        }
      }

      const meta = identifyElement(el);
      const rect = el.getBoundingClientRect();
      setAnnotatingMeta(meta);
      setPopoverPos({ x: rect.right + 8, y: rect.top });
      setMode("annotating");
      setHoverRect(null);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (mode !== "area-select") return;
      if (isInsideExtensionUi(e)) return;
      setAreaStart({ x: e.clientX, y: e.clientY });
      setAreaCurrent({ x: e.clientX, y: e.clientY });
    };

    const onMouseUp = (e: MouseEvent) => {
      if (mode !== "area-select" || !areaStart) return;
      const dx = Math.abs(e.clientX - areaStart.x);
      const dy = Math.abs(e.clientY - areaStart.y);
      if (dx > 10 || dy > 10) {
        const cx = (areaStart.x + e.clientX) / 2;
        const cy = (areaStart.y + e.clientY) / 2;
        const el = document.elementFromPoint(cx, cy) as HTMLElement;
        if (el) {
          const meta = identifyElement(el);
          setAnnotatingMeta(meta);
          setPopoverPos({ x: e.clientX + 8, y: e.clientY });
          setMode("annotating");
        }
      }
      setAreaStart(null);
      setAreaCurrent(null);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMode("idle");
        setHoverRect(null);
        setAreaStart(null);
        setAreaCurrent(null);
      }
    };

    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("mouseup", onMouseUp, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousemove", onMouseMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("mouseup", onMouseUp, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, mode, areaStart, isInsideExtensionUi]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleCopy = () => {
    const md = annotationsToMarkdown(annotations);
    navigator.clipboard.writeText(md).then(() => {
      showToast("Copied to clipboard");
    });
  };

  const handlePushAll = async () => {
    if (!annotations.length) return;
    setPushLoading(true);
    let created = 0;
    let errors = 0;
    for (const a of annotations) {
      const payload = buildAnnotationSubmissionPayload({
        pageUrl: window.location.href,
        pageTitle: document.title,
        boardId: a.boardId,
        columnId: a.columnId,
        agentId: a.agentId,
        meta: a.meta,
        note: a.note,
      });
      try {
        const res = await browser.runtime.sendMessage({
          type: "SUBMIT_ANNOTATIONS",
          payload,
        });
        if (res.ok) created++;
        else errors++;
      } catch {
        errors++;
      }
    }
    setPushLoading(false);
    if (errors === 0) {
      showToast(
        created === 1 ? "1 card created" : `${created} cards created`,
      );
      setAnnotations([]);
    } else {
      showToast(`${created} created, ${errors} failed`);
    }
  };

  const handleAddAnnotation = (
    note: string,
    boardId: string,
    columnId: string,
    agentId: string,
  ) => {
    if (!annotatingMeta) return;
    setAnnotations((prev) => [
      ...prev,
      { meta: annotatingMeta, note, boardId, columnId, agentId },
    ]);
    setAnnotatingMeta(null);
    setMode("picking");
  };

  const handleSendAnnotation = async (
    note: string,
    boardId: string,
    columnId: string,
    agentId: string,
  ) => {
    if (!annotatingMeta) return;
    const payload = buildAnnotationSubmissionPayload({
      pageUrl: window.location.href,
      pageTitle: document.title,
      boardId,
      columnId,
      agentId,
      meta: annotatingMeta,
      note,
    });
    const res = await browser.runtime.sendMessage({
      type: "SUBMIT_ANNOTATIONS",
      payload,
    });
    if (res.ok) {
      const destination =
        res.board?.name && res.column?.name
          ? ` in ${res.board.name} / ${res.column.name}`
          : "";
      showToast(`Card created${destination}`);
      setAnnotatingMeta(null);
      setMode("picking");
    } else {
      showToast("Error: " + (res.error || "Unknown error"));
    }
  };

  const handleCancel = () => {
    setAnnotatingMeta(null);
    setMode("picking");
  };

  if (!open) return null;

  const btnBase: React.CSSProperties = {
    width: 36,
    height: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    transition: "background 0.15s",
    color: colors.text,
    background: "transparent",
  };

  const btnActive: React.CSSProperties = {
    ...btnBase,
    background: "#3b82f620",
    color: "#3b82f6",
  };

  const separator: React.CSSProperties = {
    width: 1,
    height: 20,
    background: colors.border,
    margin: "0 2px",
  };

  return (
    <div ref={uiRootRef}>
      {/* Hover highlight */}
      {hoverRect && mode === "picking" && (
        <>
          <ElementHighlight
            rect={{
              x: hoverRect.x,
              y: hoverRect.y,
              width: hoverRect.width,
              height: hoverRect.height,
            }}
          />
          {hoverLabel && (
            <HoverTooltip
              rect={{
                x: hoverRect.x,
                y: hoverRect.y,
                width: hoverRect.width,
                height: hoverRect.height,
              }}
              label={hoverLabel}
            />
          )}
        </>
      )}

      {/* Area selection */}
      {mode === "area-select" && areaStart && areaCurrent && (
        <AreaSelectionRect start={areaStart} current={areaCurrent} />
      )}

      {/* Annotating highlight */}
      {mode === "annotating" && annotatingMeta && (
        <ElementHighlight rect={annotatingMeta.rect} />
      )}

      {/* Annotation popover */}
      {mode === "annotating" && annotatingMeta && (
        <AnnotationPopover
          position={popoverPos}
          colors={colors}
          onCancel={handleCancel}
          onAdd={handleAddAnnotation}
          onSend={handleSendAnnotation}
        />
      )}

      {/* Annotation badges */}
      {annotations.map((a, i) => (
        <AnnotationBadge
          key={i}
          rect={a.meta.rect}
          index={i}
          colors={colors}
        />
      ))}

      {/* Toast */}
      {toast && <Toast message={toast} colors={colors} />}

      {/* Toolbar */}
      <div
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          zIndex: 2147483647,
          display: "flex",
          alignItems: "center",
          gap: 2,
          padding: "4px 6px",
          borderRadius: 12,
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          boxShadow: isDark
            ? "0 8px 32px rgba(0,0,0,0.5)"
            : "0 8px 32px rgba(0,0,0,0.15)",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <ToolbarButton
          style={mode === "picking" ? btnActive : btnBase}
          title="Click to annotate"
          onClick={() => setMode(mode === "picking" ? "idle" : "picking")}
          hoverBg={colors.bgAlt}
        >
          <IconPointer />
        </ToolbarButton>

        <ToolbarButton
          style={mode === "area-select" ? btnActive : btnBase}
          title="Drag to select area"
          onClick={() =>
            setMode(mode === "area-select" ? "picking" : "area-select")
          }
          hoverBg={colors.bgAlt}
        >
          <IconAreaSelect />
        </ToolbarButton>

        <ToolbarButton
          style={btnBase}
          title="Settings"
          onClick={() =>
            browser.runtime.sendMessage({ type: "OPEN_SETTINGS" })
          }
          hoverBg={colors.bgAlt}
        >
          <IconSettings />
        </ToolbarButton>

        <div style={separator} />

        {annotations.length > 0 && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: colors.textMuted,
              padding: "0 4px",
              minWidth: 20,
              textAlign: "center",
            }}
          >
            {annotations.length}
          </span>
        )}

        <ToolbarButton
          style={btnBase}
          title="Copy as markdown"
          onClick={handleCopy}
          hoverBg={colors.bgAlt}
        >
          <IconCopy />
        </ToolbarButton>

        <ToolbarButton
          style={{
            ...btnBase,
            opacity: pushLoading ? 0.5 : 1,
          }}
          title="Push to Kanban"
          onClick={handlePushAll}
          disabled={pushLoading}
          hoverBg={colors.bgAlt}
        >
          <IconSend />
        </ToolbarButton>

        <ToolbarButton
          style={btnBase}
          title="Clear all"
          onClick={() => setAnnotations([])}
          hoverBg={colors.bgAlt}
        >
          <IconTrash />
        </ToolbarButton>

        <div style={separator} />

        <ToolbarButton
          style={btnBase}
          title="Close (Esc)"
          onClick={() => setOpen(false)}
          hoverBg={colors.bgAlt}
        >
          <IconClose />
        </ToolbarButton>
      </div>
    </div>
  );
}

function ToolbarButton({
  children,
  style,
  title,
  onClick,
  disabled,
  hoverBg,
}: {
  children: React.ReactNode;
  style: React.CSSProperties;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  hoverBg: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...style,
        background:
          hovered && style.background === "transparent"
            ? hoverBg
            : style.background,
      }}
    >
      {children}
    </button>
  );
}
