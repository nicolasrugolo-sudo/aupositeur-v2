import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const groups = [
  { source: 'social/citations', target: 'social/previews/citations' },
  { source: 'social/facebook/ecrits', target: 'social/previews/ecrits' },
];
let count = 0;
for (const group of groups) {
  const sourceDir = join(dist, group.source);
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) { await walk(file); continue; }
      if (!entry.isFile() || !entry.name.endsWith('.svg')) continue;
      const output = join(dist, group.target, relative(sourceDir, file).replace(/\.svg$/, '.png'));
      await mkdir(dirname(output), { recursive: true });
      const svg = await readFile(file);
      await writeFile(output, await sharp(svg, { density: 144 })
        .resize(1200, 630, { fit: 'contain', background: '#f4f4f1' })
        .flatten({ background: '#f4f4f1' })
        .png({ compressionLevel: 9 }).toBuffer());
      count++;
    }
  }
  await walk(sourceDir);
}
if (!count) throw new Error('No social SVG previews found: refusing incomplete build');
console.log('Generated ' + count + ' local PNG social previews.');
