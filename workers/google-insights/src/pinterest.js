// Pinterest API v5: https://github.com/pinterest/api-description
const API = 'https://api.pinterest.com/v5';
const METRICS = 'IMPRESSION,ENGAGEMENT,SAVE,OUTBOUND_CLICK';
const metricNames = { impressions: 'IMPRESSION', engagements: 'ENGAGEMENT', saves: 'SAVE', clicks: 'OUTBOUND_CLICK' };
let cached;

export const mapMetrics = (metrics = {}) => Object.fromEntries(Object.entries(metricNames).map(([key, source]) => {
  const value = metrics[source];
  return [key, typeof value === 'number' && Number.isFinite(value) ? value : null];
}));

export const pinterestRange = (now = new Date()) => {
  const end = new Date(now); end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - 29);
  const previousEnd = new Date(start); previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd); previousStart.setUTCDate(previousStart.getUTCDate() - 29);
  const date = value => value.toISOString().slice(0, 10);
  return { start: date(start), end: date(end), previousStart: date(previousStart), previousEnd: date(previousEnd) };
};

const apiGet = async (path, token, params = {}) => {
  const url = new URL(API + path);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, {
    headers: { authorization: 'Bearer ' + token, accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  // Never return provider bodies, headers, or credentials to the browser.
  if (!response.ok) {
    const messages = {
      401: 'Jeton Pinterest refusé ou expiré. Remplacer le secret PINTEREST_ACCESS_TOKEN.',
      403: 'Accès Pinterest refusé. Vérifier les droits user_accounts:read et pins:read du jeton et l’accès du compte aux statistiques.',
      429: 'Limite Pinterest atteinte. Réessayer plus tard.',
    };
    throw new Error(messages[response.status] || 'Service Pinterest indisponible (HTTP ' + response.status + ').');
  }
  return response.json();
};

export const summaryMetrics = body => {
  // Without split_field, the API returns a single ALL group.
  const group = body?.all || body?.ALL;
  if (!group?.summary_metrics) throw new Error('Réponse Pinterest incomplète : statistiques indisponibles.');
  return mapMetrics(group.summary_metrics);
};

export async function pinterestInsights(env) {
  const token = String(env.PINTEREST_ACCESS_TOKEN || '').trim();
  if (!token) return { configured: false, error: 'Secret PINTEREST_ACCESS_TOKEN absent dans Cloudflare.' };
  const range = pinterestRange();
  if (cached?.token === token && cached.end === range.end && cached.expires > Date.now()) return cached.data;
  const params = { start_date: range.start, end_date: range.end, metric_types: METRICS, content_type: 'ORGANIC', source: 'YOUR_PINS' };
  const [current, previous, top] = await Promise.allSettled([
    apiGet('/user_account/analytics', token, params),
    apiGet('/user_account/analytics', token, { ...params, start_date: range.previousStart, end_date: range.previousEnd }),
    apiGet('/user_account/analytics/top_pins', token, { ...params, sort_by: 'IMPRESSION', num_of_pins: '20' }),
  ]);
  if (current.status !== 'fulfilled') throw current.reason;
  const summary = summaryMetrics(current.value);
  let previousSummary = null;
  if (previous.status === 'fulfilled') {
    try { previousSummary = summaryMetrics(previous.value); } catch {}
  }
  const pins = top.status === 'fulfilled' && Array.isArray(top.value.pins) ? top.value.pins : null;
  const enriched = [];
  // Bounded batches avoid an unbounded burst of API calls.
  if (pins) for (let i = 0; i < Math.min(pins.length, 20); i += 5) {
    enriched.push(...await Promise.all(pins.slice(i, i + 5).map(async pin => {
      const id = String(pin.pin_id || '');
      if (!/^\d+$/.test(id)) return null;
      const detail = await apiGet('/pins/' + id, token).catch(() => null);
      return { id, title: detail?.title || 'Épingle ' + id, link: detail?.link || '', ...mapMetrics(pin.metrics) };
    })));
  }
  const data = {
    configured: true, period: '30d', ...range, ...summary, previous: previousSummary,
    pins: pins ? enriched.filter(Boolean) : null,
    details: { topPinsAvailable: pins !== null, topPinsLimit: 20, topPinsError: top.status === 'rejected' ? top.reason.message : '', source: 'YOUR_PINS', contentType: 'ORGANIC' },
    generatedAt: new Date().toISOString(),
  };
  cached = { token, end: range.end, expires: Date.now() + 10 * 60 * 1000, data };
  return data;
}
