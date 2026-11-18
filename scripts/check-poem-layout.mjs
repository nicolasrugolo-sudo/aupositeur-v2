import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

// Verify the published HTML follows the Markdown saved by Decap Studio.
// A non-empty source line is a verse; a blank line separates stanzas.
// No poetry text is modified by this check.
const root = 'src/content/poemes';
const files = (await readdir(root)).filter(name => name.endsWith('.md'));
let checked = 0;
const failures = [];
for (const name of files) {
  const source = await readFile(join(root, name), 'utf8');
  const frontmatterEnd = source.startsWith('---') ? source.indexOf('\n---', 3) : -1;
  const body = (frontmatterEnd >= 0 ? source.slice(frontmatterEnd + 4) : source).trim();
  if (!body || /^(?:\s*[`~]{3}|\s*<|\s*[-*+]\s|\s*\d+\.\s)/m.test(body)) continue;
  const stanzas = body.split(/\r?\n\s*\r?\n+/).filter(Boolean);
  const expectedBreaks = stanzas.reduce((n, stanza) => n + stanza.split(/\r?\n/).filter(Boolean).length - 1, 0);
  const slug = name.slice(0, -3);
  let html;
  try {
    html = await readFile(join('dist', 'ecrits', slug, 'index.html'), 'utf8');
  } catch {
    // Draft poems are intentionally absent from the public build.
    continue;
  }
  const marker = /<div[^>]*class="[^"]*ap-poem__body[^"]*"[^>]*>/;
  const match = marker.exec(html);
  if (!match) { failures.push(slug + ': poem body missing'); continue; }
  const after = html.slice(match.index + match[0].length);
  const end = after.indexOf('</div>');
  const rendered = after.slice(0, end < 0 ? undefined : end);
  const paragraphs = (rendered.match(/<p(?:\s[^>]*)?>/g) || []).length;
  const breaks = (rendered.match(/<br\s*\/?\s*>/g) || []).length;
  if (paragraphs !== stanzas.length || breaks !== expectedBreaks) {
    failures.push(slug + ': expected ' + stanzas.length + ' stanzas/' + expectedBreaks + ' verse breaks, got ' + paragraphs + '/' + breaks);
  }
  checked++;
}
if (failures.length) {
  console.error('Poem layout mismatch:\n' + failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Poem layout OK: ' + checked + ' published Markdown poems checked.');
}
