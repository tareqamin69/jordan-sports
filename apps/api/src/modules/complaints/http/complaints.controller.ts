import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import {
  adminGetComplaint,
  adminListComplaints,
  adminReplyToComplaint,
  adminUpdateComplaint,
  listMyComplaints,
  replyToMyComplaint,
  reportProblem,
  reportVenueProblem,
} from '@jordan-sports/contracts';
import type { FastifyRequest } from 'fastify';
import type { Actor } from '../../../platform/auth/actor.js';
import { AdminAuth, CurrentActor, UserAuth } from '../../../platform/auth/decorators.js';
import { Errors } from '../../../platform/http/errors.js';
import { requestMeta } from '../../../platform/http/request-context.js';
import { parseInput } from '../../../platform/http/validation.js';
import { ComplaintsService } from '../application/complaints.service.js';

const caller = (actor: Actor, request: FastifyRequest) => ({
  userId: actor.userId,
  meta: requestMeta(request),
});

@Controller()
@UserAuth()
export class MyComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Post(reportProblem.path)
  report(@Body() body: unknown, @CurrentActor() actor: Actor, @Req() request: FastifyRequest) {
    const input = parseInput(reportProblem.body, body);
    return this.complaints.reportAsPlayer(caller(actor, request), input);
  }

  @Get(listMyComplaints.path)
  async list(@CurrentActor() actor: Actor) {
    return { items: await this.complaints.listMine(actor.userId) };
  }

  @Post(replyToMyComplaint.path)
  reply(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ) {
    const { complaintId } = parseInput(replyToMyComplaint.params, params);
    const input = parseInput(replyToMyComplaint.body, body);
    return this.complaints.replyAsReporter(caller(actor, request), complaintId, input.body);
  }

  @Post(reportVenueProblem.path)
  reportForVenue(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ) {
    const { venueId } = parseInput(reportVenueProblem.params, params);
    const input = parseInput(reportVenueProblem.body, body);
    // The guard resolved the venue's organization and checked `complaints.create` there.
    if (!request.tenant) throw Errors.forbidden();
    return this.complaints.reportAsVenue(
      caller(actor, request),
      { venueId, organizationId: request.tenant.organizationId },
      input,
    );
  }
}

@Controller()
@AdminAuth()
export class AdminComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Get(adminListComplaints.path)
  list(@Query() query: unknown, @CurrentActor() actor: Actor) {
    return this.complaints.adminList(actor.userId, parseInput(adminListComplaints.query, query));
  }

  @Get(adminGetComplaint.path)
  get(@Param() params: unknown) {
    return this.complaints.adminGet(parseInput(adminGetComplaint.params, params).complaintId);
  }

  @Patch(adminUpdateComplaint.path)
  update(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ) {
    const { complaintId } = parseInput(adminUpdateComplaint.params, params);
    return this.complaints.adminUpdate(
      caller(actor, request),
      complaintId,
      parseInput(adminUpdateComplaint.body, body),
    );
  }

  @Post(adminReplyToComplaint.path)
  reply(
    @Param() params: unknown,
    @Body() body: unknown,
    @CurrentActor() actor: Actor,
    @Req() request: FastifyRequest,
  ) {
    const { complaintId } = parseInput(adminReplyToComplaint.params, params);
    return this.complaints.adminReply(
      caller(actor, request),
      complaintId,
      parseInput(adminReplyToComplaint.body, body),
    );
  }
}
