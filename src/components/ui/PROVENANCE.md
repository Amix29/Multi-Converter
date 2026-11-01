# Local UI sources

Button was generated with shadcn-svelte 1.7.2, style nova, on 2026-11-01.
Source: https://www.shadcn-svelte.com/docs/components/button
License: the adjacent upstream MIT text. Changes: project-owned brand variants,
44px standard density, retained ref/link/disabled behavior and local token bridge.

Dialog and Select registry sources were evaluated, then removed: the shared
ModalSurface and ChoiceSelect components use Bits UI 2.20.2 directly to retain
the established product contract without duplicate primitive implementations.
Lucide Svelte 1.66.0 supplies individual icons. Dependencies retain their own
licenses; the application NOTICE includes the corresponding upstream texts.
