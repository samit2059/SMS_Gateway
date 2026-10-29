import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "./config/env.js";
import authRoutes from "./modules/auth/auth.routes.js";
import { smsRoutes } from "./modules/sms/sms.routes.js";
import { routesHealthRouter } from "./modules/health/health.routes.js";
import { walletRoutes } from "./modules/wallet/wallet.route.js";
import { AppError } from "./common/utils/appError.js";
import { HttpError } from "./modules/sms/sms.errors.js";

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check Route
app.get("/", (req: Request, res: Response) => {
  res.status(200).json({
    status: "success",
    message: "SMS Gateway Backend is up and running!",
    timeStamp: new Date().toISOString(),
  });
});

app.use("/api/v1/auth",authRoutes);
app.use("/api/v1/sms",smsRoutes);
app.use("/api/v1/health",routesHealthRouter);
app.use("/api/v1/wallet", walletRoutes);


app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

/**
 * Keep all API errors JSON-shaped and avoid exposing implementation details.
 * This must be registered after every route for Express to treat it as an
 * error-handling middleware.
 */
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof HttpError
    ? err.status
    : err instanceof AppError
      ? err.statusCode
      : typeof err === "object" && err !== null && "statusCode" in err &&
          typeof err.statusCode === "number" && err.statusCode >= 400 && err.statusCode < 600
        ? err.statusCode
        : 500;
  const isClientError = status >= 400 && status < 500;
  const message = isClientError && err instanceof Error ? err.message : "Internal server error";
  const details = err instanceof HttpError && err.details !== undefined ? { details: err.details } : {};

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({ error: message, ...details });
});

export default app;
