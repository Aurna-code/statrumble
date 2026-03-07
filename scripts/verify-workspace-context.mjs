import assert from "node:assert/strict";
import {
  normalizeWorkspaceId,
  resolveActiveWorkspaceId,
  resolveResourceWorkspaceContext,
} from "../statrumble/lib/workspace/context.ts";

const workspaces = [
  {
    id: "workspace-alpha",
    name: "Alpha",
    role: "member",
  },
  {
    id: "workspace-beta",
    name: "Beta",
    role: "owner",
  },
];

assert.equal(normalizeWorkspaceId("  workspace-alpha  "), "workspace-alpha");
assert.equal(normalizeWorkspaceId("   "), null);
assert.equal(
  resolveActiveWorkspaceId(workspaces, "workspace-beta"),
  "workspace-beta",
  "known active workspace ids should be preserved",
);
assert.equal(
  resolveActiveWorkspaceId(workspaces, "workspace-missing"),
  "workspace-alpha",
  "unknown active workspace ids should fall back to the first member workspace",
);
assert.equal(resolveActiveWorkspaceId([], "workspace-beta"), null, "no memberships should resolve to null");

assert.deepEqual(
  resolveResourceWorkspaceContext({
    workspaces,
    activeWorkspaceId: "workspace-beta",
    resourceWorkspaceId: "workspace-alpha",
  }),
  {
    normalizedActiveWorkspaceId: "workspace-beta",
    activeWorkspace: workspaces[1],
    resourceWorkspace: workspaces[0],
    hasResourceWorkspaceAccess: true,
    shouldSyncActiveWorkspace: true,
  },
  "opening a valid resource from another active workspace should request a workspace sync",
);

assert.deepEqual(
  resolveResourceWorkspaceContext({
    workspaces: [workspaces[1]],
    activeWorkspaceId: "workspace-beta",
    resourceWorkspaceId: "workspace-alpha",
  }),
  {
    normalizedActiveWorkspaceId: "workspace-beta",
    activeWorkspace: workspaces[1],
    resourceWorkspace: null,
    hasResourceWorkspaceAccess: false,
    shouldSyncActiveWorkspace: false,
  },
  "users without membership in the resource workspace should not be treated as recoverable mismatches",
);

assert.deepEqual(
  resolveResourceWorkspaceContext({
    workspaces,
    activeWorkspaceId: null,
    resourceWorkspaceId: "workspace-alpha",
  }),
  {
    normalizedActiveWorkspaceId: null,
    activeWorkspace: null,
    resourceWorkspace: workspaces[0],
    hasResourceWorkspaceAccess: true,
    shouldSyncActiveWorkspace: true,
  },
  "missing active workspace context should still self-heal to the resource workspace",
);

console.log("verify-workspace-context: OK");
