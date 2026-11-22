var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// index.js
var ALLOWED_ORIGINS = /* @__PURE__ */ new Set([
  "https://www.aupositeur.be",
  "https://aupositeur.be",
  "https://aupositeur-site.pages.dev"
]);
var GELATO_STORE_ID = "565a8f41-3e29-47c8-8432-319246913ef4";
var AMES_TEMPLATE_ID = "e529f113-596b-42d0-ac66-a63f9968c71b";
var AUTO_MOCKUP_TEMPLATE = "framed-30x40-v1";
var AUTO_MOCKUP_TEMPLATE_KEY = `mockup-templates/${AUTO_MOCKUP_TEMPLATE}.png`;
var MAX_PRINT_FILE_BYTES = 50 * 1024 * 1024;
var PRINT_MIME_TYPES = /* @__PURE__ */ new Set([
  "image/png",
  "image/jpeg",
  "image/tiff",
  "application/pdf"
]);
var FRAMED_30X40_REGIONS = [
  { left: 310, top: 50, width: 238, height: 317 },
  { left: 1040, top: 31, width: 244, height: 325 },
  { left: 316, top: 553, width: 234, height: 312 },
  { left: 1056, top: 556, width: 234, height: 312 }
];
var json = /* @__PURE__ */ __name((data, status = 200, origin = "") => {
  const headers = {
    "content-type": "application/json; charset=UTF-8",
    "cache-control": "no-store"
  };
  if (ALLOWED_ORIGINS.has(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers.vary = "Origin";
  }
  return new Response(JSON.stringify(data, null, 2), { status, headers });
}, "json");
var gelatoHeaders = /* @__PURE__ */ __name((apiKey) => ({
  "X-API-KEY": apiKey,
  "Content-Type": "application/json"
}), "gelatoHeaders");
var readGelatoResponse = /* @__PURE__ */ __name(async (response) => {
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
}, "readGelatoResponse");
var getTemplate = /* @__PURE__ */ __name(async (templateId, apiKey) => {
  const response = await fetch(
    `https://ecommerce.gelatoapis.com/v1/templates/${encodeURIComponent(templateId)}`,
    { method: "GET", headers: gelatoHeaders(apiKey) }
  );
  return readGelatoResponse(response);
}, "getTemplate");
var listStoreProducts = /* @__PURE__ */ __name(async (apiKey) => {
  const response = await fetch(
    `https://ecommerce.gelatoapis.com/v1/stores/${GELATO_STORE_ID}/products?order=desc&orderBy=createdAt&offset=0&limit=100`,
    { method: "GET", headers: gelatoHeaders(apiKey) }
  );
  return readGelatoResponse(response);
}, "listStoreProducts");
var getStoreProduct = /* @__PURE__ */ __name(async (productId, apiKey) => {
  const response = await fetch(
    `https://ecommerce.gelatoapis.com/v1/stores/${GELATO_STORE_ID}/products/${encodeURIComponent(productId)}`,
    { method: "GET", headers: gelatoHeaders(apiKey) }
  );
  return readGelatoResponse(response);
}, "getStoreProduct");
var createAmesStoreProduct = /* @__PURE__ */ __name(async (apiKey) => {
  const response = await fetch(
    `https://ecommerce.gelatoapis.com/v1/stores/${GELATO_STORE_ID}/products:create-from-template`,
    {
      method: "POST",
      headers: gelatoHeaders(apiKey),
      body: JSON.stringify({
        templateId: AMES_TEMPLATE_ID,
        title: "\xC2mes",
        description: "Affiche encadr\xE9e Aupositeur \u2014 D\u2019une mani\xE8re ou d\u2019une autre, nos \xE2mes continueront \xE0 parler entre elles.",
        isVisibleInTheOnlineStore: false,
        tags: ["aupositeur", "ames"],
        productType: "Affiche encadr\xE9e",
        vendor: "Aupositeur"
      })
    }
  );
  return readGelatoResponse(response);
}, "createAmesStoreProduct");
var isAdmin = /* @__PURE__ */ __name((request, env) => {
  const provided = request.headers.get("X-Aupositeur-Admin") || "";
  return Boolean(env.SHOP_ADMIN_TOKEN) && provided === env.SHOP_ADMIN_TOKEN;
}, "isAdmin");
var safeFilename = /* @__PURE__ */ __name((name) => String(name || "master").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "master", "safeFilename");
var makePrintKey = /* @__PURE__ */ __name((name) => {
  const now = /* @__PURE__ */ new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `print-masters/${year}/${month}/${crypto.randomUUID()}-${safeFilename(name)}`;
}, "makePrintKey");
var mockupKeyFromPrintKey = /* @__PURE__ */ __name((printKey) => {
  const withoutPrefix = printKey.replace(/^print-masters\//, "");
  const withoutExt = withoutPrefix.replace(/\.[^.]+$/, "");
  return `mockups/${withoutExt}-${AUTO_MOCKUP_TEMPLATE}.webp`;
}, "mockupKeyFromPrintKey");
var renderAutoMockup = /* @__PURE__ */ __name(async (env, printKey) => {
  if (!env.IMAGES || !env.SHOP_ASSETS) {
    throw new Error("Cloudflare Images or R2 binding is missing");
  }
  const [baseObject, printObject] = await Promise.all([
    env.SHOP_ASSETS.get(AUTO_MOCKUP_TEMPLATE_KEY),
    env.SHOP_ASSETS.get(printKey)
  ]);
  if (!baseObject) throw new Error("Aupositeur mockup template is not installed");
  if (!printObject) throw new Error("Print master not found");
  const baseBytes = await baseObject.arrayBuffer();
  const printBytes = await printObject.arrayBuffer();
  const info = await env.IMAGES.info(new Uint8Array(printBytes));
  const ratio = info?.width && info?.height ? info.width / info.height : null;
  if (ratio && (ratio < 0.68 || ratio > 0.82)) {
    throw new Error(`Unexpected print-master ratio ${ratio.toFixed(3)} for a 30 \xD7 40 poster`);
  }
  let composition = env.IMAGES.input(new Uint8Array(baseBytes));
  for (const region of FRAMED_30X40_REGIONS) {
    const overlay = env.IMAGES.input(new Uint8Array(printBytes.slice(0))).transform({
      width: region.width,
      height: region.height,
      fit: "cover"
    });
    composition = composition.draw(overlay, {
      left: region.left,
      top: region.top
    });
  }
  const output = await composition.output({
    format: "image/webp",
    quality: 88
  });
  const response = output.response();
  const bytes = await response.arrayBuffer();
  const mockupKey = mockupKeyFromPrintKey(printKey);
  await env.SHOP_ASSETS.put(mockupKey, bytes, {
    httpMetadata: { contentType: "image/webp" },
    customMetadata: {
      sourcePrintKey: printKey,
      template: AUTO_MOCKUP_TEMPLATE,
      generatedAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  });
  return { key: mockupKey, bytes: bytes.byteLength };
}, "renderAutoMockup");
var publicMockupUrl = /* @__PURE__ */ __name((request, key) => {
  const url = new URL(request.url);
  return `${url.origin}/media/${key}`;
}, "publicMockupUrl");
var handlePrintUpload = /* @__PURE__ */ __name(async (request, env, origin) => {
  if (!env.SHOP_ASSETS) {
    return json({ error: "R2 binding SHOP_ASSETS is missing" }, 503, origin);
  }
  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Invalid multipart form data" }, 400, origin);
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return json({ error: "Missing file" }, 400, origin);
  }
  if (!PRINT_MIME_TYPES.has(file.type)) {
    return json({ error: "Unsupported print-master format" }, 415, origin);
  }
  if (file.size <= 0 || file.size > MAX_PRINT_FILE_BYTES) {
    return json({ error: "Print master must be between 1 byte and 50 MB" }, 413, origin);
  }
  const key = makePrintKey(file.name);
  await env.SHOP_ASSETS.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: {
      originalName: file.name,
      kind: "print-master",
      uploadedAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  });
  let mockup = null;
  let mockupError = null;
  if (file.type.startsWith("image/")) {
    try {
      mockup = await renderAutoMockup(env, key);
    } catch (error) {
      mockupError = error instanceof Error ? error.message : "Automatic mockup failed";
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
      mockup: mockup ? {
        key: mockup.key,
        url: publicMockupUrl(request, mockup.key),
        bytes: mockup.bytes,
        template: AUTO_MOCKUP_TEMPLATE
      } : null,
      mockupError
    },
    201,
    origin
  );
}, "handlePrintUpload");
var handleMockupTemplateUpload = /* @__PURE__ */ __name(async (request, env, origin) => {
  if (!env.SHOP_ASSETS) {
    return json({ error: "R2 binding SHOP_ASSETS is missing" }, 503, origin);
  }
  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Invalid multipart form data" }, 400, origin);
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.type !== "image/png") {
    return json({ error: "The canonical mockup template must be a PNG file" }, 400, origin);
  }
  await env.SHOP_ASSETS.put(AUTO_MOCKUP_TEMPLATE_KEY, file.stream(), {
    httpMetadata: { contentType: "image/png" },
    customMetadata: {
      template: AUTO_MOCKUP_TEMPLATE,
      expectedCanvas: "1536x1024",
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  });
  return json(
    {
      ok: true,
      template: AUTO_MOCKUP_TEMPLATE,
      key: AUTO_MOCKUP_TEMPLATE_KEY,
      bytes: file.size
    },
    201,
    origin
  );
}, "handleMockupTemplateUpload");
var handleMockupRegenerate = /* @__PURE__ */ __name(async (request, env, origin) => {
  let input;
  try {
    input = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, origin);
  }
  const printFileKey = String(input?.printFileKey || "");
  if (!printFileKey.startsWith("print-masters/")) {
    return json({ error: "A valid printFileKey is required" }, 400, origin);
  }
  try {
    const mockup = await renderAutoMockup(env, printFileKey);
    return json(
      {
        ok: true,
        regenerated: true,
        printFileKey,
        mockup: {
          key: mockup.key,
          url: publicMockupUrl(request, mockup.key),
          bytes: mockup.bytes,
          template: AUTO_MOCKUP_TEMPLATE
        }
      },
      200,
      origin
    );
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Automatic mockup regeneration failed" },
      500,
      origin
    );
  }
}, "handleMockupRegenerate");
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") {
      if (!ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": origin,
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "Content-Type, X-Aupositeur-Admin",
          "access-control-max-age": "86400",
          vary: "Origin"
        }
      });
    }
    if (url.pathname === "/") {
      return json(
        {
          service: "aupositeur-shop-api",
          status: "ok",
          orderMode: "dry-run",
          printStorage: Boolean(env.SHOP_ASSETS),
          imageRendering: Boolean(env.IMAGES),
          mockupTemplate: AUTO_MOCKUP_TEMPLATE
        },
        200,
        origin
      );
    }
    if (request.method === "GET" && url.pathname.startsWith("/media/mockups/")) {
      if (!env.SHOP_ASSETS) return new Response("Not found", { status: 404 });
      const key = url.pathname.slice("/media/".length);
      const object = await env.SHOP_ASSETS.get(key);
      if (!object) return new Response("Not found", { status: 404 });
      return new Response(object.body, {
        headers: {
          "content-type": object.httpMetadata?.contentType || "image/webp",
          "cache-control": "public, max-age=60, must-revalidate",
          etag: object.httpEtag
        }
      });
    }
    if (request.method === "GET" && url.pathname.startsWith("/gelato/template/")) {
      const templateId = url.pathname.split("/").pop();
      if (!templateId) return json({ error: "Missing template ID" }, 400, origin);
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
                printArea: placeholder.printArea || null
              }))
            }))
          },
          200,
          origin
        );
      } catch (error) {
        return json(
          { error: error instanceof Error ? error.message : "Gelato template lookup failed" },
          502,
          origin
        );
      }
    }
    if (request.method === "POST" && url.pathname === "/orders/prepare") {
      let input;
      try {
        input = await request.json();
      } catch {
        return json({ error: "Invalid JSON body" }, 400, origin);
      }
      if (input?.mode !== "dry-run") {
        return json(
          { error: "Only dry-run mode is enabled. No Gelato order can be created." },
          403,
          origin
        );
      }
      if (!input.templateId || !input.productUid) {
        return json({ error: "templateId and productUid are required" }, 400, origin);
      }
      try {
        const template = await getTemplate(input.templateId, env.GELATO_API_KEY);
        const selectedVariant = (template.variants || []).find(
          (variant) => variant.productUid === input.productUid
        );
        if (!selectedVariant) {
          return json(
            { error: "Selected productUid does not belong to this Gelato template" },
            400,
            origin
          );
        }
        return json(
          {
            ok: true,
            mode: "dry-run",
            gelatoOrderCreated: false,
            validated: {
              templateId: template.id,
              templateName: template.templateName || template.title,
              productUid: selectedVariant.productUid,
              variantTitle: selectedVariant.title,
              variantOptions: selectedVariant.variantOptions || []
            },
            selection: {
              sku: input.sku || null,
              productSlug: input.productSlug || null,
              productTitle: input.productTitle || null,
              quantity: input.quantity || 1,
              currency: input.currency || "EUR",
              unitPrice: input.unitPrice ?? null
            },
            nextRequiredForGelatoDraft: [
              "shippingAddress",
              "print file(s)",
              "internal order/customer references"
            ]
          },
          200,
          origin
        );
      } catch (error) {
        return json(
          { error: error instanceof Error ? error.message : "Order preparation failed" },
          502,
          origin
        );
      }
    }
    if (url.pathname.startsWith("/admin/")) {
      if (!isAdmin(request, env)) return json({ error: "Unauthorized" }, 401, origin);
      if (request.method === "POST" && url.pathname === "/admin/print-files/upload") {
        return handlePrintUpload(request, env, origin);
      }
      if (request.method === "POST" && url.pathname === "/admin/mockup-templates/upload") {
        return handleMockupTemplateUpload(request, env, origin);
      }
      if (request.method === "POST" && url.pathname === "/admin/mockups/regenerate") {
        return handleMockupRegenerate(request, env, origin);
      }
      if (request.method === "GET" && url.pathname === "/admin/mockup-templates/status") {
        const object = env.SHOP_ASSETS ? await env.SHOP_ASSETS.head(AUTO_MOCKUP_TEMPLATE_KEY) : null;
        return json(
          {
            ok: true,
            template: AUTO_MOCKUP_TEMPLATE,
            installed: Boolean(object),
            key: AUTO_MOCKUP_TEMPLATE_KEY,
            bytes: object?.size ?? null
          },
          200,
          origin
        );
      }
      if (request.method === "GET" && url.pathname === "/admin/gelato/store-products") {
        try {
          const data = await listStoreProducts(env.GELATO_API_KEY);
          return json({ ok: true, storeId: GELATO_STORE_ID, products: data?.products || [] }, 200, origin);
        } catch (error) {
          return json(
            { error: error instanceof Error ? error.message : "Unable to list Gelato products" },
            502,
            origin
          );
        }
      }
      if (request.method === "POST" && url.pathname === "/admin/gelato/ames/create") {
        let input;
        try {
          input = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400, origin);
        }
        if (input?.confirmation !== "CREATE_AMES_STORE_PRODUCT") {
          return json({ error: "Missing explicit creation confirmation" }, 400, origin);
        }
        try {
          const existingData = await listStoreProducts(env.GELATO_API_KEY);
          const existingAmes = (existingData?.products || []).find((product) => {
            const title = String(product?.title || "").trim().toLocaleLowerCase("fr");
            return title === "\xE2mes" || title === "ames";
          });
          if (existingAmes) {
            const fullExisting = await getStoreProduct(existingAmes.id, env.GELATO_API_KEY);
            return json(
              {
                ok: true,
                created: false,
                alreadyExists: true,
                message: "\xC2mes already exists in the Gelato Aupositeur store.",
                product: fullExisting
              },
              200,
              origin
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
              product: created
            },
            201,
            origin
          );
        } catch (error) {
          return json(
            { error: error instanceof Error ? error.message : "Gelato Store Product creation failed" },
            502,
            origin
          );
        }
      }
      if (request.method === "GET" && url.pathname.startsWith("/admin/gelato/store-products/")) {
        const productId = url.pathname.split("/").pop();
        if (!productId) return json({ error: "Missing product ID" }, 400, origin);
        try {
          const product = await getStoreProduct(productId, env.GELATO_API_KEY);
          return json({ ok: true, diagnosticMode: true, product }, 200, origin);
        } catch (error) {
          return json(
            { error: error instanceof Error ? error.message : "Unable to read Gelato product" },
            502,
            origin
          );
        }
      }
    }
    return json({ error: "Not found" }, 404, origin);
  }
};

