import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { Miniflare } from 'miniflare';
import { chromium } from 'playwright';
import worker from '../workers/community-api/index.js';

const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("Test D1"); } };', d1Databases: { DB: 'studio-test' } });
const db = await mf.getD1Database('DB');
const schema = (await readFile('db/community.sql', 'utf8')).replace(/^--.*$/gm, '');
await db.batch(schema.split(';').map(part => part.trim()).filter(sql => sql && !sql.startsWith('PRAGMA')).map(sql => db.prepare(sql)));
const migration=(await readFile('db/migrations/0001_subscriber_consent_events.sql','utf8')).replace(/^--.*$/gm,'');
const applyConsentMigration=()=>db.batch(migration.trim().split(/\n\s*\n/).map(statement=>db.prepare(statement.trim())));
await db.prepare("INSERT INTO subscribers(id,email,status,consent_version) VALUES('legacy','historique@example.invalid','unsubscribed','v0')").run();
await applyConsentMigration();
await applyConsentMigration();
assert.deepEqual((await db.prepare("SELECT event_type,status,consent_version FROM subscriber_consent_events WHERE subscriber_id='legacy'").all()).results,[{event_type:'baseline',status:'unsubscribed',consent_version:'v0'}]);
assert.equal((await db.prepare("SELECT status FROM subscribers WHERE id='legacy'").first()).status,'unsubscribed');
await db.prepare("DELETE FROM subscribers WHERE id='legacy'").run();
assert.equal((await db.prepare("SELECT count(*) AS total FROM subscriber_consent_events WHERE subscriber_id='legacy'").first()).total,0);
const org = 'https://www.aupositeur.be';
const admin = 'Bearer studio_test_admin_token_12345';
const sent = [];
const env = { DB: db, PUBLIC_ORIGIN: org, RATE_LIMIT_PEPPER: 'local-test', TURNSTILE_SECRET: 'local-test', BREVO_API_KEY: 'local-test', SENDER_EMAIL: 'studio@example.invalid' };
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (url === 'https://api.github.com/user') return Response.json({ login: options.headers.authorization === admin ? 'nicolasrugolo-sudo' : 'another-user' });
  if (url === 'https://api.github.com/repos/nicolasrugolo-sudo/aupositeur-v2') return Response.json({ full_name: 'nicolasrugolo-sudo/aupositeur-v2', permissions: { admin: options.headers.authorization === admin } });
  if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') return Response.json({ success: options.body.get('response') === 'valid', hostname: 'www.aupositeur.be' });
  if (url === 'https://api.brevo.com/v3/smtp/email') {
    const payload = JSON.parse(options.body);
    assert.ok(payload.to.every(person => person.email.endsWith('@example.invalid')));
    sent.push(payload);
    if(payload.subject==='Échec fictif Brevo')return Response.json({message:'Quota de test'}, {status:429});
    return Response.json({ messageId: 'local-' + sent.length });
  }
  throw new Error('Réseau extérieur interdit dans cet essai : ' + url);
};
const api = (path, { method = 'GET', body, token, ip } = {}) => worker.fetch(new Request(org + path, {
  method, headers: { origin: org, ...(ip ? { 'cf-connecting-ip': ip } : {}), ...(token ? { authorization: token } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}), env);
const check = async (status, path, options) => {
  const response = await api(path, options);
  assert.equal(response.status, status, path + ' ' + await response.clone().text());
  return response.json();
};
const tokenIn = mail => mail.textContent.match(/token=([0-9a-f]{64})/)[1];
let server;
let browser;
try {
  await check(403, '/api/admin/subscribers');
  await check(403, '/api/admin/subscribers', { token: 'Bearer studio_test_other_token_12345' });
  await check(400, '/api/subscribe', { method: 'POST', body: { email: 'non@example.invalid', consent: 'false' } });
  for (const email of ['alice@example.invalid', 'bob@example.invalid', 'eve@example.invalid']) {
    await check(202, '/api/subscribe', { method: 'POST', body: { email, consent: true, turnstile: 'valid' } });
    if (email.startsWith('eve')) continue;
    const token = tokenIn(sent.at(-1));
    await check(200, '/api/confirm', { method: 'POST', body: { token } });
    await check(410, '/api/confirm', { method: 'POST', body: { token } });
  }
  const confirmedMail = sent.length;
  await check(202, '/api/subscribe', { method: 'POST', body: { email: 'ALICE@EXAMPLE.INVALID', consent: true, turnstile: 'valid' } });
  assert.equal(sent.length, confirmedMail);
  const subscribers = await check(200, '/api/admin/subscribers', { token: admin });
  assert.equal(subscribers.subscribers.filter(s => s.status === 'active').length, 2);
  assert.equal(subscribers.subscribers.filter(s => s.status === 'pending').length, 1);

  const work = { type: 'ecrits', id: 'ouvrage-local', name: 'Lectrice locale', body: 'Commentaire fictif pour la modération.' };
  await check(403, '/api/comments', { method: 'POST', body: { ...work, turnstile: 'invalid' } });
  await check(202, '/api/comments', { method: 'POST', body: { ...work, turnstile: 'valid' } });
  const publicPath = '/api/comments?type=ecrits&id=ouvrage-local';
  assert.equal((await check(200, publicPath)).comments.length, 0);
  const pending = await check(200, '/api/admin/comments?status=pending', { token: admin });
  const comment = pending.comments[0].id;
  const patch = status => check(200, '/api/admin/comments', { method: 'PATCH', token: admin, body: { id: comment, status } });
  await patch('approved');
  assert.equal((await check(200, publicPath)).comments.length, 1);
  await patch('rejected');
  assert.equal((await check(200, publicPath)).comments.length, 0);
  await patch('approved');
  await check(201, '/api/admin/comments/reply', { method: 'POST', token: admin, body: { parent_id: comment, body: 'Réponse locale.' } });
  assert.equal((await check(200, publicPath)).comments.find(item => item.is_author_reply).parent_id, comment);
  await check(200, '/api/admin/comment-settings', { method: 'PUT', token: admin, body: { type: work.type, id: work.id, enabled: false } });
  await check(403, '/api/comments', { method: 'POST', body: { ...work, turnstile: 'valid' } });

  const campaign = await check(201, '/api/admin/campaigns', { method: 'POST', token: admin, body: { subject: 'Newsletter fictive', body_text: 'Un message de vérification locale.' } });
  await check(200, '/api/admin/campaigns', {method:'PATCH',token:admin,body:{id:campaign.id,subject:'Newsletter fictive',body_text:'Texte révisé avant envoi.'}});
  assert.equal((await check(200,'/api/admin/campaigns',{token:admin})).campaigns.find(c=>c.id===campaign.id).body_text,'Texte révisé avant envoi.');
  await check(200, '/api/admin/campaigns/test', { method: 'POST', token: admin, body: { id: campaign.id, email: 'studio@example.invalid' } });
  assert.match(sent.at(-1).subject, /^\[TEST\]/);
  const queue = status => check(status, '/api/admin/campaigns/queue', { method: 'POST', token: admin, body: { id: campaign.id } });
  await queue(200);
  await queue(409);
  await check(409, '/api/admin/campaigns', {method:'PATCH',token:admin,body:{id:campaign.id,subject:'Trop tard',body_text:'Modification après la mise en file.'}});
  const bob = subscribers.subscribers.find(s => s.email.startsWith('bob'));
  const unsubscribeToken = 'a'.repeat(64);
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(unsubscribeToken))).toString('hex');
  await db.prepare("INSERT INTO subscriber_tokens(token_hash,subscriber_id,purpose,expires_at) VALUES(?,?,'unsubscribe',datetime('now','+1 hour'))").bind(hash,bob.id).run();
  await check(200, '/api/unsubscribe', { method: 'POST', body: { token: unsubscribeToken, confirm: true } });
  const scheduled = async () => { let task; await worker.scheduled({}, env, { waitUntil: promise => { task = promise; } }); await task; };
  const before = sent.length;
  await Promise.all([scheduled(),scheduled()]);
  await scheduled();
  assert.deepEqual(sent.slice(before).map(mail => mail.to[0].email), ['alice@example.invalid']);
  assert.match(sent.at(-1).textContent, /desinscription/);
  const sentCampaign=(await check(200, '/api/admin/campaigns', { token: admin })).campaigns.find(c=>c.id===campaign.id);
  assert.equal(sentCampaign.status,'sent');
  assert.deepEqual([sentCampaign.recipients,sentCampaign.accepted,sentCampaign.skipped],[2,1,1]);
  const failed=await check(201,'/api/admin/campaigns',{method:'POST',token:admin,body:{subject:'Échec fictif Brevo',body_text:'Erreur contrôlée du prestataire.'}});
  await check(200,'/api/admin/campaigns/queue',{method:'POST',token:admin,body:{id:failed.id}});
  await scheduled();
  await scheduled();
  const failedRecord=(await check(200,'/api/admin/campaigns',{token:admin})).campaigns.find(c=>c.id===failed.id);
  assert.deepEqual([failedRecord.status,failedRecord.failed],['failed',1]);
  assert.equal(sent.filter(mail=>mail.subject==='Échec fictif Brevo').length,1);
  const actualLink=new URL(sent.find(mail=>mail.subject==='Newsletter fictive').textContent.match(/https:\/\/[^\s]+\/desinscription\/\?token=[0-9a-f]{64}/)[0]);
  assert.equal(actualLink.origin,org);
  await check(400,'/api/unsubscribe',{method:'POST',body:{token:actualLink.searchParams.get('token')}});
  const actualToken=actualLink.searchParams.get('token');
  assert.match(actualToken,/^[a-f0-9]{64}$/);
  assert.equal((await db.prepare("SELECT count(*) AS total FROM subscriber_tokens WHERE token_hash=?").bind(actualToken).first()).total,0);
  await check(202,'/api/comments',{method:'POST',body:{...work,id:'autre-ouvrage-local',turnstile:'valid'}});
  for(let start=0;start<510;start+=30){
    await db.batch(Array.from({length:30},(_,offset)=>db.prepare("INSERT INTO subscribers(id,email,consent_version,created_at) VALUES(?,?,'v1','2000-01-01')").bind('fixture-'+(start+offset),'abonne-'+(start+offset)+'@example.invalid')));
  }
  const lastPage=await check(200,'/api/admin/subscribers?page=11',{token:admin});
  assert.equal(lastPage.total,513);
  assert.equal(lastPage.subscribers.length,13);
  assert.equal((await check(200,'/api/admin/subscribers?status=active&q=ALICE',{token:admin})).total,1);
  assert.equal((await check(200,'/api/admin/subscribers?q=abonne-509%40example.invalid',{token:admin})).total,1);
  await check(400,'/api/admin/subscribers?page=-1',{token:admin});
  console.log('Brouillon modifiable, tentatives concurrentes, échec Brevo sans renvoi et 513 abonnés paginés validés.');
  console.log('D1 isolé : autorisations, opt-in, doublons, modération, réponse, désinscription, test et file d’envoi validés.');

  await mkdir('community-screenshots', { recursive: true });
  const files = {
    '/admin/communaute/': 'public/admin/communaute/index.html',
    '/admin/admin.css': 'public/admin/admin.css',
    '/admin/community-admin.js': 'public/admin/community-admin.js',
    '/admin/community-config.js': 'public/admin/community-config.js',
  };
  const baseline = 'cba96e4ff2955e6a7a5589f40207ba538fc44c1e';
  const previous = file => execFileSync('git', ['show', baseline + ':' + file]);
  const beforeHtml = previous(files['/admin/communaute/']);
  const beforeScript = previous(files['/admin/community-admin.js']);
  server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, org).pathname;
      if (path.startsWith('/api/')) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks);
        const response = await api(req.url, { method: req.method, token: req.headers.authorization, body: body.length ? JSON.parse(body) : undefined });
        res.writeHead(response.status, { 'content-type': 'application/json' }).end(await response.text());
      } else if (path === '/studio-content.json') {
        res.writeHead(200, { 'content-type': 'application/json' }).end('{"collections":{}}');
      } else if (path === '/avant/') {
        res.writeHead(200, { 'content-type': 'text/html' }).end(beforeHtml);
      } else if (req.url.includes('github-session-20261116') && path === '/admin/community-admin.js') {
        res.writeHead(200, { 'content-type': 'application/javascript' }).end(beforeScript);
      } else if (files[path]) {
        res.writeHead(200, { 'content-type': path.endsWith('.js') ? 'application/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html' }).end(await readFile(files[path]));
      } else res.writeHead(404).end();
    } catch (error) { res.writeHead(500).end(error.message); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const local = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch();
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 950 } });
    await page.route('**/*', route => route.request().url().startsWith(local + '/') ? route.continue() : route.abort());
    await page.addInitScript(value => localStorage.setItem('decap-cms-user', JSON.stringify({token:value})), admin.slice(7));
    await page.goto(local + '/avant/');
    await page.getByRole('button', { name: 'Abonnés', exact: true }).click();
    await page.getByText('alice@example.invalid').waitFor();
    await page.screenshot({ path: `community-screenshots/abonnes-${width}-avant.png`, fullPage: true });
    await page.getByRole('button', { name: 'Campagnes', exact: true }).click();
    await page.getByText('Newsletter fictive').waitFor();
    await page.screenshot({ path: `community-screenshots/newsletters-${width}-avant.png`, fullPage: true });
    await page.goto(local + '/admin/communaute/');
    await page.getByRole('button',{name:'Commentaires (1 en attente)',exact:true}).waitFor();
    await page.getByLabel('Statut des commentaires').selectOption('approved');
    await page.getByText(work.body, { exact: true }).waitFor();
    await page.screenshot({ path: `community-screenshots/moderation-${width}.png`, fullPage: true });
    const tab = page.getByRole('button', { name: 'Abonnés', exact: true });
    await tab.focus();
    await page.keyboard.press('Enter');
    await page.getByLabel('Rechercher par adresse').fill('bob');
    await page.getByText('1 résultat(s) · Page 1 sur 1', {exact:true}).waitFor();
    await page.getByText('bob@example.invalid').waitFor();
    assert.equal(await page.getByText('alice@example.invalid').count(), 0);
    await page.screenshot({ path: `community-screenshots/abonnes-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Newsletters', exact: true }).click();
    await page.getByLabel('Objet').fill('Brouillon navigateur ' + width);
    await page.getByLabel('Message', { exact: true }).fill('Aperçu éditorial local.');
    await page.getByRole('button', { name: 'Aperçu mobile' }).click();
    await page.getByText('Aperçu éditorial local.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
    await page.getByText('Brouillon enregistré.', { exact: true }).waitFor();
    const card=page.locator('article').filter({hasText:'Brouillon navigateur '+width});
    await card.getByRole('button',{name:'Modifier le brouillon'}).click();
    await page.getByLabel('Objet').fill('Brouillon révisé '+width);
    await page.getByRole('button',{name:'Réenregistrer le brouillon'}).click();
    await page.getByText('Brouillon révisé '+width,{exact:true}).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `community-screenshots/newsletters-${width}.png`, fullPage: true });
    await page.close();
  }
  await check(200,'/api/unsubscribe',{method:'POST',body:{token:actualToken,confirm:true}});
  await check(410,'/api/unsubscribe',{method:'POST',body:{token:actualToken,confirm:true}});
  assert.equal((await check(200,'/api/admin/subscribers?status=unsubscribed&q=alice',{token:admin})).total,1);
  const aliceId=subscribers.subscribers.find(s=>s.email.startsWith('alice')).id;
  const history=async id=>(await db.prepare("SELECT event_type FROM subscriber_consent_events WHERE subscriber_id=? ORDER BY event_id").bind(id).all()).results.map(row=>row.event_type);
  assert.deepEqual(await history(aliceId),['requested','confirmed','withdrawn']);
  await check(202,'/api/subscribe',{method:'POST',ip:'192.0.2.10',body:{email:'alice@example.invalid',consent:true,turnstile:'valid'}});
  assert.deepEqual(await history(aliceId),['requested','confirmed','withdrawn','requested']);
  console.log('Migration additive, rejouable et historique d’opposition préservé après réinscription.');
  console.log('Lien de campagne généré : confirmation explicite et jeton à usage unique vérifiés.');
  await check(200, '/api/admin/comments', { method: 'DELETE', token: admin, body: { id: comment } });
  await check(200, '/api/admin/subscribers', { method: 'DELETE', token: admin, body: { id: bob.id } });
  assert.equal((await check(200, '/api/admin/subscribers', { token: admin })).subscribers.some(entry => entry.id === bob.id), false);
  assert.equal((await check(200, publicPath)).comments.some(entry => entry.id === comment), false);
  console.log('Suppression des deux fixtures vérifiée uniquement dans D1 local.');
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  globalThis.fetch = realFetch;
  await mf.dispose();
}
