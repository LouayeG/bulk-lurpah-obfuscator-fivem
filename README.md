# Luraph Batch Obfuscator

A small web tool: drop many Lua files, obfuscate them **all** through the
[Luraph API](https://lura.ph) with one fixed profile, and download a zip of the
results. Built for FiveM scripts.

## Profile applied to every file

| Option | Value |
| --- | --- |
| Mode | `main` |
| Intense VM Structure | off |
| GC Fixes | off |
| Target | `FiveM` |
| Optimization | `Level 2` |
| Static Environment | on |
| VM Compression | off |
| Disable Line Information | off |
| Debug Library | off |

Change it in [`src/settings.js`](src/settings.js). Option names are matched to
the node's real option IDs at runtime, so you edit human names, not IDs.

## Setup

```bash
npm install
cp .env.example .env
# put your Luraph API key in .env  (Dashboard → Account; API access needs an eligible plan)
npm start
```

Open `http://localhost:3000`, drop your `.lua` files, click **Obfuscate &
download**. You get `obfuscated.zip` containing every obfuscated file plus a
`_report.json` (node used, any option warnings, and per-file failures).

## Useful commands

```bash
npm run options   # print the live option names/choices your account exposes
npm run check     # syntax-check all sources
npm run dev       # auto-restart on changes
```

## Notes

- Files are held in memory and forwarded to Luraph only — nothing is written to
  disk.
- Obfuscation runs on Luraph's servers; each file is one API job (and counts
  against your plan/tokens accordingly).
- Only obfuscate code you own or are licensed to protect.
