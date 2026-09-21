# Red Alert artwork

This atlas includes the original Red Alert chain-link-fence frames from
`fenc.shp`, extracted from OpenRA's verified `ra-base.zip` package (SHA-1
`aa022b208a3b45b4a45c00fdae22ccf3c6de3e5c`). The source artwork is ©
Electronic Arts; it is separate from OpenRA's GPL engine source and this
project's source code.

Rebuild the atlas from the verified local package:

```sh
node --openssl-legacy-provider scripts/import-red-alert.mjs /path/to/ra-base.zip public/assets/red-alert
```

See https://www.openra.net/legal/ for the OpenRA legal notice.
