const express = require('express');
const prisma = require('../prisma');
const { requireAuth } = require('../middleware/auth');
const { stripe, isStripeConfigured } = require('../stripeClient');
const { enrollUserInCurrentBatch } = require('../enrollment');
const { logActivity } = require('../activity');
const { notifyAdmin } = require('../email');

const router = express.Router();
const SITE_URL = 'https://www.vrcommercesolutions.com';

async function getOrCreateStripeCustomer(user) {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe.customers.create({ email: user.email, name: user.name, metadata: { userId: String(user.id) } });
  await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

// This router is mounted before the global express.json() (the webhook route
// below needs the raw body for signature verification), so routes that want
// a parsed JSON body — like this one — need their own express.json() here.
// Community Membership only, for now — course and VIP checkout come next.
router.post('/create-checkout-session', express.json(), requireAuth, async (req, res) => {
  try {
    if (!isStripeConfigured()) return res.status(503).json({ error: 'Payments are not configured yet' });
    if (!process.env.STRIPE_MEMBERSHIP_PRICE_ID) return res.status(503).json({ error: 'Membership price is not configured yet' });

    const { kind } = req.body;
    if (kind !== 'membership') return res.status(400).json({ error: 'Unsupported checkout kind' });

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.stripeSubscriptionId) {
      const existing = await stripe.subscriptions.retrieve(user.stripeSubscriptionId).catch(() => null);
      if (existing && existing.status === 'active') return res.status(409).json({ error: 'You already have an active membership' });
    }

    const customerId = await getOrCreateStripeCustomer(user);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: process.env.STRIPE_MEMBERSHIP_PRICE_ID, quantity: 1 }],
      success_url: `${SITE_URL}/dashboard-student.html?stripe=success&panel=membership`,
      cancel_url: `${SITE_URL}/dashboard-student.html?stripe=cancelled&panel=membership`,
      metadata: { userId: String(user.id), kind: 'membership' },
      subscription_data: { metadata: { userId: String(user.id), kind: 'membership' } },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[stripe] create-checkout-session failed:', err.message);
    res.status(500).json({ error: 'Could not start checkout — please try again' });
  }
});

// Raw body required for signature verification — mounted before express.json()
// in index.js so the body reaches here unparsed.
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!isStripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('[stripe webhook] Received an event but Stripe/webhook secret is not configured');
    return res.status(503).send('Webhook not configured');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[stripe webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode === 'subscription' && session.subscription) {
          const userId = Number(session.metadata && session.metadata.userId);
          if (userId) {
            await prisma.user.update({ where: { id: userId }, data: { stripeSubscriptionId: session.subscription } });
          }
        }
        break;
      }

      // The canonical "payment actually succeeded" event for subscriptions —
      // fires on the first invoice and every renewal. Extends membership by
      // 30 days from the invoice's own period end (Stripe already tracks the
      // billing cycle, so we don't have to reconstruct/guess it here).
      case 'invoice.paid': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
          const userId = Number(subscription.metadata && subscription.metadata.userId);
          if (userId) {
            const periodEnd = new Date(subscription.current_period_end * 1000);
            const user = await prisma.user.update({
              where: { id: userId },
              data: {
                membershipTier: 'Community',
                membershipExpiresAt: periodEnd,
                lastMembershipReminderAt: null,
                stripeSubscriptionId: subscription.id,
              },
            });
            await prisma.payment.create({
              data: {
                userId,
                student: user.name,
                course: 'Community Membership',
                method: 'Stripe',
                amount: `$${(invoice.amount_paid / 100).toFixed(2)}`,
                status: 'Paid',
                reference: invoice.id,
              },
            });
            await enrollUserInCurrentBatch(userId, 'membership');
            await logActivity(`${user.name}'s Community Membership renewed via Stripe (through ${periodEnd.toLocaleDateString()})`);
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
          const userId = Number(subscription.metadata && subscription.metadata.userId);
          if (userId) {
            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (user) {
              notifyAdmin('Stripe membership payment failed', `<p><strong>${user.name}</strong> (${user.email})'s Community Membership payment failed.</p>`);
              await logActivity(`${user.name}'s Community Membership payment failed via Stripe`);
            }
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const userId = Number(subscription.metadata && subscription.metadata.userId);
        if (userId) {
          const user = await prisma.user.update({ where: { id: userId }, data: { membershipTier: 'Free', stripeSubscriptionId: null } });
          await logActivity(`${user.name}'s Community Membership ended (Stripe subscription cancelled)`);
        }
        break;
      }

      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error(`[stripe webhook] Handler failed for ${event.type}:`, err.message);
    // Still 200 — Stripe retries on non-2xx, and retrying a handler bug just
    // repeats the same failure. Logged above for manual follow-up instead.
    res.json({ received: true, handlerError: true });
  }
});

module.exports = router;
