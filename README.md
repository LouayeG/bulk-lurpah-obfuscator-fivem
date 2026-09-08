# Luraph Batch Obfuscator

A small web tool: drop many Lua files, obfuscate them **all** through the
[Luraph API](https://lura.ph) with one fixed profile, and download a zip of the
results. Built for FiveM scripts.

## Profile applied to every file

| Option | Value |
| --- | --- |
| Intense VM Structure | off |
| Enable GC Fixes | off |
| Target Version | `FiveM` |
| Optimization Level | `Level 2` |
| Static Environment | on |
| VM Compression | off |
| Disable Line Information | off |
| Use Debug Library | off |

Obfuscation runs on the **main** node (auto-selected as recommended). Names match
Luraph's dashboard labels — run `npm run options` to print exactly what your
account exposes, then edit [`src/settings.js`](src/settings.js). Names are
resolved to the node's real option IDs at runtime, and anything unrecognized is
reported in `_report.json` rather than silently applied.

## Resources (.zip)

Drop a whole FiveM resource as a `.zip` and the tool obfuscates it **in place**:

- every eligible `.lua` file inside is obfuscated,
- `fxmanifest.lua` / `__resource.lua` and all non-Lua assets pass through
  untouched,
- the folder structure is preserved and the resource is rebuilt as
  `<name>-obfuscated.zip`,
- if one file fails to obfuscate, its original is kept so the resource still
  runs, and the failure is listed in `_report.json`.

You can mix loose `.lua` files and `.zip` resources in the same upload. To keep
specific files editable (e.g. a `config.lua`), add their base names to
`SKIP_BASENAMES` in [`src/resource.js`](src/resource.js).

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

## How it obfuscates up to 100 files at once

Luraph's API is **one job per file** — it has no "many files" endpoint. This tool
puts the batch layer on top so you never do it by hand:

1. **One multipart upload.** The browser sends every selected file in a single
   `POST /api/obfuscate` request (`multer` accepts up to **100 files**, 5 MB each,
   held in memory — nothing touches disk).
2. **Resolve the profile once.** `createSession()` calls `getNodes()` a single
   time to pick the recommended node and map your named settings to that node's
   option IDs. The same node + options are reused for the whole batch, so the
   handshake isn't repeated per file.
3. **Bounded parallel jobs.** A small worker pool (`mapLimit`, **3 in flight**)
   walks the files: for each it runs `createNewJob → getJobStatus → downloadResult`.
   Three at a time keeps things fast without hammering the node or tripping rate
   limits; as one finishes, the next starts.
4. **Isolated failures.** Each file's result is captured independently, so one
   bad file (syntax error, unsupported construct) is recorded — not fatal to the
   rest.
5. **One zip back.** Successful files are streamed into `obfuscated.zip` as
   they're ready, alongside a `_report.json` listing the node used, any option
   warnings, and per-file failures.

Want more throughput? Raise `CONCURRENCY` in `server.js` — but keep it modest;
each job is real work on Luraph's servers and counts against your plan/tokens.

To change the cap, edit `MAX_FILES` in `server.js`.

## How it works (per file)

`createNewJob(node, script, fileName, options)` → `getJobStatus(jobId)` →
`downloadResult(jobId)`, using the official [`luraph`](https://www.npmjs.com/package/luraph) package.

## Notes

- Files are held in memory and forwarded to Luraph only — nothing is written to
  disk.
- Obfuscation runs on Luraph's servers; each file is one API job (and counts
  against your plan/tokens accordingly).
- Only obfuscate code you own or are licensed to protect.
