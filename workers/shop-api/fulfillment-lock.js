import { DurableObject } from 'cloudflare:workers';
import { createGelatoDraftFromVerifiedSession } from './gelato-draft.js';

const PROCESSING_TTL_MS = 2 * 60 * 1000;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'no-store',
    },
  });

export class FulfillmentLock extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    let input;
    try {
      input = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const session = input?.session;
    const requestUrl = String(input?.requestUrl || 'https://aupositeur-shop-api.invalid/stripe/webhook');
    const eventId = String(input?.eventId || '');

    if (!session || session.object !== 'checkout.session' || !String(session.id || '').startsWith('cs_test_')) {
      return json({ error: 'Invalid Stripe Checkout Session' }, 400);
    }

    const now = Date.now();
    const current = (await this.ctx.storage.get('fulfillment')) || null;

    if (current?.state === 'completed') {
      return json({
        ok: true,
        atomicDuplicatePrevented: true,
        draftCreated: false,
        duplicatePrevented: true,
        gelato: current.gelato || null,
        completedAt: current.completedAt || null,
        completedByEventId: current.eventId || null,
      });
    }

    if (
      current?.state === 'processing' &&
      Number.isFinite(current.startedAt) &&
      now - current.startedAt < PROCESSING_TTL_MS
    ) {
      return json(
        {
          ok: false,
          retryable: true,
          atomicLockBusy: true,
          error: 'Fulfillment for this Checkout Session is already in progress',
          startedAt: current.startedAt,
          eventId: current.eventId || null,
        },
        503,
      );
    }

    await this.ctx.storage.put('fulfillment', {
      state: 'processing',
      startedAt: now,
      eventId: eventId || null,
      checkoutSessionId: session.id,
    });

    try {
      const gelatoDraft = await createGelatoDraftFromVerifiedSession(
        new Request(requestUrl, { method: 'POST' }),
        this.env,
        session,
      );

      if (!gelatoDraft?.ok) {
        await this.ctx.storage.delete('fulfillment');
        return json(
          {
            ok: false,
            retryable: true,
            error: 'Gelato draft creation did not complete',
            gelatoDraft,
          },
          gelatoDraft?.status || 502,
        );
      }

      const completed = {
        state: 'completed',
        completedAt: Date.now(),
        eventId: eventId || null,
        checkoutSessionId: session.id,
        gelato: gelatoDraft?.gelato || gelatoDraft?.existingOrders || null,
      };
      await this.ctx.storage.put('fulfillment', completed);

      return json({
        ...gelatoDraft,
        atomicDuplicatePrevented: false,
        atomicLockUsed: true,
      });
    } catch (error) {
      await this.ctx.storage.delete('fulfillment');
      return json(
        {
          ok: false,
          retryable: true,
          error: error instanceof Error ? error.message : 'Gelato draft creation failed',
        },
        502,
      );
    }
  }
}
