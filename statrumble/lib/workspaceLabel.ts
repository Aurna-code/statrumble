type PortalStatusLabel = {
  text: string;
  tone: "success" | "default";
};

export function portalStatusLabel(isPublic?: boolean): PortalStatusLabel {
  if (isPublic) {
    return {
      text: "Public",
      tone: "success",
    };
  }

  return {
    text: "Private",
    tone: "default",
  };
}

export function roleLabel(role?: string): string {
  if (!role) {
    return "Member";
  }

  const normalizedRole = role.trim().toLowerCase();

  if (normalizedRole === "owner") {
    return "Owner";
  }

  if (normalizedRole === "member") {
    return "Member";
  }

  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function membersLabel(n?: number): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) {
    return "—";
  }

  return String(Math.trunc(n));
}
