import { Global, Module } from '@nestjs/common';
import { ResourcesService } from './application/resources.service.js';

@Global()
@Module({ providers: [ResourcesService], exports: [ResourcesService] })
export class ResourcesModule {}
