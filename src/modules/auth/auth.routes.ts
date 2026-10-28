import { Router } from "express";
import { authController } from "./auth.controller.js";
import { loginSchema, registerSchema } from "./auth.validation.js";
import { validate } from "../../middleware/validation.middleware.js";
import { authRateLimiter } from "../../middleware/rate-limiter.middleware.js";
const router = Router();

router.post("/register",authRateLimiter,validate(registerSchema),authController.register);
router.post("/login",authRateLimiter,validate(loginSchema),authController.login)
export default router;