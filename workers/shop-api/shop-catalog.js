export const FRAME_VARIANTS = {
  WHITE: {
    label: 'Cadre blanc',
    productUid:
      'framed_poster_mounted_300x400-mm-12x16-inch_white_wood_w12xt22-mm_plexiglass_300x400-mm-12x16-inch_200-gsm-80lb-uncoated_4-0_ver',
  },
  BLACK: {
    label: 'Cadre noir',
    productUid:
      'framed_poster_mounted_300x400-mm-12x16-inch_black_wood_w12xt22-mm_plexiglass_300x400-mm-12x16-inch_200-gsm-80lb-uncoated_4-0_ver',
  },
  'DARK-WOOD': {
    label: 'Cadre en bois foncé',
    productUid:
      'framed_poster_mounted_300x400-mm-12x16-inch_dark-wood_wood_w12xt22-mm_plexiglass_300x400-mm-12x16-inch_200-gsm-80lb-uncoated_4-0_ver',
  },
  'NATURAL-WOOD': {
    label: 'Cadre en bois',
    productUid:
      'framed_poster_mounted_300x400-mm-12x16-inch_natural-wood_wood_w12xt22-mm_plexiglass_300x400-mm-12x16-inch_200-gsm-80lb-uncoated_4-0_ver',
  },
};

export const SHOP_CATALOG = {
  'le-pire': {
    title: 'Le pire',
    skuPrefix: 'AUP-AFF-LE-PIRE-',
    templateId: '6faf6e07-49ea-4ad1-809c-df456544ae2d',
    unitAmount: 6900,
    currency: 'eur',
    printFileKey: null,
  },
  ames: {
    title: 'Âmes',
    skuPrefix: 'AUP-AFF-AMES-',
    templateId: 'e529f113-596b-42d0-ac66-a63f9968c71b',
    unitAmount: 6900,
    currency: 'eur',
    printFileKey:
      'print-masters/2026/09/276704e4-58f7-491a-bfd9-60ff10655b4b-Cadre-Ame-01.png',
  },
  amore: {
    title: 'Amore',
    skuPrefix: 'AUP-AFF-AMORE-',
    templateId: 'f145367d-53ab-4811-ade4-c28d6bcaaff2',
    unitAmount: 6900,
    currency: 'eur',
    printFileKey: null,
  },
  pretendre: {
    title: 'Prétendre',
    skuPrefix: 'AUP-AFF-PRETENDRE-',
    templateId: '2db904b0-7b9f-45bf-a356-036be947bc25',
    unitAmount: 6900,
    currency: 'eur',
    printFileKey: null,
  },
  'vie-parfaite': {
    title: 'Vie parfaite',
    skuPrefix: 'AUP-AFF-VIE-PARFAITE-',
    templateId: '06772389-b980-4910-92c8-a8e8af5a2bed',
    unitAmount: 6900,
    currency: 'eur',
    printFileKey: null,
  },
};

export const resolveVariant = (product, sku) => {
  if (!product || !sku.startsWith(product.skuPrefix)) return null;
  const suffix = sku.slice(product.skuPrefix.length);
  const frame = FRAME_VARIANTS[suffix];
  return frame ? { sku, suffix, ...frame } : null;
};

export const getFulfillmentReadiness = async (env, product) => {
  if (!product) return { ready: false, reason: 'unknown_product', printFilePresent: false };
  if (!product.printFileKey) {
    return { ready: false, reason: 'missing_print_file_configuration', printFilePresent: false };
  }
  if (!env.SHOP_ASSETS) {
    return { ready: false, reason: 'shop_assets_binding_missing', printFilePresent: false };
  }
  const object = await env.SHOP_ASSETS.head(product.printFileKey);
  if (!object) {
    return { ready: false, reason: 'print_master_not_found_in_r2', printFilePresent: false };
  }
  return {
    ready: true,
    reason: null,
    printFilePresent: true,
    printFileBytes: object.size,
  };
};
