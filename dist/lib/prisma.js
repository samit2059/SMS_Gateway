import "dotenv/config";
import "temporal-polyfill/full/global";
import postgres from "@prisma/orm-postgres/runtime";
import { contractFromJson } from "@prisma/orm-postgres/static";
import contractJson from "../prisma/contract.json" with { type: "json" };
const contract = contractFromJson(contractJson);
const prisma = postgres({
    contract,
    url: process.env["DATABASE_URL"],
});
export default prisma;
