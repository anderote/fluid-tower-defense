# Red Alert infantry

Rifle, rocket, and flame infantry frames are original Red Alert artwork © Electronic Arts, extracted from OpenRA's verified `ra-base.zip` package (SHA-1 `aa022b208a3b45b4a45c00fdae22ccf3c6de3e5c`). These game assets are separate from OpenRA's GPL engine source and from this project's source code.

Sources: https://www.openra.net/legal/ and https://github.com/OpenRA/OpenRA/blob/bleed/mods/ra/sequences/infantry.yaml

Selected sequences: `e1.shp`, `e3.shp`, `e4.shp` standing, running, shooting, and `die1`. Original 50×39 canvases retain the (25,20) foot pivot. Temperate palette with an olive-gold player-color remap. The samurai is original project artwork drawn in `src/render/infantry-art.ts`; it is not an original Red Alert unit.

Rebuild from the verified local package:

```sh
node --openssl-legacy-provider scripts/import-red-alert.mjs /path/to/ra-base.zip public/assets/red-alert/infantry --infantry
```
