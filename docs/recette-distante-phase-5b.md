# AUPOSITEUR — phase 5B

## Décision et constat

**La recette distante reste à exécuter.** Le connecteur GitHub permet de lire le dépôt et d’écrire sur la branche de refonte. GitHub indique `main` comme branche par défaut, avec `protected: false` sur la fiche de branche. La consultation de l’endpoint détaillé des règles de protection est refusée au connecteur (403). Cette lecture ne permet pas de conclure sur toutes les règles organisationnelles. Le test devra exclure tout droit d’écriture dans le dépôt de production indépendamment de ces règles.

La configuration Decap versionnée cible `main`. Le Worker OAuth versionné renvoie vers une ancienne origine de prévisualisation et demande `public_repo,user` pour le dépôt public. Le Worker Communauté versionné pointe vers la base D1 de production et son cron traite la file toutes les cinq minutes. La passerelle Pages administrative a une destination Communauté de production codée en dur. Les widgets et les Workers médias et impression ciblent les services de production. Ces éléments proviennent du code et non d’une inspection du compte Cloudflare.

Aucun connecteur Cloudflare ou Brevo ni autorisation de compte exploitable n’a été trouvé dans cette session. Aucun paramétrage distant, courriel, téléversement ou retrait de fichier n’a été effectué.

## Architecture et générateur

Utiliser un projet Pages séparé `aupositeur-recette`, les Workers `aupositeur-recette-oauth` et `aupositeur-recette-community`, une D1 vierge `aupositeur-recette-d1` et deux buckets `aupositeur-recette-audio` et `aupositeur-recette-impression`. La branche Decap `recette-editoriale` appartient à un **autre dépôt**, chez un compte de recette dépourvu de rôle d’écriture sur le dépôt AUPOSITEUR. Remplir ce dépôt uniquement avec des œuvres et des médias fictifs. Utiliser un environnement Cloudflare distinct ou des droits limités aux ressources nommées.

```json
{
  "siteOrigin": "https://aupositeur-recette.pages.dev",
  "oauthOrigin": "https://aupositeur-recette-oauth.exemple.workers.dev",
  "communityOrigin": "https://aupositeur-recette-community.exemple.workers.dev",
  "githubRepo": "compte-recette/aupositeur-recette",
  "githubBranch": "recette-editoriale",
  "d1Id": "00000000-0000-4000-8000-000000000005"
}
```

Remplacer le compte, le sous-domaine Workers et l’identifiant fictifs par les valeurs de recette obtenues après création des ressources. Générer dans un dossier neuf, depuis le dépôt de refonte :

```bash
node scripts/prepare-remote-rehearsal.mjs settings-recette.json sortie-recette
```

Les fichiers générés contiennent le backend Decap de recette, les deux configurations Wrangler et l’inventaire des cibles. Les points d’entrée `oauth-entry.ts` et `community-entry.js`, le bootstrap Studio et les liaisons R2 demandent une adaptation avant déploiement. La génération ne provisionne aucune ressource et ne vérifie pas les droits effectifs du compte ou l’appartenance du UUID D1.

## Plan de lancement

1. **Vérifier l’identité de test.** Contrôler les droits du compte de recette sur le dépôt AUPOSITEUR en lecture seule, et l’absence de privilège d’écriture direct ou hérité. Un OAuth App distinct ne restreint pas son jeton à un seul dépôt. Avec le backend Decap existant, la séparation repose donc sur les droits du compte de test. Une GitHub App permettrait de limiter l’installation à des dépôts sélectionnés, si l’intégration Decap correspondante était validée. [Documentation GitHub](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps)
2. **Recetter OAuth.** Créer une application OAuth dédiée dont le callback vise exactement l’origine du Worker OAuth de recette suivie de `/callback`. Ajouter ses identifiants dans les secrets de ce Worker. Limiter les comptes admis côté serveur ou par un contrôle d’accès avant l’éditeur. Vérifier dans le navigateur le retour exact, le cookie d’état HttpOnly/Secure, la disparition du cookie après retour, l’échec d’un retour sans état valide, le refus d’un compte non autorisé, puis la déconnexion. Masquer les valeurs de jetons et cookies des captures.
3. **Raccorder Studio.** Ne pas copier la passerelle Pages ou le bootstrap de production dans la recette. Construire une entrée Studio dédiée, limitée au projet de recette. Brancher Decap sur le YAML généré et l’interface de modération sur le Worker de recette. Le Worker Communauté devra vérifier l’autorisation GitHub contre le dépôt et l’identité de recette, et limiter son origine. Adapter les widgets pour les deux destinations R2 de recette et retirer tout chemin de repli vers la production. Vérifier l’absence d’appels vers les origines de production pendant les essais.
4. **Couper les envois à la source.** Garder le cron vide, sans secret Brevo, et faire échouer les routes test et mise en file dans le Worker de recette. Pour le double opt-in fictif, utiliser un puits local qui conserve les messages factices ou injecter des jetons de confirmation côté recette. Les parcours D1 doivent rester isolés même en cas d’erreur de configuration.
5. **Écritures et preuves.** Relever les SHA de `main` et de `recette-editoriale` avant et après. Créer et modifier une réflexion fictive, activer sa mise en avant et prouver le commit et le rendu sur Pages. Dans chaque bucket de recette, téléverser, relire et retirer un seul objet fictif d’un préfixe réservé. Vérifier l’état de D1 après inscription, confirmation, modération et désinscription, sans consulter la D1 de production. Stocker captures sans secrets et identifiants de révision dans le dossier de recette.

