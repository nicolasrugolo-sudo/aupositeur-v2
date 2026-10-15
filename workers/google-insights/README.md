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


## Pinterest Analytics

The same Worker serves `GET /admin/pinterest-insights`, independently of Google authentication.
Store `PINTEREST_ACCESS_TOKEN` as a Cloudflare **Secret** (never in Git or browser code).
The token needs `user_accounts:read` and `pins:read` for account analytics and pin details.
A manually generated token is not automatically refreshed; replace the secret when it expires.

The report covers 30 complete UTC days ending yesterday, with the preceding 30 days for comparison.
It requests organic activity on `YOUR_PINS`. Outbound clicks include all destinations.
Account totals and top pins fail independently; missing metrics remain null, never fabricated zeros.
Up to 20 top pins by impressions are enriched with their titles and destination links.
Work matching uses exact AUPOSITEUR URL paths only and is explicitly a partial total over that selection.
Reports are cached in Worker memory for up to 10 minutes to limit API usage.

Validation: `node --test workers/google-insights/test/pinterest.test.js`.
Deployment: `npm run insights:deploy` (keeps existing vars and secrets).


## YouTube reconnection

If Google rejects refresh with `invalid_grant`, the dashboard shows **Reconnecter YouTube**.
After consent, store the returned `refreshToken` in Cloudflare secret `YOUTUBE_REFRESH_TOKEN`, then deploy.
The callback uses an HttpOnly, Secure, SameSite=Lax state cookie with a ten-minute lifetime.
If the Google OAuth app is External / Testing, Google limits these refresh tokens to seven days.
Check the project's publishing status in Google Auth Platform / Audience before reauthorizing.
Do not assume Testing is the cause: revoked tokens and other Google account policies can also cause invalid_grant.

Pinterest labels prefer the supplied title, then the exact linked site's content title, then the pin description.
Pins without any of these remain explicitly untitled; available Pinterest thumbnails help identify them.
