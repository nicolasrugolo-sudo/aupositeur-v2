import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';

const escapeXml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const titleLines = (title: string): string[] => {
  const words = title.toUpperCase().trim().split(/\s+/);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > 16 && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }

  if (line) lines.push(line);
  return lines.slice(0, 3);
};

export const getStaticPaths = (async () => {
  const poemes = (await getCollection('poemes')).filter(({ data }) => !data.draft);
  return poemes.map((poeme) => ({ params: { id: poeme.id }, props: { poeme } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => {
  const poeme = props.poeme;
  const title = String(poeme.data.title);
  const photoPath = poeme.data.socialPhoto || '/images/aupositeur/portraits/aupositeur-01.png';
  const photoUrl = new URL(photoPath, 'https://aupositeur.be').href;
  const lines = titleLines(title);
  const fontSize = lines.length >= 3 ? 78 : lines.length === 2 ? 94 : 108;
  const startY = lines.length >= 3 ? 260 : lines.length === 2 ? 310 : 360;
  const tspans = lines.map((line, index) => `<tspan x="76" y="${startY + index * (fontSize * 1.04)}">${escapeXml(line)}</tspan>`).join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#080808"/>
      <stop offset="0.48" stop-color="#080808" stop-opacity="0.96"/>
      <stop offset="0.72" stop-color="#080808" stop-opacity="0.32"/>
      <stop offset="1" stop-color="#080808" stop-opacity="0.06"/>
    </linearGradient>
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#080808" stop-opacity="0.08"/>
      <stop offset="1" stop-color="#080808" stop-opacity="0.58"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#080808"/>
  <image href="${escapeXml(photoUrl)}" x="520" y="0" width="680" height="630" preserveAspectRatio="xMidYMid slice"/>
  <rect width="1200" height="630" fill="url(#shade)"/>
  <rect width="920" height="630" fill="url(#fade)"/>
  <text x="78" y="108" fill="#d7d2c8" font-family="Courier New, monospace" font-size="24" letter-spacing="8">POÈME</text>
  <text fill="#f1ede4" font-family="Georgia, Times New Roman, serif" font-size="${fontSize}" font-weight="400">${tspans}</text>
  <rect x="78" y="${Math.min(520, startY + lines.length * fontSize * 1.04 + 18)}" width="72" height="4" fill="#b95632"/>
  <text x="78" y="565" fill="#f1ede4" font-family="Georgia, Times New Roman, serif" font-size="25" letter-spacing="7">AUPOSITEUR</text>
  <circle cx="284" cy="557" r="5" fill="#b95632"/>
  <text x="78" y="602" fill="#c9c3b8" font-family="Courier New, monospace" font-size="20" letter-spacing="2">aupositeur.be</text>
</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
