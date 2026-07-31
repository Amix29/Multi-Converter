# Multi-Converter Landing

Landing page Next.js exportable en site statique pour GitHub Pages.

## Emplacement

Le site fait partie du dépôt Multi-Converter sous `site/`. Il conserve ses
propres dépendances verrouillées, mais pas de dépôt Git imbriqué.

Depuis la racine de Multi-Converter :

```bash
npm --prefix site install
npm run site:dev
npm run site:check
```

## Développement

```bash
npm install
npm run dev
```

## Build statique

```bash
npm run build
```

Le build génère le dossier `out/`, prêt à être publié sur GitHub Pages.

Pour l'URL finale `https://amix29.github.io/Multi-Converter/`, forcez le chemin de base en build local :

```bash
$env:NEXT_PUBLIC_BASE_PATH="/Multi-Converter"
npm run build
```

Pour un domaine custom ou un dépôt `utilisateur.github.io`, aucun `basePath` n'est nécessaire.
Vous pouvez alors le forcer explicitement à vide :

```bash
$env:NEXT_PUBLIC_BASE_PATH=""
npm run build
```

## SEO

Avant publication, copiez `env.example` vers `.env.local` ou définissez les variables dans GitHub Actions. L’URL finale est nécessaire pour générer des canonicals et un sitemap propres :

```bash
$env:NEXT_PUBLIC_SITE_URL="https://amix29.github.io/Multi-Converter"
$env:NEXT_PUBLIC_BASE_PATH="/Multi-Converter"
npm run build
```

Pour un domaine custom ou un dépôt `utilisateur.github.io`, laissez `NEXT_PUBLIC_BASE_PATH` vide.

Le site inclut :

- metadata Next.js
- JSON-LD `SoftwareApplication` et `FAQPage`
- `robots.txt`
- `sitemap.xml`
- `llms.txt`
- `answers.txt`, `trust.txt` et `pricing.txt` pour les réponses IA
- `_headers` pour les headers de cache sur les hébergeurs compatibles
- `.nojekyll` pour GitHub Pages

### Limites GitHub Pages pour certains audits SEO

Sur une URL de projet GitHub Pages comme `https://amix29.github.io/Multi-Converter/`, le site est servi dans un sous-chemin. Le fichier généré `robots.txt` est donc disponible à `https://amix29.github.io/Multi-Converter/robots.txt`, mais certains outils SEO vérifient uniquement `https://amix29.github.io/robots.txt`, qui appartient au domaine racine `amix29.github.io`.

Pour supprimer complètement les alertes `robots.txt`, redirection `www`/non-`www` et headers `Expires`/`Cache-Control`, utilisez un domaine custom ou un hébergeur qui permet la configuration HTTP :

- définissez `NEXT_PUBLIC_SITE_URL` sur le domaine final, par exemple `https://multi-converter.example`;
- définissez `NEXT_PUBLIC_BASE_PATH` à vide ;
- configurez une redirection 301 unique, soit `www` vers non-`www`, soit l'inverse ;
- activez des headers de cache longs pour les images, SVG, CSS, JS et assets `/_next/static/*`.

Le fichier `public/_headers` est inclus pour Cloudflare Pages et Netlify. GitHub Pages l'ignore.

## Publication produit

Avant de publier officiellement, renseignez aussi les variables de confiance produit :

```bash
$env:NEXT_PUBLIC_PRODUCT_VERSION="v1.0.0"
$env:NEXT_PUBLIC_SOURCE_URL="https://github.com/Amix29/Multi-Converter"
$env:NEXT_PUBLIC_RELEASES_URL="https://github.com/Amix29/Multi-Converter/releases/latest"
$env:NEXT_PUBLIC_LATEST_RELEASE_API_URL="https://api.github.com/repos/Amix29/Multi-Converter/releases/latest"
$env:NEXT_PUBLIC_ISSUES_URL="https://github.com/Amix29/Multi-Converter/issues"
```

Le bouton Windows lit dynamiquement la dernière release GitHub et choisit le premier asset `.exe` disponible.

Le site concentre les informations produit sur la page d’accueil et ses sections d’ancrage.

## Plateformes publiées

La version publique V1.0.6 est disponible pour Windows x64, macOS universel
(Apple Silicon et Intel) et Linux x64. La page de téléchargement expose :

- l’installateur Windows détecté dans la dernière release GitHub ;
- l’alias stable `Multi-Converter_macos-universal.dmg` ;
- l’alias stable `Multi-Converter_linux-x64.AppImage`.

Le build macOS V1.0.6 n’est ni signé par Apple ni notarialisé. La page de
téléchargement conserve donc le parcours utilisateur
`System Settings > Privacy & Security > Open Anyway`, puis `Open`.

## Dernière validation locale

Le 31 juillet 2026, `npm run site:check` a généré 114 pages statiques et validé
120 routes, 111 pages HTML et 110 pages HTML SEO. L’audit de production
`npm --prefix site audit --omit=dev` a signalé zéro vulnérabilité connue.

Un profil Playwright isolé a aussi vérifié l’accueil et la page de
téléchargement sur desktop et à 390 × 844 px, le filtre de formats, l’aperçu
d’image et la présence des liens Windows, macOS et Linux. Aucun navigateur ou
profil utilisateur principal n’a été utilisé.

## Déploiement GitHub Pages

Le workflow [`../.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml)
construit le site depuis `site/` avec l'URL finale :

```text
https://amix29.github.io/Multi-Converter
```

Il exécute `npm run check`, publie le dossier `out/`, puis déploie sur GitHub Pages.

Après le premier déploiement :

- activez GitHub Pages avec la source `GitHub Actions` dans les réglages du dépôt ;
- ouvrez Google Search Console et ajoutez la propriété `https://amix29.github.io/Multi-Converter` ;
- soumettez `https://amix29.github.io/Multi-Converter/sitemap.xml` ;
- faites la même soumission dans Bing Webmaster Tools ;
- demandez l'indexation des pages clés : accueil, download, formats, conversions, guides, documentation et alternatives.
