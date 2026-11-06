# Exécution de la migration desktop Svelte

État au 6 novembre 2026 : **portage source réalisé ; acceptation installée encore ouverte**.
Source du portage initial : **`adf7b8ce`**, branche de réalisation
`codex/migrate-svelte`. Intégration locale effectuée sur **`codex/test`**, après sauvegarde contrôlée
des modifications initiales ; installation propre et `check` complet y passent. Aucun push ni publication.
Le site Next.js et le backend Rust/Tauri gardent leurs frontières.

## Installateur Windows actualisé le 6 novembre 2026

À la demande du mainteneur, l'installateur NSIS privé a été reconstruit depuis
`334bd2a5`, avec l'interface Svelte et la correction de barre de titre `0b003d33`.
Le build de production, le typage, les gardes de bundle et les contrôles des
moteurs passent. La signature updater est vérifiée cryptographiquement ; les
empreintes du runtime OCR et des 21 fichiers de modèles correspondent au verrou.
Le paquet fait 999 648 595 octets ; voir le
[reçu de construction](audits/2026-11-06/windows-svelte-installer.json).

Les moteurs et le cache existants sont réutilisés. L'ancien paquet et son
exécutable sont conservés par déplacement, sans copie supplémentaire. Le
mainteneur installera lui-même cette candidate : aucune nouvelle acceptation
installée n'est revendiquée. Aucun push ni publication ; Linux/macOS restent arrêtés.

## Correction ciblée du 5 novembre 2026

Source courante **`0b003d33`** : la barre de titre Windows suit les couleurs du
design system et le choix clair/sombre/système. La fenêtre de développement a
été vérifiée nativement dans les trois choix, avec le manifeste Cargo antérieur
conservé à l’identique et sans copie de moteurs. Les 64 tests frontend, 196 tests
Rust (13 ignorés), Clippy et contrôles ciblés passent. Les anciennes preuves de
conversion/paquets ci-dessous restent rattachées à leurs checkpoints d’origine.
Voir [l’adoption et les captures](APP_DESIGN_SYSTEM_ADOPTION.md) et le
[reçu Windows](audits/2026-11-05/native-titlebar/validation.json).
Les préparations Linux/macOS et l’acceptation installée globale restent arrêtées.

## Suite native interrompue le 1 novembre 2026

Le mainteneur demande de poursuivre les essais natifs Windows et les paquets
macOS avec moteurs réels, ainsi que Linux si un environnement local existe.
Ubuntu WSL est disponible et le contrôle Windows répond maintenant. Le
mainteneur a choisi son compte actuel avec sauvegarde, sans preuve de profil
Windows vierge. Il a ensuite demandé l’arrêt de cette préparation et la
restitution de l’espace disque, avant toute nouvelle installation Windows,
interaction GUI du produit ou compilation native Mac.

Les transferts et vérifications ont été arrêtés. Les copies temporaires de
sauvegarde Windows et le nouvel espace d’extraction Linux sont retirés ; le
disque RAM temporaire Mac de 32 Gio est détaché. Les profils et l’installation
Windows d’origine, le checkout Linux frontend antérieur, les preuves du portage
et les anciens paquets sont conservés. Les mesures finales sont consignées dans
le [reçu de restitution](audits/2026-11-01/svelte-migration/native-preparation-rollback.json).
Cette phase ne fournit donc aucune nouvelle acceptation installée ni nouveau
DMG/AppImage Svelte. Les critères natifs restent ouverts.

Le validateur Windows refusait toute version autre que 1.0.6 : il compare
désormais la candidate à la version réelle de `package.json`, avec régression
sur une version obsolète. Les checklists Windows/Linux sont réalignées sur le
convertisseur/OCR, sans exigences d’éditeurs supprimés.

