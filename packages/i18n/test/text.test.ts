import { describe, expect, it } from 'vitest';
import { messages } from '../src/index.js';
import { joinPlace } from '../src/text.js';

describe('joinPlace', () => {
  it('does not repeat parts the address already contains', () => {
    expect(joinPlace(['شارع الجامعة، إربد', 'شارع الجامعة', 'إربد'], 'ar')).toBe(
      'شارع الجامعة، إربد',
    );
  });
  it('joins street, area and governorate with the locale comma', () => {
    expect(joinPlace(['University St', 'Irbid', 'Irbid'], 'en')).toBe('University St, Irbid');
    expect(joinPlace(['شارع', 'الصويفية', 'عمّان'], 'ar')).toBe('شارع، الصويفية، عمّان');
  });
  it('ignores empty parts and is case-insensitive', () => {
    expect(joinPlace(['', undefined, 'Amman, amman '], 'en')).toBe('Amman');
  });
});

describe('Arabic plural agreement', () => {
  type Tree = { readonly [key: string]: string | Tree };
  const walk = (tree: Tree, prefix = ''): Array<[string, string]> =>
    Object.entries(tree).flatMap(([k, v]) =>
      typeof v === 'string'
        ? [[`${prefix}${k}`, v] as [string, string]]
        : walk(v, `${prefix}${k}.`),
    );
  const all = walk(messages.ar as unknown as Tree);

  it('every counted message uses ICU plural forms, not "{n} unit"', () => {
    const hacks = all.filter(
      ([, m]) =>
        !m.includes(', plural,') &&
        /\{(count|days|minutes|hours|n)\}\s*(يوم|أيام|دقيقة|دقائق|ساعة|ساعات|منطقة|مناطق|ملعب|ملاعب)/.test(
          m,
        ),
    );
    expect(hacks).toEqual([]);
  });

  it('plural messages have the forms Arabic needs (few = 3–10, other = 11+)', () => {
    for (const [key, message] of all.filter(([, m]) => m.includes(', plural,'))) {
      expect(message, key).toMatch(/\bfew\b|=3/);
      expect(message, key).toMatch(/\bother\b/);
    }
  });

  it.each(['daysShort', 'minutes', 'hoursShort', 'areaCount'])(
    '%s has one/two/few/other',
    (name) => {
      const [, message] = all.find(([key]) => key.endsWith(`.${name}`))!;
      for (const form of ['one', 'two', 'few', 'other']) expect(message).toContain(`${form} {`);
    },
  );
});
