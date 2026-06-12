# Packaging des moteurs

Cette page est une checklist technique de conformité et de packaging pour les mainteneurs du projet. Les contributions communautaires ne sont pas censées préparer les releases, checksums, notes de version ou archives de moteurs, sauf demande explicite d'un mainteneur. Elle ne remplace pas une revue juridique.

La V1 Windows x64 assume des moteurs de base FFmpeg/ffprobe intégrés. Les exécutables actuellement validés sont les builds Gyan `8.1.1-essentials_build-www.gyan.dev`, configurés avec `--enable-gpl`. Ils doivent être documentés et redistribués comme composants tiers GPL/LGPL séparés du code AGPL-3.0-or-later de Multi-Converter.

## Entrées locales

Les vrais binaires doivent être placés manuellement dans :

```text
engine-sources/<platform>/<engineId>/
```

Structure attendue :

```text
engine-sources/windows-x64/ffmpeg/
  bin/
    ffmpeg-x86_64-pc-windows-msvc.exe
  licenses/
    LICENSE.txt
    THIRD_PARTY_NOTICES.txt
```

For the planned universal macOS DMG, stage both Darwin sidecar architectures before packaging:

```text
engine-sources/macos-universal/ffmpeg/
  bin/
    ffmpeg-aarch64-apple-darwin
    ffmpeg-x86_64-apple-darwin
    ffmpeg-universal-apple-darwin
  licenses/
    LICENSE.txt
    THIRD_PARTY_NOTICES.txt
```

The release build needs the `*-universal-apple-darwin` sidecars because Tauri's `universal-apple-darwin` target looks for those `externalBin` files. `prepare:bundled-engines` can create them with `lipo` on macOS from the Apple Silicon and Intel binaries. Keep the architecture-specific binaries staged too, so native macOS dev builds can still use the normal Tauri sidecar convention. All sidecars and non-Windows engine binaries must keep executable permissions before packaging.

`engine-sources/` est ignoré par Git. `tools/engine-packages.config.json` et ce document restent commitables.

## Sources macOS à préparer

Le packaging macOS utilise une configuration séparée : `tools/engine-packages.macos.config.json`. Elle sert de contrat pour le futur paquet `macos-universal` sans modifier le manifeste public tant que les archives ne sont pas publiées.

Sources candidates vérifiées au 12 juin 2026 :

- PDFium : `bblanchon/pdfium-binaries` publie `pdfium-mac-univ.tgz`, ainsi que `pdfium-mac-arm64.tgz` et `pdfium-mac-x64.tgz`. Le paquet Multi-Converter doit aussi inclure un wrapper `pdfium-render-universal-apple-darwin`.
- Pandoc : les releases officielles `jgm/pandoc` publient des ZIP macOS séparés `arm64` et `x86_64`. Préparez un binaire `bin/pandoc-universal-apple-darwin` avec `lipo`, ou adaptez explicitement la config si un build universel officiel est validé.
- LibreOffice : The Document Foundation publie des DMG macOS séparés Apple Silicon et Intel. Le paquet `macos-universal` doit conserver les deux app bundles sous `aarch64/` et `x86_64/`; le runtime choisit ensuite le lanceur natif.
- libvips : la documentation officielle macOS renvoie vers Homebrew, MacPorts ou Fink, et ne fournit pas de ZIP portable équivalent au build Windows. Le workflow manuel `macOS libvips Runtime` fabrique deux archives de staging depuis Homebrew sur runners natifs Apple Silicon et Intel, réécrit les liens dynamiques vers `@rpath`, puis smoke-test `vips copy`. Tant qu'un paquet portable n'est pas validé, conservez deux arbres `aarch64/` et `x86_64/` avec leurs dépendances et notices exactes. `npm run prepare:libvips-engine:macos` peut seulement copier et vérifier deux arbres portables déjà préparés; il refuse les liens dynamiques absolus non système.
- FFmpeg/ffprobe : FFmpeg fournit le code source mais pas de binaires officiels. Il faut soit produire un build macOS statique maison reproductible, soit valider juridiquement et techniquement un fournisseur tiers. `npm run prepare:ffmpeg-engine:macos` demande des archives mainteneur explicites et leurs SHA-256; il ne choisit pas un fournisseur automatiquement. Ne copiez pas simplement un binaire Homebrew dans le DMG sans ses dépendances.

