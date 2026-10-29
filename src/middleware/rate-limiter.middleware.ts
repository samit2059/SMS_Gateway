import { rateLimit } from "express-rate-limit";
import { AppError } from "../common/utils/appError.js";
import type {Request} from "express";

interface AuthenticatedRequest extends Request {
  user?: {
    userId?: string;
    id?: string;
    [key: string]: any;
  };
}

export const globalRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
// Key by authenticated user ID if logged in, otherwise fall back to IP address
  keyGenerator: (req: AuthenticatedRequest) => {
    return req.user?.userId || req.user?.id || req.ip || "anonymous";
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
  keyGenerator: (req: Request) => {
    return req.ip || "anonymous";
  },
  message: {
    status: 429,
    message: "You have exceeded your request limit. Please try again later.",
    error: "Too many attempt",
  },
});
