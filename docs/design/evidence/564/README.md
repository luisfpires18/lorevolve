# Issue 564 evidence: shared parts replace duplicated UI code

Captured on the local stack (seeded world) with `.ai/tmp/audit/capture.mjs`, before from `dev` (5a10a509) and after
from this branch, at 1440 dark and 390 light. Compared per pixel (any channel differing counts).

## Pixel diff, 14 screens, 28 captures

| Screen (slug) | Changes it shows | 1440 dark | 390 light |
|---|---|---|---|
| `ideas` | C1 | 0 | 0 |
| `idea-new` | C2 | 0 | 0 |
| `world-rules` | C1 | 0 | 0 |
| `world-rule-new` | C2 | 0 | 0 |
| `entry-character` | C3, C7 | 0 | 0 |
| `entry-character-progression` | C3 (era panel) | 0 | 0 |
| `map` | C4, C5 | 0 | 0 |
| `entry-location` | C4 | 0 | 0 |
| `idea-board` | C5 | 0 | 0 |
| `lore` | C6 | 0 | 0 |
| `lore-type-character` | C6 | 0 | 0 |
| `universe-settings` | C7 (none drawn on General) | 0 | 0 |
| `drawer-type-sections` (Vessel, one section added) | M-c | 0 | 0 |
| `empty-universe-types` (Groups tab) | M-a (the universe has default groups, so the probe covers the empty line) | 0 | 0 |

Two "before" runs against each other showed capture noise on `map-390-light` (5,891 px, map area) and
`universe-settings-1440-dark` (an "updated while open" banner); the before and after runs compared here had none.

## Computed-style probe

For states no seeded screen shows, `.ai/tmp/px564/probe.mjs` puts the before and the after markup into a live page
and compares every computed property (549) and the box, in both themes.

| Case | Dark | Light |
|---|---|---|
| M-b crop dialog stage text (`cropper__stagetext` against `QuietNote spacing="flush"`) | 0 differ | 0 differ |
| M-a empty Groups line (`typegroups__empty` against `QuietNote size="body" spacing="flush"`) | 0 differ | 0 differ |
| C3 era looks list (`.eralooks` before and after the merge) | 0 differ | 0 differ |
| C7 image field input (`imagefield__input` against `imagefield__input visually-hidden`) | 0 differ | 0 differ |

## Files

Before and after of six screens: `ideas-1440-dark`, `world-rules-390-light`, `lore-1440-dark`, `map-1440-dark`,
`drawer-type-sections-1440-dark`, `entry-character-390-light` (`-before.png`, `-after.png`).
