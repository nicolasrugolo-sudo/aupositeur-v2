# Recette Communauté — phase 4C

## Périmètre

Les vérifications automatisées utilisent le Worker du dépôt, une base D1 locale et des réponses fictives pour l’identité GitHub, Turnstile et Brevo. Aucun envoi réel. La recette ne valide ni les identifiants et domaines de production, ni la réception effective dans les boîtes mail.

- Newsletters : création et réédition d’un brouillon, refus d’une modification après mise en file, aperçu du texte, historique et compteurs par résultat. La file réserve une livraison avant d’appeler le fournisseur. Une réponse ambiguë, un échec ou un arrêt après réservation ne doivent pas être rejoués automatiquement.
- Abonnés : pagination par 50, recherche sur l’ensemble de la base, filtres par statut, date et version du consentement, confirmation et désinscription. Une désinscription conserve l’état dans D1 et retire la personne des envois suivants. La lecture des dates présentes n’équivaut pas à un journal immuable de tous les consentements.
- Commentaires : compteur d’attente dans l’onglet Communauté du Studio, approbation, refus, réponse de l’auteur et fermeture par œuvre. Un statut séparé « masqué » n’est utile que si l’équipe doit distinguer un retrait après publication d’un refus avant publication. Le modèle actuel suffit à retirer une contribution de l’affichage. Aucun envoi de notification n’a été ajouté.

## Conditions de lancement des newsletters

| Priorité | Vérification avant le premier envoi |
| --- | --- |
| Bloquant | Valider l’authentification administrateur dans une recette distincte, les paramètres du domaine d’expédition et l’accès en lecture au quota réel du compte Brevo. |
| Bloquant | Faire une recette autorisée avec une adresse dédiée, tester la confirmation, la désinscription effective et le classement en boîte de réception. |
| Bloquant | Mettre en place une procédure de rapprochement des rebonds, refus et envois incertains dans Brevo. Un événement de remise ne doit pas être déduit d’un succès HTTP. Au besoin, utiliser les webhooks transactionnels authentifiés, dédupliqués et corrélés par identifiant fournisseur, avec des règles distinctes pour rebond dur et temporaire. Aucun webhook n’a été activé dans cette phase. |
| Bloquant | Documenter le traitement des demandes d’accès, de rectification et d’effacement ainsi que la conservation des preuves de consentement et des oppositions. Confirmer ces règles avant toute suppression réelle. |
| Non bloquant | Programmer un lancement à une heure choisie. Le mécanisme gratuit envisagé garde le cron Cloudflare existant et ajoute une échéance UTC à la campagne via migration D1. L’interface affiche l’heure locale et la tranche de traitement de cinq minutes. La campagne reste annulable avant traitement, et les consentements sont revérifiés au moment de la prise en charge. Cette phase n’ajoute ni migration ni programmation. |
| Non bloquant | Fournir un journal d’événements par destinataire et un historique paginé au-delà des 100 dernières campagnes. Le tableau actuel distingue la prise en charge par Brevo, les erreurs, les exclusions et les traitements dont l’issue reste à vérifier. |

Brevo annonce 300 envois par jour pour le forfait gratuit. Le quota disponible dépend du compte et des autres envois. L’API locale ne mesure pas ce quota. Les e-mails transactionnels peuvent aussi entrer dans une file du fournisseur. [Limites du forfait](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan) · [Événements transactionnels](https://developers.brevo.com/docs/transactional-webhooks)

## Préparation RGPD

- **Accès**. Vérifier l’identité de la personne, rechercher l’adresse exacte et établir une réponse avec les données liées, les dates, la version de consentement, la provenance disponible et les éventuels envois. Le Studio fournit les éléments principaux du dossier. Aucun export public ni accès par adresse seule.
- **Rectification**. Établir la procédure avant d’introduire un bouton de changement d’adresse. Pour une nouvelle adresse, prévoir une confirmation à cette adresse et conserver l’opposition applicable à l’ancienne selon les règles retenues.
- **Effacement**. La suppression administrative existante est définitive. Une désinscription ordinaire laisse une trace pour éviter de reprendre les envois. Définir les cas et la base de conservation d’une preuve minimale d’opposition avant un effacement ou un import. Prévoir la coordination avec Brevo et les sauvegardes.
- **Conservation**. La version actuelle écrase certains champs lors d’une réinscription. Définir une durée par finalité, un journal de consentement et d’opposition, et des règles de purge. Éviter une durée arbitraire unique.

[Commission européenne — traitement des demandes d’exercice des droits](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/dealing-requests-individuals_en)
