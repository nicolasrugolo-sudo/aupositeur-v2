# AUPOSITEUR Studio — Revue technique de trois modèles d'administration

Date : 17 novembre 2026. Objectif : améliorer le Studio Decap sans remplacer les contenus ni les intégrations Cloudflare.

## 1. Flowbite Astro Admin Dashboard

Source : https://github.com/themesberg/flowbite-astro-admin-dashboard (MIT).

- Code examiné : `src/components/SearchInput.astro`, `src/components/NavPagination.astro`, `package.json` et arborescence.
- Atouts : recherche dans l'interface, navigation, tableaux et composants CRUD.
- Limites : le package dépend d'Astro ^2.0.4, de Tailwind 3 et d'une ancienne intégration Astro/Tailwind. Son composant de pagination présente des liens `href="#"` et un script placeholder : il ne faut pas le considérer comme une pagination fonctionnelle.
- Décision : réimplémenter les comportements utiles dans le Shell existant. Ne pas installer le template entier.

## 2. Accessible Astro Dashboard

Source : https://github.com/incluud/accessible-astro-dashboard (MIT).

- Code examiné : `src/components/Navigation.astro`, `ResponsiveToggle.astro`, `src/layouts/DefaultLayout.astro` et `package.json`.
- Atouts : liens d'évitement, navigation clavier, états de focus et adaptation mobile.
- Limites : le package dépend d'Astro ^1.4.4. Le layout de démonstration contrôle la connexion par `localStorage` ; ce n'est **pas** une authentification serveur sécurisée et ne doit jamais remplacer OAuth GitHub/Decap.
- Décision : adapter les interactions accessibles au Shell et conserver l'authentification existante.

## 3. Astero Admin

Source : https://github.com/asterodigital/bootstrap-admin-template (MIT).

- Code examiné : `src/js/layout/sidebar-handler.js`, `src/js/layout/dark-mode.js`, `package.json` et arborescence SCSS.
- Atouts : gestion de la barre latérale selon la taille d'écran, composants de formulaire, thèmes.
- Limites : Bootstrap 5 et sa feuille de style globale peuvent entrer en conflit avec le CSS personnalisé et l'interface Decap. Les fonctions de thèmes utilisent `localStorage` : à isoler et à tester avant adoption.
- Décision : ne pas importer Bootstrap globalement ; intégrer au besoin des comportements ponctuels.

## Modifications réalisées

- `4d4923cf` : regrouper les inspections DOM Decap sur une seule frame pour éviter les inspections redondantes.
- `a2350fbf` : `aria-current` pour la navigation active, `Ctrl/Cmd+K` dans les bibliothèques, `Escape` pour fermer le menu mobile et rendre le focus.

Ces adaptations sont originales, inspirées des pratiques des trois projets ; aucun code source tiers n'a été copié tel quel. Les licences MIT des modèles doivent rester prises en compte si un composant est copié à l'avenir.

## Points à vérifier avant une refonte plus large

1. Tester l'éditeur et la publication Decap après connexion OAuth réelle, y compris le workflow de brouillons.
2. Tester les raccourcis au clavier dans les bibliothèques et l'absence d'interférence avec les champs de rédaction.
3. Mesurer le coût des rendus DOM du Shell et vérifier le comportement mobile.
4. Vérifier les alertes de dépendances Astro et les routes exposées avant toute mise à jour majeure.
5. Préserver les textes Markdown à l'octet près lors des expérimentations d'éditeur enrichi.
6. Conserver la médiathèque R2, les services D1/Workers, les statistiques et les collections existantes.

La présence d'un commit GitHub ne constitue pas une validation navigateur ni une preuve de déploiement Cloudflare. Les tests d'intégration restent nécessaires.
