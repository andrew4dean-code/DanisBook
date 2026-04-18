const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

// Lightweight .env loader — avoids a dotenv dependency. Populates
// process.env from a sibling .env file if present. Hosting platforms
// that inject env vars natively (Render, Fly, etc.) are unaffected.
(function loadDotEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch (e) { /* non-fatal */ }
})();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
if (!GEMINI_API_KEY) console.warn('GEMINI_API_KEY not set — scan endpoints will return 503.');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS thumbnails (
      id          TEXT PRIMARY KEY,
      data        TEXT NOT NULL,
      mime_type   TEXT NOT NULL DEFAULT 'image/jpeg',
      created_at  TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('Database ready.');
}
initDB().catch(err => console.error('DB init error:', err.message));

// ── API: Version ─────────────────────────────────────────────────────────────
// Bump this string on every deploy — clients compare against APP_VERSION in JS
app.get('/api/version', (req, res) => {
  res.json({ version: '1.7' });
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

// ── API: Thumbnails — upload ──────────────────────────────────────────────────
app.post('/api/thumbnail', async (req, res) => {
  const { data, mimeType } = req.body || {};
  if (!data || !data.startsWith('data:')) return res.status(400).json({ error: 'Missing or invalid image data' });
  if (!pool) return res.status(503).json({ error: 'No database configured' });
  const id = crypto.randomUUID();
  const mime = mimeType || 'image/jpeg';
  try {
    await pool.query(
      'INSERT INTO thumbnails (id, data, mime_type) VALUES ($1, $2, $3)',
      [id, data, mime]
    );
    res.json({ id, url: `/api/thumbnail/${id}` });
  } catch (e) {
    console.error('Thumbnail upload error:', e.message);
    res.status(500).json({ error: 'db error' });
  }
});

// ── API: Thumbnails — serve ───────────────────────────────────────────────────
app.get('/api/thumbnail/:id', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'No database configured' });
  try {
    const result = await pool.query('SELECT data, mime_type FROM thumbnails WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    const { data, mime_type } = result.rows[0];
    // data is a data URL like "data:image/jpeg;base64,..."
    const base64 = data.replace(/^data:[^;]+;base64,/, '');
    const buf = Buffer.from(base64, 'base64');
    res.setHeader('Content-Type', mime_type);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(buf);
  } catch (e) {
    console.error('Thumbnail fetch error:', e.message);
    res.status(500).json({ error: 'db error' });
  }
});

// ── Gemini helpers ────────────────────────────────────────────────────────────
const GEMINI_BASE = 'https://generativelanguage.googleapis.com';

