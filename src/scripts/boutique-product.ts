const initBoutiqueProduct = (): void => {
  const root =
    document.querySelector<HTMLElement>('[data-product]');

  if (!root || root.dataset.ready === 'true') {
    return;
  }

  root.dataset.ready = 'true';

  const base =
    root.dataset.base;

  if (!base) {
    return;
  }


  /* ========================================================
     PROTECTION VISUELLE
     ======================================================== */

  root
    .querySelectorAll<HTMLImageElement>(
      '.ap-product__art img, .ap-product__context img'
    )
    .forEach((image) => {
      image.addEventListener(
        'contextmenu',
        (event) => event.preventDefault()
      );

      image.addEventListener(
        'dragstart',
        (event) => event.preventDefault()
      );
    });


  /* ========================================================
     CADRES
     ======================================================== */

  const mainImage =
    root.querySelector<HTMLImageElement>(
      '#product-main-image'
    );

  const frameLabel =
    root.querySelector<HTMLElement>(
      '#selected-frame-label'
    );

  const frameButtons =
    Array.from(
      root.querySelectorAll<HTMLButtonElement>(
        '[data-frame]'
      )
    );

  const contextImages =
    Array.from(
      root.querySelectorAll<HTMLImageElement>(
        '[data-context-image]'
      )
    );

  let currentFrame = 'noir';


  const updateFrame = (): void => {
    if (mainImage) {
      mainImage.src =
        `${base}/${currentFrame}/Simple.webp`;
    }

    frameButtons.forEach((button) => {
      const active =
        button.dataset.frame === currentFrame;

      button.classList.toggle(
        'is-active',
        active
      );

      button.setAttribute(
        'aria-pressed',
        String(active)
      );

      if (active && frameLabel) {
        frameLabel.textContent =
          button.dataset.label || '';
      }
    });

    contextImages.forEach((image) => {
      const file =
        image.dataset.file;

      if (file) {
        image.src =
          `${base}/${currentFrame}/${file}`;
      }
    });
  };


  frameButtons.forEach((button) => {
    button.addEventListener('click', () => {
      currentFrame =
        button.dataset.frame || 'noir';

      updateFrame();
    });
  });


  /* ========================================================
     PARTAGE DE LA MISE EN SITUATION
     ======================================================== */

  const shareButton =
    root.querySelector<HTMLButtonElement>(
      '#share-artwork'
    );

  const shareStatus =
    root.querySelector<HTMLElement>(
      '#share-status'
    );

  const shareViewButtons =
    Array.from(
      root.querySelectorAll<HTMLButtonElement>(
        '[data-share-view]'
      )
    );

  let currentShareView =
    shareViewButtons[0]?.dataset.shareView ||
    'Bedroom-Modern-White-2.webp';


  const setShareStatus = (
    message: string
  ): void => {
    if (!shareStatus) return;

    shareStatus.textContent = message;

    window.setTimeout(() => {
      shareStatus.textContent = '';
    }, 5000);
  };


  shareViewButtons.forEach((button) => {
    button.addEventListener('click', () => {
      currentShareView =
        button.dataset.shareView ||
        'Bedroom-Modern-White-2.webp';

      shareViewButtons.forEach((item) => {
        const active =
          item === button;

        item.classList.toggle(
          'is-active',
          active
        );

        item.setAttribute(
          'aria-pressed',
          String(active)
        );
      });
    });
  });


  shareButton?.addEventListener(
    'click',
    async () => {
      const title =
        shareButton.dataset.title ||
        'Aupositeur';

      const quote =
        shareButton.dataset.quote || '';

      const slug =
        shareButton.dataset.slug ||
        'aupositeur';

      const productUrl =
        `${window.location.origin}/boutique/${slug}/`;

      const imageUrl =
        `${base}/${currentFrame}/${currentShareView}`;

      try {
        shareButton.disabled = true;

        setShareStatus(
          'Préparation du partage…'
        );

        const response =
          await fetch(imageUrl);

        if (!response.ok) {
          throw new Error(
            'Image unavailable'
          );
        }

        const blob =
          await response.blob();

        const extension =
          blob.type === 'image/png'
            ? 'png'
            : 'webp';

        const file =
          new File(
            [blob],
            `aupositeur-${slug}-${currentFrame}.${extension}`,
            {
              type:
                blob.type ||
                'image/webp',
            }
          );

        if (
          navigator.share &&
          navigator.canShare?.({
            files: [file],
          })
        ) {
          await navigator.share({
            files: [file],
            title:
              `${title} — Aupositeur`,
            text:
              `${quote}\n\n` +
              `Découvrir l’œuvre : ${productUrl}`,
          });

          setShareStatus(
            'Partage envoyé.'
          );

          return;
        }

        await navigator.clipboard.writeText(
          `${quote}\n\n` +
          `Découvrir l’œuvre : ${productUrl}`
        );

        setShareStatus(
          'Lien de la publication copié.'
        );
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === 'AbortError'
        ) {
          setShareStatus('');
        } else {
          console.error(error);

          setShareStatus(
            'Le partage direct n’est pas disponible dans ce navigateur.'
          );
        }
      } finally {
        shareButton.disabled = false;
      }
    }
  );


  updateFrame();
};


initBoutiqueProduct();

document.addEventListener(
  'astro:page-load',
  initBoutiqueProduct
);
