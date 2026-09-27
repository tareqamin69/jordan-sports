import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';
import { describe, expect, it } from 'vitest';
import { locales, messages } from '../src/index.js';

type Tree = { readonly [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      out.set(path, value);
    } else {
      for (const [k, v] of flatten(value, path)) out.set(k, v);
    }
  }
  return out;
}

function argumentNames(elements: MessageFormatElement[], into = new Set<string>()): Set<string> {
  for (const el of elements) {
    if (el.type === TYPE.literal || el.type === TYPE.pound) continue;
    if (el.type === TYPE.tag) {
      argumentNames(el.children, into);
      continue;
    }
    into.add(el.value);
    if (el.type === TYPE.plural || el.type === TYPE.select) {
      for (const option of Object.values(el.options)) argumentNames(option.value, into);
    }
  }
  return into;
}

const flat = Object.fromEntries(locales.map((l) => [l, flatten(messages[l] as Tree)]));

describe('message catalogs', () => {
  it('have identical keys in every locale', () => {
    const [first, ...rest] = locales;
    const reference = [...flat[first!]!.keys()].sort();
    for (const locale of rest) {
      expect([...flat[locale]!.keys()].sort(), `keys of ${locale}`).toEqual(reference);
    }
  });

  it('contain no empty messages', () => {
    for (const locale of locales) {
      for (const [key, value] of flat[locale]!) {
        expect(value.trim(), `${locale}:${key}`).not.toBe('');
      }
    }
  });

  it('are valid ICU MessageFormat and use the same placeholders across locales', () => {
    for (const [key, enValue] of flat.en!) {
      const enArgs = [...argumentNames(parse(enValue))].sort();
      for (const locale of locales) {
        const value = flat[locale]!.get(key)!;
        const args = [...argumentNames(parse(value))].sort();
        expect(args, `${locale}:${key}`).toEqual(enArgs);
      }
    }
  });
});
