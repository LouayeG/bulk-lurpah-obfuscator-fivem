// The obfuscation profile to apply to every uploaded file.
//
// Keys are the human-readable option NAMES exactly as they appear in the Luraph
// dashboard. They are resolved to each node's real option IDs at runtime (see
// src/luraph.js), so this file stays readable and doesn't hard-code IDs that can
// differ between nodes. Run `npm run options` to print the live names/choices.
const profile = {
  Mode: 'main',
  'Intense VM Structure': false,
  'GC Fixes': false,
  Target: 'FiveM',
  Optimization: 'Level 2',
  'Static Environment': true,
  'VM Compression': false,
  'Disable Line Information': false,
  'Debug Library': false,
};

module.exports = { profile };
