import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const [settingsPath, target] = process.argv.slice(2);
assert.ok(settingsPath && target, 'Usage: node scripts/prepare-remote-rehearsal.mjs settings.json dossier-neuf');
const settings = JSON.parse(await readFile(settingsPath, 'utf8'));
const keys = ['siteOrigin', 'oauthOrigin', 'communityOrigin', 'githubRepo', 'githubBranch', 'd1Id'];
assert.deepEqual(Object.keys(settings).sort(), keys.sort(), 'Les paramètres ne doivent contenir aucun secret.');
const names = {
  siteOrigin: /^aupositeur-recette\.pages\.dev$/,
  oauthOrigin: /^aupositeur-recette-oauth\.[a-z0-9-]+\.workers\.dev$/,
  communityOrigin: /^aupositeur-recette-community\.[a-z0-9-]+\.workers\.dev$/,
};
for (const [key, hostname] of Object.entries(names)) {
  const url = new URL(settings[key]);
  assert.ok(url.protocol === 'https:' && url.origin === settings[key] && hostname.test(url.hostname), 'Origine de recette invalide : ' + key);
}
assert.match(settings.githubRepo, /^[a-z0-9-]+\/aupositeur-recette$/i);
assert.notEqual(settings.githubRepo.split('/')[0].toLowerCase(), 'nicolasrugolo-sudo', 'Le compte de recette doit être distinct.');
assert.equal(settings.githubBranch, 'recette-editoriale');
const root = new URL('../', import.meta.url);
const prodD1 = JSON.parse(await readFile(new URL('workers/community-api/wrangler.jsonc', root), 'utf8')).d1_databases[0].database_id;
assert.match(settings.d1Id, /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
assert.notEqual(settings.d1Id.toLowerCase(), prodD1.toLowerCase(), 'Identifiant D1 de production interdit.');
assert.ok(!/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(settings.d1Id));

const source = await readFile(new URL('public/admin/config.yml', root), 'utf8');
const backend = /^backend:\n(?:[ \t]+[^\n]*\n)+/;
assert.match(source, backend);
const decap = source.replace(backend, [
  'backend:', '  name: github', '  repo: '+settings.githubRepo, '  branch: '+settings.githubBranch,
  '  base_url: '+settings.oauthOrigin, '  auth_endpoint: /auth', '  auth_scope: public_repo',
  '  site_domain: '+new URL(settings.siteOrigin).hostname, '',
].join('\n'));
const output = resolve(target);
await mkdir(output);
const writeJson = (name, data) => writeFile(join(output,name), JSON.stringify(data,null,2)+'\n',{flag:'wx'});
await writeFile(join(output,'decap.config.yml'),decap,{flag:'wx'});
await writeJson('oauth.wrangler.json',{
  name:'aupositeur-recette-oauth',
  main:'./oauth-entry.ts',
  compatibility_date:'2026-11-16',
  routes:[],
  vars:{DECAP_SITE_ORIGIN:settings.siteOrigin,GITHUB_REPO_PRIVATE:'0'},
});
await writeJson('community.wrangler.json',{
  name:'aupositeur-recette-community',
  main:'./community-entry.js',
  compatibility_date:'2026-11-16',
  routes:[],
  vars:{PUBLIC_ORIGIN:settings.siteOrigin},
  d1_databases:[{binding:'DB',database_name:'aupositeur-recette-d1',database_id:settings.d1Id}],
  triggers:{crons:[]},
});
await writeJson('isolation.json',{
  ...settings,
  buckets:['aupositeur-recette-audio','aupositeur-recette-impression'],
  newsletters:'disabled',
  note:'Fichiers de préparation. Les points d’entrée des Workers et les liaisons R2 doivent être adaptés et revus avant tout déploiement.',
});
console.log('Configurations de recette générées. Aucun déploiement effectué.');
