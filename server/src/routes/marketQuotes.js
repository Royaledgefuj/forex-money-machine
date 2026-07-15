const express = require('express');
const { getQuotes } = require('../marketData');

const router = express.Router();

// Public — the homepage ticker is visible to logged-out visitors too.
router.get('/', (req, res) => res.json(getQuotes()));

module.exports = router;
