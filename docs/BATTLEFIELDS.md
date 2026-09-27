# Battlefield authoring

Nine of the eighteen battlefields are central redoubts: Redoubt Ring, Ice Shelf,
Blackwater Switchyard, Meteor Crater, Greenwall Maze, Saltworks Basin, Twin Peaks
Relay, Windbreak Mesa, and The Last Keep. They mix circular/oval walls, cardinal
or diagonal breaches, single/double rings, forest/snow terrain, villages, groves,
water, and currents. Bastion is an open settlement approach without preset walls.

`src/content/battlefields.ts` generates deterministic, four-unit ring cells and
scenery. Trees and buildings have small physical footprints listed in both
`obstacles` and `scenery.solids`; they are not turret foundations. Ring walls
remain mountable. Keep the objective clear and preserve boss-width routes from
every entry. Tests check those routes, the nine-map mix, and atlas frame bounds.

Artwork comes from the existing verified OpenRA/Red Alert atlas; no new external
assets were imported. See `public/assets/red-alert/NOTICE.md` for source,
licensing, and the repeatable atlas import command. Water banks and ripples use
native renderer geometry; current arrows appear in the pressure overlay.

Preview any map at `/tests/levels/` with the battlefield selector and route toggle.
The nine redoubts retain their existing IDs. Existing saves retain their saved
terrain; start a new game on the selected map to see the revised layout. Bastion
uses the existing default-map terrain rebase when restoring a session.
