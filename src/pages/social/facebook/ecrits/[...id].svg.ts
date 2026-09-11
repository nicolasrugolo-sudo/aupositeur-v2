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
    if (next.length > 18 && current) {
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

  // Deliberately compact composition: Facebook may crop previews differently
  // between desktop, mobile and the share composer. Everything important stays
  // in a central 800 x 450 safe frame.
  const frameX = 200;
  const frameY = 90;
  const frameW = 800;
  const frameH = 450;
  const textX = 245;
  const fontSize = lines.length >= 3 ? 31 : lines.length === 2 ? 35 : 40;
  const lineStep = Math.round(fontSize * 1.18);
  const titleStart = lines.length >= 3 ? 254 : lines.length === 2 ? 270 : 286;
  const titleSvg = lines
    .map((line, i) => `<tspan x="${textX}" y="${titleStart + i * lineStep}">${escapeXml(line)}</tspan>`)
    .join('');
  const accentY = Math.min(402, titleStart + lines.length * lineStep + 16);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <clipPath id="photoFrame">
      <rect x="${frameX}" y="${frameY}" width="${frameW}" height="${frameH}" rx="2"/>
    </clipPath>
    <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#080808" stop-opacity="0.98"/>
      <stop offset="0.55" stop-color="#080808" stop-opacity="0.76"/>
      <stop offset="1" stop-color="#080808" stop-opacity="0.16"/>
    </linearGradient>
    <linearGradient id="bottom" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.58" stop-color="#080808" stop-opacity="0"/>
      <stop offset="1" stop-color="#080808" stop-opacity="0.88"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="#080808"/>
  <g clip-path="url(#photoFrame)">
    <image href="${escapeXml(photoUrl)}" x="${frameX}" y="${frameY}" width="${frameW}" height="${frameH}" preserveAspectRatio="xMidYMid slice"/>
    <rect x="${frameX}" y="${frameY}" width="${frameW}" height="${frameH}" fill="url(#shade)"/>
    <rect x="${frameX}" y="${frameY}" width="${frameW}" height="${frameH}" fill="url(#bottom)"/>
  </g>

  <text x="${textX}" y="158" fill="#d7d2c8" font-family="Courier New, monospace" font-size="13" letter-spacing="5">POÈME</text>
  <text fill="#f1ede4" font-family="Georgia, Times New Roman, serif" font-size="${fontSize}" font-weight="400">${titleSvg}</text>
  <rect x="${textX}" y="${accentY}" width="42" height="3" fill="#b95632"/>

  <line x1="${textX}" y1="460" x2="955" y2="460" stroke="#f1ede4" stroke-opacity="0.16"/>
  <text x="${textX}" y="500" fill="#f1ede4" font-family="Georgia, Times New Roman, serif" font-size="14" letter-spacing="4.5">AUPOSITEUR</text>
  <circle cx="389" cy="495" r="3" fill="#b95632"/>
  <text x="822" y="500" fill="#d7d2c8" font-family="Courier New, monospace" font-size="13" letter-spacing="1">aupositeur.be</text>
</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
