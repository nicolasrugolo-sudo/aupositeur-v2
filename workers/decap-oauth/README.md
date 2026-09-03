# Proxy OAuth Decap

Worker séparé du frontend Astro. Il expose `/auth` et `/callback` selon le protocole du backend GitHub de Decap.

Les valeurs `GITHUB_OAUTH_ID` et `GITHUB_OAUTH_SECRET` sont des secrets Cloudflare. Elles ne doivent jamais être ajoutées à un fichier.

Le dépôt GitHub étant public, le Worker demande le périmètre `public_repo,user`. L’origine Decap autorisée pendant la recette est l’alias stable du preview `migration/decap`.
