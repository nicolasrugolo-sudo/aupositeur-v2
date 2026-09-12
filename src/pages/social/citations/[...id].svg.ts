import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';

const escapeXml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const wrapWords = (text: string, maxChars: number): string[] => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines;
};

export const getStaticPaths = (async () => {
  const families = ['classic', 'minimal', 'matter', 'manuscript', 'light'];
  const citations = (await getCollection('citations'))
    .filter(({ data }) => !data.draft)
    .sort((a, b) => {
      const aTime = a.data.createdAt?.getTime() ?? 0;
      const bTime = b.data.createdAt?.getTime() ?? 0;
      if (aTime !== bTime) return bTime - aTime;
      return a.id.localeCompare(b.id, 'fr');
    });
  return citations.map((citation, index) => ({
    params: { id: citation.id },
    props: {
      citation,
      number: String(index + 1).padStart(2, '0'),
      family: families[index % families.length],
    },
  }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => {
  const citation = props.citation;
  const text = String(citation.data.text);
  const number = String(props.number || '01');
  const family = String(props.family || 'classic');
  const width = 1080;
  const height = 1350;
  const maxChars = family === 'minimal' ? 24 : 28;
  const lines = wrapWords(text, maxChars);
  const fontSize = lines.length > 8 ? 48 : lines.length > 6 ? 56 : lines.length > 4 ? 66 : 78;
  const lineHeight = Math.round(fontSize * 1.17);
  const x = family === 'minimal' ? 170 : 105;
  const blockHeight = lines.length * lineHeight;
  let y = family === 'minimal' ? 365 : Math.max(420, (height - blockHeight) / 2);
  const quoteSpans = lines.map((line) => {
    const span = `<tspan x="${x}" y="${Math.round(y)}">${escapeXml(line)}</tspan>`;
    y += lineHeight;
    return span;
  }).join('');
  const accentY = Math.round(y + 20);
  const ghostX = family === 'minimal' ? 650 : family === 'light' ? 60 : 52;
  const ghostY = family === 'minimal' ? 1170 : 350;

  const familyDecor = family === 'matter'
    ? '<radialGradient id="matter" cx="79%" cy="17%" r="62%"><stop offset="0" stop-color="#f1ede4" stop-opacity=".07"/><stop offset="1" stop-color="#080808" stop-opacity="0"/></radialGradient><rect width="1080" height="1350" fill="url(#matter)"/>'
    : family === 'light'
      ? '<linearGradient id="light" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f1ede4" stop-opacity=".13"/><stop offset=".38" stop-color="#f1ede4" stop-opacity=".015"/><stop offset=".7" stop-color="#080808" stop-opacity="0"/></linearGradient><rect width="1080" height="1350" fill="url(#light)"/>'
      : '';

  const manuscript = family === 'manuscript'
    ? Array.from({ length: 13 }, (_, i) => 120 + i * 72).map((ly) => `<path d="M40 ${ly} C250 ${ly - 30},650 ${ly + 25},1040 ${ly - 8}" fill="none" stroke="#f1ede4" stroke-opacity=".055" stroke-width="2"/>`).join('')
    : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#080808"/>
    ${familyDecor}
    ${manuscript}
    <text x="${ghostX}" y="${ghostY}" fill="#f1ede4" fill-opacity=".055" font-family="Georgia, Times New Roman, serif" font-size="350">${escapeXml(number)}</text>
    <text fill="#f1ede4" font-family="Georgia, Times New Roman, serif" font-size="${fontSize}" font-weight="400">${quoteSpans}</text>
    <rect x="${x}" y="${accentY}" width="72" height="4" fill="#b95632"/>
    <text x="82" y="1240" fill="#f1ede4" font-family="Georgia, Times New Roman, serif" font-size="26" letter-spacing="7">AUPOSITEUR</text>
    <circle cx="324" cy="1232" r="5" fill="#b95632"/>
    <text x="824" y="1240" fill="#f1ede4" fill-opacity=".72" font-family="Courier New, monospace" font-size="22">aupositeur.be</text>
  </svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
