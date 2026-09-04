const ALLOWED_ORIGINS = new Set([
  'https://www.aupositeur.be',
  'https://aupositeur.be',
  'https://aupositeur-site.pages.dev',
]);

const GELATO_STORE_ID = '565a8f41-3e29-47c8-8432-319246913ef4';
const AMES_TEMPLATE_ID = 'e529f113-596b-42d0-ac66-a63f9968c71b';
const AUTO_MOCKUP_TEMPLATE = 'framed-30x40-v1';
const AUTO_MOCKUP_TEMPLATE_KEY = `mockup-templates/${AUTO_MOCKUP_TEMPLATE}.png`;
const MAX_PRINT_FILE_BYTES = 50 * 1024 * 1024;

const PRINT_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/tiff',
  'application/pdf',
]);

// Coordinates measured on the canonical 1536 × 1024 Aupositeur scene template.
// The four openings are front-facing and keep the artwork itself unmodified.
const FRAMED_30X40_REGIONS = [
  { left: 270, top: 56, width: 118, height: 157 },
  { left: 1193, top: 54, width: 126, height: 168 },
  { left: 394, top: 486, width: 114, height: 152 },
  { left: 1149, top: 484, width: 118, height: 157 },
];

const json = (data, status = 200, origin = '') => {
  const headers = {
    'content-type': 'application/json; charset=UTF-8',
    'cache-control': 'no-store',
  };

  if (ALLOWED_ORIGINS.has(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers.vary = 'Origin';
  }

  return new Response(JSON.stringify(data, null, 2), { status, headers });
};

const gelatoHeaders = (apiKey) => ({
  'X-API-KEY': apiKey,
  'Content-Type': 'application/json',
});

const readGelatoResponse = async (response) => {
  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Gelato API error ${response.status}`);
  }

  return data;
};

const getTemplate = async (templateId, apiKey) => {
  const response = await fetch(
    `https://ecommerce.gelatoapis.com/v1/templates/${encodeURIComponent(templateId)}`,
    { method: 'GET', headers: gelatoHeaders(apiKey) },
  );
  return readGelatoResponse(response);
};

const listStoreProducts = async (apiKey) => {
  const response = await fetch(
    `https://ecommerce.gelatoapis.com/v1/stores/${GELATO_STORE_ID}/products?order=desc&orderBy=createdAt&offset=0&limit=100`,
    { method: 'GET', headers: gelatoHeaders(apiKey) },
  );
  return readGelatoResponse(response);
};

const getStoreProduct = async (productId, apiKey) => {
  const response = await fetch(
    `https://ecommerce.gelatoapis.com/v1/stores/${GELATO_STORE_ID}/products/${encodeURIComponent(productId)}`,
    { method: 'GET', headers: gelatoHeaders(apiKey) },
  );
  return readGelatoResponse(response);
};

const createAmesStoreProduct = async (apiKey) => {
  const response = await fetch(
    `https://ecommerce.gelatoapis.com/v1/stores/${GELATO_STORE_ID}/products:create-from-template`,
    {
      method: 'POST',
      headers: gelatoHeaders(apiKey),
      body: JSON.stringify({
        templateId: AMES_TEMPLATE_ID,
        title: 'Âmes',
        description:
          'Affiche encadrée Aupositeur — D’une manière ou d’une autre, nos âmes continueront à parler entre elles.',
        isVisibleInTheOnlineStore: false,
        tags: ['aupositeur', 'ames'],
        productType: 'Affiche encadrée',
        vendor: 'Aupositeur',
      }),
    },
  );
  return readGelatoResponse(response);
};

const isAdmin = (request, env) => {
  const provided = request.headers.get('X-Aupositeur-Admin') || '';
  return Boolean(env.SHOP_ADMIN_TOKEN) && provided === env.SHOP_ADMIN_TOKEN;
};

const safeFilename = (name) =>
  String(name || 'master')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100) || 'master';

const makePrintKey = (name) => {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `print-masters/${year}/${month}/${crypto.randomUUID()}-${safeFilename(name)}`;
};

