// import {HttpError} from ''
import prisma from "../../lib/prisma.js";
export const MAX_ATTEMPT = 3;
export const smsService = {
    /** Create a QUEUED message. The worker picks it up and sends it. */
    async queueMessage(userId, input) {
        // If TypeScript says nullable fields (from, deviceId, sentAt...) are required,
        // pass them explicitly as null.
        return prisma.orm.public.Message.create({
            direction: "outbound",
            to: input.to,
            body: input.body,
            status: "queued",
            userId,
        });
    },
};
