// One-time setup — creates the LIVE webhook pointing at production, and
// prints the webhook ID to add as PAYPAL_WEBHOOK_ID (needed to verify
// incoming webhook signatures). Mirrors setup-paypal-webhook.js exactly
// except for the guard — kept separate so the sandbox script can never
// accidentally run against live, or vice versa.
require('dotenv').config();
const { paypalRequest, PAYPAL_MODE } = require('../src/paypalClient');

const SITE_URL = 'https://www.vrcommercesolutions.com';

async function main() {
  if (PAYPAL_MODE !== 'live') {
    throw new Error('PAYPAL_MODE must be "live" to run this script.');
  }

  const webhook = await paypalRequest('POST', '/v1/notifications/webhooks', {
    url: `${SITE_URL}/api/paypal/webhook`,
    event_types: [
      { name: 'PAYMENT.CAPTURE.COMPLETED' },
      { name: 'PAYMENT.CAPTURE.DENIED' },
      { name: 'BILLING.SUBSCRIPTION.ACTIVATED' },
      { name: 'PAYMENT.SALE.COMPLETED' },
      { name: 'BILLING.SUBSCRIPTION.CANCELLED' },
      { name: 'BILLING.SUBSCRIPTION.SUSPENDED' },
      { name: 'BILLING.SUBSCRIPTION.EXPIRED' },
      { name: 'BILLING.SUBSCRIPTION.PAYMENT.FAILED' },
    ],
  });

  console.log('Created webhook:', webhook.id);
  console.log('\nAdd this to Railway:');
  console.log(`PAYPAL_WEBHOOK_ID=${webhook.id}`);
}

main().catch((err) => {
  console.error('Failed:', err.message, err.paypalResponse ? JSON.stringify(err.paypalResponse) : '');
  process.exit(1);
});
