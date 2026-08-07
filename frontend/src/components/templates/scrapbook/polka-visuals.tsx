import type { CSSProperties, ReactNode } from "react";

export type PolkaDoodleKind =
  | "heart"
  | "star"
  | "sparkle"
  | "swirl"
  | "arrow"
  | "bear"
  | "face";

type DoodleProps = {
  kind: PolkaDoodleKind;
  x: number;
  y: number;
  size?: number;
  rotate?: number;
  color?: string;
  fill?: string;
  opacity?: number;
  zIndex?: number;
};

function doodleShape(kind: PolkaDoodleKind): ReactNode {
  switch (kind) {
    case "heart":
      return (
        <path d="M32 53C18 44 9 35 11 23c2-10 15-12 21-2 6-10 19-8 21 2 2 12-7 21-21 30Z" />
      );
    case "star":
      return (
        <path d="m32 7 6 18 19 .2-15 11 5.5 18L32 44 16.5 54.2 22 36.2 7 25.2 26 25 32 7Z" />
      );
    case "sparkle":
      return (
        <>
          <path d="M30 5c1 16 8 24 24 26-16 2-23 10-24 27-2-17-9-25-24-27 15-2 22-10 24-26Z" />
          <path d="M52 7c0 6 3 9 9 10-6 1-9 4-9 10-1-6-4-9-10-10 6-1 9-4 10-10Z" />
        </>
      );
    case "arrow":
      return (
        <>
          <path d="M7 48c14-2 17-20 30-24 7-2 12 1 18-6" strokeDasharray="3 4" />
          <path d="m46 14 10 3-3 10" />
        </>
      );
    case "bear":
      return (
        <>
          <circle cx="17" cy="18" r="8" />
          <circle cx="47" cy="18" r="8" />
          <path d="M13 40c0-15 8-25 19-25s19 10 19 25c0 12-8 19-19 19S13 52 13 40Z" />
          <path d="M24 39c4-5 12-5 16 0M27 31h.2M37 31h.2M32 39v5" />
        </>
      );
    case "face":
      return (
        <>
          <path d="M12 19c5-13 35-15 42 1 5 12-1 34-21 38C13 55 6 33 12 19Z" />
          <path d="M22 31h.2M42 31h.2M23 43c6 5 12 5 18 0" />
          <path d="M14 20c2-10 12-15 20-13M48 19c-3-8-10-12-17-12" />
        </>
      );
    default:
      return (
        <>
          <path d="M8 38c7-20 34-24 42-8 7 14-15 24-24 13-7-9 8-16 15-8" />
          <path d="m10 29-2 9 9 2" />
        </>
      );
  }
}

export function PolkaDoodle({
  kind,
  x,
  y,
  size = 30,
  rotate = 0,
  color = "#272522",
  fill = "none",
  opacity = 0.82,
  zIndex = 60,
}: DoodleProps) {
  const style: CSSProperties = {
    position: "absolute",
    left: x,
    top: y,
    width: size,
    height: size,
    color,
    opacity,
    transform: `rotate(${rotate}deg)`,
    zIndex,
    pointerEvents: "none",
  };
  return (
    <svg
      style={style}
      viewBox="0 0 64 64"
      fill={fill}
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {doodleShape(kind)}
    </svg>
  );
}

export function PolkaPaperTexture() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
      <div
        className="absolute inset-0 opacity-35"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 30%, rgba(255,255,255,.35), transparent 34%), linear-gradient(112deg, rgba(255,255,255,.14), transparent 42%, rgba(70,68,65,.05))",
        }}
      />
      <svg className="absolute inset-0 h-full w-full opacity-[0.08]">
        <filter id="dayframe-polka-paper-noise">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.82"
            numOctaves="3"
            seed="29"
          />
        </filter>
        <rect
          width="100%"
          height="100%"
          filter="url(#dayframe-polka-paper-noise)"
        />
      </svg>
    </div>
  );
}

export function WashiTape({
  side,
  tone,
}: {
  side: "left" | "right";
  tone: "cream" | "pink" | "yellow";
}) {
  const colors = {
    cream: "rgba(255,250,230,.88)",
    pink: "rgba(244,177,188,.82)",
    yellow: "rgba(246,223,122,.84)",
  };
  return (
    <span
      className="pointer-events-none absolute h-[17px] w-[50px] shadow-[0_1px_2px_rgba(74,66,58,.12)]"
      style={{
        top: -8,
        left: side === "left" ? 10 : undefined,
        right: side === "right" ? 10 : undefined,
        zIndex: 6,
        transform: `rotate(${side === "left" ? -7 : 7}deg)`,
        backgroundColor: colors[tone],
        backgroundImage:
          "repeating-linear-gradient(90deg, transparent 0 6px, rgba(255,255,255,.18) 6px 7px)",
        clipPath: "polygon(2% 12%, 99% 0, 96% 92%, 0 100%)",
      }}
      aria-hidden
    />
  );
}

export function ComicBurst({ color = "#fff" }: { color?: string }) {
  return (
    <svg
      className="pointer-events-none absolute -right-5 -top-5 h-14 w-14"
      viewBox="0 0 64 64"
      aria-hidden
    >
      <path
        d="m32 2 6 16 15-8-5 17 15 4-15 7 9 14-18-5-4 16-8-15-14 10 4-18-16-3 15-8L7 15l18 5 7-18Z"
        fill={color}
        stroke="#292724"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M24 31c5-5 11-5 16 0M26 38c4 3 8 3 12 0"
        fill="none"
        stroke="#292724"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
