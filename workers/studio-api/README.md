# AUPOSITEUR Studio API

Backend privé du Studio.

Bindings requis:
- D1 `STUDIO_DB` → base `aupositeur-studio`
- R2 `STUDIO_ASSETS` → bucket existant `aupositeur-media-assets`

Sécurité:
- protéger le Worker et le Studio avec Cloudflare Access;
- le Worker exige par défaut l'en-tête Access authentifié;
- ne jamais placer de clé Agnes/Wan/Vidu dans le frontend.

Initialisation D1:
`npx wrangler d1 execute aupositeur-studio --file=./schema.sql --remote`

Avant déploiement, remplacer `REPLACE_WITH_D1_DATABASE_ID` dans wrangler.jsonc par l'ID réel de la base.


<!-- deploy-trigger: studio-v1 2026-09-22 -->
