# Multi-Converter — Diagnostic complet et plan d’implémentation V1

## Objectif du document

Ce document rassemble le diagnostic actuel de Multi-Converter et transforme les constats en plan d’implémentation concret pour une première version publique. L’objectif est de réduire l’ambition de la V1 pour obtenir un logiciel plus fiable, plus crédible et plus simple à publier en open source.

Multi-Converter doit rester fidèle à sa promesse principale : un convertisseur de fichiers local, gratuit, open source, simple à utiliser, sans compte, sans cloud, sans upload de fichiers et utilisable sans connexion internet pour les conversions réellement supportées.

La décision produit retenue pour la V1 est de limiter le logiciel aux catégories suivantes : Documents, Images, Audio et Vidéo. Les catégories Tableurs & Présentations, Archives, Polices, Bases de données, CAO, Modèles 3D et Sous-titres doivent être retirées de l’interface principale de la V1 ou déplacées vers une roadmap publique.

## Diagnostic général

Le projet a déjà une bonne base technique. L’architecture Tauri 2, React, TypeScript et Rust est adaptée à un logiciel desktop local. Le backend est organisé autour de fichiers bien séparés : `src-tauri/src/registry.rs` contient le catalogue de formats, `src-tauri/src/engines.rs` sélectionne les moteurs de conversion, `src-tauri/src/converters.rs` effectue les conversions, et `src-tauri/src/lib.rs` expose les commandes Tauri au frontend. Le frontend est principalement dans `src/App.tsx`, avec une abstraction API dans `src/lib/api.ts`.

Le principal problème n’est pas que le projet est mauvais ; au contraire, il est déjà ambitieux et structuré. Le problème est que la V1 promet trop de formats et trop de familles différentes. Un utilisateur qui voit CAO, 3D, bases de données, archives, polices, documents Office avancés et formats Adobe peut s’attendre à un niveau de qualité très élevé. Si beaucoup de ces formats sont seulement reconnus mais non convertibles, l’expérience peut donner une impression de logiciel inachevé.

La V1 doit donc devenir plus honnête, plus compacte et plus solide. Il vaut mieux publier un Multi-Converter capable de convertir correctement une trentaine de formats courants qu’un outil affichant plus de cent formats dont beaucoup ne sont pas réellement disponibles.

## Périmètre recommandé pour la V1

La V1 doit contenir uniquement les formats que le projet peut assumer techniquement avec ses moteurs actuels ou avec des moteurs embarqués clairement disponibles. Le périmètre recommandé est le suivant.

Pour les documents, garder les formats simples et utiles : PDF, TXT, Markdown, HTML, CSV, JSON, XML, DOCX, ODT, RTF et EPUB. Il faut toutefois présenter certaines conversions comme des conversions de contenu texte, pas comme des conversions fidèles de mise en page. PDF vers TXT, Markdown, HTML, CSV, JSON, XML ou TeX peut être considéré comme de l’extraction de texte. DOCX, ODT, RTF et EPUB peuvent être lus et réécrits simplement, mais la mise en page avancée ne doit pas être promise.

Pour les images, garder les formats courants : PNG, JPEG, WebP, BMP, TIFF, ICO et éventuellement SVG. SVG doit être traité avec prudence. SVG vers PNG/JPEG/WebP peut être supporté via rasterisation. En revanche, PNG/JPEG/WebP vers SVG ne doit pas être présenté comme une vraie conversion vectorielle, sauf si un moteur de vectorisation est ajouté plus tard.

Pour l’audio, garder les formats FFmpeg courants : MP3, M4A/AAC, FLAC, WAV, OGG, Opus, WMA, AIFF, ALAC, AC3, MP2, AMR, AU et CAF. Certains formats comme DTS, DSD, ATRAC ou APE sont plus spécialisés et devraient être exclus de la V1 si les tests ne garantissent pas leur fiabilité.

Pour la vidéo, garder les formats les plus utiles : MP4, MKV, WebM, MOV, AVI, WMV, MPEG-2, 3GP, OGV et éventuellement MTS/M2TS. Les formats plus professionnels ou anciens comme MXF, VOB, AVCHD, DivX, Xvid ou FLV peuvent être déplacés en V1.1 ou “formats avancés”, sauf si tu veux vraiment les tester sérieusement avant publication.

