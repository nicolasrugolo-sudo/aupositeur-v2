# Prévisualisation du Studio · Réflexions

Depuis le tableau de bord de `/admin/`, **Nouvelle réflexion** ouvre Decap et **Gérer les réflexions** ouvre la liste. La recherche couvre le titre et le résumé. Les filtres distinguent les brouillons, les articles publiés et les mises en avant. Le bloc **À la une de l’accueil** affiche la réflexion retenue par le dernier build et propose un accès direct à sa fiche. Le bouton **Choisir une réflexion** filtre les articles publiés et place le focus dans la recherche.

L’éditeur affiche le titre et le texte avant les métadonnées. Le champ Article utilise uniquement le mode visuel de Decap. L’aperçu reprend les styles publics de lecture et le rendu du champ Article par Decap. Sur mobile, **Aperçu** et **Écrire** affichent un panneau à la fois. La taille du panneau influence le rendu responsive. Les puces affichent actuellement les identifiants des catégories. La navigation publique, le partage et les commentaires restent hors de cet aperçu.

## Enregistrer et publier

- **Enregistrer un brouillon.** Laisser `Brouillon` activé, puis choisir **Publish → Publish now**. Decap enregistre le fichier et Astro l’exclut des pages publiques.
- **Publier.** Désactiver `Brouillon` et choisir la même commande. Sur le site déployé, la fiche devient visible après la réussite du build.
- **Changer la une.** Activer **Mise en avant sur l’accueil** sur la réflexion choisie puis valider. Le workflow existant normalise le champ `featured` après le commit. La vue de Studio lit le manifeste Astro. Cliquer sur **Actualiser** après le build si la liste est encore ancienne.
- **Retirer la une.** Ouvrir la réflexion depuis **Modifier ou retirer**, désactiver sa mise en avant puis valider. Après le build, le bloc d’accueil disparaît si aucune réflexion publiée n’est à la une.

## Relancer la prévisualisation localement

Employer une copie jetable du commit de prévisualisation. Le backend normal reste configuré pour GitHub `main`. Pour la recette, remplacer uniquement dans la copie la section `backend:` du fichier `public/admin/config.yml` par le bloc suivant, en laissant `media_folder` et les collections en dessous.

```yaml
backend:
  name: test-repo

local_backend:
  url: http://127.0.0.1:8081/api/v1
  allowed_hosts: [127.0.0.1]
```

Utiliser des réflexions fictives dans la copie puis lancer les deux commandes depuis cette copie, chacune dans un terminal.

```sh
npx --yes decap-server@3.11.6
npm run dev -- --host 127.0.0.1
```

Ouvrir `http://127.0.0.1:4321/admin/`. Le bouton Login de Decap crée une session locale. Les écritures visent les fichiers de la copie. Le proxy local n’exécute pas GitHub Actions. Pour vérifier le remplacement réel de la une dans cette copie, exécuter le script de normalisation avec les seuls fichiers fictifs comme entrées.

## Limites observées

- Avec la configuration actuelle, Decap fournit une seule commande native pour écrire le fichier. L’état public dépend de `draft`. Deux commandes natives « Enregistrer le brouillon » et « Publier », ou une vraie relecture, demanderaient d’évaluer le mode `editorial_workflow` sur une branche et un dépôt de test. Modifier les libellés générés par Decap via son DOM serait fragile. Aucun service supplémentaire n’est nécessaire pour cette prévisualisation.
- L’unicité de la une en production est asynchrone. La première publication et la normalisation GitHub peuvent produire des builds successifs.
- La recette locale ne vérifie pas OAuth distant, les droits GitHub, ni le délai Cloudflare. Le navigateur de recette a bloqué les requêtes externes aux deux serveurs locaux.

## Recette exécutée

Chromium à 1 440 et 390 px, Decap 3.17.3, proxy Decap 3.11.6 sur une copie jetable.

Sur ordinateur : ouverture depuis le tableau de bord, filtre Brouillons, recherche, création avec liste à puces, aperçu stylé, sauvegarde locale, exclusion du brouillon de la page et du sitemap, reprise du fichier, publication locale, promotion via le normaliseur existant, puis retrait. La fiche publique locale reste disponible après le retrait de la une. Sur mobile : tableau de bord, liste, ouverture d’une fiche et bascule entre aperçu et rédaction.
