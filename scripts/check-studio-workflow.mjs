import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const studio = 'http://127.0.0.1:4327/studio-test/';
const sandbox = process.env.STUDIO_CHECKOUT;
const git = (...args) => execFileSync('git', ['-C', sandbox, ...args], { encoding: 'utf8' }).trim();
const fixture = 'src/content/reflexions/essai-relecture-studio.md';
const initial = git('rev-parse', 'HEAD');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
page.setDefaultTimeout(12000);
await page.route('**/*', route => ['http://127.0.0.1:4327', 'http://127.0.0.1:8081'].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort());
try {
  await page.goto(studio);
  await page.getByRole('button', { name: /login|connexion|se connecter/i }).first().click();
  await page.getByText('Réflexions', { exact: true }).first().waitFor();
  await page.goto(studio + '#/collections/reflexions/new');
  await page.locator('[id^="title-field"]').fill('Essai relecture Studio');
  await page.locator('[id^="description-field"]').fill('Brouillon fictif du parcours de relecture.');
  await page.locator('[contenteditable="true"]:visible').first().fill('Un texte pour éprouver la relecture locale.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const status = name => page.getByRole('button', { name: new RegExp('^Status: ' + name + '$', 'i') });
  await status('Draft').waitFor();
  assert.equal(git('rev-parse', 'HEAD'), initial);
  assert.equal(existsSync(sandbox + '/' + fixture), false);
  await page.screenshot({ path: 'studio-screenshots/workflow-brouillon.png' });
  console.log('Brouillon natif enregistré en dehors de la branche cible.');

  await status('Draft').click();
  await page.getByText('In review', { exact: true }).click();
  await status('In review').waitFor();
  assert.equal(git('rev-parse', 'HEAD'), initial);
  await page.screenshot({ path: 'studio-screenshots/workflow-relecture.png' });

  await status('In review').click();
  await page.getByText('Ready', { exact: true }).click();
  await status('Ready').waitFor();
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await page.getByText('Publish now', { exact: true }).click();
  for (let attempt = 0; attempt < 35 && !existsSync(sandbox + '/' + fixture); attempt++) {
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  assert.match(readFileSync(sandbox + '/' + fixture, 'utf8'), /^draft: true$/m);
  assert.equal(git('diff', '--name-only', initial, 'HEAD'), fixture);
  assert.equal(git('branch', '--show-current'), 'test/studio-editorial');
  console.log('Publication locale après relecture :', git('rev-parse', 'HEAD'));
  await page.screenshot({ path: 'studio-screenshots/workflow-publication-locale.png' });
} catch (error) {
  await page.screenshot({ path: 'studio-screenshots/workflow-diagnostic.png' }).catch(() => {});
  console.log((await page.locator('body').innerText()).slice(0, 2500));
  throw error;
} finally {
  await browser.close();
}