// shop-catalog.js
var FRAME_VARIANTS = {
  WHITE: {
    label: "Cadre blanc",
    productUid: "framed_poster_mounted_300x400-mm-12x16-inch_white_wood_w12xt22-mm_plexiglass_300x400-mm-12x16-inch_200-gsm-80lb-uncoated_4-0_ver"
  },
  BLACK: {
    label: "Cadre noir",
    productUid: "framed_poster_mounted_300x400-mm-12x16-inch_black_wood_w12xt22-mm_plexiglass_300x400-mm-12x16-inch_200-gsm-80lb-uncoated_4-0_ver"
  },
  "DARK-WOOD": {
    label: "Cadre en bois fonc\xE9",
    productUid: "framed_poster_mounted_300x400-mm-12x16-inch_dark-wood_wood_w12xt22-mm_plexiglass_300x400-mm-12x16-inch_200-gsm-80lb-uncoated_4-0_ver"
  },
  "NATURAL-WOOD": {
    label: "Cadre en bois",
    productUid: "framed_poster_mounted_300x400-mm-12x16-inch_natural-wood_wood_w12xt22-mm_plexiglass_300x400-mm-12x16-inch_200-gsm-80lb-uncoated_4-0_ver"
  }
};
var SHOP_CATALOG = {
  "le-pire": {
    title: "Le pire",
    skuPrefix: "AUP-AFF-LE-PIRE-",
    templateId: "6faf6e07-49ea-4ad1-809c-df456544ae2d",
    unitAmount: 6900,
    currency: "eur",
    printFileKey: "print-masters/2026/09/779b5669-01ef-4cda-97a2-80a44119a3df-TEST-DECAP-MEDIA.png"
  },
  ames: {
    title: "\xC2mes",
    skuPrefix: "AUP-AFF-AMES-",
    templateId: "e529f113-596b-42d0-ac66-a63f9968c71b",
    unitAmount: 6900,
    currency: "eur",
    printFileKey: "print-masters/2026/09/276704e4-58f7-491a-bfd9-60ff10655b4b-Cadre-Ame-01.png"
  },
  amore: {
    title: "Amore",
    skuPrefix: "AUP-AFF-AMORE-",
    templateId: "f145367d-53ab-4811-ade4-c28d6bcaaff2",
    unitAmount: 6900,
    currency: "eur",
    printFileKey: "print-masters/2026/09/79d3f089-2208-4f31-92bc-9383b5266a96-Cadre-Amore-02.png"
  },
  pretendre: {
    title: "Pr\xE9tendre",
    skuPrefix: "AUP-AFF-PRETENDRE-",
    templateId: "2db904b0-7b9f-45bf-a356-036be947bc25",
    unitAmount: 6900,
    currency: "eur",
    printFileKey: "print-masters/2026/09/75318350-6214-4312-b13d-1cdbb7c758d4-Cadre-pretendre.png"
  },
  "vie-parfaite": {
    title: "Vie parfaite",
    skuPrefix: "AUP-AFF-VIE-PARFAITE-",
    templateId: "06772389-b980-4910-92c8-a8e8af5a2bed",
    unitAmount: 6900,
    currency: "eur",
    printFileKey: "print-masters/2026/09/086bb7b9-0fbd-4f46-8c74-69fc76937064-Cadre-vie_parfaite.png"
  }
};
var resolveVariant = /* @__PURE__ */ __name((product, sku) => {
  if (!product || !sku.startsWith(product.skuPrefix)) return null;
  const suffix = sku.slice(product.skuPrefix.length);
  const frame = FRAME_VARIANTS[suffix];
  return frame ? { sku, suffix, ...frame } : null;
}, "resolveVariant");
var getFulfillmentReadiness = /* @__PURE__ */ __name(async (env, product) => {
  if (!product) return { ready: false, reason: "unknown_product", printFilePresent: false };
  if (!product.printFileKey) {
    return { ready: false, reason: "missing_print_file_configuration", printFilePresent: false };
  }
  if (!env.SHOP_ASSETS) {
    return { ready: false, reason: "shop_assets_binding_missing", printFilePresent: false };
  }
  const object = await env.SHOP_ASSETS.head(product.printFileKey);
  if (!object) {
    return { ready: false, reason: "print_master_not_found_in_r2", printFilePresent: false };
  }
  return {
    ready: true,
    reason: null,
    printFilePresent: true,
    printFileBytes: object.size
  };
}, "getFulfillmentReadiness");

