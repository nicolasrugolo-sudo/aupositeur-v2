# AUPOSITEUR V3 / Studio V2 — dossier de cadrage technique

Statut : étude préalable, **aucune migration activée**. Branche isolée : `refonte/aupositeur-v3-studio-v2`.
Référence visuelle : https://www.noepreszow.com/
Sources techniques : https://github.com/markhorn-dev/astro-sphere ; https://github.com/satnaing/astro-paper ; https://sveltiacms.app/en/docs/migration

## Décisions validées
- Évolution maîtrisée : préserver les compositions actuelles de l'accueil et renforcer la parenté visuelle avec Noé Preszow.
- Noir et blanc cinéma pour la présentation ; fonds de lecture adaptés aux textes.
- Astro Sphere : **référence et source de composants sélectionnés**, pas remplacement aveugle du projet.
- AstroPaper : **principes éditoriaux** (recherche, pagination, archives, SEO), pas deuxième thème superposé.
- Sveltia CMS : **candidat de remplacement de Decap**, sous réserve de tests réels de connexion, médias, relations et workflow.
- Aucune modification automatique des textes poétiques, des slugs ou des URL publiques.
- Préserver Workers, D1, R2, boutiques, réseaux sociaux, newsletter et communauté.

## État réel du dépôt au cadrage
- `package.json` : Astro `^5.13.0`, `embla-carousel ^8.6.0`, Sharp.
- `astro.config.mjs` : build statique, plugin remark personnalisé préservant les retours à la ligne des poèmes.
- `src/content.config.ts` : collections `categories`, `poemes`, `citations`, `musiques`, `livres`, `boutique`, `reflexions`.
- `src/pages/index.astro` : accueil existant, portraits, carrousels, sélection de contenus, newsletter.
- `src/styles/home-noe-prototype.css` : prototype existant à auditer, **non importé automatiquement**.
- `public/admin/index.html` : shell d'administration personnalisé.
- `public/admin/config.yml` : backend GitHub, OAuth Worker, `publish_mode: editorial_workflow`, médias dans `public/images`.
- Workers : `community-api`, `contact-api`, `decap-oauth`, `google-insights`, `media-api`, `shop-api`, `site-gateway`, `social-api`.

## Compatibilité et points bloquants
1. AstroPaper récent vise des versions Astro plus nouvelles : ne pas copier son projet complet dans Astro 5. Étudier une migration Astro séparément.
2. Astro Sphere apporte Tailwind et parfois SolidJS : éviter ces dépendances tant qu'un composant précis n'en justifie pas le coût.
3. Sveltia peut lire des configurations Decap, mais la compatibilité de **chaque widget personnalisé**, du proxy OAuth existant et du workflow doit être prouvée avant la bascule.
4. Le shell Studio actuel et ses modules Cloudflare ne sont pas fournis par Sveltia. Prévoir une intégration distincte, pas une suppression.
5. Les brouillons Decap existants peuvent dépendre de branches et PR ; inventaire et restauration obligatoires.

## Ordre d'implémentation
### Lot A — Inventaire et protections
- Photographier l'état visuel desktop/mobile des pages publiques et du Studio.
- Cartographier imports CSS, composants JS, dépendances et endpoints.
- Vérifier état GitHub Actions, URL et SEO, inventaire des brouillons/PR, sauvegardes et accès.
- Établir tests de non-régression (contenus, slugs, retours à la ligne, formulaires, liens).

### Lot B — Site V3 sans rupture graphique
- Définir tokens typographiques, couleurs, espacements et composants partagés.
- Réconcilier le prototype Noé avec les styles actifs sans écraser l'accueil validé.
- Standardiser les carrousels en évaluant Embla déjà installé.
- Introduire progressivement recherche Pagefind, pagination et archives **sur les collections existantes**.
- Tester SEO, accessibilité et performance avant toute fusion.

### Lot C — Studio V2
- Monter Sveltia en environnement isolé, avec dépôt de test et authentification dédiée.
- Tester toutes les collections : création, édition, aperçu, relation, médias, brouillon, relecture, publication.
- Vérifier OAuth GitHub et permissions du Worker ; aucune hypothèse sur la compatibilité.
- Préserver et raccorder les modules personnalisés Communauté, Newsletters, Réseaux sociaux et Boutique.
- N'envisager la bascule qu'après une matrice de tests validée.

### Lot D — Livraison
- Build et contrôles automatisés.
- Comparaison visuelle avec l'accueil actuel et la référence Noé.
- Validation de non-régression, plan de retour arrière, puis intégration contrôlée dans `main`.

## Critères de sortie
- Aucun poème, média, brouillon, commentaire, abonné ou URL perdu.
- Accueil reconnaissable et cohérent avec la direction Noé.
- Workflow éditorial opérationnel de bout en bout, sans publication accidentelle.
- Build vert et tests de navigation, formulaire, SEO et mobile vérifiés.
- Aucun nouveau service payant obligatoire.

## Références
- Astro Sphere (MIT) : https://github.com/markhorn-dev/astro-sphere
- AstroPaper, fonctionnalités : https://github.com/satnaing/astro-paper/wiki/Features
- AstroPaper, versions : https://github.com/satnaing/astro-paper/wiki/Upgrading
- Sveltia, workflow : https://sveltiacms.app/en/docs/workflows/editorial
- Sveltia, OAuth Cloudflare : https://github.com/sveltia/sveltia-cms-auth
