import { useEffect, useRef } from "react";

export default function BladePreview({
  slices,
  label,
  width,
  height,
}: {
  slices: string[][];
  label: string;
  width: number;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const sliceCount = slices.length || 180;
    const pixelCount = slices[0]?.length || 72;
    const colW = width / sliceCount;
    const rowH = height / pixelCount;

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);

    for (let s = 0; s < sliceCount; s++) {
      const slice = slices[s];
      if (!slice) continue;
      for (let p = 0; p < pixelCount; p++) {
        const color = slice[p] ?? "#000000";
        if (color === "#000000") continue;
        ctx.fillStyle = color;
        ctx.fillRect(s * colW, p * rowH, Math.ceil(colW), Math.ceil(rowH));
      }
    }

    // Label
    ctx.fillStyle = "white";
    ctx.font = "12px sans-serif";
    ctx.fillText(label, 6, 16);
  }, [slices, label, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ borderRadius: 4, display: "block" }}
    />
  );
}
