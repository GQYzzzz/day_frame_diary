type Props = {
  id: string;
  size: number;
  rotate: number;
};

export function ScrapbookSticker({ id, size, rotate }: Props) {
  const style = {
    width: size,
    height: size,
    transform: `rotate(${rotate}deg)`,
  };

  switch (id) {
    case "star-pink":
      return (
        <span
          style={style}
          className="inline-block text-[length:var(--sz)] text-rose-400"
          aria-hidden
        >
          <span style={{ fontSize: size }}>★</span>
        </span>
      );
    case "star-white":
      return (
        <span style={style} className="inline-block text-white drop-shadow" aria-hidden>
          <span style={{ fontSize: size }}>★</span>
        </span>
      );
    case "tape":
      return (
        <span
          style={{ ...style, width: size * 1.8, height: size * 0.45 }}
          className="inline-block rounded-sm bg-sky-200/90 opacity-90 shadow-sm"
          aria-hidden
        />
      );
    case "heart":
      return (
        <span style={style} className="inline-block text-rose-500" aria-hidden>
          <span style={{ fontSize: size }}>♥</span>
        </span>
      );
    default:
      return (
        <span style={style} className="inline-block text-amber-300" aria-hidden>
          <span style={{ fontSize: size }}>✦</span>
        </span>
      );
  }
}
