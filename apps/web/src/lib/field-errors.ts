import { ApiError } from '@jordan-sports/contracts/web';

interface FieldIssue {
  path: string;
  code: string;
  message: string;
}

/** The zod issues `Errors.validation()` attaches to a VALIDATION_FAILED response, if any. */
function issuesOf(error: unknown): FieldIssue[] {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_FAILED') return [];
  const issues = (error.problem as { issues?: unknown }).issues;
  return Array.isArray(issues) ? (issues as FieldIssue[]) : [];
}

/**
 * A field-error lookup for one form: `fields('name').ar` etc. Built once per render from the
 * mutation's error, then read per `TextField`/`SelectField` so each one highlights itself instead
 * of a single generic banner. `path` matches the contract's zod field name (e.g. "governorateId",
 * or "name" for a nested `{ar, en}` — zod's own `.refine()` errors land on the object path).
 */
export function fieldErrors(error: unknown) {
  const issues = issuesOf(error);
  return (path: string): string | undefined =>
    issues.find((i) => i.path === path || i.path.startsWith(`${path}.`))?.message;
}

/** True once every issue in a VALIDATION_FAILED error was matched to a known field — nothing left for a generic banner. */
export function allIssuesMatched(error: unknown, knownPaths: readonly string[]): boolean {
  const issues = issuesOf(error);
  if (issues.length === 0) return false;
  return issues.every((i) => knownPaths.some((p) => i.path === p || i.path.startsWith(`${p}.`)));
}
