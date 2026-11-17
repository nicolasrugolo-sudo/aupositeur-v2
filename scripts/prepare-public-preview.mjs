import { cp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url);
for (const file of ['admin', 'api', 'communaute', 'studio-test', 'studio-content.json', '_redirects', '_routes.json', 'sitemap.xml', 'sitemap-index.xml', '_worker.js']) {
  await rm(new URL(file, dist), { recursive: true, force: true });
}
await cp(new URL('./preview-pages-worker.mjs', import.meta.url), new URL('_worker.js', dist));
await writeFile(new URL('_headers', dist), '/*\n  X-Robots-Tag: noindex, nofollow\n');
await writeFile(new URL('robots.txt', dist), 'User-agent: *\nDisallow:\n');
for (const file of await readdir(dist, { recursive: true })) {
  if (!file.endsWith('.html')) continue;
  const path = join(dist.pathname, file);
  const html = await readFile(path, 'utf8');
  if (!/<head(?:\s[^>]*)?>/i.test(html)) continue;
  await writeFile(path, html.replace(/<head(?:\s[^>]*)?>/i, '$&<meta name="robots" content="noindex, nofollow">'));
}
