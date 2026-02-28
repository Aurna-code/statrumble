"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getHeaderNavItems } from "@/lib/nav";

type HeaderNavLinksProps = {
  isAuthenticated: boolean;
  showJoin?: boolean;
};

export default function HeaderNavLinks({ isAuthenticated, showJoin = false }: HeaderNavLinksProps) {
  const pathname = usePathname();
  const navItems = getHeaderNavItems({
    pathname,
    isAuthenticated,
    showJoin,
  });

  return (
    <>
      {navItems.map((link) => {
        const active = link.isActive(pathname);
        const className = active
          ? "font-semibold text-zinc-900"
          : "text-zinc-600 hover:text-zinc-900";

        return (
          <Link key={link.href} href={link.href} className={className}>
            {link.label}
          </Link>
        );
      })}
    </>
  );
}
