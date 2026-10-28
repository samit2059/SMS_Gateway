import { randomUUID } from "node:crypto";
import prisma from "../../lib/prisma.js"; // Adjust based on your setup

export const MockProvider = {
    async getBalance(id: string): Promise<number> {
        const row = await prisma.orm.public.Provider.where({ id }).first();
        return row?.balance ?? 0;
    },

    async reserve(id: string, parts: number): Promise<boolean> {
        return prisma.transaction(async (tx) => {
            const p = await tx.orm.public.Provider.where({ id }).forNoKeyUpdate().first();
            if (!p || !p.isActive || p.balance < parts) return false;
            await tx.orm.public.Provider.where({ id }).update({ balance: p.balance - parts });
            return true;
        });
    },

    async release(id: string, parts: number): Promise<void> {
        await prisma.transaction(async (tx) => {
            const p = await tx.orm.public.Provider.where({ id }).forNoKeyUpdate().first();
            if (p) await tx.orm.public.Provider.where({ id }).update({ balance: p.balance + parts });
        });
    },

    async send(config: { failureRate: number; code: string }, _msg: { to: string; message: string; sender: string }) {
        await new Promise((r) => setTimeout(r, 50 + Math.random() * 150));
        if (Math.random() < config.failureRate) {
            throw new Error(`${config.code} failed to deliver the message`);
        }
        return { providerMessageId: `${config.code}-${randomUUID()}` };
    }
};

export async function loadActiveProviders() {
    return await prisma.orm.public.Provider
        .where({ isActive: true })
        .orderBy((p) => p.priority.asc())
        .all();
}