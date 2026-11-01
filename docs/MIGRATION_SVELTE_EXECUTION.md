# Exécution de la migration Svelte

## État — 1 novembre 2026

Exécution demandée explicitement après approbation du mandat. Worktree dédié :
`C:/Users/ryadb/.codex/worktrees/multi-converter-svelte/Multi-Converter`, branche
`codex/migrate-svelte`, base `51e63aef`. Le checkout principal et ses modifications
préexistantes restent conservés. Aucun push ni publication.

| Lot | État | Preuve |
| --- | --- | --- |
| L0 Référence | En cours | React : builds preview/production, 56 unités et sept mesures Chromium enregistrées |
| L1 Socle | En cours | Types Svelte sans erreurs/avertissements, build réussi ; parité UI en cours |
| L2 Design | À réaliser | DS-01 à DS-07 dans le mandat |
| L3 Parcours vertical | À réaliser | Import/conversion/export natifs |
| L4 Parité conversion | À réaliser | Lots, virtualisation, rapports, récupération |
| L5 OCR et annexes | À réaliser | OCR, six langues, réglages et mises à jour |
| L6 Bascule | À réaliser | Suppression du runtime React desktop |
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
  de conversion à corriger, dix exclusions existantes. Aucun échec masqué.
- Les huit surfaces modales partagent Bits UI ; les notes de version sont rendues
  depuis un arbre typé et échappé, sans injection HTML brute.
- Deepmerge : aucun correctif officiel pour GHSA-gcqx-w48m-w2h4. Un fork local MIT
  utilisé uniquement au build bloque les clés dangereuses des deux côtés de la
  fusion ; les régressions vérifient aussi la résolution réellement utilisée par
  le plugin. L'audit npm après installation signale zéro vulnérabilité.
