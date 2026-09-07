import React, { useEffect, useRef, useState } from "react";

export interface SignaturePadHandle {
  clear: () => void;
  isEmpty: () => boolean;
  toDataUrl: () => string;
}

interface SignaturePadProps {
  /** Called on every stroke end with the current PNG data URL, or "" once cleared. */
  onChange?: (dataUrl: string) => void;
  height?: number;
}

/**
 * A freehand signature canvas -- draw with a stylus, finger, or mouse via
 * the Pointer Events API (which unifies all three input types, including
 * real stylus pressure-capable devices), traced with a real pen-like
 * stroke rather than jagged line segments.
 */
export default function SignaturePad({ onChange, height = 160 }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [hasStrokes, setHasStrokes] = useState(false);

  // Backs the canvas with real device pixels (crisp on high-DPI phones/
  // tablets -- exactly the devices a customer signs on) while keeping the
  // drawing coordinate space in plain CSS pixels.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#1F3557";
      ctx.lineWidth = 2.4;
    }
  }, []);

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drawingRef.current = true;
    lastPointRef.current = pointFromEvent(e);
  };
  const drawStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const last = lastPointRef.current;
    if (!ctx || !last) return;
    const point = pointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
    if (!hasStrokes) setHasStrokes(true);
  };
  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    const canvas = canvasRef.current;
    if (canvas) onChange?.(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
    onChange?.("");
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height, touchAction: "none", cursor: "crosshair" }}
        className="bg-white border-2 border-dashed border-[#9EC8EF] rounded-xl"
        onPointerDown={startStroke}
        onPointerMove={drawStroke}
        onPointerUp={endStroke}
        onPointerLeave={endStroke}
        onPointerCancel={endStroke}
        role="img"
        aria-label="Draw your signature here"
      />
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[10px] text-[#5E7393] font-semibold">{hasStrokes ? "Signature captured" : "Sign above with your finger or stylus"}</span>
        <button type="button" onClick={clear} className="text-[10px] font-bold text-[#315C9F] hover:text-[#1F3557] cursor-pointer underline">Clear</button>
      </div>
    </div>
  );
}
