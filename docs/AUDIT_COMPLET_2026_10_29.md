# Multi-Converter — Audit complet du 29 octobre 2026

**Verdict : Block — poursuivre le développement, ne pas publier V1.0.7 en l’état.**

L’application possède une base saine de convertisseur local. Les priorités sont la fidélité et la transparence des conversions, la maîtrise des accès réseau des moteurs, les dépendances, la reproductibilité OCR et plusieurs défauts concrets du parcours. Une refonte complète ou le remplacement général des moteurs ne se justifient pas.

Le périmètre demandé reste **conversion de documents, images, audio et vidéo + OCR local PP-OCRv6_medium**. L’édition de documents/PDF a été annulée. Aucune proposition ci-dessous ne réintroduit un éditeur.

## 1. État audité et méthode

| Élément | État vérifié |
| --- | --- |
| Dépôt indépendant | `C:\Users\ryadb\Développement\LATELIER_IA\projets\multi-converter` |
| Branche locale | `codex/test` |
| Révision | `98726742 — Remove document and PDF editors while retaining conversion OCR` |
| Version de développement | 1.0.7, non publiée |
| Référence publiée documentée | V1.0.6 ; les captures simulées n’indiquent pas une publication réelle |
| Système de cet audit | Windows ; Chromium pour l’interface, binaires locaux pour les tests de moteurs |
| Documents de contexte | AGENTS/règles et Stack de l’Atelier, AGENTS/règles du projet, PLAN, VALIDATION, OCR, ARCHITECTURE, documentation de tests et de distribution |
| Compétences utilisées | better, product-design:audit, security-best-practices |
| Modification du produit | Aucune correction appliquée pendant cet audit ; rapport et preuves uniquement |

L’ancien chemin `C:\Users\ryadb\Projet\Multi Converter\Multi-Converter` fourni par le contexte de la conversation n’existe plus. Le dépôt ci-dessus a été retrouvé puis vérifié. Le dossier projet configuré dans les outils de travail mérite d’être réaligné.

Trois niveaux de preuve sont distingués :

- **Reproduit** : comportement observé dans la prévisualisation compilée actuelle ou un test de moteur réellement exécuté.
- **Code** : chemin déterministe ou risque établi par lecture des sources ; la condition n’a pas nécessairement été exercée dans une application installée.
- **À valider** : recommandation ou hypothèse qui nécessite un corpus, des mesures ou un hôte natif.

Les 25 captures ont été ouvertes et inspectées. La capture 13 prise pendant une transition a été rejetée puis refaite après affichage du rail ; la capture 22 a également été refaite après stabilisation du dialogue. Les reçus JSON gardent les mesures et les limites des simulations.

La prévisualisation emploie des API simulées : son OCR, ses durées, tailles de fichiers, exports et versions de mise à jour sont fictifs. Elle démontre le rendu et les interactions, pas l’inférence OCR, l’export réel ou une installation Tauri. Le site public n’a pas fait l’objet d’une visite exhaustive en production ; ses sources et son arbre de dépendances ont été examinés.

## 2. Décisions prioritaires

| Priorité | Action | Motif et résultat attendu |
| --- | --- | --- |
| P0 — publication | Résoudre/qualifier les alertes Rust, Python, frontend et site | Plus aucun avis bloquant non traité ; exception uniquement documentée et autorisée par les règles |
| P0 — confidentialité | Empêcher le chargement réseau implicite par les moteurs de documents | Un document non fiable ne déclenche pas de requête HTTP à l’insu de l’utilisateur |
| P0 — OCR/release | Réparer le verrou de construction Paddle macOS Intel et refaire les validations natives | Chaîne reproductible, ressources locales vérifiées, vraie inférence sur les architectures livrées |
| P1 — intégrité | Signaler les conversions dégradées et préserver les données structurées | Une sortie appauvrie ne doit pas être présentée comme une réussite sans réserve |
| P1 — interface | Corriger les actions tronquées, les erreurs muettes et les notifications qui recouvrent les boutons | Le parcours principal reste lisible, actionnable et récupérable |
| P1 — robustesse | Protéger le démarrage d’un lot, les résultats non exportés et les processus longs | Pas de double lancement, de perte silencieuse de résultat ou de processus abandonné |
| P1 — distribution | Refaire des sorties propres et aligner moteurs, manifeste, provenance et licences | Aucun ancien bundle d’éditeur dans l’artefact final ; contenu livré précisément connu |
| P2 — utilité | Profils de qualité, diagnostic des moteurs, politique de pistes et métadonnées | Choix compréhensibles, résultats prévisibles, support plus facile |
| P2/P3 — optimisation | Budget RAM/threads, remux compatible, mesures de démarrage/OCR | Gains mesurés sur la charge utile, avec qualité inchangée |

**P0 désigne ici un prérequis de publication, pas la preuve d’une exploitation critique du logiciel installé.** La gravité d’un avis de dépendance et son accessibilité dans ce produit sont deux questions distinctes.

## 3. Parcours complet de l’interface

Les numéros de captures renvoient à la galerie en fin de rapport. Les états ci-dessous couvrent le parcours examiné, y compris les branches d’erreur.

| Étape | Santé | Observation et preuves |
| --- | --- | --- |
| 1. Premier lancement | À améliorer | Présentation cohérente, progression en trois écrans ; images d’aide à synchroniser avec la version. Captures 01, 20, 21 |
| 2. Ajout et liste des fichiers | Bon socle | Glisser-déposer et parcourir lisibles ; tester les imports partiellement invalides et l’identité des fichiers homonymes. 02, 04 |
| 3. Fichiers non pris en charge | Correct avec limites | État explicite ; la variante 320 px n’a pas de débordement horizontal mesuré. Elle ne remplace pas le test du minimum desktop. 11, 12 |
| 4. Choix des formats | Dégradé | Action de lancement partiellement tronquée à 1180×760 et 1440×900 ; réglages qualitatifs absents. 05, 06, 15–17, 25 |
| 5. Lot volumineux | Bon socle | Virtualisation et navigation clavier du rail fonctionnelles ; application aux fichiers compatibles présente. 13, 18 |
| 6. Conversion | À améliorer | État d’activité clair ; pourcentage partiellement artificiel et peu d’explications sur le travail en cours. 07 |
| 7. Erreur et reprise | Dégradé | Réessayer fonctionne dans le scénario simulé, mais la raison de l’échec n’est pas affichée. 08 |
| 8. Résultat et export | Dégradé | Résultat et export accessibles ; la notification finale recouvre « Ouvrir le dossier » et bloque le clic au centre. 09, 19 |
| 9. OCR et copie | Bon rendu, preuve native ouverte | Texte reconnu et copie fonctionnent en simulation. Ressources et vraie inférence installée encore à valider. 10 |
| 10. Paramètres et mise à jour | À améliorer | Langues et état de mise à jour lisibles ; case de notification sans nom accessible et timeout assimilé à une absence de mise à jour. 03, 14, 24 |
| 11. Signalement | À améliorer | Avertissement de publication publique utile ; fermeture imposée après cinq secondes seulement. Aucun signalement envoyé. 22, 23 |

