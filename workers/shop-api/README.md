# Aupositeur Shop API

Worker Cloudflare utilisé par la boutique Aupositeur.

## Architecture

- `GELATO_API_KEY` : secret Worker, jamais exposé au navigateur.
- `SHOP_ADMIN_TOKEN` : secret d'administration utilisé uniquement pour les opérations privées.
- `SHOP_ASSETS` : bucket R2 `aupositeur-shop-assets`.
- `IMAGES` : binding Cloudflare Images pour composer les visuels commerciaux.

Le bucket reste privé. Le Worker ne publie que les objets sous `mockups/` via `/media/mockups/...`.
Les fichiers sous `print-masters/` ne sont jamais exposés publiquement.

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

Depuis la racine du projet :

```powershell
npm run shop:deploy
```

Les secrets déjà configurés dans le Worker Cloudflare doivent rester présents :

```text
GELATO_API_KEY
SHOP_ADMIN_TOKEN
```

## Endpoints utiles

- `GET /` — état du Worker et des bindings.
- `GET /gelato/template/:id` — lecture publique et filtrée des variantes d’un template.
- `POST /orders/prepare` — dry-run uniquement, aucune commande créée.
- `POST /admin/print-files/upload` — upload privé d’un maître HD et génération du mockup.
- `POST /admin/mockup-templates/upload` — installation/remplacement du gabarit 30 × 40.
- `GET /admin/mockup-templates/status` — vérification du gabarit installé.
- `GET /media/mockups/...` — diffusion publique cache longue des visuels commerciaux générés.

## Sécurité

Le navigateur client ne reçoit jamais la clé Gelato ni le fichier maître HD. Les endpoints `/admin/*` exigent `X-Aupositeur-Admin`. Les futures commandes payées devront être déclenchées côté serveur après vérification du webhook Stripe, jamais depuis le navigateur.
