import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';

const escapeXml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const weight = (text: string): number => Array.from(text).reduce((sum, ch) => sum + (ch === ' ' ? .3 : /[ilI1'’.,:;!|]/.test(ch) ? .3 : /[MW@%&]/.test(ch) ? .92 : /[A-ZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸ]/.test(ch) ? .68 : .54), 0);
const wrap = (text: string, size: number, maxWidth: number): string[] => {
  const lines: string[] = [];
  for (const original of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!original.trim()) { lines.push(''); continue; }
    let current = '';
    for (const word of original.trim().split(/\s+/)) {
      const candidate = current ? current + ' ' + word : word;
      if (weight(candidate) * size <= maxWidth) { current = candidate; continue; }
      if (current) { lines.push(current); current = ''; }
      if (weight(word) * size <= maxWidth) { current = word; continue; }
      for (const char of Array.from(word)) {
        if (current && weight(current + char) * size > maxWidth) { lines.push(current); current = ''; }
        current += char;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
};
const fit = (text: string) => {
  for (let size = 66; size >= 14; size--) {
    const lines = wrap(text, size, 980);
    const step = size * 1.25;
    if (lines.length * step <= 320) return { size, lines, step };
  }
  return null;
};
export const getStaticPaths = (async () =>
  (await getCollection('poemes')).filter(({ data }) => !data.draft)
    .map(poeme => ({ params: { id: poeme.id }, props: { poeme } }))
) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => {
  const title = String(props.poeme.data.title);
  const fitted = fit(title);
  if (!fitted) return new Response('Titre trop long pour l’aperçu', { status: 422 });
  const top = 160 + (320 - fitted.lines.length * fitted.step) / 2;
  const spans = fitted.lines.map((line, i) =>
    `<tspan x="600" y="${Math.round(top + (i + 1) * fitted.step)}">${escapeXml(line)}</tspan>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <defs><filter id="concrete"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="3" seed="9" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".045"/></feComponentTransfer></filter></defs>
    <rect width="1200" height="630" fill="#f4f4f1"/><rect width="1200" height="630" filter="url(#concrete)" opacity=".65"/>
    <g fill="#151515" text-anchor="middle">
      <text x="600" y="94" font-family="Courier New, monospace" font-size="23" letter-spacing="9">POÈME</text>
      <rect x="545" y="126" width="110" height="2"/>
      <text font-family="Georgia, Times New Roman, serif" font-size="${fitted.size}">${spans}</text>
      <rect x="545" y="526" width="110" height="2"/>
      <text x="600" y="568" font-family="Georgia, Times New Roman, serif" font-size="24" letter-spacing="6">AUPOSITEUR</text>
      <text x="600" y="602" font-family="Courier New, monospace" font-size="16" letter-spacing="2">aupositeur.be</text>
    </g></svg>`;
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300, must-revalidate' } });
};
