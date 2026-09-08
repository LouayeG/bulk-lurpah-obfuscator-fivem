const AdmZip = require('adm-zip');

const { mapLimit } = require('./luraph');

// FiveM manifest files are parsed specially by the client, not run as normal
// Lua — obfuscating them breaks the resource, so we always leave them as-is.
const SKIP_BASENAMES = new Set(['fxmanifest.lua', '__resource.lua']);

// Detect a zip by extension or by the "PK" magic bytes.
function isZip(buffer, filename = '') {
  if (/\.zip$/i.test(filename)) return true;
  return Boolean(buffer) && buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

// Which entries inside a resource should be obfuscated: .lua files, except the
// FiveM manifests.
function shouldObfuscate(entryName) {
  if (!/\.lua$/i.test(entryName)) return false;
  const base = entryName.split('/').pop().toLowerCase();
  return !SKIP_BASENAMES.has(base);
}

// Rebuild a resource zip: obfuscate every eligible .lua entry, copy everything
// else through unchanged, and preserve the folder structure. If a single file
// fails to obfuscate, its original is kept so the resource still runs, and the
// failure is recorded.
async function processZip(buffer, concurrency, obfuscate) {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  const out = new AdmZip();
  const stats = { obfuscated: 0, passthrough: 0, failed: [] };

  // Copy non-Lua / manifest files straight through.
  for (const entry of entries) {
    if (!shouldObfuscate(entry.entryName)) {
      out.addFile(entry.entryName, entry.getData());
      stats.passthrough += 1;
    }
  }

  // Obfuscate the Lua files, a few at a time.
  const targets = entries.filter((entry) => shouldObfuscate(entry.entryName));
  const results = await mapLimit(targets, concurrency, async (entry) => {
    const source = entry.getData().toString('utf8');
    try {
      const res = await obfuscate(source, entry.entryName.split('/').pop());
      return { entryName: entry.entryName, data: res.data, ok: true };
    } catch (err) {
      return { entryName: entry.entryName, ok: false, error: err.message };
    }
  });

  for (const result of results) {
    if (result.ok) {
      out.addFile(result.entryName, Buffer.from(result.data, 'utf8'));
      stats.obfuscated += 1;
    } else {
      // Keep the original file so the resource stays functional.
      const original = entries.find((e) => e.entryName === result.entryName);
      if (original) out.addFile(result.entryName, original.getData());
      stats.failed.push({ entry: result.entryName, error: result.error });
    }
  }

  return { buffer: out.toBuffer(), stats };
}

module.exports = { isZip, shouldObfuscate, processZip, SKIP_BASENAMES };
