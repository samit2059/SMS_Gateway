import { rateLimit } from "express-rate-limit";
import { AppError } from "../common/utils/appError.js";

export const globalRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,

  message: {
    status: 429,
    message: "You have exceeded your request limit. Please try again later.",
    error: "Too many requests, please slow down. Rate limit is 60 request per minute.",
  },
});

export const authRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,

  message: {
    status: 429,
    message: "You have exceeded your request limit. Please try again later.",
    error: "Too many attempt",
  },
});
