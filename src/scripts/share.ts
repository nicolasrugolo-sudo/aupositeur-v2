const initShareButtons = (): void => {
  document
    .querySelectorAll<HTMLElement>('[data-share-root]')
    .forEach((root) => {
      if (root.dataset.ready === 'true') return;

      root.dataset.ready = 'true';

      const trigger =
        root.querySelector<HTMLButtonElement>('[data-share-native]');

      const options =
        root.querySelector<HTMLElement>('[data-share-options]');

      const status =
        root.querySelector<HTMLElement>('[data-share-status]');

      const copyLink =
        root.querySelector<HTMLButtonElement>('[data-copy-link]');

      const copyPublication =
        root.querySelector<HTMLButtonElement>('[data-copy-publication]');

      const shareMedia =
        root.querySelector<HTMLButtonElement>('[data-share-media]');

      const prepareFacebook =
        root.querySelector<HTMLButtonElement>('[data-prepare-facebook]');


      const setStatus = (message: string): void => {
        if (status) {
          status.textContent = message;
        }
      };


      const openOptions = (): void => {
        options?.classList.toggle('is-open');

        trigger?.setAttribute(
          'aria-expanded',
          String(options?.classList.contains('is-open'))
        );
      };


      const shareMediaFile = async (): Promise<boolean> => {
        const mediaUrl = root.dataset.mediaUrl;

        if (!mediaUrl || !navigator.share) {
          return false;
        }

        try {
          const response = await fetch(mediaUrl);

          if (!response.ok) {
            throw new Error('Unable to load media');
          }

          const blob = await response.blob();

          const file = new File(
            [blob],
            root.dataset.mediaName || 'aupositeur.mp4',
            {
              type: blob.type || 'video/mp4',
            }
          );

          if (
            navigator.canShare &&
            !navigator.canShare({ files: [file] })
          ) {
            return false;
          }

          await navigator.share({
            title: root.dataset.title,
            text: root.dataset.publication,
            files: [file],
          });

          setStatus('Vidéo prête à publier');

          return true;
        } catch (error) {
          if (
            error instanceof DOMException &&
            error.name === 'AbortError'
          ) {
            return true;
          }

          return false;
        }
      };


      trigger?.addEventListener('click', async () => {
        if (root.dataset.mediaUrl) {
          if (await shareMediaFile()) return;

          openOptions();
          setStatus('Choisissez comment publier');

          return;
        }

        const payload = {
          title: root.dataset.title,
          text: root.dataset.text,
          url: root.dataset.url,
        };

        if (navigator.share) {
          try {
            await navigator.share(payload);

            setStatus('Partage ouvert');

            return;
          } catch (error) {
            if (
              error instanceof DOMException &&
              error.name === 'AbortError'
            ) {
              return;
            }
          }
        }

        openOptions();
      });


      shareMedia?.addEventListener('click', async () => {
        if (!(await shareMediaFile())) {
          setStatus(
            'Téléchargez la vidéo puis copiez la publication'
          );
        }
      });


      copyPublication?.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(
            root.dataset.publication || ''
          );

          setStatus('Publication copiée');

          copyPublication.textContent =
            'Publication copiée ✓';
        } catch {
          setStatus(
            'Impossible de copier automatiquement'
          );
        }
      });


      prepareFacebook?.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(
            root.dataset.publication || ''
          );

          const download =
            document.createElement('a');

          download.href =
            root.dataset.mediaUrl || '';

          download.download =
            root.dataset.mediaName ||
            'aupositeur.mp4';

          document.body.appendChild(download);

          download.click();
          download.remove();

          setStatus(
            'Vidéo téléchargée · publication copiée'
          );

          prepareFacebook.textContent =
            'Prêt pour Facebook ✓';
        } catch {
          setStatus(
            'Téléchargez la vidéo puis copiez la publication'
          );
        }
      });


      copyLink?.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(
            root.dataset.url || window.location.href
          );

          setStatus('Lien copié');

          copyLink.textContent =
            'Lien copié ✓';
        } catch {
          setStatus(
            'Impossible de copier automatiquement'
          );
        }
      });
    });
};


initShareButtons();

document.addEventListener(
  'astro:page-load',
  initShareButtons
);
