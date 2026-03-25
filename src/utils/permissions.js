export const PERMISSIONS = {
  super_admin: { canCreate: ["doctor", "nurse", "patient"] },
  doctor: { canCreate: ["nurse"] },
  nurse: { canCreate: ["patient"] },
  patient: { canCreate: [] }
};

export function canCreateUser(creatorRole, targetRole) {
  if (typeof creatorRole !== "string" || typeof targetRole !== "string") return false;
  const rules = PERMISSIONS[creatorRole];
  const list = Array.isArray(rules?.canCreate) ? rules.canCreate : [];
  return list.includes(targetRole);
}