// order-cart.js
var CART_SCHEMA = "cart-v1";
var MAX_DISTINCT_ITEMS = 10;
var MAX_ITEM_QUANTITY = 5;
var MAX_TOTAL_QUANTITY = 20;
var cleanString = /* @__PURE__ */ __name((value) => String(value || "").trim(), "cleanString");
var resolveOne = /* @__PURE__ */ __name((productSlug, sku, quantity) => {
  const product = SHOP_CATALOG[productSlug] || null;
  if (!product) return { error: "unknown_product", productSlug };
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ITEM_QUANTITY) {
    return { error: "invalid_quantity", productSlug };
  }
  const variant = resolveVariant(product, sku);
  if (!variant) return { error: "sku_mismatch", productSlug };
  return {
    item: {
      productSlug,
      sku: variant.sku,
      quantity,
      product,
      variant,
      unitAmount: product.unitAmount,
      currency: product.currency,
      lineAmount: product.unitAmount * quantity
    }
  };
}, "resolveOne");
var resolveCartInput = /* @__PURE__ */ __name((input) => {
  const rawItems = Array.isArray(input?.items) ? input.items : input?.productSlug ? [{
    productSlug: input.productSlug,
    sku: input.sku,
    quantity: input.quantity === void 0 ? 1 : input.quantity
  }] : [];
  if (rawItems.length < 1) {
    return { ok: false, status: 400, error: "Cart is empty", code: "empty_cart" };
  }
  if (rawItems.length > MAX_DISTINCT_ITEMS) {
    return { ok: false, status: 400, error: "Too many distinct cart items", code: "too_many_items" };
  }
  const merged = /* @__PURE__ */ new Map();
  for (const raw of rawItems) {
    const productSlug = cleanString(raw?.productSlug);
    const sku = cleanString(raw?.sku);
    const quantity = raw?.quantity === void 0 ? 1 : Number(raw.quantity);
    const key = `${productSlug}::${sku}`;
    const previous = merged.get(key) || { productSlug, sku, quantity: 0 };
    previous.quantity += quantity;
    merged.set(key, previous);
  }
  const items = [];
  let totalQuantity = 0;
  let amountTotal = 0;
  let currency = null;
  for (const raw of merged.values()) {
    const resolved = resolveOne(raw.productSlug, raw.sku, raw.quantity);
    if (resolved.error) {
      return {
        ok: false,
        status: 400,
        error: "Invalid cart item",
        code: resolved.error,
        productSlug: resolved.productSlug || raw.productSlug
      };
    }
    const item = resolved.item;
    if (currency && currency !== item.currency) {
      return { ok: false, status: 400, error: "Mixed currencies are not supported", code: "currency_mismatch" };
    }
    currency = item.currency;
    totalQuantity += item.quantity;
    amountTotal += item.lineAmount;
    items.push(item);
  }
  if (totalQuantity > MAX_TOTAL_QUANTITY) {
    return { ok: false, status: 400, error: "Cart quantity limit exceeded", code: "cart_quantity_limit" };
  }
  return { ok: true, items, totalQuantity, amountTotal, currency: currency || "eur" };
}, "resolveCartInput");
var writeCartMetadata = /* @__PURE__ */ __name((params, cart, orderReference) => {
  params.set("metadata[aupositeur_mode]", "test");
  params.set("metadata[order_reference]", orderReference);
  params.set("metadata[order_schema]", CART_SCHEMA);
  params.set("metadata[cart_count]", String(cart.items.length));
  params.set("metadata[cart_total_quantity]", String(cart.totalQuantity));
  cart.items.forEach((item, index) => {
    params.set(`metadata[cart_item_${index}_slug]`, item.productSlug);
    params.set(`metadata[cart_item_${index}_sku]`, item.sku);
    params.set(`metadata[cart_item_${index}_quantity]`, String(item.quantity));
  });
}, "writeCartMetadata");
var readCartFromSession = /* @__PURE__ */ __name((session) => {
  const metadata = session?.metadata || {};
  if (metadata.order_schema === CART_SCHEMA) {
    const count = Number(metadata.cart_count);
    if (!Number.isInteger(count) || count < 1 || count > MAX_DISTINCT_ITEMS) {
      return { ok: false, code: "invalid_cart_metadata", items: [] };
    }
    const rawItems = [];
    for (let index = 0; index < count; index += 1) {
      rawItems.push({
        productSlug: metadata[`cart_item_${index}_slug`],
        sku: metadata[`cart_item_${index}_sku`],
        quantity: Number(metadata[`cart_item_${index}_quantity`])
      });
    }
    const resolved = resolveCartInput({ items: rawItems });
    if (!resolved.ok) return { ok: false, code: resolved.code || "invalid_cart_metadata", items: [] };
    return resolved;
  }
  if (metadata.product_slug && metadata.sku) {
    return resolveCartInput({
      productSlug: metadata.product_slug,
      sku: metadata.sku,
      quantity: Number(metadata.quantity ?? 1)
    });
  }
  return { ok: false, code: "missing_cart_metadata", items: [] };
}, "readCartFromSession");
var getCartReadiness = /* @__PURE__ */ __name(async (env, cart) => {
  const items = [];
  let allReady = true;
  for (const item of cart.items || []) {
    const readiness = await getFulfillmentReadiness(env, item.product);
    if (!readiness.ready) allReady = false;
    items.push({ ...item, readiness });
  }
  return { allReady, items };
}, "getCartReadiness");
var publicCartSummary = /* @__PURE__ */ __name((cart) => ({
  items: (cart.items || []).map((item) => ({
    productSlug: item.productSlug,
    productTitle: item.product?.title || null,
    sku: item.sku,
    variant: item.variant?.label || null,
    quantity: item.quantity,
    unitAmount: item.unitAmount,
    lineAmount: item.lineAmount,
    currency: item.currency
  })),
  totalQuantity: cart.totalQuantity || 0,
  amountTotal: cart.amountTotal || 0,
  currency: cart.currency || "eur"
}), "publicCartSummary");

// gelato-draft.js
var GELATO_ORDERS_API = "https://order.gelatoapis.com/v4";
var STRIPE_API = "https://api.stripe.com/v1";
var PRINT_URL_TTL_SECONDS = 60 * 60;
var ALLOWED_SHIPPING_COUNTRIES = /* @__PURE__ */ new Set(["BE", "FR", "LU"]);
var json2 = /* @__PURE__ */ __name((data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=UTF-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  }
}), "json");
var apiError = /* @__PURE__ */ __name(async (response, provider) => {
  const text = await response.text();
  let message = `${provider} API error ${response.status}`;
  try {
    const data = text ? JSON.parse(text) : null;
    const providerMessage = data?.message || data?.error?.message || data?.error;
    if (typeof providerMessage === "string" && providerMessage.trim()) {
      message = providerMessage.trim().slice(0, 300);
    }
  } catch {
  }
  return {
    provider,
    status: response.status,
    message
  };
}, "apiError");
var fetchStripeSession = /* @__PURE__ */ __name(async (env, sessionId) => {
  const response = await fetch(`${STRIPE_API}/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`
    }
  });
  if (!response.ok) return { error: await apiError(response, "Stripe") };
  return { session: await response.json() };
}, "fetchStripeSession");
var normalizeShipping = /* @__PURE__ */ __name((session) => {
  const source = session?.shipping_details || session?.collected_information?.shipping_details || null;
  const customer = session?.customer_details || {};
  const address = source?.address || null;
  const fullName = String(source?.name || customer?.name || "").trim();
  const parts = fullName.split(/\s+/).filter(Boolean);
  const firstName = (parts.shift() || "").slice(0, 25);
  const lastName = (parts.join(" ") || firstName).slice(0, 25);
  const email = String(customer?.email || "").trim().slice(0, 254);
  const country = String(address?.country || "").toUpperCase();
  if (!source || !address || !firstName || !lastName || !email) return null;
  if (!address.line1 || !address.city || !address.postal_code || !country) return null;
  if (!ALLOWED_SHIPPING_COUNTRIES.has(country)) return null;
  return {
    firstName,
    lastName,
    addressLine1: String(address.line1).slice(0, 35),
    ...address.line2 ? { addressLine2: String(address.line2).slice(0, 35) } : {},
    city: String(address.city).slice(0, 30),
    postCode: String(address.postal_code).slice(0, 15),
    ...address.state ? { state: String(address.state).slice(0, 35) } : {},
    country,
    email,
    ...customer?.phone ? { phone: String(customer.phone).slice(0, 25) } : {}
  };
}, "normalizeShipping");
var validateSession = /* @__PURE__ */ __name(async (env, session) => {
  const blockers = [];
  const metadata = session?.metadata || {};
  if (session?.object !== "checkout.session") blockers.push("invalid_checkout_session");
  if (!String(session?.id || "").startsWith("cs_test_")) blockers.push("not_a_test_checkout_session");
  if (metadata.aupositeur_mode !== "test") blockers.push("unexpected_checkout_mode");
  if (session?.payment_status !== "paid") blockers.push("payment_not_paid");
  if (!metadata.order_reference) blockers.push("missing_order_reference");
  const cart = readCartFromSession(session);
  let readiness = { allReady: false, items: [] };
  if (!cart.ok) {
    blockers.push(cart.code || "invalid_cart_metadata");
  } else {
    if (session.currency !== cart.currency) blockers.push("currency_mismatch");
    if (session.amount_total !== cart.amountTotal) blockers.push("amount_mismatch");
    readiness = await getCartReadiness(env, cart);
    for (const item of readiness.items) {
      if (!item.readiness.ready) {
        blockers.push(`${item.productSlug}:${item.readiness.reason || "not_ready"}`);
      }
    }
  }
  const shippingAddress = normalizeShipping(session);
  if (!shippingAddress) blockers.push("invalid_or_unsupported_shipping_address");
  return {
    blockers: [...new Set(blockers)],
    metadata,
    cart,
    readiness,
    shippingAddress
  };
}, "validateSession");
var searchGelatoOrder = /* @__PURE__ */ __name(async (env, orderReferenceId) => {
  const response = await fetch(`${GELATO_ORDERS_API}/orders:search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": env.GELATO_API_KEY
    },
    body: JSON.stringify({
      orderReferenceId,
      orderTypes: ["draft", "order"],
      limit: 20
    })
  });
  if (!response.ok) return { error: await apiError(response, "Gelato") };
  const data = await response.json();
  const orders = Array.isArray(data?.orders) ? data.orders : [];
  const exact = orders.filter((order) => order?.orderReferenceId === orderReferenceId);
  return { orders: exact };
}, "searchGelatoOrder");
var createCustomerReference = /* @__PURE__ */ __name(async (email) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email.toLowerCase()));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `AUP-CUST-${hex.slice(0, 20)}`;
}, "createCustomerReference");
var createGelatoDraft = /* @__PURE__ */ __name(async ({ env, session, trusted, printUrls }) => {
  const orderReferenceId = trusted.metadata.order_reference;
  const customerReferenceId = await createCustomerReference(trusted.shippingAddress.email);
  const payload = {
    orderType: "draft",
    orderReferenceId,
    customerReferenceId,
    currency: String(session.currency || trusted.cart.currency || "eur").toUpperCase(),
    items: trusted.cart.items.map((item, index) => ({
      itemReferenceId: `${orderReferenceId}-${index + 1}`,
      productUid: item.variant.productUid,
      files: [{ type: "default", url: printUrls[index].url }],
      quantity: item.quantity
    })),
    shippingAddress: trusted.shippingAddress,
    metadata: [
      { key: "aupositeur_mode", value: "test" },
      { key: "stripe_session_id", value: String(session.id).slice(0, 100) },
      { key: "order_schema", value: String(trusted.metadata.order_schema || "legacy-single-item").slice(0, 100) },
      { key: "item_count", value: String(trusted.cart.items.length) }
    ]
  };
  const response = await fetch(`${GELATO_ORDERS_API}/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": env.GELATO_API_KEY
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) return { error: await apiError(response, "Gelato") };
  return { order: await response.json() };
}, "createGelatoDraft");
var bytesToHex = /* @__PURE__ */ __name((bytes) => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join(""), "bytesToHex");
var signPrintAccess = /* @__PURE__ */ __name(async (env, key, expires) => {
  const secret = String(env.PRINT_URL_SIGNING_SECRET || "");
  if (!secret) throw new Error("Print URL signing secret is not configured");
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(`${key}
${expires}`)
  );
  return bytesToHex(digest);
}, "signPrintAccess");
var createSignedPrintUrlForWebhook = /* @__PURE__ */ __name(async (request, env, key) => {
  if (!env.SHOP_ASSETS) return { error: "R2 binding SHOP_ASSETS is missing", status: 503 };
  const object = await env.SHOP_ASSETS.head(key);
  if (!object) return { error: "Print master not found", status: 404 };
  const expires = Math.floor(Date.now() / 1e3) + PRINT_URL_TTL_SECONDS;
  const sig = await signPrintAccess(env, key, expires);
  const url = new URL(request.url);
  url.pathname = "/print-file";
  url.search = "";
  url.searchParams.set("key", key);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("sig", sig);
  return { url: url.toString(), expires, expiresInSeconds: PRINT_URL_TTL_SECONDS, key };
}, "createSignedPrintUrlForWebhook");
var createDraftForSession = /* @__PURE__ */ __name(async ({ request, env, session, createSignedPrintUrl: createSignedPrintUrl2 }) => {
  if (!env.GELATO_API_KEY) return { ok: false, status: 503, error: "Gelato API key is not configured" };
  const trusted = await validateSession(env, session);
  if (trusted.blockers.length > 0) {
    return { ok: false, status: 409, blockers: trusted.blockers, checkoutSessionId: session.id };
  }
  const orderReferenceId = trusted.metadata.order_reference;
  const search = await searchGelatoOrder(env, orderReferenceId);
  if (search.error) return { ok: false, status: 502, error: search.error };
  if (search.orders.length > 0) {
    return {
      ok: true,
      status: 200,
      draftCreated: false,
      duplicatePrevented: true,
      orderReferenceId,
      existingOrders: search.orders.map((order2) => ({
        id: order2.id,
        orderType: order2.orderType,
        fulfillmentStatus: order2.fulfillmentStatus,
        financialStatus: order2.financialStatus
      }))
    };
  }
  const printUrls = [];
  for (const item of trusted.cart.items) {
    const signed = createSignedPrintUrl2 ? await createSignedPrintUrl2(request, env, item.product.printFileKey) : await createSignedPrintUrlForWebhook(request, env, item.product.printFileKey);
    if (signed?.error) return { ok: false, status: signed.status || 500, error: signed.error };
    printUrls.push({ ...signed, key: item.product.printFileKey });
  }
  const created = await createGelatoDraft({ env, session, trusted, printUrls });
  if (created.error) return { ok: false, status: 502, error: created.error };
  const order = created.order;
  if (order?.orderType && order.orderType !== "draft") {
    return {
      ok: false,
      status: 502,
      error: "Gelato returned a non-draft order unexpectedly",
      orderId: order.id || null,
      orderType: order.orderType
    };
  }
  return {
    ok: true,
    status: 201,
    testMode: true,
    draftCreated: true,
    productionOrderCreated: false,
    duplicatePrevented: false,
    checkoutSessionId: session.id,
    orderReferenceId,
    cart: publicCartSummary(trusted.cart),
    gelato: {
      id: order?.id || null,
      orderType: order?.orderType || "draft",
      fulfillmentStatus: order?.fulfillmentStatus || null,
      financialStatus: order?.financialStatus || null
    },
    printFiles: printUrls.map((signed, index) => ({
      productSlug: trusted.cart.items[index].productSlug,
      key: signed.key,
      signedUrlExpires: signed.expires,
      signedUrlTtlSeconds: signed.expiresInSeconds
    }))
  };
}, "createDraftForSession");
var createGelatoDraftFromVerifiedSession = /* @__PURE__ */ __name(async (request, env, session) => createDraftForSession({ request, env, session }), "createGelatoDraftFromVerifiedSession");
var handleAdminGelatoDraftFromSession = /* @__PURE__ */ __name(async (request, env, createSignedPrintUrl2) => {
  if (!env.STRIPE_SECRET_KEY || !String(env.STRIPE_SECRET_KEY).startsWith("sk_test_")) {
    return json2({ error: "Stripe test key is not configured" }, 503);
  }
  let input;
  try {
    input = await request.json();
  } catch {
    return json2({ error: "Invalid JSON body" }, 400);
  }
  const sessionId = String(input?.checkoutSessionId || "").trim();
  if (!sessionId.startsWith("cs_test_")) {
    return json2({ error: "A Stripe test Checkout Session id is required" }, 400);
  }
  const stripeResult = await fetchStripeSession(env, sessionId);
  if (stripeResult.error) return json2({ error: stripeResult.error }, 502);
  const result = await createDraftForSession({
    request,
    env,
    session: stripeResult.session,
    createSignedPrintUrl: createSignedPrintUrl2
  });
  if (!result.ok) return json2(result, result.status || 500);
  return json2(result, result.status || 200);
}, "handleAdminGelatoDraftFromSession");

