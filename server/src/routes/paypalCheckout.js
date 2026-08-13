const express = require('express');
const prisma = require('../prisma');
const { requireAuth } = require('../middleware/auth');
const { paypalRequest, isPaypalConfigured } = require('../paypalClient');
const { enrollUserInCurrentBatch, enrollUserInCourse } = require('../enrollment');
const { logActivity } = require('../activity');
const { notifyAdmin } = require('../email');
const { notifyAdminTelegram } = require('../telegram');
const { VIP_OFFER, offerPrice } = require('../membership');

const router = express.Router();
const SITE_URL = 'https://www.vrcommercesolutions.com';

function parsePriceToDollars(priceString) {
  const n = Number(String(priceString).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function subscriberName(name) {
  const parts = String(name).trim().split(/\s+/);
  return { given_name: parts[0] || name, surname: parts.slice(1).join(' ') || parts[0] || name };
}

// Fulfillment is driven entirely by the webhook (see PAYMENT.CAPTURE.COMPLETED
// below) — same pattern as the old Stripe integration, where the return_url
// only shows a message and the actual DB grant comes from the async webhook.
// This avoids a race between the return-URL redirect and the webhook trying
// to fulfill the same order at the same time.
router.post('/create-checkout', requireAuth, async (req, res) => {
  try {
    if (!isPaypalConfigured()) return res.status(503).json({ error: 'Payments are not configured yet' });

    const { kind } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (kind === 'membership') {
      if (!process.env.PAYPAL_MEMBERSHIP_PLAN_ID) return res.status(503).json({ error: 'Membership plan is not configured yet' });

      if (user.paypalSubscriptionId) {
        const existing = await paypalRequest('GET', `/v1/billing/subscriptions/${user.paypalSubscriptionId}`).catch(() => null);
        if (existing && existing.status === 'ACTIVE') return res.status(409).json({ error: 'You already have an active membership' });
      }

      const subscription = await paypalRequest('POST', '/v1/billing/subscriptions', {
        plan_id: process.env.PAYPAL_MEMBERSHIP_PLAN_ID,
        custom_id: JSON.stringify({ userId: user.id, kind: 'membership' }),
        subscriber: { name: subscriberName(user.name), email_address: user.email },
        application_context: {
          brand_name: 'Forex Money Machine Academy',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'SUBSCRIBE_NOW',
          return_url: `${SITE_URL}/dashboard-student.html?paypal=success&panel=membership`,
          cancel_url: `${SITE_URL}/dashboard-student.html?paypal=cancelled&panel=membership`,
        },
      });
      const approve = subscription.links.find((l) => l.rel === 'approve');
      return res.json({ url: approve.href });
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
        // Orders v2 requires explicit capture (unlike Stripe), so the details
        // needed to fulfill this after payment ride in a PendingCheckout row
        // rather than directly on the order — PayPal's custom_id field caps
        // at 127 chars.
        const pending = await prisma.pendingCheckout.create({ data: { userId: user.id, kind: 'course', courseId: course.id } });
        const order = await paypalRequest('POST', '/v2/checkout/orders', {
          intent: 'CAPTURE',
          purchase_units: [{
            custom_id: String(pending.id),
            description: course.name.slice(0, 127),
            amount: { currency_code: 'USD', value: parsePriceToDollars(course.price).toFixed(2) },
          }],
          application_context: {
            brand_name: 'Forex Money Machine Academy',
            shipping_preference: 'NO_SHIPPING',
            user_action: 'PAY_NOW',
            return_url: `${SITE_URL}/api/paypal/capture-order?panel=courses`,
            cancel_url: `${SITE_URL}/dashboard-student.html?paypal=cancelled&panel=courses`,
          },
        });
        const approve = order.links.find((l) => l.rel === 'approve');
        return res.json({ url: approve.href });
      }

      if (!process.env.PAYPAL_COURSE_INSTALLMENT_PLAN_ID) return res.status(503).json({ error: 'Installment plan is not configured yet' });
      const subscription = await paypalRequest('POST', '/v1/billing/subscriptions', {
        plan_id: process.env.PAYPAL_COURSE_INSTALLMENT_PLAN_ID,
        custom_id: JSON.stringify({ userId: user.id, kind: 'course-installment', courseId: course.id }),
        subscriber: { name: subscriberName(user.name), email_address: user.email },
        application_context: {
          brand_name: 'Forex Money Machine Academy',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'SUBSCRIBE_NOW',
          return_url: `${SITE_URL}/dashboard-student.html?paypal=success&panel=courses`,
          cancel_url: `${SITE_URL}/dashboard-student.html?paypal=cancelled&panel=courses`,
        },
      });
      const approve = subscription.links.find((l) => l.rel === 'approve');
      return res.json({ url: approve.href });
    }

    if (kind === 'vip') {
      const { requestedAt, notes } = req.body;
      if (!requestedAt) return res.status(400).json({ error: 'A requested date/time is required' });
      const when = new Date(requestedAt);
      if (Number.isNaN(when.getTime())) return res.status(400).json({ error: 'Invalid date/time' });
      if (when.getTime() < Date.now()) return res.status(400).json({ error: 'Please pick a time in the future' });

      const existingPending = await prisma.vipBooking.findFirst({ where: { userId: user.id, status: 'Pending' } });
      if (existingPending) return res.status(409).json({ error: 'You already have a pending booking request' });

      // As with course purchases, the VipBooking row itself is only created
      // once payment actually succeeds (see webhook below) — no unpaid
      // "Pending" booking is ever created client-side.
      const pending = await prisma.pendingCheckout.create({
        data: { userId: user.id, kind: 'vip', requestedAt: when, notes: String(notes || '').slice(0, 1000) },
      });
      const order = await paypalRequest('POST', '/v2/checkout/orders', {
        intent: 'CAPTURE',
        purchase_units: [{
          custom_id: String(pending.id),
          description: 'VIP Coaching Session',
          amount: { currency_code: 'USD', value: offerPrice(VIP_OFFER).toFixed(2) },
        }],
        application_context: {
          brand_name: 'Forex Money Machine Academy',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'PAY_NOW',
          return_url: `${SITE_URL}/api/paypal/capture-order?panel=membership`,
          cancel_url: `${SITE_URL}/dashboard-student.html?paypal=cancelled&panel=membership`,
        },
      });
      const approve = order.links.find((l) => l.rel === 'approve');
      return res.json({ url: approve.href });
    }

    return res.status(400).json({ error: 'Unsupported checkout kind' });
  } catch (err) {
    console.error('[paypal] create-checkout failed:', err.message, err.paypalResponse ? JSON.stringify(err.paypalResponse) : '');
    res.status(500).json({ error: 'Could not start checkout — please try again' });
  }
});

// PayPal Orders v2 never auto-captures — this is the mandatory server-side
// step that actually takes the buyer's payment after they approve in PayPal's
// UI. It only captures and redirects; the DB grant happens in the webhook
// below once PayPal confirms PAYMENT.CAPTURE.COMPLETED.
router.get('/capture-order', async (req, res) => {
  const { token } = req.query;
  const redirectPanel = req.query.panel || 'courses';
  if (!token) return res.redirect(`${SITE_URL}/dashboard-student.html?paypal=failed&panel=${redirectPanel}`);

  try {
    let order;
    try {
      order = await paypalRequest('POST', `/v2/checkout/orders/${token}/capture`, {});
    } catch (err) {
      const issue = err.paypalResponse && err.paypalResponse.details && err.paypalResponse.details[0] && err.paypalResponse.details[0].issue;
      if (issue === 'ORDER_ALREADY_CAPTURED') {
        order = await paypalRequest('GET', `/v2/checkout/orders/${token}`);
      } else {
        throw err;
      }
    }
    const unit = order.purchase_units && order.purchase_units[0];
    const capture = unit && unit.payments && unit.payments.captures && unit.payments.captures[0];
    const ok = capture && capture.status === 'COMPLETED';
    return res.redirect(`${SITE_URL}/dashboard-student.html?paypal=${ok ? 'success' : 'failed'}&panel=${redirectPanel}`);
  } catch (err) {
    console.error('[paypal] capture-order failed:', err.message, err.paypalResponse ? JSON.stringify(err.paypalResponse) : '');
    return res.redirect(`${SITE_URL}/dashboard-student.html?paypal=failed&panel=${redirectPanel}`);
  }
});

// Grants course access / creates the VipBooking once a one-time Orders v2
// payment is actually captured. Looks up the PendingCheckout row stashed at
// checkout-creation time via custom_id, then consumes (deletes) it.
async function fulfillCapture({ captureId, customId, amountValue }) {
  if (!customId) return;
  const already = await prisma.payment.findFirst({ where: { reference: captureId } });
  if (already) return;

  const pending = await prisma.pendingCheckout.findUnique({ where: { id: Number(customId) } });
  if (!pending) return;

  const user = await prisma.user.findUnique({ where: { id: pending.userId } });
  if (!user) return;
  const amount = `$${Number(amountValue).toFixed(2)}`;

  if (pending.kind === 'course') {
    const course = await prisma.course.findUnique({ where: { id: pending.courseId } });
    if (course) {
      await enrollUserInCourse(user.id, course.id, 'purchase');
      await prisma.payment.create({
        data: { userId: user.id, student: user.name, course: course.name, courseId: course.id, method: 'PayPal', amount, status: 'Paid', reference: captureId },
      });
      await logActivity(`${user.name} enrolled in "${course.name}" via PayPal`);
    }
  } else if (pending.kind === 'vip') {
    await prisma.vipBooking.create({ data: { userId: user.id, requestedAt: pending.requestedAt, notes: pending.notes, status: 'Pending' } });
    await prisma.payment.create({
      data: { userId: user.id, student: user.name, course: 'VIP Coaching', method: 'PayPal', amount, status: 'Paid', reference: captureId },
    });
    const whenLabel = pending.requestedAt.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    await logActivity(`${user.name} paid for a VIP coaching session (${whenLabel}) via PayPal`);
    notifyAdmin(
      'New paid VIP coaching booking',
      `<p><strong>${user.name}</strong> (${user.email}) paid for and requested a VIP coaching session for <strong>${whenLabel}</strong>.</p>
       ${pending.notes ? `<p>Notes: ${pending.notes}</p>` : ''}
       <p>Review and confirm in the admin dashboard's VIP Bookings tab.</p>`,
    );
    notifyAdminTelegram(`📅💰 Paid VIP coaching booking\n${user.name} (${user.email})\nRequested: ${whenLabel}${pending.notes ? `\nNotes: ${pending.notes}` : ''}`);
  }

  await prisma.pendingCheckout.delete({ where: { id: pending.id } }).catch(() => {});
}

// The canonical "a subscription payment actually succeeded" event — fires on
// the first charge and every renewal, same role as Stripe's invoice.paid.
async function handleSaleCompleted(sale) {
  const subscriptionId = sale.billing_agreement_id;
  if (!subscriptionId) return; // not tied to a subscription — nothing to do here

  const already = await prisma.payment.findFirst({ where: { reference: sale.id } });
  if (already) return;

  const subscription = await paypalRequest('GET', `/v1/billing/subscriptions/${subscriptionId}`);
  const customId = subscription.custom_id;
  if (!customId) return;
  let meta;
  try { meta = JSON.parse(customId); } catch { return; }
  const userId = Number(meta.userId);
  if (!userId) return;
  const amount = `$${Number(sale.amount.total).toFixed(2)}`;

  if (meta.kind === 'membership') {
    const nextBilling = subscription.billing_info && subscription.billing_info.next_billing_time;
    const periodEnd = nextBilling ? new Date(nextBilling) : new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
    const user = await prisma.user.update({
      where: { id: userId },
      data: { membershipTier: 'Community', membershipExpiresAt: periodEnd, lastMembershipReminderAt: null, paypalSubscriptionId: subscriptionId },
    });
    await prisma.payment.create({
      data: { userId, student: user.name, course: 'Community Membership', method: 'PayPal', amount, status: 'Paid', reference: sale.id },
    });
    await enrollUserInCurrentBatch(userId, 'membership');
    await logActivity(`${user.name}'s Community Membership renewed via PayPal (through ${periodEnd.toLocaleDateString()})`);
  } else if (meta.kind === 'course-installment') {
    const courseId = Number(meta.courseId);
    const [user, course] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.course.findUnique({ where: { id: courseId } }),
    ]);
    if (user && course) {
      // Idempotent — safe to call again on every monthly renewal, just
      // confirms access rather than re-granting it.
      await enrollUserInCourse(userId, courseId, 'purchase');
      await prisma.payment.create({
        data: { userId, student: user.name, course: `${course.name} (Installment)`, courseId, method: 'PayPal', amount, status: 'Paid', reference: sale.id },
      });
      await logActivity(`${user.name}'s installment payment for "${course.name}" succeeded via PayPal (${amount})`);
    }
  }
}

