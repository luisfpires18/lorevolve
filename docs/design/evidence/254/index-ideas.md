# Evidence for #306: ideas forms on Field

Viewport 1280 x 900, Chromium, locale en-US, light. `before` is `origin/dev`; `after` is branch `fix/ui-field-ideas`. Captured by a temporary Playwright spec that is not committed.

| Screen | Files | Result |
| --- | --- | --- |
| Ideas list (search, capture form) | `ideas-{before,after}-list.png` | byte-identical |
| New idea editor (title, body, universe) | `ideas-{before,after}-editor.png` | visually identical; files differ by 4 bytes (caret blink) |

Focused E2E: `e2e-306.txt` (27 passed, `--retries=0 --workers=2`).
