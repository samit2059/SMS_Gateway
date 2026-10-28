import { Router } from "express";
import { smsController } from "./sms.controller.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { globalRateLimiter } from "../../middleware/rate-limiter.middleware.js";
export const smsRoutes = Router();
smsRoutes.use(requireAuth);
smsRoutes.post("/send", globalRateLimiter, smsController.send); // POST /api/v1/sms/send   { to: string[], message, sender? }
smsRoutes.get("/logs", globalRateLimiter, smsController.logs); // GET  /api/v1/sms/logs?status=&startDate=&endDate=&number=&page=&limit=
