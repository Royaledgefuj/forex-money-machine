// One-time setup script — creates the Community Membership Product + monthly
// Billing Plan in PayPal SANDBOX using the local PAYPAL_CLIENT_ID/SECRET. Run
// once, then put the printed plan ID into PAYPAL_MEMBERSHIP_PLAN_ID in .env.
require('dotenv').config();
const { paypalRequest, PAYPAL_MODE } = require('../src/paypalClient');

async function main() {
  if (PAYPAL_MODE !== 'sandbox') {
    throw new Error('PAYPAL_MODE must be "sandbox" to run this script safely.');
  }

  const product = await paypalRequest('POST', '/v1/catalogs/products', {
    name: 'Community Membership',
    description: 'Forex Money Machine Academy — $10/month Community Membership: trading signals, indicators & tools, live classes and course access.',
    type: 'SERVICE',
    category: 'EDUCATIONAL_AND_TEXTBOOKS',
  });
  console.log('Created product:', product.id);

  const plan = await paypalRequest('POST', '/v1/billing/plans', {
    product_id: product.id,
    name: 'Community Membership Monthly',
    description: '$10/month, billed automatically every month.',
    status: 'ACTIVE',
    billing_cycles: [{
      frequency: { interval_unit: 'MONTH', interval_count: 1 },
      tenure_type: 'REGULAR',
      sequence: 1,
      total_cycles: 0, // 0 = bills indefinitely until cancelled
      pricing_scheme: { fixed_price: { value: '10.00', currency_code: 'USD' } },
    }],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee_failure_action: 'CONTINUE',
      payment_failure_threshold: 3,
    },
  });
  console.log('Created billing plan:', plan.id);
  console.log('\nAdd this to your .env:');
  console.log(`PAYPAL_MEMBERSHIP_PLAN_ID=${plan.id}`);
}

main().catch((err) => {
  console.error('Failed:', err.message, err.paypalResponse ? JSON.stringify(err.paypalResponse) : '');
  process.exit(1);
});
