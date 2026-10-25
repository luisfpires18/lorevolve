# ADR 0060 - A universe's maps are uploaded pictures kept whole, with pins at fractions of them linked to Lore by id

Status: accepted (2026-10-25). GitHub issue 52 (pre-alpha); issue 53 builds on it (ADR 0061). Amends ADR 0014 (backup
version 34), ADR 0042 (what counts against storage) and ADR 0019 (the picture pipeline, reused).

## Context

Creators draw or obtain maps of their worlds elsewhere and want them inside LoreX: a picture to pan and zoom, places
marked on it, each place opening the Lore entry it stands for, and each entry leading back to its place on the map. The
owner asked for a viewer and pins, explicitly not a drawing studio, and asked that nothing about the data model block
queryable geography and distance later (issue 53).

LoreX already stores one picture per entry and a gallery per appearance in a private bucket, decodes every upload to
decide what it is, keys objects by ids alone, writes derivatives before the row moves and sweeps after the commit (ADR
0019, ADR 0053), counts originals against the owner's storage (ADR 0042), carries originals in a backup (ADR 0014) and
gates every universe route by capability (ADR 0041). Maps reuse all of it.

## Decision

**Several maps per universe, each with a stable id; a map belongs to one universe.** `UniverseMaps` (name unique within
the universe, description, the picture's facts, an edit version for the details) and `MapPins` (title, note, position,
the entry it stands for, the picture it was placed on). A map cascades with its universe; a pin with its map. Fifty maps
a universe, five hundred pins a map.

**The picture is kept as uploaded and shown whole.** The same gate as every other picture decides what a file is by
decoding it (JPEG, PNG, WebP; 8 MB; 10,000 px a side; 24 megapixels) - `ImagePreparation.FitAsync` - and the derivative
is the whole picture fitted within 4,096 px on its longer side as WebP, never a crop: a map has nothing to frame. Two
objects under ids alone, `universes/{u}/maps/{map}/{asset}/original.{ext}` and `.../display.webp`; the original counts
against the universe owner's storage, the derivative never. Both are read through authenticated LoreX routes with the
asset id in the path (`private, immutable`), never a URL into the bucket, and never publicly: a map is read by the
universe's members and by nobody else. The public portal shows none, and no public route exists for one.

**A position is two fractions of the displayed picture.** `X` of the width and `Y` of the height, 0 at the left and top
edges, 1 at the right and bottom, measured against the original as a browser draws it (EXIF orientation applied for JPEG
and PNG, not WebP, as every picture is - ADR 0019). Never a pixel of a screen or of the fitted copy. The same fraction
names the same point at every zoom, on every screen, after every resize; the stored `Width` and `Height` are what the
fractions are of, and a backup carries them so a restore can refuse a picture of another size.

**The picture is a version, and a replacement is explicit about pins.** `AssetId` is new for every upload. Every pin
records `PlacedOnAssetId`, the picture it was placed or last confirmed on, so the map always knows which pins have been
seen against the picture it shows. Replacing the picture (`PUT .../image`) requires the author to say what happens to the
pins: `keep` leaves every pin at its fractions and the map reports each as awaiting review until the author saves it
(saving a pin confirms its position, moved or not); `remove` deletes them. Nothing is remapped by guesswork, and nothing
is kept quietly. The replace follows the entry picture's order: both new objects first, then the row moves, then the old
pair is swept; a replacement measured against a picture that has since changed answers 409 `map_image_changed`.

**A pin stands for one entry by id, once per map, on any number of maps.** `EntityId` references a live entry of the same
universe, checked on every create and save; a pin for an entry in the Trash or another universe is refused. A partial
unique index holds `(MapId, EntityId)`, so following an entry to a map never lands on two pins; the same entry may be
pinned on several maps, and the entry's page lists each map by name (`GET .../entities/{e}/map-pins`), so the way to a
map is chosen, never guessed. A pin always carries its own title (filled from the entry's name when one is chosen, and
the author's to change), so an annotation pin stands on its own and a pin whose entry is erased for good keeps saying
what it marks: the foreign key sets the link to null and the pin stays. An entry in the Trash keeps its pin; the pin
reports the link as to an entry in the Trash and names nothing of it, because not every member may read the Trash.
Never a copy of the entry: the pin reads the entry's name and type live from its row.

**Deleting a map deletes it.** A map is not Lore and does not enter the Trash: the original is the author's own file,
pins are small and recreatable, and the Trash's restore machinery would be a second system for a picture. The screen
asks once, naming the map and its pin count; the row goes first and the objects after the commit. Deleting a universe
sweeps its maps' objects with its pictures' (ADR 0042 amendment).

**Backup version 34 carries every map.** Its details, its picture's facts and the original at
`media/maps/{mapId}/original.{ext}`, and every pin - title, note, fractions, the entry by id in the file, and whether it
was placed on the picture the map shows. The display copy is derived and fitted again on restore. Validation decodes the
picture as an upload would, refuses a size that is not the stated one (every pin would land elsewhere), a pin off the
map, a pin for an entry the file does not hold and an entry pinned twice on one map; a restore holds the owner's storage
for the originals, gives everything new ids and keeps a waiting pin waiting. A file at version 33 or earlier restores
with no maps.

**The viewer is a transform, not a map library.** One layer holds the picture at its displayed size and each pin at
`left: X%; top: Y%`; the layer is translated and scaled as a whole, and pins are counter-scaled so they keep one size.
Pins are buttons - in the tab order, named, pressable; a list beside the picture reaches every pin whatever the zoom; the
stage answers the keyboard (arrows pan, `+`/`-` zoom, `0` fits, Enter places at the centre while placing, Escape clears)
and a pin's position can be typed as two percentages, so nothing needs a pointer. Leaflet with `CRS.Simple` was weighed:
BSD-2, healthy, about 42 KB gzipped plus a stylesheet, markers as its own DOM outside React, keyboard handling that stops
at the map, and icon assets that fight the bundler, for a requirement that is a picture, a transform and some buttons. No
canvas, no tiles, no editor framework.

**Who.** Members read (`Read`); Editors and the owner create, pin, replace, rename and delete (`EditContent`). A map in a
universe the caller cannot read is a 404 like one that is not there. Pins carry no account, no private note and nothing
of the Trash.

## Consequences

- One migration, `AddUniverseMaps`: two tables, plain `DROP TABLE` rollback. `MapMigrationTests` walks it down and up and
  proves the cascade and the severed link.
- Storage: `GET /api/profile/storage` gains `mapImagesBytes` beside `loreImagesBytes`; `usedBytes` is their sum.
- Pins have no edit version (ADR 0043): two authors moving one pin at once end with the last save, a small loss on a
  small object. The map's details do have one.
- A map's original is served whole on request but drawn from the 4,096 px copy: a 10,000 px map loses detail at the
  deepest zoom. Tiles would fix that and are not justified yet.
- Not done, deliberately: the Trash for maps, public maps, drawing of any kind, layers, routes, borders, timeline
  overlays (issue 10), tiles, and - here - calibration, distance and any AI or MCP reading, which are issue 53 (ADR 0061).
