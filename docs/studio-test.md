# Studio de test AUPOSITEUR

Le pilote utilise Decap CMS 3.17.3 et decap-server 3.11.6. Il se lance sur la machine locale avec Node 22 et Python 3. Les fichiers du Studio de production restent dans `public/admin`.

## Démarrage

Dans un terminal Bash, depuis une copie Git de la branche de refonte, créer un répertoire temporaire dédié.

```bash
studio_dir=$(mktemp -d)
git clone --no-hardlinks . "$studio_dir/repo"
cd "$studio_dir/repo"
git remote remove origin
git switch -c test/studio-editorial
git config user.name 'Studio local'
git config user.email 'studio-test@example.invalid'
npm install --prefix "$studio_dir/tools" decap-cms@3.17.3 decap-server@3.11.6
node scripts/prepare-studio-test.mjs "$studio_dir/tools/node_modules/decap-cms/dist/decap-cms.js"
mkdir "$studio_dir/preview"
ln -s "$PWD/public/studio-test" "$studio_dir/preview/studio-test"
ln -s "$PWD/public/images" "$studio_dir/preview/images"
MODE=git BIND_HOST=127.0.0.1 ORIGIN=http://127.0.0.1:4327 "$studio_dir/tools/node_modules/.bin/decap-server" &
python3 -m http.server 4327 --bind 127.0.0.1 --directory "$studio_dir/preview"
```

Ouvrir [Studio local](http://127.0.0.1:4327/studio-test/). Le bouton de connexion ouvre une session du proxy local. Vérifier les sauvegardes avec `git log -p` dans le clone temporaire. Les commits restent sur la branche locale. Le proxy est dépourvu d’authentification et doit rester lié à l’interface loopback.

Pour évaluer la relecture, reprendre le même montage depuis un clone neuf avec `STUDIO_WORKFLOW=editorial` devant la commande `node scripts/prepare-studio-test.mjs`. Garder `MODE=git`. Le statut de workflow décide quand les changements atteignent la branche cible. Le champ `draft` reste le signal qu’Astro utilise pour exclure une œuvre du site et du sitemap. Une publication Decap avec ce champ toujours activé doit donc rester invisible dans le build.

## Simplification proposée

| Besoin | Fonction native à privilégier | Code AUPOSITEUR à préserver ou à revoir |
| --- | --- | --- |
| Collections, recherche et formulaires | Vues de collection et champs Decap | Le tableau de bord et sa bibliothèque parallèle dans `admin-shell.js` sont à comparer aux vues natives avant tout retrait. |
| Images | Médiathèque Decap et sélection dans les champs image | Les commandes directes GitHub de la médiathèque actuelle visent `main`. Examiner leur utilité avant de les retirer ou de les isoler. |
| Audio et fichiers d’impression | Sélecteurs dédiés lorsque les fichiers sortent du dépôt | Conserver les widgets métiers. Valider leurs opérations uniquement avec des services et données de test dédiés. |
| Réflexions | Widget Markdown visuel et aperçu | Comparer les sauvegardes sans changement, puis tester titres, listes, citations, liens et images. Conserver l’aperçu Astro comme référence du rendu final. |
| Poèmes | Widget actuel et accès au Markdown source | Exiger un aller-retour sans variation de strophes, vers et espaces sur des copies avant toute migration. |
| Brouillons et relecture | Workflow éditorial Decap avec Git | Conserver le champ `draft` comme garde de visibilité Astro. Vérifier chaque chemin avec le sitemap du build. |
| Commentaires et abonnés | Administration distincte | La modération et les abonnements utilisent des services dédiés et sortent du pilote Decap local. |

Un environnement GitHub OAuth distant nécessitera une origine de test et une configuration OAuth propres ainsi qu'un périmètre d'écriture isolé. Le Worker actuel renvoie le résultat à l'origine prévue par son environnement et le volet média personnalisé peut écrire directement sur `main`. Le pilote local contourne ces dépendances sans changer le Worker, les cookies de production ni les secrets.