async function handleSubscriptionEnded(subscription) {
  const customId = subscription.custom_id;
  if (!customId) return;
  let meta;
  try { meta = JSON.parse(customId); } catch { return; }
  const userId = Number(meta.userId);
  if (userId && meta.kind === 'membership') {
    const user = await prisma.user.update({ where: { id: userId }, data: { membershipTier: 'Free', paypalSubscriptionId: null } });
    await logActivity(`${user.name}'s Community Membership ended (PayPal subscription ${(subscription.status || 'ended').toLowerCase()})`);
  }
  // course-installment endings aren't handled here — access already granted
  // stays granted; there's no "revoke course access" concept yet.
}

async function handlePaymentFailed(resource) {
  const customId = resource.custom_id;
  if (!customId) return;
  let meta;
  try { meta = JSON.parse(customId); } catch { return; }
  const userId = Number(meta.userId);
  if (!userId) return;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user) {
    const label = meta.kind === 'course-installment' ? 'course installment' : 'Community Membership';
    notifyAdmin(`PayPal ${label} payment failed`, `<p><strong>${user.name}</strong> (${user.email})'s ${label} payment failed.</p>`);
    await logActivity(`${user.name}'s ${label} payment failed via PayPal`);
  }
}

async function verifyWebhookSignature(req) {
  const verification = await paypalRequest('POST', '/v1/notifications/verify-webhook-signature', {
    auth_algo: req.headers['paypal-auth-algo'],
    cert_url: req.headers['paypal-cert-url'],
    transmission_id: req.headers['paypal-transmission-id'],
    transmission_sig: req.headers['paypal-transmission-sig'],
    transmission_time: req.headers['paypal-transmission-time'],
    webhook_id: process.env.PAYPAL_WEBHOOK_ID,
    webhook_event: req.body,
  });
  return verification.verification_status === 'SUCCESS';
}

