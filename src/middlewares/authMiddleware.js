import { User } from "../Models/User.js";
import { verifyAccessToken } from "../utils/tokenService.js";

export async function authMiddleware(req, res, next) {
  try {
    if (!req?.app?.locals?.dbReady) return res.status(500).json({ error: "Database not configured" });

    const header = typeof req.headers.authorization === "string" ? req.headers.authorization : "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
    if (!token) return res.status(401).json({ error: "Missing token" });

    const decoded = verifyAccessToken(token);
    const userId = typeof decoded?.sub === "string" ? decoded.sub : "";
    if (!userId) return res.status(401).json({ error: "Invalid token" });

    const user = await User.findById(userId).lean();
    if (!user) return res.status(401).json({ error: "User not found" });
    if (user.status === "blocked") return res.status(403).json({ error: "User is blocked" });

    req.user = user;
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return res.status(401).json({ error: message });
  }
}
