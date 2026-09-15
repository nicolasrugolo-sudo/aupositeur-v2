$ErrorActionPreference = 'Stop'

npm run build

$required = @(
  '.\dist\robots.txt',
  '.\dist\sitemap.xml',
  '.\dist\index.html',
  '.\dist\citations\index.html',
  '.\dist\ecrits\index.html',
  '.\dist\musique\index.html',
  '.\dist\livres\index.html',
  '.\dist\_redirects',
  '.\dist\_headers'
)

foreach ($path in $required) {
  if (-not (Test-Path $path)) { throw "Fichier attendu absent : $path" }
  Write-Host "OK $path"
}

$homeHtml = Get-Content '.\dist\index.html' -Raw
if ($homeHtml -notmatch '<link rel="canonical"') { throw 'Canonical absente de la home' }
if ($homeHtml -notmatch 'application/ld\+json') { throw 'JSON-LD absent de la home' }
if ($homeHtml -notmatch 'og:image') { throw 'Open Graph image absente de la home' }

Write-Host 'VALIDATION SEO LOCALE : OK'
