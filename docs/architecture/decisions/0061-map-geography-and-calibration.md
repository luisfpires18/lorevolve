# ADR 0061 - Geography is read from the maps' pins through one shared reader, and a distance exists only on a calibrated map

Status: accepted (2026-10-25). GitHub issue 53, built on issue 52 (ADR 0060). Amends ADR 0014 (backup version 35), ADR 0045
(four assistant tools) and ADR 0046 (four MCP tools).

## Context

With maps and pins in place, creators want to ask the built-in assistant and outside AI apps where things are and how far
apart they are - "where is Arkazia's capital, and how far is it from the Sylvara Jungle?" - and get an answer that rests on
what they recorded, not on what a model guesses from a name or a picture. A pixel is not a kilometre, a hand-drawn map has
no scale until its author gives it one, and two maps share nothing.

The assistant already reads through a permission-safe read layer (`UniverseReader`, ADR 0045) and MCP through the same
layer behind its own gate (ADR 0046). Geography follows the same shape.

## Decision

**One reader, two transports.** `Features/Maps/MapGeography` reads the live universe's maps and pins - the universe's maps
with their sizes and scales, every map one entry is pinned on, pins found by name, one pin, the separation of two pins -
from the rows the map screen reads, bounded and flattened into `MapReadings`. The assistant's four tools (`list_maps`,
`search_map_locations`, `get_map_location`, `measure_map_distance`, in `AssistantTools`) and the MCP tools of the same
names (`LorexMcpMapTools`) are adapters over it: they parse arguments, shape JSON and refuse, and read nothing of their own.
A test asks both for the same two pins and compares the numbers and the words.

**A location is a pin someone placed.** `get_map_location` takes an entry id (MCP also its exact name or alias, and refuses
an ambiguous name with the candidates), and answers every map it is pinned on, by map name, each with the map opened on
the pin (`/app/universes/{u}/maps/{m}?pin={p}`; an absolute URL over MCP, a kind and ids for the assistant's sources). An
entry on no map is said to be on no map; one on several maps lists each and prefers none. `search_map_locations` finds
pins by their own titles and by the exact words of their entries' names and aliases, every match up to twenty, and
chooses nothing. A role - a capital, a seat - is resolved by the model through the recorded relationships and fields it
already reads (`get_relationships`, `get_lore`), never by the geography reader, and the assistant's ground rule 12 tells
it to ask when no entry is recorded for the role or several could be meant.

**Calibration is the creator's, per map, per picture.** `MapCalibrations`, one row keyed by the map: two points as the same
fractions a pin uses, a distance above zero, and a unit of up to 40 characters kept exactly as written - "km", "leagues",
"days' ride" are names, never converted into one another, because LoreX knows nothing about what a league is in this
world. The points must be at least a pixel apart on the displayed picture. `AssetId` records the picture the points were
chosen on; replacing the picture deletes the row in the same transaction, so a scale measured on one picture is never
applied to another, and the screen says the scale is gone. Editors and the owner set and remove it (`PUT`/`DELETE
.../maps/{m}/calibration`); it is read with the map's detail.

**A distance is a straight line on the picture, scaled, or it is not given.** For two pins on one map whose positions are
confirmed on the picture it shows, the reader takes the Euclidean distance of their fractions in pixels of the displayed
size (`hypot(dx * width, dy * height)`, isotropic whatever the picture's proportions), and - only when that picture carries a
calibration - multiplies by the creator's distance over the calibration points' own pixel separation. The result is
rounded to what a drawing can carry (whole units above a hundred, tenths above ten, hundredths below) and returned with its
unit, the method in words, the map and picture it rests on, the calibration's provenance, and the picture's own geometry
(the pixel distance and its fraction of the diagonal). Without a calibration the reading says so and gives the picture's
geometry only; on different maps it gives no numbers at all, because maps share no coordinate system; with a pin still
awaiting review after a replacement it gives no distance, because the position is unconfirmed. Never a route, a travel
time, a direction or a geodesic; never a pixel passed off as a kilometre.

**Read-only, bounded, gated.** Every tool is annotated read-only and non-destructive; nothing places, moves, calibrates or
publishes through the assistant or MCP, and any future change goes through the staged proposal workflow (ADR 0047). The
same gates as every other read apply: `Read` for the assistant, the MCP connection's gate per request, live entries only,
a pin whose entry is in the Trash reads as a pin with no entry, and an id from another universe is not found. Notes are
cut to the reader's text length; a search returns at most twenty.

**Backup version 35** carries each map's calibration with the map, validated like a save and written against the restored
picture's asset id; a version 34 file restores every map without one.

## Consequences

- One migration, `AddMapCalibrations`, a plain `DROP TABLE` rollback.
- The screen shows the scale beside the map in the creator's words, and a dashed line between the two points; it does not
  measure distances itself - the assistant and MCP are the readers, and a creator can check the scale with one question.
- A distance is only as good as the picture and the placement: the reading says "approximate" in its words every time.
- Not done, deliberately: a shared coordinate system across maps, distance across replacements, routes or travel times,
  inferring a location from a name or a picture, any write through AI, non-uniform or projected scales. A map drawn to no
  consistent scale will calibrate and measure wrongly; that is the creator's call, and the method is stated so a reader
  can judge it.
