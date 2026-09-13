# Aupositeur Media API

Worker Cloudflare dédié aux fichiers audio publics pilotés depuis Decap CMS.

## Rôle

- téléversement sécurisé depuis `aupositeur.be/admin` ;
- sélection des fichiers déjà présents dans R2 ;
- remplacement d'un fichier sans modifier la clé enregistrée dans Decap ;
- diffusion publique avec support des requêtes HTTP Range pour le lecteur audio HTML5.

Les métadonnées restent dans `src/content/musiques/*.md`. Les fichiers audio ne sont jamais commités dans GitHub.

## Déploiement

Depuis la racine du dépôt :

```powershell
npx wrangler r2 bucket create aupositeur-media-assets
npx wrangler secret put MEDIA_ADMIN_TOKEN --config workers/media-api/wrangler.jsonc
npx wrangler deploy --config workers/media-api/wrangler.jsonc
```

Pour conserver un seul jeton administrateur côté navigateur, utiliser pour `MEDIA_ADMIN_TOKEN` la même valeur que le jeton administrateur déjà utilisé par le widget boutique.

Le widget Decap vise actuellement :

`https://aupositeur-media-api.nicolas-rugolo.workers.dev`

## Stockage R2

Les objets publiés sont rangés sous :

`audio/tracks/<nom>-<suffixe>.<extension>`

Formats admis : MP3, WAV, FLAC et M4A. Taille maximale : 80 Mo.

## Sécurité

Le secret R2 n'est jamais exposé au navigateur. Le navigateur envoie le fichier au Worker avec l'en-tête `X-Aupositeur-Admin`. Seul le Worker possède le binding R2 `MEDIA_ASSETS`.

Les routes publiques servent uniquement les objets situés sous `audio/tracks/`.
