const TIERS = {
  Free: { rank: 0, price: 0 },
  Silver: { rank: 1, price: 150 },
  Gold: { rank: 2, price: 250 },
  Platinum: { rank: 3, price: 350 },
};

function tierRank(tier) {
  return TIERS[tier] ? TIERS[tier].rank : 0;
}

module.exports = { TIERS, tierRank };