PDFium, LibreOffice et Pandoc peuvent être préparés automatiquement sur un Mac avec Xcode Command Line Tools et les targets Rust Darwin installées :

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run prepare:macos-upstream-engines
```

`prepare:macos-upstream-engines` prépare seulement les moteurs upstream dont les archives macOS sont identifiées et adaptées au packaging portable actuel : PDFium, LibreOffice et Pandoc. Il ne prépare pas FFmpeg/ffprobe ni libvips.

Préparation FFmpeg/ffprobe macOS avec archives validées par le mainteneur :

```bash
export FFMPEG_MACOS_AARCH64_ARCHIVE_URL="https://<source-verifiee>/ffmpeg-arm64.zip"
export FFMPEG_MACOS_AARCH64_ARCHIVE_SHA256="<sha256>"
export FFMPEG_MACOS_X86_64_ARCHIVE_URL="https://<source-verifiee>/ffmpeg-x86_64.zip"
export FFMPEG_MACOS_X86_64_ARCHIVE_SHA256="<sha256>"
npm run prepare:ffmpeg-engine:macos
```

Les variantes locales `FFMPEG_MACOS_AARCH64_ARCHIVE` et `FFMPEG_MACOS_X86_64_ARCHIVE` peuvent remplacer les URLs pour des builds maison déjà créés. Le script extrait `ffmpeg` et `ffprobe`, vérifie les architectures avec `lipo`, crée `ffmpeg-universal-apple-darwin` et `ffprobe-universal-apple-darwin`, puis lance `-version`.

Préparation libvips macOS avec deux arbres portables déjà assemblés :

```bash
export LIBVIPS_MACOS_AARCH64_SOURCE_DIR="/path/to/libvips-arm64-runtime"
export LIBVIPS_MACOS_X86_64_SOURCE_DIR="/path/to/libvips-x86_64-runtime"
export LIBVIPS_MACOS_LICENSE_FILE="/path/to/LICENSE"
npm run prepare:libvips-engine:macos
```

Pour générer ces entrées dans GitHub Actions, lancez le workflow manuel `macOS libvips Runtime` avec un `output_release_tag`. Il produit `libvips-macos-aarch64.tar.gz` sur `macos-latest` et `libvips-macos-x86_64.tar.gz` sur `macos-15-intel`. Passez ensuite ce tag comme `libvips_release_tag` au workflow `macOS Engine Staging`.

Le script copie les deux arbres sous `engine-sources/macos-universal/libvips/`, vérifie `bin/vips` avec `lipo`, inspecte les dépendances avec `otool -L`, refuse les liens absolus non système comme `/opt/homebrew`, `/usr/local`, `/opt/local` ou `/sw`, puis lance un test image sur l'architecture native du Mac.

Structure avancée attendue :

```text
engine-sources/macos-universal/pdfium/
  bin/
    libpdfium.dylib
    pdfium-render-universal-apple-darwin
  licenses/
    LICENSE.txt
    THIRD_PARTY_NOTICES.txt

engine-sources/macos-universal/libreoffice/
  aarch64/LibreOffice.app/Contents/MacOS/soffice
  x86_64/LibreOffice.app/Contents/MacOS/soffice
  licenses/
    LICENSE.txt
    THIRD_PARTY_NOTICES.txt

engine-sources/macos-universal/pandoc/
  bin/
    pandoc-universal-apple-darwin
  licenses/
    LICENSE.txt
    THIRD_PARTY_NOTICES.txt

engine-sources/macos-universal/libvips/
  aarch64/bin/vips
  x86_64/bin/vips
  licenses/
    LICENSE.txt
    THIRD_PARTY_NOTICES.txt
