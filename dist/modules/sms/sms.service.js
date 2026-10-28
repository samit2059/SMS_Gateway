import { and } from "@prisma/orm-postgres/orm-client";
import prisma from "../../lib/prisma.js";
import { HttpError } from "./sms.errors.js";
import { dispatcher } from "./sms.dispatcher.js";
import { STATUS_FILTERS, validateSendInput } from "./sms.validation.js";
const CREDITS_PER_PART = Number(process.env.CREDITS_PER_PART ?? 1);
const WAIT_FOR_RESULT_MS = Number(process.env.SEND_WAIT_MS ?? 5000);
const delay = (ms) => new Promise((r) => setTimeout(r, ms).unref());
// DB status -> the three public statuses
const publicStatus = (s) => s === "SENT" ? "sent" : s === "FAILED" ? "failed" : "pending";
export const smsService = {
    /**
     * POST /sms/send
     * 1. validate + normalise every number (one bad number rejects the request, nothing is charged)
     * 2. parts per message, total cost
     * 3. ONE transaction: lock wallet row -> check balance -> deduct -> create all messages
     * 4. after commit, send (failover across routes); wait a few seconds for results
     */
    async send(userId, input) {
        const v = validateSendInput(input);
        const costPerMessage = v.segments * CREDITS_PER_PART;
        const totalCost = costPerMessage * v.recipients.length;
        const created = await prisma.transaction(async (tx) => {
            // forUpdate = row lock. Parallel requests for the same wallet queue up here one at a time,
            // so each sees the balance left by the previous one. They can never overspend.
            const wallet = await tx.orm.public.Wallet.where({ userId }).forUpdate().first();
            if (!wallet)
                throw new HttpError(402, "No wallet found for this account");
            if (wallet.balance < totalCost) {
                throw new HttpError(402, "Insufficient credits", {
                    required: totalCost, available: wallet.balance, parts: v.segments, recipients: v.recipients.length,
                });
            }
            await tx.orm.public.Wallet.where({ userId }).update({ balance: wallet.balance - totalCost });
            const rows = [];
            for (const r of v.recipients) {
                rows.push(await tx.orm.public.SmsMessage.create({
                    userId,
                    direction: "OUTGOING",
                    sender: v.sender,
                    recipient: r.input,
                    normalizedRecipient: r.normalized,
                    message: v.message,
                    encoding: v.encoding,
                    segments: v.segments,
                    creditsCharged: costPerMessage,
                    status: "QUEUED",
                    providerId: null,
                    providerMessageId: null,
                    errorMessage: null,
                    sentAt: null,
                }));
            }
            return rows;
        });
        // Only AFTER the commit, so the dispatcher can never see an uncommitted row.
        const finals = new Map();
        const tracked = created.map((m) => dispatcher.enqueue(m.id).then((f) => {
            if (f)
                finals.set(m.id, f);
        }));
        await Promise.race([Promise.all(tracked), delay(WAIT_FOR_RESULT_MS)]);
        const results = created.map((m) => {
            const final = finals.get(m.id);
            return {
                id: m.id,
                to: m.normalizedRecipient,
                status: final === "SENT" ? "sent" : final === "FAILED" ? "failed" : "pending",
                parts: m.segments,
                cost: m.creditsCharged,
                refunded: final === "FAILED" ? m.creditsCharged : 0,
            };
        });
        const sent = results.filter((r) => r.status === "sent").length;
        const failed = results.filter((r) => r.status === "failed").length;
        const refunded = results.reduce((n, r) => n + r.refunded, 0);
        const wallet = await prisma.orm.public.Wallet.where({ userId }).first();
        return {
            summary: {
                recipients: results.length,
                duplicatesRemoved: v.duplicatesRemoved.length,
                encoding: v.encoding,
                partsPerMessage: v.segments,
                costPerMessage,
                totalCharged: totalCost,
                sent,
                failed,
                pending: results.length - sent - failed,
                creditsRefunded: refunded,
                netCost: totalCost - refunded,
                walletBalance: wallet?.balance ?? null,
            },
            messages: results,
        };
    },
    /** GET /sms/logs: page-based, filterable by status, date range and number. */
    async logs(userId, f) {
        // One predicate used by BOTH the count and the page query, so the total always matches the rows.
        const predicate = (m) => {
            const conds = [m.userId.eq(userId)];
            if (f.status)
                conds.push(m.status.in([...STATUS_FILTERS[f.status]]));
            if (f.startDate)
                conds.push(m.createdAt.gte(f.startDate));
            if (f.endDate)
                conds.push(m.createdAt.lte(f.endDate));
            if (f.number)
                conds.push(m.normalizedRecipient.eq(f.number));
            return and(...conds);
        };
        const { total } = await prisma.orm.public.SmsMessage
            .where(predicate)
            .aggregate((a) => ({ total: a.count() }));
        const rows = await prisma.orm.public.SmsMessage
            .where(predicate)
            .orderBy([(m) => m.createdAt.desc(), (m) => m.id.desc()])
            .limit(f.limit)
            .offset((f.page - 1) * f.limit)
            .all();
        return {
            page: f.page,
            limit: f.limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / f.limit)),
            items: rows.map((m) => ({
                id: m.id,
                to: m.normalizedRecipient,
                sender: m.sender,
                message: m.message,
                status: publicStatus(m.status),
                parts: m.segments,
                cost: m.creditsCharged,
                refunded: m.refundIssued,
                routeId: m.providerId,
                error: m.errorMessage,
                createdAt: m.createdAt,
                sentAt: m.sentAt,
            })),
        };
    },
};
