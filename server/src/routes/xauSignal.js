const express = require('express');
const { generateSignal } = require('../signalEngine');

const router = express.Router();

// Public: real-time, rule-based XAU/USD read. No auth gate — this endpoint
// computes fresh indicators on every call rather than serving stored/fake data.
router.get('/xauusd/live', async (req, res) => {
  try {
    const signal = await generateSignal('XAU/USD');
    res.json({ symbol: 'XAUUSD', ...signal });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

module.exports = router;
