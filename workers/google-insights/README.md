# AUPOSITEUR Google Insights Worker

Read-only backend for the AUPOSITEUR Studio dashboard.

## Security model

Google credentials never reach the browser or GitHub. The Worker exchanges a signed service-account JWT for a short-lived Google OAuth access token and calls Google APIs server-side.

The Studio only receives aggregate read-only metrics. Browser CORS access to `/admin/insights` is restricted to `ALLOWED_ORIGIN`. No static admin secret is embedded in Studio JavaScript.

Do not commit any Google JSON key, private key, OAuth token, or refresh token.

## Cloudflare secrets

Set these only as Cloudflare Worker secrets:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`

## Non-secret configuration

These values are versioned in `wrangler.jsonc`:

- `GA4_PROPERTY_ID` — numeric GA4 property ID.
- `SEARCH_CONSOLE_SITE_URL` — exact Search Console property identifier.
- `ALLOWED_ORIGIN` — production Studio origin.

## Google permissions

Enable Google Analytics Data API and Google Search Console API in the Google Cloud project.

Grant the service-account email read access to the GA4 property and Search Console property. The Worker requests only:

- `analytics.readonly`
- `webmasters.readonly`

## Endpoints

- `/` — health/configuration booleans only.
- `/admin/insights` — aggregate GA4 and Search Console metrics; CORS restricted to the production Studio origin.

Temporary public test endpoints are not kept in production.

## Deployment

From the repository root:

`npx wrangler deploy --config workers/google-insights/wrangler.jsonc`
