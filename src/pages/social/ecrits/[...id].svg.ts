import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';

const DEFAULT_PHOTO = '/images/aupositeur/portraits/aupositeur-01.png';

const escapeXml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const stripMarkdown = (value: string) => value
  .replace(/^---[\s\S]*?---\s*/u, '')
  .replace(/<!--([\s\S]*?)-->/g, '')
  .replace(/^#{1,6}\s+/gm, '')
  .replace(/^>\s?/gm, '')
  .replace(/\*\*([^*]+)\*\*/g, '$1')
  .replace(/__([^_]+)__/g, '$1')
  .replace(/\*([^*]+)\*/g, '$1')
  .replace(/_([^_]+)_/g, '$1')
  .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/\r/g, '')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const wrapWords = (text: string, maxChars: number): string[] => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
};

const poemLines = (body: string): Array<{ text: string; blank?: boolean }> => {
  const paragraphs = stripMarkdown(body).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const output: Array<{ text: string; blank?: boolean }> = [];
  paragraphs.forEach((paragraph, index) => {
    const physicalLines = paragraph.split('\n').map((line) => line.trim()).filter(Boolean);
    physicalLines.forEach((physical) => {
      wrapWords(physical, 55).forEach((line) => output.push({ text: line }));
    });
    if (index < paragraphs.length - 1) output.push({ text: '', blank: true });
  });
  return output;
};

const titleLines = (title: string): string[] => wrapWords(title.toUpperCase(), 22).slice(0, 3);

const fallbackPhoto = (slug: string): string => {
  let hash = 0;
  for (const ch of slug) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const index = (hash % 25) + 1;
  return `/images/aupositeur/portraits/aupositeur-${String(index).padStart(2, '0')}.png`;
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
  const photoUrl = new URL(photoPath, 'https://aupositeur.be').href;
  const tLines = titleLines(title);
  const pLines = poemLines(poeme.body ?? '');

  const width = 1000;
  const heroHeight = 610;
  const titleStart = 430;
  const titleFont = tLines.length >= 3 ? 54 : tLines.length === 2 ? 66 : 76;
  const poemFont = pLines.length > 34 ? 24 : pLines.length > 27 ? 27 : 30;
  const poemLineHeight = Math.round(poemFont * 1.48);
  const poemStart = heroHeight + 110;
  const poemHeight = pLines.reduce((sum, line) => sum + (line.blank ? Math.round(poemLineHeight * 0.6) : poemLineHeight), 0);
  const height = Math.max(1500, poemStart + poemHeight + 210);

  const titleTspans = tLines.map((line, index) =>
    `<tspan x="72" y="${titleStart + index * (titleFont * 1.02)}">${escapeXml(line)}</tspan>`
  ).join('');

  let currentY = poemStart;
  const poemTspans = pLines.map((line) => {
    if (line.blank) {
      currentY += Math.round(poemLineHeight * 0.6);
      return '';
    }
    const tspan = `<tspan x="72" y="${currentY}">${escapeXml(line.text)}</tspan>`;
    currentY += poemLineHeight;
    return tspan;
  }).join('');

  const footerY = height - 86;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="heroShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#080808" stop-opacity="0.08"/>
      <stop offset="0.55" stop-color="#080808" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#080808" stop-opacity="1"/>
    </linearGradient>
    <linearGradient id="heroSide" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#080808" stop-opacity="0.88"/>
      <stop offset="0.44" stop-color="#080808" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#080808" stop-opacity="0.02"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="#080808"/>
  <image href="${escapeXml(photoUrl)}" x="0" y="0" width="${width}" height="${heroHeight}" preserveAspectRatio="xMidYMid slice"/>
  <rect width="${width}" height="${heroHeight + 40}" fill="url(#heroShade)"/>
  <rect width="${width}" height="${heroHeight}" fill="url(#heroSide)"/>

  <text x="72" y="88" fill="#d7d2c8" font-family="Courier New, monospace" font-size="22" letter-spacing="8">POÈME</text>
  <text fill="#f1ede4" font-family="Georgia, Times New Roman, serif" font-size="${titleFont}" font-weight="400">${titleTspans}</text>
  <rect x="72" y="${Math.min(heroHeight - 28, titleStart + tLines.length * titleFont * 1.02 + 20)}" width="70" height="4" fill="#b95632"/>

  <text fill="#f1ede4" font-family="Georgia, Times New Roman, serif" font-size="${poemFont}" font-weight="400">${poemTspans}</text>

  <line x1="72" y1="${footerY - 58}" x2="928" y2="${footerY - 58}" stroke="#f1ede4" stroke-opacity="0.12"/>
  <text x="72" y="${footerY}" fill="#f1ede4" font-family="Georgia, Times New Roman, serif" font-size="24" letter-spacing="7">AUPOSITEUR</text>
  <circle cx="322" cy="${footerY - 7}" r="4.5" fill="#b95632"/>
  <text x="735" y="${footerY}" fill="#c9c3b8" font-family="Courier New, monospace" font-size="20" letter-spacing="1.5">aupositeur.be</text>
</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
