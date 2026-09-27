import { errorCodes } from '@jordan-sports/contracts';
import { describe, expect, it } from 'vitest';
import { locales, messages } from '../src/index.js';

describe('error messages', () => {
  it('translate every API error code in every locale', () => {
    for (const locale of locales) {
      const translated = Object.keys(messages[locale].common.errors).sort();
      expect(translated, locale).toEqual([...errorCodes].sort());
    }
  });
});
