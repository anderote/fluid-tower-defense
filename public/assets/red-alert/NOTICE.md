# Red Alert artwork

This atlas includes the original Red Alert chain-link-fence frames from
`cycl.shp` and barbed-wire frames from `barb.shp`, extracted from OpenRA's
verified `ra-base.zip` package (SHA-1
`aa022b208a3b45b4a45c00fdae22ccf3c6de3e5c`). The source artwork is ©
Electronic Arts; it is separate from OpenRA's GPL engine source and this
project's source code.

The wall sprites use `temperat.pal`, matching OpenRA's fixed `effect` palette.
`fenc.shp` is a separate fence graphic and is not used for chain-link fences.

Rebuild the atlas from the verified local package:

```sh
node --openssl-legacy-provider scripts/import-red-alert.mjs /path/to/ra-base.zip public/assets/red-alert
```

See https://www.openra.net/legal/ for the OpenRA legal notice.

Freeform chain-link panels are projected at runtime from intact `cycl.shp`
frame 10. The ground axis follows the path while the vertical axis remains
upright; short panels compress only the ground axis. No new source assets
are imported by this projection.
