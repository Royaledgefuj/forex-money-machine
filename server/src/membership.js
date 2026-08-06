const TIERS = {
  Free: { rank: 0, price: 0 },
  // Launch offer: $10/month (normally $25) through end of day Dec 31, 2026.
  Community: { rank: 1, price: 10, originalPrice: 25, offerValidUntil: '2026-12-31T23:59:59' },
};

function tierRank(tier) {
  return TIERS[tier] ? TIERS[tier].rank : 0;
}

// Resolves the price a member actually pays right now — the discounted
// offer price while it's active, falling back to the original price once
// offerValidUntil has passed.
function currentPrice(tier) {
  const t = TIERS[tier];
  if (!t) return 0;
  if (t.offerValidUntil && Date.now() > new Date(t.offerValidUntil).getTime()) {
    return t.originalPrice != null ? t.originalPrice : t.price;
  }
  return t.price;
}

// Flagship one-time/hourly offerings. The Trading Course charge amount
// actually comes from each Course record's own `price` field (admins keep
// it in sync with the offer per batch); VIP Coaching has no automated
// billing at all — these entries exist purely as the source of truth for
// the advertised offer price and its expiry, shown to admins/students.
const COURSE_OFFER = { price: 150, originalPrice: 250, offerValidUntil: '2026-12-31T23:59:59' };
const VIP_OFFER = { price: 100, originalPrice: 150, offerValidUntil: '2026-12-31T23:59:59' };

function offerPrice(offer) {
  if (offer.offerValidUntil && Date.now() > new Date(offer.offerValidUntil).getTime()) {
    return offer.originalPrice != null ? offer.originalPrice : offer.price;
  }
  return offer.price;
}

module.exports = { TIERS, tierRank, currentPrice, COURSE_OFFER, VIP_OFFER, offerPrice };