// confirmation-email.js
var SELLER_NAME = "Nicolas RUGOLO";
var SELLER_ADDRESS = "Rue de Baudour 83, 7050 Jurbise, Belgique";
var CONTACT_EMAIL = "aupositeur@gmail.com";
var escapeHtml = /* @__PURE__ */ __name((value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"), "escapeHtml");
var money = /* @__PURE__ */ __name((amount, currency = "eur") => new Intl.NumberFormat("fr-BE", {
  style: "currency",
  currency: String(currency || "eur").toUpperCase()
}).format(Number(amount || 0) / 100), "money");
var shippingFromSession = /* @__PURE__ */ __name((session) => {
  const shipping = session?.shipping_details || session?.collected_information?.shipping_details || null;
  const customer = session?.customer_details || {};
  const address = shipping?.address || null;
  if (!shipping || !address) return null;
  return {
    name: String(shipping.name || customer.name || "").trim(),
    email: String(customer.email || "").trim(),
    line1: String(address.line1 || "").trim(),
    line2: String(address.line2 || "").trim(),
    postalCode: String(address.postal_code || "").trim(),
    city: String(address.city || "").trim(),
    country: String(address.country || "").trim().toUpperCase()
  };
}, "shippingFromSession");
var buildConfirmationEmail = /* @__PURE__ */ __name(({ session, cart, termsVersion }) => {
  const metadata = session?.metadata || {};
  const reference = String(metadata.order_reference || session?.client_reference_id || "").trim();
  const shipping = shippingFromSession(session);
  if (!reference || !shipping?.email || !shipping?.name || !cart?.ok || !Array.isArray(cart.items) || cart.items.length === 0) {
    return { ok: false, code: "incomplete_confirmation_email_data" };
  }
  const itemLines = cart.items.map((item) => ({
    title: String(item.product?.title || item.productSlug || "\u0152uvre Aupositeur"),
    variant: String(item.variant?.label || item.sku || ""),
    quantity: Number(item.quantity || 0),
    lineAmount: Number(item.lineAmount || 0)
  }));
  const textItems = itemLines.map((item) => `- ${item.title} \u2014 ${item.variant} \u2014 quantit\xE9 ${item.quantity} \u2014 ${money(item.lineAmount, cart.currency)}`).join("\n");
  const htmlItems = itemLines.map((item) => `<tr><td style="padding:8px 0">${escapeHtml(item.title)}<br><span style="color:#666">${escapeHtml(item.variant)} \xB7 quantit\xE9 ${item.quantity}</span></td><td style="padding:8px 0;text-align:right;white-space:nowrap">${escapeHtml(money(item.lineAmount, cart.currency))}</td></tr>`).join("");
  const addressText = [shipping.line1, shipping.line2, `${shipping.postalCode} ${shipping.city}`.trim(), shipping.country].filter(Boolean).join("\n");
  const subject = `AUPOSITEUR \u2014 confirmation ${reference}`;
  const legalText = `Vendeur : ${SELLER_NAME}
${SELLER_ADDRESS}
Contact : ${CONTACT_EMAIL}

Droit de r\xE9tractation : pour les produits standard du catalogue, vous disposez en principe de 14 jours calendrier \xE0 compter de la prise de possession du bien pour notifier votre d\xE9cision. Les modalit\xE9s et le formulaire type sont disponibles sur https://www.aupositeur.be/retractation/`;
  const text = `AUPOSITEUR

Merci pour votre commande.

R\xE9f\xE9rence : ${reference}
\xC9tat : Commande confirm\xE9e

${textItems}

Total : ${money(cart.amountTotal, cart.currency)}

Livraison :
${shipping.name}
${addressText}

${legalText}

Les mots trouvent toujours leur chemin.

Conditions de vente : https://www.aupositeur.be/conditions-generales-de-vente/
R\xE9tractation : https://www.aupositeur.be/retractation/
Confidentialit\xE9 : https://www.aupositeur.be/politique-de-confidentialite/
${termsVersion ? `
Version des conditions accept\xE9e : ${termsVersion}
` : ""}`;
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#171714;color:#171714;font-family:Georgia,serif"><div style="max-width:640px;margin:0 auto;background:#f4f1ea;padding:40px 32px"><p style="font-family:monospace;letter-spacing:.12em;font-size:12px">AUPOSITEUR</p><h1 style="font-weight:400;font-size:38px;margin:24px 0 12px">Merci.</h1><p>Votre commande est confirm\xE9e.</p><p><strong>R\xE9f\xE9rence :</strong> ${escapeHtml(reference)}</p><table style="width:100%;border-collapse:collapse;margin:28px 0;border-top:1px solid #c9c5bb;border-bottom:1px solid #c9c5bb">${htmlItems}</table><p style="text-align:right;font-size:20px"><strong>Total : ${escapeHtml(money(cart.amountTotal, cart.currency))}</strong></p><h2 style="font-size:18px;font-weight:400;margin-top:32px">Livraison</h2><p>${escapeHtml(shipping.name)}<br>${escapeHtml(shipping.line1)}${shipping.line2 ? `<br>${escapeHtml(shipping.line2)}` : ""}<br>${escapeHtml(`${shipping.postalCode} ${shipping.city}`.trim())}<br>${escapeHtml(shipping.country)}</p><h2 style="font-size:18px;font-weight:400;margin-top:32px">Votre vendeur</h2><p>${escapeHtml(SELLER_NAME)}<br>${escapeHtml(SELLER_ADDRESS)}<br><a href="mailto:${escapeHtml(CONTACT_EMAIL)}">${escapeHtml(CONTACT_EMAIL)}</a></p><h2 style="font-size:18px;font-weight:400;margin-top:32px">R\xE9tractation</h2><p>Pour les produits standard du catalogue, vous disposez en principe de 14 jours calendrier \xE0 compter de la prise de possession du bien pour notifier votre d\xE9cision. <a href="https://www.aupositeur.be/retractation/">Consulter les modalit\xE9s et le formulaire type</a>.</p><blockquote style="margin:36px 0;border-left:1px solid #d4683b;padding-left:20px;font-style:italic">Les mots trouvent toujours leur chemin.</blockquote><p style="font-family:monospace;font-size:12px;line-height:1.7"><a href="https://www.aupositeur.be/conditions-generales-de-vente/">Conditions de vente</a> \xB7 <a href="https://www.aupositeur.be/retractation/">R\xE9tractation</a> \xB7 <a href="https://www.aupositeur.be/politique-de-confidentialite/">Confidentialit\xE9</a>${termsVersion ? `<br>Version des conditions accept\xE9e : ${escapeHtml(termsVersion)}` : ""}</p></div></body></html>`;
  return {
    ok: true,
    to: shipping.email,
    subject,
    text,
    html,
    reference
  };
}, "buildConfirmationEmail");

// order-email.js
var RESEND_EMAIL_API = "https://api.resend.com/emails";
var DEFAULT_REPLY_TO = "aupositeur@gmail.com";
var cleanProviderMessage = /* @__PURE__ */ __name(async (response) => {
  try {
    const data = await response.json();
    const message = data?.message || data?.error?.message || data?.error;
    return typeof message === "string" ? message.trim().slice(0, 240) : `Email provider error ${response.status}`;
  } catch {
    return `Email provider error ${response.status}`;
  }
}, "cleanProviderMessage");
var sendOrderConfirmation = /* @__PURE__ */ __name(async ({ env, session, cart, termsVersion }) => {
  const apiKey = String(env.RESEND_API_KEY || "").trim();
  const from = String(env.ORDER_EMAIL_FROM || "").trim();
  const replyTo = String(env.ORDER_EMAIL_REPLY_TO || DEFAULT_REPLY_TO).trim();
  if (!apiKey || !from) {
    return {
      ok: true,
      configured: false,
      sent: false,
      reason: "email_provider_not_configured"
    };
  }
  if (!apiKey.startsWith("re_")) {
    return { ok: false, configured: true, sent: false, error: "Invalid email provider configuration" };
  }
  if (!replyTo || !replyTo.includes("@")) {
    return { ok: false, configured: true, sent: false, error: "Invalid reply-to configuration" };
  }
  const email = buildConfirmationEmail({ session, cart, termsVersion });
  if (!email.ok) {
    return { ok: false, configured: true, sent: false, error: email.code || "Email data incomplete" };
  }
  const idempotencyKey = `aupositeur/order-confirmation/${email.reference}`.slice(0, 256);
  const response = await fetch(RESEND_EMAIL_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey
    },
    body: JSON.stringify({
      from,
      to: [email.to],
      reply_to: replyTo,
      subject: email.subject,
      text: email.text,
      html: email.html
    })
  });
  if (!response.ok) {
    return {
      ok: false,
      configured: true,
      sent: false,
      status: response.status,
      error: await cleanProviderMessage(response)
    };
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
  }
  return {
    ok: true,
    configured: true,
    sent: true,
    providerId: typeof data?.id === "string" ? data.id : null
  };
}, "sendOrderConfirmation");

