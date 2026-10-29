import { randomUUID } from "node:crypto";
import { and } from "@prisma/orm-postgres/orm-client";
import prisma from "../../lib/prisma.js";
export class ProviderError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * A fake SMS route. Config (priority, balance, failureRate) lives in the Provider table,
 * so ROUTE_A can be "30% failure" without a code change. The balance is the route's own
 * credit pool: every part sent consumes one unit.
 */
export class MockProvider {
    id;
    code;
    name;
    priority;
    failureRate;
    isActive;
    constructor(id, code, name, priority, failureRate, // 0.3 = fails 30% of sends
    isActive) {
        this.id = id;
        this.code = code;
        this.name = name;
        this.priority = priority;
        this.failureRate = failureRate;
        this.isActive = isActive;
    }
    /** Live balance, always read from the database. */
    async getBalance() {
        const row = await prisma.orm.public.Provider.where({ id: this.id }).first();
        return row?.balance ?? 0;
    }
    /**
     * Atomically take `parts` from the balance BEFORE sending, so parallel sends can't overspend the route.
     * Returns false when the route is inactive or can't cover it.
     * (forNoKeyUpdate, not forUpdate: attempts/messages reference this row; see Prisma 8 pitfall 13.)
     */
    async reserve(parts) {
        return prisma.transaction(async (tx) => {
            const p = await tx.orm.public.Provider.where({ id: this.id }).forNoKeyUpdate().first();
            if (!p || !p.isActive || p.balance < parts)
                return false;
            await tx.orm.public.Provider.where({ id: this.id }).update({ balance: p.balance - parts });
            return true;
        });
    }
    /** Give a reservation back (the send failed). */
    async release(parts) {
        await prisma.transaction(async (tx) => {
            const p = await tx.orm.public.Provider.where({ id: this.id }).forNoKeyUpdate().first();
            if (p)
                await tx.orm.public.Provider.where({ id: this.id }).update({ balance: p.balance + parts });
        });
    }
    /** Pretend to send. Throws ProviderError `failureRate` of the time. */
    async send(_msg) {
        await sleep(50 + Math.random() * 150); // fake network latency
        if (Math.random() < this.failureRate) {
            throw new ProviderError("PROVIDER_REJECTED", `${this.code} failed to deliver the message`);
        }
        return { providerMessageId: `${this.code}-${randomUUID()}` };
    }
}
function toProvider(r) {
    return new MockProvider(r.id, r.code, r.name, r.priority, r.failureRate, r.isActive);
}
/** Active routes, best priority first (1 = highest). */
export async function loadActiveProviders() {
    const rows = await prisma.orm.public.Provider
        .where({ isActive: true })
        .orderBy((p) => p.priority.asc())
        .all();
    return rows.map(toProvider);
}
export async function loadAllProviders() {
    const rows = await prisma.orm.public.Provider.orderBy((p) => p.priority.asc()).all();
    return rows.map(toProvider);
}
const RECOVERY_BATCH_SIZE = 100;
export const STALE_SENDING_AFTER_MS = Number(process.env.SMS_SENDING_TIMEOUT_MS ?? 5 * 60_000);
async function recordAttempt(messageId, providerId, status, errorMessage) {
    await prisma.orm.public.MessageAttempt.create({
        messageId,
        providerId,
        status,
        errorMessage,
        errorCode: errorMessage ? "PROVIDER_REJECTED" : null,
    });
}
/**
 * Terminal failure and its customer refund are one idempotent transaction.
 * The row lock and refundIssued marker mean a recovery worker and a normal
 * dispatcher can race without issuing the refund twice.
 */
