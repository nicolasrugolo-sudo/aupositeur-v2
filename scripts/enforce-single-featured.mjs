import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const groups = {
  'src/content/citations/': 'citation',
  'src/content/poemes/': 'écrit',
  'src/content/musiques/': 'musique',
};

const isFeatured = (content) => /^featured:\s*true\s*$/m.test(content);
const setFeaturedFalse = (content) =>
  content.replace(/^featured:\s*true\s*$/m, 'featured: false');

function changedMarkdownFiles() {
  try {
    return execFileSync('git', ['diff', '--name-only', 'HEAD^', 'HEAD'], { encoding: 'utf8' })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

const changed = changedMarkdownFiles();
let updates = 0;

for (const [folder, label] of Object.entries(groups)) {
  const newlyFeatured = changed.filter((file) => {
    if (!file.startsWith(folder) || !file.endsWith('.md') || !fs.existsSync(file)) return false;
    return isFeatured(fs.readFileSync(file, 'utf8'));
  });

  if (newlyFeatured.length === 0) continue;

  // If one commit somehow promotes several entries in the same collection,
  // keep the last path deterministically and demote all the others.
  const winner = newlyFeatured.at(-1);
  const files = fs.readdirSync(folder)
    .filter((name) => name.endsWith('.md'))
    .map((name) => path.join(folder, name).replaceAll('\\', '/'));

  for (const file of files) {
    if (file === winner) continue;
    const before = fs.readFileSync(file, 'utf8');
    if (!isFeatured(before)) continue;
    fs.writeFileSync(file, setFeaturedFalse(before), 'utf8');
    updates += 1;
    console.log(`[${label}] mise en avant retirée : ${file}`);
  }

  console.log(`[${label}] mise en avant conservée : ${winner}`);
}

console.log(updates === 0
  ? 'Aucune ancienne mise en avant à retirer.'
  : `${updates} ancienne(s) mise(s) en avant retirée(s).`);
