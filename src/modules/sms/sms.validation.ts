import { HttpError } from "./sms.errors.js";
import { analyzeMessage } from "./sms.encoding.js";

export type PhoneResult = 
    | { ok: true; value: string } 
    | { ok: false; reason: string };

export function normalizeNumber(raw: unknown): PhoneResult {
    if (typeof raw !== "string" || raw.trim() === "") {
        return { ok: false, reason: "must be a non-empty string" };
    }
    const trimmed = raw.trim();

    if (!/^\+?[\d\s\-().]+$/.test(trimmed)) {
        return { ok: false, reason: "contains invalid characters (only digits, spaces, - ( ) . and a leading + are allowed)" };
    }

    const compact = trimmed.replace(/[\s\-().]/g, "");
    let localNumber = compact;

    if (localNumber.startsWith("+977")) {
        localNumber = localNumber.slice(4);
    } else if (localNumber.startsWith("977") && localNumber.length === 13) {
        localNumber = localNumber.slice(3);
    }

    if (!/^(97|98)\d{8}$/.test(localNumber)) {
        return { ok: false, reason: "must be a 10-digit Nepali mobile number beginning with 97 or 98" };
    }

    return { ok: true, value: localNumber };
}

// Full Request Body Validation
export type SendSmsInput = {
    to: string[];
    message: string;
    sender?: string;
};

export function validateSendRequest(body: unknown): { ok: true; data: SendSmsInput } | { ok: false; errors: Record<string, string> } {
    if (!body || typeof body !== "object") {
        return { ok: false, errors: { body: "Request body must be a valid JSON object" } };
    }

    const { to, message, sender } = body as Record<string, unknown>;
    const errors: Record<string, string> = {};

    // 1. Validate 'to' field (must be a non-empty array of numbers)
    const normalizedRecipients: string[] = [];
    if (!Array.isArray(to) || to.length === 0) {
        errors.to = "'to' must be a non-empty array of phone numbers";
    } else {
        const recipientErrors: string[] = [];
        for (let i = 0; i < to.length; i++) {
            const res = normalizeNumber(to[i]);
            if (res.ok) {
                normalizedRecipients.push(res.value);
            } else {
                recipientErrors.push(`Index ${i}: ${res.reason}`);
            }
        }
        if (recipientErrors.length > 0) {
            errors.to = `Invalid phone numbers: ${recipientErrors.join("; ")}`;
        }
    }

    // 2. Validate 'message' field
    if (typeof message !== "string" || message.trim() === "") {
        errors.message = "'message' must be a non-empty string";
    }

    // 3. Optional 'sender' validation (if provided)
    if (sender !== undefined) {
        if (typeof sender !== "string" || sender.trim() === "" || sender.length > 11) {
            errors.sender = "'sender' must be a valid string of max 11 characters";
        }
    }

    if (Object.keys(errors).length > 0) {
        return { ok: false, errors };
    }

    return {
        ok: true,
        data: {
            to: normalizedRecipients,
            message: (message as string).trim(),
            sender: typeof sender === "string" ? sender.trim() : undefined,
        },
    };
}

export type StatusFilter = "pending" | "sent" | "failed";

export const STATUS_FILTERS: Record<StatusFilter, readonly string[]> = {
    pending: ["QUEUED", "SENDING"],
    sent: ["SENT"],
    failed: ["FAILED"],
};

export type LogsQuery = {
    page: number;
    limit: number;
    status?: StatusFilter;
    startDate?: Date;
    endDate?: Date;
    number?: string;
};

function singleQueryValue(query: Record<string, unknown>, name: string): string | undefined {
    const value = query[name];
    if (value === undefined) return undefined;
    if (typeof value !== "string" || value.trim() === "") {
        throw new HttpError(400, `'${name}' must be a single, non-empty query parameter`);
    }
    return value.trim();
}

function positiveInteger(value: string | undefined, name: string, fallback: number, maximum: number): number {
    if (value === undefined) return fallback;
    if (!/^\d+$/.test(value)) {
        throw new HttpError(400, `'${name}' must be a positive integer`);
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
        throw new HttpError(400, `'${name}' must be between 1 and ${maximum}`);
    }
    return parsed;
}

function parseDate(value: string | undefined, name: string): Date | undefined {
    if (value === undefined) return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        throw new HttpError(400, `'${name}' must be a valid ISO-8601 date or timestamp`);
    }
    return parsed;
}

/** Parse GET /sms/logs query parameters into the filters used by smsService.logs. */
export function parseLogsQuery(query: Record<string, unknown>): LogsQuery {
    const page = positiveInteger(singleQueryValue(query, "page"), "page", 1, 1_000_000);
    const limit = positiveInteger(singleQueryValue(query, "limit"), "limit", 20, 100);
    const statusValue = singleQueryValue(query, "status");
    if (statusValue !== undefined && !(statusValue in STATUS_FILTERS)) {
        throw new HttpError(400, "'status' must be pending, sent, or failed");
    }

    const startDate = parseDate(singleQueryValue(query, "startDate"), "startDate");
    const endDate = parseDate(singleQueryValue(query, "endDate"), "endDate");
    if (startDate && endDate && startDate > endDate) {
        throw new HttpError(400, "'startDate' must be before or equal to 'endDate'");
    }

    const numberValue = singleQueryValue(query, "number");
    let number: string | undefined;
    if (numberValue !== undefined) {
        const normalized = normalizeNumber(numberValue);
        if (!normalized.ok) {
            throw new HttpError(400, `'number' ${normalized.reason}`);
        }
        number = normalized.value;
    }

    return {
        page,
        limit,
        ...(statusValue !== undefined ? { status: statusValue as StatusFilter } : {}),
        ...(startDate ? { startDate } : {}),
        ...(endDate ? { endDate } : {}),
        ...(number ? { number } : {}),
    };
}

export type ValidatedSendInput = {
    recipients: { input: string; normalized: string }[];
    message: string;
    sender: string;
    encoding: "GSM7" | "UNICODE";
    segments: number;
    duplicatesRemoved: string[];
};

export function validateSendInput(body: unknown): ValidatedSendInput {
    const result = validateSendRequest(body);
    if (!result.ok) {
        throw new HttpError(400, Object.values(result.errors).join(", "));
    }

    const recipients: { input: string; normalized: string }[] = [];
    const seen = new Set<string>();
    const duplicatesRemoved: string[] = [];
    for (let i = 0; i < result.data.to.length; i += 1) {
        const normalized = result.data.to[i]!;
        if (seen.has(normalized)) {
            duplicatesRemoved.push(normalized);
            continue;
        }
        seen.add(normalized);
        recipients.push({ input: normalized, normalized });
    }

    const { encoding, segments } = analyzeMessage(result.data.message);

    return {
        recipients,
        message: result.data.message,
        sender: result.data.sender ?? process.env.SMS_SENDER ?? "SMS-Gateway",
        encoding,
        segments,
        duplicatesRemoved,
    };
}
