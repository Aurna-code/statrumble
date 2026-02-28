import assert from "node:assert/strict";
import { getHeaderNavItems } from "../statrumble/lib/nav.ts";

function pickSummary(item) {
  return {
    href: item.href,
    label: item.label,
  };
}

function assertNavSummary(options, expected) {
  const items = getHeaderNavItems(options);
  assert.deepEqual(
    items.map((item) => pickSummary(item)),
    expected.map((item) => pickSummary(item)),
    `Unexpected nav for pathname=${options.pathname}, isAuthenticated=${options.isAuthenticated}, showJoin=${options.showJoin}`,
  );
}

assertNavSummary(
  {
    pathname: "/portal",
    isAuthenticated: false,
    showJoin: false,
  },
  [{ href: "/portal", label: "Portal" }],
);

assertNavSummary(
  {
    pathname: "/p/decisions/abc",
    isAuthenticated: false,
    showJoin: false,
  },
  [{ href: "/portal", label: "Portal" }],
);

assertNavSummary(
  {
    pathname: "/",
    isAuthenticated: true,
    showJoin: false,
  },
  [
    { href: "/", label: "Arena" },
    { href: "/threads", label: "Threads" },
    { href: "/decisions", label: "Decisions" },
    { href: "/workspaces", label: "Workspaces" },
  ],
);

assertNavSummary(
  {
    pathname: "/",
    isAuthenticated: true,
    showJoin: true,
  },
  [
    { href: "/", label: "Arena" },
    { href: "/threads", label: "Threads" },
    { href: "/decisions", label: "Decisions" },
    { href: "/workspaces", label: "Workspaces" },
    { href: "/join", label: "Join" },
  ],
);

console.log("verify-nav: OK");
