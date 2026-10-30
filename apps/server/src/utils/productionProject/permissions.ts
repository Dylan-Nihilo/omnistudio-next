export type ProductionProjectRole = "owner" | "producer" | "writer" | "director" | "artist" | "editor" | "reviewer" | "viewer";
export type ProductionProjectAction = "read" | "create" | "edit" | "generate" | "retry" | "comment" | "review" | "approve" | "export" | "manageBudget" | "invite";

const roleActions: Record<ProductionProjectRole, readonly ProductionProjectAction[]> = {
  owner: ["read", "create", "edit", "generate", "retry", "comment", "review", "approve", "export", "manageBudget", "invite"],
  producer: ["read", "create", "edit", "generate", "retry", "comment", "review", "approve", "export", "manageBudget", "invite"],
  writer: ["read", "create", "edit", "comment"],
  director: ["read", "create", "edit", "generate", "retry", "comment", "review"],
  artist: ["read", "create", "edit", "generate", "retry", "comment"],
  editor: ["read", "edit", "generate", "retry", "comment", "review", "export"],
  reviewer: ["read", "comment", "review", "approve"],
  viewer: ["read", "comment"],
};

export function roleAllows(role: ProductionProjectRole, action: ProductionProjectAction) {
  return roleActions[role].includes(action);
}

export function actionsForRole(role: ProductionProjectRole) {
  return [...roleActions[role]];
}
