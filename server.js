require('dotenv').config({ quiet: true });

const path = require('path');
const express = require('express');
const multer = require('multer');
const archiver = require('archiver');

const { createSession, mapLimit } = require('./src/luraph');
const { profile } = require('./src/settings');

const app = express();
const PORT = process.env.PORT || 3000;

const MAX_FILES = 100; // files accepted in a single batch
const MAX_FILE_MB = 5; // per-file size cap
const CONCURRENCY = 3; // Luraph jobs kept in flight at once

// Keep uploads in memory — we only forward them to Luraph, never to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: MAX_FILES },
});
const acceptFiles = upload.array('files');

app.use(express.static(path.join(__dirname, 'public')));

// Expose the active profile + limits so the UI can show what will happen.
app.get('/api/settings', (req, res) => {
  res.json({ profile, maxFiles: MAX_FILES, hasApiKey: Boolean(process.env.LPH_API_KEY) });
});

// Accept up to MAX_FILES files, obfuscate each with the fixed profile, zip them.
app.post('/api/obfuscate', (req, res) => {
  acceptFiles(req, res, async (uploadErr) => {
    if (uploadErr) {
      const message =
        uploadErr.code === 'LIMIT_FILE_COUNT'
          ? `Too many files — up to ${MAX_FILES} per batch.`
          : uploadErr.code === 'LIMIT_FILE_SIZE'
            ? `A file exceeds the ${MAX_FILE_MB} MB per-file limit.`
            : uploadErr.message;
      return res.status(400).json({ error: message });
    }

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

    // Obfuscate every file, CONCURRENCY at a time. One slow/failed file never
    // blocks the others — failures are captured, not thrown.
    const results = await mapLimit(files, CONCURRENCY, async (file) => {
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
});

app.listen(PORT, () => {
  console.log(`Luraph obfuscator running on http://localhost:${PORT}`);
});
