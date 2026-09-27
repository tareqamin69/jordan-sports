import { Controller, Get } from '@nestjs/common';
import * as contracts from '@jordan-sports/contracts';
import { buildOpenApiDocument, type Endpoint } from '@jordan-sports/contracts';
import { Public } from '../auth/decorators.js';

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

export const allEndpoints: Endpoint[] = (Object.values(contracts) as unknown[]).filter(isEndpoint);

@Controller()
export class OpenApiController {
  private document?: ReturnType<typeof buildOpenApiDocument>;

  @Get('/v1/openapi.json')
  @Public()
  openapi() {
    this.document ??= buildOpenApiDocument(allEndpoints, '1');
    return this.document;
  }
}