### 3.1 Dix problèmes racines d’interface

Mode better : **full**, application React/TypeScript dans Tauri/Rust, Vite et CSS partagé Vellum Paper. Le site a été examiné dans ses sources et dépendances.

| Domaine | Preuves inspectées | Résultat |
| --- | --- | --- |
| Accessibility | Paramètres, dialogue, annonces, focus et clavier | 2 constats ; validation assistive native à faire |
| Layout | Panneaux, actions, quatre tailles de fenêtre | 2 constats |
| Writing | Résultats, diagnostics, formats, mises à jour | 2 constats |
| Typography | Titres, métadonnées, troncature, noms longs | 1 constat |
| Colors | Thème, accent, états actifs/désactivés | Pas de changement de palette justifié ; contraste non certifié |
| UI | Conversion, reprise, fermeture du signalement | 3 constats |

Les sévérités HIGH/MEDIUM/LOW concernent l’effet sur l’utilisateur. Les localisations sont relatives à la racine du dépôt.

![Actions partiellement coupées dans le panneau de formats à 1440×900](audits/2026-10-29/captures/17-formats-1440x900.png)

Capture 17 : le bouton de lancement dépasse de 16 px sous le bord de la fenêtre.

![Échec simulé sans motif de conversion affiché](audits/2026-10-29/captures/08-erreur-conversion.png)

Capture 08 : le scénario de test fournit un message d’erreur, mais la ligne de résultat ne l’affiche pas.

| ID / gravité | Domaine | Où / preuve | Avant | Après recommandé | Pourquoi |
| --- | --- | --- | --- | --- | --- |
| UI-01 **HIGH** | Layout | `src/styles/formats.css:3`, `foundation.css:68` ; 15–17, 25 | La hauteur calculée du panneau et les parents en overflow hidden coupent 16 px du bas des boutons de 44 px en tailles desktop testées | Grille/flex à hauteur disponible, zone centrale défilante et actions intégralement visibles ; assertion de géométrie et de clic | Le lancement est l’action principale ; il doit rester complètement accessible |
| UI-02 **HIGH** | UI | `src/app/screens/VirtualizedJobList.tsx:57` ; 08 | Une erreur est mémorisée mais la ligne ne montre que « Échec », réessayer et le pourcentage | Raison courte par fichier, détails consultables/copiables, action adaptée à la cause | Réessayer sans comprendre ne permet pas de débloquer un moteur absent, un fichier invalide ou une sortie interdite |
| UI-03 **MEDIUM** | Layout | `src/styles/notices-and-updates.css:1`, `src/App.tsx:98` ; 19 et reçu final | Notification fixe devant le bouton d’ouverture du dossier ; test elementFromPoint négatif | Réserver une zone aux messages ou placer le retour dans le panneau de résultat, sans recouvrement des actions | Le message de succès empêche temporairement l’action suivante |
| UI-04 **MEDIUM** | UI | `src/app/conversion/useConversionWorkflow.ts:48` ; 07 | Progression optimiste incrémentée toutes les 900 ms selon la taille compressée | Progression réelle quand disponible, activité indéterminée sinon ; estimation identifiée comme telle | Le pourcentage doit refléter une information utile, surtout pour de longs PDF/vidéos |
| UI-05 **MEDIUM** | Accessibility | `src/app/settings/SettingsPanel.tsx:149` ; 03 | Le checkbox de notifications n’a ni label textuel effectif ni aria-label/labelledby | Associer directement le contrôle au titre visible et à son aide | Un lecteur d’écran ne peut pas nommer correctement le réglage |
| UI-06 **MEDIUM** | Writing | `src/lib/updateService.ts:102`, `src/hooks/useAppUpdater.ts` ; 14, 24 | Un délai réseau dépassé peut aboutir à « aucune mise à jour » | Distinguer « à jour », « vérification impossible » et « disponible », avec nouvelle tentative | Une absence de réponse n’est pas une réponse négative |
| UI-07 **MEDIUM** | Writing | `src/App.tsx:108`, `src/app/screens/FormatScreen.tsx:214` | Diagnostic initial presque entièrement ignoré ; formats surtout nom + extension | Diagnostic compact des moteurs, motif d’indisponibilité et avertissement de fidélité près du choix concerné | L’utilisateur doit comprendre si la conversion est disponible et quel résultat attendre |
| UI-08 **MEDIUM** | Accessibility | `src/App.tsx:98`, `src/app/components/AppNotices.tsx:5` | Tous les messages disparaissent après 5,2 s et utilisent status/polite | Erreur persistante jusqu’à résolution/fermeture, annonce adaptée ; succès bref sans gêner | Une erreur importante ne doit pas disparaître avant d’avoir été comprise |
| UI-09 **MEDIUM** | UI | `src/app/feedback/FeedbackOverlays.tsx:58` ; 22 | Fermer, annuler et Escape bloqués pendant le compte à rebours | Autoriser immédiatement la sortie ; conserver la confirmation avant l’action publique | L’avertissement utile n’exige pas de retenir l’utilisateur dans une fenêtre |
| UI-10 **LOW** | Typography | `src/app/screens/FormatScreen.tsx:188`, `src/styles/formats.css:79` ; 13 | Noms tronqués dans le rail, sans accès systématique au nom complet au survol/focus | Nom complet dans une aide accessible au clavier, extension et détails stables | Des fichiers homonymes ou longs doivent rester identifiables |

À 940×640, les actions se trouvent initialement sous la fenêtre ; **le défilement les rend accessibles** (`#root.scrollTop = 114`, capture 25). Ce cas n’est donc pas décrit comme un blocage total. La coupure de 16 px aux deux tailles desktop reste reproduite.

### 3.2 Accessibilité, mise en page, écriture, typographie, couleurs, composants

Les six domaines du contrôle better ont été examinés :

- **Accessibilité** : UI-01, 02, 05, 08, 09 ; conserver les vrais boutons, les noms des actions iconiques et le focus visible. Tester ensuite NVDA sur Windows, VoiceOver sur Mac, zoom système/WebView 200 %, contrastes calculés et axe. Le parcours clavier de 35 tabulations dans le rail de 2 000 fichiers a bien défilé jusqu’aux lignes suivantes.
- **Mise en page** : UI-01 et UI-03 dominent. Ne pas changer la navigation en trois étapes. Tester tailles minimales, hauteurs réduites, chaînes allemandes longues, grandes polices et notifications simultanées.
- **Écriture** : expliquer cause, perte éventuelle et prochain geste. Préférer « Conversion terminée avec avertissements » à une réussite ambiguë ; garder les détails techniques dans un volet facultatif.
- **Typographie** : hiérarchie lisible et direction Vellum Paper cohérente ; les petits libellés de métadonnées et la troncature sont les points à vérifier en zoom. Aucun changement de police justifié par cet audit.
- **Couleurs** : conserver l’accent orange et les états explicites. Ne pas déduire un échec WCAG de la seule apparence d’une étape désactivée ; le contraste complet n’a pas été certifié.
- **Composants** : consolider un composant de retour d’erreur et un composant d’action de pied de page. La virtualisation actuelle mérite des tests renforcés, pas une suppression.

