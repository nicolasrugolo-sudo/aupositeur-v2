import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const base = 'https://www.aupositeur.be';
const sitemap = readFileSync('dist/sitemap.xml', 'utf8');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) =>
  match[1].replace(/&amp;/g, '&')
);
const errors = [];
const seen = new Set();

if (!urls.length) errors.push('Le sitemap ne contient aucune URL.');

for (const url of urls) {
  if (seen.has(url)) errors.push(`URL dupliquée dans le sitemap : ${url}`);
  seen.add(url);
  let parsed;
  try { parsed = new URL(url); } catch { errors.push(`URL invalide : ${url}`); continue; }
  if (parsed.origin !== base || parsed.search || parsed.hash || !parsed.pathname.endsWith('/')) {
    errors.push(`URL non canonique dans le sitemap : ${url}`);
    continue;
  }
  const file = join('dist', decodeURIComponent(parsed.pathname), 'index.html');
  if (!existsSync(file)) { errors.push(`Page absente pour ${url} : ${file}`); continue; }
  const html = readFileSync(file, 'utf8');
  const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1];
  if (canonical !== url) errors.push(`Canonical incorrecte : ${url} -> ${canonical ?? 'absente'}`);
  if (!/<meta\s+name="description"\s+content="[^"]+"/i.test(html)) errors.push(`Description absente : ${url}`);
  if (!/<title>[^<]+<\/title>/i.test(html)) errors.push(`Titre absent : ${url}`);
  if (/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html)) errors.push(`Page noindex dans le sitemap : ${url}`);
  if (!/application\/ld\+json/.test(html)) errors.push(`Données structurées absentes : ${url}`);
}

if (errors.length) {
  console.error(`Échec de l'audit SEO : ${errors.length} erreur(s) sur ${urls.length} URL.\n${errors.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Audit SEO : ${urls.length} URL du sitemap validées (fichiers, canonical, titres, descriptions, indexabilité et JSON-LD).`);
}
