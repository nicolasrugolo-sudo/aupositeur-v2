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


## Pinterest OAuth and Analytics

The Worker serves `GET /admin/pinterest-insights` independently of Google authentication.
The AUPOSITEUR application ID (`1616724`) and permitted username (`aupositeur`) are non-secret vars in Wrangler.
Store the **application secret key** as Cloudflare Secret `PINTEREST_CLIENT_SECRET`.
Do not put a test access token in this variable.

Register this exact redirect URI in Pinterest Developers → AUPOSITEUR → Configure:

`https://aupositeur-google-insights.nicolas-rugolo.workers.dev/oauth/pinterest/callback`

Then open `/oauth/pinterest/start` or **Connecter Pinterest** in the dashboard and authorize the Aupositeur account.
Only `user_accounts:read` and `pins:read` are requested.
The callback verifies the expected username and, on reconnection, the previously linked account ID.
An HttpOnly, Secure, SameSite=Lax cookie protects the OAuth state for ten minutes.
Tokens are never returned to the browser, logged, or committed to GitHub.

`PinterestOAuthStore`, a SQLite-backed Durable Object created by the Wrangler migration,
stores access/refresh tokens. Serialized refreshes preserve rotated refresh tokens.
Access tokens refresh on demand before expiry. An alarm also renews them at least weekly
without dashboard visits, keeping continuous refresh tokens current. Transient failures
retry after an hour; revoked grants require consent again. Authorization returns a simple
success page: there is no token to copy manually after setup.

The old `PINTEREST_ACCESS_TOKEN` secret is only a temporary fallback while OAuth is unconfigured.
It is ignored once the client secret and Durable Object binding are configured.

Reports cover 30 complete UTC days ending yesterday, compared with the preceding 30 days.
They request organic activity on `YOUR_PINS`; outbound clicks include all destinations.
Account totals and top pins fail independently. Missing metrics remain null.
Up to 20 top pins by impressions are enriched with metadata. Exact AUPOSITEUR URL paths
provide work matching, explicitly a partial total over that selection.
Reports are cached in Worker memory for up to ten minutes.

Tests: `node --test workers/google-insights/test/*.test.js`.
Deploy: `npm run insights:deploy` (preserves existing vars and secrets).


## YouTube reconnection

If Google rejects refresh with `invalid_grant`, the dashboard shows **Reconnecter YouTube**.
After consent, store the returned `refreshToken` in Cloudflare secret `YOUTUBE_REFRESH_TOKEN`, then deploy.
The callback uses an HttpOnly, Secure, SameSite=Lax state cookie with a ten-minute lifetime.
If the Google OAuth app is External / Testing, Google limits these refresh tokens to seven days.
Check the project's publishing status in Google Auth Platform / Audience before reauthorizing.
Do not assume Testing is the cause: revoked tokens and other Google account policies can also cause invalid_grant.

Pinterest labels prefer the supplied title, then the exact linked site's content title, then the pin description.
Pins without any of these remain explicitly untitled; available Pinterest thumbnails help identify them.
