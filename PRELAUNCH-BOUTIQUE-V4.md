# AUPOSITEUR — Boutique v4 — Pré-ouverture

État de travail de la branche `boutique-v4`. Ce document est un garde-fou : aucun point marqué **BLOQUANT** ne doit être contourné par une mise en production précipitée.

## Technique validé / automatisé

- [x] Panier multi-produits avec validation stricte du stockage local.
- [x] Limites panier alignées frontend/serveur : 5 unités par ligne, 10 lignes, 20 articles au total.
- [x] Catalogue, prix, devise et SKU recalculés côté serveur.
- [x] Checkout limité à Stripe TEST (`sk_test_`).
- [x] Pays de livraison limités côté Stripe et Worker à BE / FR / LU.
- [x] Webhook Stripe signé et limité aux événements utiles.
- [x] Brouillon Gelato uniquement ; aucune commande de production créée automatiquement.
- [x] Idempotence fulfillment via Durable Object lorsqu'il est lié.
- [x] Fichiers maîtres privés ; URLs d'impression signées et temporaires.
- [x] Panier vidé uniquement après vérification fiable du paiement.
- [x] Pages panier / merci non indexables.
- [x] Contrôles GitHub Actions : tests boutique, garde UTF-8, build Astro.
- [x] Envoi transactionnel Resend préparé côté Worker.
- [x] `RESEND_API_KEY` configuré comme secret Cloudflare.
- [x] Expéditeur configuré : `Aupositeur <commandes@aupositeur.be>`.
- [x] Reply-To configuré : `aupositeur@gmail.com`.
- [x] Domaine `aupositeur.be` vérifié chez Resend (DKIM + sending records).
- [x] Confirmation e-mail protégée par clé d'idempotence.

## Identité et pages légales

- [x] Vendeur : Nicolas RUGOLO.
- [x] Adresse géographique : Rue de Baudour 83, 7050 Jurbise, Belgique.
- [x] Adresse de retour identique.
- [x] Contact officiel : `aupositeur@gmail.com`.
- [x] CGV préparées.
- [x] Politique de confidentialité préparée et Resend identifié.
- [x] Page de rétractation avec adresse de retour et formulaire type.
- [x] Mentions légales créées et liées dans le footer.

## BLOQUANT — formalités belges avant ouverture commerciale

- [ ] Inscription de l'activité indépendante à la Banque-Carrefour des Entreprises (BCE) et obtention du numéro d'entreprise lorsque requis.
- [ ] Déterminer et activer le régime TVA applicable avant les premières ventes. Même le régime de franchise des petites entreprises reste un régime d'assujettissement et implique une identification TVA.
- [ ] Reporter le numéro BCE / TVA et les mentions fiscales exactes dans le site une fois attribués.
- [ ] Valider le traitement du prix de 69 € au regard du régime TVA effectivement retenu.

## BLOQUANT — parcours client à terminer / tester

- [ ] Effectuer un paiement Stripe TEST complet après déploiement du dernier HEAD et vérifier : webhook signé, brouillon Gelato unique, e-mail Resend reçu une seule fois, panier vidé, page Merci correcte.
- [ ] Tester paiement refusé / abandonné : pas d'e-mail, pas de brouillon Gelato, panier conservé.
- [ ] Tester replay du webhook : aucune duplication Gelato et aucun double e-mail.
- [ ] Tester les 4 cadres et les 5 œuvres en readiness réelle.
- [ ] Vérifier le rendu mobile et desktop des pages légales après les derniers changements.

## BLOQUANT — rétractation en ligne

Le formulaire visuel existe mais l'envoi en ligne est volontairement désactivé tant qu'un endpoint public sûr avec protection anti-abus et accusé de réception électronique n'est pas en place.

- [ ] Choisir et configurer une protection anti-abus adaptée (par exemple Turnstile) avant d'exposer l'endpoint.
- [ ] Envoyer la demande de rétractation côté serveur à Aupositeur.
- [ ] Envoyer immédiatement un accusé de réception électronique au consommateur.
- [ ] Ne jamais déclencher automatiquement un remboursement sur la seule base de ce formulaire.

## Avant LIVE

- [ ] Ne pas remplacer `sk_test_` par une clé LIVE tant que tous les points bloquants ci-dessus ne sont pas clos.
- [ ] Ne pas activer une commande Gelato de production avant un test bout-en-bout documenté.
- [ ] Vérifier les délais de production/livraison réels avant de publier un délai chiffré.
- [ ] Prévoir l'affichage du suivi transporteur uniquement quand une vraie donnée de tracking existe.
- [ ] Trancher l'identifiant Google Analytics à partir de la propriété GA réellement utilisée ; ne pas remplacer l'ID actuel sans preuve.
- [ ] Vérifier les méthodes de paiement réellement proposées par Stripe sur BE / FR / LU.
- [ ] Faire une dernière revue juridique/comptable avant ouverture, en particulier pour BCE, TVA, facturation et ventes transfrontalières.

## Règles permanentes

- Ne jamais committer de secret.
- Ne jamais exposer les fichiers maîtres d'impression.
- Ne jamais faire confiance au prix ou aux identifiants de fulfillment provenant du navigateur.
- Ne jamais créer un fulfillment à partir de la page Merci.
- Conserver le projet en UTF-8 et garder `npm run check:encoding` / `prebuild` actifs.
- Préserver le design validé ; les renforcements techniques ne sont pas une invitation au redesign.
