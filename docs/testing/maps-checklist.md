# Maps - what automation proves, and the DEV checklist (issues #52 and #53)

Automation: `MapTests`, `MapBackupTests`, `MapMigrationTests`, `MapGeographyTests`, `MapCalibrationMigrationTests`
(API), `maps.spec.ts` (Playwright, desktop and 390px). What they cannot prove runs on DEV by hand, below. ADR 0060 and
ADR 0061 hold the decisions.

## Automated

- Create with a picture, list, read, rename over a version, delete; the fitted display copy and the immutable addresses.
- Refusals: not an image, SVG, no name, a repeated name, a full owner's storage, a store that fails (503, nothing kept).
- Pins: fractions on the map, a title, a note; a live entry of the same universe only, once per map, on several maps;
  moved, retitled, removed; a trashed entry's pin names nothing of it; an erased entry leaves an annotation.
- Replacement: keep (pins at their fractions, awaiting review until saved) or remove; the old objects swept; the scale
  dropped with the picture.
- Roles: members read, Editors and the owner change, Viewers and Reviewers 403, outsiders 404 everywhere, ids do not cross
  universes. Every map route is in the access matrix.
- Backup 35: maps, pins and scales travel with the originals; a restore keeps a waiting pin waiting and refits the display
  copy; version 33 and 34 files restore without maps and without scales; a pin off the map, for an unknown entry, a wrong
  picture size, a missing original and a bad scale are refused.
- Geography: distances only on one calibrated map with confirmed pins, honestly rounded, the same through the assistant
  and MCP; different maps and uncalibrated maps say why; locations are pins only; ambiguous and trashed names refused;
  the four tools read-only.
- Browser: upload, place with the pointer and by typed position, link to an entry, pin to entry and back, reload, zoom and
  fit by keyboard, Tab to a pin, the scale typed and shown, the Fake assistant's "Where is" from pins and its "no map
  location", replacement with review, a 390px column with no sideways scroll.

## By hand on DEV

Signed in as the owner of a universe with a few Lore entries. Tick each.

1. **Upload.** Maps > New map: a real JPEG or PNG of a few MB. The page opens on it; the picture is sharp enough at the
   deepest zoom for your use. Profile > Usage: Storage grew by the file's size.
2. **Pan and zoom.** Mouse drag, wheel, the three buttons; a trackpad pinch; on a phone one finger pans and two pinch; the
   page never scrolls sideways; the pins keep their places through all of it and after rotating the phone.
3. **Pins.** Add pin > press the map; link an entry; the title fills from the entry and can be changed; save. Drag the pin;
   its numbers in Edit changed. Edit > type a position. Remove.
4. **Both ways.** The pin's card > Open; the entry's Maps block > the map opens on the pin, selected and centred; reload
   keeps it. Pin the same entry on a second map: the entry lists both.
5. **Visibility.** Invite a Viewer: they open the map, read every pin, and see no Add pin, no scale buttons. Share nothing
   publicly: the public portal shows no map, and a signed-out `GET /api/universes/{u}/maps/{m}/image/{asset}/display` is
   401, an outsider's 404.
6. **Replace.** ⋯ > Replace picture with a different size; choose Keep: the notice counts the pins, each shows the review
   style, Edit > Save confirms one; the scale is gone. Replace again with Remove: no pins.
7. **Calibrate.** Set the scale: press two points you know the distance between, type it and a unit of your world
   ("leagues", "days' ride"); the dashed line and the words appear. Set again with different points: the words change.
8. **Ask the assistant** (Groq on DEV): "Where is <an entry on a map>?" - names the map, with a source link that opens the
   map on the pin. "Where is <an entry on no map>?" - says it is on no map, invents nothing. "Where is <a kingdom>'s
   capital?" - only when a relationship or field records the capital; otherwise it asks or says none is recorded. "How
   far is A from B?" - a number only when both are on one calibrated map, said as approximate and straight-line; on an
   uncalibrated map it says a real distance cannot be measured; across two maps it refuses.
9. **MCP** (Claude or ChatGPT connected to the universe): `list_maps`, `get_map_location` by name and by id,
   `search_map_locations`, `measure_map_distance` - the same answers as the assistant; a disconnected app gets nothing.
10. **Export and restore.** Settings > Backup; restore it as a new universe: the maps, pins, links and scale are there, the
    waiting pin still waits.
11. **Delete.** ⋯ > Delete map: the dialog names the pin count; the entry's Maps block no longer lists it; Storage shrank.

## Unverified at the time of writing

Real-device touch (iPhone Safari, Android Chrome) beyond the simulated 390px viewport; Groq's and Claude's actual
phrasing over the geography tools; a 10,000 px original at the deepest zoom. Route findings to #33 (security) and #34
(readiness).
