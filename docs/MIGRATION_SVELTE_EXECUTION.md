# Exécution de la migration Svelte

## État — 1 novembre 2026

Exécution demandée explicitement après approbation du mandat. Worktree dédié :
`~/.codex/worktrees/multi-converter-svelte/Multi-Converter`, branche
`codex/migrate-svelte`, base `51e63aef`. Le checkout principal et ses modifications
préexistantes restent conservés. Aucun push ni publication.

| Lot | État | Preuve |
| --- | --- | --- |
| L0 Référence | Terminé | React : builds preview/production, 56 unités et sept mesures Chromium enregistrées |
| L1 Socle | Réalisé | Types sans erreur/avertissement, preview/production, lancement Tauri Windows ; installation propre Mac réussie |
| L2 Design | Intégré, WebKit en cours | DS-01 à DS-07 corrigés ; six contrastes AA, huit captures et clavier Chromium |
| L3 Parcours vertical | Partiel | Preview complet et matrice réelle Windows réussis ; picker/export GUI non prouvés |
| L4 Parité conversion | Intégré | Lots, virtualisation, annulation/reprise ; vérifications complémentaires rapport/récupération en cours |
| L5 OCR et annexes | Intégré, validation en cours | OCR preview, six langues et préférences, 20 cycles ; runtime et corpus réels Windows réussis |
| L6 Bascule | Réalisée au niveau source | React/types/plugin retirés du desktop ; aucun changement sous site/ |
| L7 Validation | À réaliser | Gates finaux et preuves séparées par plateforme |

## Limites actuelles

La migration n'est pas encore livrée. Les preuves Ubuntu/Tailwind antérieures
restent des tests isolés. La validation installée et le gate release restent ouverts.

## Contrôles intermédiaires

- Versions résolues : Svelte 5.57.3, plugin Vite Svelte 7.3.1, svelte-check 4.7.7,
  Tailwind/plugin Vite 4.3.3 et Bits UI 2.20.2. Vite 8 et TypeScript 6 conservés.
- Référence Chromium : médianes de sept contextes neufs, démarrage 144,23 ms,
  réglages 387,86 ms et sélection de format dans un lot de 2 000 fichiers 64,96 ms.
  Ce sont des mesures de preview simulée, pas le démarrage natif ni la mémoire OS.
- Premier parcours Svelte : neuf tests UI réussis, trois régressions de démarrage
  de conversion corrigées et rejouées avec succès, dix exclusions existantes. Aucun échec masqué.
- Les huit surfaces modales partagent Bits UI ; les notes de version sont rendues
  depuis un arbre typé et échappé, sans injection HTML brute.
- Deepmerge : aucun correctif officiel pour GHSA-gcqx-w48m-w2h4. Un fork local MIT
  utilisé uniquement au build bloque les clés dangereuses des deux côtés de la
  fusion ; les régressions vérifient aussi la résolution réellement utilisée par
  le plugin. L'audit npm après installation signale zéro vulnérabilité.

- Point de reprise L0 : `9b26001d`. Après correction de la garde de démarrage,
  les trois scénarios précédemment en échec passent sans modifier leurs assertions.
- Tauri Windows : compilation native et lancement observés, port isolé 1428.
  L'outil de contrôle de fenêtre a expiré en attente d'autorisation : picker,
  export GUI et acceptation installée ne sont pas déclarés validés par ce lancement.

## Preuves intermédiaires de consolidation

- Windows : 60 tests frontend et 194 tests Rust réussis ; 13 tests lourds ignorés
  par cette commande. La matrice lourde a été exécutée séparément : 11 groupes
  réussis, plus le contrôle média hors ligne avec zéro requête non autorisée.
- Format Rust et Clippy sans avertissement : réussis. L’audit Rust est exécuté
  sans nouvelle exception ; ses avertissements transitifs restent à distinguer
  des vulnérabilités bloquantes.
- Les 12 scénarios UI existants passent, avec leurs dix exclusions de projet
  inchangées. Les nouvelles régressions couvrent menus/clavier/typeahead,
  six langues persistées, thèmes et vingt cycles de réglages puis d’OCR.
- Les contrastes texte/action : clair 4,753 / 5,308 / 6,289 ; sombre
  5,278 / 6,157 / 7,409 (repos, survol, pression).
- Mac Apple Silicon macOS 26.6.2 : transfert temporaire explicitement autorisé,
  archive frontend SHA-256 48e8f14b1ab71dfb9a1ac8d8f457957d05c6c0d4d0b11fc9e3f65e585f91f72a.
  Installation propre, types, 60 unités, fork de fusion, build production et audit
  npm réussis avec Node 24.22.2/npm 11.19.1. Ce n’est pas un DMG ni une application
  Tauri installée. Aucun autre projet de cet appareil n’a été modifié.
- Copie de référence React conservée dans le checkout initial, checkpoint L0 et
  sauvegarde récupérable des anciens fichiers sous le dossier local ignoré
  `tmp/react-legacy` du worktree de migration.

- Corpus OCR Windows final : 40 cas, moyenne propre 100 %, difficile 99,76 %,
  médiane 48 170 ms et pic 668,9 Mio. Observation réseau : 745 échantillons,
  zéro connexion distante. Les limites de performance restent celles de cet hôte.
- `npm run check` complet passe après adaptation des contrôles Svelte ; le scan
  de secrets conserve ses règles et les chemins personnels ont été retirés des
  nouveaux documents versionnés. Le build production rejette automatiquement
  tout marqueur des fixtures preview et tout runtime React desktop.
