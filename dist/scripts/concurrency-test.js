// The "20 parallel requests, wallet affords 10" test.
//   1) npx tsx scripts/set-wallet.ts you@example.com 10
//   2) TOKEN=<your JWT> npx tsx scripts/concurrency-test.ts
// Each request = 1 recipient x 1 part = 1 credit, so exactly 10 should be accepted and 10 rejected with 402.
const BASE = process.env.BASE_URL ?? "http://localhost:5000/api/v1";
const TOKEN = process.env.TOKEN;
const N = Number(process.env.REQUESTS ?? 20);
if (!TOKEN) {
    console.error("set TOKEN to a JWT from POST /auth/login");
    process.exit(1);
}
const headers = { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` };
const before = await (await fetch(`${BASE}/wallet`, { headers })).json();
console.log("wallet before:", before);
const responses = await Promise.all(Array.from({ length: N }, (_, i) => fetch(`${BASE}/sms/send`, {
    method: "POST",
    headers,
    body: JSON.stringify({ to: ["+9779800000000"], message: `parallel test ${i}` }),
})));
const tally = {};
for (const r of responses)
    tally[r.status] = (tally[r.status] ?? 0) + 1;
console.log("HTTP status counts:", tally);
const accepted = (tally[200] ?? 0) + (tally[202] ?? 0);
console.log(`accepted: ${accepted}  rejected (402): ${tally[402] ?? 0}`);
await new Promise((r) => setTimeout(r, 3000)); // let in-flight sends finish / refund
console.log("wallet after:", await (await fetch(`${BASE}/wallet`, { headers })).json());
console.log(accepted === 10
    ? "PASS: exactly 10 accepted"
    : `CHECK: accepted ${accepted}. If it is > 10, a message failed on every route and its refund landed before a later request was charged (rare). Re-run.`);
export {};
