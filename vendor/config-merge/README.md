# Build-only safe configuration merge

Derived from deepmerge 4.3.1 (MIT). Original bundled CommonJS source SHA-256:
`2e5160f84a1141bd927264afe4d15766f1e6cf07daef182b37ff53fea121de7d`. Retains upstream license and behavior, with one local change:
reject `__proto__`, `constructor` and `prototype` keys before traversing either
target or source, including nested merges. This fixes GHSA-gcqx-w48m-w2h4 rather
than excluding it from audit output. Used only through the Svelte Vite plugin's
development dependency override; not shipped in the application frontend.

Remove this fork when an official patched version is available and the focused
regression suite passes against it. No upstream patched release currently exists.
