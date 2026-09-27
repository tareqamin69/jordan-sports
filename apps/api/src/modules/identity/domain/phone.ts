/**
 * Phone number normalization to E.164. Jordanian numbers are accepted in the common local
 * formats (07XXXXXXXX, 7XXXXXXXX, 009627…, +9627…); Jordanian mobiles must be 77/78/79.
 * Other countries are accepted in international format only.
 */
export function normalizePhone(input: string): string | null {
  const compact = input.replace(/[\s\-().]/g, '').replace(/^00/, '+');
  // Convert Eastern Arabic / Persian digits that some keyboards produce.
  const ascii = compact.replace(/[٠-٩۰-۹]/g, (d) => String((d.charCodeAt(0) & 0xf) % 10));

  let e164: string;
  if (/^0?7\d{8}$/.test(ascii)) {
    e164 = `+962${ascii.replace(/^0/, '')}`;
  } else if (/^\+\d{8,15}$/.test(ascii)) {
    e164 = ascii;
  } else if (/^962\d{9}$/.test(ascii)) {
    e164 = `+${ascii}`;
  } else {
    return null;
  }

  if (e164.startsWith('+962')) {
    return /^\+9627[789]\d{7}$/.test(e164) ? e164 : null;
  }
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}
