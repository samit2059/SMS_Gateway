import assert from "node:assert/strict";
import test from "node:test";

import { analyzeMessage } from "./sms.encoding.js";
import { normalizeNumber, validateSendInput } from "./sms.validation.js";

function validate(message: string) {
    const result = validateSendInput({
        to: ["9841234567"],
        message,
    });
    return { encoding: result.encoding, segments: result.segments };
}

test("normalizes only valid Nepali mobile numbers", () => {
    assert.deepEqual(normalizeNumber("9841234567"), { ok: true, value: "9841234567" });
    assert.deepEqual(normalizeNumber("+9779801122334"), { ok: true, value: "9801122334" });
    assert.deepEqual(normalizeNumber("9779761234567"), { ok: true, value: "9761234567" });
    assert.deepEqual(normalizeNumber("+977 984-123-4567"), { ok: true, value: "9841234567" });

    for (const number of ["9612345678", "+15551234567", "984123456", "98412345678"]) {
        assert.equal(normalizeNumber(number).ok, false, number);
    }
});

test("normalizes recipients before calculating message cost", () => {
    const result = validateSendInput({
        to: ["+9779801122334", "9779761234567", "9841234567"],
        message: "test",
    });
    assert.deepEqual(result.recipients.map((recipient) => recipient.normalized), ["9801122334", "9761234567", "9841234567"]);
});

test("counts GSM-7 basic characters at segment boundaries", () => {
    assert.deepEqual(validate("A".repeat(160)), { encoding: "GSM7", segments: 1 });
    assert.deepEqual(validate("A".repeat(161)), { encoding: "GSM7", segments: 2 });
    assert.deepEqual(validate("A".repeat(306)), { encoding: "GSM7", segments: 2 });
    assert.deepEqual(validate("A".repeat(307)), { encoding: "GSM7", segments: 3 });
});

test("counts GSM-7 extension characters as two septets", () => {
    assert.deepEqual(validate("{".repeat(80)), { encoding: "GSM7", segments: 1 });
    assert.deepEqual(validate("{".repeat(81)), { encoding: "GSM7", segments: 2 });
});

test("uses Unicode units when a message contains a non-GSM-7 character", () => {
    assert.deepEqual(validate("漢".repeat(70)), { encoding: "UNICODE", segments: 1 });
    assert.deepEqual(validate("漢".repeat(71)), { encoding: "UNICODE", segments: 2 });
    assert.deepEqual(validate("😀".repeat(35)), { encoding: "UNICODE", segments: 1 });
    assert.deepEqual(validate("😀".repeat(36)), { encoding: "UNICODE", segments: 2 });
    assert.equal(validate("`").encoding, "UNICODE");
});

test("classifies Nepali text and emoji as Unicode", () => {
    assert.deepEqual(analyzeMessage("नेपालबाट नमस्ते"), { encoding: "UNICODE", segments: 1 });
    assert.deepEqual(analyzeMessage("Hello 😀"), { encoding: "UNICODE", segments: 1 });
});

test("analyzes extension characters at multipart boundaries", () => {
    assert.deepEqual(analyzeMessage("{".repeat(153)), { encoding: "GSM7", segments: 2 });
    assert.deepEqual(analyzeMessage("{".repeat(154)), { encoding: "GSM7", segments: 3 });
});
