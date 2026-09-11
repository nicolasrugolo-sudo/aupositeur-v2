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
    if (next.length > 19 && current) {
      lines.push(current);
      current = word;
    } else current = next;
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
  const fontSize = lines.length >= 3 ? 52 : lines.length === 2 ? 62 : 72;
  const titleSvg = lines.map((line, i) => `<tspan x="74" y="${285 + i * 72}">${escapeXml(line)}</tspan>`).join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#080808" stop-opacity="0.98"/>
      <stop offset="0.52" stop-color="#080808" stop-opacity="0.76"/>
      <stop offset="1" stop-color="#080808" stop-opacity="0.10"/>
    </linearGradient>
    <linearGradient id="bottom" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.55" stop-color="#080808" stop-opacity="0"/>
      <stop offset="1" stop-color="#080808" stop-opacity="0.82"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#080808"/>
  <image href="${escapeXml(photoUrl)}" x="0" y="0" width="1200" height="630" preserveAspectRatio="xMidYMid slice"/>
  <rect width="1200" height="630" fill="url(#shade)"/>
  <rect width="1200" height="630" fill="url(#bottom)"/>
  <text x="74" y="92" fill="#d7d2c8" font-family="Courier New, monospace" font-size="20" letter-spacing="8">POÈME</text>
  <text fill="#f1ede4" font-family="Georgia, Times New Roman, serif" font-size="${fontSize}" font-weight="400">${titleSvg}</text>
  <rect x="74" y="${Math.min(490, 310 + lines.length * 72)}" width="66" height="4" fill="#b95632"/>
  <line x1="74" y1="535" x2="1126" y2="535" stroke="#f1ede4" stroke-opacity="0.18"/>
  <text x="74" y="588" fill="#f1ede4" font-family="Georgia, Times New Roman, serif" font-size="22" letter-spacing="7">AUPOSITEUR</text>
  <circle cx="302" cy="581" r="4.5" fill="#b95632"/>
  <text x="938" y="588" fill="#d7d2c8" font-family="Courier New, monospace" font-size="18" letter-spacing="1.5">aupositeur.be</text>
</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
