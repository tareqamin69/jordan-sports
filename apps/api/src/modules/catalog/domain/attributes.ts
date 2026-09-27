import type { AttributeField } from '@jordan-sports/contracts';

export type AttributeValues = Record<string, string | boolean>;

export interface Feature {
  key: string;
  label: { ar?: string; en?: string };
  value: { ar?: string; en?: string } | null;
}

/**
 * Validates resource attributes against the resource type's attribute schema. Unknown keys and
 * values outside the allowed options are rejected. Returns the attributes to store.
 * Pure function: no sport-specific logic, the schema is data.
 */
export function validateAttributes(
  fields: readonly AttributeField[],
  input: AttributeValues,
): AttributeValues | string {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const out: AttributeValues = {};
  for (const [key, value] of Object.entries(input)) {
    const field = byKey.get(key);
    if (!field) return `unknown attribute "${key}"`;
    if (field.type === 'boolean') {
      if (typeof value !== 'boolean') return `attribute "${key}" must be true or false`;
    } else if (typeof value !== 'string' || !field.options.some((o) => o.value === value)) {
      return `attribute "${key}" has an unsupported value`;
    }
    out[key] = value;
  }
  return out;
}

/** Resolves stored attributes into display features (booleans only when true). */
export function describeAttributes(
  fields: readonly AttributeField[],
  values: AttributeValues,
): Feature[] {
  const features: Feature[] = [];
  for (const field of fields) {
    const value = values[field.key];
    if (field.type === 'boolean') {
      if (value === true) features.push({ key: field.key, label: field.label, value: null });
    } else if (typeof value === 'string') {
      const option = field.options.find((o) => o.value === value);
      if (option) features.push({ key: field.key, label: field.label, value: option.label });
    }
  }
  return features;
}
