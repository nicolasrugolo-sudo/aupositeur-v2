(() => {
  const CMS_GLOBAL = window.CMS;
  const createClass = window.createClass;
  const h = window.h;
  if (!CMS_GLOBAL || !createClass || !h) return;

  const API_BASE = 'https://aupositeur-media-api.nicolas-rugolo.workers.dev';
  const TOKEN_KEY = 'aupositeurShopAdminToken';

  const getToken = () => {
    let token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || '';
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      sessionStorage.removeItem(TOKEN_KEY);
      return token;
    }
    token = window.prompt('Token administrateur Aupositeur :') || '';
    if (token) localStorage.setItem(TOKEN_KEY, token);
    return token;
  };

  const clearStoredToken = () => {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  };

  const formatBytes = (bytes) => {
    if (!Number.isFinite(bytes)) return '';
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  };

  const publicUrl = (key) => key ? `${API_BASE}/media/${key}` : '';

  const AudioFileControl = createClass({
    getInitialState() {
      return {
        uploading: false,
        loading: false,
        error: '',
        meta: null,
        library: [],
        showLibrary: false,
      };
    },

    componentDidMount() {
      if (this.props.value) this.loadLibrary(false);
    },

    async api(path, options = {}) {
      const token = getToken();
      if (!token) throw new Error('Token administrateur requis.');

      const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
          ...(options.headers || {}),
          'X-Aupositeur-Admin': token,
        },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) clearStoredToken();
        throw new Error(data.error || `Erreur (${response.status})`);
      }
      return data;
    },

    async loadLibrary(open = true) {
      this.setState({ loading: true, error: '', showLibrary: open || this.state.showLibrary });
      try {
        const data = await this.api('/admin/audio-files');
        this.setState({ loading: false, library: data.files || [] });
      } catch (error) {
        this.setState({ loading: false, error: error instanceof Error ? error.message : 'Lecture impossible' });
      }
    },

    async upload(event) {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (!file) return;

      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (!['mp3', 'wav', 'flac', 'm4a'].includes(ext)) {
        this.setState({ error: 'Format refusé. Utilise MP3, WAV, FLAC ou M4A.' });
        return;
      }

      this.setState({ uploading: true, error: '', meta: null });
      try {
        const body = new FormData();
        body.append('file', file);
        if (this.props.value) body.append('key', this.props.value);

        const data = await this.api('/admin/audio-files/upload', { method: 'POST', body });
        this.props.onChange(data.key);
        this.setState({
          uploading: false,
          meta: { name: data.name || file.name, bytes: data.bytes, mime: data.mime },
        });
        await this.loadLibrary(false);
      } catch (error) {
        this.setState({ uploading: false, error: error instanceof Error ? error.message : 'Upload impossible' });
      }
    },

    choose(key) {
      this.props.onChange(key);
      this.setState({ showLibrary: false, error: '' });
    },

    clear() {
      this.props.onChange('');
      this.setState({ meta: null, error: '' });
    },

    renderLibrary() {
      if (!this.state.showLibrary) return null;
      return h('div', {
        style: { marginTop: '14px', borderTop: '1px solid #ddd6c8', paddingTop: '12px' },
      },
        h('div', { style: { marginBottom: '8px', fontWeight: 600 } }, 'Bibliothèque audio R2'),
        this.state.loading && h('div', null, 'Chargement…'),
        !this.state.loading && this.state.library.length === 0 && h('div', { style: { fontSize: '13px' } }, 'Aucun fichier audio.'),
        ...this.state.library.map((item) => h('button', {
          type: 'button',
          onClick: () => this.choose(item.key),
          style: {
            display: 'block',
            width: '100%',
            textAlign: 'left',
            margin: '6px 0',
            padding: '10px',
            border: item.key === this.props.value ? '2px solid #b95632' : '1px solid #ddd6c8',
            background: '#fff',
            cursor: 'pointer',
          },
        },
          h('strong', null, item.name || item.key.split('/').pop()),
          h('div', { style: { fontSize: '12px', opacity: .7, marginTop: '3px' } }, `${formatBytes(item.bytes)} · ${item.mime || 'audio'}`)
        ))
      );
    },

    render() {
      const value = this.props.value || '';
      const { uploading, loading, error, meta } = this.state;
      const url = publicUrl(value);

      return h('div', {
        style: {
          border: '1px solid #ddd6c8',
          padding: '16px',
          background: '#faf8f3',
          borderRadius: '4px',
        },
      },
        h('div', { style: { marginBottom: '10px', fontWeight: 600 } }, value ? 'Fichier audio R2 sélectionné' : 'Aucun fichier audio'),
        value && h('code', {
          style: { display: 'block', marginBottom: '10px', padding: '8px', background: '#fff', wordBreak: 'break-all' },
        }, value),
        meta && h('div', { style: { marginBottom: '10px', fontSize: '13px' } }, `${meta.name} · ${formatBytes(meta.bytes)} · ${meta.mime || 'audio'}`),
        value && h('audio', { controls: true, preload: 'metadata', src: url, style: { width: '100%', margin: '8px 0 12px' } }),
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } },
          h('label', {
            style: { display: 'inline-block', padding: '8px 10px', border: '1px solid #111', background: '#111', color: '#fff', cursor: uploading ? 'wait' : 'pointer' },
          },
            uploading ? 'Téléversement…' : (value ? 'Remplacer le fichier' : 'Téléverser un fichier'),
            h('input', {
              type: 'file',
              accept: '.mp3,.wav,.flac,.m4a,audio/mpeg,audio/wav,audio/flac,audio/mp4',
              disabled: uploading,
              onChange: this.upload,
              style: { display: 'none' },
            })
          ),
          h('button', {
            type: 'button',
            onClick: () => this.loadLibrary(true),
            disabled: loading,
            style: { padding: '8px 10px', border: '1px solid #888', background: '#fff', cursor: 'pointer' },
          }, loading ? 'Chargement…' : 'Choisir dans R2'),
          value && h('button', {
            type: 'button',
            onClick: this.clear,
            style: { padding: '8px 10px', border: '1px solid #aaa', background: 'transparent', cursor: 'pointer' },
          }, 'Retirer de la fiche')
        ),
        this.renderLibrary(),
        error && h('div', { style: { marginTop: '10px', color: '#a33' } }, error),
        h('button', {
          type: 'button',
          onClick: () => { clearStoredToken(); this.setState({ error: '' }); },
          style: { marginTop: '12px', border: 0, background: 'transparent', padding: 0, textDecoration: 'underline', cursor: 'pointer', fontSize: '12px' },
        }, 'Oublier le token de ce navigateur')
      );
    },
  });

  CMS_GLOBAL.registerWidget('aupositeur-audio-file', AudioFileControl);
})();
