const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');

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

// ── API: Instagram video recipe extraction ────────────────────────────────────
// Downloads the Instagram video server-side via yt-dlp, uploads to Gemini File
// API with the user's key, extracts the recipe, then deletes everything.
app.post('/api/instagram-video', async (req, res) => {
  const { url, apiKey } = req.body || {};
  if (!url || !apiKey) return res.status(400).json({ error: 'Missing url or apiKey' });
  if (!/instagram\.com/i.test(url)) return res.status(400).json({ error: 'Not an Instagram URL' });

  const prefix = `ig_${Date.now()}_`;
  const tmpDir = os.tmpdir();
  const outputTemplate = path.join(tmpDir, `${prefix}%(id)s.%(ext)s`);
  let tmpFilePath = null;
  let geminiFileName = null;

  try {
    // 1. Download video with yt-dlp
    await new Promise((resolve, reject) => {
      execFile('yt-dlp', [
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

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
