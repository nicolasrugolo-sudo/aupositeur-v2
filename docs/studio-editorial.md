# AUPOSITEUR Studio

Le Studio assemble Decap CMS 3.17.3 et un tableau de bord Astro. Decap gère la connexion GitHub, les champs éditoriaux, l’éditeur enrichi et la publication. Les bibliothèques et les statistiques lisent les données du dernier déploiement. Le bouton Actualiser relit ce catalogue.

## Créer et publier

1. Ouvre la rubrique et crée une fiche. Les cinq collections partagent la taxonomie du Studio. Les filtres de la bibliothèque combinent état, catégorie et recherche.
2. Relis l’aperçu et ouvre les vérifications avant publication. Les conseils SEO portent sur les champs visibles. Ils ne modifient aucun champ.
3. Enregistre la fiche pour la retrouver dans Brouillons et relecture. Le workflow Decap crée des références de travail visibles dans le dépôt GitHub public. N’y dépose pas de texte confidentiel.
4. Publie lorsque la fiche est prête. Le site la sert après le build Cloudflare. Le réglage Masquer du site conserve la compatibilité avec les anciennes fiches portant `draft: true`. Pour remettre ces fiches en ligne, désactive ce réglage et publie la modification.

Pour gérer l’accueil, ouvre la bibliothèque de la rubrique. La sélection affiche jusqu’à trois citations, écrits et musiques, un livre et une réflexion. Les workflows GitHub de remplacement pour la réflexion et le livre sont ceux du dépôt. Les modifications de sélection portent sur le champ de frontmatter `featured`.

La médiathèque existante conserve ses sources Git et R2. Elle ajoute la copie du lien, l’état de sélection annoncé aux lecteurs d’écran et le chargement des informations audio à la demande.

## Audit

- L’ancienne configuration enregistrait directement dans `main` et utilisait `draft` pour masquer une fiche. Le manifeste public diffusait déjà les résumés des fiches masquées. Les fichiers et les brouillons GitHub de ce dépôt sont publics.
- Les cinq aperçus sont enregistrés via la fonction `h` exportée par le bundle Decap. Les textes longs passent par le rendu Markdown de Decap. Les couvertures d’aperçu passent par son résolveur d’assets.
- Les nouveaux livres disposent d’une fiche statique générée par Astro. Les deux recueils existants conservent leur adresse et leur modèle dédié. Les livres masqués sont exclus du catalogue, de la génération de fiches et du sitemap.
- La connexion utilise le backend GitHub et le callback `https://aupositeur-decap-oauth.nicolas-rugolo.workers.dev/callback`. Le Worker déployé a répondu par une redirection GitHub avec la portée `public_repo,user`. La configuration déclarative du Worker dans le dépôt contient encore une origine de migration. Tout redéploiement indépendant du Worker OAuth doit vérifier les réglages de production effectifs.
- Le script CDN Decap est épinglé par version et par empreinte SRI. Le jeton administrateur de la médiathèque R2 est conservé pour la session de l’onglet. Le Worker Communauté et ses contrôles Access, D1, les newsletters, les clés OAuth et les services statistiques suivent leurs configurations existantes.
- `npm audit --omit=dev` a remonté 12 entrées sur la chaîne de dépendances existante, dont une critique signalée sur Astro. Le correctif complet proposé par npm demande une version majeure. Le site sert des fichiers Astro prérendus via Cloudflare. Le rapport npm ne suffit pas à établir l’exposition des routes de production.
- L’intégration officielle `@astrojs/sitemap` automatise un travail déjà couvert par le sitemap du site et par sa validation. Decap fournit le workflow, la médiathèque et les aperçus. Une extension supplémentaire n’apportait pas de bénéfice démontré pour ce lot.

Pour revenir à la version précédente, créer un commit de revert du commit Studio sur `main` et vérifier le déploiement Cloudflare. Les brouillons du workflow restent dans leurs références GitHub et les éventuels contenus publiés séparément conservent leur historique.
