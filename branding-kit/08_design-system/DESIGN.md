---
name: Multi-Converter
category: Productivity & Utilities
surface: web
description: Papier quadrillé discret, titres sans-serif denses, cartes arrondies et ombres décalées. Clair orange, sombre vert.
colors:
  background: '#f5f3ec'
  foreground: '#1d241f'
  accent: '#c86a34'
  secondary: '#4d8445'
  night: '#111710'
---

# Multi-Converter

## 1. Identité et intention

Multi-Converter est un convertisseur local de documents, images, audio et vidéo,
avec OCR local pour les images et PDF. L'identité vient du kit de marque et des
références visuelles validées par le mainteneur le 30 octobre 2026 : papier
chaud légèrement quadrillé, titres sans-serif très gras, panneaux arrondis,
boutons solides et petites ombres décalées. Le rendu est concret, accueillant,
net et légèrement imparfait de manière maîtrisée.

Les grands titres sont francs et denses. Les paragraphes restent calmes. Les
grilles et traits portent la personnalité ; les textes ne deviennent ni
manuscrits ni éditoriaux en serif. Éviter le verre dépoli, le néon, les halos,
les dégradés envahissants et les cartes de tableau de bord sans utilité.

Public : particuliers et professionnels qui veulent convertir un fichier ou
un lot sans connaître les moteurs. Les objectifs sont une action suivante
immédiatement identifiable et une reprise compréhensible après un échec.
Aucune métrique d'usage mesurée n'est inventée dans ce système.

## 2. Deux modes, une même famille

| Rôle | Clair | Sombre |
| --- | --- | --- |
| Nuance de référence et action | `#C86A34` | `#4D8445` |
| Fond quadrillé | `#F5F3EC` | `#111710` |
| Papier / panneau | `#FFFDF7` | `#1B2419` |
| Surface secondaire | `#FFFAF0` | `#243020` |
| Texte principal | `#1D241F` | `#EEF2E8` |
| Texte secondaire | `#34423B` | `#D0DAC9` |
| Texte atténué | `#596253` | `#B1BEA9` |
| Lien / accent lisible | `#9D461C` | `#A3D294` |
| Bordure de panneau | `#DED9CC` | `#3D4B37` |
| Bordure de contrôle | `#777F73` | `#8A9C80` |
| Texte sur action de référence | `#0B100A` | `#000000` |

Les deux nuances fournies restent exactes. Les variantes de survol, fonds
doux, liens et focus dérivent de ces ancres. Le texte blanc sur les boutons
compacts orange ou vert n'atteint pas 4,5:1 : le libellé est donc sombre et
très gras. Les couleurs de référence ne servent pas seules à un petit texte
de lien ; utiliser les nuances lisibles. Le mode sombre garde le quadrillage,
les proportions et les ombres, avec des surfaces vertes très désaturées.

Une couleur d'état associe toujours icône et texte. Succès : vert profond sur
vert pâle en clair, vert clair sur vert sombre la nuit. Avertissement : ocre.
Erreur : rouille. Ne pas confondre une sélection verte du mode sombre avec un
succès : le libellé et l'icône portent la distinction.

## 3. Logo et graphisme

Le pictogramme existant reste la référence : carré papier légèrement décalé,
croix encre et point orange. `assets/logo.svg` est une copie du logo embarqué.
`assets/logo-dark.svg` conserve le dessin et remplace seulement le point par
la nuance verte validée. La variante verte historique reste disponible dans
les sources ; elle n'impose pas sa teinte au nouveau mode sombre.

Le quadrillage est un SVG local répétable, très discret et légèrement ondulé.
Il n'anime pas en permanence, ne diminue pas la lisibilité et n'occupe pas les
zones de texte OCR. Les ombres se décalent de 2 à 4 px ; les panneaux importants
peuvent ajouter une ombre douce courte. La rotation reste réservée au logo ou
à un détail décoratif, jamais aux paragraphes ni aux contrôles.

## 4. Typographie

Pile sans-serif locale : `ui-sans-serif, system-ui, -apple-system,
BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`. Aucune police distante
n'est nécessaire. Aucun fichier de fonte n'est annoncé comme embarqué.

| Usage | Taille | Graisse | Interligne |
| --- | --- | --- | --- |
| Grand titre de présentation | 44–100 px, adaptatif | 900–950 | 0,98–1,04 |
| Titre de section | 28–48 px | 850–950 | 1,04–1,12 |
| Titre produit / dialogue | 20–28 px | 800–900 | 1,2–1,3 |
| Texte de lecture | 16 px | 400–500 | 1,6 |
| Contrôle | 14–16 px | 700–850 | 1,4 |
| Libellé / métadonnée | 12–14 px | 500–800 | 1,4 |

Les titres utilisent un suivi serré, environ -0,035 à -0,055 em. Le corps
garde un espacement normal. Les annotations sont courtes ; pas de capitales
à espacement excessif. Les nombres de progression sont tabulaires.

## 5. Espacement, formes et mise en page

Base de 4 px : 4, 8, 12, 16, 20, 24, 32, 48 et 64 px. Un groupe de contrôles
garde 8–12 px ; une carte contient 20–28 px ; deux sections sont séparées de
36–64 px selon la largeur. Les marges se réduisent avant les informations.

Rayons : 8 px pour un détail, 12 px pour un contrôle, 18 px pour une carte,
26 px pour un grand panneau. Les filtres et étapes peuvent être en pilule.
Une cible activable mesure au moins 44 px dans le catalogue. Les contours des
champs restent plus contrastés que les séparations décoratives de panneaux.

