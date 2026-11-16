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
