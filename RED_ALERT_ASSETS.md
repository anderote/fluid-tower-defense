# Original Red Alert artwork — local prototype

The default turret presentation has since moved to the original Soldat-inspired
study described in `SOLDAT_ART.md`. The floor/wall assets below remain active;
`?turretArt=red-alert` restores this document's turret mapping for comparison.

The floor, concrete walls, Autocannon, Tesla Coil and Incinerator use original
1996 Red Alert artwork from the freeware asset package distributed for OpenRA.
This is actual indexed-palette game art converted losslessly to an RGBA atlas,
not newly drawn artwork or an OpenRA engine integration.

## Provenance and rights

- Package: `ra-base.zip`, from OpenRA's official mirror list:
  https://www.openra.net/packages/ra-base-mirrors.txt
- Verified SHA-1: `aa022b208a3b45b4a45c00fdae22ccf3c6de3e5c`.
- Source archives: `interior.mix`, `conquer.mix`, `local.mix`, `temperat.mix`.
- Palette: `interior.pal` (original six-bit channels expanded by four).
- Artwork remains copyright Electronic Arts; it is **not** covered by OpenRA's
  GPL engine license. See https://www.openra.net/legal/ and
  https://www.openra.net/download/ . This local import does not establish a
  redistribution or commercial-use license. Review applicable EA terms before
  publishing a build containing these assets.
- No OpenRA engine code or dependency is included in the game runtime.

## Rebuild

Download `ra-base.zip` from a mirror listed above into
`artifacts/red-alert/ra-base.zip`, then run `npm run assets:red-alert`.
The importer refuses packages that do not match the official checksum.
It writes `public/assets/red-alert/atlas.png` and `atlas.json`; those small
derived assets are included in the local feature commit. The full archive is
ignored by git. The Node legacy crypto provider is used only by the offline
converter to read the original MIX archive's Blowfish header.

`/tests/art/` shows the extracted tiles and sprites. `/tests/art/scene.html`
shows the actual WebGPU renderer with connected walls and multiple gun facings.

## Current mapping and limits

- Floor: `flor0001.int`, with restrained variation among its original frames.
- Optional floor preview: `gflr0001.int`, all 13 original steel-grating frames.
  `/tests/floor-art/` compares both floors in the same room. `/?floor=grating`
  previews grating during play; it is not saved and dark panels remain default.
- Walls: original vertical cap and south-facing wall textures, chosen from
  neighboring collision rectangles. Rendering never changes collision geometry.
- Autocannon: `gun.shp`, first 32 directional frames, original fixed foundation.
- Tesla: `tsla.shp`, idle frame, original elevated sprite anchor.
- Incinerator: `ftur.shp`, idle frame.
- Wire: `barb.shp`, 16 connected coil configurations plus 16 fallen-wire frames.
  `fenc.shp` is also imported for the comparison fixture (staked fence).
- The other five weapon types retain their existing art in this first pass.
- Additional original wall junctions, damaged guns, charging frames, and SAM
  frames are retained in the atlas for later refinement; they are not all used.
- The original direction frames are selected at equal angular intervals for our
  camera. Original recoil, firing animations, and Red Alert's perspective-facing
  correction are not yet reproduced. Existing gameplay effects still run.

One source tile is 24 pixels across and maps to a 4-unit construction cell.
Texture reads use nearest pixels. Terrain instance buffers update only when
the map or solid obstacles change; combat, damage, saves, and pressure physics
retain their existing behavior. Missing assets fall back to the prior renderer
and produce a console warning.

## Connected barbed wire

The default wire now uses original `barb.shp` coils at the same 24-pixel / 4-unit
scale and interior palette as the facility floor. Adjacent live wire cells select
the original north/east/south/west connection frames; no sprite rotation is used.
Breaching or removing a segment immediately exposes the neighboring end pieces.
Concrete walls do not count as wire connections.

Above 70% health the source sprite is unchanged. At 70% it receives a tarnished
tint; at 35% the outer details give way to original fallen-wire fragments while
central strands remain. These intermediate damage treatments are our runtime
composites, not additional original Red Alert animation frames. A breached cell
uses only the fallen-wire bank and ceases connecting its live neighbors. The
original palette shadows and transparent floor gaps are retained.

`/tests/wire-art/` compares BARB and FENC on the live floor/wall renderer, with
damage, breach/repair, valid/invalid placement, and gameplay-scale controls.
The comparison does not change the default or persist a gameplay setting.
`src/render/wire-art.test.ts` covers every connection mask, damage thresholds,
breach/reconnection, placement topology, saved footprints, and atlas dimensions.

Collision bounds, health, costs, saves, and the approved Soldat turrets are
unchanged. The former geometric wire renderer remains the fallback when the
asset atlas is unavailable or lacks the wire frames.
