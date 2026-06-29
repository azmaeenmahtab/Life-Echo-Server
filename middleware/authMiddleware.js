// middleware/authMiddleware.js
// import { auth } from "../auth"; // Import your auth instance
const { auth } = require("../auth");

const verifyJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const cookieHeader = req.headers.cookie;

    // Accept either a bearer token OR the BetterAuth session cookie
    // forwarded by the Next.js server component.
    const hasBearer =
      authHeader &&
      authHeader.startsWith("Bearer ") &&
      authHeader.split(" ")[1];
    const hasSessionCookie =
      cookieHeader && cookieHeader.includes("better-auth.session_token=");

    if (!hasBearer && !hasSessionCookie) {
      return res
        .status(401)
        .json({ message: "Unauthorized: No token provided" });
    }

    // Build the headers object BetterAuth expects.
    const forwardHeaders = new Headers();
    if (hasBearer) {
      forwardHeaders.set("Authorization", authHeader);
    }
    if (hasSessionCookie) {
      forwardHeaders.set("Cookie", cookieHeader);
    }

    /* * BetterAuth validates the session from the Authorization header
     * (when a bearer token is provided) or from the session cookie.
     */
    const session = await auth.api.getSession({
      headers: forwardHeaders,
    });

    if (!session || !session.user) {
      return res
        .status(401)
        .json({ message: "Unauthorized: Invalid or expired token" });
    }

    console.log("user authenticated from backend");

    // Attach user and session to the request object for use in routes
    req.user = session.user;
    req.session = session.session;

    next();
  } catch (error) {
    console.error("Auth Middleware Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports = { verifyJWT };
