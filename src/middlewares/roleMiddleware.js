export function roleMiddleware(allowedRoles = []) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [];

  return (req, res, next) => {
    const role = typeof req?.user?.role === "string" ? req.user.role : "";
    if (!roles.includes(role)) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}

