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


test('moderation actions refresh visible rows and counters without touching production', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const script = await readFile('public/admin/communaute/moderation.js','utf8');
    page.on('pageerror', error => console.error(error.message));
    let status='pending';
    const mutations=[];
    await page.route('**/*',async route => {
      const url = new URL(route.request().url());
      if (url.origin!=='http://studio.test') return route.abort();
      const respond=json=>route.fulfill({contentType:'application/json',body:JSON.stringify(json)});
      if(url.pathname==='/test'){
        return route.fulfill({contentType:'text/html',body:`<!doctype html><section></section>
          <script src="/moderation.js"></script><script>
            aupositeurModeration(document.querySelector('section'),async (path,options)=>{
              const response=await fetch(path,options);
              if(!response.ok) throw Error('Erreur de modération');
              return response.json();
            });
          </script>`});
      }
      if(url.pathname==='/moderation.js')return route.fulfill({contentType:'text/javascript',body:script});
      if(url.pathname==='/studio-content.json')return respond({collections:{ecrits:[{slug:'fixture',title:'Œuvre technique'}]}});
      if(url.pathname.endsWith('/bulk')){
        const mutation=route.request().postDataJSON();
        mutations.push(mutation);
        status=mutation.action;
        return respond({ok:true});
      }
      if(url.pathname.endsWith('/reply')){
        mutations.push(route.request().postDataJSON());
        return respond({ok:true});
      }
      if(url.pathname.endsWith('/moderation')){
        const selected=url.searchParams.get('status');
        const counts={all:1,pending:0,approved:0,rejected:0,[status]:1};
        const total=counts[selected];
        return respond({counts,total,limit:25,comments:total?[{
          id:'fixture',author_name:'Auteur technique',body:'Une contribution isolée.',status,
          content_type:'ecrits',content_id:'fixture',created_at:'2026-11-22 11:00:00',
        }]:[]});
      }
      return route.abort();
    });
    await page.goto('http://studio.test/test');
    const checkbox=page.locator('.comment-row input[type=checkbox]');
    try { await checkbox.waitFor({timeout:5000}); }
    catch(error) { throw Error('Fixture introuvable : '+await page.locator('body').innerText(),{cause:error}); }
    await checkbox.check();
    await page.getByRole('combobox',{name:'Action groupée'}).selectOption('approved');
    await page.getByRole('button',{name:'Appliquer',exact:true}).click();
    await page.getByRole('button',{name:'Approuvés 1',exact:true}).click();
    await page.getByRole('button',{name:'Répondre',exact:true}).click();
    await page.getByRole('textbox',{name:'Réponse en tant qu’AUPOSITEUR'}).fill('Réponse technique isolée.');
    await page.getByRole('button',{name:'Publier la réponse'}).click();
    await page.getByText('Réponse publiée.',{exact:true}).waitFor();
    assert.deepEqual(mutations,[
      {ids:['fixture'],action:'approved'},
      {parent_id:'fixture',body:'Réponse technique isolée.'},
    ]);
  } finally {
    await browser.close();
  }
});
