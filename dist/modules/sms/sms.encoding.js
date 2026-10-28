// GSM 03.38 character sets. Anything outside them forces UCS-2 ("UNICODE"), which has smaller segments.
const GSM_BASIC = new Set([..."@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"]);
// Extension characters cost 2 units each in GSM-7.
const GSM_EXT = new Set([..."\f^{}\\[~]|€"]);
export const MAX_SEGMENTS = 10;
export function analyzeMessage(text) {
    let units = 0;
    let isGsm = true;
    for (const ch of text) {
        if (GSM_BASIC.has(ch))
            units += 1;
        else if (GSM_EXT.has(ch))
            units += 2;
        else {
            isGsm = false;
            break;
        }
    }
    if (isGsm) {
        // 160 chars in one SMS; 153 per part when concatenated (7 chars go to the join header)
        return { encoding: "GSM7", segments: units <= 160 ? 1 : Math.ceil(units / 153) };
    }
    // UCS-2 counts UTF-16 code units (an emoji is 2). 70 in one SMS; 67 per part when concatenated.
    const len = text.length;
    return { encoding: "UNICODE", segments: len <= 70 ? 1 : Math.ceil(len / 67) };
}
