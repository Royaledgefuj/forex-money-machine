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

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Serve the static frontend (index.html, login.html, dashboards, css/, js/) so the
// whole site deploys as a single Node service. In local dev this folder is normally
// served separately by devserver.py on :5173, but serving it here too is harmless.
app.use(express.static(path.join(__dirname, '..', '..')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Forex Money Machine API listening on http://localhost:${PORT}`));
