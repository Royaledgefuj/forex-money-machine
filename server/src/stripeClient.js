const Stripe = require('stripe');

// No client is created if the key is missing, so routes can check for this
// and fail with a clear error rather than crashing at require-time.
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

function isStripeConfigured() {
  return !!stripe;
}

module.exports = { stripe, isStripeConfigured };
