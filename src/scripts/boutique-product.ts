import { addCartItem } from './boutique-cart';

type GelatoVariant = {
  productUid?: string;
  title?: string;
  variantOptions?: Array<{
    name?: string;
    value?: string;
  }>;
};

type GelatoTemplateResponse = {
  id?: string;
  variants?: GelatoVariant[];
};

const FRAME_VALUE_TO_ID: Record<string, string> = {
  'Cadre blanc': 'blanc',
  'Cadre noir': 'noir',
  'Cadre en bois': 'bois',
  'Cadre en bois foncé': 'bois-fonce',
};

const makeAutoSku = (slug: string, frameId: string): string =>
  `AUP-AFF-${slug.replace(/[^a-z0-9]+/gi, '-').toUpperCase()}-${frameId.replace(/[^a-z0-9]+/gi, '-').toUpperCase()}`;

const initBoutiqueProduct = async (): Promise<void> => {
  const root = document.querySelector<HTMLElement>('[data-product]');

  if (!root || root.dataset.ready === 'true') {
    return;
  }

  root.dataset.ready = 'true';

  const base = root.dataset.base || '';
  const templateId = root.dataset.gelatoTemplateId || '';
  const apiBase = root.dataset.shopApi || '';
  const productSlug = root.dataset.productSlug || '';

  root
    .querySelectorAll<HTMLImageElement>('.ap-product__art img, .ap-product__context img')
    .forEach((image) => {
      image.addEventListener('contextmenu', (event) => event.preventDefault());
      image.addEventListener('dragstart', (event) => event.preventDefault());
    });

  const updateSelectedVariant = (button?: HTMLButtonElement): void => {
    root.dataset.selectedSku = button?.dataset.shopVariant || '';
    root.dataset.selectedGelatoProductUid = button?.dataset.gelatoProductUid || '';
  };

  const frameButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>('[data-frame]')
  );

  if (frameButtons.length > 0 && templateId && apiBase) {
    try {
      const response = await fetch(
        `${apiBase}/gelato/template/${encodeURIComponent(templateId)}`,
        { method: 'GET' }
      );

      if (response.ok) {
        const data = (await response.json()) as GelatoTemplateResponse;

        for (const variant of data.variants || []) {
          const frameValue = variant.variantOptions?.find(
            (option) => option.name === 'Cadre'
          )?.value;

          const frameId = frameValue ? FRAME_VALUE_TO_ID[frameValue] : undefined;

          if (!frameId || !variant.productUid) {
            continue;
          }

          const button = frameButtons.find(
            (item) => item.dataset.frame === frameId
          );

          if (!button) {
            continue;
          }

          button.dataset.gelatoProductUid = variant.productUid;

          if (!button.dataset.shopVariant) {
            button.dataset.shopVariant = makeAutoSku(productSlug, frameId);
          }

          button.disabled = false;
        }
      }
    } catch (error) {
      console.warn('Gelato variant sync unavailable; using CMS fallback.', error);
    }
  }

  const mainImage = root.querySelector<HTMLImageElement>('#product-main-image');
  const frameLabel = root.querySelector<HTMLElement>('#selected-frame-label');
  const contextImages = Array.from(
    root.querySelectorAll<HTMLImageElement>('[data-context-image]')
  );

  let currentFrame = 'noir';

  const updateFrame = (): void => {
    if (base && mainImage) {
      mainImage.src = `${base}/${currentFrame}/Simple.webp`;
    }

    frameButtons.forEach((button) => {
      const active = button.dataset.frame === currentFrame;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));

      if (active && frameLabel) {
        frameLabel.textContent = button.dataset.label || '';
      }
    });

    const activeFrame = frameButtons.find(
      (button) => button.dataset.frame === currentFrame
    );

    updateSelectedVariant(activeFrame);

    if (mainImage && activeFrame?.dataset.label) {
      const artwork = mainImage.alt.split(', cadre ')[0];
      mainImage.alt = `${artwork}, cadre ${activeFrame.dataset.label.toLowerCase()}`;
    }

    if (base) {
      contextImages.forEach((image) => {
        const file = image.dataset.file;
        if (file) {
          image.src = `${base}/${currentFrame}/${file}`;
        }
      });
    }
  };

  frameButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (button.disabled) return;
      currentFrame = button.dataset.frame || 'noir';
      updateFrame();
    });
  });

  const genericVariantButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>('[data-shop-variant]:not([data-frame])')
  );

  genericVariantButtons.forEach((button) => {
    button.addEventListener('click', () => {
      genericVariantButtons.forEach((item) => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      updateSelectedVariant(button);
    });
  });

  if (frameButtons.length > 0) {
    const initialFrame = frameButtons.find(
      (button) => button.dataset.frame === currentFrame && !button.disabled
    ) || frameButtons.find((button) => !button.disabled);

    if (initialFrame?.dataset.frame) {
      currentFrame = initialFrame.dataset.frame;
    }

    updateFrame();
  } else if (genericVariantButtons.length > 0) {
    updateSelectedVariant(genericVariantButtons[0]);
  }

  const shareButton = root.querySelector<HTMLButtonElement>('#share-artwork');
  const shareStatus = root.querySelector<HTMLElement>('#share-status');
  const shareViewButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>('[data-share-view]')
  );

  let currentShareView =
    shareViewButtons[0]?.dataset.shareView || 'Bedroom-Modern-White-2.webp';

  const setShareStatus = (message: string): void => {
    if (!shareStatus) return;
    shareStatus.textContent = message;
    window.setTimeout(() => {
      shareStatus.textContent = '';
    }, 5000);
  };

  shareViewButtons.forEach((button) => {
    button.addEventListener('click', () => {
      currentShareView =
        button.dataset.shareView || 'Bedroom-Modern-White-2.webp';

      shareViewButtons.forEach((item) => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', String(active));
      });
    });
  });

  shareButton?.addEventListener('click', async () => {
    if (!base) return;

    const title = shareButton.dataset.title || 'Aupositeur';
    const quote = shareButton.dataset.quote || '';
    const slug = shareButton.dataset.slug || 'aupositeur';
    const productUrl = `${window.location.origin}/boutique/${slug}/`;
    const imageUrl = `${base}/${currentFrame}/${currentShareView}`;

    try {
      shareButton.disabled = true;
      setShareStatus('Préparation du partage…');

      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error('Image unavailable');

      const blob = await response.blob();
      const extension = blob.type === 'image/png' ? 'png' : 'webp';
      const file = new File(
        [blob],
        `aupositeur-${slug}-${currentFrame}.${extension}`,
        { type: blob.type || 'image/webp' }
      );

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${title} — Aupositeur`,
          text: `${quote}\n\nDécouvrir l’œuvre : ${productUrl}`,
        });
        setShareStatus('Partage envoyé.');
        return;
      }

      await navigator.clipboard.writeText(
        `${quote}\n\nDécouvrir l’œuvre : ${productUrl}`
      );
      setShareStatus('Lien de la publication copié.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setShareStatus('');
      } else {
        console.error(error);
        setShareStatus('Le partage direct n’est pas disponible dans ce navigateur.');
      }
    } finally {
      shareButton.disabled = false;
    }
  });

  const testMode = new URLSearchParams(window.location.search).get('shopTest') === '1';
  const actionButton = root.querySelector<HTMLButtonElement>('[data-shop-action]');
  const shopStatus = root.querySelector<HTMLElement>('[data-shop-status]');

  if (testMode && actionButton && apiBase) {
    actionButton.disabled = false;
    actionButton.textContent = 'Tester la sélection — aucune commande';

    if (shopStatus) {
      shopStatus.textContent = 'Mode test : aucune commande Gelato ne sera créée.';
    }

    actionButton.addEventListener('click', async () => {
      const productUid = root.dataset.selectedGelatoProductUid || '';

      if (!templateId || !productUid) {
        if (shopStatus) shopStatus.textContent = 'Variante Gelato incomplète.';
        return;
      }

      actionButton.disabled = true;

      try {
        const response = await fetch(`${apiBase}/orders/prepare`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            mode: 'dry-run',
            templateId,
            productUid,
            sku: root.dataset.selectedSku || '',
            productSlug,
            productTitle: root.dataset.productTitle || '',
            quantity: 1,
            currency: root.dataset.productCurrency || 'EUR',
            unitPrice: Number(root.dataset.productPrice || '0'),
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || 'Order preparation failed');
        }

        console.info('Aupositeur shop dry-run', data);

        if (shopStatus) {
          shopStatus.textContent = 'Sélection validée par le Worker. Aucune commande créée.';
        }
      } catch (error) {
        console.error(error);
        if (shopStatus) {
          shopStatus.textContent = 'Le test Worker a échoué. Aucune commande créée.';
        }
      } finally {
        actionButton.disabled = false;
      }
    });
  } else if (actionButton) {
    actionButton.disabled = false;
    actionButton.textContent = 'Ajouter au panier';

    if (shopStatus) {
      shopStatus.textContent = 'Sélectionnez votre cadre puis ajoutez l’affiche au panier.';
    }

    actionButton.addEventListener('click', () => {
      const productUid = root.dataset.selectedGelatoProductUid || '';
      const sku = root.dataset.selectedSku || '';
      const activeFrame = frameButtons.find(
        (button) => button.dataset.frame === currentFrame
      );
      const variantLabel = activeFrame?.dataset.label || 'Sélection';

      if (!templateId || !productUid || !sku || !productSlug) {
        if (shopStatus) {
          shopStatus.textContent = 'Cette variante n’est pas encore disponible.';
        }
        return;
      }

      addCartItem({
        key: `${productSlug}:${sku}`,
        sku,
        gelatoProductUid: productUid,
        gelatoTemplateId: templateId,
        productSlug,
        productTitle: root.dataset.productTitle || productSlug,
        variantLabel,
        frameId: currentFrame,
        quantity: 1,
        currency: root.dataset.productCurrency || 'EUR',
        unitPrice: Number(root.dataset.productPrice || '0'),
        image: `${base}/${currentFrame}/Simple.webp`,
      });

      window.location.href = '/panier/';
    });
  }
};

void initBoutiqueProduct();

document.addEventListener('astro:page-load', () => {
  void initBoutiqueProduct();
});
