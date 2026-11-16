import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const before = 'http://127.0.0.1:4322';
const after = 'http://127.0.0.1:4321';
const examples = [
  ['poeme', '/ecrits/plus-vieux-que-moi-meme/', '.ap-poem__body'],
  ['reflexion', '/reflexions/nous-naissons-dans-la-vie-des-autres/', '.ap-reflexions__body'],
];
await mkdir('reading-screenshots', { recursive: true });
const browser = await chromium.launch();
try {
  for (const [device, width] of [['ordinateur', 1440], ['mobile', 390]]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/comments' && route.request().method() === 'GET') {
        return route.fulfill({ json: { comments: [{ author_name: 'Lectrice', body: 'Commentaire de démonstration' }] }, headers: { 'Access-Control-Allow-Origin': '*' } });
      }
      return [before, after].includes(url.origin) ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    for (const [kind, path, selector] of examples) {
      let original;
      for (const [version, origin] of [['avant', before], ['apres', after]]) {
        assert.equal((await page.goto(origin + path)).status(), 200, path);
        const rendered = await page.locator(selector).innerHTML();
        if (version === 'avant') original = rendered;
        else assert.equal(rendered, original, 'Rendered work changed: ' + path);
        await page.locator('.aup-comments-list').getByText('Commentaire de démonstration').waitFor();
        await page.screenshot({ path: `reading-screenshots/${kind}-${device}-${version}.png`, fullPage: true });
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, path);
      await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
      const violations = await page.evaluate(async () => (await window.axe.run('.ap-reading', { runOnly: ['color-contrast'] })).violations);
      assert.deepEqual(violations.map(rule => rule.nodes.map(node => node.target)), [], 'Contrast: ' + path);
      const back = page.locator('.ap-reading__back');
      await back.focus();
      assert.equal(await back.evaluate(link => link.matches(':focus-visible')), true);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => Boolean(document.activeElement.closest('.ap-reading'))), true);
      const href = await back.getAttribute('href');
      assert.equal((await page.request.get(after + href)).status(), 200);
      const form = page.locator('.aup-comments-form');
      assert.equal(await form.isVisible(), false);
      await page.locator('.aup-comments-toggle').focus();
      await page.keyboard.press('Enter');
      await form.waitFor();
      assert.equal(await page.evaluate(() => document.activeElement.name), 'name');
      if (kind === 'poeme') {
        await page.locator('[data-share-menu]').click();
        await page.locator('[data-copy-poem]').click();
      } else {
        await page.locator('[data-copy-url]').click();
      }
      assert.ok((await page.evaluate(() => navigator.clipboard.readText())).includes('https://www.aupositeur.be' + path));
      console.log(`OK ${device} ${kind}: contenu, largeur, contraste, clavier, retour, commentaires et copie`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