| Lot | État et résultat |
| --- | --- |
| L0 Référence | Réalisé : référence React isolée, 56 unités, builds et mesures ; sauvegarde documentaire `9b26001d` |
| L1 Socle | Réalisé : Svelte 5, Vite, TS, Tailwind 4, installations propres sur trois OS, lancement Tauri Windows observé |
| L2 Design | Réalisé au niveau source et moteurs UI : DS-01 à DS-07 corrigés ; deux WebKit natifs, quatre largeurs, clavier et thèmes |
| L3 Parcours vertical | Source, preview et moteurs réels validés ; picker/export GUI après migration encore à accepter |
| L4 Parité conversion | Implémentée : lots, reprise, copie de flux, collage implicite, rapports, récupération et réexport ; scénarios UI et backend séparés |
| L5 OCR et annexes | Implémentés : OCR, six langues, thèmes, diagnostics, accueil, retours et mises à jour ; corpus Windows réel réussi |
| L6 Bascule | Réalisée : runtime React, types/plugin/hooks et palette desktop orphelins retirés ; site inchangé |
| L7 Validation | Gates disponibles exécutés ; candidate Windows construite et signature updater vérifiée ; acceptation installée et nouveaux DMG/AppImage ouverts |

## Construction et qualité

Versions exactes : Svelte 5.57.3, plugin Vite Svelte 7.3.1, svelte-check 4.7.7,
Tailwind/plugin Vite 4.3.3, Bits UI 2.20.2, Lucide Svelte 1.66.0.
Vite 8, TypeScript 6, Node 24/npm 11 et Rust/Tauri restent dans leur périmètre.
Le bouton provient du registre shadcn-svelte 1.7.2, style nova, avec variantes
possédées localement. Les dialogues et sélecteurs utilisent directement Bits UI,
avec une seule implémentation de chaque primitive. Provenance et licences sont
conservées dans `src/components/ui/` et dans `NOTICE`.

Les contrôleurs utilisent les runes et des getters vivants ; les modèles purs et
la façade API sont conservés. Les effets possèdent leur nettoyage, y compris les
abonnements résolus tardivement. Les huit surfaces modales partagent focus,
Échap, portail et restitution du focus. Les notes Markdown deviennent un arbre
Svelte typé et échappé, sans HTML brut ni chargement d’images distantes.

Le plugin Svelte atteint deepmerge 4.3.1, affecté par GHSA-gcqx-w48m-w2h4 sans
version officielle corrigée lors de l’inspection. Le fork MIT local de build
bloque les clés dangereuses des deux côtés de la fusion, à toute profondeur.
Les tests vérifient aussi la résolution réellement installée. Aucun avis n’est
masqué. Le montage file dependency/override passe les installations propres
Windows, Ubuntu et Mac ; les audits npm signalent zéro vulnérabilité.

La dernière inspection du bundle a détecté des paramètres et notes updater de
preview encore présents malgré leur neutralisation à l’exécution Tauri. Leur
branche est désormais exclue à la compilation de production ; le garde de bundle
contrôle aussi ces marqueurs. Les builds finaux Windows, Linux et Mac passent
ce contrôle renforcé ; les scénarios preview restent disponibles dans leur mode.

## Design corrigé

- DS-01/02 : texte d’action blanc chaud et quatre rôles additionnels indexés,
  sans casser le schéma externe des 56 tokens. Contrastes repos/survol/pression :
  clair **4,753 / 5,308 / 6,289**, sombre **5,278 / 6,157 / 7,409**.
- DS-03 : préfixe Tailwind `tw:` et variables `--tw-*`, pont explicite vers
  les rôles canoniques. Les deux WebKit vérifient 18 px pour `tw:text-lg`,
  16 px pour le corps de marque et 12 px pour le rayon de contrôle.
- DS-04 : actions majeures et tactile >=44 px ; variantes denses explicites.
  Le vrai checkbox des réglages possède sa cible 48 × 44 et son focus visible.
- DS-05/06 : réduction du mouvement ciblée, sans durées globales de 1 ms ;
  libellés/progression conservés, alias rapides/panneaux reliés aux 140/210 ms.
- DS-07 : menu Bits UI. Le banc WebKit a découvert un débordement de 11 px à
  375 px ; la largeur minimale fautive est corrigée et protégée par régression.

Les captures Chromium finales et deux vues WebKitGTK sont versionnées avec les
reçus. Les vues macOS clair/large et sombre/étroite ont été inspectées dans le
rendu natif ; elles restent dans le dossier temporaire autorisé du Mac.
La bibliothèque externe de design n’a pas été modifiée ni republiée.

