const ALLOWED_ORIGINS = new Set([
  'https://www.aupositeur.be',
  'https://aupositeur.be',
  'https://aupositeur-site.pages.dev',
]);

const isAllowedOrigin = (origin) => {
  if (ALLOWED_ORIGINS.has(origin)) return true;

  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && url.hostname.endsWith('.aupositeur-site.pages.dev');
  } catch {
    return false;
  }
};

const MAX_AUDIO_BYTES = 80 * 1024 * 1024;
const AUDIO_PREFIX = 'audio/tracks/';
const AUDIO_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/flac',
  'audio/mp4',
  'audio/x-m4a',
]);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'flac', 'm4a']);

const json = (data, status = 200, origin = '') => {
  const headers = {
    'content-type': 'application/json; charset=UTF-8',
    'cache-control': 'no-store',
  };

  if (isAllowedOrigin(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers.vary = 'Origin';
  }

  return new Response(JSON.stringify(data, null, 2), { status, headers });
};

const isAdmin = (request, env) => {
  const provided = request.headers.get('X-Aupositeur-Admin') || '';
  return Boolean(env.MEDIA_ADMIN_TOKEN) && provided === env.MEDIA_ADMIN_TOKEN;
};

const safeStem = (name) =>
  String(name || 'audio')
    .replace(/\.[^.]+$/, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70) || 'audio';

const extensionOf = (name) => {
  const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
};

const makeAudioKey = (file) => {
  const ext = extensionOf(file.name) || 'mp3';
  return `${AUDIO_PREFIX}${safeStem(file.name)}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
};

const validAudioKey = (key) =>
  typeof key === 'string' &&
  key.startsWith(AUDIO_PREFIX) &&
  !key.includes('..') &&
  AUDIO_EXTENSIONS.has(extensionOf(key));

const publicAudioUrl = (request, key) => {
  const url = new URL(request.url);
  return `${url.origin}/media/${key}`;
};

const handleUpload = async (request, env, origin) => {
  if (!env.MEDIA_ASSETS) return json({ error: 'R2 binding MEDIA_ASSETS is missing' }, 503, origin);

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Invalid multipart form data' }, 400, origin);
  }

  const file = form.get('file');
  if (!(file instanceof File)) return json({ error: 'Missing file' }, 400, origin);

  const ext = extensionOf(file.name);
  const mimeAllowed = AUDIO_MIME_TYPES.has(file.type) || file.type === 'application/octet-stream' || !file.type;
  if (!AUDIO_EXTENSIONS.has(ext) || !mimeAllowed) {
    return json({ error: 'Unsupported audio format. Use MP3, WAV, FLAC or M4A.' }, 415, origin);
  }

  if (file.size <= 0 || file.size > MAX_AUDIO_BYTES) {
    return json({ error: 'Audio file must be between 1 byte and 80 MB.' }, 413, origin);
  }

  const requestedKey = String(form.get('key') || '');
  const key = requestedKey || makeAudioKey(file);
  if (!validAudioKey(key)) return json({ error: 'Invalid audio key' }, 400, origin);

  await env.MEDIA_ASSETS.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type || 'application/octet-stream',
      cacheControl: 'public, max-age=60, must-revalidate',
    },
    customMetadata: {
      originalName: file.name,
      kind: 'public-audio',
      uploadedAt: new Date().toISOString(),
    },
  });

  const object = await env.MEDIA_ASSETS.head(key);
  return json({
    ok: true,
    key,
    url: publicAudioUrl(request, key),
    name: file.name,
    mime: object?.httpMetadata?.contentType || file.type || null,
    bytes: object?.size ?? file.size,
    etag: object?.httpEtag || null,
  }, requestedKey ? 200 : 201, origin);
};

const handleList = async (env, origin) => {
  if (!env.MEDIA_ASSETS) return json({ error: 'R2 binding MEDIA_ASSETS is missing' }, 503, origin);

  const listed = await env.MEDIA_ASSETS.list({
    prefix: AUDIO_PREFIX,
    limit: 1000,
    include: ['httpMetadata', 'customMetadata'],
  });

  const files = listed.objects
    .sort((a, b) => new Date(b.uploaded).getTime() - new Date(a.uploaded).getTime())
    .map((object) => ({
      key: object.key,
      bytes: object.size,
      uploaded: object.uploaded,
      etag: object.httpEtag,
      mime: object.httpMetadata?.contentType || null,
      name: object.customMetadata?.originalName || object.key.split('/').pop(),
    }));

  return json({ ok: true, files, truncated: listed.truncated }, 200, origin);
};

const serveAudio = async (request, env, key) => {
  if (!env.MEDIA_ASSETS || !validAudioKey(key)) return new Response('Not found', { status: 404 });

  if (request.method === 'HEAD') {
    const object = await env.MEDIA_ASSETS.head(key);
    if (!object) return new Response('Not found', { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('accept-ranges', 'bytes');
    headers.set('access-control-allow-origin', '*');
    headers.set('cache-control', 'public, max-age=60, must-revalidate');
    headers.set('content-length', String(object.size));
    return new Response(null, { status: 200, headers });
  }

  const object = await env.MEDIA_ASSETS.get(key, {
    onlyIf: request.headers,
    range: request.headers,
  });
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set('access-control-allow-origin', '*');
  headers.set('cache-control', 'public, max-age=60, must-revalidate');

  if (!('body' in object)) {
    return new Response(null, { status: 412, headers });
  }

  if (object.range) {
    const offset = object.range.offset ?? 0;
    const length = object.range.length ?? Math.max(0, object.size - offset);
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set('content-length', String(length));
    return new Response(object.body, { status: 206, headers });
  }

  headers.set('content-length', String(object.size));
  return new Response(object.body, { status: 200, headers });
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      if (!isAllowedOrigin(origin)) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': origin,
          'access-control-allow-methods': 'GET, HEAD, POST, OPTIONS',
          'access-control-allow-headers': 'Content-Type, X-Aupositeur-Admin',
          'access-control-max-age': '86400',
          vary: 'Origin',
        },
      });
    }

    if (request.method === 'GET' && url.pathname === '/') {
      return json({ service: 'aupositeur-media-api', status: 'ok', audioStorage: Boolean(env.MEDIA_ASSETS) }, 200, origin);
    }

    if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname.startsWith('/media/audio/tracks/')) {
      return serveAudio(request, env, url.pathname.slice('/media/'.length));
    }

    if (url.pathname.startsWith('/admin/')) {
      if (!isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401, origin);

      if (request.method === 'GET' && url.pathname === '/admin/audio-files') {
        return handleList(env, origin);
      }

      if (request.method === 'POST' && url.pathname === '/admin/audio-files/upload') {
        return handleUpload(request, env, origin);
      }
    }

    return json({ error: 'Not found' }, 404, origin);
  },
};