const mockupKeyFromPrintKey = (printKey) => {
  const withoutPrefix = printKey.replace(/^print-masters\//, '');
  const withoutExt = withoutPrefix.replace(/\.[^.]+$/, '');
  return `mockups/${withoutExt}-${AUTO_MOCKUP_TEMPLATE}.webp`;
};

const renderAutoMockup = async (env, printKey) => {
  if (!env.IMAGES || !env.SHOP_ASSETS) {
    throw new Error('Cloudflare Images or R2 binding is missing');
  }

  const [baseObject, printObject] = await Promise.all([
    env.SHOP_ASSETS.get(AUTO_MOCKUP_TEMPLATE_KEY),
    env.SHOP_ASSETS.get(printKey),
  ]);

  if (!baseObject) throw new Error('Aupositeur mockup template is not installed');
  if (!printObject) throw new Error('Print master not found');

  const baseBytes = await baseObject.arrayBuffer();
  const printBytes = await printObject.arrayBuffer();

  const info = await env.IMAGES.info(new Uint8Array(printBytes));
  const ratio = info?.width && info?.height ? info.width / info.height : null;

  // A 30 × 40 vertical artwork has a 0.75 ratio. We keep a little tolerance
  // for masters that include bleed.
  if (ratio && (ratio < 0.68 || ratio > 0.82)) {
    throw new Error(`Unexpected print-master ratio ${ratio.toFixed(3)} for a 30 × 40 poster`);
  }

  let composition = env.IMAGES.input(new Uint8Array(baseBytes));

  for (const region of FRAMED_30X40_REGIONS) {
    const overlay = env.IMAGES
      .input(new Uint8Array(printBytes.slice(0)))
      .transform({
        width: region.width,
        height: region.height,
        fit: 'cover',
      });

    composition = composition.draw(overlay, {
      left: region.left,
      top: region.top,
    });
  }

  const output = await composition.output({
    format: 'image/webp',
    quality: 88,
  });

  const response = output.response();
  const bytes = await response.arrayBuffer();
  const mockupKey = mockupKeyFromPrintKey(printKey);

  await env.SHOP_ASSETS.put(mockupKey, bytes, {
    httpMetadata: { contentType: 'image/webp' },
    customMetadata: {
      sourcePrintKey: printKey,
      template: AUTO_MOCKUP_TEMPLATE,
      generatedAt: new Date().toISOString(),
    },
  });

  return { key: mockupKey, bytes: bytes.byteLength };
};

const publicMockupUrl = (request, key) => {
  const url = new URL(request.url);
  return `${url.origin}/media/${key}`;
};

const handlePrintUpload = async (request, env, origin) => {
  if (!env.SHOP_ASSETS) {
    return json({ error: 'R2 binding SHOP_ASSETS is missing' }, 503, origin);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Invalid multipart form data' }, 400, origin);
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return json({ error: 'Missing file' }, 400, origin);
  }

  if (!PRINT_MIME_TYPES.has(file.type)) {
    return json({ error: 'Unsupported print-master format' }, 415, origin);
  }

  if (file.size <= 0 || file.size > MAX_PRINT_FILE_BYTES) {
    return json({ error: 'Print master must be between 1 byte and 50 MB' }, 413, origin);
  }

  const key = makePrintKey(file.name);

  await env.SHOP_ASSETS.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: {
      originalName: file.name,
      kind: 'print-master',
      uploadedAt: new Date().toISOString(),
    },
  });

  let mockup = null;
  let mockupError = null;

  if (file.type.startsWith('image/')) {
    try {
      mockup = await renderAutoMockup(env, key);
    } catch (error) {
      mockupError = error instanceof Error ? error.message : 'Automatic mockup failed';
    }
  }

  return json(
    {
      ok: true,
      key,
      name: file.name,
      mime: file.type,
      bytes: file.size,
      private: true,
      mockup: mockup
        ? {
            key: mockup.key,
            url: publicMockupUrl(request, mockup.key),
            bytes: mockup.bytes,
            template: AUTO_MOCKUP_TEMPLATE,
          }
        : null,
      mockupError,
    },
    201,
    origin,
  );
};