L’interface a besoin de corrections ciblées et d’informations de conversion, pas d’une nouvelle identité visuelle.

## 4. Intégrité et orchestration des conversions

| ID / priorité | Constat, preuve et impact | Correction et critère d’acceptation |
| --- | --- | --- |
| CONV-01 P1 | **Code** — `src-tauri/src/converters/text.rs:108–149` : après échec LibreOffice/Pandoc, un repli texte intégré peut produire un format riche ; l’information est essentiellement journalisée. L’utilisateur peut obtenir un document appauvri présenté comme réussi | Introduire résultat réussi / réussi avec avertissements / échoué ; moteur utilisé, repli, pertes attendues. Un échec Office sur un document avec tableau/image doit produire un avertissement explicite ou refuser un repli inadéquat |
| CONV-02 P1 | **Code** — `text.rs:26–43` et `src-tauri/src/ocr/pdf.rs:141` : les avertissements OCR/pages/confiance sont disponibles dans le domaine puis perdus dans le retour de conversion limité au chemin de sortie | Étendre le contrat typé dans `src/lib/api/contracts.ts:62`, transmettre les avertissements utiles à la sortie et aux tests ; aucun texte OCR sensible dans les logs |
| CONV-03 P1 | **Code déterministe** — `src-tauri/src/converters/text/serialize.rs:219–257` : les en-têtes CSV dupliqués deviennent des clés JSON identiques et l’insertion écrase la valeur précédente ; trim modifie les espaces significatifs | Rejeter les doublons avec diagnostic ou proposer un renommage explicite, préserver les valeurs, fixer la politique des lignes irrégulières. Fixture minimale : `name,name\nAlice,Bob` ne doit pas perdre Alice silencieusement |
| CONV-04 P1 | **Risque code** — `useConversionWorkflow.ts:89–136` : garde par état React mais plusieurs await précèdent le passage en conversion | Verrou synchrone de démarrage avant le premier await, libéré en finally ; deux clics avec nettoyage/IPC retardés ne créent qu’un lot |
| CONV-05 P1 | **Code** — état du lot en mémoire, pas de gestion de fermeture trouvée ; nouvelle conversion nettoie les temporaires ; export réussi finalise/nettoie immédiatement | Prévenir avant fermeture/réinitialisation si résultats non exportés, définir le devenir d’un lot actif et permettre une seconde copie de sortie selon le parcours choisi. Ne jamais supprimer le fichier source |
| CONV-06 P2 | **Code** — `src-tauri/src/commands/files.rs:13–32` : collect Result interrompt l’import du groupe à la première description impossible | Import partiel avec liste des refus et motifs ; un fichier inaccessible dans dix n’empêche pas les neuf autres |
| CONV-07 P2 | **Code** — formats sélectionnés sans réglages de conversion exposés ; qualité et paramètres surtout fixes côté moteur | Profils « Compact », « Équilibré », « Fidélité » et options avancées contextuelles ; validation centralisée des paramètres, version des profils et tests par cible |
| CONV-08 P2 | **À valider** — l’utilisateur ne voit pas le bilan qualité/taille avant/après ni les pertes inhérentes à certaines routes | Afficher tailles réelles, moteur, durée, avertissements et « avec/sans perte » uniquement quand démontrable ; la prévision de taille reste une estimation |

Un historique minimal ou une reprise de lot persistante peut venir ensuite, avec consentement, rétention courte et nettoyage. L’audit ne justifie pas de conserver durablement les contenus reconnus ou documents personnels.

## 5. Moteurs : garder la base, préciser les garanties

Versions relevées sur les outils locaux : **FFmpeg 8.1.1 essentials**, **Pandoc 3.9.0.2**, **libvips 8.18.2**, **LibreOffice 26.2.3.2**. Le wrapper PDFium est en **0.4.0** et son manifeste référence **149.0.7825.0** ; cette dernière valeur n’est pas une mesure de version de la DLL.

### 5.1 Audio et vidéo : FFmpeg

**Points solides.** Moteur adapté, vrai suivi via out_time, annulation existante, encodage matériel déjà présent, répartition des threads en lot déjà prise en compte dans certaines routes.

