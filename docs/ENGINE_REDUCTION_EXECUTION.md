# Allègement des moteurs — exécution par lots

## Contrat et état au 7 novembre 2026

Le mainteneur autorise l'allègement des moteurs actuels, y compris une
distribution plus légère si elle conserve formats, qualité et OCR local.
L'[audit initial](ENGINE_SIZE_AUDIT_2026_11.md) reste la référence de mesure.
Pas de changement de modèle, de téléchargement OCR à l'exécution, de conversion
cloud, de publication ni de préparation Linux/macOS. Les anciens artefacts et
fichiers utilisateur sont conservés.

Lot 1 : **profil LibreOffice Windows réalisé ; validation du setup en cours**.
Les autres moteurs n'ont pas encore été transformés.

## Lot 1 — LibreOffice Windows, profil de distribution headless

| Mesure | Original | Profil `windows-headless-v1` |
| --- | ---: | ---: |
| Archive ZIP | 483 796 141 octets | 328 694 744 octets |
| Runtime extrait | 1 513 332 017 octets | 1 142 267 215 octets |
| Fichiers | 19 325 | 9 888 |

Gain de l'archive : **155 101 397 octets**, environ 32,1 % du bloc LibreOffice.
Gain du runtime extrait : **371 064 802 octets**. Ces chiffres sont mesurés sur
les moteurs ; le gain du setup complet doit être mesuré séparément.

Le profil retire l'aide locale, la galerie, les thèmes d'icônes autres que
Colibre et les catalogues traduits de l'interface interne LibreOffice, avec
une exception prioritaire pour les fichiers de licence/copyright. Il garde
les bibliothèques exécutables, tous les filtres, dictionnaires, césures,
locales/ICU, polices, registres de formats et notices. Les langues des documents
ne dépendent pas des traductions de l'interface interne retirées.

Le ZIP est construit en recopiant les enregistrements déjà compressés et en
réécrivant seulement les offsets du répertoire ZIP. Aucun arbre moteur n'est
extrait/recompressé. Un buffer de 1 Mio suffit ; la sortie est le nouvel
artefact optimisé. La reconstruction explicite utilise au plus une archive
de sortie atomique temporaire, sans copie complète du runtime.

### Intégration et intégrité

- `src-tauri/engines-manifest.json` garde l'URL et le hash de l'archive originale
  publiée ; aucun hash nouveau n'est présenté comme un téléchargement déjà publié.
- `src-tauri/windows-libreoffice-profile.json` verrouille le hash source et le
  hash/volume/composition du paquet dérivé.
- `prepare:bundled-engines` produit ce profil ; le validateur vérifie ses
  empreintes et sa sélection sans créer d'archive quand il est en mode contrôle.
- Tauri Windows inclut uniquement l'archive profilée, sous le chemin runtime
  habituel `engine-archives/libreoffice.zip` ; le ZIP original reste conservé
  localement pour reproduction et retour arrière, hors paquet distribué.
- Le lecteur Rust vérifie le hash dérivé et sa limite d'extraction. Un cache
  indexé par ce hash préserve les anciens runtimes et évite de les écraser.
- Les configurations et résolveurs macOS/Linux gardent leur identité d'origine.

### Validation native et limites

Le runtime de référence déjà présent est vérifié par CRC de chaque fichier
retenu contre le ZIP source verrouillé. La vue candidate utilise des liens
physiques NTFS, sans dupliquer ses 1,14 Go de fichiers. Chaque conversion
utilise un profil utilisateur privé reprenant les paramètres de sécurité de
production ; aucun réglage LibreOffice de l'utilisateur n'est changé.

Sur un DOCX contrôlé de trois pages, créé avec le Pandoc inchangé : PDF,
DOCX, DOC, ODT, RTF, HTML et TXT passent la comparaison référence/candidate.
Pour les sorties paginées, le nombre de pages, le texte et les PNG PDFium
à 200 DPI correspondent exactement ; TXT est comparé par hash du contenu.
Le corpus contient tableaux, accents, petits caractères et texte arabe/chinois.
Ce contrôle établit une parité sur ce corpus, pas une fidélité universelle.

