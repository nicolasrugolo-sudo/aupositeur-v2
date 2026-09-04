import { getCollection } from 'astro:content';

const SHOP_API = 'https://aupositeur-shop-api.nicolas-rugolo.workers.dev';

export const cadres = [
  { id: 'blanc', label: 'Blanc' },
  { id: 'noir', label: 'Noir' },
  { id: 'bois', label: 'Bois naturel' },
  { id: 'bois-fonce', label: 'Bois foncé' },
];

const automaticMockupKey = (printFileKey: string, template: string) => {
  const withoutPrefix = printFileKey.replace(/^print-masters\//, '');
  const withoutExt = withoutPrefix.replace(/\.[^.]+$/, '');
  return `mockups/${withoutExt}-${template}.webp`;
};

const automaticMockupUrl = (printFileKey: string | undefined, template: string) =>
  printFileKey ? `${SHOP_API}/media/${automaticMockupKey(printFileKey, template)}` : undefined;

const entries = await getCollection('boutique');

export const produits = entries
  .filter((entry) => !entry.data.draft)
  .sort((a, b) => a.data.number.localeCompare(b.data.number, 'fr'))
  .map((entry) => {
    const autoMockup =
      entry.data.mockupMode === 'auto'
        ? automaticMockupUrl(entry.data.printFileKey, entry.data.mockupTemplate)
        : undefined;

    const manualMockups = entry.data.mockups;
    const manualPrimary = entry.data.mockupMode === 'manual' ? manualMockups[0]?.image : undefined;

    return {
      slug: entry.data.slug,
      numero: entry.data.number,
      titre: entry.data.title,
      citation: entry.data.quote,
      prix: entry.data.price,
      devise: entry.data.currency,
      type: entry.data.productType,
      format: entry.data.size,
      // Marketing visuals now come only from the new managed pipeline.
      // Legacy /public/boutique/affiches mockups are intentionally no longer used.
      image: autoMockup ?? manualPrimary ?? entry.data.featuredImage,
      fulfillmentProvider: entry.data.fulfillmentProvider,
      gelatoTemplateId: entry.data.gelatoTemplateId,
      printFileKey: entry.data.printFileKey,
      printFileName: entry.data.printFileName,
      printFileMime: entry.data.printFileMime,
      printFileBytes: entry.data.printFileBytes,
      mockupMode: entry.data.mockupMode,
      mockupTemplate: entry.data.mockupTemplate,
      autoMockup,
      mockups: manualMockups,
      variants: entry.data.variants.filter((variant) => variant.available),
    };
  });
