"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getHeaderNavItems } from "@/lib/nav";

type HeaderNavLinksProps = {
  isAuthenticated: boolean;
  showJoin?: boolean;
};

export default function HeaderNavLinks({ isAuthenticated, showJoin = false }: HeaderNavLinksProps) {
  const pathname = usePathname() ?? "/";
  const navItems = getHeaderNavItems({ pathname, isAuthenticated, showJoin });

  return (
    <>
      {navItems.map((item) => {
        const active = item.isActive(pathname);
        const className = active
          ? "font-semibold text-zinc-900"
          : "text-zinc-600 hover:text-zinc-900";

        return (
          <Link key={item.href} href={item.href} className={className}>
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
