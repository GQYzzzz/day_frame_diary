type Props = {
  kind: "heart" | "sparkle" | "steam" | "smile" | "star";
  x: number;
  y: number;
  size?: number;
};

export function SketchDecoration({ kind, x, y, size = 10 }: Props) {
  const s = size;
  if (kind === "heart") {
    return (
      <text
        x={x}
        y={y}
        fill="white"
        fontSize={s}
        fontFamily="Georgia, serif"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        ♡
      </text>
    );
  }
  if (kind === "smile") {
    return (
      <text
        x={x}
        y={y}
        fill="white"
        fontSize={s * 0.85}
        fontFamily="ui-rounded, system-ui"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        :)
      </text>
    );
  }
  if (kind === "sparkle" || kind === "star") {
    return (
      <g transform={`translate(${x - s / 2}, ${y - s / 2})`} fill="none" stroke="white" strokeWidth="1.2">
        <path
          d={`M ${s / 2} 0 L ${s * 0.55} ${s * 0.45} L ${s} ${s / 2} L ${s * 0.55} ${s * 0.55} L ${s / 2} ${s} L ${s * 0.45} ${s * 0.55} L 0 ${s / 2} L ${s * 0.45} ${s * 0.45} Z`}
          strokeLinejoin="round"
        />
      </g>
    );
  }
  // steam
  return (
    <g stroke="white" strokeWidth="1.2" fill="none" strokeLinecap="round">
      <path d={`M ${x - 4} ${y + 4} Q ${x - 5} ${y - 6} ${x - 3} ${y - 10}`} />
      <path d={`M ${x} ${y + 4} Q ${x + 1} ${y - 8} ${x} ${y - 12}`} />
      <path d={`M ${x + 4} ${y + 4} Q ${x + 5} ${y - 5} ${x + 3} ${y - 9}`} />
    </g>
  );
}
