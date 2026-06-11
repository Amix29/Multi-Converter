<!-- mc-release-notes:en -->
# Multi-Converter v1.0.4

This update makes the updater, release notes and Windows installer cleaner and more reliable.

## Highlights

- 🔄 Update detection is more reliable when the app starts offline, comes back online or is reopened later.
- 📝 Release notes now support full Markdown rendering, including headings, lists, links, tables, quotes and code blocks.
- 🧱 The update system was split into smaller modules, making the app easier to maintain and safer to change.
- 📦 The Windows x64 setup now uses fast NSIS ZLIB compression to keep the installer compressed while making extraction and setup startup quicker.

## Download And Installation

- 🪟 Supported platform: Windows x64.
- ⬇️ Recommended download: `Multi-Converter_windows-x64_setup.exe`.
- 📦 Versioned installer: `Multi-Converter_1.0.4_x64-setup.exe`.
- 🔄 Automatic updates use `latest.json` and the signed `.sig` updater artifact.

## Validation

- ✅ Passed: TypeScript checks, i18n validation, bundled engine validation, embedded manifest validation, release-note tests and production frontend build.
- ✅ Passed: Rust formatting, Rust Clippy, Rust tests, conversion matrix, PDFium wrapper tests and PDFium wrapper Clippy.
- ✅ Produced: signed Windows x64 NSIS installer, updater signature, checksum and stable setup alias.

## What's New

- Release notes can now display richer Markdown content directly in the update flow.
- Update checks now retry more naturally after offline starts and when the app regains attention.

## Interface And Usability

- Update dialogs now use the same shared update flow components instead of large inline app logic.
- Markdown links are opened as external links, while unsupported or unsafe links are ignored.

## Performance And Reliability

- The updater now keeps clearer pending-install state and resumes only work that was already started.
- Background checks avoid repeatedly failing while offline and re-check after a reasonable delay.
- The Windows setup uses faster NSIS compression to speed up extraction and setup startup.

## Fixes

- Fixed update auto-detection getting stuck after an offline launch.
- Fixed release-note rendering limitations that previously prevented full Markdown notes from being shown cleanly.
- Fixed stale generated release assets by regenerating the stable alias and checksum from the final signed installer.

## Security And Privacy

- 🔒 Conversions remain local on the user's computer. Selected files are not uploaded for conversion.
- Markdown release notes are rendered from parsed tokens as React elements, without injecting raw HTML.
- Release-note links reject unsafe `javascript:` and `data:` URLs.
- Signing secrets are read from environment variables and are not stored in repository files.

## Compatibility

- This release is for Windows x64.
- The installer remains an NSIS setup executable.

## Known Limitations

- macOS and Linux builds are not available yet.
- Some document conversions use text-based fallback paths and may not preserve every advanced layout detail.

## Developer And Build Notes

- Release assets are limited to `latest.json`, the versioned NSIS installer, its `.sig`, its `.sha256`, and the stable Windows setup alias.
- The updater metadata targets release tag `v1.0.4`.
<!-- /mc-release-notes -->

<!-- mc-release-notes:fr -->
# Multi-Converter v1.0.4

Cette mise à jour rend les mises à jour automatiques, les notes de version et l'installateur Windows plus propres et plus fiables.

## Highlights

- 🔄 La détection des mises à jour est plus fiable quand l'app démarre hors ligne, revient en ligne ou est rouverte plus tard.
- 📝 Les notes de version prennent maintenant en charge le Markdown complet : titres, listes, liens, tableaux, citations et blocs de code.
- 🧱 Le système de mise à jour a été séparé en modules plus petits, plus simples à maintenir et à sécuriser.
- 📦 Le setup Windows x64 utilise maintenant la compression rapide NSIS ZLIB pour rester compressé tout en accélérant l'extraction et le démarrage de l'installation.

## Download And Installation

- 🪟 Plateforme prise en charge : Windows x64.
- ⬇️ Téléchargement recommandé : `Multi-Converter_windows-x64_setup.exe`.
- 📦 Installateur versionné : `Multi-Converter_1.0.4_x64-setup.exe`.
- 🔄 Les mises à jour automatiques utilisent `latest.json` et l'artefact de signature `.sig`.

## Validation

- ✅ Validé : TypeScript, i18n, moteurs embarqués, manifeste intégré, tests des notes de version et build frontend de production.
- ✅ Validé : formatage Rust, Rust Clippy, tests Rust, matrice de conversions, tests PDFium wrapper et Clippy PDFium wrapper.
- ✅ Généré : installateur NSIS Windows x64 signé, signature updater, checksum et alias stable du setup.

