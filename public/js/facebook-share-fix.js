(() => {
  document.addEventListener('click', async (event) => {
    const link = event.target.closest?.('a[aria-label="Partager sur Facebook"]');
    if (!link) return;

    const root = link.closest('[data-poem-share-root]');
    const nativeButton = root?.querySelector('[data-share-poem]');
    if (!root || !nativeButton) return;

    const publication = nativeButton.dataset.text || '';
    const slug = nativeButton.dataset.slug || '';
    const pageUrl = slug
      ? `https://www.aupositeur.be/ecrits/${encodeURIComponent(slug)}/`
      : new URL(window.location.pathname, 'https://www.aupositeur.be').href;
    const fullText = `${publication}\n\n${pageUrl}`;

    // Facebook deliberately does not allow websites to pre-fill the user's post text.
    // Keep the complete poem ready to paste instead of pretending the Share Dialog accepts it.
    try {
      await navigator.clipboard.writeText(fullText);
    } catch {}

    link.href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`;
  }, true);
})();