Le site et les présentations peuvent utiliser une barre flottante arrondie et
des grands titres centrés, comme les références. L'application garde une
composition de travail plus dense, avec étapes et actions accessibles. Le
même système de couleurs, boutons, formes et statuts relie les deux usages.

## 6. Composants et états

| Composant | Contrat |
| --- | --- |
| Bouton principal | Orange en clair, vert en sombre, libellé sombre contrasté, ombre décalée ; une action dominante par groupe |
| Bouton secondaire | Papier du thème, bordure lisible, libellé fort ; danger identifié par un texte et une couleur fonctionnelle |
| Champ et menu | Libellé visible, aide associée, valeur actuelle lisible ; erreur liée au champ |
| Carte fichier | Nom, format, taille, état et réglages associés ; noms longs et traductions préservés |
| Étapes | Fichiers, Formats, Conversion ; actuelle, terminée, à venir ; retour possible selon l'état |
| Format et qualité | Cible compatible ; profils Compact, Équilibré, Archivage ; poids/fidélité expliqués sans poids promis |
| Progression | Attente, traitement, annulation demandée, réussite, annulation confirmée et échec distincts |
| Résultat | Export et conversion sont deux étapes distinctes ; garder les réussites d'un lot partiel |
| OCR | Texte sélectionnable, copie confirmée seulement après succès, annulation et erreur récupérable |
| Dialogue | Titre, conséquence, action sûre focalisée et restauration du focus ; fermeture clavier cohérente |
| Réglages | Préférences lisibles, récupération facultative et conservation annoncée |
| Alerte | Cause compréhensible, conséquence et prochaine action ; jamais la couleur seule |

Chaque contrôle possède repos, survol, focus, appuyé et indisponible. Le
chargement conserve sa géométrie. Le focus fait 2 px avec un décalage de 3 px.
Un bouton d'icône seul a un nom accessible et une aide au focus/survol.

## 7. Parcours de conversion et OCR

Fichiers → Formats → Conversion. Importer partiellement conserve les fichiers
acceptés et explique les refus. Le lot applique des cibles compatibles et
autorise des réglages individuels. Copier les flux masque les profils de
réencodage et refuse explicitement un conteneur incompatible.

Une perte possible est nommée : animation, pages, profil couleur, profondeur ou
métadonnées. Les sources restent intactes. Un résultat réussi et un export
échoué sont deux états différents. Réessayer porte sur les échecs utiles.
L'OCR reste local et ne promet pas une lecture parfaite des colonnes complexes.
Les moteurs et traces ne sont montrés que s'ils aident une décision.

## 8. Accessibilité, adaptation et mouvement

Objectif WCAG 2.2 AA : au moins 4,5:1 pour le texte courant, 3:1 pour le grand
texte et les indicateurs essentiels. Vérifier les couples réels dans chaque
mode, les noms longs, les traductions et le zoom à 200 %.

Contrôler 320 et 375 px pour le catalogue, puis 768, 1024 et 1440 px. En largeur
réduite, le menu se replie, les cartes s'empilent et le pied d'action reste
atteignable. La barre d'étapes ne masque ni le libellé ni le focus.

Survol : 140 ms ; changement de panneau : 210 ms. Priorité à l'opacité et aux
transformations. Respecter `prefers-reduced-motion`. Le thème suit la préférence
système au premier usage et peut être choisi explicitement. Le catalogue ne
modifie pas les préférences de l'application de conversion.

## 9. Rédaction et sources

Ton direct, calme, utile : « Convertir 3 fichiers », « Copier le texte »,
« Choisir un dossier », « Réessayer ». Une erreur donne une prochaine action.
La démonstration utilise des fichiers fictifs et l'annonce : aucun moteur de
conversion ni OCR n'est exécuté par le catalogue.

Sources : kit de marque versionné, guide typographique, styles du site et
captures fournies par le mainteneur. Les ancres clair/sombre sont explicitement
validées le 30 octobre 2026. `tokens.css` est la source compilée ; les index
JSON, manifeste de composants et rapports sont dérivés. L'application en
développement importe ces tokens ; les validations des paquets installés
restent distinctes de la validation visuelle du catalogue et du frontend.

## 10. Finition des interactions — 1 novembre 2026

La barre conserve ses liens et son accès clavier en haut de page. Son panneau
est transparent à cette position, puis devient un verre lisible après 24 px de
défilement (16 px dans l'application). Flou de 18 px, surface à 88 %, bord discret
et ombre douce. Sans `backdrop-filter`, utiliser une surface opaque. Ne pas
animer le flou lui-même ; seule l'opacité du panneau change en 240 ms.

Les sélecteurs partagent `assets/controls.css` : police sans-serif, champ de
48 px, chevron qui pivote, menu de surface arrondi, coche de sélection et état
actif distinct. Flèches, Début/Fin et recherche par caractères déplacent l'option
active ; Entrée valide, Échap annule et Tab poursuit la navigation. Le focus
reste sur le déclencheur. Dans le catalogue, le sélecteur natif reste le repli
sans JavaScript. Les options ne prennent aucune animation au clavier.

Les retours de pression (150–180 ms), les flèches de bouton, les cartes au
survol, les états de profil et les ouvertures de dialogue restent courts.
Les sections du catalogue entrent une seule fois, par opacité et déplacement
de 12 px sur 380 ms. La réduction des animations supprime ces déplacements.
Ne pas animer l'arrivée de chaque fichier dans les longues listes virtualisées.
