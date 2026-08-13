const express = require('express');
const prisma = require('../prisma');
const { requireAuth } = require('../middleware/auth');
const { stripe, isStripeConfigured } = require('../stripeClient');
const { enrollUserInCurrentBatch, enrollUserInCourse } = require('../enrollment');
const { logActivity } = require('../activity');
const { notifyAdmin } = require('../email');
const { notifyAdminTelegram } = require('../telegram');
const { VIP_OFFER, offerPrice } = require('../membership');

const router = express.Router();
const SITE_URL = 'https://www.vrcommercesolutions.com';
const COURSE_INSTALLMENT_SETUP_CENTS = 7500; // $75
const COURSE_INSTALLMENT_MONTHLY_CENTS = 1000; // $10/mo

async function getOrCreateStripeCustomer(user) {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe.customers.create({ email: user.email, name: user.name, metadata: { userId: String(user.id) } });
  await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

function parsePriceToCents(priceString) {
  const n = Number(String(priceString).replace(/[^0-9.]/g, ''));
  return Math.round((Number.isFinite(n) ? n : 0) * 100);
}

// This router is mounted before the global express.json() (the webhook route
// below needs the raw body for signature verification), so routes that want
// a parsed JSON body — like this one — need their own express.json() here.
router.post('/create-checkout-session', express.json(), requireAuth, async (req, res) => {
  try {
    if (!isStripeConfigured()) return res.status(503).json({ error: 'Payments are not configured yet' });

    const { kind } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const customerId = await getOrCreateStripeCustomer(user);

    if (kind === 'membership') {
      if (!process.env.STRIPE_MEMBERSHIP_PRICE_ID) return res.status(503).json({ error: 'Membership price is not configured yet' });

      if (user.stripeSubscriptionId) {
        const existing = await stripe.subscriptions.retrieve(user.stripeSubscriptionId).catch(() => null);
        if (existing && existing.status === 'active') return res.status(409).json({ error: 'You already have an active membership' });
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: process.env.STRIPE_MEMBERSHIP_PRICE_ID, quantity: 1 }],
        success_url: `${SITE_URL}/dashboard-student.html?stripe=success&panel=membership`,
        cancel_url: `${SITE_URL}/dashboard-student.html?stripe=cancelled&panel=membership`,
        metadata: { userId: String(user.id), kind: 'membership' },
        subscription_data: { metadata: { userId: String(user.id), kind: 'membership' } },
      });
      return res.json({ url: session.url });
    }

    if (kind === 'course') {
      const { courseId, plan } = req.body;
      if (!courseId || !['full', 'installment'].includes(plan)) {
        return res.status(400).json({ error: 'courseId and a valid plan (full or installment) are required' });
      }
      const course = await prisma.course.findUnique({ where: { id: Number(courseId) } });
      if (!course || course.status !== 'Published') return res.status(404).json({ error: 'Course not found' });

      const existingAccess = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId: user.id, courseId: course.id } } });
      if (existingAccess) return res.status(409).json({ error: 'You already have access to this course' });

      if (plan === 'full') {
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          customer: customerId,
          line_items: [{
            price_data: { currency: 'usd', product_data: { name: course.name }, unit_amount: parsePriceToCents(course.price) },
            quantity: 1,
          }],
          success_url: `${SITE_URL}/dashboard-student.html?stripe=success&panel=courses`,
          cancel_url: `${SITE_URL}/dashboard-student.html?stripe=cancelled&panel=courses`,
          metadata: { userId: String(user.id), kind: 'course', courseId: String(course.id) },
        });
        return res.json({ url: session.url });
      }

      // Installment: a one-time setup fee plus an ongoing monthly price, both
      // as inline price_data — Checkout bills the one-time line only once,
      // on the subscription's first invoice.
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        line_items: [
          { price_data: { currency: 'usd', product_data: { name: `${course.name} — Setup Fee` }, unit_amount: COURSE_INSTALLMENT_SETUP_CENTS }, quantity: 1 },
          { price_data: { currency: 'usd', product_data: { name: `${course.name} — Ongoing Support` }, unit_amount: COURSE_INSTALLMENT_MONTHLY_CENTS, recurring: { interval: 'month' } }, quantity: 1 },
        ],
        success_url: `${SITE_URL}/dashboard-student.html?stripe=success&panel=courses`,
        cancel_url: `${SITE_URL}/dashboard-student.html?stripe=cancelled&panel=courses`,
        metadata: { userId: String(user.id), kind: 'course-installment', courseId: String(course.id) },
        subscription_data: { metadata: { userId: String(user.id), kind: 'course-installment', courseId: String(course.id) } },
      });
      return res.json({ url: session.url });
    }

    if (kind === 'vip') {
      const { requestedAt, notes } = req.body;
      if (!requestedAt) return res.status(400).json({ error: 'A requested date/time is required' });
      const when = new Date(requestedAt);
      if (Number.isNaN(when.getTime())) return res.status(400).json({ error: 'Invalid date/time' });
      if (when.getTime() < Date.now()) return res.status(400).json({ error: 'Please pick a time in the future' });

      const existingPending = await prisma.vipBooking.findFirst({ where: { userId: user.id, status: 'Pending' } });
      if (existingPending) return res.status(409).json({ error: 'You already have a pending booking request' });

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer: customerId,
        line_items: [{
          price_data: { currency: 'usd', product_data: { name: 'VIP Coaching Session' }, unit_amount: Math.round(offerPrice(VIP_OFFER) * 100) },
          quantity: 1,
        }],
        success_url: `${SITE_URL}/dashboard-student.html?stripe=success&panel=membership`,
        cancel_url: `${SITE_URL}/dashboard-student.html?stripe=cancelled&panel=membership`,
        // Booking details ride along as metadata — the VipBooking row itself
        // is only created once payment actually succeeds (see webhook below),
        // so there's never an unpaid "Pending" booking sitting in the DB.
        metadata: { userId: String(user.id), kind: 'vip', requestedAt: when.toISOString(), notes: String(notes || '').slice(0, 450) },
      });
      return res.json({ url: session.url });
    }

    return res.status(400).json({ error: 'Unsupported checkout kind' });
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
        const userId = Number(session.metadata && session.metadata.userId);
        const kind = session.metadata && session.metadata.kind;

        if (session.mode === 'subscription') {
          // Newer Stripe API versions moved this off the top-level field for
          // invoices (see invoice.paid below) — falling back defensively here
          // too in case Checkout Session follows the same pattern.
          const sessionSubscriptionId = session.subscription
            || (session.parent && session.parent.subscription_details && session.parent.subscription_details.subscription);
          if (userId && sessionSubscriptionId) {
            await prisma.user.update({ where: { id: userId }, data: { stripeSubscriptionId: sessionSubscriptionId } });
          }
        } else if (session.mode === 'payment' && session.payment_status === 'paid' && userId) {
          // Idempotency: Stripe can redeliver this event, and we don't want a
          // duplicate enrollment/booking + Payment row from a retry.
          const already = await prisma.payment.findFirst({ where: { reference: session.id } });
          if (!already) {
            if (kind === 'course') {
              const courseId = Number(session.metadata.courseId);
              const [user, course] = await Promise.all([
                prisma.user.findUnique({ where: { id: userId } }),
                prisma.course.findUnique({ where: { id: courseId } }),
              ]);
              if (user && course) {
                await enrollUserInCourse(userId, courseId, 'purchase');
                await prisma.payment.create({
                  data: {
                    userId, student: user.name, course: course.name, courseId,
                    method: 'Stripe', amount: `$${(session.amount_total / 100).toFixed(2)}`, status: 'Paid', reference: session.id,
                  },
                });
                await logActivity(`${user.name} enrolled in "${course.name}" via Stripe`);
              }
            } else if (kind === 'vip') {
              const user = await prisma.user.findUnique({ where: { id: userId } });
              if (user) {
                const requestedAt = new Date(session.metadata.requestedAt);
                const notes = session.metadata.notes || null;
                await prisma.vipBooking.create({ data: { userId, requestedAt, notes, status: 'Pending' } });
                await prisma.payment.create({
                  data: {
                    userId, student: user.name, course: 'VIP Coaching',
                    method: 'Stripe', amount: `$${(session.amount_total / 100).toFixed(2)}`, status: 'Paid', reference: session.id,
                  },
                });
                const whenLabel = requestedAt.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                await logActivity(`${user.name} paid for a VIP coaching session (${whenLabel}) via Stripe`);
                notifyAdmin(
                  'New paid VIP coaching booking',
                  `<p><strong>${user.name}</strong> (${user.email}) paid for and requested a VIP coaching session for <strong>${whenLabel}</strong>.</p>
                   ${notes ? `<p>Notes: ${notes}</p>` : ''}
                   <p>Review and confirm in the admin dashboard's VIP Bookings tab.</p>`,
                );
                notifyAdminTelegram(`📅💰 Paid VIP coaching booking\n${user.name} (${user.email})\nRequested: ${whenLabel}${notes ? `\nNotes: ${notes}` : ''}`);
              }
            }
          }
        }
        break;
      }

      // The canonical "payment actually succeeded" event for subscriptions —
      // fires on the first invoice and every renewal. Branches on the kind
      // metadata to handle both Community Membership and course installments.
      case 'invoice.paid': {
        const invoice = event.data.object;
        // As of API version 2025-10-29 ("basil"), invoice.subscription was
        // removed in favor of invoice.parent.subscription_details.subscription
        // — confirmed directly against this account's actual event payload.
        const subscriptionId = invoice.parent && invoice.parent.subscription_details && invoice.parent.subscription_details.subscription;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const userId = Number(subscription.metadata && subscription.metadata.userId);
          const kind = subscription.metadata && subscription.metadata.kind;

          if (userId && kind === 'membership') {
            // Flexible billing mode (the new default) moved current_period_end
            // from the subscription itself to its first item — also confirmed
            // directly against this account. Fall back to the classic
            // top-level field in case an existing subscription predates this.
            const periodEndSeconds = subscription.current_period_end
              || (subscription.items.data[0] && subscription.items.data[0].current_period_end);
            const periodEnd = new Date(periodEndSeconds * 1000);
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
          } else if (userId && kind === 'course-installment') {
            const courseId = Number(subscription.metadata.courseId);
            const already = await prisma.payment.findFirst({ where: { reference: invoice.id } });
            if (!already) {
              const [user, course] = await Promise.all([
                prisma.user.findUnique({ where: { id: userId } }),
                prisma.course.findUnique({ where: { id: courseId } }),
              ]);
              if (user && course) {
                // Idempotent — safe to call again on every monthly renewal,
                // just confirms access rather than re-granting it.
                await enrollUserInCourse(userId, courseId, 'purchase');
                await prisma.payment.create({
                  data: {
                    userId, student: user.name, course: `${course.name} (Installment)`, courseId,
                    method: 'Stripe', amount: `$${(invoice.amount_paid / 100).toFixed(2)}`, status: 'Paid', reference: invoice.id,
                  },
                });
                await logActivity(`${user.name}'s installment payment for "${course.name}" succeeded via Stripe ($${(invoice.amount_paid / 100).toFixed(2)})`);
              }
            }
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subscriptionId = invoice.parent && invoice.parent.subscription_details && invoice.parent.subscription_details.subscription;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const userId = Number(subscription.metadata && subscription.metadata.userId);
          const kind = subscription.metadata && subscription.metadata.kind;
          if (userId) {
            const user = await prisma.user.findUnique({ where: { id: userId } });
            if (user) {
              const label = kind === 'course-installment' ? 'course installment' : 'Community Membership';
              notifyAdmin(`Stripe ${label} payment failed`, `<p><strong>${user.name}</strong> (${user.email})'s ${label} payment failed.</p>`);
              await logActivity(`${user.name}'s ${label} payment failed via Stripe`);
            }
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const userId = Number(subscription.metadata && subscription.metadata.userId);
        const kind = subscription.metadata && subscription.metadata.kind;
        if (userId && kind === 'membership') {
          const user = await prisma.user.update({ where: { id: userId }, data: { membershipTier: 'Free', stripeSubscriptionId: null } });
          await logActivity(`${user.name}'s Community Membership ended (Stripe subscription cancelled)`);
        }
        // course-installment cancellations aren't handled here — access already
        // granted stays granted; there's no "revoke course access" concept yet.
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