## What's New

- Les notes de version peuvent afficher un contenu Markdown plus riche directement dans le flux de mise à jour.
- Les vérifications de mise à jour réessaient plus naturellement après un démarrage hors ligne ou quand l'app redevient active.

## Interface And Usability

- Les dialogues de mise à jour utilisent maintenant des composants partagés au lieu d'une grosse logique directement dans l'app.
- Les liens Markdown s'ouvrent comme liens externes, et les liens non sûrs ou non pris en charge sont ignorés.

## Performance And Reliability

- L'updater conserve un état d'installation en attente plus clair et ne reprend que les installations déjà lancées.
- Les vérifications en arrière-plan évitent de répéter les échecs hors ligne et relancent un contrôle après un délai raisonnable.
- Le setup Windows utilise une compression NSIS plus rapide pour accélérer l'extraction et le démarrage de l'installation.

## Fixes

- Correction de l'auto-détection des mises à jour qui pouvait rester bloquée après un lancement hors ligne.
- Correction des limites d'affichage qui empêchaient les notes de version Markdown complètes d'apparaître proprement.
- Correction des assets de release obsolètes en régénérant l'alias stable et le checksum depuis l'installateur final signé.

## Security And Privacy

- 🔒 Les conversions restent locales sur l'ordinateur de l'utilisateur. Les fichiers sélectionnés ne sont pas envoyés en ligne pour conversion.
- Les notes de version Markdown sont rendues depuis des tokens analysés sous forme d'éléments React, sans injection HTML brute.
- Les liens des notes de version rejettent les URL dangereuses `javascript:` et `data:`.
- Les secrets de signature sont lus depuis les variables d'environnement et ne sont pas stockés dans le dépôt.

## Compatibility

- Cette version est destinée à Windows x64.
- L'installateur reste un setup NSIS.

## Known Limitations

- Les builds macOS et Linux ne sont pas encore disponibles.
- Certaines conversions de documents utilisent des chemins de secours basés sur le texte et peuvent ne pas préserver tous les détails avancés de mise en page.

## Developer And Build Notes

- Les assets de release sont limités à `latest.json`, l'installateur NSIS versionné, son `.sig`, son `.sha256` et l'alias stable Windows.
- Les métadonnées updater ciblent le tag `v1.0.4`.
<!-- /mc-release-notes -->

<!-- mc-release-notes:es -->
# Multi-Converter v1.0.4

Esta actualización hace que el actualizador, las notas de versión y el instalador de Windows sean más claros y fiables.

## Highlights

- 🔄 La detección de actualizaciones es más fiable cuando la app inicia sin conexión, vuelve a estar en línea o se abre más tarde.
- 📝 Las notas de versión ahora admiten Markdown completo: títulos, listas, enlaces, tablas, citas y bloques de código.
- 🧱 El sistema de actualización se dividió en módulos más pequeños, más fáciles de mantener y cambiar con seguridad.
- 📦 El setup de Windows x64 usa compresión rápida NSIS ZLIB para mantener el instalador comprimido y acelerar la extracción y el inicio de la instalación.

## Download And Installation

- 🪟 Plataforma compatible: Windows x64.
- ⬇️ Descarga recomendada: `Multi-Converter_windows-x64_setup.exe`.
- 📦 Instalador versionado: `Multi-Converter_1.0.4_x64-setup.exe`.
- 🔄 Las actualizaciones automáticas usan `latest.json` y el artefacto firmado `.sig`.

## Validation

- ✅ Superado: TypeScript, i18n, validación de motores incluidos, manifiesto integrado, pruebas de notas de versión y build frontend de producción.
- ✅ Superado: formato Rust, Rust Clippy, pruebas Rust, matriz de conversiones, pruebas de PDFium wrapper y Clippy de PDFium wrapper.
- ✅ Generado: instalador NSIS Windows x64 firmado, firma updater, checksum y alias estable del setup.

## What's New

- Las notas de versión pueden mostrar contenido Markdown más rico directamente en el flujo de actualización.
- Las comprobaciones de actualización reintentan mejor después de iniciar sin conexión o cuando la app vuelve a estar activa.

## Interface And Usability

- Los diálogos de actualización ahora usan componentes compartidos en lugar de una lógica grande dentro de la app.
- Los enlaces Markdown se abren como enlaces externos, y los enlaces inseguros o no compatibles se ignoran.

