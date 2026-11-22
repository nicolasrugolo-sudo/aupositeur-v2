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

test('moderation paginates matching rows and refreshes exact status counts for isolated comments', async t => {
  const { DatabaseSync } = await import('node:sqlite');
  const { readFileSync } = await import('node:fs');
  const fixture = new DatabaseSync(':memory:');
  t.after(() => fixture.close());
  fixture.exec(readFileSync(new URL('../db/community.sql', import.meta.url), 'utf8'));
  const create = fixture.prepare('INSERT INTO comments (id,content_type,content_id,author_name,body,status,created_at) VALUES (?,?,?,?,?,?,?)');
  for (let index=1; index<=31; index++) {
    create.run('test-'+index,'ecrits','fiche-isolee','Auteur test','Contribution technique',index===31?'approved':'pending',
      '2026-11-'+String(index<=30?index:30).padStart(2,'0')+' 10:00:00');
  }
  create.run('other','musiques','autre','Auteur test','Contribution technique','pending','2026-11-02 10:00:00');
  const adapter = {
    prepare(sql) {
      const statement=fixture.prepare(sql);
      return {bind(...values) {
        return {
          all: async () => ({results:statement.all(...values)}),
          run: async () => ({meta:{changes:statement.run(...values).changes}}),
        };
      }};
    },
  };
  const savedFetch=globalThis.fetch;
  t.after(()=>{globalThis.fetch=savedFetch;});
  globalThis.fetch=async input=>new URL(input).pathname==='/user'
    ? Response.json({login:'nicolasrugolo-sudo'})
    : Response.json({full_name:'nicolasrugolo-sudo/aupositeur-v2',permissions:{admin:true}});
  const endpoint='https://www.aupositeur.be/api/admin/comments/';
  const headers={authorization:'Bearer synthetic_moderation_fixture', 'content-type':'application/json'};
  const get = async (query) => {
    const response=await worker.fetch(new Request(endpoint+'moderation?'+query,{headers}),{...env,DB:adapter});
    assert.equal(response.status,200);
    return response.json();
  };
  const first=await get('status=pending&type=ecrits&work=fiche-isolee&q=technique&from=2026-11-01&to=2026-11-30&order=oldest');
  assert.equal(first.counts.pending,30);
  assert.equal(first.counts.approved,1);
  assert.equal(first.comments.length,25);
  assert.equal(first.comments[0].id,'test-1');
  assert.equal((await get('status=pending&type=ecrits&offset=25')).comments.length,5);
  const change=await worker.fetch(new Request(endpoint+'bulk',{method:'POST',headers,body:JSON.stringify({
    ids:['test-1','test-2'],action:'rejected',
  })}),{...env,DB:adapter});
  assert.equal(change.status,200);
  assert.equal((await change.json()).changed,2);
  const updated=await get('status=rejected&type=ecrits');
  assert.equal(updated.counts.pending,28);
  assert.equal(updated.total,2);
});
