import { Router } from "express";
import prisma from "../../lib/prisma.js";
import { loadAllProviders } from "../sms/sms.dispatcher.js";
import { requireAuth } from "../../middleware/auth.middleware.js"; // or remove if you want this endpoint public
/**
 * HEALTH FORMULA (also in README):
 *   S = (success + 9) / (success + failed + 10)     24h success rate, smoothed
 *   B = min(1, balance / LOW_BALANCE)               how full the route's balance is
 *   health % = round(100 * (0.7*S + 0.3*B))
 *   inactive route or balance 0  ->  0 %
 */
const WINDOW_MS = 24 * 60 * 60 * 1000;
const LOW_BALANCE = Number(process.env.HEALTH_LOW_BALANCE ?? 200);
const PRIOR_SUCCESS = 9;
const PRIOR_TOTAL = 10;
const label = (pct) => (pct >= 80 ? "healthy" : pct >= 50 ? "degraded" : "unhealthy");
export function computeHealth(o) {
    const smoothed = (o.success + PRIOR_SUCCESS) / (o.success + o.failed + PRIOR_TOTAL);
    const balanceScore = Math.min(1, o.balance / LOW_BALANCE);
    const pct = !o.isActive || o.balance <= 0 ? 0 : Math.round(100 * (0.7 * smoothed + 0.3 * balanceScore));
    return { smoothed, balanceScore, pct };
}
async function attemptsByProvider(status, since) {
    const rows = await prisma.orm.public.MessageAttempt
        .where({ status })
        .where((a) => a.attemptedAt.gte(since))
        .groupBy("providerId")
        .aggregate((a) => ({ n: a.count() }));
    return new Map(rows.map((r) => [r.providerId, Number(r.n)]));
}
export async function getRoutesHealth() {
    const since = new Date(Date.now() - WINDOW_MS);
    const [providers, ok, bad, skipped] = await Promise.all([
        loadAllProviders(),
        attemptsByProvider("SUCCESS", since),
        attemptsByProvider("FAILED", since),
        attemptsByProvider("SKIPPED", since),
    ]);
    return Promise.all(providers.map(async (p) => {
        const success = ok.get(p.id) ?? 0;
        const failed = bad.get(p.id) ?? 0;
        const balance = await p.getBalance();
        const h = computeHealth({ success, failed, balance, isActive: p.isActive });
        const decided = success + failed;
        return {
            route: p.code,
            name: p.name,
            priority: p.priority,
            isActive: p.isActive,
            balance,
            last24h: {
                attempts: decided,
                success,
                failed,
                skippedForBalance: skipped.get(p.id) ?? 0,
                successRate: decided === 0 ? null : Math.round((success / decided) * 1000) / 10, // raw %, null = no traffic
            },
            healthPercent: h.pct,
            status: label(h.pct),
        };
    }));
}
export const routesHealthRouter = Router();
routesHealthRouter.use(requireAuth);
routesHealthRouter.get("/", async (_req, res, next) => {
    try {
        res.status(200).json({ windowHours: 24, routes: await getRoutesHealth() });
    }
    catch (err) {
        next(err);
    }
});
