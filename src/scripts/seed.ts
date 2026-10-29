import prisma from "../lib/prisma.js";

async function main() {
    console.log("Seeding mock providers...");

    // Upsert or create your routes so the dispatcher can pick them up
 const routes = [
    { code: "ROUTE_A", name: "Route A", priority: 1, failureRate: 0.3, balance: 10000 },
    { code: "ROUTE_B", name: "Route B", priority: 2, failureRate: 0.1, balance: 10000 },
    { code: "ROUTE_C", name: "Route C", priority: 3, failureRate: 0.05, balance: 10000 },
];

  for (const r of routes) {
    await prisma.orm.public.Provider.upsert({
        conflictOn: { code: r.code },
        update: { 
            name: r.name,
            priority: r.priority, 
            failureRate: r.failureRate
        },
        create: r,
    });
    console.log(`- Seeded route: ${r.code}`);
}
}

main()
    .catch((e) => {
        console.error("Seeding failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.close();
    });
