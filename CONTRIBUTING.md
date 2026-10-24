# Contributing

## Setup

```bash
npm install
npm run dev        # http://localhost:5173
```

Node 20.19+ or 22.12+ (CI uses the version in `.nvmrc`).

## Workflow

1. Branch off `main`: `git checkout -b feature/my-change`.
2. Make the change. Keep `src/sim` free of DOM / WebGL. The simulation runs in Node tests,
   and rendering, audio and UI only consume its events and state.
3. Before pushing run `npm run check` (typecheck, tests, build) and `npm run check:boot`.
4. Push and open a pull request. CI runs automatically and must be green.
5. Merging to `main` deploys to GitHub Pages: https://ceenguyen05.github.io/ACI-SND/

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for how CI and deploys work.

## Things that are easy to forget

* **Map changes:** if you edit `src/sim/maps/aciHq.ts`, re-bake the lighting with
  `npm run bake` and commit `public/lightmaps/`. A test fails until you do.
* **Assets:** reference files in `public/` with relative paths or `import.meta.env.BASE_URL`,
  never `/absolute` paths. The site is served from `/ACI-SND/`. File names are
  case-sensitive on GitHub Pages.
* **New mechanics:** add a test in `tests/` (the simulation is deterministic, so seed a
  `Match` and step it). For input or visual changes, run `npm run test:keys` /
  `npm run test:handling` / `npm run test:visual` locally (they need a GPU).
* **Docs:** controls go in the README table and the in-game *How to play* page
  (`src/ui/screens/MainMenu.ts`); rules and numbers go in `docs/GAME_DESIGN.md`.