const handleMockupTemplateUpload = async (request, env, origin) => {
  if (!env.SHOP_ASSETS) {
    return json({ error: 'R2 binding SHOP_ASSETS is missing' }, 503, origin);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Invalid multipart form data' }, 400, origin);
  }

  const file = form.get('file');
  if (!(file instanceof File) || file.type !== 'image/png') {
    return json({ error: 'The canonical mockup template must be a PNG file' }, 400, origin);
  }

  await env.SHOP_ASSETS.put(AUTO_MOCKUP_TEMPLATE_KEY, file.stream(), {
    httpMetadata: { contentType: 'image/png' },
    customMetadata: {
      template: AUTO_MOCKUP_TEMPLATE,
      expectedCanvas: '1536x1024',
      updatedAt: new Date().toISOString(),
    },
  });

  return json(
    {
      ok: true,
      template: AUTO_MOCKUP_TEMPLATE,
      key: AUTO_MOCKUP_TEMPLATE_KEY,
      bytes: file.size,
    },
    201,
    origin,
  );
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      if (!ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403 });

      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'Content-Type, X-Aupositeur-Admin',
          'access-control-max-age': '86400',
          vary: 'Origin',
        },
      });
    }

    if (url.pathname === '/') {
      return json(
        {
          service: 'aupositeur-shop-api',
          status: 'ok',
          orderMode: 'dry-run',
          printStorage: Boolean(env.SHOP_ASSETS),
          imageRendering: Boolean(env.IMAGES),
          mockupTemplate: AUTO_MOCKUP_TEMPLATE,
        },
        200,
        origin,
      );
    }

    // Public, read-only mockup delivery. Print masters are never exposed here.
    if (request.method === 'GET' && url.pathname.startsWith('/media/mockups/')) {
      if (!env.SHOP_ASSETS) return new Response('Not found', { status: 404 });
      const key = url.pathname.slice('/media/'.length);
      const object = await env.SHOP_ASSETS.get(key);
      if (!object) return new Response('Not found', { status: 404 });

      return new Response(object.body, {
        headers: {
          'content-type': object.httpMetadata?.contentType || 'image/webp',
          'cache-control': 'public, max-age=31536000, immutable',
          etag: object.httpEtag,
        },
      });
    }

    if (request.method === 'GET' && url.pathname.startsWith('/gelato/template/')) {
      const templateId = url.pathname.split('/').pop();
      if (!templateId) return json({ error: 'Missing template ID' }, 400, origin);

      try {
        const template = await getTemplate(templateId, env.GELATO_API_KEY);
        return json(
          {
            id: template.id,
            title: template.title,
            templateName: template.templateName,
            previewUrl: template.previewUrl || null,
            variants: (template.variants || []).map((variant) => ({
              id: variant.id || null,
              title: variant.title || null,
              productUid: variant.productUid || null,
              variantOptions: variant.variantOptions || [],
              imagePlaceholders: (variant.imagePlaceholders || []).map((placeholder) => ({
                name: placeholder.name || null,
                printArea: placeholder.printArea || null,
              })),
            })),
          },
          200,
          origin,
        );
      } catch (error) {
        return json(
          { error: error instanceof Error ? error.message : 'Gelato template lookup failed' },
          502,
          origin,
        );
      }
    }

    if (request.method === 'POST' && url.pathname === '/orders/prepare') {
      let input;
      try {
        input = await request.json();
      } catch {
        return json({ error: 'Invalid JSON body' }, 400, origin);
      }

      if (input?.mode !== 'dry-run') {
        return json(
          { error: 'Only dry-run mode is enabled. No Gelato order can be created.' },
          403,
          origin,
        );
      }

      if (!input.templateId || !input.productUid) {
        return json({ error: 'templateId and productUid are required' }, 400, origin);
      }

      try {
        const template = await getTemplate(input.templateId, env.GELATO_API_KEY);
        const selectedVariant = (template.variants || []).find(
          (variant) => variant.productUid === input.productUid,
        );

        if (!selectedVariant) {
          return json(
            { error: 'Selected productUid does not belong to this Gelato template' },
            400,
            origin,
          );
        }

        return json(
          {
            ok: true,
            mode: 'dry-run',
            gelatoOrderCreated: false,
            validated: {
              templateId: template.id,
              templateName: template.templateName || template.title,
              productUid: selectedVariant.productUid,
              variantTitle: selectedVariant.title,
              variantOptions: selectedVariant.variantOptions || [],
            },
            selection: {
              sku: input.sku || null,
              productSlug: input.productSlug || null,
              productTitle: input.productTitle || null,
              quantity: input.quantity || 1,
              currency: input.currency || 'EUR',
              unitPrice: input.unitPrice ?? null,
            },
            nextRequiredForGelatoDraft: [
              'shippingAddress',
              'print file(s)',
              'internal order/customer references',
            ],
          },
          200,
          origin,
        );
      } catch (error) {
        return json(
          { error: error instanceof Error ? error.message : 'Order preparation failed' },
          502,
          origin,
        );
      }
    }

    if (url.pathname.startsWith('/admin/')) {
      if (!isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401, origin);

      if (request.method === 'POST' && url.pathname === '/admin/print-files/upload') {
        return handlePrintUpload(request, env, origin);
      }

      if (request.method === 'POST' && url.pathname === '/admin/mockup-templates/upload') {
        return handleMockupTemplateUpload(request, env, origin);
      }

      if (request.method === 'GET' && url.pathname === '/admin/mockup-templates/status') {
        const object = env.SHOP_ASSETS ? await env.SHOP_ASSETS.head(AUTO_MOCKUP_TEMPLATE_KEY) : null;
        return json(
          {
            ok: true,
            template: AUTO_MOCKUP_TEMPLATE,
            installed: Boolean(object),
            key: AUTO_MOCKUP_TEMPLATE_KEY,
            bytes: object?.size ?? null,
          },
          200,
          origin,
        );
      }

      if (request.method === 'GET' && url.pathname === '/admin/gelato/store-products') {
        try {
          const data = await listStoreProducts(env.GELATO_API_KEY);
          return json({ ok: true, storeId: GELATO_STORE_ID, products: data?.products || [] }, 200, origin);
        } catch (error) {
          return json(
            { error: error instanceof Error ? error.message : 'Unable to list Gelato products' },
            502,
            origin,
          );
        }
      }

      if (request.method === 'POST' && url.pathname === '/admin/gelato/ames/create') {
        let input;
        try {
          input = await request.json();
        } catch {
          return json({ error: 'Invalid JSON body' }, 400, origin);
        }

        if (input?.confirmation !== 'CREATE_AMES_STORE_PRODUCT') {
          return json({ error: 'Missing explicit creation confirmation' }, 400, origin);
        }

        try {
          const existingData = await listStoreProducts(env.GELATO_API_KEY);
          const existingAmes = (existingData?.products || []).find((product) => {
            const title = String(product?.title || '').trim().toLocaleLowerCase('fr');
            return title === 'âmes' || title === 'ames';
          });

          if (existingAmes) {
            const fullExisting = await getStoreProduct(existingAmes.id, env.GELATO_API_KEY);
            return json(
              {
                ok: true,
                created: false,
                alreadyExists: true,
                message: 'Âmes already exists in the Gelato Aupositeur store.',
                product: fullExisting,
              },
              200,
              origin,
            );
          }

          const created = await createAmesStoreProduct(env.GELATO_API_KEY);
          return json(
            {
              ok: true,
              created: true,
              gelatoOrderCreated: false,
              storeId: GELATO_STORE_ID,
              templateId: AMES_TEMPLATE_ID,
              product: created,
            },
            201,
            origin,
          );
        } catch (error) {
          return json(
            { error: error instanceof Error ? error.message : 'Gelato Store Product creation failed' },
            502,
            origin,
          );
        }
      }

      if (request.method === 'GET' && url.pathname.startsWith('/admin/gelato/store-products/')) {
        const productId = url.pathname.split('/').pop();
        if (!productId) return json({ error: 'Missing product ID' }, 400, origin);

        try {
          const product = await getStoreProduct(productId, env.GELATO_API_KEY);
          return json({ ok: true, diagnosticMode: true, product }, 200, origin);
        } catch (error) {
          return json(
            { error: error instanceof Error ? error.message : 'Unable to read Gelato product' },
            502,
            origin,
          );
        }
      }
    }

    return json({ error: 'Not found' }, 404, origin);
  },
};
