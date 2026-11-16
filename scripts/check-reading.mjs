import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';

const before = 'http://127.0.0.1:4322';
const after = 'http://127.0.0.1:4323';
const current = 'http://127.0.0.1:4324';
const revisions = [
  ['avant', before, 'aaf3f76ceced8b5f32869e8dcf32e51dad8dd8e3'],
  ['apres', after, '9fa5d4fc0190f7795fe55d1235158c8d7ac6d390'],
  ['ajuste', current, process.env.GITHUB_SHA],
];
function assertDifferent(first, second, label) {
  const a = PNG.sync.read(first);
  const b = PNG.sync.read(second);
  assert.ok(a.width !== b.width || a.height !== b.height || !a.data.equals(b.data), 'Pixel-identical screenshots: ' + label);
  console.log(`Pixels distincts ${label} (${a.width}×${a.height} / ${b.width}×${b.height})`);
}
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
      return revisions.some(([, origin]) => origin === url.origin) ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    for (const [kind, path, selector] of examples) {
      let original;
      let baselineImage;
      for (const [version, origin, sha] of revisions) {
        assert.equal(await (await page.request.get(origin + '/__revision.txt')).text(), sha);
        const assets = [];
        const collect = request => {
          if (['stylesheet', 'script'].includes(request.resourceType()) && !request.url().includes('turnstile')) assets.push(request.url());
        };
        page.on('request', collect);
        assert.equal((await page.goto(origin + path)).status(), 200, path);
        page.off('request', collect);
        assert.equal(new URL(page.url()).origin, origin);
        assert.equal(await page.locator('.ap-reading').count(), version === 'avant' ? 0 : 1, 'Wrong reading template: ' + sha);
        const localAssets = assets.filter(url => revisions.some(([, host]) => url.startsWith(host + '/')));
        assert.ok(localAssets.some(url => url.endsWith('.css')), 'No local CSS loaded: ' + sha);
        assert.ok(localAssets.some(url => url.includes('.js')), 'No local JS loaded: ' + sha);
        assert.ok(localAssets.every(url => new URL(url).origin === origin), 'Cross-version assets: ' + sha);
        const rendered = await page.locator(selector).innerHTML();
        if (version === 'avant') original = rendered;
        else assert.equal(rendered, original, 'Rendered work changed: ' + path);
        await page.locator('.aup-comments-list').getByText('Commentaire de démonstration').waitFor();
        const screenshot = await page.screenshot({ path: `reading-screenshots/${kind}-${device}-${version}.png`, fullPage: true });
        if (version === 'avant') baselineImage = screenshot;
        else assertDifferent(baselineImage, screenshot, `${kind} ${device} ${version}`);
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
      assert.equal((await page.request.get(current + href)).status(), 200);
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
