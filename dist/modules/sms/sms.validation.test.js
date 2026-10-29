import assert from "node:assert/strict";
import test from "node:test";
import { validateSendInput } from "./sms.validation.js";
function validate(message) {
    const result = validateSendInput({
        to: ["+15551234567"],
        message,
    });
    return { encoding: result.encoding, segments: result.segments };
}
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
