"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLink = {
  href: string;
  label: string;
  isActive: (pathname: string) => boolean;
};

type HeaderNavLinksProps = {
  showJoin?: boolean;
};

const BASE_NAV_LINKS: NavLink[] = [
  {
    href: "/",
    label: "Arena",
    isActive: (pathname) => pathname === "/",
  },
  {
    href: "/threads",
    label: "Threads",
    isActive: (pathname) => pathname.startsWith("/threads"),
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
];

const JOIN_NAV_LINK: NavLink = {
  href: "/join",
  label: "Join",
  isActive: (pathname) => pathname.startsWith("/join"),
};

export default function HeaderNavLinks({ showJoin = true }: HeaderNavLinksProps) {
  const pathname = usePathname();
  const navLinks = showJoin ? [...BASE_NAV_LINKS, JOIN_NAV_LINK] : BASE_NAV_LINKS;

  return (
    <>
      {navLinks.map((link) => {
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
