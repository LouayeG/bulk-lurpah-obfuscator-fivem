require('dotenv').config({ quiet: true });

const path = require('path');
const express = require('express');
const multer = require('multer');
const archiver = require('archiver');

const { createSession, mapLimit } = require('./src/luraph');
const { profile } = require('./src/settings');

const app = express();
const PORT = process.env.PORT || 3000;

// Keep uploads in memory — we only forward them to Luraph, never to disk.
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static(path.join(__dirname, 'public')));

// Expose the active profile so the UI can show exactly what will be applied.
app.get('/api/settings', (req, res) => {
  res.json({ profile, hasApiKey: Boolean(process.env.LPH_API_KEY) });
});

// Accept many files, obfuscate each with the fixed profile, return a zip.
app.post('/api/obfuscate', upload.array('files'), async (req, res) => {
  const files = req.files || [];
  if (files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded.' });
  }

  // Resolve the node + options once, then reuse them for the whole batch.
  let session;
  try {
    session = await createSession(profile);
  } catch (err) {
    return res.status(err.statusCode || 502).json({ error: err.message });
  }

  // Obfuscate every file, a few at a time. One slow/failed file never blocks
  // the others — failures are captured, not thrown.
  const results = await mapLimit(files, 3, async (file) => {
    try {
      const out = await session.run(file.buffer.toString('utf8'), file.originalname);
      return { input: file.originalname, name: out.fileName || file.originalname, data: out.data, ok: true };
    } catch (err) {
      return { input: file.originalname, ok: false, error: err.message };
    }
  });

  const succeeded = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="obfuscated.zip"');
  res.setHeader('X-Obfuscated-Count', String(succeeded.length));
  res.setHeader('X-Failed-Count', String(failed.length));

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', () => res.destroy());
  archive.pipe(res);

  for (const r of succeeded) archive.append(r.data, { name: r.name });

  const report = {
    profile,
    node: session.nodeId,
    optionWarnings: session.warnings,
    total: results.length,
    succeeded: succeeded.length,
    failed: failed.map((r) => ({ file: r.input, error: r.error })),
  };
  archive.append(JSON.stringify(report, null, 2), { name: '_report.json' });

  await archive.finalize();
});

app.listen(PORT, () => {
  console.log(`Luraph obfuscator running on http://localhost:${PORT}`);
});
