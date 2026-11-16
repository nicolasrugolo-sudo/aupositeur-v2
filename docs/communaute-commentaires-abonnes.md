# Communauté AUPOSITEUR — architecture et étapes de livraison

Branche de développement isolée : aucun déploiement ni envoi d'e-mail n'est activé.

## Périmètre
- Commentaires sous les pages individuelles des écrits, réflexions, musiques et citations ; statut initial `pending`, visibilité publique exclusivement pour `approved`.
- Administration : file de modération, filtres, suppression, réponse de l'auteur, désactivation par publication.
- Abonnements indépendants des commentaires ; confirmation par lien à usage unique (double opt-in), préférences et désinscription.
- Campagnes liées à une nouvelle publication (y compris livres) : brouillon, prévisualisation, test, validation manuelle et envoi asynchrone.
- Journal d'envoi et déduplication par couple campagne/abonné.

## Architecture existante vérifiée
Astro 5, pages statiques, Decap CMS GitHub sur `main`, interface personnalisée `public/admin/index.html`, Workers Cloudflare distincts. Les commentaires et abonnés nécessitent un stockage dynamique hors GitHub.

## À développer avant mise en service
1. Worker API Cloudflare et liaison D1 : endpoints publics de lecture/écriture limités, validation stricte, anti-spam Turnstile et limitation de débit. Ne jamais exposer les secrets ni l'administration par simple clé dans le navigateur.
2. Authentification admin côté serveur avec vérification effective de la session GitHub autorisée, protection CSRF et contrôle des droits pour modérer, lire les abonnés et envoyer.
3. Formulaires accessibles sur les quatre pages de détail, avec messages d'état, traitement sécurisé des contenus texte, aucun HTML utilisateur injecté.
4. Tableau de bord personnalisé : commentaires, abonnés, campagnes, états et erreurs.
5. Service d'e-mail transactionnel/marketing configuré (p. ex. Brevo), domaine SPF/DKIM/DMARC, webhooks de rebond et désinscription, limites d'envoi.
6. Liaison aux formulaires Decap : `Prévenir mes abonnés` doit créer un **brouillon** uniquement après publication effective (pas au simple enregistrement ni sur brouillon). Une action humaine distincte confirme l'envoi.
7. Tests : autorisations, XSS, spam, tokens expirés, consentement, doublons, désinscription pendant une campagne, réessais et absence de fuite d'adresses.
8. RGPD : politique de confidentialité, preuve du consentement, export/suppression, durée de conservation documentée et contrat sous-traitant.

## Décisions de sécurité
- Pas d'inscription automatique des commentateurs.
- Pas d'envoi automatique à la publication ; opt-in explicite et confirmation de campagne.
- Ne jamais conserver les jetons d'abonnement en clair.
- Ne jamais diffuser à un abonné non confirmé ou désinscrit.
- Les réponses de l'auteur ne peuvent être créées que par une session admin vérifiée.
- La liste des destinataires ne doit jamais être exposée dans le code public ni dans les en-têtes des messages.

## Base
Schéma initial : `db/community.sql`. La migration n'a pas été exécutée.
