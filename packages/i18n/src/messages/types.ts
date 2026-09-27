import type { en } from './en.js';

/** Same nested keys as `T`, with every leaf widened to `string`. */
export type DeepStringRecord<T> = {
  readonly [K in keyof T]: T[K] extends string ? string : DeepStringRecord<T[K]>;
};

/** Shape every locale catalog must satisfy (derived from the English catalog). */
export type MessageCatalog = DeepStringRecord<typeof en>;
