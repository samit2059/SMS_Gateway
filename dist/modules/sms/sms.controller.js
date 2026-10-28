import { smsService } from "./sms.service.js";
import { parseLogsQuery } from "./sms.validation.js";
import { HttpError } from "./sms.errors.js";
// Assumes your auth middleware sets req.user = { id } (string). Change if yours differs.
export function currentUserId(req) {
    const id = req.user?.id;
    if (!id)
        throw new HttpError(401, "Unauthorized");
    return String(id);
}
// Self-contained error responses so validation problems always come back as clear JSON.
export function sendError(err, res, next) {
    if (err instanceof HttpError) {
        return res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
    }
    return next(err);
}
export const smsController = {
    async send(req, res, next) {
        try {
            const result = await smsService.send(currentUserId(req), req.body);
            // 200 = every message has a final result; 202 = some are still being delivered
            return res.status(result.summary.pending > 0 ? 202 : 200).json(result);
        }
        catch (err) {
            return sendError(err, res, next);
        }
    },
    async logs(req, res, next) {
        try {
            const filters = parseLogsQuery(req.query);
            return res.status(200).json(await smsService.logs(currentUserId(req), filters));
        }
        catch (err) {
            return sendError(err, res, next);
        }
    },
};
