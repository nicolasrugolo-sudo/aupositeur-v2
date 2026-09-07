# Aupositeur Shop API

Worker Cloudflare utilisé par la boutique Aupositeur.

## Architecture

- `GELATO_API_KEY` : secret Worker, jamais exposé au navigateur.
- `SHOP_ADMIN_TOKEN` : secret d'administration utilisé uniquement pour les opérations privées.
- `STRIPE_SECRET_KEY` : clé secrète Stripe. Pendant la phase actuelle, le Worker exige explicitement une clé `sk_test_...`.
- `STRIPE_WEBHOOK_SECRET` : secret de signature Stripe pour vérifier cryptographiquement les webhooks.
- `PRINT_URL_SIGNING_SECRET` : secret dédié à la signature temporaire des URLs des fichiers maîtres.
- `RESEND_API_KEY` : secret optionnel pour l’e-mail transactionnel. Sans ce secret, aucun e-mail n’est envoyé.
- `ORDER_EMAIL_FROM` : expéditeur transactionnel vérifié chez le fournisseur e-mail. Sans cette valeur, aucun e-mail n’est envoyé.
- Adresse officielle de réponse/contact : `aupositeur@gmail.com`.
- `SHOP_ASSETS` : bucket R2 `aupositeur-shop-assets`.
- `IMAGES` : binding Cloudflare Images pour composer les visuels commerciaux.
- `FULFILLMENT_LOCKS` : Durable Object assurant l’idempotence atomique du traitement d’une session Stripe.

Le bucket reste privé. Les fichiers sous `print-masters/` ne sont jamais exposés publiquement. Lorsqu’un fichier d’impression doit être transmis au prestataire de fabrication, le Worker produit une URL HMAC temporaire et à usage technique.

## Stripe Checkout — phase de test

Le Checkout est volontairement limité au mode test :

- le Worker refuse une clé Stripe qui ne commence pas par `sk_test_` ;
- les prix sont déterminés côté serveur et ne sont jamais acceptés depuis le navigateur ;
- les variantes sont vérifiées contre le catalogue du Worker ;
- le panier envoyé au Worker ne contient que `productSlug`, `sku` et `quantity` ;
- les quantités sont limitées côté serveur à 5 par ligne, 10 lignes distinctes et 20 unités au total ;
- la devise est recalculée depuis le catalogue ;
- la livraison est actuellement limitée à BE / FR / LU ;
- les CGV doivent être acceptées avant la création du Checkout ;
- l’acceptation est enregistrée dans les métadonnées Stripe avec sa version et son horodatage ;
- aucune clé LIVE n’est acceptée dans cette branche.

Le panier du navigateur reste une commodité d’interface. Il ne constitue jamais une source de confiance pour un prix, un produit ou une variante.

## Après paiement test

Le webhook Stripe vérifie :

1. la signature Stripe et sa fenêtre temporelle ;
2. le type d’événement ;
3. le mode Aupositeur `test` ;
4. l’état `paid` ;
5. la référence de commande ;
6. le panier reconstruit depuis les métadonnées ;
7. la devise et le total par comparaison avec le catalogue serveur ;
8. l’adresse de livraison et le pays autorisé ;
9. la disponibilité des fichiers maîtres nécessaires.

Lorsque ces contrôles réussissent :

- un brouillon Gelato peut être préparé côté serveur ;
- le Durable Object `FULFILLMENT_LOCKS` empêche deux traitements concurrents de lancer deux brouillons pour la même session ;
- la recherche Gelato par `orderReferenceId` ajoute une deuxième protection contre les doublons ;
- aucun ordre de production final n’est lancé par la page Merci ;
- le panier local n’est vidé qu’après confirmation serveur du paiement.

## E-mail transactionnel

Le moteur de rendu d’e-mail de confirmation est présent et testé. Il reprend la référence, les lignes de commande, le total, l’adresse de livraison et les liens contractuels sans exposer les identifiants techniques internes.

L’envoi est désactivé par défaut. Il devient actif seulement lorsque les deux variables suivantes sont configurées dans le Worker :

```text
RESEND_API_KEY
ORDER_EMAIL_FROM
```

L’adresse de réponse est fixée à :

```text
aupositeur@gmail.com
```

L’envoi utilise une clé d’idempotence construite à partir de la référence Aupositeur afin qu’un retry du webhook ne duplique pas la confirmation.

Commandes de configuration disponibles depuis la racine :

```powershell
npm run shop:secret:email
npm run shop:secret:email-from
```

