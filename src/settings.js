// The obfuscation profile to apply to every uploaded file.
//
// Keys are the human-readable option NAMES exactly as they appear in the Luraph
// dashboard / the `npm run options` output. They are resolved to each node's
// real option IDs at runtime (see src/luraph.js). Run `npm run options` to see
// the exact names/choices your account exposes.
//
// Note: "Mode = main" from the original spec refers to the Luraph NODE (this
// tool already selects the recommended node, which is "main"), not a per-file
// option — so it isn't listed here.
const profile = {
  'Intense VM Structure': false,
  'Enable GC Fixes': false,
  'Target Version': 'FiveM',
  'Optimization Level': 'Level 2',
  'Static Environment': true,
  'VM Compression': false,
  'Disable Line Information': false,
  'Use Debug Library': false,
};

module.exports = { profile };
