export type NavItem = {
  href: string;
  label: string;
  isActive: (pathname: string) => boolean;
};

function normalizePathname(pathname: string): string {
  if (!pathname) {
    return "/";
  }

  if (pathname !== "/" && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

const portalNavItem: NavItem = {
  href: "/portal",
  label: "Portal",
  isActive: (pathname) => {
    const normalized = normalizePathname(pathname);
    return normalized.startsWith("/portal") || normalized.startsWith("/p/");
  },
};

function getAppNavItems(showJoin: boolean): NavItem[] {
  const appNavItems: NavItem[] = [
    {
      href: "/",
      label: "Arena",
      isActive: (pathname) => normalizePathname(pathname) === "/",
    },
    {
      href: "/threads",
      label: "Threads",
      isActive: (pathname) => normalizePathname(pathname).startsWith("/threads"),
    },
    {
      href: "/decisions",
      label: "Decisions",
      isActive: (pathname) => normalizePathname(pathname).startsWith("/decisions"),
    },
    {
      href: "/workspaces",
      label: "Workspaces",
      isActive: (pathname) => {
        const normalized = normalizePathname(pathname);
        return normalized.startsWith("/workspaces") || normalized.startsWith("/workspace");
      },
    },
  ];

  if (showJoin) {
    appNavItems.push({
      href: "/join",
      label: "Join",
      isActive: (pathname) => normalizePathname(pathname).startsWith("/join"),
    });
  }

  return appNavItems;
}

export function isPublicPathname(pathname: string): boolean {
  const normalized = normalizePathname(pathname);

  if (normalized === "/portal") {
    return true;
  }

  return normalized.startsWith("/portal/") || normalized.startsWith("/p/");
}

export function getHeaderNavItems(opts: {
  pathname: string;
  isAuthenticated: boolean;
  showJoin: boolean;
}): NavItem[] {
  const { pathname, isAuthenticated, showJoin } = opts;
  const isPublic = isPublicPathname(pathname);
  const appNavItems = getAppNavItems(showJoin);

  if (isPublic && !isAuthenticated) {
    return [portalNavItem];
  }

  if (isPublic && isAuthenticated) {
    return [portalNavItem, ...appNavItems];
  }

  return appNavItems;
}
