# Préparation Decap CMS — GitHub et Cloudflare

## État vérifié

- Le site est un projet Astro statique.
- Cloudflare exécute le Worker `aupositeur-v2` et sert `./dist` via `wrangler.jsonc`.
- Il ne s’agit pas d’un projet Cloudflare Pages dans cette configuration.
- `public/admin/index.html` est copié vers `dist/admin/index.html` : l’administration est donc servie sur `/admin/`.
- Le développement local reste sur `local_backend: true` et `npx decap-server`.

## Architecture préparée, non activée

1. Créer une application OAuth GitHub avec pour URL de rappel :
   `https://<worker-oauth>/callback`.
2. Déployer un Worker OAuth distinct à partir du proxy Cloudflare recommandé par la documentation Decap :
   https://github.com/sterlingwes/decap-proxy
3. Stocker `GITHUB_OAUTH_ID` et `GITHUB_OAUTH_SECRET` comme secrets du Worker OAuth, jamais dans Git.
4. Copier les quatre clés `backend` de `public/admin/config.production.yml.example` dans `public/admin/config.yml`, avec l’URL réelle du proxy.
5. Garder `branch: migration/decap` pendant la recette. Le passage à `main` nécessite une validation explicite.
6. Tester la connexion sur l’URL de préversion avant toute modification de domaine ou de production.

## Garde-fous

- Aucun secret, jeton, identifiant OAuth ou identifiant de compte Cloudflare n’est versionné.
- Aucun déploiement Worker, aucune route, aucun DNS et aucun domaine personnalisé n’est créé par ce lot.
- La branche `archive/sanity-experiment` et toute ressource D1 existante restent intactes.
