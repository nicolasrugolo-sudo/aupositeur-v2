(() => {
  const CMS_GLOBAL = window.CMS;
  const createClass = window.createClass;
  const h = window.h;
  if (!CMS_GLOBAL || !createClass || !h) return;

  const API_BASE = 'https://aupositeur-shop-api.nicolas-rugolo.workers.dev';
  const TOKEN_KEY = 'aupositeurShopAdminToken';

  const getToken = () => {
    // Keep the admin token on this browser so the boutique can be managed
    // without re-entering it for every product or every new admin session.
    // Migrate the previous session-only value automatically when present.
    let token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || '';

    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      sessionStorage.removeItem(TOKEN_KEY);
      return token;
    }

    token = window.prompt('Token administrateur Boutique Aupositeur :') || '';
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

  const PrintFileControl = createClass({
    getInitialState() {
      return {
        uploading: false,
        error: '',
        meta: null,
        mockup: null,
        mockupError: '',
      };
    },

    async upload(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      const allowed = ['image/png', 'image/jpeg', 'image/tiff', 'application/pdf'];
      if (!allowed.includes(file.type)) {
        this.setState({ error: 'Format refusé. Utilise PNG, JPG, TIFF ou PDF.' });
        return;
      }

      const token = getToken();
      if (!token) {
        this.setState({ error: 'Token administrateur requis.' });
        return;
      }

      this.setState({
        uploading: true,
        error: '',
        meta: null,
        mockup: null,
        mockupError: '',
      });

      try {
        const body = new FormData();
        body.append('file', file);
        body.append('kind', 'print-master');

        const response = await fetch(`${API_BASE}/admin/print-files/upload`, {
          method: 'POST',
          headers: {
            'X-Aupositeur-Admin': token,
          },
          body,
        });

        const data = await response.json();

        if (!response.ok || !data || !data.ok || !data.key) {
          if (response.status === 401) clearStoredToken();
          throw new Error((data && data.error) || `Upload impossible (${response.status})`);
        }

        this.props.onChange(data.key);
        this.setState({
          uploading: false,
          meta: {
            name: data.name || file.name,
            bytes: data.bytes == null ? file.size : data.bytes,
            mime: data.mime || file.type,
          },
          mockup: data.mockup || null,
          mockupError: data.mockupError || '',
        });
      } catch (error) {
        this.setState({
          uploading: false,
          error: error instanceof Error ? error.message : 'Upload impossible',
        });
      }
    },

    clearToken() {
      clearStoredToken();
      this.setState({ error: '' });
    },

    render() {
      const value = this.props.value || '';
      const { uploading, error, meta, mockup, mockupError } = this.state;

      return h(
        'div',
        {
          style: {
            border: '1px solid #ddd6c8',
            padding: '16px',
            background: '#faf8f3',
            borderRadius: '4px',
          },
        },
        h('div', { style: { marginBottom: '10px', fontWeight: 600 } },
          value ? 'Fichier HD sécurisé présent' : 'Aucun fichier HD sécurisé'
        ),
        value && h('code', {
          style: {
            display: 'block',
            marginBottom: '10px',
            padding: '8px',
            background: '#fff',
            wordBreak: 'break-all',
          },
        }, value),
        meta && h('div', { style: { marginBottom: '10px', fontSize: '13px' } },
          `${meta.name} · ${formatBytes(meta.bytes)} · ${meta.mime}`
        ),
        mockup && h('div', {
          style: {
            margin: '12px 0',
            padding: '10px',
            background: '#edf5ed',
            border: '1px solid #bfd4bf',
            fontSize: '13px',
          },
        },
          h('strong', null, 'Mockup Aupositeur généré automatiquement.'),
          h('div', { style: { marginTop: '6px', wordBreak: 'break-all' } }, mockup.url || mockup.key)
        ),
        mockupError && h('div', {
          style: {
            margin: '12px 0',
            padding: '10px',
            background: '#fff4e8',
            border: '1px solid #e8c89f',
            color: '#7a4b13',
            fontSize: '13px',
          },
        }, `Fichier HD enregistré, mais mockup non généré : ${mockupError}`),
        h('input', {
          type: 'file',
          accept: '.png,.jpg,.jpeg,.tif,.tiff,.pdf,image/png,image/jpeg,image/tiff,application/pdf',
          disabled: uploading,
          onChange: this.upload,
        }),
        uploading && h('div', { style: { marginTop: '8px' } }, 'Téléversement vers Cloudflare R2 et génération du mockup…'),
        error && h('div', { style: { marginTop: '8px', color: '#a33' } }, error),
        h('button', {
          type: 'button',
          onClick: this.clearToken,
          style: {
            marginTop: '12px',
            border: 0,
            background: 'transparent',
            padding: 0,
            textDecoration: 'underline',
            cursor: 'pointer',
            fontSize: '12px',
          },
        }, 'Oublier le token de ce navigateur')
      );
    },
  });

  CMS_GLOBAL.registerWidget('aupositeur-print-file', PrintFileControl);
})();
