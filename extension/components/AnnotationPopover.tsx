import { useState, useEffect, useRef } from "react";
import type { ThemeColors } from "@/utils/theme";

interface Board {
  id: string;
  name: string;
}
interface Column {
  id: string;
  name: string;
}
interface Agent {
  id: string;
  name: string;
  emoji?: string;
}

interface AnnotationPopoverProps {
  position: { x: number; y: number };
  colors: ThemeColors;
  onCancel: () => void;
  onAdd: (
    note: string,
    boardId: string,
    columnId: string,
    agentId: string,
  ) => void;
  onSend: (
    note: string,
    boardId: string,
    columnId: string,
    agentId: string,
  ) => Promise<void>;
}

export function AnnotationPopover({
  position,
  colors,
  onCancel,
  onAdd,
  onSend,
}: AnnotationPopoverProps) {
  const [note, setNote] = useState("");
  const [boards, setBoards] = useState<Board[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [boardId, setBoardId] = useState("");
  const [columnId, setColumnId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [loading, setLoading] = useState(true);
  const [sendLoading, setSendLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    Promise.all([
      browser.runtime.sendMessage({ type: "FETCH_BOARDS" }),
      browser.runtime.sendMessage({ type: "FETCH_AGENTS" }),
    ]).then(([boardsRes, agentsRes]) => {
      if (boardsRes.ok) {
        const b = boardsRes.boards || [];
        setBoards(b);
        if (b.length) {
          setBoardId(boardsRes.defaultBoardId || b[0].id);
        }
      }
      if (agentsRes.ok) {
        setAgents(agentsRes.agents || []);
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!boardId) return;
    browser.runtime
      .sendMessage({ type: "FETCH_COLUMNS", boardId })
      .then((res) => {
        if (res.ok) {
          const cols = res.columns || [];
          setColumns(cols);
          if (cols.length) {
            setColumnId(res.defaultColumnId || cols[0].id);
          } else {
            setColumnId("");
          }
        }
      });
  }, [boardId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onAdd(note, boardId, columnId, agentId);
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  const handleSend = async () => {
    setSendLoading(true);
    try {
      await onSend(note, boardId, columnId, agentId);
    } finally {
      setSendLoading(false);
    }
  };

  const selectStyle: React.CSSProperties = {
    width: "100%",
    background: colors.bgAlt,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    color: colors.text,
    fontSize: 12,
    padding: "6px 8px",
    outline: "none",
  };

  const clampedLeft = Math.min(position.x, window.innerWidth - 280);
  const clampedTop = Math.min(position.y, window.innerHeight - 300);

  return (
    <div
      style={{
        position: "fixed",
        top: clampedTop,
        left: clampedLeft,
        width: 260,
        padding: 12,
        borderRadius: 10,
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        zIndex: 2147483647,
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: colors.text,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <textarea
        ref={textareaRef}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="What needs to change?"
        rows={2}
        style={{
          width: "100%",
          background: colors.bgAlt,
          border: `1px solid ${colors.border}`,
          borderRadius: 6,
          color: colors.text,
          fontSize: 13,
          padding: 8,
          resize: "none",
          outline: "none",
          boxSizing: "border-box",
        }}
      />

      {!loading && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 6,
            marginTop: 8,
          }}
        >
          <select
            value={boardId}
            onChange={(e) => setBoardId(e.target.value)}
            style={selectStyle}
          >
            {!boards.length ? (
              <option value="">No boards available</option>
            ) : null}
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          <select
            value={columnId}
            onChange={(e) => setColumnId(e.target.value)}
            style={selectStyle}
          >
            {!columns.length ? (
              <option value="">TODO / first column</option>
            ) : null}
            {columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            style={{ ...selectStyle, gridColumn: "1 / -1" }}
          >
            <option value="">No agent</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.emoji ? `${a.emoji} ` : ""}
                {a.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 6,
          marginTop: 8,
          justifyContent: "flex-end",
        }}
      >
        <PopoverButton colors={colors} onClick={onCancel}>
          Cancel
        </PopoverButton>
        <PopoverButton
          colors={colors}
          onClick={() => onAdd(note, boardId, columnId, agentId)}
        >
          + Add
        </PopoverButton>
        <PopoverButton
          colors={colors}
          accent
          onClick={handleSend}
          disabled={sendLoading || !boardId}
          style={{ opacity: sendLoading || !boardId ? 0.7 : 1 }}
        >
          {sendLoading ? "..." : "Send"}
        </PopoverButton>
      </div>
    </div>
  );
}

function PopoverButton({
  children,
  colors,
  accent,
  onClick,
  disabled,
  style,
}: {
  children: React.ReactNode;
  colors: ThemeColors;
  accent?: boolean;
  onClick: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: accent ? "#3b82f6" : colors.bgAlt,
        color: accent ? "#fff" : colors.text,
        border: accent ? "none" : `1px solid ${colors.border}`,
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 500,
        padding: "5px 10px",
        cursor: "pointer",
        transition: "background 0.15s",
        ...style,
      }}
    >
      {children}
    </button>
  );
}
