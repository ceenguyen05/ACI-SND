# Art sources and reproduction

Buildings, props, guns, characters and animation are authored in this repository.
Weapon finishes, interface graphics, other surface textures and audio are generated in code.
No Counter-Strike models, textures, sounds or animations are included.

The following three **CC0** scan sets from Poly Haven are bundled locally in
`public/textures/surfaces/`. Each includes 1024-pixel diffuse, OpenGL normal and roughness
JPEG maps. Together they are approximately 6.2 MB. The game does not contact Poly Haven at
runtime.

| Scan | Use | Original source |
|---|---|---|
| Concrete Floor | Factory and warehouse floors; color neutralized in the material | [Poly Haven / eye-candy.xyz](https://polyhaven.com/a/concrete_floor) |
| Corrugated Iron | Factory cladding | [Poly Haven](https://polyhaven.com/a/corrugated_iron) |
| Red Brick 03 | Exterior facades and factory wall bases | [Poly Haven](https://polyhaven.com/a/red_brick_03) |

These assets remain public domain under [Poly Haven's CC0 license](https://polyhaven.com/license).
They are not original ACI art. The original files are unchanged; render-time material tint
and texture scale adapt them to the map.

Acquired for the visual overhaul on October 23, 2026. `manifest.json` records the download
URLs, sizes and verified MD5 checksums. Run `npm run assets:surfaces` to fetch the source
files again. This is an optional authoring step, not part of install, build or gameplay.

The characters and weapon motion remain procedural, without motion capture or external
character rigs. Their code lives in `CharacterModel.ts`, `HumanoidGeometry.ts`,
`WeaponModels.ts` and `ViewModel.ts`.
