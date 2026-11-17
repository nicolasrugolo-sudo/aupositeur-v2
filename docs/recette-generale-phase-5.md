# AUPOSITEUR — recette générale et plan de production

## Décision

La branche sert de candidate à la recette. La production attend une validation explicite après vérification de l’OAuth distant, des widgets connectés et de l’exploitation des newsletters. Les commandes de ce document sont préparées pour une fenêtre autorisée.

## Périmètre et preuves

| Zone | Différence et vérification |
| --- | --- |
| Astro et médias | Refonte progressive des écrans publics, du partage des parcours par thème et du rendu de lecture. Le workflow joint le diff exhaustif avec `origin/main`, contrôle le contenu source et les médias suivis, compare les chemins HTML et les URL du sitemap, puis audite les canoniques et liens internes. |
| Boutique | Les redirections vers Fourthwall restent suivies dans `public/_redirects`. Le catalogue externe et le paiement dépendent de Fourthwall. |
| Studio et Decap | Branche, OAuth et configuration de production conservés. L’entrée de l’administration principale bloque le démarrage de Decap et de ses widgets sur une origine de prévisualisation. Le pilote local `/studio-test/` utilise un clone sans dépôt distant. |
| Worker Communauté | Modération, abonnés paginés, réédition des campagnes, file d’envoi et historique administratif. Le diff porte sur `workers/community-api/index.js`. |
| D1 | Migration additive `db/migrations/0001_subscriber_consent_events.sql`. Elle ajoute une table d’événements et trois déclencheurs, et relève un état initial pour chaque abonné sans changer sa fiche. L’état initial représente les données connues lors de la migration. Les événements plus anciens absents de D1 ne peuvent être reconstruits. |
| R2 | Aucun changement de configuration des Workers R2. Relever les noms de buckets, origines autorisées et droits de recette. Une écriture de test nécessite une cible R2 de recette, distincte des médias publics. |
| OAuth et Brevo | Aucun secret ni réglage distant modifié. Les autorisations GitHub et la réponse Brevo sont simulées dans les tests D1. Relever la configuration effective, les versions déployées et les autorisations dans le compte Cloudflare avant la fenêtre de mise en service. |

Les mesures locales de transfert et de chargement sont comparables à l’intérieur du même runner. La validation des Core Web Vitals sur le site déployé demande une mesure distincte avec ses polices, services et conditions réseau. Le test d’accessibilité vérifie un ensemble défini de règles et ne vaut pas certification.

## Résultats de recette

- **Public**. Les builds Astro de `main` et du candidat ont réussi. L’inventaire couvre 210 fichiers HTML publics, 189 URL du sitemap et 42 règles de redirection. Les canoniques du sitemap et les liens internes vers les routes ou fichiers n’ont signalé aucun écart. Les ancres, toutes les destinations externes et le comportement de Cloudflare en production demandent des vérifications distinctes.
- **Chromium**. 12 écrans publics à trois largeurs (390, 768 et 1 440 px), soit 36 captures en page complète, plus la garde Studio. Aucun débordement horizontal et aucun signalement parmi les cinq règles axe exécutées dans le contenu principal. Le premier passage a détecté des contrastes faibles sur l’accueil, les fiches de citation et les fiches musicales. Le second passage confirme la correction. Les citations sans clip local ne lancent plus la recherche d’une vidéo inexistante.
- **Visuel et performance**. La revue des captures a relevé un catalogue Livres encore serré à 768 px. Mesurer les images dès la recette distante. L’accueil transfère environ 10,3 Mo pendant le scénario de capture complète, qui active aussi les images plus bas dans la page. Ce chiffre ne représente pas son chargement initial. L’ouverture de la boutique Fourthwall n’a pas pu être validée ici. La règle de redirection reste identique à `main`.
- **Studio**. La recette Decap locale confirme les sauvegardes, les aperçus, la mise en relecture et la publication sur la branche du clone isolé, ainsi que l’exclusion des brouillons du build. Le navigateur confirme que l’administration principale n’initialise pas Decap sur une origine de prévisualisation. Les écritures sur les médias spécialisés et la mise en avant distante restent à recetter.
- **Communauté**. Le test local a repris l’inscription, l’opt-in, la modération et les campagnes. Le défaut Brevo 429 simulé, la déduplication et le jeton de désinscription à usage unique sont couverts. Wrangler a exécuté le fichier SQL sur un binding fictif. Le test D1 a validé le retour sur données existantes, la réapplication, l’opposition préservée après réinscription et la suppression en cascade sur un abonné fictif.

