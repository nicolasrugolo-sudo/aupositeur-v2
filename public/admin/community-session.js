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
