# Studio V2 — architecture et recette de migration Sveltia

## Interfaces retenues
- **Contenus** : interface Sveltia CMS native. Ne pas injecter les styles du shell actuel dans le DOM du CMS.
- **Outils** : tableau de bord, calendrier social, communauté, newsletters, boutique et intégrations conservés dans leurs applications existantes.
- **Point d'entrée** : menu de navigation transversal simple avec liens vers Contenus et Outils, sans supposer que leurs sessions sont communes.
- Les URL finales ne sont pas encore décidées. Ne pas modifier `/admin/` en production tant que la recette n'est pas validée.

## Dépendances à traiter
- `public/admin/index.html` : charge Decap 3.17.3, le shell, les widgets et les prévisualisations personnalisés.
- `public/admin/admin-shell.js` : inspecte les nœuds du DOM Decap, pilote les listes, la médiathèque et la navigation. **Ne pas réutiliser tel quel dans Sveltia.**
- `public/admin/config.yml` : configuration GitHub `main`, OAuth Cloudflare, `editorial_workflow`, collections, widgets et dossiers de médias.
- `public/admin/studio-previews.js`, `audio-widget.js`, `shop-hd-widget.js` : dépendances Decap à recenser individuellement.
- Les modules Cloudflare restent découplés et doivent conserver leurs autorisations existantes.

## Matrice de recette obligatoire
| Domaine | Test | Résultat |
| --- | --- | --- |
| Connexion | Authentification GitHub Sveltia avec OAuth autorisé | À tester |
| Collections | Lire chaque collection sans altérer le frontmatter | À tester |
| Relations | Sélectionner et enregistrer catégories communes | À tester |
| Texte | Conserver accents, caractères spéciaux et retours à la ligne des poèmes | À tester |
| Médias | Ajouter, sélectionner et réutiliser les images existantes | À tester |
| Brouillons | Créer un brouillon, fermer la session, reprendre | À tester |
| Workflow | Soumettre en relecture et publier sur dépôt isolé | À tester |
| URLs | Conserver slug, canonical, images et chemins | À tester |
| Modules | Vérifier tous les liens vers Social, Communauté, Newsletter et Boutique | À tester |
| Sécurité | Vérifier droits GitHub et Workers, pas de jeton dans le navigateur | À tester |
| Retour arrière | Revenir à Decap sans perte ni publication involontaire | À tester |

## Séquence d'exécution
1. Inventaire des brouillons et PR existants, sauvegarde des contenus et contrôle des accès.
2. Vérification de la documentation Sveltia actuelle et des options d'authentification GitHub.
3. Prototype isolé avec **configuration explicitement ciblée sur un dépôt de test** ; ne pas réutiliser un `config.yml` qui pointe vers `main`.
4. Tests complets de la matrice ; correction des incompatibilités constatées.
5. Construction de la navigation Contenus / Outils et contrôle des permissions indépendantes.
6. Bascule seulement après réussite des tests et validation du retour arrière.

## Non-objectifs
- Aucun remplacement immédiat du Studio public.
- Aucune conversion automatique des œuvres.
- Aucun transfert des données D1/R2 vers Sveltia.
- Aucune hypothèse que les widgets personnalisés Decap fonctionnent dans Sveltia.
