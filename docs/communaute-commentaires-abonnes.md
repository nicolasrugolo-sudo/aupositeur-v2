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

## Code présent sur la branche de développement
- `workers/community-api/index.js` : API D1, modération, double opt-in, administration sous Cloudflare Access, campagnes et tâche planifiée d'envoi.
- `src/components/CommunityComments.astro` : commentaires sur les quatre types de pages individuelles.
- `src/components/CommunitySubscribe.astro` : abonnement depuis l'accueil.
- `src/pages/communaute/` : confirmation et désinscription.
- `public/admin/communaute/` : interface d'administration (modération, abonnés, brouillons et campagnes).
- `src/pages/studio-content.json.ts` : catalogue des publications pour composer une annonce.

## Mise en service (NON exécutée)
1. Dans Cloudflare, créer D1 `aupositeur-community` et reporter son ID dans `workers/community-api/wrangler.jsonc`.
2. Appliquer `db/community.sql` avec Wrangler, après sauvegarde et contrôle des migrations.
3. Configurer Cloudflare Access sur **toutes** les routes `/api/admin/*` du Worker, limiter aux comptes administrateurs, renseigner `ACCESS_TEAM_DOMAIN` (URL complète HTTPS de l'équipe Access) et `ACCESS_AUD` (audience de l'application). Tester l'authentification avec et sans session.
4. Vérifier le domaine expéditeur Brevo, SPF/DKIM/DMARC, puis configurer les secrets `BREVO_API_KEY`, `SENDER_EMAIL`, `SENDER_NAME` (et `TURNSTILE_SECRET`) via Cloudflare.
5. Créer un widget Turnstile autorisé pour le domaine public. Définir les variables de build Astro `PUBLIC_COMMUNITY_API_URL` et `PUBLIC_TURNSTILE_SITE_KEY` sur Cloudflare Pages.
6. Mettre l'URL API dans `public/admin/community-config.js`, ou injecter la configuration dans le déploiement (ne jamais y placer de secret).
7. Déployer le Worker **après** la validation du schéma et des politiques d'accès. Tester sur préproduction puis déployer les pages.
8. Mettre à jour la politique de confidentialité, la durée de conservation, les mentions légales et le traitement des données par Brevo.
9. Vérifier le processus de désinscription et les rebonds avant tout envoi réel.

## Limites et travaux encore nécessaires
- La gestion des préférences thématiques, l'export des données et la désactivation des commentaires par publication restent à ajouter.
- La file d'envoi traite au plus 15 destinataires toutes les 5 minutes. Les échecs sont consignés sans relance automatique pour éviter les doublons incertains. Un mécanisme de réconciliation avec Brevo est souhaitable.
- Les campagnes sont créées manuellement depuis l'administration en choisissant une publication existante ; aucun envoi automatique n'est déclenché à la publication.
- La protection Cloudflare Access doit être configurée avant d'utiliser les routes administrateur.
- Les tests d'intégration, de charge, de consentement et de sécurité en environnement Cloudflare ne sont pas encore effectués.