- **ENG-01 P1/P2 — pistes et compatibilité** : les arguments relus ne fixent pas une politique complète avec `-map`. La sélection par défaut peut laisser de côté langues, sous-titres et pièces jointes. Définir « piste principale » ou « préserver toutes les pistes compatibles », puis tester vidéos multilingues, sous-titres, rotation, variable frame rate et HDR. L’audit n’a pas exécuté une fixture native à deux pistes : risque établi, perte non reproduite ici.
- **ENG-02 P2 — qualité CPU/GPU** : `src-tauri/src/converters/media.rs:261` et arguments H264 : GPU à 8 Mbit/s, plafond 12 Mbit/s et audio 192 kbit/s ; CPU CRF 23 et audio 160 kbit/s. Le même choix peut produire des tailles et qualités différentes. Tester réellement la disponibilité de l’encodeur et définir des profils comparables, avec repli annoncé. VideoToolbox peut être évalué sur Mac après mesure ; ne pas présenter l’accélération GPU comme absente aujourd’hui.
- **ENG-03 P2 — remux** : proposer la copie de flux quand codec, conteneur et options sont compatibles. C’est rapide et évite une recompression ; certains changements exigent un vrai réencodage. Référence : [FFmpeg, streamcopy et mapping](https://www.ffmpeg.org/ffmpeg.html).
- **ENG-04 P1 — processus** : `src-tauri/src/converters/media/runner.rs:40` utilise un canal non borné ; certaines sorties sur erreur de lecture n’assurent pas un kill explicite du child. Ajouter propriétaire de processus garantissant l’arrêt, tampon borné, drainage et supervision d’inactivité. Tester annulation, stderr mal formé, encodeur bloqué et disque plein. Ne pas imposer arbitrairement un court timeout à une vidéo légitimement longue.

### 5.2 Documents : LibreOffice, Pandoc, conversions intégrées

LibreOffice et Pandoc se complètent : un rendu bureautique et une conversion structurée ne garantissent pas le même niveau de fidélité.

- **ENG-05 P1 — contrats par route** : documenter et tester ce qui est conservé pour chaque famille : tableaux, styles, notes, images, liens, sauts de page, Unicode, sections et métadonnées. Un fichier ouvrable n’est pas une conversion fidèle.
- **ENG-06 P1 — repli** : traiter CONV-01 avant d’étendre la liste des formats. Les cibles DOCX/ODT/PDF/EPUB ne doivent pas obtenir une promesse de fidélité à partir d’un simple repli texte.
- **ENG-07 P1 — ressources externes** : traiter SEC-01 ci-dessous. Vérifier également liens externes et politiques de macros de LibreOffice avec fixtures inoffensives. Aucun contournement de macros n’est démontré dans cet audit.
- **ENG-08 P2 — représentation tabulaire** : le sérialiseur CSV de texte non tabulaire produit une colonne par ligne ; ne pas présenter cette route comme une conversion universelle JSON/CSV conservant un schéma. Définir une politique de colonnes, tableaux imbriqués et encodage.

Ne pas ajouter un nouveau moteur de documents avant d’avoir mesuré un défaut que les moteurs actuels ne peuvent pas résoudre.

### 5.3 Images : libvips et moteur intégré

- **ENG-09 P1 — corpus de fidélité** : `src-tauri/src/converters/image.rs:41` décode puis écrit, sans application EXIF explicite dans ce chemin ; le chemin libvips relu utilise copy. Définir orientation EXIF, ICC/couleurs, DPI, alpha vers JPEG, profondeur et métadonnées. Tester les deux moteurs sur des images de référence. Ceci ne prouve pas que toutes les sorties sont mal orientées : la parité n’est pas démontrée.
- **ENG-10 P2 — qualité maîtrisée** : exposer qualité JPEG/WebP, profil sans perte et couleur de fond pour une cible sans alpha. Définir les valeurs par défaut, pas une accumulation de curseurs.
- **ENG-11 P2 — mémoire et parallélisme** : intégrer les pixels décompressés et le coût des workers dans le budget de lot. libvips a son propre parallélisme : éviter la multiplication processus × threads. Références : [threads libvips](https://www.libvips.org/API/current/using-threads.html), [autorotation](https://www.libvips.org/API/current/method.Image.autorot.html).

### 5.4 PDF et OCR local

Garder la distinction PDF natif / scanné / mixte. Le projet possède déjà une stratégie de texte natif et de repli OCR ; il faut vérifier ses résultats dans le paquet réellement distribué.

- **OCR-01 P0 — reproductibilité** : `npm run test:ocr:platform-locks` échoue à `scripts/prepare-ocr-platform-locks.mjs:80` pour le verrou de construction Paddle macOS Intel. Régénérer avec méthode documentée, vérifier les hashes et reconstruire ; ne pas assouplir l’assertion.
- **OCR-02 P0 — preuve de livraison** : le dossier local `src-tauri/ocr-resources` de cet audit contient licences/README, pas les archives runtime et modèles nécessaires à une nouvelle inférence. Cela décrit ce checkout ; cela ne démontre pas leur absence dans toutes les anciennes releases. Il faut vérifier le staging, l’installateur et l’exécution hors ligne, sans Python ni modèles installés globalement.
- **OCR-03 P1 — qualité** : corpus français/anglais, accents, rotation, photographie, petits caractères, colonnes, pages vides, scans faibles et PDF mixtes. Mesurer CER/WER et temps/mémoire, pas seulement « texte non vide ». Propager les avertissements de pages et les situations de faible confiance.
- **OCR-04 P2 — coût** : mesurer premier lancement et worker chaud, mémoire selon DPI et nombre de pages ; choisir résolution adaptative sur mesures. Le 220 DPI actuel ne constitue pas à lui seul un optimum universel.
- **OCR-05 P2/P3 — sorties utiles** : TXT et données structurées de reconnaissance ; PDF interrogeable envisageable comme sortie de conversion après étude fidélité/licences. Cela n’implique aucune interface d’édition.

L’audit supply-chain OCR passe : **71 distributions hashées et couverture de licences complète selon le contrôleur**. L’ancienne mention d’une licence bce absente ne doit pas être répétée comme état actuel. Le contrôle de présence n’équivaut pas à une approbation juridique de toute la distribution.

## 6. Sécurité, confidentialité et dépendances

### 6.1 SEC-01 — chargement réseau implicite par Pandoc : reproduit

`src-tauri/src/converters/external.rs:95–120` passe le document et la sortie à Pandoc sans politique d’interdiction réseau visible. Un Markdown synthétique contenant une image HTTP a été converti par le Pandoc local en DOCX, avec les arguments de ce chemin.

**Résultat réel : exit code 0, DOCX créé, requête GET /pixel.png reçue par un serveur sur 127.0.0.1:4191.** Preuve : `preuve-pandoc-reseau.json`. Aucun document personnel ni serveur tiers n’a été utilisé.

Conséquence : un document peut déclencher une connexion à une ressource référencée pendant une conversion. Ce test ne démontre ni vol de fichier ni exécution de code ; il contredit toutefois une interprétation stricte de « conversion locale sans contact réseau implicite ».

**Correction attendue :** politique par défaut sans réseau, ressources locales explicitement préparées dans un périmètre borné, isolation système du processus si nécessaire, avertissement/action volontaire pour tout accès externe. La CSP du WebView ne protège pas les sous-processus natifs. Pandoc fournit un mode sandbox, mais celui-ci a des limites et peut empêcher des images légitimes ; ne pas ajouter un drapeau sans tester la fidélité et les chemins d’autres outils. [Documentation Pandoc du sandbox](https://pandoc.org/MANUAL.html#option--sandbox).

Acceptation : fixtures HTTP, URL locale, image distante, fichier local hors périmètre et documents avec images locales autorisées ; zéro requête implicite et aucune régression cachée de conversion.

### 6.2 SEC-02 — audits de dépendances exécutés ce jour

Les nombres ci-dessous sont des entrées d’outils, à qualifier selon la route et les fonctionnalités réellement compilées. Les rapports bruts sont annexés. Aucun npm audit fix ni changement de lock n’a été appliqué.

| Surface | Résultat actuel | Lecture opérationnelle |
| --- | --- | --- |
| Desktop npm production, omit=dev | **0** vulnérabilité signalée | Bon état de cet arbre npm seulement ; ne couvre pas Rust, binaires ou runtime Python |
| Desktop npm complet | **4 paquets signalés : 2 moderate, 2 high** | Vitest/mocker, source-map-js, Vite. L’outillage de développement/build est concerné ; pas quatre attaques démontrées contre le paquet installé |
| Site npm | **5 paquets : 1 critical, 3 high, 1 moderate** | Next 16.2.12, sharp 0.35.3, nanoid, source-map-js, baseline-browser-mapping ; mise à jour cohérente et rebuild à faire |
| Cargo.lock | **12 occurrences d’avis/paquets, 9 identifiants distincts** | rustls, rustls-webpki, webpki-root-certs, zip ; avertissements supplémentaires de maintenance à trier séparément |
| Python runtime Windows x64 | **66 entrées dans 7 paquets**, 71 dépendances auditées | aiohttp, certifi, filelock, multidict, Pillow, setuptools, urllib3 |
| Python runtime macOS ARM | **66 entrées dans 7 paquets**, 72 dépendances auditées | Même ensemble principal d’avis, pas 66 attaques supplémentaires indépendantes |
| Python runtime macOS Intel | **66 entrées dans 7 paquets**, 71 dépendances auditées | Même qualification nécessaire |
| Python runtime Linux x64 | **66 entrées dans 7 paquets**, 71 dépendances auditées | Même qualification nécessaire |
| Construction Paddle macOS Intel | **42 entrées dans 3 paquets**, 16 dépendances auditées | certifi, Pillow, setuptools ; séparer build et runtime |

**Rust.** rustls 0.23.45 est signalé par RUSTSEC-2026-0346/0347/0348/0349 ; versions corrigées indiquées à partir de 0.23.46. rustls-webpki 0.103.15 : RUSTSEC-2026-0382, correctif à partir de 0.103.16. webpki-root-certs 1.0.8 : RUSTSEC-2026-0383, à partir de 1.0.10. zip 4.6.1 et 8.6.0 apparaissent tous deux pour RUSTSEC-2026-0367/0368/0369, correctifs indiqués à partir de 9.0.0.

L’avis Brotli rustls concerne une fonctionnalité **non activée par défaut** ; son activation n’a pas été prouvée ici. [Avis RustSec](https://rustsec.org/advisories/RUSTSEC-2026-0348.html). Les chemins ZipArchive.extract/ZipStreamReader visés par plusieurs avis n’ont pas été trouvés dans les sources du projet ; l’extraction maison vérifie les chemins, rejette les liens et borne les ressources. Conserver ces protections, établir l’accessibilité exacte et mettre à jour sans ajouter une exclusion d’audit non autorisée.

**Python.** Répartition des 66 entrées par runtime : Pillow 39, filelock 12, aiohttp 8, urllib3 3, certifi 2, multidict 1, setuptools 1. Certains identifiants se recouvrent ou ont des alias. Le fonctionnement hors ligne réduit l’exposition de bibliothèques réseau ; il ne neutralise pas les parseurs d’images non fiables. Reconstituer les runtimes verrouillés après qualification, puis revalider Paddle, modèles, hashes et licences. Ne pas faire une mise à jour pip opportuniste au lancement.

**Site.** L’export Next est statique et les images sont unoptimized : ne pas annoncer une RCE serveur publiquement exploitable sur cette seule base. Les versions suggérées par l’audit incluent Next 16.4.3 ; l’override sharp doit être revu avec lui. Refaire compilation statique et tests. [Limites des exports statiques Next](https://nextjs.org/docs/app/guides/static-exports), [avis de sécurité Next](https://github.com/vercel/next.js/security/advisories).

### 6.3 Autres durcissements ciblés

| ID / priorité | Constat | Résultat attendu |
| --- | --- | --- |
| SEC-03 P1 | `src-tauri/src/runtime_log.rs:21` écrit en append sans rotation visible ; le masquage garde les noms et les erreurs d’outils peuvent inclure des chemins | Rotation/taille/rétention bornées, erreurs nettoyées, export de diagnostic explicite et sans contenu OCR par défaut |
| SEC-04 P1 | FFmpeg natif et autres moteurs lisent des données non fiables avec les droits du compte | Revue des protocoles/ressources acceptés, limites d’entrée, privilèges et confinement adapté par moteur ; corpus de fichiers corrompus. Ne pas prétendre qu’une CSP suffit |
| SEC-05 P1/P2 | Capabilities Tauri et dépendances natives restent une surface distincte du frontend | Revue de moindre privilège et tests des chemins autorisés à chaque nouveau paramètre/moteur ; aucune extension générale de droits pour faciliter un test |
| SEC-06 P2 | Actions CI par tags et toolchains mobiles dans les workflows | Versions/outils reproductibles, références d’actions par commit, mise à jour maîtrisée et provenance des artefacts |

Points positifs observés : séparation des sources et sorties, gestion contrôlée des temporaires/exports, contrôles de chemins et d’archives, annulation, contrats natifs typés, OCR prévu local, vérifications de hashes/licences, scan de secrets et configuration production. Les permissions Tauri sont un mécanisme à maintenir explicitement. [Documentation officielle](https://v2.tauri.app/security/permissions/).

Il ne s’agit pas d’une preuve formelle d’absence de vulnérabilité Rust/Python, ni d’un pentest exhaustif de tous les binaires embarqués.

## 7. Performance, poids et coût réel

### 7.1 PERF-01 — anciens artefacts d’éditeur dans dist : confirmé

Le code et la navigation d’éditeur ont été retirés. Cependant le `dist` local contient encore des chunks `EditorWorkspace-*`, `editor-vendor-*`, `docxGeneration.worker-*` et `sanitizer-vendor-*` d’anciens builds.

| Mesure | Valeur | Portée |
| --- | --- | --- |
| dist local existant | 20 fichiers, 3 658 930 octets | Mélange de générations ; l’index actuel n’appelle pas ces anciens chunks |
| Assets du dist existant | 3 656 906 octets | Mesure du répertoire, pas des octets réellement chargés |
| Assets de la nouvelle preview propre | 506 045 octets | Nouvelle compilation dans un autre dossier ; ce n’est pas un installateur production |
| Principaux fichiers de cette preview | app 207 736 ; React 189 637 ; CSS 67 412 ; marked 41 174 octets | Tailles brutes, ni gzip ni durée de chargement |

Cela **ne réactive pas l’éditeur**. Cela indique un défaut de propreté des sorties et un risque d’embarquer des fichiers inutiles si tout frontendDist est distribué. Refaire une production dans un dossier propre, inspecter l’artefact final et mesurer le graphe complet des ressources initiales.

Le budget de `scripts/measure-phase-6.mjs` compte tous les fichiers de dist, mais sa mesure initiale ne couvre pas tout le graphe de préchargement. Nettoyer la base puis comptabiliser scripts, modulepreloads et styles ; ne pas comparer une preview propre à un ancien dist mélangé en annonçant un gain de performance produit.

### 7.2 PERF-02 — volume des moteurs

| Contenu du checkout mesuré | Fichiers | Octets |
| --- | --- | --- |
| Moteurs décompressés sous bundled-engines | 19 617 | 1 785 064 249 |
| Archives de moteurs | 2 | 483 796 376 |
| Sidecars | 2 | 202 708 992 |

Ces répertoires peuvent représenter plusieurs étapes de développement. **Leur somme n’est pas la taille de l’installateur.** Mesurer séparément téléchargement, installation, extraction au premier usage, disque après premier lancement et données temporaires.

Ne pas retirer un moteur nécessaire juste pour alléger le dépôt. Étudier compression, staging sélectif et duplication seulement sur l’artefact réellement livré. Les téléchargements de modèles à l’exécution restent hors périmètre autorisé.

### 7.3 PERF-03 — ordonnanceur et mesures à établir

`src/app/conversion/model.ts:333–344` choisit la concurrence notamment par CPU et taille compressée ; ce n’est pas un budget de mémoire décodée. Combiner slots par moteur, pixels/pages, RAM disponible, nombre de threads internes et coût de démarrage Office/OCR.

Pour chaque profil, mesurer sur un corpus versionné :

1. démarrage de l’application, premier moteur froid et deuxième conversion chaude ;
2. débit de lots homogènes/mélangés, latence d’un petit fichier derrière un gros ;
3. pic mémoire, occupation CPU/GPU, disque temporaire et nettoyage ;
4. coût OCR par page et résolution ;
5. taille de sortie et fidélité, afin d’éviter un gain obtenu en dégradant le résultat.

Pas de pourcentage de gain annoncé sans comparaison reproductible. La virtualisation et les limites de threads existantes sont à conserver. Un worker chaud, un cache ou une déduplication ne se justifient qu’après mesure et avec une politique de confidentialité.

## 8. Distribution, CI, licences et maintenance

| ID / priorité | Constat et limites | Travail à faire |
| --- | --- | --- |
| REL-01 P0 | Le wrapper PDFium source 0.4.0 et les artefacts/manifeste déjà embarqués ne forment pas encore une nouvelle livraison publiée cohérente | Rebuild approuvé, versions/hashes/licences alignés, tests du vrai wrapper livré ; le mode local unpublished ne doit pas devenir une preuve CI/release |
| REL-02 P0 | Pas de nouveau passage complet de la chaîne de publication ni d’acceptation installée multi-plateforme dans cet audit | Relancer la chaîne canonique après les changements de sécurité/locks, puis scénarios Windows installés, Mac universel et Linux AppImage sur leurs vrais hôtes |
| REL-03 P1 | Versions de plusieurs entrées de moteurs décrites comme compatible | Consigner version upstream réelle, source, hash, options de compilation et empreinte de capacités ; rendre ce diagnostic consultable |
| REL-04 P1 | FFmpeg local annonce --enable-gpl --enable-version3 | Vérifier notices, textes de licence, provenance et obligations de distribution de cette compilation et des autres moteurs ; audit de conformité à mener sur le paquet final, pas avis juridique ici |
| REL-05 P1 | Jobs sur push codex/test conditionnés par MC_ENABLE_CODEX_TEST_BUILD=1 dans build.yml | Vérifier la variable réelle côté dépôt/serveur et un run associé au commit ; pas de conclusion « CI verte » à partir du YAML |
| REL-06 P1 | audit:python existe ; intégration au gate principal non établie ; son script s’arrête au premier lock en erreur | Auditer tous les locks même en présence d’un échec, agréger les résultats, intégrer au gate avec triage et preuve de provenance |
| REL-07 P2 | Images/mocks/docs présentent des versions et capacités historiques | Synchroniser fixtures, architecture, commandes et périmètre sans réécrire les preuves historiques |

La signature de mise à jour, la signature de code Windows et la notarisation Apple ne sont pas interchangeables. Conserver le chemin macOS gratuit/ad-hoc prévu si aucun certificat Apple n’est fourni, avec les limites Gatekeeper correctement expliquées. Ne pas ajouter une obligation de compte payant à partir de cet audit.

### Dérives documentaires précises

- `docs/ARCHITECTURE.md:57` parle encore de **35 commandes**, alors que le contrôle actuel en compte **19**.
- PLAN/VALIDATION conservent le nom de la branche d’implémentation `codex/remove-file-editor` ; la branche d’intégration vérifiée est `codex/test`. Garder l’historique mais nommer clairement l’état courant.
- `site/app/documentation/page.tsx:50` recommande `npm run validate:bundled-base-engines`, commande absente ; la commande disponible est `validate:bundled-engines`.
- La même page décrit encore une extension « Maximum Quality » optionnelle ; vérifier cette présentation face au paquet réellement distribué.
- Les textes anglais du site gardent des éléments Windows-only alors que la baseline documentée couvre trois plateformes ; aligner les promesses publiques sur chaque release réellement disponible.
- `src/lib/api/previewFixtures.ts:37` classe .mp4 et .png de façon spéciale puis beaucoup d’autres exemples comme documents, et fixe une taille commune d’environ 41 Mo. Les simulations ne représentent pas correctement MOV, WAV et petits textes.
- La version 1.0.4 visible dans certaines captures de paramètres vient du mock ; la métadonnée native vérifiée reste 1.0.7. Corriger le mock, ne pas diagnostiquer une version native erronée à partir de cette capture.

## 9. Couverture de tests et preuves nouvelles

### 9.1 Exécuté pendant cet audit

| Vérification | Résultat | Ce que cela démontre |
| --- | --- | --- |
| typecheck applicatif et typecheck tests | PASS | Cohérence TypeScript des surfaces contrôlées |
| build:frontend:preview, dossier neuf | PASS | Frontend actuel compilable ; typecheck inclus |
| test:source-structure | PASS | 252 fichiers manuels contrôlés ; 26 au-dessus de la cible 300 lignes, maximum autorisé 500 respecté |
| test:rust-contracts | PASS | 19 commandes natives typées, 2 événements |
| test:production-config | PASS | Contrat de configuration de production |
| test:secret-leaks | PASS | Aucun motif bloquant du scan, pas une preuve exhaustive d’absence de secret |
| test:repository-metadata | PASS | Métadonnées attendues |
| test:unit | **47 tests passés** | Suite unitaire frontend, 3 fichiers |
| test:rust | **148 passés, 7 ignorés volontairement** | Suite Rust actuelle ; ne pas compter les ignorés comme réussites |
| test:conversions | **6 passés** | Matrice synthétique intégrée images/documents/FFmpeg ; 31,15 s après compilation |
| test:ocr:platform-locks | **FAIL** | Reproductibilité Paddle macOS Intel encore bloquée |
| node scripts/audit-ocr-runtime.mjs | PASS | 71 distributions hashées, licences présentes selon le contrôleur |
| Parcours Chromium personnalisés | PASS technique, défauts visuels détectés | 25 captures, clavier du rail, OCR/copier simulés, reprise/export simulés ; pas d’erreur console dans les reçus |
| Pandoc natif + serveur local | Chargement HTTP confirmé | Requête réseau d’une ressource incorporée ; fixture synthétique |
| Audits npm/Cargo/Python | Alertes | Rapports bruts associés, qualification section 6 |

La compilation preview a utilisé `--configLoader native` pour éviter une écriture de cache Vite interdite dans le sandbox. Le navigateur a utilisé le Chromium de test installé, un serveur 127.0.0.1 et les données fictives. Les permissions d’exécution demandées pour ces commandes ont servi aux tests locaux ; aucune publication ni installation de dépendances n’a été effectuée.

Les noms de scripts du tableau correspondent aux commandes npm run correspondantes ; les typechecks sont typecheck et typecheck:tests. La compilation exacte de preview est `npm run build:frontend:preview -- --configLoader native --outDir <dossier-neuf>/preview`. Les audits sont npm audit --json, npm audit --omit=dev --json, npm --prefix site audit --json, cargo audit --json dans src-tauri, et pip-audit sur chaque lock séparément. Un avis détecté peut faire échouer ces commandes ; voir les résultats et logs.

### 9.2 Ne pas attribuer à cet audit

- Passage complet du gate Windows 18/18, acceptation installée des 66 scénarios converter/OCR/installer, build NSIS propre.
- Inférence PP-OCRv6 réelle dans une application fraîchement installée.
- Validation native de Mac Intel, Apple Silicon, DMG universel, Linux ou AppImage.
- Certification de fidélité Office/PDF, ICC/HDR/pistes, ni résultat de benchmark produit complet.
- Nouveau passage de la suite Playwright officielle entière ou de toutes les analyses Rust : les résultats historiques du ledger restent datés.
- Vérification des variables GitHub, état des checks distants, version effectivement servie par le site public, signature des futurs installateurs.

### 9.3 Tests à ajouter en priorité

1. **Contrats de résultat** : avertissement de repli, perte de fidélité, erreur affichée et copie du diagnostic sans contenu sensible.
2. **Intégrité** : CSV à colonnes dupliquées/espaces, caractères multilingues, lignes irrégulières ; document Office avec image/tableau.
3. **Réseau** : ressources externes bloquées et images locales autorisées ; absence d’accès implicite.
4. **Interface** : rectangles et hit-tests des actions à 1180×760, 1440×900, 940×640, zoom 200 % ; notification présente lors du clic.
5. **Course/fermeture** : double clic avec IPC lent, annulation, fermeture en cours et résultats non exportés.
6. **Médias/images** : pistes multiples, sous-titres, EXIF/ICC/alpha, VFR/HDR selon les garanties annoncées.
7. **OCR installé** : hors ligne, modèles locaux, pages vides/mélangées, Unicode, gros PDF, annulation et mémoire.
8. **Robustesse** : fichier corrompu, espace disque insuffisant, chemin long, accès refusé, processus silencieux/gelé et nettoyage après crash.

Les six tests de conversion passent, mais ne couvrent pas à eux seuls ces propriétés. Les tests UI limités au débordement horizontal ont laissé passer la coupure verticale des actions : tester la tâche réellement accomplie.

## 10. Améliorations et innovations utiles

À traiter après les défauts P0/P1 ; aucune ne demande un éditeur ou un service cloud.

| Proposition | Valeur concrète | Conditions |
| --- | --- | --- |
| Trois profils de sortie et favoris locaux | Choisir simplement entre poids, équilibre et fidélité | Paramètres explicites par moteur, migration/version des profils, tests de taille/qualité |
| Remux automatique quand compatible | Conversion très rapide sans recompression inutile | Vérifier codecs/conteneur/pistes ; repli compréhensible |
| Cible de taille pour vidéo/images | « Obtenir environ 10 Mo » plutôt qu’un débit technique | Estimation honnête, tolérance affichée, limites expliquées |
| Résumé avant lancement | Indiquer pertes probables, pistes conservées, moteur et destination | Quelques informations décisives, détails à la demande |
| Bilan après conversion | Comparer poids, durée, avertissements, moteur et paramètres | Pas de promesse « sans perte » sans contrat vérifié |
| Dossier source + règles de lot | Convertir de nombreuses arborescences avec nommage reproductible | Le drop de dossier et l’application groupée existent déjà ; ajouter un sélecteur de dossier et règles sans doublonner |
| Reprise minimale après incident | Retrouver chemins/réglages et sorties non exportées | Consentement/rétention locale ; préserver la vie privée ; nettoyage contrôlé |
| OCR avec confiance et exports structurés | Identifier une reconnaissance incertaine et exploiter le texte ailleurs | Indicateurs validés, langue/résolution utiles, aucun entraînement ou transfert de contenu |
| Manifeste local de conversion | Reproduire une opération avec versions, paramètres et hashes facultatifs | Sans contenu ni chemins privés par défaut ; partager seulement à l’initiative de l’utilisateur |
| Surveillance de dossier facultative | Automatiser un besoin récurrent de conversion | Dernière priorité : anti-boucle, écriture stable, limites de charge, arrêt visible, aucun lancement implicite |

Éviter pour l’instant une « IA » générique, une dizaine de nouveaux moteurs, une boutique d’extensions ou une bibliothèque documentaire. La différenciation la plus crédible est une conversion locale fiable, explicable et rapide.

## 11. Plan d’exécution recommandé

Les tailles S/M/L sont des ordres de complexité relatifs, pas des délais promis. Chaque lot doit garder ses preuves distinctes des autres.

| Lot | Contenu | Taille | Dépendance / sortie mesurable |
| --- | --- | --- | --- |
| A — assainir la livraison | Triage/mises à jour dépendances, lock OCR Intel, provenance PDFium et nettoyage build | L | Premier ; audits maîtrisés, locks reproductibles, artefacts propres |
| B — préserver confidentialité et données | SEC-01, CONV-01/02/03, contrat de résultat enrichi | L | Réseau borné, aucune perte CSV silencieuse, avertissements de repli visibles |
| C — réparer le parcours | UI-01/02/03/05/06/08/09, verrou de démarrage, protection résultats | M | Géométrie et clics prouvés, nom accessible, erreur exploitable, pas de double lot |
| D — vérifier les moteurs | Corpus documentaire, image, pistes, OCR ; supervision de processus | L | Contrats de fidélité par route et vrai OCR sur hôtes cibles |
| E — qualité et performance | Profils, diagnostic, budget mémoire/threads, remux puis benchmarks | L | Résultats comparables, consommation bornée, gains mesurés |
| F — accepter la release | Gate canonique complet, paquets installés Windows/Mac/Linux, licences et documentation | L | Toutes preuves datées sur les artefacts à distribuer ; décision de publication séparée |

B et C peuvent progresser indépendamment une fois le contrat de résultat convenu. Une mise à jour d’un lock ou d’un moteur invalide les preuves qui dépendent de cet artefact : rerun ciblé puis chaîne de publication complète. Ne pas marquer un lot terminé sur des mocks seulement.

## 12. Points examinés et volontairement non retenus comme défauts

| Localisation | Candidat examiné | Pourquoi écarté |
| --- | --- | --- |
| Rail de formats, captures 13/18, clavier | Supprimer la virtualisation parce qu’elle casserait le clavier | Les 35 tabulations font avancer et défiler le focus malgré une dizaine de lignes montées pour 2 000 fichiers |
| FormatScreen, capture 18 | Ajouter une application du format au lot qui serait absente | Le bouton « Appliquer aux fichiers compatibles » existe après sélection |
| Résultats, capture 08 | Considérer « 100 % avec échec » comme faux dans tous les cas | Toutes les tentatives peuvent être terminées ; le défaut est la cause invisible et l’estimation non distinguée |
| Thème Vellum Paper, captures 02/05 | Refaire toute la palette à cause d’une étape désactivée grise | Identité cohérente ; cet état seul ne démontre pas une violation de contraste |
| Moteurs locaux et matrice | Remplacer tous les moteurs par de nouveaux moteurs | FFmpeg, LibreOffice, Pandoc et libvips sont adaptés ; contrats, isolation et preuves sont prioritaires |

## 13. Galerie et annexes de preuve

Toutes les images ci-dessous correspondent à la compilation actuelle en mode simulation. Les versions 9.9.9 / 1.0.4, tailles de fichiers et textes OCR y sont des fixtures.

### Capture 01 — Premier lancement

![Premier lancement](audits/2026-10-29/captures/01-accueil.png)

Accueil cohérent ; premier écran d’aide inspecté. Validation native de premier lancement séparée.

### Capture 02 — Ajout de fichiers

![Ajout de fichiers](audits/2026-10-29/captures/02-fichiers-vides.png)

Ajout lisible ; état vide clairement identifié.

### Capture 03 — Paramètres

![Paramètres](audits/2026-10-29/captures/03-parametres.png)

Paramètres lisibles ; le contrôle de notification manque de nom accessible (UI-05).

### Capture 04 — Lot importé

![Lot importé](audits/2026-10-29/captures/04-lot-importe.png)

Lot simulé importé ; noms, extensions et catégories visibles.

### Capture 05 — Choix des formats

![Choix des formats](audits/2026-10-29/captures/05-formats.png)

Choix des formats ; vérifier les actions en bas de fenêtre (UI-01).

### Capture 06 — Cible sélectionnée

![Cible sélectionnée](audits/2026-10-29/captures/06-format-selectionne.png)

Cible sélectionnée ; paramètres de qualité non exposés (CONV-07).

### Capture 07 — Conversion simulée

![Conversion simulée](audits/2026-10-29/captures/07-conversion-en-cours.png)

Conversion simulée ; distinguer progression réelle et estimation (UI-04).

### Capture 08 — Échec sans raison affichée

![Échec sans raison affichée](audits/2026-10-29/captures/08-erreur-conversion.png)

Échec simulé ; la cause fournie par le scénario n’est pas rendue (UI-02).

### Capture 09 — Résultat

![Résultat](audits/2026-10-29/captures/09-conversion-terminee.png)

Tâches terminées ; cet écran ne démontre pas un export natif.

### Capture 10 — OCR et copie simulés

![OCR et copie simulés](audits/2026-10-29/captures/10-ocr-resultat.png)

OCR et copie vérifiés sur un résultat fictif ; vraie inférence encore ouverte.

### Capture 11 — Fichiers non pris en charge

![Fichiers non pris en charge](audits/2026-10-29/captures/11-formats-non-pris-en-charge.png)

État de formats non pris en charge inspecté.

### Capture 12 — Variante 320 px

![Variante 320 px](audits/2026-10-29/captures/12-mobile-320.png)

320 px sans débordement horizontal mesuré ; test complémentaire, pas une promesse mobile.

### Capture 13 — Lot de 2 000 fichiers

![Lot de 2 000 fichiers](audits/2026-10-29/captures/13-grand-lot.png)

Rail stabilisé de 2 000 fichiers ; virtualisation et progression du focus vérifiées.

### Capture 14 — Mise à jour fictive

![Mise à jour fictive](audits/2026-10-29/captures/14-mise-a-jour.png)

Mise à jour 9.9.9 simulée ; aucun téléchargement réel.

### Capture 15 — Actions coupées à 1180×760

![Actions coupées à 1180×760](audits/2026-10-29/captures/15-formats-1180x760.png)

Actions tronquées à 1180×760 ; défaut de hauteur reproduit.

### Capture 16 — Taille minimum avant défilement

![Taille minimum avant défilement](audits/2026-10-29/captures/16-formats-940x640.png)

Actions sous la fenêtre à 940×640 avant défilement ; voir capture 25.

### Capture 17 — Actions coupées à 1440×900

![Actions coupées à 1440×900](audits/2026-10-29/captures/17-formats-1440x900.png)

Actions coupées à 1440×900 ; 16 px hors de la fenêtre.

### Capture 18 — Application aux fichiers compatibles

![Application aux fichiers compatibles](audits/2026-10-29/captures/18-application-lot.png)

Application au lot présente ; rail volontairement défilé pendant le test clavier.

### Capture 19 — Notification devant l’action suivante

![Notification devant l’action suivante](audits/2026-10-29/captures/19-export.png)

Notification devant « Ouvrir le dossier » ; interception du clic confirmée.

### Capture 20 — Aide : paramètres

![Aide : paramètres](audits/2026-10-29/captures/20-accueil-parametres.png)

Deuxième écran d’aide ; illustration avec une version historique à synchroniser.

### Capture 21 — Aide : démarrer

![Aide : démarrer](audits/2026-10-29/captures/21-accueil-fin.png)

Dernier écran d’aide ; sortie vers le convertisseur claire.

### Capture 22 — Avertissement public et délai

![Avertissement public et délai](audits/2026-10-29/captures/22-confidentialite-signalement.png)

Avertissement public utile ; fermeture et annulation temporairement bloquées.

### Capture 23 — Choix de signalement

![Choix de signalement](audits/2026-10-29/captures/23-signalement.png)

Choix de signalement inspecté ; aucune issue ni aucun message envoyés.

### Capture 24 — Paramètres et mise à jour fictive

![Paramètres et mise à jour fictive](audits/2026-10-29/captures/24-parametres-mise-a-jour.png)

Mise à jour simulée ; 1.0.4 et 9.9.9 viennent des fixtures.

### Capture 25 — Actions accessibles après défilement

![Actions accessibles après défilement](audits/2026-10-29/captures/25-formats-min-apres-defilement.png)

Le défilement rend les actions accessibles à la taille minimum ; pas de blocage total.

Annexes machine dans [audits/2026-10-29](audits/2026-10-29/) :

- `preuves-interface{,-supplement,-annexes,-final}.json` : parcours, géométrie, erreurs, clavier et hit-test.
- `preuve-pandoc-reseau.json` : exécution native Pandoc et requête locale.
- `npm-audit.json`, `npm-audit-production.json`, `npm-audit-site.json`, `cargo-audit.json`.
- `python-windows-x64.json`, `python-macos-aarch64.json`, `python-macos-x86_64.json`, `python-linux-x64.json`, `python-paddle-build-macos-x86_64.json`.
- Logs unitaires, Rust, conversions, verrous OCR et supply-chain OCR ; scripts de reproduction UI/Pandoc, à adapter au chemin du checkout local.

**Conclusion de décision : Block.** Lever d’abord les risques de publication, les pertes silencieuses et les défauts du parcours ; conserver l’architecture de convertisseur/OCR et son identité visuelle. Toute décision ultérieure de mise en production doit s’appuyer sur les paquets et hôtes réels.

**Block**