Les sous-titres ne font pas partie de la décision V1 actuelle. Même si ton code contient déjà SRT, VTT, ASS et TTML, je recommande de les retirer de la V1 si tu veux respecter ton nouveau périmètre Document, Image, Audio et Vidéo. Tu peux les garder dans le code si tu veux, mais ne les affiche pas dans l’interface publique V1.

## Changements à faire dans le registre des formats

Le fichier principal à modifier est `src-tauri/src/registry.rs`. C’est lui qui définit les catégories et les formats proposés. La constante `CATEGORIES` contient actuellement onze catégories. Pour la V1, elle doit être réduite à quatre catégories : documents, images, audio et video.

Il faut retirer de `CATEGORIES` les catégories `office`, `archives`, `fonts`, `databases`, `cad`, `models3d` et `subtitles`. Il faut aussi retirer des documents les formats trop ambitieux pour la V1 si tu ne veux pas les assumer : DOC ancien, MOBI, PostScript, Pages et WPS. Ces formats peuvent rester dans une documentation roadmap, mais pas dans le catalogue actif de l’application.

Il faut ensuite ajuster `INTEGRATED_DOCUMENT_SOURCES`, `INTEGRATED_DOCUMENT_TARGETS` et `PDF_TEXT_TARGETS` pour qu’ils correspondent exactement à ce que tu veux afficher. Si un format est visible mais ne peut pas être converti correctement, il doit soit être retiré, soit être marqué comme non disponible de façon très claire.

Les tests dans `src-tauri/src/registry.rs` devront être mis à jour. Le test `conversion_matrix_keeps_current_ready_count` attend actuellement un nombre fixe de conversions intégrées. Ce nombre changera dès que tu réduiras le catalogue. Il faudra recalculer le nouveau nombre attendu ou remplacer ce test par plusieurs tests plus lisibles, par exemple : vérifier que seules les quatre catégories V1 sont présentes, vérifier que les formats CAO/3D/archives/polices ne sont plus exposés, vérifier que PDF ne propose que les cibles de texte autorisées, et vérifier que les formats audio/vidéo de base proposent bien des conversions FFmpeg.

## Changements à faire dans la sélection des moteurs

Le fichier `src-tauri/src/engines.rs` doit être aligné avec le nouveau périmètre V1. Aujourd’hui, la constante `TOOLS` liste de nombreux moteurs optionnels : ImageMagick, libheif, Poppler, MuPDF, Pandoc, libarchive, Assimp, LibreDWG, DuckDB, sqlite3 et GDAL. Pour une V1 réduite, cette liste est trop large dans l’interface et dans les diagnostics.

Le moteur essentiel de la V1 est FFmpeg pour l’audio et la vidéo. Les moteurs Rust intégrés peuvent couvrir les documents simples et les images courantes. Les autres moteurs doivent être cachés de l’interface V1 ou déplacés dans une section “expérimental / prévu”.

Il faut aussi corriger la promesse offline. Actuellement, `engines.rs` contient `FFMPEG_DOWNLOAD_URL` et une fonction `download_and_extract_ffmpeg_suite` qui peut télécharger FFmpeg automatiquement. C’est incompatible avec la promesse “sans connexion internet”. Pour une vraie V1 offline, l’application ne doit jamais télécharger automatiquement de dépendance. Elle doit soit utiliser un binaire FFmpeg embarqué, soit afficher un message clair indiquant que le moteur est absent.

La logique recommandée est la suivante : au démarrage, vérifier si FFmpeg embarqué est disponible. S’il est disponible, audio/vidéo sont activés. S’il est absent, audio/vidéo sont marqués indisponibles avec une explication locale. Aucune tentative de téléchargement ne doit être faite. Si tu veux garder une option de téléchargement plus tard, elle doit être explicite, désactivée par défaut, documentée, et ne doit pas contredire le mode offline.

## Changements à faire dans les conversions

Le fichier `src-tauri/src/converters.rs` contient le cœur des conversions. Il y a plusieurs points à corriger ou clarifier.

La branche qui génère un SVG contenant une image PNG en base64 doit être retirée ou rendue inaccessible. Elle se trouve dans `convert_image`, dans le cas `target_format == "svg"`. Cette conversion crée un faux SVG vectoriel. Ton moteur de sélection refuse déjà PNG/JPEG vers SVG pour éviter ce problème, ce qui est une bonne décision, mais laisser cette branche dans le convertisseur crée un risque de régression. Pour la V1, il faut autoriser SVG seulement comme source rasterisée vers PNG/JPEG/WebP, ou bien ne pas proposer SVG comme cible depuis des images raster.