async function geminiGenerate({ contents, tools, models }) {
  const tryModels = Array.isArray(models) && models.length ? models : ['gemini-2.5-flash', 'gemini-2.0-flash'];
  let lastErr = null;
  for (const model of tryModels) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const resp = await fetch(`${GEMINI_BASE}/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, ...(tools ? { tools } : {}) })
      });
      if (resp.status === 429) {
        if (attempt === 0) { await new Promise(r => setTimeout(r, 6000)); continue; }
        lastErr = new Error('rate_limited'); break;
      }
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        const msg = e.error?.message || `Gemini error (${resp.status})`;
        lastErr = new Error(msg);
        if (resp.status === 403 || resp.status === 400) throw lastErr;
        break;
      }
      const data = await resp.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return { text };
    }
  }
  throw lastErr || new Error('All models failed.');
}

// Proxy: generateContent. Server holds the key.
app.post('/api/gemini/generate', async (req, res) => {
  if (!GEMINI_API_KEY) return res.status(503).json({ error: 'Server not configured.' });
  const { contents, tools, models } = req.body || {};
  if (!contents) return res.status(400).json({ error: 'Missing contents.' });
  try {
    const { text } = await geminiGenerate({ contents, tools, models });
    res.json({ text });
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});

// Proxy: upload raw video/file to Gemini File API and wait for ACTIVE.
// Body is the raw file bytes. Client sets Content-Type to the real mime.
app.post('/api/gemini/upload-file',
  express.raw({ type: ['video/*', 'image/*', 'application/octet-stream'], limit: '200mb' }),
  async (req, res) => {
    if (!GEMINI_API_KEY) return res.status(503).json({ error: 'Server not configured.' });
    const mimeType = req.headers['content-type'] || 'application/octet-stream';
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: 'Empty body.' });

    let geminiFileName = null;
    try {
      const separator = `boundary_${Date.now()}`;
      const metaJson = JSON.stringify({ file: { display_name: `upload_${Date.now()}` } });
      const body = Buffer.concat([
        Buffer.from(`--${separator}\r\nContent-Type: application/json\r\n\r\n${metaJson}\r\n`, 'utf8'),
        Buffer.from(`--${separator}\r\nContent-Type: ${mimeType}\r\n\r\n`, 'utf8'),
        buf,
        Buffer.from(`\r\n--${separator}--`, 'utf8')
      ]);
      const up = await fetch(`${GEMINI_BASE}/upload/v1beta/files?uploadType=multipart&key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${separator}`, 'X-Goog-Upload-Protocol': 'multipart' },
        body
      });
      if (!up.ok) {
        const e = await up.json().catch(() => ({}));
        throw new Error(e.error?.message || `Upload failed (${up.status})`);
      }
      const uj = await up.json();
      geminiFileName = uj.file?.name;
      const fileUri = uj.file?.uri;
      if (!geminiFileName || !fileUri) throw new Error('Upload response missing file info.');

      // Poll until ACTIVE
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const pr = await fetch(`${GEMINI_BASE}/v1beta/${geminiFileName}?key=${GEMINI_API_KEY}`);
        if (!pr.ok) break;
        const pd = await pr.json();
        if (pd.state === 'ACTIVE') return res.json({ fileName: geminiFileName, fileUri, mimeType });
        if (pd.state === 'FAILED') throw new Error('Gemini processing failed.');
      }
      throw new Error('Gemini processing timed out.');
    } catch (err) {
      if (geminiFileName) {
        fetch(`${GEMINI_BASE}/v1beta/${geminiFileName}?key=${GEMINI_API_KEY}`, { method: 'DELETE' }).catch(() => {});
      }
      res.status(422).json({ error: err.message });
    }
  }
);

// Proxy: delete an uploaded Gemini file.
app.delete('/api/gemini/file', async (req, res) => {
  if (!GEMINI_API_KEY) return res.status(503).json({ error: 'Server not configured.' });
  const name = (req.query.name || '').toString();
  if (!name.startsWith('files/')) return res.status(400).json({ error: 'Bad file name.' });
  try {
    await fetch(`${GEMINI_BASE}/v1beta/${name}?key=${GEMINI_API_KEY}`, { method: 'DELETE' });
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false });
  }
});

// ── API: Instagram video recipe extraction ────────────────────────────────────
// Downloads the Instagram video server-side via yt-dlp, uploads to Gemini File
// API with the server's key, extracts the recipe, then deletes everything.
app.post('/api/instagram-video', async (req, res) => {
  if (!GEMINI_API_KEY) return res.status(503).json({ error: 'Server not configured.' });
  const apiKey = GEMINI_API_KEY;
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Missing url' });
  if (!/instagram\.com/i.test(url)) return res.status(400).json({ error: 'Not an Instagram URL' });

  const prefix = `ig_${Date.now()}_`;
  const tmpDir = os.tmpdir();
  const outputTemplate = path.join(tmpDir, `${prefix}%(id)s.%(ext)s`);
  let tmpFilePath = null;
  let geminiFileName = null;

  try {
    // 1. Download video with yt-dlp (local binary from postinstall, or system)
    const ytdlp = fs.existsSync(path.join(__dirname, 'yt-dlp'))
      ? path.join(__dirname, 'yt-dlp')
      : 'yt-dlp';
    await new Promise((resolve, reject) => {
      execFile(ytdlp, [
        '-o', outputTemplate,
        '--no-playlist',
        '--max-filesize', '200m',
        '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4',
        url
      ], { timeout: 60000 }, (err) => {
        if (err) return reject(new Error('Could not download this video. The post may be private or unavailable.'));
        resolve();
      });
    });

    // Find the downloaded file
    const files = fs.readdirSync(tmpDir).filter(f => f.startsWith(prefix));
    if (!files.length) throw new Error('Download produced no output file.');
    tmpFilePath = path.join(tmpDir, files[0]);
    const mimeType = files[0].endsWith('.webm') ? 'video/webm' : 'video/mp4';
    const fileBuffer = fs.readFileSync(tmpFilePath);

    // Delete local file immediately — no longer needed
    fs.unlinkSync(tmpFilePath);
    tmpFilePath = null;

    // 2. Upload to Gemini File API
    const separator = `boundary_${Date.now()}`;
    const metaJson = JSON.stringify({ file: { display_name: files[0] } });
    const body = Buffer.concat([
      Buffer.from(`--${separator}\r\nContent-Type: application/json\r\n\r\n${metaJson}\r\n`, 'utf8'),
      Buffer.from(`--${separator}\r\nContent-Type: ${mimeType}\r\n\r\n`, 'utf8'),
      fileBuffer,
      Buffer.from(`\r\n--${separator}--`, 'utf8')
    ]);

    const uploadResp = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=multipart&key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/related; boundary=${separator}`,
          'X-Goog-Upload-Protocol': 'multipart'
        },
        body
      }
    );
    if (!uploadResp.ok) {
      const err = await uploadResp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gemini upload failed (${uploadResp.status})`);
    }
    const uploadData = await uploadResp.json();
    geminiFileName = uploadData.file?.name;
    const fileUri = uploadData.file?.uri;
    if (!geminiFileName || !fileUri) throw new Error('Gemini upload response missing file info.');

    // 3. Poll until ACTIVE (Gemini processes the video)
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const pollResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${geminiFileName}?key=${apiKey}`
      );
      if (!pollResp.ok) break;
      const pollData = await pollResp.json();
      if (pollData.state === 'ACTIVE') break;
      if (pollData.state === 'FAILED') throw new Error('Gemini video processing failed.');
    }

    // 4. Extract recipe from video
    const recipePrompt = `Watch this cooking video and extract the complete recipe. Look for ingredient names and measurements shown on screen or spoken aloud, step-by-step instructions, cook times, serving sizes, and the dish name. Return ONLY valid JSON (no markdown, no code fences) with exactly these fields:
{
  "name": "recipe name",
  "category": "one of: Breakfast, Lunch, Dinner, Dessert, Snack",
  "time": "cook time like 30 min",
  "servings": "number of servings like 4",
  "ingredients": ["ingredient 1 with measurement", "ingredient 2"],
  "instructions": ["step 1", "step 2"],
  "notes": "any tips or notes, or empty string"
}`;

    const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
    let genData;
    for (const model of models) {
      const genResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [
              { file_data: { mime_type: mimeType, file_uri: fileUri } },
              { text: recipePrompt }
            ]}]
          })
        }
      );
      if (genResp.status === 429) { await new Promise(r => setTimeout(r, 5000)); continue; }
      if (!genResp.ok) {
        const e = await genResp.json().catch(() => ({}));
        throw new Error(e.error?.message || `Generation failed (${genResp.status})`);
      }
      genData = await genResp.json();
      break;
    }

    // 5. Delete from Gemini — fire and forget
    fetch(`https://generativelanguage.googleapis.com/v1beta/${geminiFileName}?key=${apiKey}`, { method: 'DELETE' }).catch(() => {});
    geminiFileName = null;

    if (!genData) throw new Error('All models rate limited. Try again in a moment.');
    const text = genData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) throw new Error('No recipe found in this video.');

    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    let recipe;
    try { recipe = JSON.parse(cleaned); } catch (_) { throw new Error('No recipe found in this video.'); }
    if (!recipe?.name && !recipe?.ingredients?.length) throw new Error('No recipe found in this video.');

    res.json({ recipe });

  } catch (err) {
    // Cleanup on error
    if (tmpFilePath) { try { fs.unlinkSync(tmpFilePath); } catch (_) {} }
    if (geminiFileName) {
      fetch(`https://generativelanguage.googleapis.com/v1beta/${geminiFileName}?key=${apiKey}`, { method: 'DELETE' }).catch(() => {});
    }
    res.status(422).json({ error: err.message });
  }
});

// ── SPA fallback — no-cache so browsers always fetch fresh HTML ───────────────
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
