# AUPOSITEUR Social Studio — architecture privée (phase 1)

## Règle impérative
Le calendrier et ses données ne sont **jamais** exposés par des pages publiques, des fichiers JSON sous `public/`, des endpoints Astro statiques, ni par le dépôt de contenus publié. `noindex` et l'absence de lien public ne sont **pas** des mécanismes d'authentification.

## État vérifié du dépôt (18 novembre 2026)
- `public/admin/index.html` héberge le Studio Decap : page statique, à ne pas confondre avec une protection d'accès.
- `workers/site-gateway/index.js` relaie `/api/admin/*` vers le Worker Communauté.
- `functions/api/admin/[[path]].js` dispose d'un autre relais pour Cloudflare Pages.
- Le Worker Communauté vérifie les jetons Access pour ses propres opérations.
- Aucune autorisation d'accès aux futures routes sociales n'est démontrée par ce seul constat.

## Architecture retenue
1. Une rubrique « Réseaux sociaux » dans l'administration, affichée seulement après vérification d'une session autorisée. L'interface ne doit recevoir aucune donnée privée avant cette vérification.
2. Des endpoints `/api/admin/social/*` avec **validation serveur** du jeton Cloudflare Access (signature, audience, issuer, expiration) et vérification de l'identité autorisée. Ne pas supposer que la présence d'un cookie ou d'un en-tête suffit.
3. D1 pour les brouillons sociaux, les horaires, les tentatives d'envoi, les identifiants distants et l'historique. Les secrets OAuth restent exclusivement dans les secrets Worker, jamais en D1 en clair ni dans GitHub.
4. Un Worker planifié par Cron Trigger sélectionne les publications échues, verrouille atomiquement chaque envoi, applique une politique de reprise et conserve un état `unknown` lorsque l'API distante ne confirme pas l'envoi. **Ne jamais réessayer aveuglément** un envoi incertain.
5. Aucun réseau n'est activé avant la validation de ses autorisations officielles et un test d'envoi explicitement autorisé.

## Modèle de données proposé
- `social_posts`: id, source_type, source_id, caption, media_reference, created_at, updated_at.
- `social_targets`: id, post_id, platform, account_reference, scheduled_at_utc, timezone, status, approved_at, published_at, remote_post_id.
- `social_attempts`: id, target_id, attempt_key, started_at, finished_at, result, sanitized_error.
- `social_accounts`: id, platform, account_reference, display_name, connection_status (sans jeton OAuth en clair).

États : `draft`, `approved`, `scheduled`, `sending`, `published`, `failed`, `unknown`, `cancelled`.

## Interface inspirée de Meta Business Suite
- Calendrier mois/semaine/jour, avec fuseau `Europe/Brussels`.
- Créateur de publication et aperçu par réseau.
- Bibliothèque : brouillons, programmées, publiées, échecs.
- Détection de doublons par œuvre, réseau, compte et période, y compris publications saisies manuellement.
- Aucune publication sans approbation préalable de l'auteur.
- Sur mobile : navigation tactile, filtres accessibles, lecture claire des statuts.

## Ordre de réalisation sans exposition accidentelle
1. Définir et tester le contrôle d'accès aux routes sociales, y compris refus 401/403 pour requêtes non autorisées.
2. Créer le schéma D1 et les API privées, sans activer de Cron ni d'envoi.
3. Intégrer le calendrier et le compositeur à l'interface authentifiée.
4. Connecter une plateforme à la fois, après autorisation et validation de l'utilisateur.
5. Activer les envois planifiés avec journalisation, reprise prudente et contrôle anti-doublons.

## Critères d'acceptation
- Une requête anonyme ne peut ni lire le calendrier, ni découvrir ses publications, ni écrire ou programmer un envoi.
- Aucun secret dans HTML, JavaScript client, GitHub ou logs.
- Aucun envoi non approuvé, ni doublon causé par un redémarrage.
- Les fuseaux horaires et changements heure été/hiver sont testés.
- Les fonctionnalités existantes (Communauté, Decap, SEO, contenus, Cloudflare) restent intactes.
