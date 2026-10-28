import { Router } from "express";
import prisma from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { currentUserId, sendError } from "../sms/sms.controller.js";
import { HttpError } from "../sms/sms.errors.js";
export const walletRoutes = Router();
walletRoutes.use(requireAuth);
// GET /api/v1/wallet -> { balance }
walletRoutes.get("/", async (req, res, next) => {
    try {
        const wallet = await prisma.orm.public.Wallet.where({ userId: currentUserId(req) }).first();
        if (!wallet)
            throw new HttpError(404, "No wallet found for this account");
        res.json({ balance: wallet.balance });
    }
    catch (err) {
        sendError(err, res, next);
    }
});
