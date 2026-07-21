require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());
const uploadsRoot = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
app.use('/uploads', express.static(uploadsRoot));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/students', require('./routes/students'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/live-classes', require('./routes/liveclasses'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/brokers', require('./routes/brokers'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/activity', require('./routes/activity'));
app.use('/api/membership', require('./routes/membership'));
app.use('/api/enrollments', require('./routes/enrollments'));
app.use('/api/payment-methods', require('./routes/paymentMethods'));
app.use('/api/signals', require('./routes/signals'));
app.use('/api/resources', require('./routes/resources'));
app.use('/api/certificates', require('./routes/certificates'));
app.use('/api/market-quotes', require('./routes/marketQuotes'));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Serve the static frontend (index.html, login.html, dashboards, css/, js/) from
// server/public so the whole site deploys as a single Node service — this folder
// is inside the Railway build root (/server), unlike the old repo-root location.
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Forex Money Machine API listening on http://localhost:${PORT}`));

require('./marketData').startPolling();
