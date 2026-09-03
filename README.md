# Aupositeur V2

Première version indépendante du site artistique Aupositeur. Le site actuel et
le domaine ne sont pas modifiés.

## Développement local

```bash
npm install
npm run dev
```

La version de production se vérifie avec `npm run build`. Le dossier `dist/`
obtenu est un site statique, prêt pour GitHub et un futur déploiement gratuit
sur Cloudflare.

## Administration Decap CMS

L’administration locale est disponible sur `/admin/` avec `npm run dev` et
`npx decap-server`. La préparation de l’authentification GitHub/Cloudflare est
décrite dans `docs/decap-production.md` ; elle n’est pas activée en production.

## Ajouter un poème

Créer un fichier Markdown dans `src/content/poemes/` en reprenant le modèle du
prototype. Le code du site est sous licence MIT. Les textes, images, musiques
et autres œuvres restent © Nicolas Rugolo / Aupositeur — tous droits réservés.

## Publication

Ce dépôt ne contient aucune automatisation reliée au domaine actuel. Le
déploiement Cloudflare et le basculement de `www.aupositeur.be` seront configurés
uniquement après validation explicite.

Préversion publique :
`https://aupositeur-v2.nicolas-rugolo.workers.dev`
