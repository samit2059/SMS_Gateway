import { HttpError } from "./sms.errors.js";

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

    let digits = trimmed.replace(/[\s\-().]/g, "");
    let localNumber = digits;

    if (localNumber.startsWith("+977")) {
        localNumber = localNumber.slice(4);
    } else if (localNumber.startsWith("977") && localNumber.length === 12) {
        localNumber = localNumber.slice(3);
    }
    else if (localNumber.startsWith("00977")) {
    localNumber = localNumber.slice(5);
  }

    if (! /^\+[1-9]\d{7,14}$/.test(localNumber)) {
        return { ok: false, reason: "not a valid international number (expected 8-15 digits including country code)" };
    }

    // Country rule for Nepal: mobile numbers are 10 digits starting with 9.
    if (localNumber.startsWith("+977") && ! /^\+9779\d{9}$/.test(localNumber)) {
        return { ok: false, reason: "Nepal mobile numbers must be 10 digits starting with 9" };
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

const GSM7_BASIC_SET = new Set([
  '@', '£', '$', '¥', 'è', 'é', 'ù', 'ì', 'ò', 'Ç', '\n', 'Ø', 'ø', '\r', 'Å', 'å',
  'Δ', '_', 'Φ', 'Γ', 'Λ', 'Ω', 'Π', 'Ψ', 'Σ', 'Θ', 'Ξ', 'Æ', 'æ', 'ß', 'É',
  ' ', '!', '"', '#', '¤', '%', '&', "'", '(', ')', '*', '+', ',', '-', '.', '/',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ':', ';', '<', '=', '>', '?',
  '¡', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O',
  'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'Ä', 'Ö', 'Ñ', 'Ü', '§',
  '¿', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o',
  'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'ä', 'ö', 'ñ', 'ü', 'à'
]);

const GSM7_EXTENSION_SET = new Set([
    '\f', '^', '{', '}', '\\', '[', ']', '~', '|', '€'
]);

/**
 * Returns the number of GSM-7 septets required for `message`, or undefined
 * when any character must be sent as Unicode. Extension-table characters are
 * encoded with an escape character and therefore consume two septets.
 */
function gsm7SeptetCount(message: string): number | undefined {
    let septets = 0;

    for (const character of message) {
        if (GSM7_BASIC_SET.has(character)) {
            septets += 1;
        } else if (GSM7_EXTENSION_SET.has(character)) {
            septets += 2;
        } else {
            return undefined;
        }
    }

    return septets;
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

    const gsm7Septets = gsm7SeptetCount(result.data.message);
    const encoding = gsm7Septets === undefined ? "UNICODE" : "GSM7";
    const units = gsm7Septets ?? result.data.message.length;
    const singlePartLimit = encoding === "GSM7" ? 160 : 70;
    const multipartLimit = encoding === "GSM7" ? 153 : 67;
    const segments = units <= singlePartLimit ? 1 : Math.ceil(units / multipartLimit);

    return {
        recipients,
        message: result.data.message,
        sender: result.data.sender ?? process.env.SMS_SENDER ?? "SMS-Gateway",
        encoding,
        segments,
        duplicatesRemoved,
    };
}
