import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../workers/community-api/index.js';

const origin = 'https://www.aupositeur.be';
const db = {
  prepare(sql) {
    return {
      bind(...params) {
        return {
          async all() {
            if (sql.includes('FROM comments')) {
              assert.deepEqual(params, ['ecrits', 'entier-a-deux']);
              return { results: [] };
            }
            throw new Error('Unexpected query: ' + sql);
          },
          async first() {
            if (sql.includes('FROM comment_settings')) return null;
            throw new Error('Unexpected query: ' + sql);
          }
        };
      }
    };
  }
};
const env = { DB: db, PUBLIC_ORIGIN: origin };
const request = (path, options = {}) => new Request('https://community-api.aupositeur.be' + path, options);

test('GET comments returns enabled empty list for a valid work', async () => {
  const response = await worker.fetch(request('/api/comments?type=ecrits&id=entier-a-deux'), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { comments: [], enabled: true });
});
test('legacy query names are rejected explicitly', async () => {
  const response = await worker.fetch(request('/api/comments?content_type=ecrits&content_id=entier-a-deux'), env);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Publication invalide' });
});
test('POST with invalid fields cannot reach storage or Turnstile', async () => {
  const response = await worker.fetch(request('/api/comments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'ecrits', id: 'entier-a-deux', name: 'A', body: 'ok' })
  }), env);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Champs invalides' });
});
test('unknown origins cannot issue browser requests', async () => {
  const response = await worker.fetch(request('/api/comments?type=ecrits&id=entier-a-deux', {
    headers: { origin: 'https://attacker.example' }
  }), env);
  assert.equal(response.status, 403);
});
test('Cloudflare Pages preview origin is accepted', async () => {
  const response = await worker.fetch(request('/api/comments?type=ecrits&id=entier-a-deux', {
    headers: { origin: 'https://0d81da12.aupositeur-site.pages.dev' }
  }), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://0d81da12.aupositeur-site.pages.dev');
});

test('preflight from allowed Pages preview gets CORS permissions', async () => {
  const origin = 'https://0d81da12.aupositeur-site.pages.dev';
  const response = await worker.fetch(request('/api/comments', {
    method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST' }
  }), env);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.match(response.headers.get('access-control-allow-methods'), /POST/);
});
test('preflight from unrelated origin is rejected', async () => {
  const response = await worker.fetch(request('/api/comments', {
    method: 'OPTIONS', headers: { origin: 'https://example.org' }
  }), env);
  assert.equal(response.status, 403);
});
test('admin requests without Cloudflare Access JWT are denied', async () => {
  const response = await worker.fetch(request('/api/admin/comments?status=pending'), env);
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'Accès administrateur refusé' });
});
test('invalid comment content type is rejected', async () => {
  const response = await worker.fetch(request('/api/comments?type=livres&id=entier-a-deux'), env);
  assert.equal(response.status, 400);
});
test('POST comment with disabled setting is rejected before rate limiting', async () => {
  const disabledDb = {
    prepare(sql) {
      return { bind() { return { async first() {
        if (sql.includes('FROM comment_settings')) return { enabled: 0 };
        throw new Error('Unexpected SQL: ' + sql);
      } }; } };
    }
  };
  const response = await worker.fetch(request('/api/comments', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({type:'ecrits',id:'entier-a-deux',name:'Lecteur',body:'Un commentaire de test.'})
  }), {...env, DB: disabledDb});
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {error:'Commentaires fermés pour cette publication'});
});

