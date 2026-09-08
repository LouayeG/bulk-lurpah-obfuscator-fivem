// Prints the options offered by the currently recommended Luraph node, so you
// can confirm the exact names/choices your account exposes and keep
// src/settings.js in sync. Usage: npm run options
require('dotenv').config({ quiet: true });

const { getRecommendedNode } = require('../src/luraph');

(async () => {
  const { id, node } = await getRecommendedNode();
  console.log(`Recommended node: ${id}\n`);
  for (const [optionId, info] of Object.entries(node.options)) {
    const choices = info.type === 'DROPDOWN' ? `  choices=[${(info.choices || []).join(', ')}]` : '';
    console.log(`- ${info.name}  (id=${optionId}, type=${info.type}, required=${info.required}, tier=${info.tier})${choices}`);
  }
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
