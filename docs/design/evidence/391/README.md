# Evidence for #391: styles.css split into src/styles/

The full commands and their output are in `web-391.txt`. In short:

| Proof | Command | Result |
| --- | --- | --- |
| Source join | the plan's `node -e` join check against `git show dev:src/LorEvolve.Web/src/styles.css` | `129 parts, 129 files, IDENTICAL` |
| Built CSS | `npm run build` before and after, then `cmp` and `sha256sum` | `index-DOV0OIaf.css` and `ImageCropDialog-BY2xzm8t.css` byte-identical, same hashes |
| Dev server | `curl -s "http://localhost:5193/src/styles.css?direct"` | one inlined sheet, no `@import` directive left |
| Screenshots | Playwright, desktop 1440x900 and phone 375x812, light and dark | all 16 before and after pairs byte-identical |

Screenshots: `before-<screen>-<device>-<theme>.png` and `after-<screen>-<device>-<theme>.png`, where screen is
`signin`, `universes`, `overview` or `entry`, device is `desktop` or `phone`, and theme is `light` or `dark`.
