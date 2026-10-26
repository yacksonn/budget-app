"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/budgets", label: "Budgets" },
  { href: "/categories", label: "Categories" },
  { href: "/accounts", label: "Accounts" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="flex items-center justify-between gap-4 border-b border-surface-border py-4">
      <Link href="/" className="flex items-center gap-2 text-lg font-bold text-ink">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">
          $
        </span>
        Budget App
      </Link>
      <nav className="flex flex-wrap items-center gap-1">
        {LINKS.map((link) => {
          const active =
            link.href === "/"
              ? pathname === "/"
              : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-brand-50 text-brand-700 dark:text-brand-300"
                  : "text-ink-soft hover:bg-surface-soft"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
        <ThemeToggle />
      </nav>
    </header>
  );
}
