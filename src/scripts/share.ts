const initShareButtons = (): void => {
  document.querySelectorAll<HTMLElement>('[data-share-root]').forEach((root) => {
    if (root.dataset.ready === 'true') return;
    root.dataset.ready = 'true';

    const trigger = root.querySelector<HTMLButtonElement>('[data-share-native]');
    const options = root.querySelector<HTMLElement>('[data-share-options]');
    const status = root.querySelector<HTMLElement>('[data-share-status]');
    const copyLink = root.querySelector<HTMLButtonElement>('[data-copy-link]');
    const copyPublication = root.querySelector<HTMLButtonElement>('[data-copy-publication]');
    const facebookShare = root.querySelector<HTMLButtonElement>('[data-facebook-share]');
    const shareMedia = root.querySelector<HTMLButtonElement>('[data-share-media]');
    const shareImage = root.querySelector<HTMLButtonElement>('[data-share-image]');
    const downloadImage = root.querySelector<HTMLButtonElement>('[data-download-image]');

    const trackShare = (method: string, result: string): void => {
      const analytics = (window as Window & { gtag?: (...args: unknown[]) => void }).gtag;
      if (typeof analytics === 'function') analytics('event', 'aupositeur_share_action', {
        share_method: method,
        share_result: result,
        content_url: root.dataset.url || window.location.href,
      });
    };

    const setStatus = (message: string): void => {
      if (status) status.textContent = message;
    };

    // Embla masque tout débordement de son viewport. Un menu de partage
    // positionné dans une diapositive serait donc invisible ou tronqué.
    // Sur l'accueil uniquement, le menu est déplacé dans <body>.
    const inQuoteCarousel = Boolean(root.closest('[data-quote-carousel]'));
    if (inQuoteCarousel && options) {
      document.body.appendChild(options);
      options.classList.add('share-options--quote-portal');
    }

    const closeOptions = (): void => {
      options?.classList.remove('is-open');
      trigger?.setAttribute('aria-expanded', 'false');
    };

    const positionOptions = (): void => {
      if (!inQuoteCarousel || !options || !trigger) return;
      const rect = trigger.getBoundingClientRect();
      const menuWidth = Math.min(280, window.innerWidth - 24);
      const left = Math.max(12, Math.min(rect.left + rect.width / 2 - menuWidth / 2, window.innerWidth - menuWidth - 12));
      options.style.position = 'fixed';
      options.style.width = menuWidth + 'px';
      options.style.left = left + 'px';
      options.style.right = 'auto';
      options.style.bottom = 'auto';
      options.style.top = Math.min(rect.bottom + 8, window.innerHeight - 12) + 'px';
      options.style.zIndex = '9999';
      // Si l'espace sous le bouton manque, ouvrir au-dessus.
      const height = options.getBoundingClientRect().height;
      if (rect.bottom + 8 + height > window.innerHeight - 12) {
        options.style.top = Math.max(12, rect.top - height - 8) + 'px';
      }
    };

    const openOptions = (): void => {
      if (!options) return;
      const opening = !options.classList.contains('is-open');
      if (opening) {
        document.querySelectorAll<HTMLElement>('.share-options--quote-portal.is-open').forEach((menu) => {
          if (menu !== options) {
            menu.classList.remove('is-open');
            document.querySelectorAll<HTMLElement>('[data-share-root] [data-share-native][aria-expanded="true"]').forEach((button) => button.setAttribute('aria-expanded', 'false'));
          }
        });
        options.classList.add('is-open');
        positionOptions();
      } else closeOptions();
      trigger?.setAttribute('aria-expanded', String(opening));
    };

    if (inQuoteCarousel) {
      window.addEventListener('resize', () => options?.classList.contains('is-open') && positionOptions());
      document.addEventListener('click', (event) => {
        const target = event.target as Node;
        if (!root.contains(target) && !options?.contains(target)) closeOptions();
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeOptions();
      });
      root.closest('[data-quote-carousel]')?.addEventListener('pointerdown', (event) => {
        if (!trigger?.contains(event.target as Node)) closeOptions();
      });
    }

    const copyPublicationText = async (): Promise<boolean> => {
      try {
        await navigator.clipboard.writeText(root.dataset.publication || '');
        return true;
      } catch {
        return false;
      }
    };

    const shareMediaFile = async (): Promise<boolean> => {
      const mediaUrl = root.dataset.mediaUrl;
      if (!mediaUrl || !navigator.share) return false;

      try {
        const response = await fetch(mediaUrl);
        if (!response.ok) throw new Error('Unable to load media');
        const blob = await response.blob();
        const file = new File([blob], root.dataset.mediaName || 'aupositeur.mp4', { type: blob.type || 'video/mp4' });
        if (navigator.canShare && !navigator.canShare({ files: [file] })) return false;
        await navigator.share({ title: root.dataset.title, text: root.dataset.publication, files: [file] });
        trackShare('native_media', 'share_dialog_completed');
        setStatus('Média prêt à publier');
        return true;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return true;
        return false;
      }
    };

    const buildImage = async (): Promise<{ blob: Blob; file: File }> => {
      const source = root.dataset.imageUrl;
      if (!source) throw new Error('Image absente');
      const url = new URL(source, window.location.href);
      if (url.origin !== window.location.origin) throw new Error('Image externe non autorisée');
      const response = await fetch(url.href);
      if (!response.ok) throw new Error('Image indisponible');
      const svg = await response.text();
      const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      try {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Image illisible'));
          img.src = svgUrl;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas indisponible');
        ctx.drawImage(img, 0, 0);
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((result) => result ? resolve(result) : reject(new Error('PNG indisponible')), 'image/png'));
        const name = (url.pathname.split('/').pop() || 'aupositeur').replace(/\\.svg$/i, '') + '.png';
        return { blob, file: new File([blob], name, { type: 'image/png' }) };
      } finally { URL.revokeObjectURL(svgUrl); }
    };

    const downloadImageFile = (blob: Blob, name: string): void => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    };

    const shareImageFile = async (): Promise<void> => {
      try {
        setStatus('Préparation de la photo…');
        const { blob, file } = await buildImage();
        if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
          try {
            await navigator.share({ title: root.dataset.title, text: root.dataset.publication, files: [file] });
            trackShare('native_image', 'share_dialog_completed');
            setStatus('Image transmise à l’application de partage');
            return;
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') { setStatus(''); return; }
          }
        }
        downloadImageFile(blob, file.name);
        trackShare('download_image', 'download_requested');
        setStatus('Image PNG téléchargée — ajoutez-la à votre publication');
      } catch {
        setStatus('Impossible de préparer cette image');
      }
    };

    shareImage?.addEventListener('click', shareImageFile);
    downloadImage?.addEventListener('click', async () => {
      try {
        const { blob, file } = await buildImage();
        downloadImageFile(blob, file.name);
        trackShare('download_image', 'download_requested');
        setStatus('Image PNG téléchargée');
      } catch { setStatus('Image indisponible'); }
    });

    trigger?.addEventListener('click', async () => {
      // Dans le carrousel de citations, toujours montrer les réseaux.
      // navigator.share() peut se résoudre sans afficher de sélecteur visible
      // sur Chrome desktop : il ne doit pas court-circuiter ce menu.
      if (inQuoteCarousel) {
        openOptions();
        setStatus('');
        return;
      }
      if (root.dataset.imageUrl) {
        await shareImageFile();
        return;
      }
      if (root.dataset.mediaUrl) {
        if (await shareMediaFile()) return;
        openOptions();
        setStatus('Choisissez comment publier');
        return;
      }

      const payload = {
        title: root.dataset.title,
        text: root.dataset.publication,
        url: root.dataset.url,
      };

      if (navigator.share) {
        try {
          await navigator.share(payload);
          trackShare('native_link', 'share_dialog_completed');
          setStatus('Partage ouvert');
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return;
        }
      }
      openOptions();
    });

    facebookShare?.addEventListener('click', async () => {
      const copied = await copyPublicationText();
      const url = root.dataset.url || window.location.href;
      const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
      window.open(facebookUrl, '_blank', 'noopener,noreferrer');
      trackShare('facebook', 'share_window_open_requested');
      setStatus(copied ? 'Poème copié — collez-le dans la publication Facebook' : 'Facebook ouvert — ajoutez votre texte puis publiez');
    });

    shareMedia?.addEventListener('click', async () => {
      if (!(await shareMediaFile())) setStatus('Partage du média indisponible');
    });

    copyPublication?.addEventListener('click', async () => {
      if (await copyPublicationText()) {
        trackShare('copy_publication', 'copied');
        setStatus('Publication copiée');
        copyPublication.textContent = 'Publication copiée ✓';
      } else {
        setStatus('Impossible de copier automatiquement');
      }
    });

    copyLink?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(root.dataset.url || window.location.href);
        trackShare('copy_link', 'copied');
        setStatus('Lien copié');
        copyLink.textContent = 'Lien copié ✓';
      } catch {
        setStatus('Impossible de copier automatiquement');
      }
    });
  });
};

// Les citations sont remplacées aléatoirement par Embla après le rendu Astro.
// Réinitialiser les boutons qui viennent d'être insérés, sans doubler les
// écouteurs déjà présents (protégés par data-ready).
initShareButtons();
document.addEventListener('aupositeur:quotes-ready', initShareButtons);
document.addEventListener('astro:page-load', initShareButtons);