async function failAndRefund(messageId, errorMessage) {
    return prisma.transaction(async (tx) => {
        const message = await tx.orm.public.SmsMessage.where({ id: messageId }).forUpdate().first();
        if (!message || message.status === "SENT")
            return undefined;
        const wallet = !message.refundIssued
            ? await tx.orm.public.Wallet.where({ userId: message.userId }).forUpdate().first()
            : null;
        if (wallet) {
            await tx.orm.public.Wallet.where({ id: wallet.id }).update({
                balance: wallet.balance + message.creditsCharged,
            });
        }
        await tx.orm.public.SmsMessage.where({ id: message.id }).update({
            status: "FAILED",
            errorMessage,
            refundIssued: message.refundIssued || wallet !== null,
        });
        return "FAILED";
    });
}
async function dispatch(messageId) {
    const message = await prisma.transaction(async (tx) => {
        const queued = await tx.orm.public.SmsMessage.where({ id: messageId }).forUpdate().first();
        if (!queued || queued.status !== "QUEUED")
            return null;
        return tx.orm.public.SmsMessage.where({ id: messageId }).update({ status: "SENDING" });
    });
    if (!message)
        return undefined;
    const providers = await loadActiveProviders();
    let lastError = "No active provider could send this message";
    for (const provider of providers) {
        if (!(await provider.reserve(message.segments))) {
            await recordAttempt(message.id, provider.id, "SKIPPED", "Provider has insufficient credits");
            continue;
        }
        try {
            const sent = await provider.send({
                to: message.normalizedRecipient,
                message: message.message,
                sender: message.sender,
            });
            const markedSent = await prisma.transaction(async (tx) => {
                // A recovery worker may have finalized a stale message while the
                // provider call was in flight. Never overwrite that terminal state.
                const current = await tx.orm.public.SmsMessage.where({ id: message.id }).forUpdate().first();
                if (!current || current.status !== "SENDING")
                    return false;
                await tx.orm.public.SmsMessage.where({ id: message.id }).update({
                    status: "SENT",
                    providerId: provider.id,
                    providerMessageId: sent.providerMessageId,
                    sentAt: new Date(),
                    errorMessage: null,
                });
                await tx.orm.public.MessageAttempt.create({
                    messageId: message.id,
                    providerId: provider.id,
                    status: "SUCCESS",
                    errorCode: null,
                    errorMessage: null,
                });
                return true;
            });
            if (markedSent)
                return "SENT";
            // The provider may have accepted the message, but recovery finalized it
            // first. Do not retry or release its reservation: either could create a
            // duplicate send or an incorrect provider balance.
            return undefined;
        }
        catch (error) {
            lastError = error instanceof Error ? error.message : "Provider failed to send the message";
            await provider.release(message.segments);
            await recordAttempt(message.id, provider.id, "FAILED", lastError);
        }
    }
    return failAndRefund(message.id, lastError);
}
/**
 * Durable recovery for records committed before a process dies.
 *
 * QUEUED messages have never been handed to a provider, so they are safe to
 * re-enqueue. A stale SENDING message is delivery-ambiguous: a real provider
 * may have accepted it just before the crash. We therefore never resend it;
 * we fail/refund it exactly once and leave a clear audit message. A production
 * provider integration can replace that policy with a provider status lookup
 * keyed by its idempotency key/message id.
 */
async function recover() {
    const cutoff = new Date(Date.now() - STALE_SENDING_AFTER_MS);
    const [queued, staleSending, failedWithoutRefund] = await Promise.all([
        prisma.orm.public.SmsMessage.where({ status: "QUEUED" }).limit(RECOVERY_BATCH_SIZE).all(),
        prisma.orm.public.SmsMessage
            .where((m) => and(m.status.eq("SENDING"), m.updatedAt.lte(cutoff)))
            .limit(RECOVERY_BATCH_SIZE)
            .all(),
        prisma.orm.public.SmsMessage
            .where((m) => and(m.status.eq("FAILED"), m.refundIssued.eq(false)))
            .limit(RECOVERY_BATCH_SIZE)
            .all(),
    ]);
    await Promise.all([
        ...queued.map((message) => dispatch(message.id)),
        ...staleSending.map((message) => failAndRefund(message.id, "Delivery outcome is unknown after an interrupted send; credits refunded")),
        ...failedWithoutRefund.map((message) => failAndRefund(message.id, message.errorMessage ?? "Message failed; credits refunded")),
    ]);
}
/** In-process workers use durable rows as their queue; recovery is safe to run repeatedly. */
export const dispatcher = { enqueue: dispatch, recover };