```

Sur macOS, les moteurs avancés peuvent être soit réellement universels, soit embarqués en deux sous-arbres d'architecture. Dans ce deuxième cas, déclarez les deux chemins dans `binaryPaths`; le runtime préfère automatiquement le chemin natif et ignore les bibliothèques de support comme `.dylib` ou `.so` quand il cherche l'exécutable principal.

## Configuration

`tools/engine-packages.config.json` contient des valeurs de préparation :

- `downloadBaseUrl` vaut `REPLACE_WITH_RELEASE_BASE_URL` tant que les moteurs ne sont pas publiés.
- Remplacez la base via `ENGINE_RELEASE_BASE_URL` au moment du packaging publiable.
- Ajustez les `version`, `outputArchiveName`, `binaryPaths`, `licenseName` et `licenseUrl` avant publication.
- Déclarez les licences dans `licenseFiles`.
- Déclarez les notices tiers dans `noticeFiles` si elles sont requises ou fournies.

Le JSON ne contient volontairement pas de commentaires pour rester valide.

## Commandes

Validation sans vrais moteurs :

```powershell
npm run validate:engines
```

Packaging local avec URLs placeholder :

```powershell
npm run package:engines
```

Packaging avec base URL de release :

```powershell
$env:ENGINE_RELEASE_BASE_URL="https://<host>/<path>/"
npm run package:engines
```

Le script écrit les ZIP et `engines-manifest.json` dans `dist-engines/`. Ce dossier est ignoré par Git. Le manifeste généré peut être publié séparément avec les archives, par exemple via GitHub Releases ou un CDN, quand les URLs réelles existent.

Packaging macOS depuis les sources préparées :

```powershell
$env:ENGINE_RELEASE_BASE_URL="https://<host>/<path>/"
npm run package:macos-engines
```

Cette commande lit `tools/engine-packages.macos.config.json` et écrit dans `dist-engines-macos/`. Elle doit échouer tant que les vrais dossiers `engine-sources/macos-universal/*` ne sont pas complets.

Préparation et packaging local du pack base Windows :

```powershell
npm run prepare:base-engines
npm run package:base-engines
```

Cette commande prépare FFmpeg/ffprobe depuis gyan.dev et génère `dist-engines-base/` pour les mainteneurs qui doivent publier les archives de base.

Packaging macOS is not considered release-ready until the final DMG has been produced and tested on macOS. Do not modify the generated `.app` after the Tauri bundle step; change source files, config or staged engines, then rebuild.

The current embedded manifest still declares advanced engines for `windows-x64` only. Add reviewed `macos-universal` engine entries and archives before advertising PDFium, LibreOffice, Pandoc or libvips support on macOS.

`prepare:bundled-engines` prunes stale entries in `src-tauri/bundled-engines` that do not match the current platform before packaging. `validate:bundled-engines` must fail if a platform build would carry engine resources from another platform.

## Activation dans l'application

Le runtime embarque `src-tauri/engines-manifest.json` et résout les moteurs avancés depuis les ressources Tauri `engines/`. Avant un build applicatif, restaurez les sidecars et moteurs embarqués :

```powershell
npm run prepare:bundled-engines
npm run validate:bundled-engines
```

`prepare:bundled-engines` restaure FFmpeg/ffprobe dans `src-tauri/binaries` et extrait les moteurs avancés déclarés dans `src-tauri/engines-manifest.json` vers `src-tauri/bundled-engines`. Ce dossier est ignoré par Git et packagé comme ressource Tauri dans l'installateur.

Tant que les URLs valent `REPLACE_WITH_RELEASE_BASE_URL` ou que les SHA-256 valent les placeholders, la préparation des moteurs embarqués échoue.

## Découpage recommandé

- Base : FFmpeg/ffprobe et moteurs Rust intégrés.
- Avancé embarqué : PDFium, LibreOffice, Pandoc et libvips.

## Contrôles stricts

Le packaging échoue si :

- un dossier source est absent ;
- un chemin sort de la racine autorisée ;
- un binaire déclaré dans `binaryPaths` manque ;
- `licenseFiles` est vide ;
- une licence déclarée manque ;
- une notice déclarée dans `noticeFiles` manque ;
- un chemin ZIP est absolu, ambigu ou contient `..`.

Chaque ZIP contient un `engine.json` généré, les binaires déclarés, les licences et les notices configurées.

## PDFium advanced

PDFium est préparé séparément de la Base légère :

```powershell
npm run prepare:pdfium-engine
npm run package:pdfium-engine
```

`prepare:pdfium-engine` télécharge `pdfium-win-x64.tgz` depuis `bblanchon/pdfium-binaries`, compile le wrapper Rust `tools/pdfium-render-wrapper` avec le crate `pdfium-render`, puis prépare `engine-sources/windows-x64/pdfium`.

Le paquet final contient :

- `bin/pdfium.dll`
- `bin/pdfium-render-x86_64-pc-windows-msvc.exe`
- `licenses/LICENSE.txt`
- `licenses/THIRD_PARTY_NOTICES.txt`
- `licenses/pdfium-third-party/*`

CLI du wrapper :

```powershell
pdfium-render --check
pdfium-render --version
pdfium-render --page-count input.pdf
pdfium-render --render input.pdf output.png --page 1 --format png --dpi 200
pdfium-render --render-all input.pdf output-dir --format png --dpi 200
pdfium-render --render-all input.pdf output-dir --format jpg --dpi 200 --quality 90
```

Dans l'application, PDF -> PNG/JPEG produit une archive ZIP contenant une image par page. Cela garde un résultat unique même pour les PDF multi-pages.

## Pandoc advanced

Pandoc est un moteur `advanced` embarqué pour les conversions documentaires structurées : Markdown, HTML, EPUB et DOCX textuel. Il n'est pas utilisé pour produire du PDF tant qu'une chaîne PDF complète n'est pas configurée.

```powershell
npm run prepare:pandoc-engine
npm run package:pandoc-engine
```

`prepare:pandoc-engine` télécharge le ZIP Windows x86_64 de la dernière release GitHub officielle Pandoc, vérifie `bin/pandoc.exe`, ajoute la licence GPL/COPYRIGHT et prépare `engine-sources/windows-x64/pandoc`.

Structure attendue du paquet :

- `engine.json`
- `bin/pandoc.exe`
- `licenses/LICENSE.txt`
- `licenses/THIRD_PARTY_NOTICES.txt`

Le test santé convertit un mini Markdown vers HTML et vérifie que le texte attendu est présent.

## libvips advanced

libvips est un moteur `advanced` embarqué pour les conversions images avancées. Il ne remplace pas le moteur Rust image et n'active que les formats validés dans le registre : PNG, JPEG, WebP et TIFF.

```powershell
npm run prepare:libvips-engine
npm run package:libvips-engine
```

`prepare:libvips-engine` télécharge la dernière release Windows x64 officielle depuis `libvips/build-win64-mxe`, privilégie le build `vips-dev-x64-web-*.zip`, prépare `engine-sources/windows-x64/libvips`, vérifie `bin/vips.exe`, la présence de DLL, les licences/notices, puis lance un test santé réel `vips copy input.png output.jpg`.

Structure attendue du paquet :

- `engine.json`
- `bin/vips.exe`
- `bin/*.dll`
- `lib/`
- `share/`
- `licenses/LICENSE.txt`
- `licenses/THIRD_PARTY_NOTICES.txt`

Ne publiez pas HEIC/HEIF/AVIF/RAW/PSD/JP2 tant que le build packagé n'a pas prouvé ces loaders/savers via `vips list classes` et des tests de conversion dédiés.

## Checklist licences moteurs

À vérifier avant toute publication d'archives moteurs :

- FFmpeg/ffprobe : V1 Windows x64 utilise le build Gyan `8.1.1` avec `--enable-gpl`; inclure/licencier comme GPL, conserver les notices et fournir l'accès au source/build correspondant.
- LibreOffice : MPL 2.0 principalement.
- Pandoc : GPL 2.0 ou ultérieure. Il est inclus dans le groupe de moteurs avancés embarqués.
- PDFium : BSD-3-Clause. La préparation utilise la release Windows x64 de `bblanchon/pdfium-binaries`, qui redistribue les builds Chromium PDFium avec leurs notices tierces. Le paquet Multi-Converter contient `bin/pdfium.dll` et le wrapper interne `bin/pdfium-render-x86_64-pc-windows-msvc.exe`, construit avec le crate Rust `pdfium-render`, pour effectuer les tests santé et les rendus.
- MuPDF et Poppler ne sont pas retenus pour les packs actifs à cause de leurs contraintes de licence. PDFBox n'est pas retenu car il implique Java/JVM.
- libvips : LGPL 2.1 ou ultérieure. Le script utilise les builds Windows officiels `libvips/build-win64-mxe`; les DLL/dépendances incluses peuvent avoir leurs propres licences et doivent rester documentées dans `licenses/THIRD_PARTY_NOTICES.txt`.
Incluez dans chaque archive les fichiers de licence et notices correspondant exactement au build distribué. Ne publiez pas un moteur si sa licence, ses composants ou ses obligations de redistribution n'ont pas été vérifiés.