## Performance And Reliability

- El actualizador mantiene un estado de instalación pendiente más claro y solo reanuda trabajos ya iniciados.
- Las comprobaciones en segundo plano evitan repetir fallos sin conexión y vuelven a comprobar tras un retraso razonable.
- El setup de Windows usa compresión NSIS más rápida para acelerar la extracción y el inicio de la instalación.

## Fixes

- Se corrigió la autodetección de actualizaciones que podía quedarse bloqueada tras un inicio sin conexión.
- Se corrigieron las limitaciones de renderizado que impedían mostrar limpiamente notas de versión Markdown completas.
- Se corrigieron assets de release obsoletos regenerando el alias estable y el checksum desde el instalador final firmado.

## Security And Privacy

- 🔒 Las conversiones siguen siendo locales en el ordenador del usuario. Los archivos seleccionados no se suben para convertirlos.
- Las notas Markdown se renderizan desde tokens analizados como elementos React, sin inyectar HTML bruto.
- Los enlaces de las notas rechazan URL peligrosas `javascript:` y `data:`.
- Los secretos de firma se leen desde variables de entorno y no se guardan en archivos del repositorio.

## Compatibility

- Esta versión es para Windows x64.
- El instalador sigue siendo un setup NSIS.

## Known Limitations

- Los builds para macOS y Linux aún no están disponibles.
- Algunas conversiones de documentos usan rutas de respaldo basadas en texto y pueden no conservar todos los detalles avanzados de diseño.

## Developer And Build Notes

- Los assets de release se limitan a `latest.json`, el instalador NSIS versionado, su `.sig`, su `.sha256` y el alias estable de Windows.
- Los metadatos del updater apuntan al tag `v1.0.4`.
<!-- /mc-release-notes -->

<!-- mc-release-notes:de -->
# Multi-Converter v1.0.4

Dieses Update macht den Updater, die Versionshinweise und den Windows-Installer klarer und zuverlässiger.

## Highlights

- 🔄 Die Update-Erkennung ist zuverlässiger, wenn die App offline startet, wieder online geht oder später erneut geöffnet wird.
- 📝 Versionshinweise unterstützen jetzt vollständiges Markdown mit Überschriften, Listen, Links, Tabellen, Zitaten und Codeblöcken.
- 🧱 Das Update-System wurde in kleinere Module aufgeteilt, damit es leichter zu warten und sicherer zu ändern ist.
- 📦 Das Windows-x64-Setup nutzt schnelle NSIS-ZLIB-Kompression, damit der Installer komprimiert bleibt und Extraktion sowie Installationsstart schneller werden.

## Download And Installation

- 🪟 Unterstützte Plattform: Windows x64.
- ⬇️ Empfohlener Download: `Multi-Converter_windows-x64_setup.exe`.
- 📦 Versionierter Installer: `Multi-Converter_1.0.4_x64-setup.exe`.
- 🔄 Automatische Updates verwenden `latest.json` und das signierte `.sig`-Updater-Artefakt.

## Validation

- ✅ Bestanden: TypeScript, i18n, Validierung der gebündelten Engines, eingebettetes Manifest, Release-Note-Tests und Produktions-Frontend-Build.
- ✅ Bestanden: Rust-Formatierung, Rust Clippy, Rust-Tests, Konvertierungsmatrix, PDFium-Wrapper-Tests und PDFium-Wrapper-Clippy.
- ✅ Erstellt: signierter Windows-x64-NSIS-Installer, Updater-Signatur, Prüfsumme und stabiler Setup-Alias.

## What's New

- Versionshinweise können nun umfangreichere Markdown-Inhalte direkt im Update-Dialog anzeigen.
- Update-Prüfungen wiederholen sich natürlicher nach Offline-Starts oder wenn die App wieder aktiv wird.

## Interface And Usability

- Update-Dialoge verwenden nun gemeinsame Komponenten statt großer Inline-Logik in der App.
- Markdown-Links werden als externe Links geöffnet, unsichere oder nicht unterstützte Links werden ignoriert.

## Performance And Reliability

- Der Updater speichert einen klareren Status für ausstehende Installationen und setzt nur bereits gestartete Arbeiten fort.
- Hintergrundprüfungen vermeiden wiederholte Offline-Fehler und prüfen nach einer sinnvollen Verzögerung erneut.
- Das Windows-Setup verwendet schnellere NSIS-Kompression, damit Extraktion und Installationsstart schneller werden.

