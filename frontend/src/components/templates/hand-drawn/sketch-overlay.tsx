"use client";

import { SketchDecoration } from "@/components/templates/hand-drawn/sketch-decoration";
import { resolveCalloutLayout } from "@/lib/sketch/layout-callouts";
import { resolveCalloutOutline } from "@/lib/sketch/contour-shapes";
import {
  connectorPath,
  handDrawnContourPath,
  labelAnchorEdge,
  nearestPointOnContour,
} from "@/lib/sketch/sketch-paths";
import type { PhotoSketch } from "@/lib/types";

const STROKE = "rgba(255,255,255,0.92)";
const STROKE_DIM = "rgba(255,255,255,0.55)";

type Props = {
  sketch: PhotoSketch;
  seed: number;
  className?: string;
};

export function SketchOverlay({ sketch, seed, className }: Props) {
  const callouts = resolveCalloutLayout(
    sketch.callouts,
    sketch.summaryX,
    sketch.summaryY,
    seed,
  );

  return (
    <svg
      className={`pointer-events-none absolute inset-0 h-full w-full ${className ?? ""}`}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <filter id={`sketch-glow-${seed}`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0" stdDeviation="0.4" floodColor="#000" floodOpacity="0.35" />
        </filter>
      </defs>
      {callouts.map((c, i) => {
        const contour = resolveCalloutOutline(c);
        const outline = handDrawnContourPath(contour, seed + i * 7);
        const lx = c.labelX * 100;
        const ly = c.labelY * 100;
        const anchor = nearestPointOnContour(contour, lx, ly);
        const edge = labelAnchorEdge(lx, ly, anchor.x, anchor.y);
        const conn = connectorPath(
          edge.x,
          edge.y,
          anchor.x,
          anchor.y,
          seed + i * 31,
          i % 2 === 1,
        );
        const decoX = lx + 3;
        const decoY = ly - 5;
        return (
          <g key={`${i}-${c.subject}`} filter={`url(#sketch-glow-${seed})`}>
            <path
              d={outline}
              fill="none"
              stroke={STROKE}
              strokeWidth="0.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              style={{ vectorEffect: "non-scaling-stroke" }}
            />
            <path
              d={conn.d}
              fill="none"
              stroke={STROKE_DIM}
              strokeWidth="0.45"
              strokeDasharray={conn.dashed ? "1.2 1.4" : undefined}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{ vectorEffect: "non-scaling-stroke" }}
            />
            <text
              x={lx}
              y={ly}
              fill="white"
              fontSize="3.2"
              fontFamily="var(--font-sketch), Caveat, cursive"
              fontWeight="500"
              textAnchor="start"
              dominantBaseline="middle"
              style={{
                paintOrder: "stroke fill",
                stroke: "rgba(0,0,0,0.45)",
                strokeWidth: 0.35,
              }}
            >
              {c.text}
            </text>
            {c.decoration ? (
              <SketchDecoration kind={c.decoration} x={decoX} y={decoY} size={3.5} />
            ) : null}
          </g>
        );
      })}
      {sketch.summary ? (
        <text
          x={sketch.summaryX * 100}
          y={sketch.summaryY * 100}
          fill="white"
          fontSize="3.6"
          fontFamily="var(--font-sketch), Caveat, cursive"
          fontWeight="600"
          textAnchor="end"
          dominantBaseline="middle"
          style={{
            paintOrder: "stroke fill",
            stroke: "rgba(0,0,0,0.5)",
            strokeWidth: 0.4,
          }}
        >
          {sketch.summary}
        </text>
      ) : null}
      <SketchDecoration kind="sparkle" x={12} y={14} size={3} />
      <SketchDecoration kind="sparkle" x={88} y={sketch.summaryY * 100 - 8} size={2.5} />
    </svg>
  );
}
