import { Body, Controller, Delete, Get, Param, Post, Query, Req } from '@nestjs/common';
import {
  adminCreateHoliday,
  adminDeleteHoliday,
  adminListHolidays,
} from '@jordan-sports/contracts';
import type { FastifyRequest } from 'fastify';
import type { Actor } from '../../../platform/auth/actor.js';
import { AdminAuth, CurrentActor } from '../../../platform/auth/decorators.js';
import { requestMeta } from '../../../platform/http/request-context.js';
import { parseInput } from '../../../platform/http/validation.js';
import { HolidaysService } from '../application/holidays.service.js';

@Controller()
export class AdminHolidaysController {
  constructor(private readonly holidays: HolidaysService) {}

  @Get(adminListHolidays.path)
  @AdminAuth('venues.read')
  list(@Query() query: unknown) {
    return this.holidays.list(parseInput(adminListHolidays.query, query).country);
  }

  @Post(adminCreateHoliday.path)
  @AdminAuth('catalog.manage')
  create(@Body() body: unknown, @CurrentActor() actor: Actor, @Req() request: FastifyRequest) {
    return this.holidays.create(
      actor.userId,
      parseInput(adminCreateHoliday.body, body),
      requestMeta(request),
    );
  }

  @Delete(adminDeleteHoliday.path)
  @AdminAuth('catalog.manage')
  delete(@Param() params: unknown, @CurrentActor() actor: Actor, @Req() request: FastifyRequest) {
    const { holidayId } = parseInput(adminDeleteHoliday.params, params);
    return this.holidays.delete(actor.userId, holidayId, requestMeta(request));
  }
}