Exemple d’expéditeur à utiliser seulement après vérification du domaine chez le fournisseur :

```text
Aupositeur <commandes@aupositeur.be>
```

## Workflow produit cadre 30 × 40 cm

1. Créer le template dans Gelato.
2. Coller le Template ID dans Decap.
3. Envoyer le fichier maître HD dans le champ `Fichier d’impression HD`.
4. Le Worker stocke le maître dans R2.
5. Si le gabarit `framed-30x40-v1` est installé, le Worker compose automatiquement le visuel Aupositeur 2 salons + 2 chambres à partir du vrai fichier maître.
6. La fiche Astro dérive l’URL publique du mockup et l’affiche automatiquement.
7. Les variantes Gelato sont résolues depuis le Template ID au chargement de la fiche produit.

## Gabarit Aupositeur 30 × 40

Clé R2 attendue :

`mockup-templates/framed-30x40-v1.png`

Canvas : `1536 × 1024 px`.

Le gabarit contient quatre scènes frontales :

- salon / cadre blanc ;
- salon / bois naturel ;
- chambre / bois foncé ;
- chambre / cadre noir.

Le Worker incruste le maître dans quatre ouvertures prédéfinies. Le fichier d’impression n’est pas réinterprété : seul le décor est le gabarit.

## Déploiement

Le Worker est relié directement au dépôt GitHub `nicolasrugolo-sudo/aupositeur-v2`.

Configuration Cloudflare Builds :

```text
Production branch: boutique-v4
Root directory: workers/shop-api
Build command: (vide)
Deploy command: npx wrangler deploy
Preview builds: désactivés
```

Chaque nouveau commit sur `boutique-v4` déclenche donc le déploiement du Worker depuis GitHub. Le déploiement manuel reste possible depuis la racine du projet avec :

```powershell
npm run shop:deploy
```

Secrets attendus avant un test transactionnel complet :

```text
GELATO_API_KEY
SHOP_ADMIN_TOKEN
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
PRINT_URL_SIGNING_SECRET
```

Secrets supplémentaires seulement pour activer l’e-mail :

```text
RESEND_API_KEY
ORDER_EMAIL_FROM
```

## Endpoints utiles

- `GET /__build` — état et marqueur du Worker transactionnel.
- `GET /gelato/template/:id` — lecture publique et filtrée des variantes d’un template.
- `POST /checkout/session` — crée une session Stripe Checkout de test après validation serveur du panier et acceptation des CGV.
- `GET /checkout/status` — vérifie côté serveur une session de Checkout test pour la page de confirmation.
- `POST /stripe/webhook` — webhook Stripe signé ; prépare le fulfillment test de façon idempotente.
- `GET /print-file?...` — accès temporaire signé à un maître R2 configuré.
- `GET /admin/print-files/list` — inventaire privé des fichiers maîtres.
- `POST /admin/print-files/signed-url` — URL temporaire privée pour un maître configuré.
- `POST /admin/gelato/draft-from-session` — préparation administrative d’un brouillon depuis une session Stripe payée de test.
- `GET /admin/fulfillment/readiness` — contrôle privé de disponibilité des masters.
- `POST /admin/gelato/market-audit` — audit privé de disponibilité Gelato par marché.

## Sécurité

Le navigateur client ne reçoit jamais la clé Gelato, la clé Stripe secrète, les secrets d’administration, la clé e-mail ni le fichier maître HD.

Les endpoints `/admin/*` exigent `X-Aupositeur-Admin`. Les fichiers maîtres sont protégés par des URLs HMAC à durée de vie limitée. Le Worker recalcule les prix, refuse les pays hors marché, vérifie les webhooks Stripe et limite les données renvoyées dans les réponses publiques.

La boutique dispose en plus de tests Node dédiés au panier serveur et aux e-mails, d’un garde d’encodage UTF-8 et d’un workflow GitHub Actions qui exécute tests, garde d’encodage et build Astro sur chaque push de `boutique-v4`.

## Bloqueurs avant ouverture réelle

Ces éléments ne doivent pas être devinés et nécessitent une décision ou une action humaine avant l’ouverture :

- identité légale du vendeur ;
- adresse géographique légale ;
- numéro BCE et statut TVA lorsqu’ils sont applicables ;
- adresse physique de retour ;
- choix définitif et vérification du délai de livraison à annoncer ;
- validation de l’identifiant Google Analytics à conserver ;
- configuration et vérification d’un domaine d’envoi transactionnel si l’e-mail automatique est activé ;
- secrets LIVE uniquement lors d’un futur basculement explicitement décidé.
