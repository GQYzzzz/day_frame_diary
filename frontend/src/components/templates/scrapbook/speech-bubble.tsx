import type { BubbleRole } from "@/lib/templates/layout-types";

type Props = {
  role: BubbleRole;
  text: string;
  width: number;
  className?: string;
};

const roleStyles: Record<BubbleRole, string> = {
  title:
    "border-2 border-zinc-900 bg-white/95 text-[13px] font-semibold leading-snug",
  diary:
    "border-2 border-zinc-800 bg-white/90 text-[10px] leading-snug",
  caption:
    "border-2 border-zinc-700 bg-white text-[10px] leading-snug",
  hashtags:
    "border border-zinc-400 bg-white/80 text-[9px] tracking-wide text-zinc-600",
};

export function SpeechBubble({ role, text, width, className = "" }: Props) {
  return (
    <div
      className={`relative rounded-2xl px-3 py-2 shadow-[2px_3px_0_rgba(0,0,0,0.12)] ${roleStyles[role]} ${className}`}
      style={{ width, maxWidth: width }}
    >
      <p className="whitespace-pre-wrap break-words">{text}</p>
      {role !== "hashtags" ? (
        <span
          className="absolute -bottom-2 left-5 h-3 w-3 rotate-45 border-b-2 border-r-2 border-zinc-800 bg-white"
          aria-hidden
        />
      ) : null}
    </div>
  );
}
