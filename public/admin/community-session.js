(() => {
  function githubToken(allowLegacy) {
    try {
      const user = JSON.parse(localStorage.getItem('sveltia-cms.user') || 'null');
      if (user?.backendName === 'github' && typeof user.token === 'string' && /^[A-Za-z0-9_]{20,255}$/.test(user.token)) return user.token;
    } catch {}
    if (!allowLegacy) return '';
    for (const storage of [localStorage, sessionStorage]) {
      for (const key of ['decap-cms-user', 'netlify-cms-user']) {
        try {
          const user = JSON.parse(storage.getItem(key) || 'null');
          const token = user?.token?.access_token || user?.token?.token || user?.token || user?.access_token ||
            user?.user?.token?.access_token || user?.user?.token;
          if (typeof token === 'string' && /^[A-Za-z0-9_]{20,255}$/.test(token)) return token;
        } catch {}
      }
    }
    return '';
  }

  // The Community Worker independently checks GitHub identity and repository permissions.
  const workerOrigins = new Map([
    ['https://aupositeur-media-api.nicolas-rugolo.workers.dev', 'studio-audio'],
    ['https://aupositeur-google-insights.nicolas-rugolo.workers.dev', 'studio-insights'],
  ]);
  window.aupositeurWorkerRequest = (url, options = {}) => {
    const target = new URL(url);
    if (window.location.origin !== 'https://www.aupositeur.be' ||
        !workerOrigins.has(target.origin) || !target.pathname.startsWith('/admin/')) {
      return Promise.reject(Error('Destination privée non autorisée.'));
    }
    const token = githubToken(true);
    if (!token) return Promise.reject(Error('Reconnectez-vous à Studio avec GitHub.'));
    const headers = new Headers(options.headers);
    headers.set('Authorization', 'Bearer ' + token);
    return fetch('/api/admin/' + workerOrigins.get(target.origin) + target.pathname.slice(6) + target.search, { ...options, headers, credentials: 'same-origin', redirect: 'error' });
  };
  window.aupositeurCommunityRequest = (path, options = {}, allowLegacy = false) => {
    if (window.location.origin !== 'https://www.aupositeur.be' || !path.startsWith('/api/admin/')) {
      return Promise.reject(Error('Connectez-vous au Studio sur www.aupositeur.be.'));
    }
    const headers = new Headers(options.headers);
    const token = githubToken(allowLegacy);
    if (token) headers.set('Authorization', 'Bearer ' + token);
    return fetch(path, { ...options, headers, credentials: 'same-origin', redirect: 'error' });
  };
})();
