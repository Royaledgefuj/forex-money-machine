// One-time setup script — creates the Trading Course Installment Product +
// Billing Plan ($75 setup fee + $10/month ongoing) in PayPal SANDBOX. Run
// once, then put the printed plan ID into PAYPAL_COURSE_INSTALLMENT_PLAN_ID.
require('dotenv').config();
const { paypalRequest, PAYPAL_MODE } = require('../src/paypalClient');

async function main() {
  if (PAYPAL_MODE !== 'sandbox') {
    throw new Error('PAYPAL_MODE must be "sandbox" to run this script safely.');
  }

  const product = await paypalRequest('POST', '/v1/catalogs/products', {
    name: 'Trading Course — Installment Plan',
    description: 'Forex Money Machine Academy — Trading Course installment plan: $75 setup fee, then $10/month ongoing support access.',
    type: 'SERVICE',
    category: 'EDUCATIONAL_AND_TEXTBOOKS',
  });
  console.log('Created product:', product.id);

  const plan = await paypalRequest('POST', '/v1/billing/plans', {
    product_id: product.id,
    name: 'Trading Course Installment',
    description: '$75 setup fee, then $10/month billed automatically.',
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
      setup_fee: { value: '75.00', currency_code: 'USD' },
      setup_fee_failure_action: 'CONTINUE',
      payment_failure_threshold: 3,
    },
  });
  console.log('Created billing plan:', plan.id);
  console.log('\nAdd this to your .env:');
  console.log(`PAYPAL_COURSE_INSTALLMENT_PLAN_ID=${plan.id}`);
}

main().catch((err) => {
  console.error('Failed:', err.message, err.paypalResponse ? JSON.stringify(err.paypalResponse) : '');
  process.exit(1);
});