## Fixes

- Die automatische Update-Erkennung bleibt nach einem Offline-Start nicht mehr hängen.
- Einschränkungen beim Anzeigen vollständiger Markdown-Versionshinweise wurden behoben.
- Veraltete Release-Assets wurden durch neue stabile Alias- und Prüfsummendateien aus dem final signierten Installer ersetzt.

## Security And Privacy

- 🔒 Konvertierungen bleiben lokal auf dem Computer des Nutzers. Ausgewählte Dateien werden nicht zur Konvertierung hochgeladen.
- Markdown-Versionshinweise werden aus analysierten Tokens als React-Elemente gerendert, ohne rohes HTML einzufügen.
- Links in Versionshinweisen blockieren unsichere `javascript:`- und `data:`-URLs.
- Signatur-Geheimnisse werden aus Umgebungsvariablen gelesen und nicht im Repository gespeichert.

## Compatibility

- Diese Version ist für Windows x64.
- Der Installer bleibt ein NSIS-Setup.

## Known Limitations

- macOS- und Linux-Builds sind noch nicht verfügbar.
- Einige Dokumentkonvertierungen verwenden textbasierte Fallbacks und erhalten möglicherweise nicht jedes erweiterte Layoutdetail.

## Developer And Build Notes

- Release-Assets sind auf `latest.json`, den versionierten NSIS-Installer, dessen `.sig`, dessen `.sha256` und den stabilen Windows-Setup-Alias begrenzt.
- Die Updater-Metadaten zielen auf den Tag `v1.0.4`.
<!-- /mc-release-notes -->

<!-- mc-release-notes:pt -->
# Multi-Converter v1.0.4

Esta atualização deixa o atualizador, as notas de versão e o instalador do Windows mais claros e confiáveis.

## Highlights

- 🔄 A detecção de atualizações está mais confiável quando o app inicia offline, volta a ficar online ou é aberto novamente.
- 📝 As notas de versão agora aceitam Markdown completo: títulos, listas, links, tabelas, citações e blocos de código.
- 🧱 O sistema de atualização foi dividido em módulos menores, mais fáceis de manter e alterar com segurança.
- 📦 O setup Windows x64 agora usa compressão rápida NSIS ZLIB para manter o instalador comprimido e acelerar a extração e o início da instalação.

## Download And Installation

- 🪟 Plataforma compatível: Windows x64.
- ⬇️ Download recomendado: `Multi-Converter_windows-x64_setup.exe`.
- 📦 Instalador versionado: `Multi-Converter_1.0.4_x64-setup.exe`.
- 🔄 As atualizações automáticas usam `latest.json` e o artefato de assinatura `.sig`.

## Validation

- ✅ Aprovado: TypeScript, i18n, validação dos motores incluídos, manifesto embutido, testes das notas de versão e build frontend de produção.
- ✅ Aprovado: formatação Rust, Rust Clippy, testes Rust, matriz de conversões, testes do PDFium wrapper e Clippy do PDFium wrapper.
- ✅ Gerado: instalador NSIS Windows x64 assinado, assinatura updater, checksum e alias estável do setup.

## What's New

- As notas de versão podem mostrar conteúdo Markdown mais rico diretamente no fluxo de atualização.
- As verificações de atualização tentam novamente de forma mais natural após inicialização offline ou quando o app volta a ficar ativo.

## Interface And Usability

- Os diálogos de atualização agora usam componentes compartilhados em vez de uma lógica grande dentro do app.
- Links Markdown são abertos como links externos, enquanto links inseguros ou não compatíveis são ignorados.

## Performance And Reliability

- O atualizador mantém um estado de instalação pendente mais claro e só retoma trabalhos já iniciados.
- As verificações em segundo plano evitam repetir falhas offline e verificam novamente após um atraso razoável.
- O setup do Windows usa compressão NSIS mais rápida para acelerar a extração e o início da instalação.

## Fixes

- Corrigida a autodetecção de atualizações que podia ficar presa após uma inicialização offline.
- Corrigidas limitações de renderização que impediam a exibição limpa de notas Markdown completas.
- Corrigidos assets de release obsoletos regenerando o alias estável e o checksum a partir do instalador final assinado.

## Security And Privacy

- 🔒 As conversões continuam locais no computador do usuário. Os arquivos selecionados não são enviados para conversão.
- As notas Markdown são renderizadas a partir de tokens analisados como elementos React, sem injetar HTML bruto.
- Links das notas rejeitam URLs perigosas `javascript:` e `data:`.
- Segredos de assinatura são lidos de variáveis de ambiente e não são armazenados nos arquivos do repositório.

