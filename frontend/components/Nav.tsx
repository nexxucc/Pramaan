"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/metrics", label: "Model performance" },
  { href: "/cases", label: "Case queue" },
  { href: "/simulate", label: "Run a dispute" },
];

export function Nav() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-8 px-6">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-[15px] font-semibold tracking-tight">
            Pramaan
          </span>
          <span className="text-[11px] text-faint">प्रमाण</span>
        </Link>

        <nav className="flex items-center gap-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-2.5 py-1.5 text-[12.5px] transition-colors ${
                isActive(l.href)
                  ? "bg-surface-2 font-medium text-ink"
                  : "text-muted hover:text-ink"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <span className="ml-auto hidden text-[11.5px] text-faint sm:block">
          Chargeback evidence auditor
        </span>
      </div>
    </header>
  );
}
