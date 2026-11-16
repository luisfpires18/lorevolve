# Evidence for #254 part 1: stories, maps, chronology on Field

Viewport 1280 x 900, Chromium, locale en-US. `before` is `origin/dev` 73653083 (the 16 changed source files restored from it); `after` is the PR head on branch `fix/ui-remaining-fields`. Each screen in light and dark. Captured by a temporary Playwright spec that is not committed. `e2e-254.txt` is the focused run: 95 passed, exit 0.

| Screen | Files |
| --- | --- |
| Scene drawer, one beat (SceneForm, SceneBeatsField, `scenechron` fieldset) | `scene-drawer-{light,dark}-{before,after}.png` |
| Map pin drawer, placed pin (MapPinForm, position fieldset) | `pin-drawer-{light,dark}-{before,after}.png` |
| Timeline filters row (TimelinePage) | `timeline-filters-{light,dark}-{before,after}.png` |
| New moment drawer (TimelineEntryForm) | `moment-drawer-{light,dark}-{before,after}.png` |
| Periods editor, two periods (ChronologyEditor order list, `.eras__order` margin) | `periods-editor-{light,dark}-{before,after}.png` |

Every before and after pair is pixel-identical (checked with an image diff). One dark-mode timeline filters capture first differed in a 4 x 3 px patch; a second capture matched the before image exactly, so that patch was transient.
