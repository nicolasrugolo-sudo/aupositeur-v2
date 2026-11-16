import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = 'http://127.0.0.1:4332';
const canonicalOrigin = 'https://www.aupositeur.be';
const mediaOrigin = 'https://aupositeur-media-api.nicolas-rugolo.workers.dev';
const browser = await chromium.launch();
const failures = [];
const canonical = async (page, path) => {
  assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), canonicalOrigin + path);
};
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce', isMobile: width === 390, hasTouch: width === 390 });
    await page.route('**/*', route => {
      const request = route.request();
      return request.method() === 'GET' && [origin, mediaOrigin].includes(new URL(request.url()).origin)
        ? route.continue() : route.abort();
    });
    try {
      const topic = '/themes/societe/';
      assert.equal((await page.goto(origin + topic)).status(), 200);
      await canonical(page, topic);
      assert.equal(await page.locator('main').count(), 1);
      await page.screenshot({ path: `catalogue-screenshots/theme-societe-${width}.png`, fullPage: true });
      const catalogues = await page.locator('.ap-topic__catalogue').evaluateAll(links => links.map(link => link.getAttribute('href')));
      assert.ok(catalogues.length > 1);
      for (const destination of catalogues) {
        await page.goto(origin + topic);
        const link = page.locator('.ap-topic__catalogue').filter({ hasText: /dans le catalogue/ }).and(page.locator(`[href="${destination}"]`));
        await link.focus();
        await page.keyboard.press('Enter');
        await page.waitForURL(origin + destination);
        const selected = page.locator('[data-theme="societe"]');
        await selected.waitFor();
        assert.equal(await selected.getAttribute('aria-pressed'), 'true');
        await canonical(page, new URL(page.url()).pathname);
        const visible = page.locator('[data-theme-item]:not([hidden])');
        assert.ok(await visible.count());
        assert.ok(await visible.evaluateAll(items => items.every(item => item.dataset.categories.split(' ').includes('societe'))));
        await page.locator('[data-theme="all"]').click();
        assert.equal(new URL(page.url()).search, '');
        await page.goBack();
        assert.equal(await selected.getAttribute('aria-pressed'), 'true');
        if (destination.startsWith('/ecrits/')) {
          const work = visible.first().locator('.ap-writing__title');
          const workPath = await work.getAttribute('href');
          await work.focus();
          await page.keyboard.press('Enter');
          await page.waitForURL(origin + workPath);
          await canonical(page, workPath);
          const related = page.locator('.ap-related li a').first();
          const relatedPath = await related.getAttribute('href');
          assert.notEqual(relatedPath, workPath);
          await related.focus();
          await page.keyboard.press('Enter');
          await page.waitForURL(origin + relatedPath);
          await canonical(page, relatedPath);
          console.log(`Parcours ${width}px : ${topic} → ${destination} → ${workPath} → ${relatedPath}`);
        }
      }
    } catch (error) {
      failures.push('Parcours ' + width + ': ' + error.stack);
    }
    try {
      await page.goto(origin + '/musique/');
      const tracks = page.locator('[data-track]:has(audio)');
      assert.ok(await tracks.count() >= 2);
      for (const track of await tracks.all().then(items => items.slice(0, 2))) {
        const toggle = track.locator('.track-toggle');
        if (await toggle.count()) await toggle.click();
        const audio = track.locator('audio');
        const source = await audio.getAttribute('src');
        assert.equal(new URL(source).origin, mediaOrigin);
        const mediaResponse = page.waitForResponse(response => response.url() === source && [200, 206].includes(response.status()), { timeout: 18000 });
        const [response] = await Promise.all([mediaResponse, track.locator('.play').click()]);
        await track.locator('.play[aria-pressed=true]').waitFor({ timeout: 12000 });
        const initial = await audio.evaluate(element => element.currentTime);
        await page.waitForFunction(({ source, initial }) => [...document.querySelectorAll('audio')].some(element => element.src === source && element.currentTime > initial + .4), { source, initial }, { timeout: 12000 });
        const duration = await audio.evaluate(element => element.duration);
        assert.ok(Number.isFinite(duration) && duration > 0);
        await track.locator('.play').click();
        await track.locator('.play[aria-pressed=false]').waitFor();
        console.log(`R2 ${width}px : HTTP ${response.status()} ; ${duration.toFixed(1)} s ; lecture et pause ; ${source}`);
      }
    } catch (error) {
      failures.push('Audio réel ' + width + ': ' + error.stack);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
assert.equal(failures.length, 0, failures.join('\n'));
