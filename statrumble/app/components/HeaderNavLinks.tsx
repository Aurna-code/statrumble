"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLink = {
  href: string;
  label: string;
  isActive: (pathname: string) => boolean;
};

const NAV_LINKS: NavLink[] = [
  {
    href: "/",
    label: "StatRumble",
    isActive: (pathname) => pathname === "/",
  },
  {
    href: "/decisions",
    label: "Decisions",
    isActive: (pathname) => pathname.startsWith("/decisions"),
  },
  {
    href: "/workspaces",
    label: "Workspaces",
    isActive: (pathname) => pathname.startsWith("/workspaces") || pathname.startsWith("/workspace"),
  },
  {
    href: "/join",
    label: "Join",
    isActive: (pathname) => pathname.startsWith("/join"),
  },
];

export default function HeaderNavLinks() {
  const pathname = usePathname();

  return (
    <>
      {NAV_LINKS.map((link) => {
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
