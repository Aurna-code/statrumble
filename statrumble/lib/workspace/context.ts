export type WorkspaceContextLike = {
  id: string;
  name?: string;
  role?: string;
};

export function normalizeWorkspaceId(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveActiveWorkspaceId(
  workspaces: Array<Pick<WorkspaceContextLike, "id">>,
  candidate: string | null | undefined,
): string | null {
  if (workspaces.length === 0) {
    return null;
  }

  const normalizedCandidate = normalizeWorkspaceId(candidate);

  if (normalizedCandidate && workspaces.some((workspace) => workspace.id === normalizedCandidate)) {
    return normalizedCandidate;
  }

  return workspaces[0]?.id ?? null;
}

export function resolveResourceWorkspaceContext<T extends WorkspaceContextLike>(params: {
  workspaces: T[];
  activeWorkspaceId: string | null | undefined;
  resourceWorkspaceId: string;
}) {
  const normalizedActiveWorkspaceId = normalizeWorkspaceId(params.activeWorkspaceId);
  const activeWorkspace =
    normalizedActiveWorkspaceId
      ? params.workspaces.find((workspace) => workspace.id === normalizedActiveWorkspaceId) ?? null
      : null;
  const resourceWorkspace = params.workspaces.find((workspace) => workspace.id === params.resourceWorkspaceId) ?? null;

  return {
    normalizedActiveWorkspaceId,
    activeWorkspace,
    resourceWorkspace,
    hasResourceWorkspaceAccess: resourceWorkspace !== null,
    shouldSyncActiveWorkspace:
      resourceWorkspace !== null && normalizedActiveWorkspaceId !== params.resourceWorkspaceId,
  };
}
