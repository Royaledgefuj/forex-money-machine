const TIERS = {
  Free: { rank: 0, price: 0 },
  Community: { rank: 1, price: 10 },
};

function tierRank(tier) {
  return TIERS[tier] ? TIERS[tier].rank : 0;
}

module.exports = { TIERS, tierRank };
