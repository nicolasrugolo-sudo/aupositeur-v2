(() => {
  document.addEventListener('click', async (event) => {
    const link = event.target.closest?.('a[aria-label="Partager sur Facebook"]');
    if (!link) return;

    const root = link.closest('[data-poem-share-root]');
    const nativeButton = root?.querySelector('[data-share-poem]');
    if (!root || !nativeButton) return;

    const publication = nativeButton.dataset.text || '';
    const pageUrl = nativeButton.dataset.url || window.location.href;
    const fullText = `${publication}\n\n${pageUrl}`;

    try {
      await navigator.clipboard.writeText(fullText);
    } catch {}

    const shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}&quote=${encodeURIComponent(publication)}`;
    link.href = shareUrl;
  }, true);
})();
