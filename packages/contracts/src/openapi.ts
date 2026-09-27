import { z } from 'zod';
import type { Endpoint } from './endpoint.js';

/** Builds an OpenAPI 3.1 document from endpoint definitions (ADR-0010). */
export function buildOpenApiDocument(endpoints: readonly Endpoint[], version: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of endpoints) {
    const path = e.path.replace(/:([A-Za-z]+)/g, '{$1}');
    const parameters: unknown[] = [];
    for (const [where, schema] of [
      ['path', e.params],
      ['query', e.query],
    ] as const) {
      if (!schema) continue;
      const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as {
        properties?: Record<string, unknown>;
        required?: string[];
      };
      for (const [name, s] of Object.entries(json.properties ?? {})) {
        parameters.push({
          name,
          in: where,
          required: where === 'path' || !!json.required?.includes(name),
          schema: s,
        });
      }
    }
    if (e.idempotent) {
      parameters.push({
        name: 'Idempotency-Key',
        in: 'header',
        required: true,
        schema: { type: 'string' },
      });
    }
    paths[path] ??= {};
    paths[path][e.method.toLowerCase()] = {
      summary: e.summary,
      security:
        e.auth === 'public' ? [] : [{ [e.auth === 'admin' ? 'adminSession' : 'session']: [] }],
      parameters,
      ...(e.body
        ? {
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: z.toJSONSchema(e.body, { io: 'input', unrepresentable: 'any' }),
                },
              },
            },
          }
        : {}),
      responses: {
        '200': {
          description: 'OK',
          content: {
            'application/json': { schema: z.toJSONSchema(e.response, { unrepresentable: 'any' }) },
          },
        },
        default: { description: 'Problem details (RFC 9457)' },
      },
    };
  }
  return {
    openapi: '3.1.0',
    info: { title: 'Jordan Sports API', version },
    components: {
      securitySchemes: {
        session: { type: 'apiKey', in: 'cookie', name: 'js_session' },
        adminSession: { type: 'apiKey', in: 'cookie', name: 'js_admin_session' },
      },
    },
    paths,
  };
}
