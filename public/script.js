'use strict';

/* ---------- inline SVG icon set ---------- */
const ICONS = {
  shield: '<path d="M12 3l7 3v5c0 4.5-3 7.9-7 9-4-1.1-7-4.5-7-9V6z"/><path d="M8.5 12l2.4 2.4L15.5 10"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12"/>',
  sliders: '<path d="M4 7h9M17 7h3"/><path d="M4 12h3M11 12h9"/><path d="M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
  reset: '<path d="M4 10a8 8 0 1 0 2.4-4.2"/><path d="M4 4v4h4"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4"/><circle cx="12" cy="17.4" r="0.6" fill="currentColor" stroke="none"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M10.5 12L9 13.5l1.5 1.5"/><path d="M13.5 12L15 13.5l-1.5 1.5"/>',
  zip: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M11 7h1M11 10h1M11 13h1"/><rect x="10" y="15" width="4" height="4" rx="1"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8.4 12.3l2.4 2.4 4.8-5.2"/>',
  spinner: '<path d="M12 3a9 9 0 1 0 9 9"/>',
  zap: '<path d="M13 3L5 13h6l-1 8 8-10h-6z"/>',
};
const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
function paintIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    el.innerHTML = svg(el.getAttribute('data-icon'));
  });
}

/* ---------- elements ---------- */
const dropEl = document.getElementById('drop');
const fileInput = document.getElementById('file');
const listEl = document.getElementById('list');
const goBtn = document.getElementById('go');
const clearBtn = document.getElementById('clear');
const statusEl = document.getElementById('status');
const optionsEl = document.getElementById('options');
const nodeNote = document.getElementById('node-note');
const resetBtn = document.getElementById('reset');
const keyWarn = document.getElementById('keywarn');
const connPill = document.getElementById('conn');

/* ---------- state ---------- */
let files = [];
let maxFiles = 100;
let schema = []; // [{ id,name,type,choices,required,tier,description,value }]
let settings = {}; // name -> chosen value

/* ---------- helpers ---------- */
function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function isZipName(name) {
  return /\.zip$/i.test(name);
}
function shortDesc(text) {
  const t = String(text || '').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();
  return t.length > 72 ? `${t.slice(0, 72)}…` : t;
}
function setStatus(kind, message) {
  const ic = kind === 'ok' ? 'check' : kind === 'err' ? 'alert' : 'spinner';
  statusEl.hidden = false;
  statusEl.className = `status ${kind}`;
  statusEl.innerHTML = `<span class="st-ic">${svg(ic)}</span><span>${message}</span>`;
}

/* ---------- file list ---------- */
function renderFiles() {
  listEl.innerHTML = '';
  files.forEach((file, index) => {
    const zip = isZipName(file.name);
    const li = document.createElement('li');
    li.innerHTML =
      `<span class="file-ic ${zip ? 'zip' : ''}">${svg(zip ? 'zip' : 'file')}</span>` +
      `<span class="file-meta"><span class="file-name">${file.name}</span>` +
      `<span class="file-size">${humanSize(file.size)}${zip ? ' · resource' : ''}</span></span>` +
      `<button class="file-x" title="Remove" data-remove="${index}">${svg('x')}</button>`;
    listEl.appendChild(li);
  });
  const has = files.length > 0;
  goBtn.disabled = !has;
  clearBtn.disabled = !has;
  goBtn.querySelector('.btn-label').textContent = has
    ? `Obfuscate & download (${files.length})`
    : 'Obfuscate & download';
}

function addFiles(fileList) {
  const seen = new Set(files.map((f) => f.name + f.size));
  for (const f of Array.from(fileList)) {
    if (!seen.has(f.name + f.size)) files.push(f);
  }
  if (files.length > maxFiles) {
    files = files.slice(0, maxFiles);
    setStatus('info', `Capped at ${maxFiles} files per batch — extras dropped.`);
  }
  renderFiles();
}

listEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-remove]');
  if (!btn) return;
  files.splice(Number(btn.getAttribute('data-remove')), 1);
  renderFiles();
});

/* ---------- settings controls ---------- */
function controlFor(opt) {
  if (opt.type === 'DROPDOWN' && Array.isArray(opt.choices)) {
    const opts = opt.choices
      .map((c) => `<option value="${c}"${String(c) === String(settings[opt.name]) ? ' selected' : ''}>${c}</option>`)
      .join('');
    return `<div class="select"><select data-name="${opt.name}">${opts}</select></div>`;
  }
  // default to a switch for checkboxes / booleans
  const checked = settings[opt.name] ? ' checked' : '';
  return `<label class="switch"><input type="checkbox" data-name="${opt.name}"${checked}><span class="track"></span></label>`;
}

