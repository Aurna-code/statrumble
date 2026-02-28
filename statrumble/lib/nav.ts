export type NavItem = {
  href: string;
  label: string;
  isActive: (pathname: string) => boolean;
};

const PORTAL_NAV_ITEM: NavItem = {
  href: "/portal",
  label: "Portal",
  isActive: (pathname) => pathname.startsWith("/portal") || pathname.startsWith("/p/"),
};

const BASE_APP_NAV_ITEMS: NavItem[] = [
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

const JOIN_NAV_ITEM: NavItem = {
  href: "/join",
  label: "Join",
  isActive: (pathname) => pathname.startsWith("/join"),
};

export function isPublicPathname(pathname: string): boolean {
  return pathname === "/portal" || pathname.startsWith("/portal/") || pathname.startsWith("/p/");
}

export function getHeaderNavItems(opts: {
  pathname: string;
  isAuthenticated: boolean;
  showJoin: boolean;
}): NavItem[] {
  const isPublic = isPublicPathname(opts.pathname);
  const appNavItems = opts.isAuthenticated && opts.showJoin ? [...BASE_APP_NAV_ITEMS, JOIN_NAV_ITEM] : BASE_APP_NAV_ITEMS;

  if (isPublic && !opts.isAuthenticated) {
    return [PORTAL_NAV_ITEM];
  }

  if (isPublic && opts.isAuthenticated) {
    return [PORTAL_NAV_ITEM, ...appNavItems];
  }

  return appNavItems;
}
