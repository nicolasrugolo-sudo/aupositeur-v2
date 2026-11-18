import { getCollection } from 'astro:content';
export const prerender = true;
export async function GET() {
  const definitions = [
    { collection: 'citations', type: 'citation', route: 'citations' },
    { collection: 'poemes', type: 'ecrit', route: 'ecrits' },
    { collection: 'reflexions', type: 'reflexion', route: 'reflexions' },
    { collection: 'musiques', type: 'musique', route: 'musique' },
    { collection: 'livres', type: 'livre', route: 'livres' },
  ] as const;
  const items = (await Promise.all(definitions.map(async ({ collection, type, route }) => {
    const entries = await getCollection(collection, ({ data }) => !data.draft);
    return entries.map(entry => {
      const d = entry.data as unknown as Record<string, unknown>;
      const title = String(d.title || (type === 'citation' ? String(d.text || '').slice(0, 100) : entry.id));
      const caption = type === 'citation' ? String(d.text || '') : type === 'ecrit' ? String(entry.body || '') : String(d.descriptionCourte || d.description || d.lead || title);
      const media = String(d.socialPhoto || d.cover || d.video || '');
      return { type, id: entry.id, title, caption: caption.slice(0, 5000), media, url: '/' + route + '/' + entry.id + '/' };
    });
  }))).flat();
  return new Response(JSON.stringify({ items }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}
