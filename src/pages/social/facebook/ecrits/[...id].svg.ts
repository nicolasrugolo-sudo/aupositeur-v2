import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';

const DEFAULT_PHOTO = '/images/aupositeur/portraits/aupositeur-01.png';

const escapeXml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const fallbackPhoto = (slug: string): string => {
  let hash = 0;
  for (const ch of slug) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const index = (hash % 25) + 1;
  return `/images/aupositeur/portraits/aupositeur-${String(index).padStart(2, '0')}.png`;
};

const wrapTitle = (title: string): string[] => {
  const words = title.toUpperCase().trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > 22 && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
};

export const getStaticPaths = (async () => {
  const poemes = (await getCollection('poemes')).filter(({ data }) => !data.draft);
  return poemes.map((poeme) => ({ params: { id: poeme.id }, props: { poeme } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => {
  const poeme = props.poeme;
  const title = String(poeme.data.title);
  const configuredPhoto = String(poeme.data.socialPhoto || DEFAULT_PHOTO);
  const photoPath = configuredPhoto === DEFAULT_PHOTO ? fallbackPhoto(poeme.id) : configuredPhoto;
  const photoUrl = new URL(photoPath, 'https://www.aupositeur.be').href;
  const lines = wrapTitle(title);

  // Facebook can crop link previews differently between feed/composer/mobile.
  // Keep all meaningful content well inside a conservative central safe area.
  const left = 120;
  const right = 1080;
  const fontSize = lines.length >= 3 ? 38 : lines.length === 2 ? 44 : 50;
  const lineStep = Math.round(fontSize * 1.18);
  const titleStart = lines.length >= 3 ? 260 : lines.length === 2 ? 278 : 298;
  const titleSvg = lines
    .map((line, i) => `<tspan x="${left}" y="${titleStart + i * lineStep}">${escapeXml(line)}</tspan>`)
    .join('');
  const accentY = Math.min(442, titleStart + lines.length * lineStep + 20);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#080808" stop-opacity="0.98"/>
      <stop offset="0.50" stop-color="#080808" stop-opacity="0.72"/>
      <stop offset="1" stop-color="#080808" stop-opacity="0.08"/>
    </linearGradient>
    <linearGradient id="bottom" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.60" stop-color="#080808" stop-opacity="0"/>
      <stop offset="1" stop-color="#080808" stop-opacity="0.88"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#080808"/>
  <image href="${escapeXml(photoUrl)}" x="0" y="0" width="1200" height="630" preserveAspectRatio="xMidYMid slice"/>
  <rect width="1200" height="630" fill="url(#shade)"/>
  <rect width="1200" height="630" fill="url(#bottom)"/>

  <text x="${left}" y="110" fill="#d7d2c8" font-family="Courier New, monospace" font-size="16" letter-spacing="6">POÈME</text>
  <text fill="#f1ede4" font-family="Georgia, Times New Roman, serif" font-size="${fontSize}" font-weight="400">${titleSvg}</text>
  <rect x="${left}" y="${accentY}" width="54" height="3" fill="#b95632"/>

  <line x1="${left}" y1="508" x2="${right}" y2="508" stroke="#f1ede4" stroke-opacity="0.16"/>
  <text x="${left}" y="557" fill="#f1ede4" font-family="Georgia, Times New Roman, serif" font-size="17" letter-spacing="5.5">AUPOSITEUR</text>
  <circle cx="294" cy="551" r="3.5" fill="#b95632"/>
  <text x="891" y="557" fill="#d7d2c8" font-family="Courier New, monospace" font-size="15" letter-spacing="1.2">aupositeur.be</text>
</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
