## What changed

<!-- A few lines: what and why. Screenshots or a short clip for visual / gameplay changes. -->

## How it was checked

- [ ] `npm run check` (typecheck, tests, build) passes
- [ ] `npm run check:boot` passes (the built game boots from the GitHub Pages sub-path)
- [ ] Played it locally (`npm run dev`) – for gameplay, UI or graphics changes
- [ ] GPU checks for big gameplay / rendering changes: `npm run smoke`, `npm run test:keys`, `npm run test:handling`, `npm run test:visual`
- [ ] Map geometry changed → re-baked lighting with `npm run bake` and committed `public/lightmaps/`
- [ ] Docs updated (README / docs/) if controls, rules or features changed

## Notes for the reviewer

<!-- Anything risky, follow-ups, known gaps. -->
