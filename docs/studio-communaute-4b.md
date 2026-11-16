# Studio et Communauté — phase 4B

## Interface administrative

| Espace | Parcours retenu | Code conservé |
| --- | --- | --- |
| Contenus | Les liens de collection ouvrent les listes et formulaires natifs de Decap. | Tableau de bord, statistiques, navigation, aperçus et widgets métiers. L’ancienne liste reste accessible avec `/admin/?vue=studio#/collections/ecrits` pour comparer et revenir en arrière. |
| Médiathèque | Le sélecteur natif est déjà accessible depuis le volet Médias et les champs image. | Le volet actuel reste disponible pour les vidéos, l’audio R2 et l’impression, en attendant une recette de remplacement. Les écritures du volet et des widgets ciblant les services réels sont bloquées hors du domaine de production. |
| Communauté et communication | Commentaires, Abonnés et Newsletters sur une seule page. | Passerelle Pages, Worker, schéma D1, configuration Cloudflare, module de statistiques et intégrations existantes. |

Le pilote Decap reste accessible en loopback, avec un clone sans dépôt distant. Le Worker OAuth renvoie le résultat à une origine configurée. Un pilote distant authentifié nécessiterait une origine, une configuration OAuth et un périmètre d’écriture distincts. Aucun changement à ces services n’a été effectué.

## Communauté

| Domaine | Existant réutilisé | Limites et points à vérifier |
| --- | --- | --- |
| Abonnés | Double opt-in, adresse unique insensible à la casse, date et version du consentement, statuts en attente, confirmé et désinscrit, jetons avec expiration et désinscription. Recherche et filtres d’administration ajoutés. | La recherche porte sur les 500 entrées retournées par l’API. La suppression existe. L’export d’accès, la rectification et la politique de conservation restent à définir et à vérifier. |
| Commentaires | File de modération, approbation, refus, réponse officielle, fermeture par œuvre, Turnstile et limite de débit. Le refus retire le commentaire du flux public. | Pas de statut de masquage distinct ni de notification automatique de modération identifiée. La suppression définitive garde sa confirmation. |
| Newsletters | Brouillon texte, option depuis une œuvre, aperçu ordinateur/mobile, courriel de test, confirmation de mise en file, statut historique. Le Worker prépare les destinataires actifs, revérifie leur statut avant l’envoi et déduplique par couple campagne/abonné. | La file est traitée par le cron existant toutes les cinq minutes, 15 destinataires au maximum par passage. Le calendrier à date et heure choisies, la segmentation, la modification d’un brouillon existant, les rebonds et le détail d’erreur par destinataire restent à faire. Aucun envoi fournisseur réel n’est inclus dans la recette. |

La mise en file et la création de la liste des destinataires constituent une transaction D1. Les envois dont l’état est ambigu ne doivent pas être relancés à l’aveugle. Le forfait gratuit de Brevo annonce 300 envois par jour. Ce plafond est partagé avec les autres envois utilisés sur le compte et ne confirme ni le quota disponible ni la disponibilité d’une campagne. Les paramètres DKIM, DMARC et les rebonds restent à contrôler avant un envoi réel. [Limites Brevo](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan) · [Authentification du domaine](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC)

## Statuts de publication

1. **Enregistré** signifie que Decap a sauvegardé un état ou ouvert un brouillon éditorial.
2. **Brouillon et relecture** sont des étapes du workflow natif dans le pilote.
3. **Publié par Decap** signifie que la modification est entrée dans la branche cible.
4. **Éligible au site** signifie que le document n’a plus `draft: true`.
5. **Visible** dépend du build et du déploiement qui servent cette révision.

Le workflow éditorial reste une option du pilote local. La configuration Decap utilisée en production ne change pas.
