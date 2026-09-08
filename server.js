require('dotenv').config({ quiet: true });

const path = require('path');
const express = require('express');
const multer = require('multer');
const archiver = require('archiver');

const { createSession, mapLimit, getRecommendedNode } = require('./src/luraph');
const { isZip, processZip } = require('./src/resource');
const { profile } = require('./src/settings');

const app = express();
const PORT = process.env.PORT || 3000;

const MAX_FILES = 100; // files accepted in a single batch
const MAX_FILE_MB = 50; // per-file size cap (resource .zips can be large)
const CONCURRENCY = 3; // Luraph jobs kept in flight at once

// Keep uploads in memory — we only forward them to Luraph, never to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: MAX_FILES },
});
const acceptFiles = upload.array('files');

app.use(express.static(path.join(__dirname, 'public')));

// Basic limits + key presence for the UI.
app.get('/api/settings', (req, res) => {
  res.json({ maxFiles: MAX_FILES, hasApiKey: Boolean(process.env.LPH_API_KEY) });
});

// Default value for an option: the static profile if it names this option,
// otherwise a sensible fallback (unchecked / first choice).
function optionDefault(info) {
  const key = Object.keys(profile).find((k) => k.trim().toLowerCase() === info.name.trim().toLowerCase());
  if (key !== undefined) {
    const value = profile[key];
    if (info.type === 'CHECKBOX') return Boolean(value);
    if (info.type === 'DROPDOWN') {
      const choice = (info.choices || []).find((c) => String(c).toLowerCase() === String(value).toLowerCase());
      return choice || (info.choices || [])[0] || '';
    }
    return value;
  }
  if (info.type === 'CHECKBOX') return false;
  if (info.type === 'DROPDOWN') return (info.choices || [])[0] || '';
  return '';
}

// The live option schema for the recommended node, so the UI can render real
// controls pre-filled with the default profile. Falls back to the static
// profile if the node can't be reached (e.g. no API key).
app.get('/api/options', async (req, res) => {
  try {
    const { id, node } = await getRecommendedNode();
    const options = Object.entries(node.options).map(([oid, info]) => ({
      id: oid,
      name: info.name,
      type: info.type,
      choices: info.choices || null,
      required: Boolean(info.required),
      tier: info.tier || null,
      description: info.description || '',
      value: optionDefault(info),
    }));
    res.json({ live: true, node: id, options });
  } catch (err) {
    const options = Object.entries(profile).map(([name, value]) => ({
      id: null,
      name,
      type: typeof value === 'boolean' ? 'CHECKBOX' : 'DROPDOWN',
      choices: typeof value === 'boolean' ? null : [String(value)],
      required: false,
      tier: null,
      description: '',
      value,
    }));
    res.json({ live: false, node: null, options, error: err.message });
  }
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

    // Use the settings chosen in the UI if sent, otherwise the default profile.
    let chosen = profile;
    if (req.body && typeof req.body.settings === 'string') {
      try {
        const parsed = JSON.parse(req.body.settings);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) chosen = parsed;
      } catch {
        /* keep defaults */
      }
    }

    // Resolve the node + options once, then reuse them for the whole batch.
    let session;
    try {
      session = await createSession(chosen);
    } catch (err) {
      return res.status(err.statusCode || 502).json({ error: err.message });
    }

    // Obfuscate every file, CONCURRENCY at a time. One slow/failed file never
    // blocks the others — failures are captured, not thrown.
    const results = await mapLimit(files, CONCURRENCY, async (file) => {
      // A resource .zip: obfuscate every eligible .lua inside, keep the folder
      // structure and pass assets/manifests through untouched.
      if (isZip(file.buffer, file.originalname)) {
        try {
          const { buffer, stats } = await processZip(file.buffer, CONCURRENCY, (content, name) =>
            session.run(content, name),
          );
          const name = `${file.originalname.replace(/\.zip$/i, '')}-obfuscated.zip`;
          return { input: file.originalname, name, zip: buffer, stats, ok: true };
        } catch (err) {
          return { input: file.originalname, ok: false, error: err.message };
        }
      }

      // A plain Lua file: obfuscate it directly.
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

    for (const r of succeeded) archive.append(r.zip || r.data, { name: r.name });

    const report = {
      profile: chosen,
      node: session.nodeId,
      optionWarnings: session.warnings,
      total: results.length,
      succeeded: succeeded.length,
      failed: failed.map((r) => ({ file: r.input, error: r.error })),
      archives: succeeded.filter((r) => r.stats).map((r) => ({ file: r.input, ...r.stats })),
    };
    archive.append(JSON.stringify(report, null, 2), { name: '_report.json' });

    await archive.finalize();
  });
});

app.listen(PORT, () => {
  console.log(`Luraph obfuscator running on http://localhost:${PORT}`);
});
