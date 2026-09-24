# AUPOSITEUR Google Insights Worker

Backend read-only for the private AUPOSITEUR Studio dashboard.

## Security model

The browser never receives Google credentials. The Worker exchanges a signed service-account JWT for a short-lived Google OAuth access token and calls Google APIs server-side.

Do not commit any Google JSON key, private key, admin token, OAuth token, or refresh token.

## Cloudflare secrets

Set these with `wrangler secret put`:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `INSIGHTS_ADMIN_TOKEN`

## Non-secret configuration

Configure as Worker environment variables (Dashboard or Wrangler secrets if preferred):

- `GA4_PROPERTY_ID` — numeric GA4 property ID, not the `G-...` measurement ID.
- `SEARCH_CONSOLE_SITE_URL` — exact Search Console property identifier, e.g. `sc-domain:aupositeur.be` or the exact URL-prefix property.
- `ALLOWED_ORIGIN` — production Studio origin.

## Google permissions

Enable Google Analytics Data API and Google Search Console API in the Google Cloud project.

Grant the service-account email read access to the GA4 property. Grant it access to the Search Console property. The Worker requests only:

- `analytics.readonly`
- `webmasters.readonly`

## Deployment

From the repository root:

`npx wrangler deploy --config workers/google-insights/wrangler.jsonc`

The root health endpoint reveals configuration booleans only. `/admin/insights` requires the separate `INSIGHTS_ADMIN_TOKEN`.
