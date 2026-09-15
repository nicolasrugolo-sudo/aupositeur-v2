# Validation SEO

Avant fusion :

```powershell
.\docs\local-seo-validation.ps1
```

Après déploiement :

```powershell
.\docs\post-deploy-smoke-test.ps1
```

Le premier script construit le site et vérifie la présence des principaux artefacts SEO. Le second vérifie les réponses HTTP de production, les redirections, le robots.txt et le sitemap.
