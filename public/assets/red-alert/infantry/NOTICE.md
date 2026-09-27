# Red Alert infantry

Rifle, rocket, and flame infantry frames are original Red Alert artwork © Electronic Arts, extracted from OpenRA's verified `ra-base.zip` package (SHA-1 `aa022b208a3b45b4a45c00fdae22ccf3c6de3e5c`). These game assets are separate from OpenRA's GPL engine source and from this project's source code.

Sources: https://www.openra.net/legal/ and https://github.com/OpenRA/OpenRA/blob/bleed/mods/ra/sequences/infantry.yaml

Selected sequences: `e1.shp`, `e3.shp`, `e4.shp` standing, running, shooting, and `die1`. Original 50×39 canvases retain the (25,20) foot pivot. Temperate palette with an olive-gold player-color remap. The samurai is original project artwork drawn in `src/render/infantry-art.ts`; it is not an original Red Alert unit.

Rebuild from the verified local package:

```sh
node --openssl-legacy-provider scripts/import-red-alert.mjs /path/to/ra-base.zip public/assets/red-alert/infantry --infantry
```

Phalanx Trooper and Phalanx Barracks artwork is original project work, generated deterministically by `drawPhalanxFrame` in `src/render/infantry-art.ts` and `infantryBuildingPixels` in `src/render/infantry-building-art.ts`. It uses the existing Red Alert-scale palette and eight-direction presentation, with a bronze round shield, crested helmet, olive armor and level spear. No external hoplite asset is imported; the existing verified Red Alert infantry package contains no suitable spear-and-shield troop. These additions share the project's source-code licensing, not the EA asset license. Running the game rebuilds every pose into its runtime atlas; no separate import is required.
