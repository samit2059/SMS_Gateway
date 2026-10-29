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
async function recordSkippedAttempt(messageId, providerId, errorMessage) {
    await prisma.orm.public.MessageAttempt.create({
        messageId,
        providerId,
        status: "SKIPPED",
        errorMessage,
        errorCode: "INSUFFICIENT_PROVIDER_CREDITS",
    });
}
/** Atomically deduct route credits and persist the reservation before any provider I/O. */
async function reserveForMessage(messageId, provider, parts) {
    return prisma.transaction(async (tx) => {
        const message = await tx.orm.public.SmsMessage.where({ id: messageId }).forUpdate().first();
        if (!message || message.status !== "SENDING")
            return undefined;
        const route = await tx.orm.public.Provider.where({ id: provider.id }).forNoKeyUpdate().first();
        if (!route || !route.isActive || route.balance < parts)
            return undefined;
        await tx.orm.public.Provider.where({ id: route.id }).update({ balance: route.balance - parts });
        await tx.orm.public.SmsMessage.where({ id: message.id }).update({ providerId: route.id });
        const attempt = await tx.orm.public.MessageAttempt.create({
            messageId: message.id,
            providerId: route.id,
            status: "RESERVED",
            errorCode: null,
            errorMessage: null,
        });
        return attempt.id;
    });
}
async function beginProviderSend(attemptId) {
    await prisma.orm.public.MessageAttempt.where({ id: attemptId }).update({ status: "SENDING" });
}
/** Release a reservation once; safe for normal provider rejections and recovery. */
async function releaseReservation(attemptId, parts, errorMessage) {
    await prisma.transaction(async (tx) => {
        const attempt = await tx.orm.public.MessageAttempt.where({ id: attemptId }).forUpdate().first();
        if (!attempt || attempt.status === "SUCCESS" || attempt.status === "RELEASED")
            return;
        const route = await tx.orm.public.Provider.where({ id: attempt.providerId }).forNoKeyUpdate().first();
        if (route)
            await tx.orm.public.Provider.where({ id: route.id }).update({ balance: route.balance + parts });
        await tx.orm.public.MessageAttempt.where({ id: attempt.id }).update({
            status: "RELEASED",
            errorCode: "PROVIDER_REJECTED",
            errorMessage,
        });
    });
}
async function markSent(messageId, attemptId, providerMessageId) {
    return prisma.transaction(async (tx) => {
        const current = await tx.orm.public.SmsMessage.where({ id: messageId }).forUpdate().first();
        const attempt = await tx.orm.public.MessageAttempt.where({ id: attemptId }).forUpdate().first();
        if (!current || !attempt || current.status !== "SENDING" || attempt.status !== "SENDING")
            return false;
        await tx.orm.public.SmsMessage.where({ id: current.id }).update({
            status: "SENT",
            providerId: attempt.providerId,
            providerMessageId,
            sentAt: new Date(),
            errorMessage: null,
        });
        await tx.orm.public.MessageAttempt.where({ id: attempt.id }).update({
            status: "SUCCESS",
            errorCode: null,
            errorMessage: null,
        });
        return true;
    });
}
/** A RESERVED attempt has not entered provider I/O and can safely be returned during recovery. */
async function releaseUnstartedReservations(messageId, parts) {
    const attempts = await prisma.orm.public.MessageAttempt
        .where((attempt) => and(attempt.messageId.eq(messageId), attempt.status.eq("RESERVED")))
        .all();
    await Promise.all(attempts.map((attempt) => releaseReservation(attempt.id, parts, "Reservation released during crash recovery before provider send")));
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
        const attemptId = await reserveForMessage(message.id, provider, message.segments);
        if (!attemptId) {
            await recordSkippedAttempt(message.id, provider.id, "Provider has insufficient credits");
            continue;
        }
        // A failure to persist this transition is not a provider failure. The durable
        // RESERVED attempt is recovered later; do not try another route.
        try {
            await beginProviderSend(attemptId);
        }
        catch (error) {
            console.error("Could not persist provider send state", error);
            return undefined;
        }
        let sent;
        try {
            sent = await provider.send({
                to: message.normalizedRecipient,
                message: message.message,
                sender: message.sender,
            });
        }
        catch (error) {
            lastError = error instanceof Error ? error.message : "Provider failed to send the message";
            await releaseReservation(attemptId, message.segments, lastError);
            continue;
        }
        // The provider has accepted the message. A database failure here is delivery
        // ambiguous, never a reason to release the reservation or fail over.
        try {
            if (await markSent(message.id, attemptId, sent.providerMessageId))
                return "SENT";
            return undefined;
        }
        catch (error) {
            console.error("Provider accepted SMS but success could not be persisted", error);
            return undefined;
        }
    }
    return failAndRefund(message.id, lastError);
}
/**
 * Durable recovery for records committed before a process dies.
 *
 * QUEUED messages have never been handed to a provider, so they are safe to
 * re-enqueue. A stale SENDING message is delivery-ambiguous: a real provider
 * may have accepted it just before the crash. We therefore never resend it.
 * A durable RESERVED attempt is safe to release because provider I/O did not
 * begin; a SENDING attempt is delivery-ambiguous, so its provider reservation
 * remains consumed until a real provider status lookup can reconcile it.
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
        ...staleSending.map(async (message) => {
            await releaseUnstartedReservations(message.id, message.segments);
            return failAndRefund(message.id, "Delivery outcome is unknown after an interrupted send; credits refunded");
        }),
        ...failedWithoutRefund.map((message) => failAndRefund(message.id, message.errorMessage ?? "Message failed; credits refunded")),
    ]);
}
/** In-process workers use durable rows as their queue; recovery is safe to run repeatedly. */
export const dispatcher = { enqueue: dispatch, recover };