## Validations réalisées

| Environnement | Preuve actuelle |
| --- | --- |
| Windows x64 | Installation propre, `check` complet, 60 unités frontend, 194 tests Rust (13 lourds ignorés ici), puis les 11 groupes lourds de conversion séparément ; contrôle média hors ligne réussi |
| Windows OCR | Runtime embarqué source puis corpus de 40 cas ; moyenne propre 100 %, difficile 99,76 %, zéro connexion distante sur 745 observations |
| Rust/PDFium | Format et Clippy sans avertissement, wrapper exécuté, archive LibreOffice extraite/testée, audits Python et chaîne OCR réussis ; audit Rust sans nouvelle exception ni vulnérabilité bloquante, avertissements transitifs conservés |
| Chromium preview | **18 scénarios réussis**, 16 exclusions explicites par projet ; 2 000 fichiers, erreur/annulation/reprise, export/rapport/récupération, collage, OCR, six langues et 20 cycles réglages puis OCR |
| Ubuntu 24.04.3 WSL2 | Outils Linux natifs, installation propre, préflight, gate CI complet et 201 tests Rust (13 ignorés) ; sidecars de compilation explicitement factices |
| WebKitGTK 2.52.6 | **8 scénarios / 184 assertions / zéro échec**, deux thèmes et quatre largeurs, composants du produit compilé en mode preview |
| Mac Apple Silicon 26.6.2 | Installation frontend propre, types, 60 unités, build et audit npm ; Node 24.22.2/npm 11.7.0 (version canonique, installation propre répétée) dans le dossier temporaire explicitement autorisé |
| WKWebView système | **8 scénarios / 184 assertions / zéro échec**, deux thèmes/quatre largeurs ; profil éphémère, fenêtre de test active pour le clavier |

Les deux bancs WebKit rendent le vrai frontend compilé avec l’API de preview.
Ils prouvent les composants, la cascade et les interactions dans ces moteurs ;
ils ne prouvent ni commandes Tauri, ni conversions natives, ni paquets installés.
Les essais GTK utilisent Xvfb/graphismes logiciels ; Wayland/GPU physique ne sont
pas certifiés. Le banc Mac est une fixture ad-hoc, pas une signature Apple du
produit, une notarisation ou un DMG Multi-Converter.

Le pic OCR de 668,9 Mio mesure le processus worker principal, hors enfants ;
la médiane 48 170 ms est celle du corpus de cet hôte, pas une promesse produit.

## Mesures comparables

Sept paires de contextes Chromium neufs, ordre alterné, preview simulée identique
à 2 000 fichiers ; mesures réalisées sur le checkpoint de chargement différé
`e8f4f5d7`, conservées comme telles ; pas performances natives :

| Mesure | React | Svelte |
| --- | ---: | ---: |
| Démarrage preview | 115,52 ms | 118,44 ms |
| Première ouverture des réglages | 366,42 ms | 69,18 ms |
| Sélection d’un format | 58,64 ms | 45,85 ms |

Le portage avant chargement différé montrait un surcoût de démarrage de 25,58 ms. Charger les
primitives de format au moment où une cible est choisie ramène cet écart à
**2,92 ms / 2,5 %** ; l’état de l’écran reste monté et conservé. Les réglages
s’ouvrent environ 81 % plus vite dans ce test. Les assets JS/CSS production
complets de la source finale passent de 574 401 à 642 038 octets (+11,8 %), gzip de 156 378 à
175 375 (+12,1 %), contrepartie des primitives accessibles et du rendu sûr.
Le reçu des assets finaux est distinct des timings du checkpoint précédent.
Aucune baisse de RAM OS ni accélération OCR n’est revendiquée.

## Candidate Windows locale