// Unlike Stripe's HMAC-over-raw-bytes signature, PayPal verifies webhooks via
// an API call that takes the already-parsed JSON body — so this route is
// fine being mounted after the global express.json() in index.js.
router.post('/webhook', async (req, res) => {
  if (!isPaypalConfigured() || !process.env.PAYPAL_WEBHOOK_ID) {
    console.error('[paypal webhook] Received an event but PayPal/webhook ID is not configured');
    return res.status(503).send('Webhook not configured');
  }

  try {
    const verified = await verifyWebhookSignature(req);
    if (!verified) {
      console.error('[paypal webhook] Signature verification failed');
      return res.status(400).send('Signature verification failed');
    }
  } catch (err) {
    console.error('[paypal webhook] Signature verification error:', err.message);
    return res.status(400).send('Signature verification failed');
  }

  const event = req.body;
  try {
    switch (event.event_type) {
      case 'PAYMENT.SALE.COMPLETED':
        await handleSaleCompleted(event.resource);
        break;

      case 'PAYMENT.CAPTURE.COMPLETED':
        if (event.resource.status === 'COMPLETED') {
          await fulfillCapture({ captureId: event.resource.id, customId: event.resource.custom_id, amountValue: event.resource.amount.value });
        }
        break;

      case 'BILLING.SUBSCRIPTION.CANCELLED':
      case 'BILLING.SUBSCRIPTION.EXPIRED':
      case 'BILLING.SUBSCRIPTION.SUSPENDED':
        await handleSubscriptionEnded(event.resource);
        break;

      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
        await handlePaymentFailed(event.resource);
        break;

      default:
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error(`[paypal webhook] Handler failed for ${event.event_type}:`, err.message);
    // Still 200 — PayPal retries on non-2xx, and retrying a handler bug just
    // repeats the same failure. Logged above for manual follow-up instead.
    res.json({ received: true, handlerError: true });
  }
});

module.exports = router;