## Brevo

Dans la console autorisée, relever le domaine d’expédition et son état d’authentification, les crédits réellement disponibles et le traitement des statuts de remise, blocage et rebonds. Pour un essai ultérieur autorisé, limiter la liste à une adresse dédiée, documenter l’identifiant de message retourné par Brevo, corréler la réception ou l’événement prestataire, puis utiliser le lien de désinscription et contrôler l’opposition avant tout nouvel envoi. La recette actuelle s’arrête avant cet essai. [Événements Brevo](https://developers.brevo.com/docs/transactional-webhooks)

## Sauvegarde et retour arrière

Sur la base de recette uniquement, vérifier l’identifiant D1 du fichier généré, puis exporter avant migration. Initialiser une seconde D1 vierge pour la restauration. Le fichier de restauration doit pointer sur cette seconde base, jamais sur la première ou sur la production.

```bash
npx wrangler d1 export aupositeur-recette-d1 --remote --output recette-avant.sql --config sortie-recette/community.wrangler.json
npx wrangler d1 execute aupositeur-recette-d1 --remote --file db/migrations/0001_subscriber_consent_events.sql --config sortie-recette/community.wrangler.json
# Après création de la deuxième D1 et contrôle de son UUID dans restauration.wrangler.json.
npx wrangler d1 execute aupositeur-recette-restauration --remote --file recette-avant.sql --config restauration.wrangler.json
```

Comparer les comptages, les statuts et les événements avant, après et sur la restauration. Pour le Worker, publier deux versions identifiables sur le Worker de recette uniquement et revenir à la première avec `wrangler rollback` et le fichier de recette. Pour Pages, revenir au déploiement précédent du **projet de recette** et vérifier une empreinte de build servie. Un rollback de code ne justifie pas de restaurer D1. [Export D1](https://developers.cloudflare.com/d1/best-practices/import-export-data/) · [Rollback Workers](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/) · [Rollback Pages](https://developers.cloudflare.com/pages/configuration/rollbacks/)

## Résultats et critères

| Classe | Résultat |
| --- | --- |
| Vérifié automatiquement | Exécution du générateur avec une configuration fictive valide. Rejet de six configurations utilisant une origine publique, le propriétaire de production, la branche `main`, l’UUID D1 de production, un champ secret ou le Worker OAuth de production. |
| Vérifié réellement à distance | Lecture des métadonnées GitHub et du SHA de `main`. Aucun parcours d’écriture distant exécuté. |
| Simulé | Sauvegarde SQL avant migration et après migration, restauration dans deux bases SQLite séparées. Intégrité vérifiée, état avant migration restauré et événements de consentement retrouvés dans la sauvegarde migrée. Ce test ne valide pas l’export distant D1. |
| Non vérifié | OAuth et cookies sur une URL de recette, écritures fictives en ligne, droits effectifs R2, quota et authentification Brevo, restauration D1 et retours arrière Workers et Pages. Aucun écran de recette distante à capturer. |
| Bloquant avant production | Provisionnement et validation des cibles isolées, validation de l’OAuth, des écritures médias et de la restauration D1. Pour activer les campagnes, recette Brevo autorisée et procédure de suivi des rebonds et oppositions. |
| Non bloquant | Passage à une GitHub App si la séparation effective par compte de test est démontrée et compatible avec le périmètre retenu. |

[Rapport de phase 5](recette-generale-phase-5.md)