function badges(opt) {
  let out = '';
  if (opt.tier === 'PREMIUM_ONLY') out += `<span class="badge pro">${svg('zap')}Pro</span>`;
  if (opt.required) out += '<span class="badge req">Req</span>';
  return out;
}

function renderOptions() {
  const ordered = [...schema].sort((a, b) => (a.type === 'DROPDOWN' ? -1 : 0) - (b.type === 'DROPDOWN' ? -1 : 0));
  optionsEl.innerHTML = ordered
    .map((opt) => {
      const desc = shortDesc(opt.description);
      return (
        `<div class="opt">` +
        `<div class="opt-info"><span class="opt-name">${opt.name}${badges(opt)}</span>` +
        (desc ? `<span class="opt-desc">${desc}</span>` : '') +
        `</div>${controlFor(opt)}</div>`
      );
    })
    .join('');
}

optionsEl.addEventListener('change', (e) => {
  const el = e.target;
  const name = el.getAttribute('data-name');
  if (!name) return;
  settings[name] = el.type === 'checkbox' ? el.checked : el.value;
});

resetBtn.addEventListener('click', () => {
  settings = {};
  for (const opt of schema) settings[opt.name] = opt.value;
  renderOptions();
});

/* ---------- drag & drop ---------- */
dropEl.addEventListener('click', () => fileInput.click());
dropEl.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && fileInput.click());
fileInput.addEventListener('change', () => addFiles(fileInput.files));
['dragenter', 'dragover'].forEach((ev) =>
  dropEl.addEventListener(ev, (e) => {
    e.preventDefault();
    dropEl.classList.add('over');
  }),
);
['dragleave', 'drop'].forEach((ev) =>
  dropEl.addEventListener(ev, (e) => {
    e.preventDefault();
    dropEl.classList.remove('over');
  }),
);
dropEl.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

clearBtn.addEventListener('click', () => {
  files = [];
  fileInput.value = '';
  statusEl.hidden = true;
  renderFiles();
});

/* ---------- obfuscate ---------- */
goBtn.addEventListener('click', async () => {
  if (files.length === 0) return;
  const iconSpan = goBtn.querySelector('.btn-icon');
  goBtn.classList.add('busy');
  goBtn.disabled = true;
  clearBtn.disabled = true;
  iconSpan.innerHTML = svg('spinner');
  setStatus('info', `Obfuscating ${files.length} item(s) through Luraph…`);

  const form = new FormData();
  form.append('settings', JSON.stringify(settings));
  for (const file of files) form.append('files', file);

  try {
    const res = await fetch('/api/obfuscate', { method: 'POST', body: form });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Request failed (${res.status}).`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'obfuscated.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    const done = res.headers.get('X-Obfuscated-Count') || '?';
    const failed = Number(res.headers.get('X-Failed-Count') || '0');
    setStatus(
      failed ? 'info' : 'ok',
      failed
        ? `${done} done, ${failed} failed — see _report.json in the zip.`
        : `Done — ${done} item(s) obfuscated. Downloaded obfuscated.zip.`,
    );
  } catch (err) {
    setStatus('err', err.message);
  } finally {
    goBtn.classList.remove('busy');
    iconSpan.innerHTML = svg('shield');
    goBtn.disabled = files.length === 0;
    clearBtn.disabled = files.length === 0;
  }
});

/* ---------- init ---------- */
function setConn(kind, label) {
  connPill.className = `pill ${kind}`;
  connPill.querySelector('.pill-label').textContent = label;
}

async function init() {
  paintIcons();
  renderFiles();

  let hasApiKey = false;
  try {
    const s = await (await fetch('/api/settings')).json();
    maxFiles = s.maxFiles || 100;
    hasApiKey = Boolean(s.hasApiKey);
  } catch {
    /* ignore */
  }

  try {
    const data = await (await fetch('/api/options')).json();
    schema = data.options || [];
    settings = {};
    for (const opt of schema) settings[opt.name] = opt.value;
    renderOptions();
    if (data.live) {
      setConn('ok', 'API connected');
      nodeNote.textContent = `Node: ${data.node} · ${schema.length} options`;
    } else {
      setConn('warn', 'offline defaults');
      nodeNote.textContent = 'Showing default profile — node unreachable.';
    }
  } catch {
    optionsEl.innerHTML = '';
    setConn('warn', 'options unavailable');
  }

  keyWarn.hidden = hasApiKey;
  if (!hasApiKey) setConn('warn', 'no API key');
}

init();
