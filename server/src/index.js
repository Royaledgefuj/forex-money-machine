require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// None of the ~70 async route handlers in this app wrap their Prisma calls in
// try/catch, so a rejected promise (e.g. a transient DB error) would otherwise
// be an unhandled rejection — which crashes the entire Node process and takes
// the whole site down for every user, not just the one request that failed.
// This keeps the process alive; the failing request will time out instead of
// getting a clean 500, since Express 4 doesn't auto-forward async rejections
// to error middleware. Wrapping each handler (or an asyncHandler utility) is
// the fuller fix if per-request error responses matter here.
process.on('unhandledRejection', (err) => {
  console.error('Unhandled promise rejection (request likely failed, server stayed up):', err);
});

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
app.use('/api/ai-trade', require('./routes/aitrade'));
app.use('/api/vip-bookings', require('./routes/vipBookings'));
app.use('/api/testimonials', require('./routes/testimonials'));
app.use('/api/resources', require('./routes/resources'));
app.use('/api/certificates', require('./routes/certificates'));
app.use('/api/market-quotes', require('./routes/marketQuotes'));
app.use('/api/signals', require('./routes/xauSignal'));
app.use('/api/blog', require('./routes/blog'));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Server-rendered (not static files) so each blog post and the sitemap get
// real per-page meta tags/URLs for crawlers and social previews, generated
// from the database instead of hand-edited on every new post.
app.use(require('./routes/sitemap'));
app.use('/blog', require('./routes/blogPages'));

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
