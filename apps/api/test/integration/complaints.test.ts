import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bookableVenue,
  call,
  createTestApp,
  randomPhone,
  signInAdmin,
  signInPlayer,
  type TestApp,
} from '../support/app.js';

/** Problem reports and the team's queue (docs/rbac-plan.md §7.4). */
describe('complaints', () => {
  let t: TestApp;
  const staff: Record<string, { cookie: string; userId: string }> = {};
  let venue: Awaited<ReturnType<typeof bookableVenue>>;
  let player: { cookie: string; userId: string };
  let bookingId = '';

  beforeAll(async () => {
    t = await createTestApp({ RATE_LIMIT_SCALE: '50' });
    for (const role of ['owner', 'admin', 'support', 'finance'] as const) {
      staff[role] = await signInAdmin(t.app, role);
    }
    venue = await bookableVenue(t.app, staff.admin!.cookie);
    player = await signInPlayer(t.app);
    const date = DateTime.now().setZone('Asia/Amman').plus({ days: 1 }).toISODate();
    const slot = (
      (
        await call(t.app, {
          method: 'GET',
          url: `/v1/venues/${venue.slug}/availability?date=${date}`,
        })
      ).json() as {
        resources: Array<{ slots: Array<{ start: string }> }>;
      }
    ).resources[0]!.slots[0]!;
    const held = await call(t.app, {
      method: 'POST',
      url: '/v1/bookings',
      cookie: player.cookie,
      headers: { 'idempotency-key': randomUUID() },
      body: { resourceId: venue.resourceId, start: slot.start, durationMinutes: 60 },
    });
    bookingId = (held.json() as { id: string }).id;
  });
  afterAll(async () => {
    await t?.close();
  });

  const post = (cookie: string, url: string, body: unknown) =>
    call(t.app, { method: 'POST', url, cookie, body });

  it('players report about their own bookings only', async () => {
    const r = await post(player.cookie, '/v1/me/complaints', {
      category: 'booking',
      body: 'The court lights were off when we arrived.',
      bookingId,
    });
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json()).toMatchObject({
      status: 'new',
      reporterKind: 'player',
      venue: { id: venue.venueId },
    });
    expect((r.json() as { reference: string }).reference).toMatch(/^C-[A-Z0-9]{6}$/);

    const other = await signInPlayer(t.app);
    const foreign = await post(other.cookie, '/v1/me/complaints', {
      category: 'booking',
      body: 'Not my booking at all.',
      bookingId,
    });
    expect(foreign.statusCode).toBe(404);
    const mine = (
      await call(t.app, { method: 'GET', url: '/v1/me/complaints', cookie: other.cookie })
    ).json() as {
      items: unknown[];
    };
    expect(mine.items).toHaveLength(0);
  });

  it('venue owners and managers report for their venue; others cannot', async () => {
    const ok = await post(venue.ownerCookie, `/v1/manage/venues/${venue.venueId}/complaints`, {
      category: 'player_behaviour',
      body: 'A player keeps booking and not showing up.',
    });
    expect(ok.statusCode, ok.body).toBe(201);
    expect(ok.json()).toMatchObject({ reporterKind: 'venue' });
    const outsider = await signInPlayer(t.app, { phone: randomPhone() });
    const denied = await post(outsider.cookie, `/v1/manage/venues/${venue.venueId}/complaints`, {
      category: 'other',
      body: 'Trying to report for someone else.',
    });
    expect(denied.statusCode).toBe(404);
  });

  it('the team works the queue: assign, reply, internal notes, resolve', async () => {
    const created = (
      await post(player.cookie, '/v1/me/complaints', {
        category: 'venue',
        body: 'Changing rooms were locked.',
        venueId: venue.venueId,
      })
    ).json() as { id: string };
    const url = `/v1/admin/complaints/${created.id}`;

    // Finance can read the queue but not handle it.
    const list = await call(t.app, {
      method: 'GET',
      url: '/v1/admin/complaints?status=new',
      cookie: staff.finance!.cookie,
    });
    expect(list.statusCode).toBe(200);
    expect((list.json() as { items: Array<{ id: string }> }).items.map((i) => i.id)).toContain(
      created.id,
    );
    expect(
      (
        await call(t.app, {
          method: 'PATCH',
          url,
          cookie: staff.finance!.cookie,
          body: { status: 'resolved' },
        })
      ).statusCode,
    ).toBe(403);

    // Only team members who handle complaints can be assigned.
    const toFinance = await call(t.app, {
      method: 'PATCH',
      url,
      cookie: staff.admin!.cookie,
      body: { assigneeId: staff.finance!.userId },
    });
    expect(toFinance.statusCode).toBe(400);

    const reply = await post(staff.support!.cookie, `${url}/messages`, {
      body: 'Sorry! We are calling the venue now.',
    });
    expect(reply.statusCode, reply.body).toBe(201);
    expect(reply.json()).toMatchObject({
      status: 'in_progress',
      assignee: { id: staff.support!.userId },
    });
    await post(staff.support!.cookie, `${url}/messages`, {
      body: 'Venue owner seems unreachable.',
      internal: true,
    });

    const assigned = await call(t.app, {
      method: 'GET',
      url: '/v1/admin/complaints?assignee=me',
      cookie: staff.support!.cookie,
    });
    expect((assigned.json() as { items: Array<{ id: string }> }).items.map((i) => i.id)).toContain(
      created.id,
    );

    // The player sees the reply, not the internal note or the staff member's name.
    const mine = (
      await call(t.app, { method: 'GET', url: '/v1/me/complaints', cookie: player.cookie })
    ).json() as {
      items: Array<{
        id: string;
        messages: Array<{ body: string; authorName: string | null; authorKind: string }>;
      }>;
    };
    const seen = mine.items.find((i) => i.id === created.id)!;
    expect(seen.messages.map((m) => m.body)).toEqual(['Sorry! We are calling the venue now.']);
    expect(seen.messages[0]!.authorName).toBeNull();

    const resolved = await call(t.app, {
      method: 'PATCH',
      url,
      cookie: staff.support!.cookie,
      body: { status: 'resolved' },
    });
    expect(resolved.json()).toMatchObject({ status: 'resolved' });
    // The player answering reopens it.
    const again = await post(player.cookie, `/v1/me/complaints/${created.id}/messages`, {
      body: 'Still locked today.',
    });
    expect(again.json()).toMatchObject({ status: 'in_progress' });

    const audit = await t.ownerPool.query(
      "SELECT details FROM audit.audit_logs WHERE action = 'complaint.updated' AND target_id = $1",
      [created.id],
    );
    expect(audit.rows[0].details).toMatchObject({
      before: { status: 'in_progress' },
      after: { status: 'resolved' },
    });
  });
});