Les conversions de documents doivent être présentées comme des conversions simples. Le code lit souvent le contenu textuel puis recrée un document basique. C’est utile, mais cela ne préserve pas fidèlement les styles, tableaux, images, colonnes, notes, commentaires ou mises en page complexes. Il faut donc ajuster les textes de l’interface et du README pour parler d’extraction ou de conversion texte lorsque c’est le cas.

Le générateur PDF intégré est simple. Il convient pour du texte basique, mais il ne doit pas être vendu comme un moteur PDF avancé. Il faut prévoir des tests avec accents, caractères spéciaux, longs documents, pages multiples et fichiers vides. Si tu veux supporter des caractères Unicode plus complexes, il faudra plus tard un moteur PDF plus robuste avec gestion des polices.

Pour l’audio et la vidéo, la logique FFmpeg est déjà intéressante, avec modes de performance et progression. Il faudra cependant tester chaque format affiché dans l’interface avec des vrais fichiers. Si un format ne peut pas être testé facilement, il vaut mieux le retirer de la V1.

## Changements à faire dans l’interface

Le fichier principal est `src/App.tsx`. L’interface peut rester en trois étapes : choisir les fichiers, choisir le format, convertir/exporter. Cette structure est bonne et doit être conservée.

Le vocabulaire doit être ajusté. Le bouton “Télécharger” devrait plutôt devenir “Exporter vers Téléchargements” ou “Copier dans Téléchargements”, car “Télécharger” peut faire penser à une action internet. Comme Multi-Converter est local/offline, le mot “exporter” est plus cohérent.

L’écran de diagnostic des moteurs doit être simplifié pour la V1. Il ne doit pas afficher une longue liste de moteurs spécialisés que l’utilisateur ne comprend pas ou qui ne sont pas réellement gérés. Pour la V1, il peut afficher : moteur documents intégré, moteur images intégré, FFmpeg audio/vidéo, et éventuellement “formats avancés prévus plus tard”.

L’interface de choix des formats doit éviter d’afficher des formats indisponibles au même niveau que les formats disponibles. Si tu gardes des formats non intégrés dans le registre, ils doivent être clairement séparés dans une section “prévu” ou “non disponible dans cette version”. Mais le meilleur choix pour une V1 propre est de ne pas les afficher du tout.

Le drag and drop doit être vérifié. La zone visuelle existe, mais dans le frontend le `onDrop` empêche surtout le comportement par défaut. Le vrai drop dépend de l’événement Tauri. Il faut tester dans l’application finale que déposer un fichier fonctionne bien, et éventuellement ajouter un message si le drop n’est pas disponible en preview web.

## Changements à faire dans l’API frontend

Le fichier `src/lib/api.ts` contient une API preview pour le mode non-Tauri. Cette API contient des exemples de fichiers et de formats. Après réduction de la V1, les données preview doivent être alignées avec le nouveau périmètre. Il faut retirer les exemples de formats externes ou indisponibles qui ne font plus partie de la V1.

Il faut aussi vérifier que les types frontend restent cohérents avec les structures Rust. Par exemple, `categoryId` doit contenir des identifiants stables comme `documents`, `images`, `audio` ou `video`, pas des labels traduits ou des noms de catégorie en minuscules approximatifs dans les données preview.

## Changements à faire dans la documentation du logiciel

Le fichier `README.md` doit être mis à jour après réduction du périmètre. Il contient actuellement des nombres et promesses qui ne correspondent plus au diagnostic actuel. Il indique par exemple que le registre contient 111 formats en 11 catégories et que certains tests vérifient 955 conversions ou 14 conversions PDF texte, alors que le code actuel observé contient des attentes différentes.

Le README de la V1 doit expliquer clairement : ce que fait Multi-Converter, ce qui est supporté en V1, ce qui n’est pas encore supporté, comment lancer l’application, comment compiler, comment tester, et comment contribuer. Il doit aussi contenir une section “Limitations connues”, très importante pour un convertisseur de fichiers. Cette section doit expliquer que certaines conversions de documents sont des conversions de contenu texte et non des reconstructions parfaites de mise en page.

Il faut ajouter un fichier `LICENSE`. Les fichiers `package.json` et `Cargo.toml` indiquent actuellement `ISC`, mais il n’y a pas de fichier de licence visible. Pour un projet open source, c’est indispensable. Tu peux choisir ISC, MIT ou Apache-2.0. Pour un projet simple, MIT ou ISC sont faciles à comprendre. Si tu gardes ISC, ajoute le texte complet de la licence ISC dans `LICENSE`.

