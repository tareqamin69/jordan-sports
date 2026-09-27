import { describe, expect, it } from 'vitest';
import { defaultLocale, getDirection, isLocale, locales, toIntlLocale } from '../src/index.js';

const EASTERN_ARABIC_DIGITS = /[٠-٩۰-۹]/;

describe('locales', () => {
  it('supports Arabic and English with Arabic as the default', () => {
    expect(locales).toEqual(['ar', 'en']);
    expect(defaultLocale).toBe('ar');
  });

  it('maps each locale to its text direction', () => {
    expect(getDirection('ar')).toBe('rtl');
    expect(getDirection('en')).toBe('ltr');
  });

  it('recognises only supported locales', () => {
    expect(isLocale('ar')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale('AR')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe('toIntlLocale (Western digits in every locale)', () => {
  for (const locale of locales) {
    it(`formats numbers with Western digits in ${locale}`, () => {
      const formatted = new Intl.NumberFormat(toIntlLocale(locale), {
        minimumFractionDigits: 3,
      }).format(1234567.891);
      expect(formatted).not.toMatch(EASTERN_ARABIC_DIGITS);
      expect(formatted.replace(/\D/g, '')).toBe('1234567891');
    });

    it(`formats dates with Western digits in ${locale}`, () => {
      const formatted = new Intl.DateTimeFormat(toIntlLocale(locale), {
        dateStyle: 'full',
        timeStyle: 'short',
        timeZone: 'Asia/Amman',
      }).format(new Date('2026-09-25T18:30:00Z'));
      expect(formatted).not.toMatch(EASTERN_ARABIC_DIGITS);
      expect(formatted).toMatch(/2026/);
    });
  }
});
