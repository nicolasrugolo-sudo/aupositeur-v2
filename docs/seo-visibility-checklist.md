# SEO / visibilité gratuite — AUPOSITEUR

## État technique validé

- Domaine canonique : `https://www.aupositeur.be`.
- Domaine nu `https://aupositeur.be/*` redirigé en 301 vers `https://www.aupositeur.be/*` en conservant chemin et paramètres.
- DNS autoritaire chez Cloudflare ; DNSSEC activé côté Cloudflare et DS publié chez OVH.
- `robots.txt` généré avec déclaration du sitemap et exclusion de `/admin/`.
- `sitemap.xml` limité aux pages éditoriales publiques et contenus non brouillons.
- Brouillons exclus des routes statiques éditoriales.
- Titres, descriptions, canonical, Open Graph, Twitter Cards et JSON-LD présents sur les pages éditoriales.
- Un seul H1 sur chaque page éditoriale générée, contrôlé automatiquement par GitHub Actions.
- Descriptions génériques des poèmes supprimées au profit de descriptions spécifiques ou d’extraits réels.
- Citations sans fichier vidéo : aucun lecteur vidéo cassé n’est rendu.
- Ancienne boutique interne et panier redirigés vers Fourthwall ; leurs routes de secours sont `noindex` et absentes du sitemap.
- `/musiques/` redirigé en 301 vers la page canonique `/musique/` et absent du sitemap.
- Le workflow GitHub `SEO validation` construit le site et contrôle automatiquement le contrat SEO à chaque push sur `main`.

## Google Search Console — prochaine étape

1. Contrôler la propriété canonique `https://www.aupositeur.be`.
2. Vérifier que `https://www.aupositeur.be/sitemap.xml` est toujours lu sans erreur après le dernier déploiement.
3. Contrôler l’indexation de l’accueil et des sections `/ecrits/`, `/citations/`, `/musique/`, `/livres/` et `/a-propos/`.
4. Examiner les motifs d’exclusion restants et distinguer les anciennes URL historiques des URL canoniques actuelles.
5. Tester les URL prioritaires avec l’inspection d’URL avant toute nouvelle demande d’indexation.
6. Vérifier les données structurées et les éventuelles améliorations signalées par Google.
7. Surveiller ensuite la découverte progressive des œuvres présentes dans le sitemap plutôt que multiplier les demandes manuelles d’indexation.
