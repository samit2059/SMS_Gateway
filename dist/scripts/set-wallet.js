// npx tsx scripts/set-wallet.ts user@example.com 10   -> sets that user's wallet to exactly 10 credits
import prisma from "../lib/prisma.js";
const [email, credits] = process.argv.slice(2);
if (!email || credits === undefined || Number.isNaN(Number(credits))) {
    console.error("usage: tsx scripts/set-wallet.ts <email> <credits>");
    process.exit(1);
}
// Select only the field this utility needs. This keeps the admin wallet script
// usable while older databases are waiting for the User.name migration.
const user = await prisma.orm.public.User.where({ email }).select("id").first();
if (!user) {
    console.error(`no user with email ${email}`);
    process.exit(1);
}
const wallet = await prisma.orm.public.Wallet.where({
    userId: user.id,
}).first();
if (wallet) {
    await prisma.orm.public.Wallet.where({ userId: user.id }).update({
        balance: Number(credits),
    });
}
else {
    await prisma.orm.public.Wallet.create({
        userId: user.id,
        balance: Number(credits),
    });
}
console.log(`wallet for ${email} = ${credits} credits`);
await prisma.close();
