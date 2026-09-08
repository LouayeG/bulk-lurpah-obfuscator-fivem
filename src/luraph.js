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

module.exports = { getClient, getRecommendedNode };
