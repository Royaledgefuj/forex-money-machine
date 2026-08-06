// One-time setup script — creates the Community Membership Product + recurring
// Price in TEST mode using the local STRIPE_SECRET_KEY (sk_test_...). Run once,
// then put the printed price ID into STRIPE_MEMBERSHIP_PRICE_ID in .env.
require('dotenv').config();
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function main() {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
    throw new Error('STRIPE_SECRET_KEY must be a test-mode key (sk_test_...) to run this script safely.');
  }

  const product = await stripe.products.create({
    name: 'Community Membership',
    description: 'Forex Money Machine Academy — $10/month Community Membership: trading signals, indicators & tools, live classes and course access.',
  });
  console.log('Created product:', product.id, '(livemode:', product.livemode, ')');

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: 1000, // $10.00
    currency: 'usd',
    recurring: { interval: 'month' },
  });
  console.log('Created price:', price.id, '(livemode:', price.livemode, ')');
  console.log('\nAdd this to your .env:');
  console.log(`STRIPE_MEMBERSHIP_PRICE_ID=${price.id}`);
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
