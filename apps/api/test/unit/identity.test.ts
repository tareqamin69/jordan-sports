import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { normalizePhone } from '../../src/modules/identity/domain/phone.js';
import {
  hasPlatformPermission,
  platformPermissions,
} from '../../src/modules/identity/domain/platform-permissions.js';
import { hasOrgPermission } from '../../src/modules/tenancy/domain/org-permissions.js';
import { isUuid, uuidv7 } from '../../src/platform/database/ids.js';
import {
  decryptSecret,
  encryptSecret,
  safeEqualHex,
  sha256Hex,
} from '../../src/platform/security/crypto.js';
import {
  base32Decode,
  base32Encode,
  hotp,
  otpauthUri,
  totpCode,
  verifyTotp,
} from '../../src/platform/security/totp.js';

describe('normalizePhone', () => {
  it.each([
    ['0791234567', '+962791234567'],
    ['791234567', '+962791234567'],
    ['+962 79 123 4567', '+962791234567'],
    ['00962781234567', '+962781234567'],
    ['962771234567', '+962771234567'],
    ['(079) 123-4567', '+962791234567'],
    ['٠٧٩١٢٣٤٥٦٧', '+962791234567'],
    ['+447911123456', '+447911123456'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['', '12345', '0761234567', '+962612345678', '07912345', '+0123456789', 'abc'])(
    'rejects %s',
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    },
  );
});

describe('TOTP (RFC 6238 / RFC 4226)', () => {
  const rfcSecret = Buffer.from('12345678901234567890');

  it('matches the RFC 4226 HOTP test vectors', () => {
    const expected = [
      '755224',
      '287082',
      '359152',
      '969429',
      '338314',
      '254676',
      '287922',
      '162583',
      '399871',
      '520489',
    ];
    expected.forEach((code, counter) => expect(hotp(rfcSecret, counter)).toBe(code));
  });

  it('matches the RFC 6238 SHA-1 vectors (last 6 digits)', () => {
    const secret = base32Encode(rfcSecret);
    expect(totpCode(secret, 59_000)).toBe('287082');
    expect(totpCode(secret, 1_111_111_109_000)).toBe('081804');
    expect(totpCode(secret, 1_234_567_890_000)).toBe('005924');
  });

  it('accepts ±1 step and returns the matched step', () => {
    const secret = base32Encode(rfcSecret);
    const now = 1_234_567_890_000;
    expect(verifyTotp(secret, totpCode(secret, now - 30_000), now)).toBe(
      Math.floor(now / 30_000) - 1,
    );
    expect(verifyTotp(secret, totpCode(secret, now + 30_000), now)).toBe(
      Math.floor(now / 30_000) + 1,
    );
    expect(verifyTotp(secret, totpCode(secret, now - 90_000), now)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', now)).toBeNull();
  });

  it('round-trips base32', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1, maxLength: 40 }), (bytes) => {
        expect([...base32Decode(base32Encode(Buffer.from(bytes)))]).toEqual([...bytes]);
      }),
    );
  });

  it('builds an otpauth URI for authenticator apps', () => {
    expect(otpauthUri('ABC', 'a@b.jo')).toMatch(
      /^otpauth:\/\/totp\/Jorena%3Aa%40b\.jo\?secret=ABC&/,
    );
  });
});

describe('crypto helpers', () => {
  it('encrypts secrets with authenticated encryption', () => {
    const encrypted = encryptSecret('k'.repeat(40), 'purpose', 'JBSWY3DPEHPK3PXP');
    expect(encrypted).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret('k'.repeat(40), 'purpose', encrypted)).toBe('JBSWY3DPEHPK3PXP');
    expect(() => decryptSecret('x'.repeat(40), 'purpose', encrypted)).toThrow();
    expect(() => decryptSecret('k'.repeat(40), 'other-purpose', encrypted)).toThrow();
  });

  it('compares digests in constant time and handles bad input', () => {
    expect(safeEqualHex(sha256Hex('a'), sha256Hex('a'))).toBe(true);
    expect(safeEqualHex(sha256Hex('a'), sha256Hex('b'))).toBe(false);
    expect(safeEqualHex('', '')).toBe(false);
  });
});

describe('uuidv7', () => {
  it('produces valid, version-7, time-ordered identifiers', () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_000_001);
    expect(isUuid(a)).toBe(true);
    expect(a[14]).toBe('7');
    expect(['8', '9', 'a', 'b']).toContain(a[19]);
    expect(a < b).toBe(true);
  });
});

describe('role permissions (docs/rbac-plan.md)', () => {
  it('gives the owner every platform permission and keeps the dangerous ones owner-only', () => {
    for (const p of platformPermissions) expect(hasPlatformPermission('owner', p)).toBe(true);
    for (const p of ['team.manage', 'settings.manage', 'venues.archive', 'venues.rate'] as const) {
      for (const role of ['admin', 'support', 'finance'] as const) {
        expect(hasPlatformPermission(role, p), `${role} ${p}`).toBe(false);
      }
    }
    expect(hasPlatformPermission('admin', 'venues.review')).toBe(true);
    expect(hasPlatformPermission('support', 'bookings.cancel')).toBe(true);
    expect(hasPlatformPermission('support', 'venues.review')).toBe(false);
    expect(hasPlatformPermission('support', 'users.manage')).toBe(false);
    expect(hasPlatformPermission('support', 'revenue.read')).toBe(false);
    expect(hasPlatformPermission('finance', 'revenue.read')).toBe(true);
    expect(hasPlatformPermission('finance', 'bookings.cancel')).toBe(false);
  });

  it('gives venue owners everything, managers the schedule, and staff the front desk', () => {
    expect(hasOrgPermission('owner', 'staff.manage')).toBe(true);
    expect(hasOrgPermission('manager', 'staff.manage')).toBe(false);
    expect(hasOrgPermission('manager', 'reports.read')).toBe(false);
    expect(hasOrgPermission('manager', 'venue.archive')).toBe(false);
    expect(hasOrgPermission('manager', 'pricing.manage')).toBe(true);
    expect(hasOrgPermission('staff', 'pricing.read')).toBe(false);
    expect(hasOrgPermission('staff', 'booking.create')).toBe(true);
    expect(hasOrgPermission('staff', 'booking.checkin')).toBe(true);
    expect(hasOrgPermission('staff', 'booking.cancel')).toBe(false);
  });
});
