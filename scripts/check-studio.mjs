import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const studio = 'http://127.0.0.1:4327/studio-test/';
const proxy = 'http://127.0.0.1:8081';
const sandbox = process.env.STUDIO_CHECKOUT;
const git = (...args) => execFileSync('git', ['-C', sandbox, ...args], { encoding: 'utf8' }).trim();
const directory = 'src/content/reflexions';
const fixture = directory + '/essai-reflexion-studio.md';
const initial = git('rev-parse', 'HEAD');
const title = 'Essai réflexion Studio';
const browser = await chromium.launch();
await mkdir('studio-screenshots', { recursive: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
page.setDefaultTimeout(12000);
const rejected = new Set();
await page.route('**/*', route => {
  if ([new URL(studio).origin, proxy].includes(new URL(route.request().url()).origin)) return route.continue();
  rejected.add(new URL(route.request().url()).origin);
  return route.abort();
});
page.on('pageerror', error => console.log('Navigateur:', error.message));

async function waitForCommit(previous) {
  for (let attempt = 0; attempt < 35; attempt++) {
    const current = git('rev-parse', 'HEAD');
    if (current !== previous) return current;
    await new Promise(resolve => setTimeout(resolve, 350));
  }
  assert.fail('Aucun commit local créé par Decap.');
}
const input = name => page.locator(`[id^="${name}-field"]`).first();
const editable = page.locator('[contenteditable="true"]:visible').first();
async function save() {
  await page.getByRole('button', { name: /^Publish$/i }).last().click();
  await page.getByText('Publish now', { exact: true }).click();
}

try {
  await page.goto(studio);
  const login = page.getByRole('button', { name: /login|connexion|se connecter/i }).first();
  await login.waitFor();
  await login.focus();
  assert.equal(await login.evaluate(node => node.matches(':focus-visible')), true);
  await page.screenshot({ path: 'studio-screenshots/connexion-locale.png' });
  await page.keyboard.press('Enter');
  await page.getByText('Réflexions', { exact: true }).first().waitFor();
  await page.screenshot({ path: 'studio-screenshots/collections-ordinateur.png' });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'studio-screenshots/collections-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 920 });
  await page.goto(studio + '#/collections/reflexions/new');
  await input('title').fill(title);
  await input('description').fill('Chapô de vérification locale.');
  await editable.fill('Une idée, une page.');
  await page.screenshot({ path: 'studio-screenshots/reflexion-editeur.png' });
  const preview = page.frames().find(frame => frame !== page.mainFrame());
  const previewText = await preview?.locator('body').innerText().catch(() => '');
  console.log('Aperçu dans le cadre :', previewText?.includes('Une idée, une page.') ?? false);
  await save();
  const first = await waitForCommit(initial);
  assert.equal(git('branch', '--show-current'), 'test/studio-editorial');
  assert.equal(git('remote'), '');
  assert.equal(git('diff', '--name-only', initial, first), fixture);
  const original = await readFile(sandbox + '/' + fixture, 'utf8');
  assert.match(original, /draft: true/);
  assert.match(original, /Une idée, une page\./);
  console.log('Création locale Decap :', first, fixture);

  await page.goto(studio + '#/collections/reflexions/entries/essai-reflexion-studio');
  await editable.fill('Une idée, une page.');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('Deuxième paragraphe de vérification.');
  await save();
  const second = await waitForCommit(first);
  const updated = await readFile(sandbox + '/' + fixture, 'utf8');
  assert.match(updated, /Deuxième paragraphe de vérification\./);
  assert.notEqual(updated, original);
  assert.equal(git('diff', '--name-only', initial, second), fixture);
  console.log('Modification locale Decap :', second);
  console.log(git('diff', first, second, '--', fixture));

  const richPath = 'src/content/reflexions/essai-formats-studio.md';
  const richBody = '## Intertitre local\n\nUn texte **en gras** et *en italique*.\n\n> Une citation locale.\n\n- Premier élément\n- Second élément\n\n[Lien local](/reflexions/)\n\n![Portrait local](/images/portait-aupositeur.png)\n';
  await writeFile(sandbox + '/' + richPath, '---\ntitle: Essai formats Studio\ndescription: Chapô fictif\nauthor: Aupositeur\nfeatured: false\ncreatedAt: 2026-01-01T12:00:00.000Z\ndraft: true\n---\n\n' + richBody);
  git('add', richPath);
  git('commit', '-m', 'Add disposable rich text reflection');
  const richCommit = git('rev-parse', 'HEAD');
  await page.goto(studio + '#/collections/reflexions/entries/essai-formats-studio');
  await page.reload();
  await page.waitForFunction(() => document.querySelector('[id^="title-field"]')?.value === 'Essai formats Studio');
  await input('description').fill('Chapô fictif après aller-retour.');
  await editable.waitFor();
  await page.screenshot({ path: 'studio-screenshots/reflexion-formats.png' });
  await save();
  const richSaved = await waitForCommit(richCommit);
  assert.equal(git('diff', '--name-only', richCommit, richSaved), richPath);
  const richResult = await readFile(sandbox + '/' + richPath, 'utf8');
  for (const part of ['Intertitre local', 'en gras', 'en italique', 'Une citation locale.', 'Premier élément', 'Second élément', '/reflexions/', '/images/portait-aupositeur.png']) assert.ok(richResult.includes(part), part);
  console.log('Aller-retour des formats Decap :', git('diff', richCommit, richSaved, '--', richPath));

  const poems = await readdir(sandbox + '/src/content/poemes');
  const sample = poems.find(name => name.includes('plus-vieux-que-moi-meme'));
  assert.ok(sample);
  assert.equal(git('diff', initial, 'HEAD', '--', 'src/content/poemes'), '');
  const source = await readFile(sandbox + '/src/content/poemes/' + sample, 'utf8');
  const copyPath = 'src/content/poemes/essai-vers-studio.md';
  const copy = source.replace(/^title:.*$/m, 'title: Essai vers Studio')
    .replace(/^(?:draft|createdAt):.*\r?\n/gm, '')
    .replace(/^---\r?\n/, '---\ndraft: true\ncreatedAt: 2026-01-01T12:00:00.000Z\n');
  await writeFile(sandbox + '/' + copyPath, copy);
  git('add', copyPath);
  git('commit', '-m', 'Add disposable copy of Plus vieux que moi-même');
  const copyCommit = git('rev-parse', 'HEAD');
  await page.goto(studio + '#/collections/ecrits/entries/essai-vers-studio');
  await page.reload();
  await page.waitForFunction(() => document.querySelector('[id^="title-field"]')?.value === 'Essai vers Studio');
  await input('description').fill('Vérification des vers sur une copie locale.');
  await page.screenshot({ path: 'studio-screenshots/copie-poeme.png' });
  await save();
  const poemCommit = await waitForCommit(copyCommit);
  assert.equal(git('diff', '--name-only', copyCommit, poemCommit), copyPath);
  const body = content => content.split(/^---\r?\n/m).slice(2).join('---\n');
  const reloaded = await readFile(sandbox + '/' + copyPath, 'utf8');
  console.log('Copie de Plus vieux que moi-même : corps Markdown strictement identique =', body(copy) === body(reloaded));
  assert.equal(await readFile(sandbox + '/src/content/poemes/' + sample, 'utf8'), source);
  console.log('Origines externes bloquées :', [...rejected].join(', ') || 'aucune requête');
} catch (error) {
  await page.screenshot({ path: 'studio-screenshots/diagnostic.png' }).catch(() => {});
  console.log((await page.locator('body').innerText().catch(() => '')).slice(0, 4500));
  console.log(await page.locator('input, textarea, [contenteditable]').evaluateAll(nodes => nodes.slice(0, 30).map(node => [node.tagName, node.id, node.getAttribute('contenteditable')])));
  throw error;
} finally {
  await browser.close();
}
