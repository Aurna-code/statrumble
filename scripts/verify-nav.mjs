import assert from "node:assert/strict";
import { getHeaderNavItems } from "../statrumble/lib/nav.ts";

function pickHrefLabel(items) {
  return items.map((item) => ({ href: item.href, label: item.label }));
}

assert.deepEqual(
  pickHrefLabel(getHeaderNavItems({ pathname: "/portal", isAuthenticated: false, showJoin: false })),
  [{ href: "/portal", label: "Portal" }],
);

assert.deepEqual(
  pickHrefLabel(getHeaderNavItems({ pathname: "/p/decisions/abc", isAuthenticated: false, showJoin: false })),
  [{ href: "/portal", label: "Portal" }],
);

assert.deepEqual(
  pickHrefLabel(getHeaderNavItems({ pathname: "/", isAuthenticated: true, showJoin: false })),
  [
    { href: "/", label: "Arena" },
    { href: "/threads", label: "Threads" },
    { href: "/decisions", label: "Decisions" },
    { href: "/workspaces", label: "Workspaces" },
  ],
);

assert.deepEqual(
  pickHrefLabel(getHeaderNavItems({ pathname: "/", isAuthenticated: true, showJoin: true })),
  [
    { href: "/", label: "Arena" },
    { href: "/threads", label: "Threads" },
    { href: "/decisions", label: "Decisions" },
    { href: "/workspaces", label: "Workspaces" },
    { href: "/join", label: "Join" },
  ],
);

console.log("verify-nav: OK");
