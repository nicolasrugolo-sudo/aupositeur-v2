import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';

const escapeXml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const widthWeight = (s: string): number => Array.from(s).reduce((n, c) => n + (c === ' ' ? .3 : /[ilI1'’.,:;!|]/.test(c) ? .3 : /[MW@%&]/.test(c) ? .92 : /[A-ZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸ]/.test(c) ? .68 : .54), 0);
const wrap = (text: string, size: number, width: number): string[] => {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!paragraph.trim()) { lines.push(''); continue; }
    let current = '';
    for (const word of paragraph.trim().split(/\s+/)) {
      const next = current ? current + ' ' + word : word;
      if (widthWeight(next) * size <= width) { current = next; continue; }
      if (current) { lines.push(current); current = ''; }
      if (widthWeight(word) * size <= width) { current = word; continue; }
      for (const letter of Array.from(word)) {
        if (current && widthWeight(current + letter) * size > width) { lines.push(current); current = ''; }
        current += letter;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
};
const fit = (text: string) => {
  for (let size = 90; size >= 12; size--) {
    const lines = wrap(text, size, 840);
    const lineHeight = size * 1.34;
    if (lines.length * lineHeight <= 990) return { size, lines, lineHeight };
  }
  return null;
};
export const getStaticPaths = (async () =>
  (await getCollection('citations')).filter(({ data }) => !data.draft)
    .map(citation => ({ params: { id: citation.id }, props: { citation } }))
) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => {
  const text = String(props.citation.data.text);
  const layout = fit(text);
  if (!layout) return new Response('Citation trop longue pour une image lisible', { status: 422 });
  const { size, lines, lineHeight } = layout;
  const top = 235 + (990 - lines.length * lineHeight) / 2;
  const spans = lines.map((line, i) => `<tspan x="500" y="${Math.round(top + (i + 1) * lineHeight)}">${escapeXml(line)}</tspan>`).join('');
  // Same editorial identity for Pinterest and all other social formats.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1500" viewBox="0 0 1000 1500">
  <defs><filter id="concrete"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="3" seed="9" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".045"/></feComponentTransfer></filter></defs>
  <rect width="1000" height="1500" fill="#f4f4f1"/><rect width="1000" height="1500" filter="url(#concrete)" opacity=".65"/>
  <g fill="#151515" text-anchor="middle">
  <text x="500" y="120" font-family="Courier New, monospace" font-size="25" letter-spacing="10">CITATION</text>
  <rect x="445" y="168" width="110" height="2"/>
  <text font-family="Georgia, Times New Roman, serif" font-size="${size}">${spans}</text>
  <rect x="445" y="1330" width="110" height="2"/>
  <text x="500" y="1390" font-family="Georgia, Times New Roman, serif" font-size="32" letter-spacing="7">AUPOSITEUR</text>
  <text x="500" y="1435" font-family="Courier New, monospace" font-size="22" letter-spacing="3">aupositeur.be</text>
  </g></svg>`;
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300, must-revalidate' } });
};
