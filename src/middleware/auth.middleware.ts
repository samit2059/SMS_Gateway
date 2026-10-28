import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// Extend Express Request type to include authenticated user payload
export interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
    };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Access token missing or malformed" });
    }

    const token = authHeader.split(" ")[1];

    try {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            throw new Error("JWT_SECRET is not defined in environment variables");
        }

        const decoded = jwt.verify(token, secret) as { sub: string };

        // Attach user id to request object
        req.user = {
            id: decoded.sub,
        };

        next();
    } catch (err) {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
}