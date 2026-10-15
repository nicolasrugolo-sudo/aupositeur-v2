import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pinterestRange, summaryMetrics, pinterestInsights, pinMetadata } from '../src/pinterest.js';
import worker from '../src/index.js';

test('30 complete UTC days and preceding period across year boundary',()=>{
  assert.deepEqual(pinterestRange(new Date('2026-01-15T10:00:00Z')), {start:'2025-12-16',end:'2026-01-14',previousStart:'2025-11-16',previousEnd:'2025-12-15'});
});
test('missing metrics remain null and real zero is preserved',()=>{
  assert.deepEqual(summaryMetrics({all:{summary_metrics:{IMPRESSION:0,ENGAGEMENT:7}}}),{impressions:0,engagements:7,saves:null,clicks:null});
  assert.throws(()=>summaryMetrics({}),/incomplète/);
});
test('missing secret and forbidden origins make no provider requests',async()=>{
  assert.equal((await pinterestInsights({})).configured,false);
  const response=await worker.fetch(new Request('https://example.test/admin/pinterest-insights'),{});
  assert.equal(response.status,403);
});
test('account totals survive denied top pins and no token leaks',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async url=>url.pathname.endsWith('/top_pins') ? new Response('{}',{status:403}) : Response.json({all:{summary_metrics:{IMPRESSION:12,ENGAGEMENT:3,SAVE:1,OUTBOUND_CLICK:2}}});
  try {
    const result=await pinterestInsights({PINTEREST_ACCESS_TOKEN:'fake-test-one'});
    assert.equal(result.impressions,12); assert.equal(result.previous.impressions,12);
    assert.equal(result.pins,null); assert.equal(result.details.topPinsAvailable,false);
    assert.ok(!JSON.stringify(result).includes('fake-test-one'));
  } finally { globalThis.fetch=original; }
});
test('rejected token surfaces a safe actionable error',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response('{"secret":"do-not-leak"}',{status:401});
  try {
    const response=await worker.fetch(new Request('https://example.test/admin/pinterest-insights',{headers:{Origin:'https://www.aupositeur.be'}}),{PINTEREST_ACCESS_TOKEN:'fake-test-two'});
    assert.equal(response.status,502);
    const body=await response.text(); assert.match(body,/refusé ou expiré/); assert.ok(!body.includes('do-not-leak')); assert.ok(!body.includes('fake-test-two'));
  } finally { globalThis.fetch=original; }
});
test('top pin metadata and real zero clicks survive normalization',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async url=>Response.json(url.pathname.endsWith('/top_pins') ? {pins:[{pin_id:'123',metrics:{IMPRESSION:5,OUTBOUND_CLICK:0}}]} : url.pathname.endsWith('/pins/123') ? {title:'Poème',link:'https://www.aupositeur.be/musique/test/'} : {all:{summary_metrics:{IMPRESSION:5}}});
  try {
    const result=await pinterestInsights({PINTEREST_ACCESS_TOKEN:'fake-test-three'});
    assert.equal(result.pins[0].clicks,0); assert.equal(result.pins[0].title,'Poème'); assert.equal(result.pins[0].engagements,null);
  } finally { globalThis.fetch=original; }
});

test('pin labels use description without inventing missing titles',()=>{
  assert.equal(pinMetadata({title:'  ',description:'Une vraie description'}).title,'Une vraie description');
  assert.equal(pinMetadata({title:'Mon titre',description:'Autre texte'}).titleSource,'title');
  assert.equal(pinMetadata({}).title,'');
  assert.equal(pinMetadata({media:{images:{small:{url:'https://evil.example/image.jpg'}}}}).thumbnail,'');
});
test('YouTube reconnect binds the callback to the initiating browser',async()=>{
  const env={YOUTUBE_CLIENT_ID:'fake-id',YOUTUBE_CLIENT_SECRET:'fake-secret'};
  const response=await worker.fetch(new Request('https://example.test/oauth/youtube/start'),env);
  assert.equal(response.status,302);
  const location=new URL(response.headers.get('location'));
  assert.ok(location.searchParams.get('state'));
  assert.match(response.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);
  const rejected=await worker.fetch(new Request('https://example.test/oauth/youtube/callback?code=fake&state=other'),env);
  assert.equal(rejected.status,400);
});
