# Parité de la migration Svelte

Source fonctionnelle `adf7b8ce`. Le tableau sépare portage, preview, natif et paquet.
Aucune réussite de preview ne vaut validation de fichier réel ou d’installation.

| Domaine | Implémentation Svelte | Preuve et limite |
| --- | --- | --- |
| Import, dossiers, refus partiels | fileWorkflow + FilesScreen | UI import et retrait des refus, modèles/commandes Rust inchangés ; picker/dossiers/drop GUI final à accepter |
| Collage implicite | fileWorkflow + façade existante | Test preview Fichiers/Formats, exclusion champs éditables/Sortie ; stockage local Rust conservé, collage natif final ouvert |
| Formats et profils | FormatScreen/FormatOptions + modèles purs | Sélections individuelles/compatibles, copie de flux/clavier/typeahead ; vraie matrice Windows pour les moteurs |
| Conversion et progression | conversionWorkflow + fileWorkflow | Annulation/reprise/erreur/retry preview, progression par job et lot ; 11 groupes réels Windows et 194 unités Rust |
| Export, réexport et bilan | outputActions | Preview Téléchargements/dossier/bilan, règles Rust de publication conservées ; export GUI final ouvert |
| Récupération | batchRecovery + recoveryModel | Consentement puis restauration preview sans anciens résultats ; contrats Rust locaux/expiration conservés |
| OCR/PDF | ImageOcrDialog + API inchangée | Copie/annulation/retry/vide/focus/étroit preview ; corpus réel Windows 40 cas, wrapper PDFium ; OCR installé final ouvert |
| Six langues et thèmes | i18n/state + theme | 408 clés × 6, sélection/persistance, système/clair/sombre et vrais WebKit ; catalogue conservé |
| Accueil, diagnostics, retours | composants dédiés | UI accueil/réglages/retours/focus ; données de diagnostic via même API |
| Mises à jour | appUpdater/updateSchedule | Contrats et notes échappées testés ; aucun update public déclenché, téléchargement/réinstallation final à accepter |
| Gros lots et cycle de vie | contrôleurs virtuels + ModalSurface | 2 000 fichiers, DOM borné ; 20 cycles réglages puis OCR sans croissance des listeners globaux possédés en preview |

| Critère | État actuel |
| --- | --- |
| A01 Installation/types/build | Réussi au niveau frontend sur trois OS ; Windows Tauri/NSIS construit, signature updater vérifiée |
| A02 Inventaire/parité | Tous les domaines portés, scénarios et limites ci-dessus ; aucune suppression de capacité du convertisseur |
| A03 Import/export natifs | Backend et façade conservés ; acceptation GUI post-migration encore ouverte |
| A04 Conversions réelles | Réussi Windows, 11 groupes complets + contrôle réseau ; pas de nouvelle matrice Linux/Mac complète |
| A05 Races/annulation | Régressions preview, modèles et tests Rust réussis ; gestes natifs finaux encore ouverts |
| A06 OCR réel | Runtime et corpus source Windows réussis ; ressource extraite de l’installateur final et GUI à accepter |
| A07 Design/clavier | Contrastes, quatre largeurs, zoom preview, 184 assertions par WebKit et inspections visuelles réussis ; paquet final non accepté |
| A08 Langues/extrêmes | Six langues complètes, préférences et noms longs/gros lots testés en preview |
| A09 Cycle de vie | DOM/listeners preview contrôlés sur 20 cycles ; worker réel couvert par ses tests/corpus, pas 20 cycles GUI natifs installés |
| A10 Sécurité/préférences | CSP/capacités et signatures IPC inchangées, notes sûres, zéro vulnérabilité npm, audits et préférences testés |
| A11 Nettoyage desktop | Réussi : aucun runtime/import/plugin/type React dans src, dépendances ou bundle desktop ; site conservé |
| A12 Paquets/preuves | Candidate Windows locale ; acceptations installées Windows/macOS/Linux et nouveaux DMG/AppImage ouverts |

Les protocoles existants d’acceptation restent obligatoires. Ce document ne remplit
pas leurs scénarios à la place d’un essai réel et ne débloque pas la publication.
