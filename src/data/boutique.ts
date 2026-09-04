import { getCollection } from 'astro:content';

export const cadres = [
  { id: 'blanc', label: 'Blanc' },
  { id: 'noir', label: 'Noir' },
  { id: 'bois', label: 'Bois naturel' },
  { id: 'bois-fonce', label: 'Bois foncé' },
];

export const vues = [
  { file: 'Simple.webp', label: 'Vue produit' },
  { file: 'Bedroom-Modern-White-2.webp', label: 'Chambre' },
  { file: 'Living-Room-Modern-White-1.webp', label: 'Salon I' },
  { file: 'Living-Room-Modern-White-2.webp', label: 'Salon II' },
];

const entries = await getCollection('boutique');

export const produits = entries
  .filter((entry) => !entry.data.draft)
  .sort((a, b) => a.data.number.localeCompare(b.data.number, 'fr'))
  .map((entry) => ({
    slug: entry.data.slug,
    numero: entry.data.number,
    titre: entry.data.title,
    citation: entry.data.quote,
    prix: entry.data.price,
    devise: entry.data.currency,
    type: entry.data.productType,
    format: entry.data.size,
    image: entry.data.featuredImage ?? `/boutique/affiches/${entry.data.slug}/noir/Simple.webp`,
  }));
