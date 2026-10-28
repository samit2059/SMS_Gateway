import { randomUUID } from "node:crypto";
import prisma from "../../lib/prisma.js";

export class ProviderError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * A fake SMS route. Config (priority, balance, failureRate) lives in the Provider table,
 * so ROUTE_A can be "30% failure" without a code change. The balance is the route's own
 * credit pool: every part sent consumes one unit.
 */
export class MockProvider {
  constructor(
    readonly id: string,
    readonly code: string,
    readonly name: string,
    readonly priority: number,
    readonly failureRate: number, // 0.3 = fails 30% of sends
    readonly isActive: boolean,
  ) {}

  /** Live balance, always read from the database. */
  async getBalance(): Promise<number> {
    const row = await prisma.orm.public.Provider.where({ id: this.id }).first();
    return row?.balance ?? 0;
  }

  /**
   * Atomically take `parts` from the balance BEFORE sending, so parallel sends can't overspend the route.
   * Returns false when the route is inactive or can't cover it.
   * (forNoKeyUpdate, not forUpdate: attempts/messages reference this row; see Prisma 8 pitfall 13.)
   */
  async reserve(parts: number): Promise<boolean> {
    return prisma.transaction(async (tx) => {
      const p = await tx.orm.public.Provider.where({ id: this.id }).forNoKeyUpdate().first();
      if (!p || !p.isActive || p.balance < parts) return false;
      await tx.orm.public.Provider.where({ id: this.id }).update({ balance: p.balance - parts });
      return true;
    });
  }

  /** Give a reservation back (the send failed). */
  async release(parts: number): Promise<void> {
    await prisma.transaction(async (tx) => {
      const p = await tx.orm.public.Provider.where({ id: this.id }).forNoKeyUpdate().first();
      if (p) await tx.orm.public.Provider.where({ id: this.id }).update({ balance: p.balance + parts });
    });
  }

  /** Pretend to send. Throws ProviderError `failureRate` of the time. */
  async send(_msg: { to: string; message: string; sender: string }): Promise<{ providerMessageId: string }> {
    await sleep(50 + Math.random() * 150); // fake network latency
    if (Math.random() < this.failureRate) {
      throw new ProviderError("PROVIDER_REJECTED", `${this.code} failed to deliver the message`);
    }
    return { providerMessageId: `${this.code}-${randomUUID()}` };
  }
}

function toProvider(r: {
  id: string; code: string; name: string; priority: number; failureRate: number; isActive: boolean;
}) {
  return new MockProvider(r.id, r.code, r.name, r.priority, r.failureRate, r.isActive);
}

/** Active routes, best priority first (1 = highest). */
export async function loadActiveProviders(): Promise<MockProvider[]> {
  const rows = await prisma.orm.public.Provider
    .where({ isActive: true })
    .orderBy((p) => p.priority.asc())
    .all();
  return rows.map(toProvider);
}

export async function loadAllProviders(): Promise<MockProvider[]> {
  const rows = await prisma.orm.public.Provider.orderBy((p) => p.priority.asc()).all();
  return rows.map(toProvider);
}

export type FinalStatus = "SENT" | "FAILED";

async function recordAttempt(
  messageId: string,
  providerId: string,
  status: "SUCCESS" | "FAILED" | "SKIPPED",
  errorMessage: string | null,
) {
  await prisma.orm.public.MessageAttempt.create({
    messageId,
    providerId,
    status,
    errorMessage,
    errorCode: errorMessage ? "PROVIDER_REJECTED" : null,
  });
}

async function dispatch(messageId: string): Promise<FinalStatus | undefined> {
  const message = await prisma.transaction(async (tx) => {
    const queued = await tx.orm.public.SmsMessage.where({ id: messageId }).forUpdate().first();
    if (!queued || queued.status !== "QUEUED") return null;
    return tx.orm.public.SmsMessage.where({ id: messageId }).update({ status: "SENDING" });
  });
  if (!message) return undefined;

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
      await prisma.transaction(async (tx) => {
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
      });
      return "SENT";
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Provider failed to send the message";
      await provider.release(message.segments);
      await recordAttempt(message.id, provider.id, "FAILED", lastError);
    }
  }

  await prisma.transaction(async (tx) => {
    const wallet = await tx.orm.public.Wallet.where({ userId: message.userId }).forUpdate().first();
    if (wallet) {
      await tx.orm.public.Wallet.where({ id: wallet.id }).update({ balance: wallet.balance + message.creditsCharged });
    }
    await tx.orm.public.SmsMessage.where({ id: message.id }).update({
      status: "FAILED",
      errorMessage: lastError,
      refundIssued: true,
    });
  });
  return "FAILED";
}

/** In-process queue used by the API after a message has been committed. */
export const dispatcher = { enqueue: dispatch };
