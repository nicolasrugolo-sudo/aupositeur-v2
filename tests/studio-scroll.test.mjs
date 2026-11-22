import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { chromium } from 'playwright';

const moduleUrl = 'http://studio.test/admin/pilotage/';
const viewports = [[390, 844], [768, 1024], [1366, 768], [1920, 1080]];

test('Pilotage reaches the bottom inside a clipped iframe', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://studio.test') return route.abort();
      if (url.pathname === '/') {
        return route.fulfill({ contentType: 'text/html', body:
          '<!doctype html><style>body { margin: 0; overflow: hidden } iframe { width: 100%; height: 70vh; border: 0; display: block }</style>' +
          '<iframe title="Pilotage" src="' + moduleUrl + '"></iframe>' });
      }
      if (url.href === moduleUrl || url.pathname.endsWith('.css')) {
        const file = url.href === moduleUrl ? 'public/admin/pilotage/index.html' : 'public' + url.pathname;
        return route.fulfill({ contentType: file.endsWith('.css') ? 'text/css' : 'text/html', body: await readFile(file, 'utf8') });
      }
      return route.abort();
    });
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height });
      await page.goto('http://studio.test/');
      const frame = page.frameLocator('iframe');
      const document = frame.locator('html');
      const metrics = () => document.evaluate(element => ({
        top: element.scrollTop, height: element.clientHeight, fullHeight: element.scrollHeight,
        width: element.clientWidth, fullWidth: element.scrollWidth
      }));
      const first = await metrics();
      assert.equal(first.fullWidth, first.width, 'horizontal overflow at ' + width);
      await page.mouse.move(width / 2, height / 3);
      await page.mouse.wheel(0, 450);
      await page.waitForFunction(() => document.querySelector('iframe').contentDocument.documentElement.scrollTop > 0);
      await frame.getByRole('link', { name: 'Nouvel écrit' }).focus();
      await page.keyboard.press('End');
      await page.waitForFunction(() => {
        const root = document.querySelector('iframe').contentDocument.documentElement;
        return root.scrollHeight - root.clientHeight - root.scrollTop <= 2;
      });
      assert.ok((await metrics()).top > 0);
    }
  } finally {
    await browser.close();
  }
});
