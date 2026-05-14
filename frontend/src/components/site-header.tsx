import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/85 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/85">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          DayFrame
        </Link>
        <nav className="flex items-center gap-5 text-sm text-zinc-600 dark:text-zinc-300">
          <Link className="hover:text-zinc-900 dark:hover:text-white" href="/upload">
            新建
          </Link>
          <Link className="hover:text-zinc-900 dark:hover:text-white" href="/history">
            历史
          </Link>
        </nav>
      </div>
    </header>
  );
}
