import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';

const escapeXml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const charWeight = (ch: string): number => {
  if (ch === ' ') return 0.30;
  if (/[ilI1'’.,:;!|]/.test(ch)) return 0.30;
  if (/[MW@%&]/.test(ch)) return 0.92;
  if (/[A-ZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸ]/.test(ch)) return 0.68;
  return 0.54;
};

const estimatedWidth = (text: string, fontSize: number): number =>
  Array.from(text).reduce((sum, ch) => sum + charWeight(ch) * fontSize, 0);

const wrapByWidth = (text: string, fontSize: number, maxWidth: number): string[] => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && estimatedWidth(next, fontSize) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
};

const fitQuote = (text: string, maxWidth: number, maxHeight: number) => {
  for (let fontSize = 72; fontSize >= 42; fontSize -= 2) {
    const lines = wrapByWidth(text, fontSize, maxWidth);
    const lineHeight = Math.round(fontSize * 1.22);
    if (lines.length <= 10 && lines.length * lineHeight <= maxHeight) {
      return { fontSize, lineHeight, lines };
    }
  }
  const fontSize = 40;
  const lineHeight = Math.round(fontSize * 1.22);
  return { fontSize, lineHeight, lines: wrapByWidth(text, fontSize, maxWidth).slice(0, 11) };
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

  // Pinterest-first vertical artboard (2:3), also safe for generic social previews.
  const width = 1000;
  const height = 1500;
  const safeLeft = family === 'minimal' ? 150 : 110;
  const safeRight = 110;
  const maxTextWidth = width - safeLeft - safeRight;
  const maxTextHeight = 790;
  const { fontSize, lineHeight, lines } = fitQuote(text, maxTextWidth, maxTextHeight);
  const blockHeight = lines.length * lineHeight;
  let y = family === 'minimal' ? 410 : Math.max(455, Math.round((height - blockHeight) / 2 - 40));
  const quoteSpans = lines.map((line) => {
    const span = `<tspan x="${safeLeft}" y="${y}">${escapeXml(line)}</tspan>`;
    y += lineHeight;
    return span;
  }).join('');
  const accentY = Math.min(1230, y + 26);

  const ghostX = family === 'minimal' ? 610 : family === 'light' ? 58 : 48;
  const ghostY = family === 'minimal' ? 1270 : 365;

  const familyDecor = family === 'matter'
    ? '<radialGradient id="matter" cx="80%" cy="16%" r="64%"><stop offset="0" stop-color="#f1ede4" stop-opacity=".07"/><stop offset="1" stop-color="#080808" stop-opacity="0"/></radialGradient><rect width="1000" height="1500" fill="url(#matter)"/>'
    : family === 'light'
      ? '<linearGradient id="light" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f1ede4" stop-opacity=".13"/><stop offset=".38" stop-color="#f1ede4" stop-opacity=".015"/><stop offset=".7" stop-color="#080808" stop-opacity="0"/></linearGradient><rect width="1000" height="1500" fill="url(#light)"/>'
      : '';

  const manuscript = family === 'manuscript'
    ? Array.from({ length: 15 }, (_, i) => 150 + i * 76)
        .map((ly) => `<path d="M42 ${ly} C235 ${ly - 28},610 ${ly + 24},958 ${ly - 8}" fill="none" stroke="#f1ede4" stroke-opacity=".05" stroke-width="2"/>`)
        .join('')
    : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#080808"/>
    ${familyDecor}
    ${manuscript}
    <text x="${ghostX}" y="${ghostY}" fill="#f1ede4" fill-opacity=".05" font-family="Georgia, Times New Roman, serif" font-size="330">${escapeXml(number)}</text>
    <text fill="#f1ede4" font-family="Georgia, Times New Roman, serif" font-size="${fontSize}" font-weight="400">${quoteSpans}</text>
    <rect x="${safeLeft}" y="${accentY}" width="66" height="4" fill="#b95632"/>
    <line x1="110" y1="1340" x2="890" y2="1340" stroke="#f1ede4" stroke-opacity=".12"/>
    <text x="110" y="1408" fill="#f1ede4" font-family="Georgia, Times New Roman, serif" font-size="23" letter-spacing="6.5">AUPOSITEUR</text>
    <circle cx="330" cy="1400" r="4.5" fill="#b95632"/>
    <text x="703" y="1408" fill="#f1ede4" fill-opacity=".70" font-family="Courier New, monospace" font-size="20">aupositeur.be</text>
  </svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, must-revalidate',
    },
  });
};
