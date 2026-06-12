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
