const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ── PostgreSQL ──────────────────────────────────────────────────────────────
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : null;

async function initDB() {
  if (!pool) {
    console.log('No DATABASE_URL — running without cloud sync (local only)');
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_data (
      code        TEXT PRIMARY KEY,
      data        JSONB NOT NULL,
      updated_at  TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('Database ready.');
}
initDB().catch(err => console.error('DB init error:', err.message));

// ── API: Version ─────────────────────────────────────────────────────────────
// Bump this string on every deploy — clients compare against APP_VERSION in JS
app.get('/api/version', (req, res) => {
  res.json({ version: '1.6' });
});

// ── API: Sync — fetch user data ───────────────────────────────────────────────
app.get('/api/sync/:code', async (req, res) => {
  if (!pool) return res.json({ data: null });
  try {
    const result = await pool.query(
      'SELECT data FROM user_data WHERE code = $1',
      [req.params.code]
    );
    res.json({ data: result.rows[0]?.data || null });
  } catch (e) {
    console.error('Sync GET error:', e.message);
    res.status(500).json({ error: 'db error' });
  }
});

// ── API: Sync — save user data ────────────────────────────────────────────────
app.post('/api/sync/:code', async (req, res) => {
  if (!pool) return res.json({ ok: true });
  const { data } = req.body;
  if (!data) return res.status(400).json({ error: 'no data' });
  try {
    await pool.query(
      `INSERT INTO user_data (code, data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (code)
       DO UPDATE SET data = $2, updated_at = NOW()`,
      [req.params.code, data]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('Sync POST error:', e.message);
    res.status(500).json({ error: 'db error' });
  }
});

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