Il faut aussi ajouter une vraie section roadmap. Les catégories retirées ne sont pas des abandons : elles peuvent devenir “prévu après la V1”. Cela permet de garder l’ambition du projet sans donner une fausse impression dans l’application.

## Changements à faire pour le site vitrine

L’autre analyse mentionne un site Next.js avec des pages comme `app/page.tsx`, `app/licence/page.tsx`, `app/telechargement/page.tsx`, `public/llms.txt` et `public/pricing.md`. Si ce site fait partie de ton écosystème Multi-Converter, il doit être aligné avec le logiciel réel.

Le site ne doit pas annoncer des formats comme “disponibles” tant que le logiciel ne les supporte pas vraiment. Pour la V1, il doit annoncer uniquement Documents, Images, Audio et Vidéo. Les autres catégories doivent être affichées comme roadmap, ou ne pas être affichées du tout.

La page licence du site doit devenir définitive avant publication. Elle ne doit pas dire que la licence “doit être publiée” si le projet est déjà public. Elle doit afficher la licence choisie et pointer vers le fichier `LICENSE` du dépôt.

Les liens de téléchargement doivent être configurés seulement quand une vraie release existe. Avant cela, les boutons doivent dire “bientôt disponible”, “release en préparation” ou pointer vers GitHub Releases si une release réelle est publiée. Si tu mentionnes un checksum SHA256, il faut publier le checksum réel avec la release.

La promesse “local / sans internet” doit être identique sur le site, dans le README et dans l’application. Si l’application télécharge automatiquement FFmpeg, la promesse n’est pas vraie. Il faut donc corriger le logiciel avant de faire cette promesse publiquement.

## Packaging et publication open source

Avant publication, il faut vérifier que les dossiers générés ne sont pas suivis par Git. Les dossiers `node_modules/`, `dist/`, `src-tauri/target/` et `tmp/` doivent rester ignorés. Le `.gitignore` les contient déjà, mais il faut vérifier avec `git status` et `git ls-files` qu’ils ne sont pas déjà suivis. S’ils le sont, il faudra les retirer de l’index Git sans les supprimer localement.

Il faut ajouter une CI simple. Pour le logiciel desktop, une GitHub Action peut lancer au minimum `npm ci`, `npm run typecheck`, `npm run build` et `cargo test --manifest-path src-tauri/Cargo.toml`. Même si tu ne compiles pas encore les installateurs automatiquement, ces vérifications donneront confiance.

Il faut décider du statut de la première publication. Je recommande d’appeler la première version `v0.1.0` ou `v0.1.0-alpha` plutôt que `1.0.0`. Le projet est prometteur, mais une version 1.0.0 donne l’impression que tout est stable. Une version 0.1 assume que c’est une première version publique, encore en amélioration.

Il faut aussi remplir les métadonnées : auteur ou pseudo, repository dans `Cargo.toml`, keywords dans `package.json`, description claire, et éventuellement icône finale.

## Sécurité et confidentialité

La confidentialité est un point fort potentiel de Multi-Converter. Pour que ce soit vrai, il faut garantir qu’aucun fichier utilisateur n’est envoyé sur internet. Le code ne doit pas contenir de télémétrie, d’analytics, d’upload automatique ni de téléchargement caché. La suppression du téléchargement automatique FFmpeg est donc prioritaire.

Les commandes Tauri exposées doivent être prudentes. `export_to_downloads` et `export_to_folder` copient actuellement les chemins fournis par le frontend. Pour renforcer la sécurité, il serait préférable de copier uniquement des fichiers produits par une conversion récente ou situés dans un dossier temporaire géré par Multi-Converter. Cela évite qu’un frontend compromis puisse demander la copie arbitraire d’un fichier local.

La fonction `cleanup_temp_output_folder` contient déjà une protection pour ne supprimer que les dossiers temporaires gérés. C’est un bon point à garder.

## Tests recommandés pour la V1

Il faut mettre en place une matrice de tests réaliste plutôt qu’une matrice énorme. Pour chaque catégorie V1, choisis quelques fichiers d’exemple petits et libres de droits.

