import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';

const escapeXml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const plain = (body: string): string => body
  .replace(/^---[\s\S]*?---\s*/u, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/^#{1,6}\s+/gm, '')
  .replace(/^>\s?/gm, '')
  .replace(/\*\*([^*]+)\*\*/g, '$1')
  .replace(/__([^_]+)__/g, '$1')
  .replace(/\*([^*]+)\*/g, '$1')
  .replace(/_([^_]+)_/g, '$1')
  .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/\r\n?/g, '\n')
  .trim();
const weight = (text: string): number => Array.from(text).reduce((sum, ch) => sum + (ch === ' ' ? .3 : /[ilI1'’.,:;!|]/.test(ch) ? .3 : /[MW@%&]/.test(ch) ? .92 : /[A-ZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸ]/.test(ch) ? .68 : .54), 0);
const wrap = (text: string, size: number, maxWidth: number): string[] => {
  const result: string[] = [];
  for (const original of text.split('\n')) {
    if (!original.trim()) { result.push(''); continue; }
    let current = '';
    for (const word of original.trim().split(/\s+/)) {
      const candidate = current ? current + ' ' + word : word;
      if (weight(candidate) * size <= maxWidth) { current = candidate; continue; }
      if (current) { result.push(current); current = ''; }
      if (weight(word) * size <= maxWidth) { current = word; continue; }
      for (const char of Array.from(word)) {
        if (current && weight(current + char) * size > maxWidth) { result.push(current); current = ''; }
        current += char;
      }
    }
    if (current) result.push(current);
  }
  return result;
};
const fit = (text: string, width: number, height: number, largest: number) => {
  for (let size = largest; size >= 12; size--) {
    const lines = wrap(text, size, width);
    const step = size * 1.3;
    if (lines.length * step <= height) return { size, lines, step };
  }
  return null;
};
export const getStaticPaths = (async () =>
  (await getCollection('poemes')).filter(({ data }) => !data.draft)
    .map(poeme => ({ params: { id: poeme.id }, props: { poeme } }))
) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => {
  const poeme = props.poeme;
  const title = String(poeme.data.title);
  const body = plain(poeme.body ?? '');
  const titleFit = fit(title, 840, 135, 53);
  const poemFit = fit(body, 850, 1030, 45);
  if (!titleFit || !poemFit) return new Response('Poème trop long pour une image lisible', { status: 422 });
  const titleSpans = titleFit.lines.map((line, i) =>
    `<tspan x="500" y="${Math.round(150 + (i + 1) * titleFit.step)}">${escapeXml(line)}</tspan>`).join('');
  const poemTop = 280 + (1030 - poemFit.lines.length * poemFit.step) / 2;
  const poemSpans = poemFit.lines.map((line, i) =>
    `<tspan x="500" y="${Math.round(poemTop + (i + 1) * poemFit.step)}">${escapeXml(line)}</tspan>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1500" viewBox="0 0 1000 1500">
    <defs><filter id="concrete"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="3" seed="9" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".045"/></feComponentTransfer></filter></defs>
    <rect width="1000" height="1500" fill="#f4f4f1"/><rect width="1000" height="1500" filter="url(#concrete)" opacity=".65"/>
    <g fill="#151515" text-anchor="middle">
      <text x="500" y="98" font-family="Courier New, monospace" font-size="22" letter-spacing="8">POÈME</text>
      <text font-family="Georgia, Times New Roman, serif" font-size="${titleFit.size}">${titleSpans}</text>
      <rect x="445" y="259" width="110" height="2"/>
      <text font-family="Georgia, Times New Roman, serif" font-size="${poemFit.size}">${poemSpans}</text>
      <rect x="445" y="1350" width="110" height="2"/>
      <text x="500" y="1400" font-family="Georgia, Times New Roman, serif" font-size="32" letter-spacing="7">AUPOSITEUR</text>
      <text x="500" y="1445" font-family="Courier New, monospace" font-size="22" letter-spacing="3">aupositeur.be</text>
    </g></svg>`;
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300, must-revalidate' } });
};
