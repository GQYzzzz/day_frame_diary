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

export function ChalkboardTexture({ darkInk = false }: { darkInk?: boolean }) {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
      preserveAspectRatio="none"
      style={{
        zIndex: 0,
        opacity: darkInk ? 0.13 : 0.24,
        mixBlendMode: darkInk ? "multiply" : "screen",
      }}
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
          values={`0 0 0 0 ${darkInk ? "0.22" : "0.82"}
                  0 0 0 0 ${darkInk ? "0.20" : "0.84"}
                  0 0 0 0 ${darkInk ? "0.16" : "0.78"}
                  0 0 0 .18 0`}
        />
      </filter>
      <rect width="100%" height="100%" filter="url(#dayframe-chalk-noise)" />
      <g
        stroke={darkInk ? "rgba(67,58,42,0.18)" : "rgba(255,255,255,0.12)"}
        strokeWidth="0.8"
      >
        <path d="M-20 130C110 119 251 141 420 126" />
        <path d="M-20 486C135 470 252 498 420 480" />
        <path d="M-20 810C138 796 281 823 420 806" />
      </g>
    </svg>
  );
}

export function VintageStarField() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 390 1000"
      preserveAspectRatio="none"
      aria-hidden
      style={{ zIndex: 1, opacity: 0.66 }}
    >
      <g fill="#e8d89b" stroke="#f3e7b7" strokeWidth="0.7">
        <path d="m14 35 2 4.6 5 .4-3.8 3.2 1.2 4.8-4.4-2.6L9.7 48l1.1-4.8L7 40l5-.4 2-4.6Z" />
        <path d="m109 74 1.7 3.8 4.1.3-3.1 2.7 1 4-3.7-2.2-3.5 2.2.9-4-3.1-2.7 4.1-.3 1.6-3.8Z" />
        <path d="m72 61 1 2.3 2.5.2-1.9 1.6.6 2.5-2.2-1.3-2.1 1.3.5-2.5-1.9-1.6 2.5-.2 1-2.3Z" />
        <path d="m22 174 1.5 3.4 3.8.3-2.9 2.5.9 3.6-3.3-1.9-3.2 1.9.8-3.6-2.8-2.5 3.7-.3 1.5-3.4Z" />
        <path d="m356 535 1.4 3.2 3.5.3-2.7 2.3.9 3.4-3.1-1.8-3 1.8.8-3.4-2.7-2.3 3.6-.3 1.4-3.2Z" />
        <path d="m385 620 2 4.7 5 .4-3.8 3.2 1.2 4.9-4.4-2.7-4.3 2.7 1.1-4.9-3.8-3.2 5-.4 2-4.7Z" />
        <path d="m354 754 1.6 3.6 3.9.3-3 2.6 1 3.8-3.5-2.1-3.3 2.1.8-3.8-2.9-2.6 3.9-.3 1.5-3.6Z" />
        <path d="m302 883 1.2 2.7 3 .2-2.3 2 .7 2.9-2.6-1.6-2.5 1.6.7-2.9-2.3-2 3-.2 1.1-2.7Z" />
        <circle cx="80" cy="115" r="1.2" />
        <circle cx="326" cy="318" r="1.1" />
        <circle cx="44" cy="518" r="1" />
        <circle cx="344" cy="844" r="1.3" />
      </g>
    </svg>
  );
}

export function CrumpledPaperTexture() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="none"
      aria-hidden
      style={{ zIndex: 0, opacity: 0.34, mixBlendMode: "multiply" }}
    >
      <filter id="dayframe-crumpled-paper">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.012 0.025"
          numOctaves="4"
          seed="43"
          result="noise"
        />
        <feDiffuseLighting
          in="noise"
          lightingColor="#ffffff"
          surfaceScale="4"
          diffuseConstant="1.2"
          result="light"
        >
          <feDistantLight azimuth="225" elevation="42" />
        </feDiffuseLighting>
        <feBlend in="SourceGraphic" in2="light" mode="multiply" />
      </filter>
      <rect
        width="100%"
        height="100%"
        fill="#f4f4f1"
        filter="url(#dayframe-crumpled-paper)"
      />
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

export function ChalkTitleUnderline({
  color = "#f2eadc",
}: {
  color?: string;
}) {
  return (
    <svg
      className="mx-auto mt-2 block h-4 w-[86%]"
      viewBox="0 0 300 20"
      fill="none"
      style={{ color }}
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
