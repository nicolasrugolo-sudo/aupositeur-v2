# Aupositeur Shop API

Worker Cloudflare utilisé par la boutique Aupositeur.

## Architecture

- `GELATO_API_KEY` : secret Worker, jamais exposé au navigateur.
- `SHOP_ADMIN_TOKEN` : secret d'administration utilisé uniquement pour les opérations privées.
- `STRIPE_SECRET_KEY` : clé secrète Stripe. Pendant la phase actuelle, le Worker exige explicitement une clé `sk_test_...`.
- `SHOP_ASSETS` : bucket R2 `aupositeur-shop-assets`.
- `IMAGES` : binding Cloudflare Images pour composer les visuels commerciaux.

Le bucket reste privé. Le Worker ne publie que les objets sous `mockups/` via `/media/mockups/...`.
Les fichiers sous `print-masters/` ne sont jamais exposés publiquement.

## Stripe Checkout — phase de test

Le point d'entrée `entry.js` intercepte `POST /checkout/session` puis délègue tous les autres endpoints au Worker historique `index.js`.

Le Checkout est volontairement limité au mode test :

- le Worker refuse une clé Stripe qui ne commence pas par `sk_test_` ;
- les prix sont déterminés côté serveur et ne sont jamais acceptés depuis le navigateur ;
- les variantes sont vérifiées contre la liste autorisée du Worker ;
- les métadonnées Stripe contiennent la référence Aupositeur, le SKU et les références Gelato utiles au futur webhook ;
- aucune commande Gelato n'est créée après le paiement à ce stade.

Pour tester depuis une fiche produit déployée, ajouter `?shopTest=1` à son URL. Le bouton d'achat public reste désactivé sans ce paramètre.

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

Les secrets configurés dans le Worker Cloudflare doivent rester présents :

```text
GELATO_API_KEY
SHOP_ADMIN_TOKEN
STRIPE_SECRET_KEY
```

Le futur webhook ajoutera séparément `STRIPE_WEBHOOK_SECRET`. Ne pas le créer avant l'enregistrement de l'endpoint webhook dans Stripe.

## Endpoints utiles

- `GET /` — état du Worker et des bindings.
- `GET /gelato/template/:id` — lecture publique et filtrée des variantes d’un template.
- `POST /checkout/session` — crée une session Stripe Checkout de test après validation serveur du produit et du SKU.
- `POST /orders/prepare` — dry-run Gelato uniquement, aucune commande créée.
- `POST /admin/print-files/upload` — upload privé d’un maître HD et génération du mockup.
- `POST /admin/mockup-templates/upload` — installation/remplacement du gabarit 30 × 40.
- `GET /admin/mockup-templates/status` — vérification du gabarit installé.
- `GET /media/mockups/...` — diffusion publique cache longue des visuels commerciaux générés.

## Sécurité

Le navigateur client ne reçoit jamais la clé Gelato, la clé Stripe secrète ni le fichier maître HD. Les endpoints `/admin/*` exigent `X-Aupositeur-Admin`.

La création de session Stripe ne fait confiance ni au prix ni aux références Gelato envoyées par le navigateur : ces données sont résolues côté Worker. Les futures commandes Gelato payées devront être déclenchées uniquement côté serveur après vérification cryptographique du webhook Stripe, jamais depuis le navigateur ni depuis la page de retour du Checkout.
