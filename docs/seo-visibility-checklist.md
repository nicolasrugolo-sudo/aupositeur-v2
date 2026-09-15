# SEO / visibilité gratuite — AUPOSITEUR

## Implémenté

- Domaine canonique conservé sur `https://www.aupositeur.be` tant que le domaine nu ne répond pas correctement.
- `robots.txt` généré avec déclaration du sitemap et exclusion de `/admin/` du crawl.
- `sitemap.xml` généré avec uniquement les pages publiques utiles et les contenus non brouillons.
- Brouillons de poèmes exclus des routes statiques.
- Titres et descriptions uniques pour les pages de citations.
- Descriptions de poèmes raccourcies pour les résultats de recherche.
- Open Graph et Twitter Cards globaux, avec image de secours réellement versionnée dans Git.
- Cartes sociales 1200×630 pour citations et poèmes via les générateurs sociaux existants.
- JSON-LD `WebSite`, `Person`, `CreativeWork` et `Book`.
- Ancienne boutique interne et panier redirigés vers Fourthwall.
- `/musiques/` redirigé vers la page canonique `/musique/`.
- Titre et description de la page d’accueil rendus plus explicites pour Google.

## Après déploiement

1. Vérifier les réponses HTTP de `/robots.txt`, `/sitemap.xml`, `/musiques/`, `/boutique/` et `/panier/`.
2. Ajouter la propriété `https://www.aupositeur.be` dans Google Search Console si elle n’existe pas déjà.
3. Soumettre `https://www.aupositeur.be/sitemap.xml` dans Search Console.
4. Demander l’indexation de l’accueil, `/ecrits/`, `/citations/`, `/musique/`, `/livres/` et de quelques œuvres prioritaires.
5. Vérifier les données structurées avec le test des résultats enrichis Google.
6. Corriger le domaine nu `aupositeur.be` au niveau DNS/Cloudflare puis le rediriger en 301 vers `www.aupositeur.be`.
