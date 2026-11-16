# Evidence for #251: one Field markup

Viewport 1280 x 900, Chromium, locale en-US. `before` is `origin/dev` 23c1eb0c; `after` is the PR head built from branch `fix/ui-one-field`. Each screen in light and dark. Captured by a temporary Playwright spec that is not committed.

| Screen | Files |
| --- | --- |
| Sign-in | `sign-in-{light,dark}-{before,after}.png` |
| Register | `register-{light,dark}-{before,after}.png` |
| Type fields drawer, kind "Link to an entity" (hint under the picker moves above it) | `type-fields-drawer-link-{light,dark}-{before,after}.png` |
| Type fields drawer, kind "Short text" (default value hint moves above the input) | `type-fields-drawer-text-{light,dark}-{before,after}.png` |
| Admin workspace | `admin-workspace-{light,dark}-{before,after}.png` |
| New story drawer, after only, light | `story-drawer-light-after.png` |
| New moment drawer, after only, light | `moment-drawer-light-after.png` |

Not captured: the entry form with an image field and QuickCreate with one eligible type (deferred owner check: look at them on DEV).
