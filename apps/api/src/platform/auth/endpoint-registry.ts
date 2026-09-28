import * as contracts from '@jordan-sports/contracts';
import type { Endpoint } from '@jordan-sports/contracts';

function isEndpoint(value: unknown): value is Endpoint {
  return (
    typeof value === 'object' &&
    value !== null &&
    'method' in value &&
    'path' in value &&
    'response' in value &&
    typeof (value as { path: unknown }).path === 'string' &&
    (value as { path: string }).path.startsWith('/v1/')
  );
}

/** Every endpoint defined in the contracts (ADR-0010). */
export const allEndpoints: Endpoint[] = (Object.values(contracts) as unknown[]).filter(isEndpoint);

const byRoute = new Map(allEndpoints.map((e) => [`${e.method} ${e.path}`, e]));

/**
 * The contract of the route being served: permissions are declared there (docs/rbac-plan.md), so
 * the guards read them from the same place as the tests and the apps.
 */
export function endpointFor(method: string, routePath: string | undefined): Endpoint | undefined {
  return routePath ? byRoute.get(`${method.toUpperCase()} ${routePath}`) : undefined;
}