// stripe-webhook.js
var SIGNATURE_TOLERANCE_SECONDS = 300;
var ALLOWED_SHIPPING_COUNTRIES2 = /* @__PURE__ */ new Set(["BE", "FR", "LU"]);
var SUCCESS_EVENT_TYPES = /* @__PURE__ */ new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded"
]);
var FAILED_EVENT_TYPE = "checkout.session.async_payment_failed";
var json3 = /* @__PURE__ */ __name((data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=UTF-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  }
}), "json");
var bytesToHex2 = /* @__PURE__ */ __name((bytes) => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join(""), "bytesToHex");
var safeEqual = /* @__PURE__ */ __name((left, right) => {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}, "safeEqual");
var parseStripeSignature = /* @__PURE__ */ __name((header) => {
  const values = String(header || "").split(",");
  let timestamp = null;
  const signatures = [];
  for (const value of values) {
    const separator = value.indexOf("=");
    if (separator === -1) continue;
    const key = value.slice(0, separator).trim();
    const item = value.slice(separator + 1).trim();
    if (key === "t") timestamp = Number(item);
    if (key === "v1" && item) signatures.push(item);
  }
  return { timestamp, signatures };
}, "parseStripeSignature");
var verifyStripeSignature = /* @__PURE__ */ __name(async (payload, signatureHeader, secret) => {
  const { timestamp, signatures } = parseStripeSignature(signatureHeader);
  if (!Number.isFinite(timestamp) || signatures.length === 0) {
    return { ok: false, reason: "Malformed Stripe-Signature header" };
  }
  const now = Math.floor(Date.now() / 1e3);
  if (Math.abs(now - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: "Stripe signature timestamp outside tolerance" };
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signedPayload = `${timestamp}.${payload}`;
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedPayload)
  );
  const expected = bytesToHex2(digest);
  const valid = signatures.some((signature) => safeEqual(signature, expected));
  return valid ? { ok: true } : { ok: false, reason: "Invalid Stripe webhook signature" };
}, "verifyStripeSignature");
var validateShippingDetails = /* @__PURE__ */ __name((session) => {
  const shipping = session?.shipping_details || session?.collected_information?.shipping_details || null;
  const customer = session?.customer_details || {};
  const address = shipping?.address || null;
  const name = String(shipping?.name || customer?.name || "").trim();
  const email = String(customer?.email || "").trim();
  const country = String(address?.country || "").toUpperCase();
  const blockers = [];
  if (!shipping) blockers.push("missing_shipping_details");
  if (!name) blockers.push("missing_recipient_name");
  if (!address?.line1) blockers.push("missing_address_line1");
  if (!address?.city) blockers.push("missing_city");
  if (!address?.postal_code) blockers.push("missing_postal_code");
  if (!country) blockers.push("missing_country");
  if (country && !ALLOWED_SHIPPING_COUNTRIES2.has(country)) blockers.push("unsupported_shipping_country");
  if (!email) blockers.push("missing_email");
  return { blockers };
}, "validateShippingDetails");
var createAtomicGelatoDraft = /* @__PURE__ */ __name(async (request, env, session, eventId) => {
  if (!env.FULFILLMENT_LOCKS) {
    return createGelatoDraftFromVerifiedSession(request, env, session);
  }
  const durableObjectId = env.FULFILLMENT_LOCKS.idFromName(session.id);
  const stub = env.FULFILLMENT_LOCKS.get(durableObjectId);
  const response = await stub.fetch("https://fulfillment-lock.internal/fulfill", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      session,
      eventId: eventId || null,
      requestUrl: request.url
    })
  });
  let result;
  try {
    result = await response.json();
  } catch {
    result = { ok: false, error: "Invalid fulfillment lock response" };
  }
  if (!response.ok) {
    return {
      ...result,
      ok: false,
      status: response.status
    };
  }
  return result;
}, "createAtomicGelatoDraft");
var handleStripeWebhook = /* @__PURE__ */ __name(async (request, env) => {
  if (!env.STRIPE_WEBHOOK_SECRET || !String(env.STRIPE_WEBHOOK_SECRET).startsWith("whsec_")) {
    return json3({ error: "Stripe webhook secret is not configured" }, 503);
  }
  const signatureHeader = request.headers.get("Stripe-Signature");
  if (!signatureHeader) {
    return json3({ error: "Missing Stripe-Signature header" }, 400);
  }
  const payload = await request.text();
  const verification = await verifyStripeSignature(
    payload,
    signatureHeader,
    String(env.STRIPE_WEBHOOK_SECRET)
  );
  if (!verification.ok) {
    return json3({ error: verification.reason }, 400);
  }
  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return json3({ error: "Invalid Stripe event payload" }, 400);
  }
  const eventType = event.type || null;
  if (!SUCCESS_EVENT_TYPES.has(eventType) && eventType !== FAILED_EVENT_TYPE) {
    return json3({
      received: true,
      verified: true,
      ignored: true,
      eventId: event.id || null,
      eventType
    });
  }
  const session = event?.data?.object;
  if (!session || session.object !== "checkout.session") {
    return json3({ error: "Invalid Checkout Session event object" }, 400);
  }
  if (eventType === FAILED_EVENT_TYPE) {
    return json3({
      received: true,
      verified: true,
      ignored: false,
      paymentFailed: true,
      gelatoOrderCreated: false,
      gelatoDraftCreated: false,
      productionOrderCreated: false,
      eventId: event.id || null,
      eventType,
      checkoutSessionId: session.id || null,
      paymentStatus: session.payment_status || null
    });
  }
  const metadata = session?.metadata || {};
  if (metadata.aupositeur_mode !== "test") {
    return json3({ error: "Unexpected Aupositeur checkout mode" }, 400);
  }
  const paid = session.payment_status === "paid";
  const cart = readCartFromSession(session);
  const shipping = validateShippingDetails(session);
  const confirmationBlockers = [...shipping.blockers];
  let readiness = { allReady: false, items: [] };
  if (!cart.ok) {
    confirmationBlockers.push(cart.code || "invalid_cart_metadata");
  } else {
    if (session.currency !== cart.currency) confirmationBlockers.push("currency_mismatch");
    if (session.amount_total !== cart.amountTotal) confirmationBlockers.push("amount_mismatch");
  }
  if (!metadata.order_reference) confirmationBlockers.push("missing_order_reference");
  if (!paid) confirmationBlockers.push("payment_not_paid");
  const uniqueConfirmationBlockers = [...new Set(confirmationBlockers)];
  let emailResult = { ok: true, configured: false, sent: false };
  if (uniqueConfirmationBlockers.length === 0 && cart.ok) {
    try {
      emailResult = await sendOrderConfirmation({
        env,
        session,
        cart,
        termsVersion: String(metadata.terms_version || "")
      });
    } catch {
      emailResult = { ok: false, configured: true, sent: false };
    }
  }
  const fulfillmentBlockers = [...uniqueConfirmationBlockers];
  if (cart.ok) {
    readiness = await getCartReadiness(env, cart);
    for (const item of readiness.items) {
      if (!item.readiness.ready) {
        fulfillmentBlockers.push(`${item.productSlug}:${item.readiness.reason || "not_ready"}`);
      }
    }
  }
  const uniqueFulfillmentBlockers = [...new Set(fulfillmentBlockers)];
  const readyForGelatoDraft = uniqueFulfillmentBlockers.length === 0;
  let gelatoDraft = null;
  if (readyForGelatoDraft) {
    try {
      gelatoDraft = await createAtomicGelatoDraft(request, env, session, event.id || null);
    } catch {
      return json3({
        received: true,
        verified: true,
        readyForGelatoDraft: true,
        gelatoDraftCreated: false,
        emailConfigured: emailResult.configured === true,
        emailSent: emailResult.sent === true,
        error: "Fulfillment temporarily unavailable",
        eventId: event.id || null,
        checkoutSessionId: session.id || null
      }, 502);
    }
    if (!gelatoDraft?.ok) {
      return json3({
        received: true,
        verified: true,
        readyForGelatoDraft: true,
        gelatoDraftCreated: false,
        emailConfigured: emailResult.configured === true,
        emailSent: emailResult.sent === true,
        retryable: gelatoDraft?.retryable === true,
        eventId: event.id || null,
        checkoutSessionId: session.id || null
      }, gelatoDraft?.status || 502);
    }
  }
  if (emailResult.configured === true && emailResult.ok !== true) {
    return json3({
      received: true,
      verified: true,
      retryable: true,
      emailConfigured: true,
      emailSent: false,
      gelatoDraftCreated: gelatoDraft?.draftCreated === true,
      duplicatePrevented: gelatoDraft?.duplicatePrevented === true || gelatoDraft?.atomicDuplicatePrevented === true,
      eventId: event.id || null,
      checkoutSessionId: session.id || null,
      error: "Order confirmation email temporarily unavailable"
    }, 502);
  }
  const cartSummary = cart.ok ? publicCartSummary(cart) : { items: [], totalQuantity: 0, amountTotal: 0 };
  return json3({
    received: true,
    verified: true,
    dryRun: false,
    gelatoOrderCreated: gelatoDraft?.draftCreated === true,
    gelatoDraftCreated: gelatoDraft?.draftCreated === true,
    duplicatePrevented: gelatoDraft?.duplicatePrevented === true || gelatoDraft?.atomicDuplicatePrevented === true,
    atomicDuplicatePrevented: gelatoDraft?.atomicDuplicatePrevented === true,
    atomicLockUsed: gelatoDraft?.atomicLockUsed === true || gelatoDraft?.atomicDuplicatePrevented === true,
    productionOrderCreated: false,
    eligibleForFulfillment: paid,
    readyForGelatoDraft,
    blockers: uniqueFulfillmentBlockers,
    emailConfigured: emailResult.configured === true,
    emailSent: emailResult.sent === true,
    eventId: event.id || null,
    eventType,
    checkoutSessionId: session.id || null,
    paymentStatus: session.payment_status || null,
    order: {
      reference: metadata.order_reference || null,
      schema: metadata.order_schema || "legacy-single-item",
      itemCount: cartSummary.items.length,
      totalQuantity: cartSummary.totalQuantity || 0,
      amountTotal: cartSummary.amountTotal || 0,
      currency: cart.ok ? cart.currency : null,
      readiness: readiness.items.map((item) => ({
        productSlug: item.productSlug,
        ready: item.readiness.ready === true
      }))
    }
  });
}, "handleStripeWebhook");