test('valid comment is checked by Turnstile and stored as pending', async () => {
  const originalFetch = globalThis.fetch;
  let turnstileChecked = false;
  let inserted = false;
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes('FROM comment_settings')) return null;
              if (sql.includes('FROM submission_limits')) return {attempts: 1};
              throw Error('Unexpected first: ' + sql);
            },
            async run() {
              if (sql.includes('INSERT INTO submission_limits')) return {success:true};
              if (sql.includes('INSERT INTO comments')) {
                assert.equal(args[1], 'ecrits');
                assert.equal(args[2], 'entier-a-deux');
                assert.equal(args[3], 'Lecteur');
                assert.equal(args[4], 'Un commentaire de test.');
                inserted = true;
                return {success:true};
              }
              throw Error('Unexpected run: ' + sql);
            }
          };
        }
      };
    }
  };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    assert.equal(options.method, 'POST');
    assert.equal(options.body.get('secret'), 'turnstile-test-secret');
    assert.equal(options.body.get('response'), 'test-token');
    turnstileChecked = true;
    return new Response(JSON.stringify({success:true,hostname:'www.aupositeur.be'}), {status:200});
  };
  try {
    const response = await worker.fetch(request('/api/comments', {
      method:'POST',
      headers:{'content-type':'application/json',origin:'https://www.aupositeur.be'},
      body:JSON.stringify({type:'ecrits',id:'entier-a-deux',name:'Lecteur',body:'Un commentaire de test.',turnstile:'test-token'})
    }), {...env,DB:db,RATE_LIMIT_PEPPER:'test-pepper',TURNSTILE_SECRET:'turnstile-test-secret'});
    assert.equal(response.status,202);
    assert.equal(response.headers.get('access-control-allow-origin'),'https://www.aupositeur.be');
    assert.equal((await response.json()).message,'Message reçu, en attente de modération.');
    assert.equal(turnstileChecked,true);
    assert.equal(inserted,true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test('Turnstile tokens from another hostname are refused', async () => {
  const originalFetch = globalThis.fetch;
  let inserted = false;
  const db = {
    prepare(sql) {
      return { bind() { return {
        async first() {
          if (sql.includes('FROM comment_settings')) return null;
          if (sql.includes('FROM submission_limits')) return {attempts:1};
          throw Error('Unexpected first: '+sql);
        },
        async run() {
          if (sql.includes('INSERT INTO submission_limits')) return {success:true};
          if (sql.includes('INSERT INTO comments')) { inserted=true; return {success:true}; }
          throw Error('Unexpected run: '+sql);
        }
      }; } };
    }
  };
  globalThis.fetch = async () => new Response(JSON.stringify({success:true,hostname:'attacker.example'}),{status:200});
  try {
    const response = await worker.fetch(request('/api/comments', {
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({type:'ecrits',id:'entier-a-deux',name:'Lecteur',body:'Un commentaire de test.',turnstile:'test-token'})
    }), {...env,DB:db,RATE_LIMIT_PEPPER:'test-pepper',TURNSTILE_SECRET:'turnstile-test-secret'});
    assert.equal(response.status,403);
    assert.equal(inserted,false);
  } finally {globalThis.fetch=originalFetch;}
});

test('CORS includes credentials header for Cloudflare Access admin session', async () => {
  const response = await worker.fetch(request('/api/admin/comments', {
    method: 'GET',
    headers: { origin: 'https://www.aupositeur.be' }
  }), env);
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://www.aupositeur.be');
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
});

test('subscription requires consent before any database or email activity', async () => {
  const response = await worker.fetch(request('/api/subscribe', {
    method: 'POST',
    headers: {'content-type':'application/json'},
    body: JSON.stringify({email:'reader@example.org',consent:false,turnstile:'token'})
  }), env);
  assert.equal(response.status,400);
  assert.deepEqual(await response.json(),{error:'Adresse ou consentement invalide'});
});

test('valid subscription verifies Turnstile, stores pending consent and sends confirmation', async () => {
  const originalFetch=globalThis.fetch;
  const statements=[];
  const mockDb={
    prepare(sql) {
      return {bind(...args) {
        return {
          async first() {
            if(sql.includes('FROM submission_limits'))return {attempts:1};
            if(sql.includes('FROM subscribers WHERE email='))return null;
            throw Error('Unexpected first '+sql);
          },
          async run() {statements.push({sql,args});return {success:true};}
        };
      }};
    }
  };
  let emailSent=false;
  globalThis.fetch=async (url,options)=>{
    if(url==='https://challenges.cloudflare.com/turnstile/v0/siteverify')
      return new Response(JSON.stringify({success:true,hostname:'aupositeur.be'}),{status:200});
    if(url==='https://api.brevo.com/v3/smtp/email'){
      const payload=JSON.parse(options.body);
      assert.equal(payload.to[0].email,'reader@example.org');
      assert.ok(payload.htmlContent.includes('/communaute/confirmation/?token='));
      emailSent=true;
      return new Response(JSON.stringify({messageId:'mock-mail'}),{status:201});
    }
    throw Error('Unexpected fetch '+url);
  };
  try{
    const response=await worker.fetch(request('/api/subscribe',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({email:'reader@example.org',consent:true,turnstile:'token'})
    }),{...env,DB:mockDb,RATE_LIMIT_PEPPER:'test-pepper',TURNSTILE_SECRET:'test-secret',BREVO_API_KEY:'mock-brevo',SENDER_EMAIL:'sender@example.org'});
    assert.equal(response.status,202);
    assert.equal(emailSent,true);
    assert.equal(statements.some(s=>s.sql.includes('INSERT INTO subscribers')),true);
    assert.equal(statements.some(s=>s.sql.includes('INSERT INTO subscriber_tokens')),true);
  }finally{globalThis.fetch=originalFetch;}
});


test('verified GitHub Studio administrator can list comments without Access JWT',async()=>{
 const originalFetch=globalThis.fetch;
 const adminDb={prepare(sql){assert.match(sql,/SELECT \* FROM comments/);return {bind(status){assert.equal(status,'pending');return {async all(){return {results:[]}}}}}}};
 globalThis.fetch=async (url)=>{
  if(url==='https://api.github.com/user')return Response.json({login:'nicolasrugolo-sudo',type:'User'});
  if(url==='https://api.github.com/repos/nicolasrugolo-sudo/aupositeur-v2')return Response.json({full_name:'nicolasrugolo-sudo/aupositeur-v2',permissions:{admin:true}});
  throw Error('Unexpected fetch '+url);
 };
 try{
  const response=await worker.fetch(request('/api/admin/comments?status=pending',{headers:{authorization:'Bearer gho_testtoken123456789'}}),{...env,DB:adminDb});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{comments:[]});
 }finally{globalThis.fetch=originalFetch;}
});
test('GitHub account owner can administer without private repository OAuth scope', async () => {
  const originalFetch = globalThis.fetch;
  let repoLookups = 0;
  globalThis.fetch = async (url, options) => {
    if (url === 'https://api.github.com/user') {
      assert.match(options.headers.authorization, /^Bearer /);
      return new Response(JSON.stringify({login:'nicolasrugolo-sudo',type:'User'}),{status:200});
    }
    if (String(url).includes('/repos/')) { repoLookups++; return new Response(null,{status:404}); }
    throw Error('Unexpected fetch '+url);
  };
  try {
    const response = await worker.fetch(request('/api/admin/comments?status=pending', {
      headers:{authorization:'Bearer gho_abcdefghijklmnopqrstuvwxyz0123456789',origin:'https://www.aupositeur.be'}
    }), {...env,DB:{prepare(sql){assert.match(sql,/FROM comments WHERE status/);return {bind(status){assert.equal(status,'pending');return {all:async()=>({results:[]})};}};}}});
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{comments:[]});
    assert.equal(repoLookups,0);
  } finally { globalThis.fetch=originalFetch; }
});

test('GitHub identity other than the configured owner is forbidden', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    if (url === 'https://api.github.com/user') return new Response(JSON.stringify({login:'someone-else',type:'User'}),{status:200});
    throw Error('Unexpected fetch '+url);
  };
  try {
    const response=await worker.fetch(request('/api/admin/comments?status=pending',{
      headers:{authorization:'Bearer gho_abcdefghijklmnopqrstuvwxyz0123456789'}
    }),env);
    assert.equal(response.status,403);
  } finally {globalThis.fetch=originalFetch;}
});
