import { rateLimit, ipKeyGenerator } from "express-rate-limit";
export const globalRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // Use standard Request and Response types here
    keyGenerator: (req) => {
        // Type-safely check for user properties if they exist on the request object
        const user = req.user;
        const userId = user?.userId || user?.id;
        if (userId) {
            return userId;
        }
        // Fall back to the safe IPv6 IP generator helper
        return ipKeyGenerator(req.ip ?? "unknown");
    },
    message: {
        status: 429,
        message: "You have exceeded your request limit. Please try again later.",
        error: "Too many requests, please slow down. Rate limit is 60 request per minute.",
    },
});
export const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req) => {
        return ipKeyGenerator(req.ip ?? "unknown");
    },
    message: {
        status: 429,
        message: "You have exceeded your request limit. Please try again later.",
        error: "Too many attempt",
    },
});