// entry.js
var EXACT_ALLOWED_ORIGINS = /* @__PURE__ */ new Set([
  "https://www.aupositeur.be",
  "https://aupositeur.be",
  "https://aupositeur-site.pages.dev"
]);
var PREVIEW_ORIGIN_RE = /^https:\/\/[a-z0-9-]+\.aupositeur-site\.pages\.dev$/i;
var STRIPE_API2 = "https://api.stripe.com/v1";
var BUILD_MARKER = "cart-checkout-v1";
var PRINT_URL_TTL_SECONDS2 = 60 * 60;
var isAllowedOrigin = /* @__PURE__ */ __name((origin) => EXACT_ALLOWED_ORIGINS.has(origin) || PREVIEW_ORIGIN_RE.test(origin), "isAllowedOrigin");
var json4 = /* @__PURE__ */ __name((data, status = 200, origin = "") => {
  const headers = {
    "content-type": "application/json; charset=UTF-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  };
  if (isAllowedOrigin(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers.vary = "Origin";
  }
  return new Response(JSON.stringify(data), { status, headers });
}, "json");
var isAdmin2 = /* @__PURE__ */ __name((request, env) => {
  const provided = request.headers.get("X-Aupositeur-Admin") || "";
  return Boolean(env.SHOP_ADMIN_TOKEN) && provided === env.SHOP_ADMIN_TOKEN;
}, "isAdmin");
var bytesToHex3 = /* @__PURE__ */ __name((bytes) => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join(""), "bytesToHex");
var safeEqual2 = /* @__PURE__ */ __name((left, right) => {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}, "safeEqual");
var printSigningSecret = /* @__PURE__ */ __name((env) => String(env.PRINT_URL_SIGNING_SECRET || ""), "printSigningSecret");
var signPrintAccess2 = /* @__PURE__ */ __name(async (env, key, expires) => {
  const secret = printSigningSecret(env);
  if (!secret) throw new Error("Print URL signing secret is not configured");
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(`${key}
${expires}`)
  );
  return bytesToHex3(digest);
}, "signPrintAccess");
var isConfiguredPrintKey = /* @__PURE__ */ __name((key) => /^print-masters\/\d{4}\/\d{2}\/[a-f0-9-]{36}-studio-recette-[a-f0-9-]{36}\.pdf$/.test(key) || Object.values(SHOP_CATALOG).some((product) => product.printFileKey === key), "isConfiguredPrintKey");
var createSignedPrintUrl = /* @__PURE__ */ __name(async (request, env, key) => {
  if (!isConfiguredPrintKey(key)) {
    return { error: "Print master is not configured in the shop catalog", status: 404 };
  }
  if (!env.SHOP_ASSETS) {
    return { error: "R2 binding SHOP_ASSETS is missing", status: 503 };
  }
  const object = await env.SHOP_ASSETS.head(key);
  if (!object) return { error: "Print master not found", status: 404 };
  const expires = Math.floor(Date.now() / 1e3) + (/-studio-recette-[a-f0-9-]{36}\.pdf$/.test(key) ? 12 : PRINT_URL_TTL_SECONDS2);
  const signature = await signPrintAccess2(env, key, expires);
  const url = new URL(request.url);
  url.pathname = "/print-file";
  url.search = "";
  url.searchParams.set("key", key);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("sig", signature);
  return {
    ok: true,
    private: true,
    key,
    bytes: object.size ?? null,
    expires,
    expiresInSeconds: PRINT_URL_TTL_SECONDS2,
    url: url.toString()
  };
}, "createSignedPrintUrl");
var serveSignedPrintFile = /* @__PURE__ */ __name(async (request, env) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json4({ error: "Method not allowed" }, 405);
  }
  if (!env.SHOP_ASSETS) return json4({ error: "Not found" }, 404);
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || "";
  const expires = Number(url.searchParams.get("expires"));
  const signature = url.searchParams.get("sig") || "";
  if (!key || !Number.isInteger(expires) || !signature || !isConfiguredPrintKey(key)) {
    return json4({ error: "Not found" }, 404);
  }
  const now = Math.floor(Date.now() / 1e3);
  if (expires <= now || expires > now + PRINT_URL_TTL_SECONDS2 + 60) {
    return json4({ error: "Print URL expired" }, 403);
  }
  let expected;
  try {
    expected = await signPrintAccess2(env, key, expires);
  } catch {
    return json4({ error: "Print delivery unavailable" }, 503);
  }
  if (!safeEqual2(signature, expected)) return json4({ error: "Invalid print URL signature" }, 403);
  const object = request.method === "HEAD" ? await env.SHOP_ASSETS.head(key) : await env.SHOP_ASSETS.get(key);
  if (!object) return json4({ error: "Not found" }, 404);
  const headers = new Headers();
  headers.set("content-type", object.httpMetadata?.contentType || "application/octet-stream");
  headers.set("content-length", String(object.size));
  headers.set("cache-control", "private, no-store, max-age=0");
  headers.set("content-disposition", "inline");
  headers.set("x-content-type-options", "nosniff");
  if (object.httpEtag) headers.set("etag", object.httpEtag);
  return new Response(request.method === "HEAD" ? null : object.body, { status: 200, headers });
}, "serveSignedPrintFile");
var listPrintMasters = /* @__PURE__ */ __name(async (env) => {
  if (!env.SHOP_ASSETS) {
    return { error: "R2 binding SHOP_ASSETS is missing", status: 503 };
  }
  const objects = [];
  let cursor;
  do {
    const page = await env.SHOP_ASSETS.list({
      prefix: "print-masters/",
      cursor,
      include: ["httpMetadata", "customMetadata"],
      limit: 1e3
    });
    for (const object of page.objects || []) {
      objects.push({
        key: object.key,
        bytes: object.size ?? null,
        uploaded: object.uploaded ? new Date(object.uploaded).toISOString() : null,
        mime: object.httpMetadata?.contentType || null,
        originalName: object.customMetadata?.originalName || null,
        kind: object.customMetadata?.kind || null
      });
    }
    cursor = page.truncated ? page.cursor : void 0;
  } while (cursor);
  objects.sort((a, b) => String(a.uploaded || "").localeCompare(String(b.uploaded || "")));
  return {
    ok: true,
    prefix: "print-masters/",
    count: objects.length,
    objects
  };
}, "listPrintMasters");
var auditFulfillmentReadiness = /* @__PURE__ */ __name(async (env) => {
  const products = [];
  for (const [slug, product] of Object.entries(SHOP_CATALOG)) {
    const readiness = await getFulfillmentReadiness(env, product);
    products.push({
      slug,
      title: product.title,
      templateId: product.templateId,
      printFileKey: product.printFileKey,
      ...readiness
    });
  }
  return {
    ok: true,
    allReady: products.every((product) => product.ready),
    readyCount: products.filter((product) => product.ready).length,
    total: products.length,
    products
  };
}, "auditFulfillmentReadiness");
var stripeErrorMessage = /* @__PURE__ */ __name(async (response) => {
  const text = await response.text();
  try {
    const data = text ? JSON.parse(text) : null;
    const message = data?.error?.message;
    return typeof message === "string" && message.trim() ? message.trim().slice(0, 300) : `Stripe API error ${response.status}`;
  } catch {
    return `Stripe API error ${response.status}`;
  }
}, "stripeErrorMessage");
var createCheckoutSession = /* @__PURE__ */ __name(async (request, env, origin) => {
  if (!isAllowedOrigin(origin)) {
    return json4({ error: "Origin not allowed" }, 403, origin);
  }
  if (!env.STRIPE_SECRET_KEY || !String(env.STRIPE_SECRET_KEY).startsWith("sk_test_")) {
    return json4({ error: "Stripe test key is not configured" }, 503, origin);
  }
  let input;
  try {
    input = await request.json();
  } catch {
    return json4({ error: "Invalid JSON body" }, 400, origin);
  }
  const cart = resolveCartInput(input);
  if (!cart.ok) {
    return json4(
      {
        error: cart.error || "Invalid cart",
        code: cart.code || "invalid_cart",
        productSlug: cart.productSlug || null
      },
      cart.status || 400,
      origin
    );
  }
  const readiness = await getCartReadiness(env, cart);
  if (!readiness.allReady) {
    return json4(
      {
        error: "One or more products are not ready for fulfillment",
        code: "cart_not_ready",
        items: readiness.items.filter((item) => !item.readiness.ready).map((item) => ({ productSlug: item.productSlug, reason: item.readiness.reason }))
      },
      409,
      origin
    );
  }
  const orderReference = `AUP-TEST-${crypto.randomUUID()}`;
  const returnOrigin = origin;
  const successUrl = `${returnOrigin}/boutique/merci/?shopTest=1&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = Array.isArray(input?.items) ? `${returnOrigin}/panier/?shopTest=1` : `${returnOrigin}/boutique/${encodeURIComponent(cart.items[0].productSlug)}/?shopTest=1`;
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", successUrl);
  params.set("cancel_url", cancelUrl);
  params.set("client_reference_id", orderReference);
  params.set("billing_address_collection", "auto");
  params.set("shipping_address_collection[allowed_countries][0]", "BE");
  params.set("shipping_address_collection[allowed_countries][1]", "FR");
  params.set("shipping_address_collection[allowed_countries][2]", "LU");
  params.set("branding_settings[display_name]", "AUPOSITEUR");
  params.set("branding_settings[font_family]", "lora");
  params.set("branding_settings[border_style]", "rectangular");
  params.set("branding_settings[background_color]", "#171714");
  params.set("branding_settings[button_color]", "#D4683B");
  cart.items.forEach((item, index) => {
    params.set(`line_items[${index}][price_data][currency]`, item.currency);
    params.set(`line_items[${index}][price_data][unit_amount]`, String(item.unitAmount));
    params.set(
      `line_items[${index}][price_data][product_data][name]`,
      `${item.product.title} \u2014 ${item.variant.label}`
    );
    params.set(
      `line_items[${index}][price_data][product_data][description]`,
      "Affiche encadr\xE9e Aupositeur \xB7 30 \xD7 40 cm"
    );
    params.set(`line_items[${index}][quantity]`, String(item.quantity));
  });
  writeCartMetadata(params, cart, orderReference);
  const response = await fetch(`${STRIPE_API2}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });
  if (!response.ok) {
    return json4({ error: await stripeErrorMessage(response) }, 502, origin);
  }
  const session = await response.json();
  return json4(
    {
      ok: true,
      mode: "test",
      orderSchema: "cart-v1",
      gelatoOrderCreated: false,
      fulfillmentReady: true,
      orderReference,
      cart: publicCartSummary(cart),
      sessionId: session.id,
      url: session.url
    },
    201,
    origin
  );
}, "createCheckoutSession");
var entry_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    if (url.pathname === "/__build") {
      if (request.method !== "GET") {
        return json4({ error: "Method not allowed" }, 405, origin);
      }
      return json4(
        {
          service: "aupositeur-shop-api",
          status: "ok",
          buildMarker: BUILD_MARKER,
          fulfillmentReadinessRoute: "/admin/fulfillment/readiness",
          signedPrintDelivery: true,
          signedPrintTtlSeconds: PRINT_URL_TTL_SECONDS2,
          gelatoDraftRoute: "/admin/gelato/draft-from-session",
          gelatoDraftOnly: true,
          multiItemCheckout: true
        },
        200,
        origin
      );
    }
    if (url.pathname === "/print-file") {
      return serveSignedPrintFile(request, env);
    }
    if (url.pathname === "/stripe/webhook") {
      if (request.method !== "POST") {
        return json4({ error: "Method not allowed" }, 405);
      }
      return handleStripeWebhook(request, env);
    }
    if (url.pathname === "/admin/print-files/list") {
      if (request.method !== "GET") {
        return json4({ error: "Method not allowed" }, 405, origin);
      }
      if (!isAdmin2(request, env)) {
        return json4({ error: "Unauthorized" }, 401, origin);
      }
      const result = await listPrintMasters(env);
      if (result?.error) {
        return json4({ error: result.error }, result.status || 500, origin);
      }
      return json4(result, 200, origin);
    }
    if (url.pathname === "/admin/print-files/signed-url") {
      if (request.method !== "POST") {
        return json4({ error: "Method not allowed" }, 405, origin);
      }
      if (!isAdmin2(request, env)) {
        return json4({ error: "Unauthorized" }, 401, origin);
      }
      let input;
      try {
        input = await request.json();
      } catch {
        return json4({ error: "Invalid JSON body" }, 400, origin);
      }
      try {
        const result = await createSignedPrintUrl(request, env, String(input?.printFileKey || ""));
        if (result?.error) return json4({ error: result.error }, result.status || 500, origin);
        return json4(result, 201, origin);
      } catch (error) {
        return json4(
          { error: error instanceof Error ? error.message : "Could not create signed print URL" },
          500,
          origin
        );
      }
    }
    if (url.pathname === "/admin/gelato/draft-from-session") {
      if (request.method !== "POST") {
        return json4({ error: "Method not allowed" }, 405, origin);
      }
      if (!isAdmin2(request, env)) {
        return json4({ error: "Unauthorized" }, 401, origin);
      }
      return handleAdminGelatoDraftFromSession(request, env, createSignedPrintUrl);
    }
    if (url.pathname === "/admin/fulfillment/readiness") {
      if (request.method !== "GET") {
        return json4({ error: "Method not allowed" }, 405, origin);
      }
      if (!isAdmin2(request, env)) {
        return json4({ error: "Unauthorized" }, 401, origin);
      }
      const result = await auditFulfillmentReadiness(env);
      return json4(result, result.allReady ? 200 : 409, origin);
    }
    if (url.pathname === "/checkout/session") {
      if (request.method === "OPTIONS") {
        if (!isAllowedOrigin(origin)) return new Response(null, { status: 403 });
        return new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": origin,
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "Content-Type",
            "access-control-max-age": "86400",
            vary: "Origin"
          }
        });
      }
      if (request.method === "POST") {
        return createCheckoutSession(request, env, origin);
      }
    }
    return index_default.fetch(request, env, ctx);
  }
};

