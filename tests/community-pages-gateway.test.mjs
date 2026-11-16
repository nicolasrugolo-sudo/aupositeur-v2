import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest} from '../functions/api/admin/[[path]].js';

test('same-origin gateway rejects missing Access JWT without proxying', async()=>{
  const response=await onRequest({request:new Request('https://www.aupositeur.be/api/admin/comments?status=pending')});
  assert.equal(response.status,403);
  assert.deepEqual(await response.json(),{error:'Authentification Cloudflare Access requise'});
});

test('same-origin gateway forwards Access JWT and method to community worker',async()=>{
  const original=globalThis.fetch;
  let forwarded;
  globalThis.fetch=async request=>{
    forwarded=request;
    return new Response(JSON.stringify({comments:[]}),{status:200,headers:{'content-type':'application/json','set-cookie':'do-not-leak=1'}});
  };
  try{
    const request=new Request('https://www.aupositeur.be/api/admin/comments?status=pending',{
      headers:{'cf-access-jwt-assertion':'signed-jwt-test'}
    });
    const response=await onRequest({request});
    assert.equal(forwarded.url,'https://community-api.aupositeur.be/api/admin/comments?status=pending');
    assert.equal(forwarded.headers.get('cf-access-jwt-assertion'),'signed-jwt-test');
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{comments:[]});
    assert.equal(response.headers.get('set-cookie'),null);
    assert.equal(response.headers.get('cache-control'),'no-store');
  }finally{globalThis.fetch=original;}
});
