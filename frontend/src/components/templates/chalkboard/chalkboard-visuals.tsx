import type { CSSProperties, ReactNode } from "react";

export type ChalkDoodleKind =
  | "heart"
  | "star"
  | "sparkle"
  | "steam"
  | "arrow"
  | "swirl"
  | "birds"
  | "bicycle";

type DoodleProps = {
  kind: ChalkDoodleKind;
  x: number;
  y: number;
  size?: number;
  rotate?: number;
  color?: string;
  opacity?: number;
  zIndex?: number;
};

function Heart() {
  return <path d="M32 53C18 44 9 35 11 23c2-10 15-12 21-2 6-10 19-8 21 2 2 12-7 21-21 30Z" />;
}

function Star() {
  return (
    <>
      <path d="m32 7 5.8 17.8L56 25l-14.8 10.6L46.5 53 32 42.7 17.5 53l5.3-17.4L8 25l18.2-.2L32 7Z" />
      <path d="M53 10v9M48.5 14.5h9" />
    </>
  );
}

function Sparkle() {
  return (
    <>
      <path d="M31 7c1 15 7 22 22 24-15 2-21 9-22 25-2-16-8-23-23-25 15-2 21-9 23-24Z" />
      <path d="M51 6c0 6 3 9 9 10-6 1-9 4-9 10-1-6-4-9-10-10 6-1 9-4 10-10Z" />
    </>
  );
}

function Steam() {
  return (
    <>
      <path d="M19 51c-8-12 8-15 0-28-4-7 2-13 7-17" />
      <path d="M33 53c-7-10 7-17 1-27-5-8 1-14 5-19" />
      <path d="M47 51c-6-9 6-13 1-23-3-6 0-10 4-14" />
      <path d="M10 57c14 3 29 3 44 0" />
    </>
  );
}

function Arrow() {
  return (
    <>
      <path d="M8 48c13-3 16-19 28-23 7-3 12 0 18-7" strokeDasharray="3 4" />
      <path d="m45 15 10 2-2 10" />
    </>
  );
}

function Swirl() {
  return (
    <>
      <path d="M8 38c7-20 34-24 42-8 7 14-15 24-24 13-7-9 8-16 15-8" />
      <path d="m10 29-2 9 9 2" />
    </>
  );
}

function Birds() {
  return (
    <>
      <path d="M7 31c6-8 12-8 18 0 6-8 12-8 18 0" />
      <path d="M31 47c5-6 10-6 15 0 5-6 9-6 13 0" />
    </>
  );
}

function Bicycle() {
  return (
    <>
      <circle cx="16" cy="45" r="11" />
      <circle cx="49" cy="45" r="11" />
      <path d="m16 45 10-19 10 19H16l13-13h12l8 13M26 26h-7M38 21h8" />
      <path d="m36 45-7-20" />
    </>
  );
}

function doodleShape(kind: ChalkDoodleKind): ReactNode {
  switch (kind) {
    case "heart":
      return <Heart />;
    case "star":
      return <Star />;
    case "sparkle":
      return <Sparkle />;
    case "steam":
      return <Steam />;
    case "arrow":
      return <Arrow />;
    case "birds":
      return <Birds />;
    case "bicycle":
      return <Bicycle />;
    default:
      return <Swirl />;
  }
}

export function ChalkDoodle({
  kind,
  x,
  y,
  size = 28,
  rotate = 0,
  color = "#f5efe2",
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
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <g opacity="0.24" transform="translate(0.8 0.6)">
        {doodleShape(kind)}
      </g>
      <g>{doodleShape(kind)}</g>
    </svg>
  );
}

export function ChalkboardTexture() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
      preserveAspectRatio="none"
      style={{ zIndex: 0, opacity: 0.24, mixBlendMode: "screen" }}
    >
      <filter id="dayframe-chalk-noise">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.72"
          numOctaves="3"
          seed="17"
        />
        <feColorMatrix
          type="matrix"
          values="0 0 0 0 0.82
                  0 0 0 0 0.84
                  0 0 0 0 0.78
                  0 0 0 .18 0"
        />
      </filter>
      <rect width="100%" height="100%" filter="url(#dayframe-chalk-noise)" />
      <g stroke="rgba(255,255,255,0.12)" strokeWidth="0.8">
        <path d="M-20 130C110 119 251 141 420 126" />
        <path d="M-20 486C135 470 252 498 420 480" />
        <path d="M-20 810C138 796 281 823 420 806" />
      </g>
    </svg>
  );
}

type TapeProps = {
  side: "left" | "right";
  tone?: "kraft" | "cream" | "rose";
};

const TAPE_COLORS = {
  kraft: "rgba(211, 185, 142, 0.78)",
  cream: "rgba(239, 226, 190, 0.82)",
  rose: "rgba(224, 177, 179, 0.76)",
} as const;

export function PaperTape({ side, tone = "kraft" }: TapeProps) {
  return (
    <span
      className="pointer-events-none absolute h-[15px] w-[46px] shadow-[0_1px_2px_rgba(0,0,0,0.18)]"
      style={{
        top: -7,
        left: side === "left" ? 12 : undefined,
        right: side === "right" ? 12 : undefined,
        zIndex: 5,
        opacity: 0.9,
        transform: `rotate(${side === "left" ? -8 : 8}deg)`,
        backgroundColor: TAPE_COLORS[tone],
        backgroundImage:
          "repeating-linear-gradient(90deg, transparent 0 5px, rgba(255,255,255,0.12) 5px 6px)",
        clipPath:
          "polygon(2% 10%, 98% 0, 95% 92%, 3% 100%, 0 65%)",
      }}
      aria-hidden
    />
  );
}

export function ChalkTitleUnderline() {
  return (
    <svg
      className="mx-auto mt-2 block h-4 w-[86%] text-[#f2eadc]"
      viewBox="0 0 300 20"
      fill="none"
      aria-hidden
    >
      <path
        d="M8 11C73 3 149 16 292 7"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        opacity="0.8"
      />
      <path
        d="M20 15C102 9 199 17 273 12"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeLinecap="round"
        opacity="0.3"
      />
    </svg>
  );
}
