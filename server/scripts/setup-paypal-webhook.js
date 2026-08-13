// One-time setup — creates the SANDBOX webhook pointing at production, and
// prints the webhook ID to add as PAYPAL_WEBHOOK_ID (needed to verify
// incoming webhook signatures).
require('dotenv').config();
const { paypalRequest, PAYPAL_MODE } = require('../src/paypalClient');

const SITE_URL = 'https://www.vrcommercesolutions.com';

async function main() {
  if (PAYPAL_MODE !== 'sandbox') {
    throw new Error('PAYPAL_MODE must be "sandbox" to run this script safely.');
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
  console.log('\nAdd this to your .env AND to Railway once deployed:');
  console.log(`PAYPAL_WEBHOOK_ID=${webhook.id}`);
}

main().catch((err) => {
  console.error('Failed:', err.message, err.paypalResponse ? JSON.stringify(err.paypalResponse) : '');
  process.exit(1);
});
