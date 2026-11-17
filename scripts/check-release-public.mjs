import assert from 'node:assert/strict';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const local='http://127.0.0.1:4340';
const canonical='https://www.aupositeur.be';
const sitemap=await readFile('dist/sitemap.xml','utf8');
const paths=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>new URL(match[1]).pathname);
assert.equal(new Set(paths).size,paths.length);
const routes=[
 ['accueil','/'], ['ecrits','/ecrits/'], ['reflexions','/reflexions/'],
 ['citations','/citations/'], ['musiques','/musique/'], ['livres','/livres/'],
 ['theme','/themes/societe/'], ['poeme','/ecrits/plus-vieux-que-moi-meme/'],
 ['reflexion','/reflexions/nous-naissons-dans-la-vie-des-autres/'],
 ['fiche-livre','/livres/de-fil-et-de-chair/'],
 ...['citations','musique'].map(type=>[type+'-fiche',paths.find(path=>path.startsWith('/'+type+'/')&&path!=='/'+type+'/')]),
];
const redirects=(await readFile('dist/_redirects','utf8')).split('\n').filter(line=>line.trim()&&!line.startsWith('#')).map(line=>line.trim().split(/\s+/));
assert.ok(redirects.some(([source,target,code])=>source==='/boutique/'&&new URL(target).hostname==='aupositeur-shop.fourthwall.com'&&code==='301'));
const failures=[];
const inventory=[];
const facts=[];
const parseCanonical=html=>html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/)?.[1];
for(const url of paths){
 const decoded=decodeURIComponent(url);
 try {
  const html=await readFile('dist'+decoded+(decoded.endsWith('/')?'index.html':'/index.html'),'utf8');
  const tag=parseCanonical(html);
  if(!tag||new URL(tag).origin!==canonical||decodeURIComponent(new URL(tag).pathname)!==decoded)inventory.push({type:'canonique',url,tag});
 }catch{inventory.push({type:'sitemap sans page',url});}
}
const files=(await readdir('dist',{recursive:true})).filter(path=>path.endsWith('.html')&&!path.startsWith('admin/'));
const fileSet=new Set(await readdir('dist',{recursive:true}));
const ignored=new Set();
for(const file of files){
 const html=await readFile('dist/'+file,'utf8');
 const pageUrl=new URL('/'+file.replace(/index\.html$/,''),canonical);
 for(const match of html.matchAll(/<a\s[^>]*href="([^"]+)"/gi)){
  let target;
  try{target=new URL(match[1].replaceAll('&amp;','&'),pageUrl);}catch{continue;}
  if(target.origin!==canonical||target.pathname.startsWith('/admin/'))continue;
  const path=decodeURIComponent(target.pathname);
  const candidates=[path.slice(1),path.replace(/\/$/,'').slice(1)+'/index.html',path.replace(/^\//,'').replace(/\/$/,'')+'.html'];
  if(path==='/'||candidates.some(candidate=>fileSet.has(candidate))||redirects.some(([source])=>source===target.pathname||source.endsWith('*')&&target.pathname.startsWith(source.slice(0,-1))))continue;
  const key=pageUrl.pathname+' → '+path;
  if(!ignored.has(key)){ignored.add(key);inventory.push({type:'lien interne introuvable',page:pageUrl.pathname,url:path});}
 }
}
console.log('Inventaire',JSON.stringify({sitemap:paths.length,pages:files.length,redirections:redirects.length,findings:inventory},null,2));
await mkdir('release-screenshots',{recursive:true});
const browser=await chromium.launch();
try{
 for(const [device,width] of [['ordinateur',1440],['tablette',768],['mobile',390]]){
  for(const [name,path] of routes){
   const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:name==='citations'?.25:1,reducedMotion:'reduce'});
   await context.route('**/*',route=>{
    const request=route.request();
    if(request.url().startsWith(local+'/')&&request.method()==='GET')return route.continue();
    if(new URL(request.url()).pathname==='/api/comments'&&request.method()==='GET')return route.fulfill({json:{enabled:true,comments:[]},headers:{'Access-Control-Allow-Origin':'*'}});
    return route.abort();
   });
   const page=await context.newPage();
   try{
    assert.equal((await page.goto(local+path)).status(),200);
    assert.equal(await page.locator('main h1').count(),1);
    await page.locator('main img[loading="lazy"]').evaluateAll(nodes=>nodes.forEach(img=>{img.loading='eager'}));
    await page.screenshot({path:`release-screenshots/${name}-${device}.png`,fullPage:true,timeout:45000});
    const metrics=await page.evaluate(()=>{
      const navigation=performance.getEntriesByType('navigation')[0];
      return {overflow:document.documentElement.scrollWidth>innerWidth,domContentLoadedMs:Math.round(navigation.domContentLoadedEventEnd),transferBytes:performance.getEntriesByType('resource').reduce((bytes,entry)=>bytes+entry.transferSize,navigation.transferSize)};
    });
    assert.equal(metrics.overflow,false,'Débordement horizontal');
    await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
    const axe=await page.evaluate(async()=> (await window.axe.run('main',{runOnly:['color-contrast','button-name','link-name','image-alt','heading-order']})).violations.map(rule=>({id:rule.id,count:rule.nodes.length,example:rule.nodes[0].target})));
    facts.push({name,device,...metrics,axe});
    const filter=page.locator('[data-theme-filter] button:not([data-theme="all"])').first();
    if(await filter.isVisible()){
      await filter.focus();
      await page.keyboard.press('Enter');
      assert.equal(await filter.getAttribute('aria-pressed'),'true');
      await page.locator('[data-theme="all"]').click();
    }
    const comments=page.locator('.aup-comments-toggle');
    if(await comments.isVisible()){
      await comments.focus();
      await page.keyboard.press('Enter');
      await page.locator('.aup-comments-form').waitFor();
    }
    if(name==='poeme'){
      await page.locator('[data-share-menu]').focus();
      await page.keyboard.press('Enter');
      await page.locator('[data-copy-poem]').waitFor();
    }
   }catch(error){failures.push(`${device} ${name}: ${error.message}`);}
   finally{await context.close()}
  }
 }
}finally{await browser.close()}
console.log('Résultats navigateur',JSON.stringify(facts,null,2));
assert.deepEqual(failures,[]);
