import { Controller, Get } from '@nestjs/common';
import { buildOpenApiDocument } from '@jordan-sports/contracts';
import { allEndpoints } from '../auth/endpoint-registry.js';

export { allEndpoints };
import { Public } from '../auth/decorators.js';

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