Le premier reçu couvre 9 887 fichiers ; l'ajout conservateur de
`help/media/icon-themes/COPYING-ICONS` conserve une notice supplémentaire sans
modifier le code ni les données de conversion. Le smoke final revérifie les
9 888 fichiers retenus et le PDF de trois pages avec le hash final
`d521a61c1c5fa175fc60871f872b221dcce858b20968b27a8708df3d7f8e7d70`.
Voir les [sept sorties](audits/2026-11-07/engine-reduction/libreoffice-native.json)
et le [smoke final](audits/2026-11-07/engine-reduction/libreoffice-final-profile-smoke.json).

Autres contrôles exécutés : trois tests Node du profil/ZIP et refus des chemins
dangereux ; contrôle CRC ZIP indépendant ; lecture/décompression complète par
le lecteur ZIP Rust vers un puits, **sans extraire de fichiers** ; tests Rust,
matrice des 11 groupes de conversions réelles, contrôle HTTP négatif des médias
et Clippy avec avertissements refusés. Le contrôle général complet passe,
dont 64 tests frontend et les sept tests du wrapper PDFium ; la dernière passe
Rust compte 199 succès et 14 tests lourds ignorés par défaut. Les 11 groupes de
conversions et le test de flux ZIP sont exécutés séparément avec succès.

Le runtime OCR et les cinq modèles restent identiques et embarqués. Le corpus
OCR historique de 40 cas n'est pas rejoué pour ce changement LibreOffice ;
les contrats OCR et leurs verrous font partie des contrôles généraux. Aucun
test CLI moteur ne remplace l'acceptation GUI/installée de l'application finale.

## Distributions légères examinées

La [source Gyan](https://www.gyan.dev/ffmpeg/builds/) confirme que nous utilisons
déjà la variante Essentials. La variante Shared proposée par cet éditeur est
une Full, pas un remplacement Essentials automatiquement plus petit. Elle ne
sera pas substituée sans mesure de l'ensemble des DLL et parité des capacités.
Une compilation partagée de la version actuelle reste un lot séparé.

La [distribution libvips](https://www.libvips.org/install.html) distingue Web et
All ; le runtime actuel est déjà limité à 28,47 Mo. Changer vers un paquet
plus petit peut retirer un lecteur/codec nécessaire : aucun échange sans gain
mesuré et matrice de formats réussie. Le runtime OCR natif reste hors de ce
premier lot et conditionné à la parité des cinq modèles.

## Reproduction du lot

```powershell
npm run prepare:libreoffice-profile
npm run test:engine-profiles
node scripts/prepare-libreoffice-profile.mjs --check
# Définir MULTI_CONVERTER_LO_REFERENCE sur un runtime original correspondant au ZIP.
npm run test:libreoffice-profile:native
node scripts/cargo-test-temp.mjs test --manifest-path src-tauri/Cargo.toml prepared_libreoffice_profile_streams -- --ignored --nocapture
```

`--write-lock` est réservé à une nouvelle dérivation volontaire et revue.
Le contrôle natif réutilise les fichiers via liens physiques ; il ne doit
jamais copier un runtime si ces liens sont indisponibles. Le répertoire de
test optionnel doit rester dans le `tmp/` du dépôt. Les preuves peuvent être
gardées sans copier les fichiers moteur ; leur volume logique inclut les liens.

## Lots suivants

1. FFmpeg/ffprobe partagés : garder tous les formats et les replis logiciels,
   vérifier licences/DLL et mesurer le paquet complet avant adoption.
2. OCR Python ciblé : retirer seulement des dépendances démontrées inutiles,
   puis rejouer les cinq modules, les 40 cas et le comportement hors ligne.
3. Pandoc de distribution sans symboles : maintenir sandbox, lecteurs/rédacteurs
   et ressources embarquées ; mesurer séparément gains disque et setup.

Ces lots restent ouverts et ne sont pas déclarés implémentés par le lot 1.
