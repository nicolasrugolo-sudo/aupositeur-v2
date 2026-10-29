# AUPOSITEUR — protocole d'évaluation scientifique (phase 2)

## Périmètre et revendications

Le laboratoire en ligne `/admin/provenance/` ne détecte actuellement **aucun filigrane statistique** et ne permet **aucune attribution d'auteur**. Une anomalie Unicode est une observation technique, pas une preuve de génération IA. Un résultat négatif n'exclut aucun filigrane.

## Registre des méthodes

| Méthode | Prérequis | Conclusion autorisée |
| --- | --- | --- |
| Unicode/entités HTML | Texte brut | Caractères/entités observés |
| KGW | Configuration exacte, tokenizer, clé et schéma | Test de filigrane KGW pour cette configuration |
| Gumbel/EXP | Clé, PRF, tokenizer et fenêtre identiques | Test de rejeu pour le schéma testé |
| SynthID-Text | Détecteur compatible et paramètres connus | Uniquement selon le contrat du détecteur |
| textGrain | Spécification et vérificateur compatibles vérifiés | Indisponible avant preuve de compatibilité |
| Classification IA FR | Corpus humains/IA indépendants et calibration | Score statistique contextualisé, jamais preuve certaine |

## Plan d'essais indépendant

1. Construire des jeux **disjoints par auteur, source et sujet** ; séparer entraînement, calibration et test.
2. Stratifier les textes français : littérature, poésie, articles, essais politiques, administratif, traduction, dialogues, textes courts/longs.
3. Pour les textes IA, noter le modèle, la date, le prompt, la température, la révision humaine et les transformations.
4. Mesurer taux de faux positifs (FPR) sur textes humains, rappel (TPR) à FPR fixé (1 % et 0,1 %), précision, intervalle de confiance, couverture et abstentions.
5. Évaluer séparément les textes courts, les textes fortement édités, les copier-coller Word, les emoji, les espaces insécables, le persan et les caractères bidi.
6. Pour les filigranes ouverts, utiliser des générations positives à **clé connue** et des négatifs à clé incorrecte ; tester l'absence de signal lorsque la clé ne correspond pas.
7. Publier versions des dépendances, empreintes des corpus, paramètres, graines aléatoires, métriques brutes et scripts de reproduction.
8. Ne jamais afficher un « % IA » sans calibration hors-échantillon et intervalle d'incertitude documenté.

## Critères pour dépasser watermarks-remover

- Tests de non-régression typographique FR et multilingue.
- Rapport avant/après avec SHA-256, offsets définis, règles versionnées et journal de transformations.
- Modes `non configuré`, `abstention`, `inconclusif`, `positif` et `négatif` sans confondre leurs sens.
- Contrôle d'accès effectif pour l'administration ; `noindex` n'est pas une barrière.
- Benchmarks externes publiés ; aucun « meilleur » déclaré avant comparaison reproductible.

## Contraintes d'intégration

Dépôt `nicolasrugolo-sudo/aupositeur-v2`, Astro statique + Cloudflare Workers, branche `main`. Le moteur Python de recherche n'est pas directement exécutable dans un navigateur ou un Worker Cloudflare. Les composants exigeant des modèles lourds devront utiliser un service séparé **avec consentement explicite avant transfert de texte**, ou une inférence navigateur évaluée (WebGPU/WASM). L'analyse locale actuelle doit rester utilisable sans service tiers.
