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
