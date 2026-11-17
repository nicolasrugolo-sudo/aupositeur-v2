# AUPOSITEUR — Audit et recette isolée (17 novembre 2026)

## Base et protection

- Base de référence publique : `ebc8959bc3ccd2f4dbf40a1fda89c62f25bb01ad`.
- Branche de travail : `audit/studio-communaute-newsletters-20261117`.
- **Aucun merge vers main, aucune migration D1 distante, aucun envoi Brevo, aucun déploiement Worker ni écriture R2 sans validation et recette isolée.**
- Les branches `refonte/aupositeur-editorial`, `test/studio-editorial` et `feature/communaute-commentaires-abonnes` ont divergé de main : ne pas les fusionner en bloc.

## Constats vérifiés dans le code

1. `public/admin/config.yml` sur main : Decap CMS utilise le backend GitHub, la branche `main` et le Worker OAuth `aupositeur-decap-oauth`. Les collections catégories, citations, écrits, réflexions, musiques et livres existent.
2. Réflexions : `featured` et `draft` existent ; le corps utilise le widget `markdown`. L'accueil choisit la réflexion publiée mise en avant la plus récente.
3. `.github/workflows/enforce-single-featured-reflection.yml` normalise après un push sur main lorsqu'exactement **une** réflexion modifiée porte `featured: true`. Si plusieurs réflexions sont promues dans un même commit, l'action quitte sans normaliser ; une fenêtre de déploiement intermédiaire peut également précéder la normalisation. Le contrôle n'est donc pas une garantie transactionnelle au moment de l'enregistrement.
4. `scripts/enforce-single-featured.mjs` ne couvre que citations, poèmes et musiques, pas les réflexions (gérées séparément par le workflow ci-dessus).
5. `docs/studio-test.md` de la branche de refonte décrit un pilote Decap local, isolé du dépôt distant, et des tests de brouillons/relecture. `docs/recette-distante-phase-5b.md` précise que la recette OAuth/R2 distante n'a pas été effectuée.
6. `docs/recette-generale-phase-5.md` signale des conditions bloquantes pour l'OAuth, les écritures médias, la migration D1, la délivrabilité Brevo et la gestion des rebonds.

## Recette à effectuer avant toute intégration

### Studio
- Cloner dans un dépôt de recette **sans droits d'écriture sur AUPOSITEUR** ; utiliser un compte OAuth et un Worker distincts.
- Éditer une réflexion fictive avec titres, listes, liens et image ; sauvegarder, recharger et comparer exactement le contenu.
- Éditer une **copie** d'un poème : comparer octet à octet les vers, strophes, retours à la ligne et espaces avant/après.
- Promouvoir une réflexion, puis une autre ; vérifier qu'une seule est `featured: true` dans le dépôt et visible sur l'accueil après build. Tester aussi deux promotions dans un seul commit.
- Vérifier que `draft: true` exclut réellement la page, le sitemap et les listes.
- Tester téléversement/lecture/suppression uniquement dans des buckets R2 fictifs.

### Communauté
- Déployer un Worker et une D1 de recette distincts, sans secrets de production ni envois actifs.
- Vérifier confirmation double opt-in, opposition, désinscription, modération, refus d'accès et limites de débit.
- Tester la migration `db/migrations/0001_subscriber_consent_events.sql` sur une copie fictive ; exporter et restaurer la D1 de recette.
- Vérifier les droits de modération et les procédures RGPD avant activation.

### Newsletters
- Garder les campagnes en brouillon et le cron d'envoi inactif en recette.
- Tester brouillon, édition, rendu HTML/texte, aperçu mobile, sélection de destinataires, déduplication et désinscription avec un fournisseur simulé.
- Vérifier authentification de domaine, quota Brevo, gestion des rebonds et statut réel des messages avant tout essai réel explicitement autorisé.

## Critères de validation

- Les modifications sont limitées à une branche isolée ; aucun accès d'écriture de recette à la production.
- Les tests sont exécutés et leurs résultats conservés (SHA, logs et captures sans secrets).
- Les échecs sont corrigés et retestés.
- Un diff ciblé et un plan de retour arrière sont présentés avant une éventuelle fusion.

## État

Audit de code effectué ; **recette distante, tests R2/D1/Brevo et validation fonctionnelle en navigateur non réalisés dans cette étape**. Ce document ne doit pas être interprété comme une homologation de production.