[Captures et inventaire du site](https://github.com/nicolasrugolo-sudo/aupositeur-v2/actions/runs/44024954929/artifacts/14303006095) · [Captures et résultats Studio](https://github.com/nicolasrugolo-sudo/aupositeur-v2/actions/runs/44024271316/artifacts/14303070274) · [Recette Communauté et migration](https://github.com/nicolasrugolo-sudo/aupositeur-v2/actions/runs/44024974891/artifacts/14302383370)

## Conditions bloquantes

1. **Studio distant.** Créer une origine et une application OAuth de recette propres, avec retour et cookies limités à cette origine. Donner accès uniquement à un dépôt ou une installation de recette dont le jeton ne peut écrire en production. Vérifier connexion, déconnexion, mauvaise origine et écriture de preuve. Le pilote local reste utilisable en attendant. Faire la recette d’envoi et de retrait sur des objets R2 fictifs pour audio, vidéo et fichiers HD. Vérifier les images et mises en avant dans le même environnement.
2. **Communauté.** Vérifier en recette la passerelle Pages, l’identité GitHub autorisée et un utilisateur refusé. Déployer la migration d’abord sur une D1 de recette avec un schéma de production et des données fictives. Comparer le nombre de fiches, les anciennes oppositions et les événements créés.
3. **Newsletters.** Relever les limites et le quota réellement disponible dans le compte Brevo. Tester l’authentification du domaine et la réception sur une adresse dédiée seulement après autorisation. Prévoir la réconciliation par identifiant fournisseur et la mise à l’écart des rebonds durs. Tant que ce parcours reste ouvert, garder la campagne en brouillon ou laisser la mise en file inactive. L’état « accepté » signifie que Brevo a pris en charge le message. Les webhooks de remise et de rebond ne sont pas raccordés.
4. **Protection des données.** Valider qui traite les demandes RGPD, les durées de conservation par finalité et la conservation d’une preuve minimale d’opposition. Les captures et jeux de recette utilisent uniquement des données fictives.

### Demandes RGPD

Vérifier l’identité avec un minimum de données, journaliser la demande et sa décision, puis rechercher la fiche et ses événements par identifiant. Pour une demande d’accès, y associer les informations pertinentes sur les campagnes et vérifier la réponse avant remise par un canal privé. Une rectification d’adresse doit reconfirmer la nouvelle adresse et respecter l’opposition sur l’ancienne. Une désinscription conserve l’état et l’événement. Un effacement confirmé supprime la fiche et ses événements par cascade. Avant tout effacement, vérifier la base et la durée de conservation d’une preuve minimale d’opposition, la coordination avec Brevo et les règles de restauration des sauvegardes. Une restauration doit réintégrer les oppositions intervenues depuis la sauvegarde. [Commission européenne](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/dealing-requests-individuals_en)

## Fenêtre de déploiement, après accord

1. Fixer le SHA candidat, relever le SHA effectivement servi par Pages et l’identifiant de son déploiement, ainsi que la version déployée du Worker. Confirmer la branche de production et les automatismes de prévisualisation. Capturer les paramètres sans valeurs secrètes. Vérifier les campagnes en file et les livraisons incertaines.
2. Préparer et vérifier une sauvegarde D1 chiffrée, avec un point Time Travel antérieur à la migration. Sauvegarder séparément l’inventaire des objets et des paramètres R2. Valider une restauration sur une cible de recette.
3. Appliquer la migration additive à D1, puis contrôler le nombre d’abonnés et le nombre d’états initiaux. Déployer ensuite le Worker et vérifier ses lectures et permissions. Le Worker précédent reste compatible avec le schéma étendu.
4. Autoriser séparément l’intégration Git vers la branche de production si Pages est relié au dépôt. Vérifier le build Pages et les parcours de lecture, les redirections et l’accès Studio avec le compte prévu. Effectuer l’essai de courriel uniquement si l’autorisation couvre cet essai.

```bash
# Préparation et sauvegarde, à exécuter seulement pendant la fenêtre autorisée.
npm ci
npm run build
npx wrangler d1 export aupositeur-community --remote --output "$BACKUP_DIR/aupositeur-community.sql" --config workers/community-api/wrangler.jsonc
npx wrangler d1 time-travel info aupositeur-community --config workers/community-api/wrangler.jsonc

# Après validation de la sauvegarde et de la migration de recette.
npx wrangler d1 execute aupositeur-community --remote --file db/migrations/0001_subscriber_consent_events.sql --config workers/community-api/wrangler.jsonc
npx wrangler deploy --config workers/community-api/wrangler.jsonc
```

[Commandes D1](https://developers.cloudflare.com/workers/wrangler/commands/d1/) · [Intégration Git de Pages](https://developers.cloudflare.com/pages/configuration/git-integration/)

## Retour arrière

- **Pages et Astro.** Revenir au déploiement Pages de production précédemment consigné. Ajuster ensuite Git avec un revert approuvé pour éviter qu’un build ultérieur réintroduise la version retirée. Les changements des fichiers statiques et de Decap sont réversibles par Git.
- **Worker.** Revenir à l’identifiant de version compatible consigné, avec `npx wrangler rollback <VERSION_ID> --config workers/community-api/wrangler.jsonc`. Vérifier les bindings et les routes. En cas d’incident d’envoi, suspendre la mise en file et réconcilier les demandes déjà remises au fournisseur. Un rollback ne rappelle aucun courriel.
- **D1.** Garder la migration additive en cas de simple rollback du code afin de conserver les nouveaux événements. Une restauration D1 via Time Travel rend la base entière à un instant passé. L’utiliser seulement après décision spécifique, sauvegarde de l’état courant, estimation des écritures perdues et plan de réintégration des désinscriptions. Une restauration SQL s’éprouve d’abord sur une base distincte. Aucune restauration ni suppression de table par défaut.

[Retour arrière Pages](https://developers.cloudflare.com/pages/configuration/rollbacks/) · [Retour arrière Workers](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
