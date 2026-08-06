// One-time setup — creates the TEST-mode webhook endpoint pointing at
// production, and prints the signing secret to add as STRIPE_WEBHOOK_SECRET.
require('dotenv').config();
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const SITE_URL = 'https://www.vrcommercesolutions.com';

async function main() {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
    throw new Error('STRIPE_SECRET_KEY must be a test-mode key (sk_test_...) to run this script safely.');
  }

  const endpoint = await stripe.webhookEndpoints.create({
    url: `${SITE_URL}/api/stripe/webhook`,
    enabled_events: [
      'checkout.session.completed',
      'invoice.paid',
      'invoice.payment_failed',
      'customer.subscription.deleted',
    ],
    description: 'Forex Money Machine Academy — membership/course/VIP payment fulfillment',
  });

  console.log('Created webhook endpoint:', endpoint.id, '(livemode:', endpoint.livemode, ')');
  console.log('\nAdd this to your .env AND to Railway once deployed:');
  console.log(`STRIPE_WEBHOOK_SECRET=${endpoint.secret}`);
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
