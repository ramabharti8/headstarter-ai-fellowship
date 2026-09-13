import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useWhiteboard } from "../hooks/useWhiteboard";
import { api } from "../lib/api";
import PresenceBar from "../components/PresenceBar";
import { CopyIcon, EraserIcon, TrashIcon } from "../components/icons";

const CANVAS_WIDTH = 1600;
const CANVAS_HEIGHT = 900;
const COLORS = ["#eef0f4", "#f0525a", "#f0a63a", "#34d399", "#22d3ee", "#8a6dff"];
const SIZES = [2, 4, 8, 16];

function guestIdentity() {
  let name = sessionStorage.getItem("sb_guest_name");
  let color = sessionStorage.getItem("sb_guest_color");
  if (!name) {
    name = `Guest-${Math.floor(Math.random() * 10000)}`;
    sessionStorage.setItem("sb_guest_name", name);
  }
  if (!color) {
    const palette = ["#6d8bff", "#8a6dff", "#34d399", "#f0a63a", "#ec4899", "#22d3ee"];
    color = palette[Math.floor(Math.random() * palette.length)];
    sessionStorage.setItem("sb_guest_color", color);
  }
  return { name, color };
}

export default function Whiteboard() {
  const { boardId } = useParams();
  const { user, token } = useAuth();
  const toast = useToast();
  const guest = useRef(guestIdentity()).current;

  const username = user?.username || guest.name;
  const color = user?.color || guest.color;

  const [title, setTitle] = useState("");
  const [penColor, setPenColor] = useState(COLORS[0]);
  const [penSize, setPenSize] = useState(SIZES[1]);
  const [erasing, setErasing] = useState(false);
  const [copied, setCopied] = useState(false);

  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const currentStrokeRef = useRef(null);

  useEffect(() => {
    api.getWhiteboard(boardId).then((b) => setTitle(b.title)).catch(() => {});
  }, [boardId]);

  const handleEvent = useCallback((event) => event.type === "error" && toast.error(event.message), [toast]);

  const { strokes, presence, pointers, connected, addStroke, clearBoard, movePointer } = useWhiteboard({
    boardId,
    username,
    token,
    color,
    onEvent: handleEvent,
  });

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#12151c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const stroke of strokes) {
      if (!stroke.points || stroke.points.length < 2) continue;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(stroke.points[0][0], stroke.points[0][1]);
      for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(stroke.points[i][0], stroke.points[i][1]);
      ctx.stroke();
    }
  }, [strokes]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const toCanvasPoint = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    return [Math.round(x), Math.round(y)];
  };

  const startDraw = (e) => {
    const point = toCanvasPoint(e);
    drawingRef.current = true;
    currentStrokeRef.current = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      color: erasing ? "#12151c" : penColor,
      size: erasing ? penSize * 4 : penSize,
      points: [point],
    };
  };

  const moveDraw = (e) => {
    const point = toCanvasPoint(e);
    movePointer(point);
    if (!drawingRef.current || !currentStrokeRef.current) return;

    currentStrokeRef.current.points.push(point);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pts = currentStrokeRef.current.points;
    ctx.strokeStyle = currentStrokeRef.current.color;
    ctx.lineWidth = currentStrokeRef.current.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[pts.length - 2][0], pts[pts.length - 2][1]);
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    ctx.stroke();
  };

  const endDraw = () => {
    if (drawingRef.current && currentStrokeRef.current?.points.length > 1) {
      addStroke(currentStrokeRef.current);
    }
    drawingRef.current = false;
    currentStrokeRef.current = null;
  };

  const copyLink = () => {
    navigator.clipboard?.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="editor-layout">
      <div className="editor-header">
        <div className="editor-header-left">
          <span className="doc-id-chip">{boardId}</span>
          <span className="doc-title-static">{title || "Untitled board"}</span>
          <span className={`connection-dot ${connected ? "online" : "offline"}`} title={connected ? "Connected" : "Reconnecting…"} />
        </div>
        <div className="editor-header-right">
          <PresenceBar users={presence} />
          <button className="icon-link-btn" onClick={copyLink} type="button">
            <CopyIcon width={16} height={16} />
            {copied ? "Copied" : "Share"}
          </button>
        </div>
      </div>

      <div className="whiteboard-toolbar">
        {COLORS.map((c) => (
          <button
            key={c}
            className={`color-swatch ${!erasing && penColor === c ? "selected" : ""}`}
            style={{ background: c }}
            onClick={() => {
              setErasing(false);
              setPenColor(c);
            }}
          />
        ))}
        <div className="toolbar-divider" />
        {SIZES.map((s) => (
          <button key={s} className={`size-swatch ${penSize === s ? "selected" : ""}`} onClick={() => setPenSize(s)}>
            <span style={{ width: s + 2, height: s + 2 }} />
          </button>
        ))}
        <div className="toolbar-divider" />
        <button className={erasing ? "control-btn active" : "control-btn"} onClick={() => setErasing((v) => !v)} title="Eraser">
          <EraserIcon width={18} height={18} />
        </button>
        <button className="control-btn active-danger" onClick={clearBoard} title="Clear board">
          <TrashIcon width={18} height={18} />
        </button>
      </div>

      <div className="whiteboard-canvas-wrap">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onMouseDown={startDraw}
          onMouseMove={moveDraw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
        />
        {Array.from(pointers.entries()).map(([socketId, p]) => (
          <div
            key={socketId}
            className="remote-pointer"
            style={{
              left: `${(p.position[0] / CANVAS_WIDTH) * 100}%`,
              top: `${(p.position[1] / CANVAS_HEIGHT) * 100}%`,
            }}
          >
            <span className="remote-pointer-dot" />
            <span className="remote-pointer-label">{p.username}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
