const { Luraph } = require('luraph');

let client = null;

function getClient() {
  const apiKey = process.env.LPH_API_KEY;
  if (!apiKey) {
    const error = new Error('LPH_API_KEY is not set. Add it to your .env file.');
    error.statusCode = 500;
    throw error;
  }
  if (!client) client = new Luraph(apiKey);
  return client;
}

// Pick the node Luraph currently recommends (least loaded), with a safe fallback.
async function getRecommendedNode() {
  const { recommendedId, nodes } = await getClient().getNodes();
  const id = recommendedId || Object.keys(nodes)[0];
  if (!id) throw new Error('No Luraph nodes are available right now.');
  return { id, node: nodes[id] };
}

// Turn the human-named profile (see settings.js) into the { optionId: value }
// shape the API wants, by matching each setting's name against the node's
// options. Dropdown values are matched case-insensitively to a valid choice;
// checkboxes are coerced to booleans. Anything unmatched is reported, not thrown.
function resolveOptions(node, profile) {
  const byName = {};
  for (const [id, info] of Object.entries(node.options)) {
    byName[info.name.trim().toLowerCase()] = { id, info };
  }

  const options = {};
  const warnings = [];

  for (const [name, value] of Object.entries(profile)) {
    const match = byName[name.trim().toLowerCase()];
    if (!match) {
      warnings.push(`Option "${name}" is not offered by node ${node.name || 'recommended'} — skipped.`);
      continue;
    }
    const { id, info } = match;

    if (info.type === 'DROPDOWN') {
      const choice = (info.choices || []).find(
        (c) => String(c).trim().toLowerCase() === String(value).trim().toLowerCase(),
      );
      if (!choice) {
        warnings.push(
          `"${name}" = "${value}" is not a valid choice (allowed: ${(info.choices || []).join(', ')}) — skipped.`,
        );
        continue;
      }
      options[id] = choice;
    } else if (info.type === 'CHECKBOX') {
      options[id] = Boolean(value);
    } else {
      options[id] = value;
    }
  }

  return { options, warnings };
}

// Resolve the profile once, then reuse the node + options for a whole batch.
async function createSession(profile) {
  const lph = getClient();
  const { id, node } = await getRecommendedNode();
  const { options, warnings } = resolveOptions(node, profile);

  return {
    nodeId: id,
    options,
    warnings,
    async run(script, fileName) {
      const { jobId } = await lph.createNewJob(id, script, fileName, options, false, false);
      const { success, error } = await lph.getJobStatus(jobId);
      if (!success) throw new Error(error || 'Obfuscation failed.');
      return lph.downloadResult(jobId); // { fileName, data }
    },
  };
}

// Run an async mapper over items with a bounded number of workers in flight,
// so a big upload doesn't fire hundreds of jobs at the node at once.
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

module.exports = { getClient, getRecommendedNode, resolveOptions, createSession, mapLimit };
