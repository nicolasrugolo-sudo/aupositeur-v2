import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const escapeXml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const weight = (text: string): number => Array.from(text).reduce((sum, ch) => sum + (ch === ' ' ? .3 : /[ilI1'’.,:;!|]/.test(ch) ? .3 : /[MW@%&]/.test(ch) ? .92 : /[A-ZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸ]/.test(ch) ? .68 : .54), 0);
const wrap = (text: string, size: number, maxWidth: number): string[] => {
  const lines: string[] = [];
  let current = '';
  for (const word of text.trim().split(/\s+/)) {
    const candidate = current ? current + ' ' + word : word;
    if (weight(candidate) * size <= maxWidth) { current = candidate; continue; }
    if (current) { lines.push(current); current = ''; }
    if (weight(word) * size <= maxWidth) { current = word; continue; }
    for (const letter of Array.from(word)) {
      if (current && weight(current + letter) * size > maxWidth) { lines.push(current); current = ''; }
      current += letter;
    }
  }
  if (current) lines.push(current);
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
export const getStaticPaths = (async () => {
  const reflections = (await getCollection('reflexions')).filter(({data}) => !data.draft)
    .map(entry => ({ params: { id: `reflexions/${entry.id}` }, props: { title: entry.data.title, kind: 'RÉFLEXION', artwork: entry.data.socialPhoto || '' } }));
  const songs = (await getCollection('musiques')).filter(({data}) => !data.draft)
    .map(entry => ({ params: { id: `musique/${entry.id}` }, props: { title: entry.data.title, kind: 'MUSIQUE', artwork: entry.data.cover || '' } }));
  return [...reflections, ...songs];
}) satisfies GetStaticPaths;
const inlineArtwork = async (path: string): Promise<string> => {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('..')) return '';
  const ext = path.split('?')[0].split('.').pop()?.toLowerCase();
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : '';
  if (!mime) return '';
  try {
    const bytes = await readFile(join(process.cwd(), 'public', decodeURIComponent(path.split('?')[0]).replace(/^\\/+/, '')));
    return 'data:' + mime + ';base64,' + bytes.toString('base64');
  } catch { return ''; }
};
export const GET: APIRoute = async ({ props }) => {
  const title = String(props.title);
  const kind = String(props.kind);
  const artwork = String(props.artwork || '');
  const artworkData = await inlineArtwork(artwork);
  const safeArtwork = Boolean(artworkData);
  const fitted = (() => { for (let size = 64; size >= 14; size--) { const lines = wrap(title, size, 950); const step = size * 1.24; if (lines.length * step <= 320) return { size, lines, step }; } return null; })();
  if (!fitted) return new Response('Titre trop long pour un aperçu lisible', { status: 422 });
  const top = 510 + (320 - fitted.lines.length * fitted.step) / 2;
  const titleX = 600;
  const spans = fitted.lines.map((line, i) => `<tspan x="${titleX}" y="${Math.round(top + (i + 1) * fitted.step)}">${escapeXml(line)}</tspan>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
    <defs><filter id="concrete"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="3" seed="9" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".045"/></feComponentTransfer></filter><filter id="monochrome" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/></filter><clipPath id="artworkFrame"><rect x="285" y="155" width="630" height="335" rx="2"/></clipPath></defs>
    <rect width="1200" height="1200" fill="#f4f4f1"/><rect width="1200" height="630" filter="url(#concrete)" opacity=".65"/>
    ${safeArtwork ? `<rect x="279" y="149" width="642" height="347" fill="#e4e4e0"/><g clip-path="url(#artworkFrame)"><image href="${escapeXml(artworkData)}" x="285" y="155" width="630" height="335" preserveAspectRatio="xMidYMid slice" filter="url(#monochrome)"/></g><rect x="85" y="157" width="420" height="336" fill="none" stroke="#151515" stroke-opacity=".12"/>` : ''}
    <g fill="#151515" text-anchor="middle">
      <text x="${titleX}" y="98" font-family="Courier New, monospace" font-size="23" letter-spacing="9">${escapeXml(kind)}</text>
      <rect x="${titleX - 55}" y="122" width="110" height="2"/>
      <text font-family="Georgia, Times New Roman, serif" font-size="${fitted.size}">${spans}</text>
      <rect x="545" y="1010" width="110" height="2"/>
      <text x="600" y="1060" font-family="Georgia, Times New Roman, serif" font-size="24" letter-spacing="6">AUPOSITEUR</text>
      <text x="600" y="1100" font-family="Courier New, monospace" font-size="16" letter-spacing="2">aupositeur.be</text>
    </g></svg>`;
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=300, must-revalidate' } });
};
