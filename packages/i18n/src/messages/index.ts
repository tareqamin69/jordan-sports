import type { Locale } from '../locales.js';
import { ar } from './ar.js';
import { en } from './en.js';
import type { MessageCatalog } from './types.js';

export type { MessageCatalog } from './types.js';

export const messages: Record<Locale, MessageCatalog> = { ar, en };
