import prisma from "../../lib/prisma.js";
export const authService = {
    async register(email, password) {
        const existingUser = await prisma.orm.public.User
            .where({ email })
            .first();
        if (existingUser) {
            throw Object.assign(new Error("Email already registered"), {
                statusCode: 409,
            });
        }
    }
};
