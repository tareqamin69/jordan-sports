import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OutboxDispatcher } from '../../src/modules/notifications/index.js';
import { call, createTestApp, signInAdmin, signInPlayer, type TestApp } from '../support/app.js';

/** A venue sent for review is hidden and the platform owner hears about it at once. */
describe('venue review notifications', () => {
  let t: TestApp;
  let owner: string;

  beforeAll(async () => {
    t = await createTestApp();
    owner = (await signInAdmin(t.app, 'owner')).cookie;
    await call(t.app, {
      method: 'PATCH',
      url: '/v1/admin/settings',
      cookie: owner,
      body: { supportEmail: 'review@jorena.test', supportWhatsapp: '0791112223' },
    });
  });
  afterAll(async () => {
    await t?.close();
  });

  it('emails and texts the review link when an owner submits a venue', async () => {
    const catalog = (await call(t.app, { method: 'GET', url: '/v1/catalog' })).json() as {
      governorates: Array<{ id: string; key: string }>;
    };
    const venueOwner = await signInPlayer(t.app, { name: 'Sami' });
    const created = await call(t.app, {
      method: 'POST',
      url: '/v1/manage/venues',
      cookie: venueOwner.cookie,
      body: {
        name: { ar: 'ملعب المراجعة' },
        governorateId: catalog.governorates.find((g) => g.key === 'amman')!.id,
        contactPhone: '0795556667',
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const venue = created.json() as { id: string; slug: string };
    const submitted = await call(t.app, {
      method: 'POST',
      url: `/v1/manage/venues/${venue.id}/submit`,
      cookie: venueOwner.cookie,
    });
    expect(submitted.statusCode, submitted.body).toBe(201);

    // Hidden from players until approved; first in the admin review queue.
    expect((await call(t.app, { method: 'GET', url: `/v1/venues/${venue.slug}` })).statusCode).toBe(
      404,
    );
    const queue = await call(t.app, {
      method: 'GET',
      url: '/v1/admin/venues?status=submitted',
      cookie: owner,
    });
    expect((queue.json() as { items: Array<{ id: string }> }).items.map((v) => v.id)).toContain(
      venue.id,
    );

    const dispatcher = t.app.get(OutboxDispatcher);
    while ((await dispatcher.dispatchOnce()) > 0) {
      // drain
    }
    const sent = await t.ownerPool.query<{
      channel: string;
      recipient: string;
      template: string;
      body: string;
    }>(
      `SELECT d.channel, d.recipient, d.template, d.body FROM notification.deliveries d
         JOIN platform.outbox_events e ON e.id = d.event_id
        WHERE e.type = 'venue.submitted' AND e.payload->>'venueId' = $1`,
      [venue.id],
    );
    const email = sent.rows.find((r) => r.recipient === 'review@jorena.test');
    expect(email).toMatchObject({ channel: 'email', template: 'venueSubmittedEmail' });
    expect(email!.body).toContain(`/ar/venues/${venue.id}`);
    expect(email!.body).toContain('https://wa.me/962');
    const text = sent.rows.find((r) => r.recipient === '+962791112223');
    expect(text?.template).toBe('venueSubmittedText');
    expect(text!.body).toContain(`/ar/venues/${venue.id}`);
  });
});
