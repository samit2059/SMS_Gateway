import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import authRoutes from "./modules/auth/auth.routes.js";
import { smsRoutes } from "./modules/sms/sms.routes.js";
import { routesHealthRouter } from "./modules/health/health.routes.js";
const app = express();
// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Health Check Route
app.get("/", (req, res) => {
    res.status(200).json({
        status: "success",
        message: "SMS Gateway Backend is up and running!",
        timeStamp: new Date().toISOString(),
    });
});
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/sms", smsRoutes);
app.use("/api/v1/health", routesHealthRouter);
app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});
export default app;