## Compatibility

- Esta versão é para Windows x64.
- O instalador continua sendo um setup NSIS.

## Known Limitations

- Builds para macOS e Linux ainda não estão disponíveis.
- Algumas conversões de documentos usam caminhos de fallback baseados em texto e podem não preservar todos os detalhes avançados de layout.

## Developer And Build Notes

- Os assets de release são limitados a `latest.json`, ao instalador NSIS versionado, seu `.sig`, seu `.sha256` e o alias estável do setup Windows.
- Os metadados do updater apontam para a tag `v1.0.4`.
<!-- /mc-release-notes -->

<!-- mc-release-notes:it -->
# Multi-Converter v1.0.4

Questo aggiornamento rende l'updater, le note di versione e l'installer Windows più chiari e affidabili.

## Highlights

- 🔄 Il rilevamento degli aggiornamenti è più affidabile quando l'app si avvia offline, torna online o viene riaperta più tardi.
- 📝 Le note di versione ora supportano Markdown completo: titoli, liste, link, tabelle, citazioni e blocchi di codice.
- 🧱 Il sistema di aggiornamento è stato diviso in moduli più piccoli, più facili da mantenere e modificare in sicurezza.
- 📦 Il setup Windows x64 usa la compressione rapida NSIS ZLIB per mantenere l'installer compresso e accelerare estrazione e avvio dell'installazione.

## Download And Installation

- 🪟 Piattaforma supportata: Windows x64.
- ⬇️ Download consigliato: `Multi-Converter_windows-x64_setup.exe`.
- 📦 Installer versionato: `Multi-Converter_1.0.4_x64-setup.exe`.
- 🔄 Gli aggiornamenti automatici usano `latest.json` e l'artefatto firmato `.sig`.

## Validation

- ✅ Superati: TypeScript, i18n, validazione dei motori inclusi, manifesto integrato, test delle note di versione e build frontend di produzione.
- ✅ Superati: formattazione Rust, Rust Clippy, test Rust, matrice di conversione, test PDFium wrapper e Clippy PDFium wrapper.
- ✅ Generati: installer NSIS Windows x64 firmato, firma updater, checksum e alias stabile del setup.

## What's New

- Le note di versione possono mostrare contenuti Markdown più ricchi direttamente nel flusso di aggiornamento.
- I controlli aggiornamento riprovano in modo più naturale dopo avvii offline o quando l'app torna attiva.

## Interface And Usability

- I dialoghi di aggiornamento ora usano componenti condivisi invece di una grande logica dentro l'app.
- I link Markdown si aprono come link esterni, mentre i link non sicuri o non supportati vengono ignorati.

## Performance And Reliability

- L'updater mantiene uno stato di installazione in sospeso più chiaro e riprende solo lavori già avviati.
- I controlli in background evitano di ripetere errori offline e ricontrollano dopo un ritardo ragionevole.
- Il setup Windows usa una compressione NSIS più rapida per accelerare estrazione e avvio dell'installazione.

## Fixes

- Corretto il rilevamento automatico degli aggiornamenti che poteva bloccarsi dopo un avvio offline.
- Corrette limitazioni di rendering che impedivano di mostrare correttamente note Markdown complete.
- Corretti asset di release obsoleti rigenerando alias stabile e checksum dall'installer finale firmato.

## Security And Privacy

- 🔒 Le conversioni restano locali sul computer dell'utente. I file selezionati non vengono caricati per la conversione.
- Le note Markdown vengono renderizzate da token analizzati come elementi React, senza iniettare HTML grezzo.
- I link delle note rifiutano URL pericolosi `javascript:` e `data:`.
- I segreti di firma vengono letti da variabili d'ambiente e non sono salvati nei file del repository.

## Compatibility

- Questa versione è per Windows x64.
- L'installer rimane un setup NSIS.

## Known Limitations

- Le build macOS e Linux non sono ancora disponibili.
- Alcune conversioni di documenti usano fallback basati su testo e potrebbero non preservare ogni dettaglio avanzato di layout.

## Developer And Build Notes

- Gli asset di release sono limitati a `latest.json`, all'installer NSIS versionato, al suo `.sig`, al suo `.sha256` e all'alias stabile del setup Windows.
- I metadati dell'updater puntano al tag `v1.0.4`.
<!-- /mc-release-notes -->
