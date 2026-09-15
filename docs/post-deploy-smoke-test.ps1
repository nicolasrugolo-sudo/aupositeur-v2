$ErrorActionPreference = 'Stop'

$urls = @(
  'https://www.aupositeur.be/',
  'https://www.aupositeur.be/robots.txt',
  'https://www.aupositeur.be/sitemap.xml',
  'https://www.aupositeur.be/musiques/',
  'https://www.aupositeur.be/boutique/',
  'https://www.aupositeur.be/panier/'
)

foreach ($url in $urls) {
  Write-Host "`n=== $url ==="
  curl.exe -I $url
}

Write-Host "`n=== robots.txt ==="
curl.exe -s https://www.aupositeur.be/robots.txt

Write-Host "`n=== sitemap.xml (premières lignes) ==="
(curl.exe -s https://www.aupositeur.be/sitemap.xml) -split "`n" | Select-Object -First 15
