import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';

const versions = [
  { label: 'avant', origin: 'http://127.0.0.1:4331', sha: process.env.CATALOGUE_BASE },
  { label: 'apres', origin: 'http://127.0.0.1:4332', sha: process.env.GITHUB_SHA },
];
const changedCatalogues = new Set(['ecrits', 'citations', 'livres']);
const routes = [
  ['ecrits', '/ecrits/', '.ap-writing__title'],
  ['reflexions', '/reflexions/', '.ap-writing__title'],
  ['citations', '/citations/', '.ap-citation__actions a'],
  ['musiques', '/musique/', '[data-track] a[href^="/musique/"]'],
  ['livres', '/livres/', '.ap-book__primary'],
  ['de-fil-et-de-chair', '/livres/de-fil-et-de-chair/', '.ap-book-detail__back'],
  ['aux-cent-maux-sans-visage', '/livres/aux-cent-maux-sans-visage/', '.ap-book-detail__back'],
];

const wav = Buffer.alloc(44 + 8000 * 2 * 6);
wav.write('RIFF', 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24);
wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(wav.length - 44, 40);

await mkdir('catalogue-screenshots', { recursive: true });
const browser = await chromium.launch();
const problems = [];
const audits = [];
try {
  for (const [device, width] of [['ordinateur', 1440], ['mobile', 390]]) {
    for (const [name, path, itemLink] of routes) {
      let baseline;
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        deviceScaleFactor: name === 'citations' ? .25 : 1,
        reducedMotion: 'reduce',
      });
      await context.route('**/*', async route => {
        const request = route.request();
        const origin = new URL(request.url()).origin;
        if (versions.some(version => version.origin === origin)) return route.continue();
        if (request.resourceType() === 'media') {
          const match = /^bytes=(\d+)-(\d*)$/.exec(request.headers().range ?? '');
          if (!match) return route.fulfill({ contentType: 'audio/wav', headers: { 'Accept-Ranges': 'bytes' }, body: wav });
          const start = Number(match[1]);
          const end = match[2] ? Math.min(Number(match[2]), wav.length - 1) : wav.length - 1;
          return route.fulfill({
            status: 206,
            contentType: 'audio/wav',
            headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${wav.length}` },
            body: wav.subarray(start, end + 1),
          });
        }
        return request.resourceType() === 'image' ? route.continue() : route.abort();
      });
      try {
        for (const { label, origin, sha } of versions) {
          const page = await context.newPage();
          const assets = [];
          page.on('response', response => {
            if (['stylesheet', 'script'].includes(response.request().resourceType()) && response.ok()) assets.push(response.url());
          });
          assert.equal((await page.goto(origin + path)).status(), 200);
          assert.equal(await (await page.request.get(origin + '/__revision.txt')).text(), sha);
          assert.equal(new URL(page.url()).origin, origin);
          assert.equal(await page.locator('.ap-catalog, .ap-publication').count(), 1);
          assert.ok(assets.some(url => url.endsWith('.css')) && assets.some(url => url.includes('.js')));
          assert.ok(assets.every(url => new URL(url).origin === origin));
          await page.locator('main img[loading="lazy"]').evaluateAll(images => images.forEach(image => { image.loading = 'eager'; }));
          await page.evaluate(() => Promise.race([
            Promise.allSettled(Array.from(document.querySelectorAll('main img'), image => image.decode())),
            new Promise(resolve => setTimeout(resolve, 2500)),
          ]));
          const file = `catalogue-screenshots/${name}-${device}-${label}.png`;
          const png = PNG.sync.read(await page.screenshot({ path: file, fullPage: true, timeout: 45000 }));
          if (label === 'avant') {
            baseline = png;
          } else {
            if (changedCatalogues.has(name)) assert.ok(png.width !== baseline.width || png.height !== baseline.height || !png.data.equals(baseline.data), 'Captures identiques');
            assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), 'https://www.aupositeur.be' + path);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Débordement');
            const href = await page.locator(itemLink).first().getAttribute('href');
            assert.equal((await page.request.get(new URL(href, origin).href)).status(), 200, href);
            const filter = page.locator('[data-theme-filter] button:not([data-theme="all"])').first();
            if (await filter.count()) {
              await filter.focus();
              assert.ok(await filter.evaluate(button => button.matches(':focus-visible')));
              await page.keyboard.press('Enter');
              assert.equal(await filter.getAttribute('aria-pressed'), 'true');
              const id = await filter.getAttribute('data-theme');
              assert.ok(await page.locator('[data-theme-item]:not([hidden])').count());
              assert.ok(await page.locator('[data-theme-item]:not([hidden])').evaluateAll((items, theme) => items.every(item => item.dataset.categories.split(' ').includes(theme)), id));
              await page.locator('[data-theme="all"]').click();
            } else {
              await page.locator(itemLink).first().focus();
              assert.ok(await page.locator(itemLink).first().evaluate(link => link.matches(':focus-visible')));
            }
            if (name === 'musiques') {
              const track = page.locator('[data-track]:has(audio)').first();
              const toggle = track.locator('.track-toggle');
              if (await toggle.count()) {
                assert.ok(await track.locator('.track-detail').evaluate(element => element.inert));
                await toggle.focus();
                await page.keyboard.press('Enter');
                assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
                assert.ok(await track.locator('.track-detail').evaluate(element => !element.inert));
              }
              const audio = track.locator('audio');
              const play = track.locator('.play');
              await play.focus();
              await page.keyboard.press('Enter');
              await track.locator('.play[aria-pressed="true"]').waitFor({ timeout: 5000 });
              assert.ok(await audio.evaluate(element => !element.paused));
              await audio.evaluate(element => element.pause());
              await track.locator('input[type="range"]').evaluate(element => {
                element.value = '50';
                element.dispatchEvent(new Event('input', { bubbles: true }));
              });
              await page.waitForFunction(() => Array.from(document.querySelectorAll('audio')).some(audio => !audio.seeking && audio.currentTime >= 2 && audio.currentTime <= 4), null, { timeout: 8000 });
              await track.locator('.play[aria-pressed="false"]').waitFor({ timeout: 5000 });
            }
            await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
            const findings = await page.evaluate(async () => (await window.axe.run('main', {
              runOnly: ['color-contrast', 'button-name', 'link-name', 'image-alt'],
            })).violations.map(({ id, nodes }) => ({ id, count: nodes.length, examples: nodes.slice(0, 3).map(node => node.target) })));
            audits.push({ device, name, findings, before: [baseline.width, baseline.height], after: [png.width, png.height] });
          }
          await page.close();
        }
      } catch (error) {
        problems.push(device + ' ' + name + ': ' + error.stack);
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify(audits, null, 2));
assert.equal(problems.length, 0, problems.join('\n'));
