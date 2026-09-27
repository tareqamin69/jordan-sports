import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  cancelBlock,
  createBlock,
  createOverride,
  deleteOverride,
  getVenueCalendar,
  getVenueSchedule,
  listManagedVenues,
  setBookingPolicy,
  setWeeklyHours,
  updateScheduleSettings,
  type EndpointOutput,
  type VenueCalendar,
  type VenueSchedule,
} from '@jordan-sports/contracts';
import type { FastifyRequest } from 'fastify';
import type { Actor } from '../../../platform/auth/actor.js';
import { CurrentActor, UserAuth } from '../../../platform/auth/decorators.js';
import { requestMeta } from '../../../platform/http/request-context.js';
import { parseInput } from '../../../platform/http/validation.js';
import { ManageScheduleService, type StaffActor } from '../application/manage-schedule.service.js';

const staff = (actor: Actor, request: FastifyRequest): StaffActor => ({
  userId: actor.userId,
  meta: requestMeta(request),
});

/** Venue staff scheduling (/manage). Authorization happens per venue inside the service. */
@Controller()
@UserAuth()
export class ManageScheduleController {
  constructor(private readonly schedule: ManageScheduleService) {}

  @Get(listManagedVenues.path)
  list(@CurrentActor() actor: Actor): Promise<EndpointOutput<typeof listManagedVenues>> {
    return this.schedule.listVenues(actor.userId);
  }

  @Get(getVenueSchedule.path)
  get(@Param() params: unknown, @CurrentActor() actor: Actor): Promise<VenueSchedule> {
    const { venueId } = parseInput(getVenueSchedule.params, params);
    return this.schedule.schedule(actor.userId, venueId);
  }

  @Put(setWeeklyHours.path)
  setHours(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ): Promise<VenueSchedule> {
    const { resourceId } = parseInput(setWeeklyHours.params, params);
    const { windows } = parseInput(setWeeklyHours.body, body);
    return this.schedule.setWeeklyHours(staff(actor, request), resourceId, windows);
  }

  @Put(setBookingPolicy.path)
  setPolicy(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ): Promise<VenueSchedule> {
    const { resourceId } = parseInput(setBookingPolicy.params, params);
    const policy = parseInput(setBookingPolicy.body, body);
    return this.schedule.setPolicy(staff(actor, request), resourceId, policy);
  }

  @Patch(updateScheduleSettings.path)
  settings(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ): Promise<VenueSchedule> {
    const { venueId } = parseInput(updateScheduleSettings.params, params);
    const input = parseInput(updateScheduleSettings.body, body);
    return this.schedule.updateSettings(
      staff(actor, request),
      venueId,
      input.closedOnPublicHolidays,
    );
  }

  @Post(createOverride.path)
  createOverride(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ): Promise<VenueSchedule> {
    const { venueId } = parseInput(createOverride.params, params);
    const input = parseInput(createOverride.body, body);
    return this.schedule.createOverride(staff(actor, request), venueId, {
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      kind: input.kind,
      windows: input.windows,
      ...(input.resourceId !== undefined ? { resourceId: input.resourceId } : {}),
      ...(input.note ? { note: input.note } : {}),
    });
  }

  @Delete(deleteOverride.path)
  deleteOverride(
    @Param() params: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ): Promise<VenueSchedule> {
    const { overrideId } = parseInput(deleteOverride.params, params);
    return this.schedule.deleteOverride(staff(actor, request), overrideId);
  }

  @Get(getVenueCalendar.path)
  calendar(
    @Param() params: unknown,
    @Query() query: unknown,
    @CurrentActor() actor: Actor,
  ): Promise<VenueCalendar> {
    const { venueId } = parseInput(getVenueCalendar.params, params);
    const { date } = parseInput(getVenueCalendar.query, query);
    return this.schedule.calendar(actor.userId, venueId, date);
  }

  @Post(createBlock.path)
  createBlock(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ) {
    const { venueId } = parseInput(createBlock.params, params);
    const input = parseInput(createBlock.body, body);
    return this.schedule.createBlock(staff(actor, request), venueId, {
      resourceId: input.resourceId,
      date: input.date,
      startTime: input.startTime,
      durationMinutes: input.durationMinutes,
      reason: input.reason,
      ...(input.note ? { note: input.note } : {}),
    });
  }

  @Delete(cancelBlock.path)
  @HttpCode(200)
  async cancelBlock(
    @Param() params: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ): Promise<{ ok: true }> {
    const { blockId } = parseInput(cancelBlock.params, params);
    await this.schedule.cancelBlock(staff(actor, request), blockId);
    return { ok: true };
  }
}
