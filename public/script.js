const dropEl = document.getElementById('drop');
const fileInput = document.getElementById('file');
const listEl = document.getElementById('list');
const goBtn = document.getElementById('go');
const clearBtn = document.getElementById('clear');
const statusEl = document.getElementById('status');
const profileEl = document.getElementById('profile');
const keyWarn = document.getElementById('keywarn');

let files = [];

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function render() {
  listEl.innerHTML = '';
  for (const file of files) {
    const li = document.createElement('li');
    const left = document.createElement('span');
    left.textContent = file.name;
    const right = document.createElement('span');
    right.className = 'fsize';
    right.textContent = humanSize(file.size);
    li.append(left, right);
    listEl.appendChild(li);
  }
  const has = files.length > 0;
  goBtn.disabled = !has;
  clearBtn.disabled = !has;
  goBtn.textContent = has ? `Obfuscate & download (${files.length})` : 'Obfuscate & download';
}

function addFiles(fileList) {
  const incoming = Array.from(fileList);
  const seen = new Set(files.map((f) => f.name + f.size));
  for (const f of incoming) {
    if (!seen.has(f.name + f.size)) files.push(f);
  }
  render();
}

function setStatus(kind, message) {
  statusEl.hidden = false;
  statusEl.className = `status ${kind}`;
  statusEl.textContent = message;
}

// Drag & drop wiring
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
  render();
});

goBtn.addEventListener('click', async () => {
  if (files.length === 0) return;
  goBtn.disabled = true;
  clearBtn.disabled = true;
  setStatus('info', `Obfuscating ${files.length} file(s) through Luraph… this can take a moment.`);

  const form = new FormData();
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
      `Done — ${done} file(s) obfuscated${failed ? `, ${failed} failed (see _report.json in the zip).` : '. Downloaded obfuscated.zip.'}`,
    );
  } catch (err) {
    setStatus('err', err.message);
  } finally {
    goBtn.disabled = files.length === 0;
    clearBtn.disabled = files.length === 0;
  }
});

// Load and show the active profile
fetch('/api/settings')
  .then((r) => r.json())
  .then(({ profile, hasApiKey }) => {
    profileEl.innerHTML = '';
    for (const [name, value] of Object.entries(profile)) {
      const li = document.createElement('li');
      const k = document.createElement('span');
      k.textContent = name;
      const v = document.createElement('span');
      v.className = 'val ' + (value === true ? 'on' : value === false ? 'off' : '');
      v.textContent = value === true ? 'on' : value === false ? 'off' : value;
      li.append(k, v);
      profileEl.appendChild(li);
    }
    keyWarn.hidden = Boolean(hasApiKey);
  })
  .catch(() => {});

render();
