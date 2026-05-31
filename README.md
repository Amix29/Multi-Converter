# Multi-Converter

<p align="center">
  <img src="docs/readme-banner.svg" alt="Multi-Converter - Conversion locale, privée et open source" width="100%">
</p>

<p align="center">
  <a href="https://github.com/Amix29/Multi-Converter/releases/latest">
    <img alt="Release" src="https://img.shields.io/github/v/release/Amix29/Multi-Converter?label=Release&color=2563eb">
  </a>
  <a href="LICENSE">
    <img alt="Licence" src="https://img.shields.io/github/license/Amix29/Multi-Converter?label=Licence&color=0f766e">
  </a>
</p>

<p align="center">
  <strong>Multi-Converter</strong> est un logiciel <strong>gratuit</strong> et <strong>open source</strong> pour convertir vos fichiers directement sur votre ordinateur.<br>
  Documents, images, audio et vidéo — sans compte, sans cloud et sans envoyer vos fichiers sur un serveur.
</p>

<p align="center">
  <a href="https://github.com/Amix29/Multi-Converter/releases/latest">
    <img alt="Télécharger pour Windows" src="https://img.shields.io/badge/⬇️%20Télécharger%20pour%20Windows-.exe-2563eb?style=for-the-badge">
  </a>
</p>

---

## Table des matières