// gelato-market-audit.js
var GELATO_PRODUCT_API = "https://product.gelatoapis.com/v3";
var GELATO_SHIPMENT_API = "https://shipment.gelatoapis.com/v1";
var MARKETS = [
  { country: "BE", label: "Belgique" },
  { country: "FR", label: "France" },
  { country: "LU", label: "Luxembourg" },
  { country: "MC", label: "Monaco" },
  { country: "CH", label: "Suisse" },
  { country: "CA", label: "Canada" }
];
var readJson = /* @__PURE__ */ __name(async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}, "readJson");
var gelatoFetch = /* @__PURE__ */ __name(async (url, env, init = {}) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      "X-API-KEY": env.GELATO_API_KEY,
      ...init.body ? { "Content-Type": "application/json" } : {},
      ...init.headers || {}
    }
  });
  const data = await readJson(response);
  return { ok: response.ok, status: response.status, data };
}, "gelatoFetch");
var pickQuantityOnePrice = /* @__PURE__ */ __name((data, country) => {
  if (!Array.isArray(data)) return null;
  const row = data.find(
    (entry) => String(entry?.country || "").toUpperCase() === country && Number(entry?.quantity) === 1
  );
  if (!row) return null;
  return {
    price: Number(row.price),
    currency: row.currency || "EUR"
  };
}, "pickQuantityOnePrice");
var pickShipping = /* @__PURE__ */ __name((data) => {
  const prices = Array.isArray(data?.prices) ? data.prices : [];
  const quantity = prices[0]?.quantities?.find((entry) => Number(entry?.quantity) === 1);
  const methods = Array.isArray(quantity?.methods) ? quantity.methods : [];
  const normal = methods.filter((method) => method?.type === "normal");
  const pool = normal.length ? normal : methods;
  if (!pool.length) return { methods: [], cheapest: null };
  const normalized = pool.map((method) => ({
    shipmentMethodUid: method.shipmentMethodUid || null,
    type: method.type || null,
    minPrice: Number(method.minPrice),
    avgPrice: Number(method.avgPrice),
    minDays: Number(method.minDays),
    maxDays: Number(method.maxDays),
    hasFlatRate: Boolean(method.hasFlatRate)
  })).filter((method) => Number.isFinite(method.minPrice)).sort((a, b) => a.minPrice - b.minPrice);
  return { methods: normalized, cheapest: normalized[0] || null };
}, "pickShipping");
var handleAdminGelatoMarketAudit = /* @__PURE__ */ __name(async (request, env, catalog, resolveVariant2) => {
  if (!env.GELATO_API_KEY) {
    return new Response(JSON.stringify({ error: "GELATO_API_KEY is not configured" }), {
      status: 503,
      headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" }
    });
  }
  let input = {};
  try {
    input = await request.json();
  } catch {
  }
  const productSlug = String(input?.productSlug || "ames");
  const product = catalog[productSlug];
  if (!product) {
    return new Response(JSON.stringify({ error: "Unknown product" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" }
    });
  }
  const requestedSku = String(input?.sku || "");
  const variant = requestedSku ? resolveVariant2(product, requestedSku) : product.variants.find((entry) => /BLACK$/i.test(entry.sku)) || product.variants[0];
  if (!variant?.productUid) {
    return new Response(JSON.stringify({ error: "No Gelato product UID for selected variant" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" }
    });
  }
  const markets = [];
  for (const market of MARKETS) {
    const country = market.country;
    const priceUrl = new URL(`${GELATO_PRODUCT_API}/products/${encodeURIComponent(variant.productUid)}/prices`);
    priceUrl.searchParams.set("country", country);
    priceUrl.searchParams.set("currency", "EUR");
    const [productPriceResult, shippingResult] = await Promise.all([
      gelatoFetch(priceUrl.toString(), env),
      gelatoFetch(`${GELATO_SHIPMENT_API}/prices:search`, env, {
        method: "POST",
        body: JSON.stringify({
          currency: "EUR",
          country,
          isBusiness: false,
          isPrivate: true,
          hasTracking: true,
          products: [{ productUid: variant.productUid, quantities: [1] }]
        })
      })
    ]);
    const productPrice = productPriceResult.ok ? pickQuantityOnePrice(productPriceResult.data, country) : null;
    const shipping = shippingResult.ok ? pickShipping(shippingResult.data) : { methods: [], cheapest: null };
    const productCost = Number(productPrice?.price);
    const shippingCost = Number(shipping.cheapest?.minPrice);
    const baseCost = Number.isFinite(productCost) && Number.isFinite(shippingCost) ? productCost + shippingCost : null;
    const grossSpreadBeforeTaxAndFees = baseCost === null ? null : Number((product.unitAmount / 100 - baseCost).toFixed(2));
    markets.push({
      country,
      label: market.label,
      currency: "EUR",
      productAvailable: Boolean(productPrice),
      productPrice: productPrice?.price ?? null,
      shippingAvailable: Boolean(shipping.cheapest),
      cheapestShipping: shipping.cheapest,
      shippingMethods: shipping.methods,
      baseCostBeforeTax: baseCost === null ? null : Number(baseCost.toFixed(2)),
      sitePriceShippingIncluded: product.unitAmount / 100,
      grossSpreadBeforeTaxAndFees,
      diagnostics: {
        productPriceHttpStatus: productPriceResult.status,
        shippingHttpStatus: shippingResult.status
      }
    });
  }
  return new Response(JSON.stringify({
    ok: true,
    readOnly: true,
    createsGelatoOrder: false,
    note: "Indicative Gelato product/shipment API audit. No order or draft is created.",
    productSlug,
    sku: variant.sku,
    productUid: variant.productUid,
    sitePriceShippingIncluded: product.unitAmount / 100,
    currency: "EUR",
    markets
  }), {
    status: 200,
    headers: { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" }
  });
}, "handleAdminGelatoMarketAudit");

// fulfillment-lock.js
import { DurableObject } from "cloudflare:workers";
var PROCESSING_TTL_MS = 2 * 60 * 1e3;
var json5 = /* @__PURE__ */ __name((data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=UTF-8",
    "cache-control": "no-store"
  }
}), "json");
var FulfillmentLock = class extends DurableObject {
  static {
    __name(this, "FulfillmentLock");
  }
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
  }
  async fetch(request) {
    if (request.method === "GET") {
      const current2 = await this.ctx.storage.get("fulfillment") || null;
      return json5({
        ok: true,
        state: current2?.state || "not_started",
        checkoutSessionId: current2?.checkoutSessionId || null,
        startedAt: current2?.startedAt || null,
        completedAt: current2?.completedAt || null,
        eventId: current2?.eventId || null
      });
    }
    if (request.method !== "POST") {
      return json5({ error: "Method not allowed" }, 405);
    }
    let input;
    try {
      input = await request.json();
    } catch {
      return json5({ error: "Invalid JSON body" }, 400);
    }
    const session = input?.session;
    const requestUrl = String(input?.requestUrl || "https://aupositeur-shop-api.invalid/stripe/webhook");
    const eventId = String(input?.eventId || "");
    if (!session || session.object !== "checkout.session" || !String(session.id || "").startsWith("cs_test_")) {
      return json5({ error: "Invalid Stripe Checkout Session" }, 400);
    }
    const now = Date.now();
    const current = await this.ctx.storage.get("fulfillment") || null;
    if (current?.state === "completed") {
      return json5({
        ok: true,
        atomicDuplicatePrevented: true,
        draftCreated: false,
        duplicatePrevented: true,
        gelato: current.gelato || null,
        completedAt: current.completedAt || null,
        completedByEventId: current.eventId || null
      });
    }
    if (current?.state === "processing" && Number.isFinite(current.startedAt) && now - current.startedAt < PROCESSING_TTL_MS) {
      return json5(
        {
          ok: false,
          retryable: true,
          atomicLockBusy: true,
          error: "Fulfillment for this Checkout Session is already in progress",
          startedAt: current.startedAt,
          eventId: current.eventId || null
        },
        503
      );
    }
    await this.ctx.storage.put("fulfillment", {
      state: "processing",
      startedAt: now,
      eventId: eventId || null,
      checkoutSessionId: session.id
    });
    try {
      const gelatoDraft = await createGelatoDraftFromVerifiedSession(
        new Request(requestUrl, { method: "POST" }),
        this.env,
        session
      );
      if (!gelatoDraft?.ok) {
        await this.ctx.storage.delete("fulfillment");
        return json5(
          {
            ok: false,
            retryable: true,
            error: "Gelato draft creation did not complete",
            gelatoDraft
          },
          gelatoDraft?.status || 502
        );
      }
      const completed = {
        state: "completed",
        completedAt: Date.now(),
        eventId: eventId || null,
        checkoutSessionId: session.id,
        gelato: gelatoDraft?.gelato || gelatoDraft?.existingOrders || null
      };
      await this.ctx.storage.put("fulfillment", completed);
      return json5({
        ...gelatoDraft,
        atomicDuplicatePrevented: false,
        atomicLockUsed: true
      });
    } catch (error) {
      await this.ctx.storage.delete("fulfillment");
      return json5(
        {
          ok: false,
          retryable: true,
          error: error instanceof Error ? error.message : "Gelato draft creation failed"
        },
        502
      );
    }
  }
};