Pour les documents, tester TXT vers PDF, TXT vers HTML, Markdown vers HTML, CSV vers JSON, JSON vers CSV ou TXT, DOCX vers TXT, ODT vers TXT, EPUB vers TXT et PDF vers TXT. Il faut aussi tester les fichiers vides, les accents français, l’UTF-8, l’UTF-16 et les caractères spéciaux.

Pour les images, tester PNG vers JPEG, JPEG vers PNG, PNG vers WebP, WebP vers PNG, BMP vers PNG, TIFF vers PNG et PNG vers ICO. Tester aussi une image avec transparence pour vérifier que JPEG perd logiquement la transparence, et que PNG/WebP la gardent si possible.

Pour l’audio, tester WAV vers MP3, MP3 vers WAV, WAV vers FLAC, FLAC vers MP3, M4A vers MP3, OGG vers MP3 et Opus vers MP3.

Pour la vidéo, tester MP4 vers WebM, WebM vers MP4, MOV vers MP4, AVI vers MP4 et extraction audio MP4 vers MP3 ou WAV si tu gardes la conversion vidéo vers audio.

Les tests doivent vérifier au minimum que le fichier de sortie existe, qu’il n’est pas vide, qu’il a la bonne extension, et si possible qu’il peut être relu par le moteur correspondant.

## Ordre d’implémentation recommandé

La première étape est de verrouiller le périmètre V1. Modifie `src-tauri/src/registry.rs` pour ne garder que Documents, Images, Audio et Vidéo, avec une liste réduite de formats. Mets à jour les tests du registre immédiatement après.

La deuxième étape est d’aligner les moteurs. Simplifie `src-tauri/src/engines.rs`, cache les moteurs hors périmètre V1, et supprime ou désactive le téléchargement automatique de FFmpeg. L’application doit être honnête : si FFmpeg embarqué est absent, les conversions audio/vidéo ne sont pas disponibles.

La troisième étape est de nettoyer les conversions dangereuses ou trompeuses. Supprime le faux SVG raster encapsulé, clarifie les conversions de documents, et retire les formats trop spécialisés non testés.

La quatrième étape est de mettre à jour l’interface. Ajuste les textes, renomme “Télécharger” en “Exporter”, simplifie l’écran moteurs, et assure-toi que seuls les formats V1 apparaissent.

La cinquième étape est de mettre à jour la documentation. Ajoute `LICENSE`, corrige `README.md`, ajoute une section limitations connues, ajoute une roadmap, et aligne le site vitrine si tu en as un.

La sixième étape est de nettoyer le dépôt. Vérifie que les dossiers générés ne sont pas suivis par Git, ajoute une CI simple, et prépare une release `v0.1.0-alpha` avec checksum si tu publies un installateur.

La septième étape est de tester manuellement et automatiquement les conversions V1 avec de vrais fichiers. Ne publie pas un format dans l’interface tant que tu ne l’as pas testé.

## Proposition de roadmap

La V1 doit se concentrer sur Documents, Images, Audio et Vidéo. Elle doit être stable, simple et honnête.

La V1.1 peut ajouter les sous-titres, car le code existe déjà et la catégorie est relativement proche de l’audio/vidéo. Les formats possibles sont SRT, VTT, ASS et TTML, avec une mention claire que les styles avancés peuvent être simplifiés.

La V1.2 peut améliorer les documents avec de meilleurs moteurs, une meilleure génération PDF, une meilleure conservation des métadonnées et une meilleure gestion des tableaux.

La V2 peut introduire les archives et les formats Office avancés, mais seulement avec des moteurs solides et une stratégie claire.

Les catégories CAO, 3D, bases de données, polices et formats professionnels Adobe doivent rester beaucoup plus tard dans la roadmap. Ce sont des domaines complexes qui demandent des moteurs spécialisés, des tests nombreux et des attentes utilisateur très élevées.

## Définition de “prêt à publier”

Multi-Converter V1 peut être considéré prêt à publier lorsque le catalogue actif ne contient que les catégories V1, que chaque format affiché a été testé, que l’application ne tente aucun téléchargement automatique, que la licence est présente, que le README est cohérent, que les dossiers générés ne sont pas suivis par Git, que les tests passent, et que le site ou la page de présentation ne promet rien que le logiciel ne fait pas encore.

Le but n’est pas d’avoir un logiciel parfait. Le but est d’avoir une première version propre, honnête, utile et crédible. Si tu publies une V1 plus petite mais stable, tu donneras une bien meilleure impression qu’avec une V1 énorme mais incomplète.