NSIS de `adf7b8ce` construit avec toutes les ressources configurées :
`%LOCALAPPDATA%/Temp/mc-cargo-target-svelte-migration/release/bundle/nsis/Multi-Converter_1.0.7_x64-setup.exe`.
L’installateur fait 999 658 055 octets ; son
[reçu d’empreintes](audits/2026-11-01/svelte-migration/windows-candidate.json)
consigne aussi l’exécutable et la signature. La signature updater est vérifiée
cryptographiquement contre la clé publique configurée. **Authenticode :
NotSigned** ; une signature updater ne remplace pas la signature Windows.
Aucun installateur n’a été publié et aucun `latest.json` fictif n’a été créé.
Les candidates précédentes restent dans leurs dossiers de checkpoint.

## Politique Linux et limites restantes

Le produit reste Linux x64. Le frontend est vérifié ici avec WebKitGTK 2.52.6
sur Ubuntu 24.04. Les anciens tests Tailwind seuls sur Jammy 2.50.4 restent
historiques et ne deviennent pas des tests Svelte ou d’AppImage sur Ubuntu 22.04.
Exiger un système et WebKitGTK maintenus à jour ; aucune version WebKit minimale
universelle n’est déduite de ces deux points de mesure. La candidate Linux doit
encore être construite/vérifiée sur sa base de distribution avec ses moteurs
et son OCR Linux réels. Les placeholders du gate CI ne peuvent pas être publiés.

La sélection native, le drop/collage et les exports GUI doivent encore être
acceptés dans la candidate finale. Lors de la première phase, l’outil de contrôle
Windows avait expiré avant interaction ; le contrôle répond désormais, mais la
suite a été interrompue par le mainteneur avant tout essai GUI du produit.
Les 66 scénarios installés Windows et les
acceptations DMG/AppImage sur hôtes propres restent ouverts. Les copies Linux
et Mac de validation frontend ne disposent pas ici de l’ensemble des moteurs
et OCR natifs requis pour de nouveaux paquets complets.

**Le mandat n’est donc pas déclaré accepté de bout en bout sur les trois OS.**
Le code migré est livré pour cette étape ; le gate release V1.0.7 reste bloqué.

## Reproduction et preuves

- [Assets production finaux](audits/2026-11-01/svelte-migration/final-production-assets.json)
  et [intégration locale](audits/2026-11-01/svelte-migration/local-integration.json).
- [Résumé machine](audits/2026-11-01/svelte-migration/validation-summary.json),
  [comparaison appariée](audits/2026-11-01/svelte-migration/paired-preview-comparison.json)
  et [état avant optimisation](audits/2026-11-01/svelte-migration/paired-preview-before-lazy-options.json).
- [WebKit Ubuntu](audits/2026-11-01/svelte-migration/ubuntu-webkit-ui.json),
  [WKWebView Mac](audits/2026-11-01/svelte-migration/macos-wkwebview-ui.json) et
  [OCR Windows sans texte reconnu](audits/2026-11-01/svelte-migration/windows-ocr-summary.json).
- [Matrice de parité et critères A01–A12](MIGRATION_SVELTE_PARITE.md).

Commandes courantes : `npm ci`, `npm run check`, `npm run test:ui:preview`,
`npm run build:frontend`, `npm run test:production-bundle`,
`npm run test:conversions`, `npm run test:ocr:runtime`,
`npm run test:ocr:corpus` et les gates de plateforme documentés dans TESTING.
Sur Linux, après build preview :
`xvfb-run -a python3 scripts/probes/run-svelte-webkit.py "$PWD" "<sortie>"`.
Sur Mac, après build preview :
`bash scripts/probes/run-svelte-wkwebview.sh "$PWD" "<sortie>"`.
Les sources des bancs sont versionnées ; leurs dépendances sont celles du système.

## Reprise et conservation

Checkpoints : `9b26001d` référence, `716752e0` portage,
`4712da08` consolidation, `74d5adaf` menu étroit,
`e0ecf6a5` isolation des tokens, `e8f4f5d7` chargement différé,
`adf7b8ce` exclusion stricte des fixtures de production.
Les anciens fichiers React ont une copie récupérable locale sous
`tmp/react-legacy` dans le worktree ; Git conserve leurs versions historiques.
Les candidates intermédiaires restent dans leurs dossiers de checkpoint.
La comparaison de 39 documents/fichiers initiaux avec `9b26001d` est identique ;
les modifications préexistantes et le Cargo.toml local sont préservés.
