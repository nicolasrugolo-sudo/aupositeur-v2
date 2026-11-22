(() => {
  const prompts = {
    audio: 'Jeton administrateur audio',
    print: 'Jeton administrateur Boutique',
  };
  const tokens = new Map();
  for (const key of ['aupositeurMediaAdminToken', 'aupositeurShopAdminToken']) {
    try { localStorage.removeItem(key); } catch {}
    try { sessionStorage.removeItem(key); } catch {}
  }

  window.aupositeurMediaSession = Object.freeze({
    get(kind) {
      if (!tokens.has(kind)) {
        const token = window.prompt(prompts[kind])?.trim();
        if (token) tokens.set(kind, token);
      }
      return tokens.get(kind) || '';
    },
    clear(kind) {
      tokens.delete(kind);
    },
  });
})();
