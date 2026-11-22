(() => {
  const audioOrigin = 'https://aupositeur-media-api.nicolas-rugolo.workers.dev';
  const printOrigin = 'https://aupositeur-shop-api.nicolas-rugolo.workers.dev';
  const el = id => document.getElementById(id);
  const session = window.aupositeurMediaSession;
  const status = el('status');
  let audioFiles = [];
  const message = text => { status.textContent = text; };
  const normalize = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

  async function api(kind, path, options = {}) {
    const token = session.get(kind);
    if (!token) throw Error('Autorisation nécessaire pour cette opération.');
    const response = await fetch((kind === 'audio' ? audioOrigin : printOrigin) + path, {
      ...options,
      headers: { ...options.headers, 'X-Aupositeur-Admin': token },
    });
    if (response.status === 401) {
      session.clear(kind);
      throw Error('Autorisation refusée. Relancez l’action avec le jeton de ce service.');
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) throw Error(payload.error || `Le service a répondu HTTP ${response.status}.`);
    return payload;
  }

  function showReference(key, field) {
    el('ref').value = key;
    el('copy').disabled = false;
    message(`Référence prête à copier dans le champ ${field}.`);
  }

  function renderAudioList() {
    const query = normalize(el('audio-search').value.trim());
    const rows = audioFiles.filter(file => normalize(file.name + ' ' + file.key).includes(query));
    el('audio-files').replaceChildren(...rows.map(file => {
      const row = document.createElement('li');
      const player = document.createElement('audio');
      player.controls = true;
      player.preload = 'none';
      player.src = audioOrigin + '/media/' + file.key.split('/').map(encodeURIComponent).join('/');
      player.setAttribute('aria-label', file.name);
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.textContent = 'Sélectionner la référence';
      copy.addEventListener('click', () => showReference(file.key, 'audioKey'));
      row.append(file.name, player, copy);
      return row;
    }));
  }

  async function loadAudio() {
    const data = await api('audio', '/admin/audio-files');
    audioFiles = data.files;
    el('audio-key').replaceChildren(new Option('Nouveau fichier', ''),
      ...audioFiles.map(file => new Option(file.name, file.key)));
    renderAudioList();
    return data;
  }

  async function run(control, action) {
    control.disabled = true;
    message('Opération en cours…');
    try { await action(); }
    catch (error) { message(error.message || 'Opération impossible.'); }
    finally { control.disabled = false; }
  }

  el('load-audio').addEventListener('click', event => run(event.currentTarget, async () => {
    const data = await loadAudio();
    message(data.truncated ? 'La liste est limitée aux fichiers retournés par le service.' : `${audioFiles.length} fichier(s) audio chargé(s).`);
  }));
  el('audio-search').addEventListener('input', renderAudioList);

  el('audio-upload').addEventListener('submit', event => {
    event.preventDefault();
    const key = el('audio-key').value;
    const file = el('audio-file').files[0];
    if (!file || (key && !window.confirm('Remplacer cet audio en conservant son URL publique ?'))) return;
    run(event.submitter, async () => {
      const meta = { key, name: file.name, type: file.type, size: file.size };
      const json = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const upload = await api('audio', '/admin/audio-files/upload-url', json(meta));
      const saved = await fetch(upload.uploadUrl, { method: 'PUT', headers: { 'Content-Type': upload.contentType }, body: file });
      if (!saved.ok) throw Error(`Envoi R2 impossible (HTTP ${saved.status}).`);
      const result = await api('audio', '/admin/audio-files/confirm', json({ ...meta, key: upload.key }));
      el('audio-upload').reset();
      showReference(result.key, 'audioKey');
    });
  });

  el('print-upload').addEventListener('submit', event => {
    event.preventDefault();
    const file = el('print-file').files[0];
    if (!file) return;
    run(event.submitter, async () => {
      const body = new FormData();
      body.append('file', file);
      body.append('kind', 'print-master');
      const result = await api('print', '/admin/print-files/upload', { method: 'POST', body });
      el('print-upload').reset();
      showReference(result.key, 'printFileKey');
    });
  });

  el('copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(el('ref').value);
      message('Référence copiée.');
    } catch {
      el('ref').select();
      message('Copiez la référence sélectionnée avec le clavier.');
    }
  });
})();