// market-entry.js
var SHOP_TERMS_VERSION = "2026-09-06";
var STRIPE_API3 = "https://api.stripe.com/v1";
var EXACT_ALLOWED_ORIGINS2 = /* @__PURE__ */ new Set([
  "https://www.aupositeur.be",
  "https://aupositeur.be",
  "https://aupositeur-site.pages.dev"
]);
var PREVIEW_ORIGIN_RE2 = /^https:\/\/[a-z0-9-]+\.aupositeur-site\.pages\.dev$/i;
var isAllowedShopOrigin = /* @__PURE__ */ __name((origin) => EXACT_ALLOWED_ORIGINS2.has(origin) || PREVIEW_ORIGIN_RE2.test(origin), "isAllowedShopOrigin");
var json6 = /* @__PURE__ */ __name((data, status = 200, origin = "") => {
  const headers = {
    "content-type": "application/json; charset=UTF-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  };
  if (origin && isAllowedShopOrigin(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers.vary = "Origin";
  }
  return new Response(JSON.stringify(data), { status, headers });
}, "json");
var isAdmin3 = /* @__PURE__ */ __name((request, env) => {
  const provided = request.headers.get("X-Aupositeur-Admin") || "";
  return Boolean(env.SHOP_ADMIN_TOKEN) && provided === env.SHOP_ADMIN_TOKEN;
}, "isAdmin");
var recordStripeTermsAcceptance = /* @__PURE__ */ __name(async (sessionId, env) => {
  if (!env.STRIPE_SECRET_KEY || !String(env.STRIPE_SECRET_KEY).startsWith("sk_test_")) {
    return { ok: false, error: "Stripe test key is not configured" };
  }
  const params = new URLSearchParams();
  params.set("metadata[terms_accepted]", "true");
  params.set("metadata[terms_version]", SHOP_TERMS_VERSION);
  params.set("metadata[terms_accepted_at]", (/* @__PURE__ */ new Date()).toISOString());
  const response = await fetch(
    `${STRIPE_API3}/checkout/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params.toString()
    }
  );
  if (response.ok) return { ok: true };
  return {
    ok: false,
    error: `Could not record terms acceptance in Stripe (${response.status})`
  };
}, "recordStripeTermsAcceptance");
var expireStripeSession = /* @__PURE__ */ __name(async (sessionId, env) => {
  if (!env.STRIPE_SECRET_KEY || !String(env.STRIPE_SECRET_KEY).startsWith("sk_test_")) return;
  try {
    await fetch(
      `${STRIPE_API3}/checkout/sessions/${encodeURIComponent(sessionId)}/expire`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: ""
      }
    );
  } catch {
  }
}, "expireStripeSession");
var getFulfillmentState = /* @__PURE__ */ __name(async (env, sessionId) => {
  if (!env.FULFILLMENT_LOCKS) return "unavailable";
  try {
    const durableObjectId = env.FULFILLMENT_LOCKS.idFromName(sessionId);
    const stub = env.FULFILLMENT_LOCKS.get(durableObjectId);
    const response = await stub.fetch("https://fulfillment-lock.internal/status", { method: "GET" });
    if (!response.ok) return "unavailable";
    const result = await response.json();
    return String(result?.state || "not_started");
  } catch {
    return "unavailable";
  }
}, "getFulfillmentState");
var fetchStripeCheckoutSession = /* @__PURE__ */ __name(async (env, sessionId, paymentIntentId) => {
  const headers = { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` };
  if (sessionId) {
    const direct = await fetch(
      `${STRIPE_API3}/checkout/sessions/${encodeURIComponent(sessionId)}`,
      { headers }
    );
    if (direct.ok) return { ok: true, session: await direct.json() };
    if (direct.status !== 404) return { ok: false, status: direct.status };
  }
  if (!paymentIntentId) return { ok: false, status: 404 };
  const params = new URLSearchParams();
  params.set("payment_intent", paymentIntentId);
  params.set("limit", "1");
  const listResponse = await fetch(`${STRIPE_API3}/checkout/sessions?${params.toString()}`, { headers });
  if (!listResponse.ok) return { ok: false, status: listResponse.status };
  const list = await listResponse.json();
  const session = Array.isArray(list?.data) ? list.data[0] : null;
  if (!session) return { ok: false, status: 404 };
  return { ok: true, session };
}, "fetchStripeCheckoutSession");
var getCheckoutStatus = /* @__PURE__ */ __name(async (request, env, origin) => {
  if (origin && !isAllowedShopOrigin(origin)) {
    return json6({ error: "Origin not allowed", code: "origin_not_allowed" }, 403);
  }
  if (!env.STRIPE_SECRET_KEY || !String(env.STRIPE_SECRET_KEY).startsWith("sk_test_")) {
    return json6({ error: "Stripe test key is not configured", code: "stripe_key_unavailable" }, 503, origin);
  }
  const url = new URL(request.url);
  const rawSessionId = String(url.searchParams.get("session_id") || "");
  const rawPaymentIntentId = String(url.searchParams.get("payment_intent") || "");
  const sessionId = rawSessionId.startsWith("cs_test_") && rawSessionId.length <= 255 ? rawSessionId : "";
  const paymentIntentId = rawPaymentIntentId.startsWith("pi_") && rawPaymentIntentId.length <= 255 ? rawPaymentIntentId : "";
  if (!sessionId && !paymentIntentId) {
    return json6({ error: "Missing valid test Checkout identifier", code: "invalid_checkout_identifier" }, 400, origin);
  }
  let lookup;
  try {
    lookup = await fetchStripeCheckoutSession(env, sessionId, paymentIntentId);
  } catch {
    return json6({ error: "Stripe is temporarily unavailable", code: "stripe_unreachable" }, 502, origin);
  }
  if (!lookup.ok || !lookup.session) {
    return json6(
      {
        error: lookup.status === 404 ? "Checkout Session not found" : "Stripe Checkout lookup failed",
        code: lookup.status === 404 ? "session_not_found" : "stripe_lookup_failed"
      },
      lookup.status === 404 ? 404 : 502,
      origin
    );
  }
  const session = lookup.session;
  const resolvedSessionId = String(session.id || "");
  const metadata = session?.metadata || {};
  if (metadata.aupositeur_mode !== "test") {
    return json6({ error: "Unexpected checkout mode", code: "unexpected_checkout_mode" }, 400, origin);
  }
  const cart = readCartFromSession(session);
  if (!cart.ok) {
    return json6({ error: "Checkout cart metadata is invalid", code: cart.code || "invalid_cart_metadata" }, 409, origin);
  }
  const fulfillmentState = await getFulfillmentState(env, resolvedSessionId);
  const cartSummary = publicCartSummary(cart);
  const firstItem = cartSummary.items[0] || null;
  return json6(
    {
      ok: true,
      mode: "test",
      checkoutSessionId: resolvedSessionId,
      paymentIntentId: session.payment_intent || paymentIntentId || null,
      paymentStatus: session.payment_status || null,
      paymentComplete: session.payment_status === "paid",
      fulfillmentState,
      gelatoDraftPrepared: fulfillmentState === "completed",
      productionOrderCreated: false,
      order: {
        reference: metadata.order_reference || session.client_reference_id || null,
        schema: metadata.order_schema || "legacy-single-item",
        items: cartSummary.items,
        totalQuantity: cartSummary.totalQuantity,
        amountTotal: session.amount_total ?? cartSummary.amountTotal,
        currency: session.currency || cartSummary.currency,
        productSlug: firstItem?.productSlug || null,
        productTitle: firstItem?.productTitle || null,
        variant: firstItem?.variant || null,
        sku: firstItem?.sku || null,
        quantity: firstItem?.quantity || null
      }
    },
    200,
    origin
  );
}, "getCheckoutStatus");
var checkoutStatusPreflight = /* @__PURE__ */ __name((origin) => {
  if (!origin || !isAllowedShopOrigin(origin)) {
    return json6({ error: "Origin not allowed", code: "origin_not_allowed" }, 403);
  }
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "Content-Type, Accept",
      "access-control-max-age": "86400",
      vary: "Origin"
    }
  });
}, "checkoutStatusPreflight");
var market_entry_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    if (url.pathname === "/admin/gelato/market-audit") {
      if (request.method !== "POST") return json6({ error: "Method not allowed" }, 405, origin);
      if (!isAdmin3(request, env)) return json6({ error: "Unauthorized" }, 401, origin);
      return handleAdminGelatoMarketAudit(request, env, SHOP_CATALOG, resolveVariant);
    }
    if (url.pathname === "/checkout/status") {
      if (request.method === "OPTIONS") return checkoutStatusPreflight(origin);
      if (request.method !== "GET") {
        return json6({ error: "Method not allowed" }, 405, origin);
      }
      return getCheckoutStatus(request, env, origin);
    }
    if (url.pathname === "/checkout/session" && request.method === "POST") {
      let input;
      try {
        input = await request.clone().json();
      } catch {
        return json6({ error: "Invalid JSON body" }, 400, origin);
      }
      if (!isAllowedShopOrigin(origin)) {
        return json6({ error: "Origin not allowed" }, 403);
      }
      if (input?.termsAccepted !== true) {
        return json6({ error: "Shop terms must be accepted before checkout" }, 400, origin);
      }
      if (String(input?.termsVersion || "") !== SHOP_TERMS_VERSION) {
        return json6(
          {
            error: "Shop terms version has changed. Please review the current terms.",
            currentTermsVersion: SHOP_TERMS_VERSION
          },
          409,
          origin
        );
      }
      const checkoutResponse = await entry_default.fetch(request, env, ctx);
      if (!checkoutResponse.ok) return checkoutResponse;
      let checkoutData;
      try {
        checkoutData = await checkoutResponse.clone().json();
      } catch {
        return json6({ error: "Invalid checkout response" }, 502, origin);
      }
      const checkoutSessionId = String(checkoutData?.sessionId || "");
      if (!checkoutSessionId.startsWith("cs_test_")) {
        return json6({ error: "Expected a Stripe test Checkout Session" }, 502, origin);
      }
      const recorded = await recordStripeTermsAcceptance(checkoutSessionId, env);
      if (!recorded.ok) {
        await expireStripeSession(checkoutSessionId, env);
        return json6(
          {
            error: recorded.error || "Could not record shop terms acceptance"
          },
          502,
          origin
        );
      }
      return checkoutResponse;
    }
    return entry_default.fetch(request, env, ctx);
  }
};
export {
  FulfillmentLock,
  market_entry_default as default
};
//# sourceMappingURL=market-entry.js.map