- [Pourquoi utiliser Multi-Converter ?](#pourquoi-utiliser-multi-converter-)
- [Télécharger](#télécharger)
- [Aperçu](#aperçu)
- [Formats pris en charge](#formats-pris-en-charge)
- [Confidentialité](#confidentialité)
- [Extension Qualité maximale](#extension-qualité-maximale)
- [Licences](#licences)
- [Note légale](#note-légale)
- [Développement](#développement)
- [Contribution](#contribution)
- [Sécurité](#sécurité)
- [Historique des étoiles](#historique-des-étoiles)

---

## Pourquoi utiliser Multi-Converter ?

| Point clé | Ce que cela change pour vous |
| --- | --- |
| 🆓 **Gratuit et open source** | Vous pouvez utiliser **Multi-Converter** librement et consulter son code source. |
| 🔒 **Local et privé** | Vos fichiers restent sur votre ordinateur pendant toute la conversion. |
| 🔄 **Multi-format** | Documents, images, audio et vidéo sont gérés dans une seule application. |
| ⚡ **Mode avancé optionnel** | L'extension **Qualité maximale** ajoute des moteurs spécialisés pour les conversions complexes. |

---

## Télécharger

| Système | Statut | Téléchargement |
| --- | --- | --- |
| 🪟 Windows x64 | ✅ Disponible | [`.exe`](https://github.com/Amix29/Multi-Converter/releases/latest) |
| 🍎 macOS | 🚧 En développement | Pas encore disponible |
| 🐧 Linux | 📋 Prévu | Pas encore disponible |

---

## Aperçu

<p align="center">
  <img src="docs/screenshots/01-files.png" alt="Ajout de fichiers" width="32%">
  <img src="docs/screenshots/02-format.png" alt="Choix du format" width="32%">
  <img src="docs/screenshots/03-output.png" alt="Conversion terminée" width="32%">
</p>

---

## Formats pris en charge

**Multi-Converter** détecte les formats ci-dessous et propose les conversions compatibles selon les moteurs disponibles.

| Catégorie | Formats reconnus |
| --- | --- |
| 📄 Documents et texte | PDF, DOCX, TXT/LOG, HTML/HTM, CSV, JSON, ODT, RTF, Markdown/MD, EPUB, XML |
| 🖼️ Images | PNG, JPEG/JPG, SVG, WebP, TIFF/TIF, BMP, ICO |
| 🎵 Audio | MP3, AAC/M4A, FLAC, WAV, OGG/OGA, WMA, OPUS, AIFF/AIF, ALAC, AC3, MP2, AMR, AU/SND, CAF |
| 🎬 Vidéo | MP4/M4V, MKV, WebM, MOV, AVI, WMV, 3GP/3G2, MTS/M2TS, MPEG-2/MPG/MPEG, OGV |

> **Note**
> Certains formats peuvent être reconnus sans offrir toutes les conversions vers tous les autres formats. Les choix affichés dans l'application dépendent du fichier source et des moteurs disponibles.

---

## Confidentialité

Les conversions se font sur **votre machine**. Une connexion Internet peut être nécessaire pour télécharger l'application, installer une mise à jour ou récupérer l'extension optionnelle **Qualité maximale**, mais **Multi-Converter** n'envoie pas vos fichiers dans le cloud.

---

## Extension Qualité maximale

L'extension **Qualité maximale** télécharge des moteurs tiers pour améliorer les conversions **Office**, **PDF**, **Markdown/HTML/EPUB** et **images avancées**.

*Installation complète Windows x64 déclarée dans le manifeste, tailles arrondies :*

| Moteur | Sert principalement à | Téléchargement | Une fois installé | Licence |
| --- | --- | ---: | ---: | --- |
| PDFium | Rendu PDF vers image | 5,6 Mo | 13,1 Mo | BSD-3-Clause |
| LibreOffice headless | Conversions Office et PDF fidèles | 483,8 Mo | 1,51 Go | MPL-2.0 |
| Pandoc | Markdown, HTML, EPUB, DOCX | 40,7 Mo | 231,1 Mo | GPL-2.0-or-later |
| libvips | Images avancées | 10,8 Mo | 28,5 Mo | LGPL-2.1-or-later |
| **Total** | Extension complète | **540,9 Mo** | **1,79 Go** | Licences multiples |

> **Note**
> Vous pouvez garder uniquement les conversions de base si vous n'avez pas besoin de ces moteurs avancés.

---

## Licences

Le code de **Multi-Converter** est sous licence **Apache 2.0**. Voir [LICENSE](LICENSE).

**Multi-Converter** utilise des moteurs de conversion tiers qui conservent leurs propres licences, notices et conditions de redistribution. Ils ne changent pas de licence parce que vous les utilisez via **Multi-Converter**.

Points importants :

- **Multi-Converter** lui-même est sous licence **Apache 2.0**.
- Les moteurs tiers restent des logiciels séparés avec leurs propres licences.
- La version **Windows x64 V1** embarque **FFmpeg** et **ffprobe** `8.1.1-essentials_build-www.gyan.dev`, configurés avec `--enable-gpl` : les exécutables embarqués sont traités comme des logiciels tiers couverts par la GPL dans cette distribution.
- L'extension **Qualité maximale** peut installer **PDFium**, **LibreOffice**, **Pandoc** et **libvips**, chacun avec ses propres licences.

Voir [NOTICE](NOTICE) et [docs/THIRD_PARTY_ENGINES.md](docs/THIRD_PARTY_ENGINES.md) pour les détails.

---

## Note légale

*Cette documentation n'est pas un conseil juridique. Les mainteneurs d'une release doivent vérifier les obligations exactes des binaires et moteurs tiers qu'ils distribuent.*

---

<h2 id="développement" align="center">Développement</h2>

Cette partie s'adresse aux personnes qui souhaitent lancer le projet en local, corriger un bug, proposer une amélioration ou explorer le code. **La préparation des releases, des installeurs, des archives de moteurs et des notes de version est assurée par les mainteneurs du projet.**

### Stack technique

| Couche | Technologie |
| --- | --- |
| Application desktop | Tauri 2 |
| Interface | React + TypeScript |
| Backend | Rust + Cargo |
| Build frontend | Vite |
| Scripts internes | Node.js |

### Prérequis

- Windows x64 pour le développement de la version actuellement supportée.
- Node.js `>=24 <25` et npm `>=11 <12`.
- Rust et Cargo.
- Les [prérequis Tauri pour Windows](https://v2.tauri.app/start/prerequisites/).

### Installation du projet

```bash
git clone https://github.com/Amix29/Multi-Converter.git
cd Multi-Converter
npm install
```

### Lancer l'application

```bash
# Application desktop complète : Tauri, conversions réelles, sidecars
npm start

# Commande équivalente
npm run tauri:dev
```

> `npm run dev` lance seulement le frontend Vite avec une API simulée. Pour tester les **conversions réelles**, les **sidecars**, le runtime **Tauri** ou l'accès aux fichiers, utilisez `npm start` ou `npm run tauri:dev`.

### Commandes utiles

Vérifications recommandées avant une pull request :

```bash
npm run check
npm run test:rust
npm run test:pdfium-wrapper
```

`npm run check` regroupe la génération des assets d'installeur, la validation des moteurs de base, la validation du manifeste embarqué, la validation i18n, le typecheck TypeScript et la validation de packaging des moteurs.

Commandes ciblées utiles pendant le développement :

```bash
npm run typecheck
npm run validate:i18n
npm run validate:embedded-manifest
npm run validate:bundled-base-engines
npm run validate:engines
```

Build :

```bash
npm run build
npm run tauri:build
```

Formatage et lint Rust :

```bash
npm run fmt:rust:check
npm run clippy:rust
npm run clippy:pdfium-wrapper
```

Sous Windows PowerShell, les commandes Cargo directes peuvent aussi utiliser un dossier de build temporaire :

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml --target-dir "$env:TEMP\mc-cargo-target-engine-registry"
```

`npm run tauri:dev` et `npm run tauri:build` utilisent un `CARGO_TARGET_DIR` temporaire pour éviter les artefacts Tauri périmés dans `src-tauri/target`.

### Structure du projet

```text
src/                         Interface React
src/i18n/                    Traductions de l'interface
src-tauri/                   Backend Tauri/Rust
src-tauri/binaries/          Sidecars de base embarqués pour Windows x64
src-tauri/engines-manifest.json
docs/                        Documentation licences, sécurité et moteurs tiers
tools/                       Configuration technique des moteurs
scripts/                     Scripts de build, validation et maintenance
```

Les dossiers générés (`dist`, `node_modules`, caches de build, sources locales de moteurs, archives de moteurs, résultats de tests) ne doivent pas être versionnés.

### Moteurs de conversion

**Multi-Converter** fonctionne avec deux niveaux de moteurs :

| Niveau | Rôle | Distribution |
| --- | --- | --- |
| Base | Conversions courantes disponibles avec l'application | Moteurs intégrés ou sidecars embarqués |
| Qualité maximale | Conversions plus fidèles ou plus avancées | Archives optionnelles distribuées séparément |

Les moteurs de base Windows x64 `ffmpeg` et `ffprobe` sont embarqués dans `src-tauri/binaries` et validés avant chaque build.

Restaurer et valider les moteurs de base :

```bash
npm run prepare:bundled-base-engines
npm run validate:bundled-base-engines
```

Pour travailler localement sur les scripts moteur, les sources temporaires se placent sous :

```text
engine-sources/windows-x64/<engineId>/
```

> **Important**
> Ne commitez pas d'archives générées, de sources locales de moteurs, de checksums de release ou de changements de version moteur sans demande explicite d'un mainteneur.

Voir [tools/ENGINE_PACKAGING.md](tools/ENGINE_PACKAGING.md) et [docs/THIRD_PARTY_ENGINES.md](docs/THIRD_PARTY_ENGINES.md) pour le contexte technique.

---

## Contribution

Les contributions sont bienvenues. Lisez [CONTRIBUTING.md](CONTRIBUTING.md) avant d'ouvrir une pull request.

Les contributions attendues concernent les **corrections de bugs**, les **optimisations**, les **améliorations d'interface**, les **traductions**, les **tests** et les **suggestions de fonctionnalités**. Avant de proposer une modification, lancez les vérifications adaptées à la zone modifiée.

---

## Sécurité

Pour signaler une vulnérabilité ou un problème de sécurité, ouvrez une **issue GitHub**. Voir [SECURITY.md](SECURITY.md) pour le périmètre et les informations utiles à fournir.

---

## Historique des étoiles

[![Star History Chart](https://api.star-history.com/svg?repos=Amix29/Multi-Converter&type=Date)](https://www.star-history.com/#Amix29/Multi-Converter&Date)
