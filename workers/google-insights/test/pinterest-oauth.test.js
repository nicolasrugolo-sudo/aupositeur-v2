import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PinterestOAuthStore, pinterestOAuthRoute, pinterestAccessToken, PINTEREST_REDIRECT_URI } from '../src/pinterest-oauth.js';

function setup() {
  const values=new Map();
  let queue=Promise.resolve();
  const state={storage:{get:async key=>values.get(key),put:async(key,value)=>values.set(key,value),setAlarm:async time=>{state.alarmAt=time;}},blockConcurrencyWhile(fn){const next=queue.then(fn);queue=next.catch(()=>{});return next;}};
  const env={PINTEREST_CLIENT_ID:'1616724',PINTEREST_CLIENT_SECRET:'fake-secret',PINTEREST_USERNAME:'aupositeur'};
  const instance=new PinterestOAuthStore(state,env);
  env.PINTEREST_OAUTH={idFromName:name=>name,get:()=>({fetch:(url,init)=>instance.fetch(new Request(url,init))})};
  return {state,env,instance,values};
}
const tokens=(access='fake-access',refresh='fake-refresh')=>({access_token:access,refresh_token:refresh,expires_in:2592000,refresh_token_expires_in:5184000,scope:'user_accounts:read pins:read'});
const authorize=instance=>instance.fetch(new Request('https://internal/authorize',{method:'POST',body:JSON.stringify({code:'fake-code'})}));

test('OAuth requires configuration and ties state to browser without leaking secret',async()=>{
 const {env}=setup();
 assert.equal((await pinterestOAuthRoute(new Request('https://example.test/oauth/pinterest/start'),{})).status,503);
 const response=await pinterestOAuthRoute(new Request('https://example.test/oauth/pinterest/start'),env);
 assert.equal(response.status,302);
 const target=new URL(response.headers.get('location'));
 assert.equal(target.searchParams.get('redirect_uri'),PINTEREST_REDIRECT_URI);
 assert.equal(target.searchParams.get('scope'),'user_accounts:read,pins:read');
 assert.ok(!target.toString().includes('fake-secret'));
 assert.match(response.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);
 assert.equal((await pinterestOAuthRoute(new Request('https://example.test/oauth/pinterest/callback?state=wrong&code=fake'),env)).status,400);
});

test('authorization checks account, stores tokens privately and schedules renewal',async()=>{
 const original=fetch; const {env,state,values}=setup();
 globalThis.fetch=async url=>Response.json(String(url).includes('/oauth/token')?tokens():{id:'123',username:'aupositeur'});
 try {
  const start=await pinterestOAuthRoute(new Request('https://example.test/oauth/pinterest/start'),env);
  const stateValue=new URL(start.headers.get('location')).searchParams.get('state');
  const response=await pinterestOAuthRoute(new Request('https://example.test/oauth/pinterest/callback?state='+stateValue+'&code=fake',{headers:{Cookie:'aup_pinterest_state='+stateValue}}),env);
  assert.equal(response.status,200);
  const html=await response.text();
  for(const secret of ['fake-access','fake-refresh','fake-secret']) assert.ok(!html.includes(secret));
  assert.equal(values.get('tokens').refreshToken,'fake-refresh');
  assert.ok(state.alarmAt>Date.now());
  assert.equal(await pinterestAccessToken(env),'fake-access');
  assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
 } finally {globalThis.fetch=original;}
});

test('another Pinterest account cannot overwrite an existing connection',async()=>{
 const original=fetch; const {instance,values}=setup();
 values.set('tokens',{accessToken:'existing',accountId:'123'});
 globalThis.fetch=async url=>Response.json(String(url).includes('/oauth/token')?tokens():{id:'999',username:'someone-else'});
 try {assert.equal((await authorize(instance)).status,403); assert.equal(values.get('tokens').accessToken,'existing');} finally {globalThis.fetch=original;}
});

test('concurrent refresh preserves rotated token and survives a new instance',async()=>{
 const original=fetch; const {env,state,values}=setup();
 values.set('tokens',{accessToken:'expired',refreshToken:'old-refresh',expiresAt:0,accountId:'123',username:'aupositeur'});
 let requests=0;
 globalThis.fetch=async(url,init)=>{requests++;assert.equal(new URLSearchParams(init.body).get('refresh_token'),'old-refresh');return Response.json(tokens('new-access','new-refresh'));};
 try {
  const instance=new PinterestOAuthStore(state,env);
  const responses=await Promise.all([instance.fetch(new Request('https://internal/token')),instance.fetch(new Request('https://internal/token'))]);
  assert.equal(requests,1); assert.equal(values.get('tokens').refreshToken,'new-refresh');
  assert.equal((await responses[0].json()).accessToken,'new-access');
  const restarted=new PinterestOAuthStore(state,env);
  assert.equal((await (await restarted.fetch(new Request('https://internal/token'))).json()).accessToken,'new-access');
  assert.equal(requests,1);
 } finally {globalThis.fetch=original;}
});

test('alarm renews without dashboard visits and retries transient failures',async()=>{
 const original=fetch; const {instance,values,state}=setup();
 values.set('tokens',{accessToken:'valid',refreshToken:'refresh',expiresAt:Date.now()+86400000});
 globalThis.fetch=async()=>Response.json(tokens('alarm-access','alarm-refresh'));
 try {
  await instance.alarm(); assert.equal(values.get('tokens').accessToken,'alarm-access');
  globalThis.fetch=async()=>new Response('{}',{status:503});
  await instance.alarm(); assert.ok(state.alarmAt>Date.now());assert.ok(state.alarmAt<Date.now()+3700000);
 } finally {globalThis.fetch=original;}
});

test('revoked refresh requires consent and provider bodies never reach the user',async()=>{
 const original=fetch; const {instance,values}=setup();
 values.set('tokens',{accessToken:'old-access',refreshToken:'secret-refresh',expiresAt:0});
 globalThis.fetch=async()=>Response.json({error:'invalid_grant',error_description:'secret-provider-body'},{status:400});
 try {
  const result=await instance.fetch(new Request('https://internal/token'));
  assert.equal(result.status,401); assert.equal(values.get('tokens').needsReauthorization,true);
  const text=await result.text(); assert.ok(!text.includes('secret-refresh'));assert.ok(!text.includes('secret-provider-body'));
 } finally {globalThis.fetch=original;}
});
