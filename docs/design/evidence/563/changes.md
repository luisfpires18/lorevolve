# Issue 563, second pass: every value moved

Generated from `.ai/tmp/token_all.py`. Shift: the token minus the raw value at a 16px root (0 = same size). Lines are the declaration's first line on this PR's head.

| Page | What was wrong | What changed | Shift | File |
| --- | --- | --- | --- | --- |
| every page (base) | `body` font-size `16px`, written raw instead of its token | `16px` to `var(--text-body)` | none | `001-foundation.css:196` |
| every page (base) | `.brandmark--plate` margin `1.5rem`, written raw instead of its token | `1.5rem` to `var(--space-6)` | none | `001-foundation.css:273` |
| sign in | `.auth__rule` margin `2rem`, written raw instead of its token | `2rem` to `var(--space-7)` | none | `004-auth-canvas.css:26` |
| sign in | `.auth__rule` margin `1.5rem`, written raw instead of its token | `1.5rem` to `var(--space-6)` | none | `004-auth-canvas.css:26` |
| sign in | `.auth__pitch` font-size `0.95rem`, off the scale | `0.95rem` to `var(--text-body)` | +0.8px | `004-auth-canvas.css:32` |
| sign in | `.auth__intro` margin `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `004-auth-canvas.css:59` |
| sign in | `.auth__footer` margin `2rem`, written raw instead of its token | `2rem` to `var(--space-7)` | none | `004-auth-canvas.css:64` |
| sign in | `.auth__footer` font-size `0.925rem`, off the scale | `0.925rem` to `var(--text-ui)` | -0.8px | `004-auth-canvas.css:66` |
| forms (entry, rule, idea) | `.form__aside` margin `-1rem`, written raw instead of its token | `-1rem` to `calc(-1 * var(--space-4))` | none | `005-forms.css:22` |
| forms (entry, rule, idea) | `.field__input` padding `0.45rem`, off the scale | `0.45rem` to `var(--space-2)` | +0.8px | `005-forms.css:76` |
| forms (entry, rule, idea) | `.field__input` padding `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `005-forms.css:76` |
| forms (entry, rule, idea) | `.field__input--area` padding `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `005-forms.css:117` |
| forms (entry, rule, idea) | `.field__input--select` padding-inline `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `005-forms.css:131` |
| universes | `.home__body` padding `4rem`, written raw instead of its token | `4rem` to `var(--space-9)` | none | `007-universe-home.css:143` |
| progress bars | `.progressbar__fill` transition `120ms`, written raw instead of its token | `120ms` to `var(--duration-1)` | none | `009-progress.css:21` |
| account profile | `.avatar__actions` margin-top `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `010-avatar.css:58` |
| account profile | `.avatar__hint` margin `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `010-avatar.css:71` |
| account profile | `.avatar__hint` font-size `0.75rem`, written raw instead of its token | `0.75rem` to `var(--text-xs)` | none | `010-avatar.css:73` |
| account profile | `.profile__name` margin `1.5rem`, written raw instead of its token | `1.5rem` to `var(--space-6)` | none | `010-avatar.css:82` |
| account profile | `.profile__note` margin `1.5rem`, written raw instead of its token | `1.5rem` to `var(--space-6)` | none | `010-avatar.css:87` |
| account menu | `.accountmenu__name` font-size `0.925rem`, off the scale | `0.925rem` to `var(--text-ui)` | -0.8px | `011-account-menu.css:20` |
| account menu | `.accountmenu__avatar--blank` font-size `0.95rem`, off the scale | `0.95rem` to `var(--text-body)` | +0.8px | `011-account-menu.css:140` |
| page headers | `.sectionrule` font-size `0.9375rem`, off the scale | `0.9375rem` to `var(--text-body)` | +1px | `013-page-header.css:135` |
| page headers | `.sectionrule--accent` font-size `0.8125rem`, written raw instead of its token | `0.8125rem` to `var(--text-sm)` | none | `013-page-header.css:152` |
| new universe | `.composer` margin-top `2rem`, written raw instead of its token | `2rem` to `var(--space-7)` | none | `015-create-composer.css:4` |
| new universe | `.composer__title` margin `1.5rem`, written raw instead of its token | `1.5rem` to `var(--space-6)` | none | `015-create-composer.css:15` |
| universe settings (backup) | `.quietnote.restore__lead` margin `-0.75rem`, written raw instead of its token | `-0.75rem` to `calc(-1 * var(--space-3))` | none | `016-restore-backup.css:10` |
| universe settings (backup) | `.quietnote.restore__lead` margin `1.5rem`, written raw instead of its token | `1.5rem` to `var(--space-6)` | none | `016-restore-backup.css:10` |
| universe settings (backup) | `.quietnote.restore__lead` font-size `0.925rem`, off the scale | `0.925rem` to `var(--text-ui)` | -0.8px | `016-restore-backup.css:11` |
| universe settings (backup) | `.restore__file` font-size `0.925rem`, off the scale | `0.925rem` to `var(--text-ui)` | -0.8px | `016-restore-backup.css:19` |
| universe settings (backup) | `.restore__progress` gap `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `016-restore-backup.css:36` |
| universe settings (backup) | `.restore__heading` font-size `1.1rem`, off the scale | `1.1rem` to `var(--text-item)` | +0.4px | `016-restore-backup.css:49` |
| universe settings (backup) | `.restore__issues` padding-left `1.2rem`, off the scale | `1.2rem` to `var(--space-5)` | +0.8px | `016-restore-backup.css:66` |
| universe settings (backup) | `.restore__issues` font-size `0.9rem`, off the scale | `0.9rem` to `var(--text-ui)` | -0.4px | `016-restore-backup.css:70` |
| shared controls | `.controls` gap `1.5rem`, written raw instead of its token | `1.5rem` to `var(--space-6)` | none | `018-controls.css:7` |
| shared controls | `.controls` margin `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `018-controls.css:9` |
| shared controls | `.controls` padding-bottom `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `018-controls.css:10` |
| shared controls | `.searchfield__icon` left `0.8rem`, off the scale | `0.8rem` to `var(--space-3)` | -0.8px | `018-controls.css:27` |
| shared controls | `.feedbackbutton` min-height `2.75rem`, written raw instead of its token | `2.75rem` to `var(--control-touch)` | none | `018-controls.css:55` |
| universes (plates) | `.plate__name` font-size `1.375rem`, written raw instead of its token | `1.375rem` to `var(--text-section)` | none | `019-universe-plates.css:109` |
| universe settings (collaborators) | `.collab__mark::before` font-size `1.0625rem`, off the scale | `1.0625rem` to `var(--text-item)` | +1px | `020-collaborators.css:85` |
| empty and error states | `.notice` margin `2rem`, written raw instead of its token | `2rem` to `var(--space-7)` | none | `021-states.css:4` |
| shared cards | `.pager__position` font-size `0.875rem`, written raw instead of its token | `0.875rem` to `var(--text-ui)` | none | `022-shared-surfaces.css:223` |
| shared cards | `.headingcount[data-look='pill']` margin-inline-start `0.2rem`, off the scale | `0.2rem` to `var(--space-1)` | +0.8px | `022-shared-surfaces.css:282` |
| shared cards | `.headingcount[data-look='pill']` border-radius `999px`, written raw instead of its token | `999px` to `var(--radius-full)` | none | `022-shared-surfaces.css:284` |
| universe workspace (rail, sidebar) | `.rail` gap `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `024-universe-workspace.css:24` |
| universe workspace (rail, sidebar) | `.rail` padding `1.1rem`, off the scale | `1.1rem` to `var(--space-4)` | -1.6px | `024-universe-workspace.css:25` |
| universe workspace (rail, sidebar) | `.rail__mark` height `2.5rem`, written raw instead of its token | `2.5rem` to `var(--control-md)` | none | `024-universe-workspace.css:34` |
| universe workspace (rail, sidebar) | `.rail__mark` font-size `1.35rem`, off the scale | `1.35rem` to `var(--text-section)` | +0.4px | `024-universe-workspace.css:37` |
| universe workspace (rail, sidebar) | `.sidebar__name` font-size `1.3rem`, off the scale | `1.3rem` to `var(--text-section)` | +1.2px | `024-universe-workspace.css:125` |
| universe workspace (rail, sidebar) | `.sidebar__archived` padding `0.45rem`, off the scale | `0.45rem` to `var(--space-2)` | +0.8px | `024-universe-workspace.css:143` |
| universe workspace (rail, sidebar) | `.sidebar__link[aria-current='page']::bef` top `0.45rem`, off the scale | `0.45rem` to `var(--space-2)` | +0.8px | `024-universe-workspace.css:231` |
| universe workspace (rail, sidebar) | `.sidebar__link[aria-current='page']::bef` bottom `0.45rem`, off the scale | `0.45rem` to `var(--space-2)` | +0.8px | `024-universe-workspace.css:232` |
| universe search bar | `.unisearch__icon` left `0.8rem`, off the scale | `0.8rem` to `var(--space-3)` | -0.8px | `025-universe-search-bar.css:29` |
| universe search bar | `.unisearch__input` min-height `2.75rem`, written raw instead of its token | `2.75rem` to `var(--control-touch)` | none | `025-universe-search-bar.css:38` |
| universe search bar | `.unisearch__input` padding `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `025-universe-search-bar.css:39` |
| universe search bar | `.unisearch__input` padding `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `025-universe-search-bar.css:39` |
| universe search bar | `.unisearch__note` padding `0.8rem`, off the scale | `0.8rem` to `var(--space-3)` | -0.8px | `025-universe-search-bar.css:92` |
| universe search bar | `.unisearch__note` padding `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `025-universe-search-bar.css:92` |
| universe search bar | `.unisearch__note` font-size `0.875rem`, written raw instead of its token | `0.875rem` to `var(--text-ui)` | none | `025-universe-search-bar.css:93` |
| universe search bar | `.unisearch__failure` gap `0.25rem`, written raw instead of its token | `0.25rem` to `var(--space-1)` | none | `025-universe-search-bar.css:103` |
| universe search bar | `.unisearch__failure` gap `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `025-universe-search-bar.css:103` |
| universe search bar | `.unisearch__list` padding `0.3rem`, off the scale | `0.3rem` to `var(--space-1)` | -0.8px | `025-universe-search-bar.css:114` |
| universe search bar | `.unisearch__option` padding `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `025-universe-search-bar.css:123` |
| universe search bar | `.unisearch__kind` padding-top `0.22rem`, off the scale | `0.22rem` to `var(--space-1)` | +0.48px | `025-universe-search-bar.css:138` |
| universe search bar | `.unisearch__title` font-size `1.03rem`, off the scale | `1.03rem` to `var(--text-body)` | -0.48px | `025-universe-search-bar.css:159` |
| universe search bar | `.unisearch__excerpt` font-size `0.83rem`, off the scale | `0.83rem` to `var(--text-sm)` | -0.28px | `025-universe-search-bar.css:182` |
| universe search bar | `.unisearch__where` margin-right `0.45rem`, off the scale | `0.45rem` to `var(--space-2)` | +0.8px | `025-universe-search-bar.css:189` |
| universe search bar | `.unisearch__more` padding `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `025-universe-search-bar.css:201` |
| universe search bar | `.unisearch__more` padding `0.7rem`, off the scale | `0.7rem` to `var(--space-3)` | +0.8px | `025-universe-search-bar.css:201` |
| universe search bar | `.unisearch__more` font-size `0.8rem`, off the scale | `0.8rem` to `var(--text-sm)` | +0.2px | `025-universe-search-bar.css:203` |
| universe home | `.overview__description` font-size `1.0625rem`, off the scale | `1.0625rem` to `var(--text-item)` | +1px | `026-overview.css:19` |
| universe home | `.doorway__name` font-size `1.3125rem`, off the scale | `1.3125rem` to `var(--text-section)` | +1px | `026-overview.css:125` |
| universe home | `.doorway__go` height `2rem`, written raw instead of its token | `2rem` to `var(--control-sm)` | none | `026-overview.css:142` |
| universe home | `.contents--worldBuilding .contents__list` font-size `1.3125rem`, off the scale | `1.3125rem` to `var(--text-section)` | +1px | `026-overview.css:199` |
| tabbed pages | `.tabs__tab` min-height `2.75rem`, written raw instead of its token | `2.75rem` to `var(--control-touch)` | none | `028-workspace-page-shell.css:43` |
| timeline configuration (date periods) | `.eras` margin `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `029-chronology-date-periods.css:12` |
| timeline configuration (date periods) | `.eras` gap `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `029-chronology-date-periods.css:15` |
| timeline configuration (date periods) | `.era` gap `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `029-chronology-date-periods.css:21` |
| timeline configuration (date periods) | `.era` padding `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `029-chronology-date-periods.css:22` |
| timeline configuration (date periods) | `.era` padding `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `029-chronology-date-periods.css:22` |
| timeline configuration (date periods) | `.era__fields` gap `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `029-chronology-date-periods.css:39` |
| timeline configuration (date periods) | `.era__foot` gap `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `029-chronology-date-periods.css:68` |
| timeline configuration (date periods) | `.era__foot` gap `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `029-chronology-date-periods.css:68` |
| timeline configuration (date periods) | `.era__use` font-size `0.8rem`, off the scale | `0.8rem` to `var(--text-sm)` | +0.2px | `029-chronology-date-periods.css:74` |
| timeline configuration (date periods) | `.eras__order` margin `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `029-chronology-date-periods.css:97` |
| timeline configuration (date periods) | `.eras__line` font-size `1.05rem`, off the scale | `1.05rem` to `var(--text-body)` | -0.8px | `029-chronology-date-periods.css:109` |
| timeline configuration (date periods) | `.eras__line li + li::before` font-size `0.8rem`, off the scale | `0.8rem` to `var(--text-sm)` | +0.2px | `029-chronology-date-periods.css:120` |
| timeline configuration (date periods) | `.eras__actions` margin-top `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `029-chronology-date-periods.css:125` |
| timeline configuration (calendar) | `.month` gap `0.25rem`, written raw instead of its token | `0.25rem` to `var(--space-1)` | none | `030-calendar.css:34` |
| timeline configuration (calendar) | `.month` gap `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `030-calendar.css:34` |
| timeline configuration (calendar) | `.month` padding `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `030-calendar.css:35` |
| timeline configuration (calendar) | `.month` padding `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `030-calendar.css:35` |
| timeline configuration (calendar) | `.month__ordinal` font-size `1.05rem`, off the scale | `1.05rem` to `var(--text-body)` | -0.8px | `030-calendar.css:45` |
| timeline configuration (calendar) | `.month__fields` gap `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `030-calendar.css:54` |
| timeline configuration (calendar) | `.month__fields` gap `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `030-calendar.css:54` |
| timeline configuration (calendar) | `.month__use` font-size `0.8rem`, off the scale | `0.8rem` to `var(--text-sm)` | +0.2px | `030-calendar.css:69` |
| timeline configuration (calendar) | `.month__readname` font-size `1.05rem`, off the scale | `1.05rem` to `var(--text-body)` | -0.8px | `030-calendar.css:98` |
| timeline configuration (calendar) | `.month__ordinal` padding-top `1.6rem`, off the scale | `1.6rem` to `var(--space-6)` | -1.6px | `030-calendar.css:110` |
| timeline configuration (calendar) | `.month__tools` margin-top `-0.25rem`, written raw instead of its token | `-0.25rem` to `calc(-1 * var(--space-1))` | none | `030-calendar.css:124` |
| lore | `.lore__filtercount` padding `0.3rem`, off the scale | `0.3rem` to `var(--space-1)` | -0.8px | `031-lore-browser.css:51` |
| lore | `.lore__exact` padding `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `031-lore-browser.css:105` |
| mass create | `.masscreate__input` padding-block `0.2rem`, off the scale | `0.2rem` to `var(--space-1)` | +0.8px | `033-mass-create.css:135` |
| mass create | `.masscreate__number` padding-top `0.7rem`, off the scale | `0.7rem` to `var(--space-3)` | +0.8px | `033-mass-create.css:194` |
| lore types navigation | `.typeswitch__count` padding `0.3rem`, off the scale | `0.3rem` to `var(--space-1)` | -0.8px | `034-lore-types-navigation.css:123` |
| lore cards | `.entitycard__excerpt mark` border-radius `2px`, off the scale | `2px` to `var(--radius-xs)` | +1px | `035-lore-cards.css:191` |
| lore front page | `.lorecatalog__groupcount` padding `0.3rem`, off the scale | `0.3rem` to `var(--space-1)` | -0.8px | `037-lore-front-page.css:92` |
| lore on a phone | `.controls__filters` gap `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `039-lore-phone.css:140` |
| lore on a phone | `.check` gap `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `039-lore-phone.css:151` |
| lore on a phone | `.check` font-size `0.9rem`, off the scale | `0.9rem` to `var(--text-ui)` | -0.4px | `039-lore-phone.css:152` |
| lore on a phone | `.dossier__tags` margin `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `039-lore-phone.css:164` |
| entry article | `.entry__summary` font-size `1.0625rem`, off the scale | `1.0625rem` to `var(--text-item)` | +1px | `040-entry-lore-article.css:101` |
| entry article | `.entry__summaryinput` padding `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `040-entry-lore-article.css:115` |
| entry article | `.entry__summaryinput` padding `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `040-entry-lore-article.css:115` |
| entry page | `.entry__view` margin-top `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `041-entry-page.css:156` |
| entry page | `.entry__view > .relations, .entry__view ` margin-top `1.5rem`, written raw instead of its token | `1.5rem` to `var(--space-6)` | none | `041-entry-page.css:161` |
| entry page | `.fieldsection__chevron` transition `120ms`, written raw instead of its token | `120ms` to `var(--duration-1)` | none | `041-entry-page.css:230` |
| entry form | `.entrycopy__links` padding-inline-start `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `042-entry-form.css:69` |
| picture viewer | `.viewer` color `#f0ece3`, a raw colour | `#f0ece3` to `var(--plate-ink)` | none in light; in dark the token is `#e9e6e0`, 7 levels darker | `043-picture-whole.css:18` |
| picture viewer | `.viewer__close` color `#f0ece3`, a raw colour | `#f0ece3` to `var(--plate-ink)` | none in light; in dark the token is `#e9e6e0`, 7 levels darker | `043-picture-whole.css:52` |
| picture viewer | `.viewer__close:focus-visible` outline-color `#f0ece3`, a raw colour | `#f0ece3` to `var(--plate-ink)` | none in light; in dark the token is `#e9e6e0`, 7 levels darker | `043-picture-whole.css:61` |
| picture viewer | `.viewer[open]` animation `160ms`, off the scale | `160ms` to `var(--duration-2)` | +20ms | `043-picture-whole.css:84` |
| text editor | `.editor__bar` gap `0.25rem`, written raw instead of its token | `0.25rem` to `var(--space-1)` | none | `045-tiptap.css:23` |
| text editor | `.editor__tool` padding `0.25rem`, written raw instead of its token | `0.25rem` to `var(--space-1)` | none | `045-tiptap.css:31` |
| text editor | `.editor__tool` padding `0.55rem`, off the scale | `0.55rem` to `var(--space-2)` | -0.8px | `045-tiptap.css:31` |
| text editor | `.editor__tool` font-size `0.8rem`, off the scale | `0.8rem` to `var(--text-sm)` | +0.2px | `045-tiptap.css:33` |
| text editor | `.editor__surface` padding `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `045-tiptap.css:49` |
| text editor | `.editor__surface, .article__body` font-size `1.125rem`, written raw instead of its token | `1.125rem` to `var(--text-item)` | none | `045-tiptap.css:63` |
| text editor | `.editor__surface > * + *, .article__body` margin-top `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `045-tiptap.css:74` |
| text editor | `.editor__surface h1, .editor__surface h2` margin-top `2rem`, written raw instead of its token | `2rem` to `var(--space-7)` | none | `045-tiptap.css:86` |
| text editor | `.editor__surface h3, .article__body h3` font-size `1.2rem`, off the scale | `1.2rem` to `var(--text-item)` | -1.2px | `045-tiptap.css:96` |
| text editor | `.editor__surface blockquote, .article__b` padding-left `1.1rem`, off the scale | `1.1rem` to `var(--space-4)` | -1.6px | `045-tiptap.css:102` |
| text editor | `.editor__surface ul, .editor__surface ol` padding-left `1.4rem`, off the scale | `1.4rem` to `var(--space-6)` | +1.6px | `045-tiptap.css:112` |
| entry article | `.article__head` gap `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `046-article.css:8` |
| entry article | `.article__head` gap `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `046-article.css:8` |
| entry article | `.article__head` margin-bottom `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `046-article.css:10` |
| entry article | `.article__note` margin `-0.25rem`, written raw instead of its token | `-0.25rem` to `calc(-1 * var(--space-1))` | none | `046-article.css:70` |
| entry article | `.article__note` margin `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `046-article.css:70` |
| entry article | `.article__note` font-size `0.85rem`, off the scale | `0.85rem` to `var(--text-ui)` | +0.4px | `046-article.css:72` |
| entry article | `.article__bar` gap `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `046-article.css:85` |
| entry article | `.article__bar` padding `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `046-article.css:87` |
| entry article | `.article__status` font-size `0.85rem`, off the scale | `0.85rem` to `var(--text-ui)` | +0.4px | `046-article.css:94` |
| entry article | `.article__failure` margin `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `046-article.css:109` |
| entry article | `.editconflict__text, .editconflict__hint` font-size `0.925rem`, off the scale | `0.925rem` to `var(--text-ui)` | -0.8px | `046-article.css:128` |
| entry article | `.editconflict__actions` margin-top `0.7rem`, off the scale | `0.7rem` to `var(--space-3)` | +0.8px | `046-article.css:136` |
| entry article | `.editconflict__heading` margin `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `046-article.css:146` |
| entry article | `.editconflict__heading` font-size `1rem`, written raw instead of its token | `1rem` to `var(--text-body)` | none | `046-article.css:147` |
| entry article | `.editconflict__latesttext` padding `0.8rem`, off the scale | `0.8rem` to `var(--space-3)` | -0.8px | `046-article.css:153` |
| entry article | `.changelist__row` gap `0.2rem`, off the scale | `0.2rem` to `var(--space-1)` | +0.8px | `046-article.css:169` |
| entry article | `.changelist__row` padding `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `046-article.css:170` |
| entry article | `.changelist__value` gap `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `046-article.css:184` |
| entry article | `.article__history` margin-top `1.5rem`, written raw instead of its token | `1.5rem` to `var(--space-6)` | none | `046-article.css:201` |
| entry article | `.article__history .history__list` margin-top `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `046-article.css:205` |
| recovered drafts | `.recovery__title` font-size `0.78rem`, off the scale | `0.78rem` to `var(--text-xs)` | -0.48px | `047-recovered-drafts.css:14` |
| recovered drafts | `.recovery__text` font-size `0.925rem`, off the scale | `0.925rem` to `var(--text-ui)` | -0.8px | `047-recovered-drafts.css:22` |
| recovered drafts | `.recovery__hint` font-size `0.85rem`, off the scale | `0.85rem` to `var(--text-ui)` | +0.4px | `047-recovered-drafts.css:28` |
| recovered drafts | `.recovery__actions` margin-top `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `047-recovered-drafts.css:32` |
| recovered drafts | `.recovery__preview` padding `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `047-recovered-drafts.css:40` |
| recovered drafts | `.recovery__prose` font-size `1rem`, written raw instead of its token | `1rem` to `var(--text-body)` | none | `047-recovered-drafts.css:54` |
| recovered drafts | `.recovery__warning` font-size `0.8rem`, off the scale | `0.8rem` to `var(--text-sm)` | +0.2px | `047-recovered-drafts.css:62` |
| recovered drafts | `.snapshot__article` margin `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `047-recovered-drafts.css:67` |
| recovered drafts | `.snapshot__article` padding-top `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `047-recovered-drafts.css:68` |
| recovered drafts | `.snapshot__articlenote` margin `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `047-recovered-drafts.css:73` |
| recovered drafts | `.snapshot__articlenote` font-size `0.8rem`, off the scale | `0.8rem` to `var(--text-sm)` | +0.2px | `047-recovered-drafts.css:74` |
| entry tokens | `.tokens` padding `0.3rem`, off the scale | `0.3rem` to `var(--space-1)` | -0.8px | `048-tokens.css:9` |
| entry tokens | `.token` gap `0.3rem`, off the scale | `0.3rem` to `var(--space-1)` | -0.8px | `048-tokens.css:30` |
| entry tokens | `.token` padding `0.2rem`, off the scale | `0.2rem` to `var(--space-1)` | +0.8px | `048-tokens.css:34` |
| entry tokens | `.token` padding `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `048-tokens.css:34` |
| entry tokens | `.token__remove` padding `0.25rem`, written raw instead of its token | `0.25rem` to `var(--space-1)` | none | `048-tokens.css:46` |
| universe types | `.types__handle` height `2rem`, written raw instead of its token | `2rem` to `var(--control-sm)` | none | `049-types.css:76` |
| universe types | `.types__fieldcount` padding `0.3rem`, off the scale | `0.3rem` to `var(--space-1)` | -0.8px | `050-types-2.css:29` |
| type icon picker | `.types__group` gap `0.25rem`, written raw instead of its token | `0.25rem` to `var(--space-1)` | none | `051-type-icon-picker.css:103` |
| type icon picker | `.fieldlist__name` font-size `0.95rem`, off the scale | `0.95rem` to `var(--text-body)` | +0.8px | `051-type-icon-picker.css:185` |
| type icon picker | `.types__new` gap `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `052-type-icon-picker-2.css:76` |
| type icon picker | `.types__new` margin-top `2rem`, written raw instead of its token | `2rem` to `var(--space-7)` | none | `052-type-icon-picker-2.css:81` |
| type icon picker | `.types__new` padding-top `1.5rem`, written raw instead of its token | `1.5rem` to `var(--space-6)` | none | `052-type-icon-picker-2.css:82` |
| entry relations | `.relations` padding-top `1.5rem`, written raw instead of its token | `1.5rem` to `var(--space-6)` | none | `053-relations.css:11` |
| relation form | `.relform` margin `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `054-relation-form.css:4` |
| relation form | `.relform` padding `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `054-relation-form.css:5` |
| relation form | `.relform` gap `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `054-relation-form.css:10` |
| relation form | `.relform__reads` font-size `1.15rem`, off the scale | `1.15rem` to `var(--text-item)` | -0.4px | `054-relation-form.css:18` |
| relation form | `.relform__grid` gap `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `054-relation-form.css:33` |
| entry history | `.history` padding-top `1.5rem`, written raw instead of its token | `1.5rem` to `var(--space-6)` | none | `055-entry-history.css:7` |
| entry history | `.history__head .panelhead__title` font-size `1.35rem`, off the scale | `1.35rem` to `var(--text-section)` | +0.4px | `055-entry-history.css:13` |
| entry history | `.history__quiet` margin `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `055-entry-history.css:17` |
| entry history | `.history__list` margin `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `055-entry-history.css:23` |
| entry history | `.version` gap `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `055-entry-history.css:31` |
| entry history | `.version__when` padding `0.2rem`, off the scale | `0.2rem` to `var(--space-1)` | +0.8px | `055-entry-history.css:40` |
| entry history | `.version__when` padding `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `055-entry-history.css:40` |
| entry history | `.version__snapshot` margin `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `055-entry-history.css:98` |
| entry history | `.version__snapshot` margin `0.25rem`, written raw instead of its token | `0.25rem` to `var(--space-1)` | none | `055-entry-history.css:98` |
| entry history | `.version__snapshot` padding `1.1rem`, off the scale | `1.1rem` to `var(--space-4)` | -1.6px | `055-entry-history.css:99` |
| entry history | `.version__snapshot` padding `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `055-entry-history.css:99` |
| entry history | `.version__snapshot` padding `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `055-entry-history.css:99` |
| entry history | `.snapshot__name` font-size `1.4rem`, off the scale | `1.4rem` to `var(--text-section)` | -0.4px | `055-entry-history.css:108` |
| entry history | `.snapshot__kind` margin `0.2rem`, off the scale | `0.2rem` to `var(--space-1)` | +0.8px | `055-entry-history.css:114` |
| entry history on a phone | `.version__tools` gap `1.1rem`, off the scale | `1.1rem` to `var(--space-4)` | -1.6px | `056-history-narrow.css:23` |
| entry history on a phone | `.version__snapshot` padding `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `056-history-narrow.css:27` |
| entity picker | `.picker__chosen` gap `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `057-entity-picker.css:11` |
| entity picker | `.picker__chosenname` font-size `1.0625rem`, off the scale | `1.0625rem` to `var(--text-item)` | +1px | `057-entity-picker.css:19` |
| entity picker | `.picker__list` z-index `20`, written raw instead of its token | `20` to `var(--z-dropdown)` | none | `057-entity-picker.css:25` |
| entity picker | `.picker__option` gap `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `057-entity-picker.css:46` |
| entity picker | `.picker__option` padding `0.45rem`, off the scale | `0.45rem` to `var(--space-2)` | +0.8px | `057-entity-picker.css:47` |
| entity picker | `.picker__none` padding `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `057-entity-picker.css:71` |
| entity picker | `.picker__none` padding `0.7rem`, off the scale | `0.7rem` to `var(--space-3)` | +0.8px | `057-entity-picker.css:71` |
| entity picker | `.picker__none` font-size `0.875rem`, written raw instead of its token | `0.875rem` to `var(--text-ui)` | none | `057-entity-picker.css:72` |
| relation kinds | `.reltypes` padding-top `1.5rem`, written raw instead of its token | `1.5rem` to `var(--space-6)` | none | `058-relation-kinds.css:5` |
| relation kinds | `.reltype__form` gap `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `058-relation-kinds.css:12` |
| relation kinds | `.reltype__form` margin `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `058-relation-kinds.css:13` |
| relation kinds | `.reltype__form` padding `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `058-relation-kinds.css:14` |
| relation kinds | `.reltype__canon` gap `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `058-relation-kinds.css:27` |
| relation kinds | `.reltype__canon` margin `0.25rem`, written raw instead of its token | `0.25rem` to `var(--space-1)` | none | `058-relation-kinds.css:29` |
| relation kinds | `.reltype__legend` margin-bottom `0.25rem`, written raw instead of its token | `0.25rem` to `var(--space-1)` | none | `058-relation-kinds.css:36` |
| relation kinds | `.reltype__legend` padding `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `058-relation-kinds.css:37` |
| relation kinds | `.reltype__legend` font-size `0.9rem`, off the scale | `0.9rem` to `var(--text-ui)` | -0.4px | `058-relation-kinds.css:39` |
| relation kinds | `.reltype__direction` font-size `0.85rem`, off the scale | `0.85rem` to `var(--text-ui)` | +0.4px | `058-relation-kinds.css:50` |
| relation kinds | `.reltype__gaps` gap `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `058-relation-kinds.css:63` |
| narrow screens | `.auth__plate` padding `1.5rem`, written raw instead of its token | `1.5rem` to `var(--space-6)` | none | `060-narrow-screens.css:11` |
| narrow screens | `.auth__rule` margin `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `060-narrow-screens.css:19` |
| narrow screens | `.auth__rule` margin `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `060-narrow-screens.css:19` |
| narrow screens | `.auth__panel` padding `1.5rem`, written raw instead of its token | `1.5rem` to `var(--space-6)` | none | `060-narrow-screens.css:23` |
| workspace on a phone | `.rail` padding `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `061-workspace-narrow.css:27` |
| workspace on a phone | `.rail` padding `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `061-workspace-narrow.css:27` |
| workspace on a phone | `.rail__where` font-size `0.8rem`, off the scale | `0.8rem` to `var(--text-sm)` | +0.2px | `061-workspace-narrow.css:51` |
| workspace on a phone | `.rail__section` font-size `0.85rem`, off the scale | `0.85rem` to `var(--text-ui)` | +0.4px | `061-workspace-narrow.css:69` |
| workspace on a phone | `.rail__archived` padding `0.3rem`, off the scale | `0.3rem` to `var(--space-1)` | -0.8px | `061-workspace-narrow.css:93` |
| workspace on a phone | `.rail__toggle` padding `0.25rem`, written raw instead of its token | `0.25rem` to `var(--space-1)` | none | `061-workspace-narrow.css:103` |
| workspace on a phone | `.rail__toggle` padding `0.8rem`, off the scale | `0.8rem` to `var(--space-3)` | -0.8px | `061-workspace-narrow.css:103` |
| workspace on a phone | `.rail__toggle` font-size `0.8rem`, off the scale | `0.8rem` to `var(--text-sm)` | +0.2px | `061-workspace-narrow.css:109` |
| workspace on a phone | `.unisearch__input` padding-top `0.3rem`, off the scale | `0.3rem` to `var(--space-1)` | -0.8px | `061-workspace-narrow.css:246` |
| workspace on a phone | `.unisearch__input` padding-bottom `0.3rem`, off the scale | `0.3rem` to `var(--space-1)` | -0.8px | `061-workspace-narrow.css:247` |
| workspace on a phone | `.unisearch__option` padding `0.7rem`, off the scale | `0.7rem` to `var(--space-3)` | +0.8px | `061-workspace-narrow.css:256` |
| workspace on a phone | `.unisearch__input` min-height `2.75rem`, written raw instead of its token | `2.75rem` to `var(--control-touch)` | none | `061-workspace-narrow.css:266` |
| timeline | `.chron__stream` margin-top `2rem`, written raw instead of its token | `2rem` to `var(--space-7)` | none | `062-chronology.css:18` |
| timeline | `.chron__group` column-gap `2rem`, written raw instead of its token | `2rem` to `var(--space-7)` | none | `062-chronology.css:24` |
| timeline | `.chron__year` top `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `062-chronology.css:33` |
| timeline | `.chron__era` margin-top `0.2rem`, off the scale | `0.2rem` to `var(--space-1)` | +0.8px | `062-chronology.css:56` |
| timeline | `.chron__group--unplaced` padding-top `2rem`, written raw instead of its token | `2rem` to `var(--space-7)` | none | `062-chronology.css:73` |
| timeline | `.chron__aside` margin `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `062-chronology.css:78` |
| timeline | `.chron__aside` font-size `0.85rem`, off the scale | `0.85rem` to `var(--text-ui)` | +0.4px | `062-chronology.css:79` |
| timeline | `.chron__group:last-child .moment:last-ch` padding-bottom `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `062-chronology.css:96` |
| timeline | `.moment__stamp` gap `0.25rem`, written raw instead of its token | `0.25rem` to `var(--space-1)` | none | `062-chronology.css:135` |
| timeline | `.moment__stamp` gap `0.7rem`, off the scale | `0.7rem` to `var(--space-3)` | +0.8px | `062-chronology.css:135` |
| timeline | `.moment__when` font-size `0.95rem`, off the scale | `0.95rem` to `var(--text-body)` | +0.8px | `062-chronology.css:141` |
| timeline | `.moment__account` font-size `0.95rem`, off the scale | `0.95rem` to `var(--text-body)` | +0.8px | `062-chronology.css:162` |
| timeline | `.chron__controls` margin-top `1.5rem`, written raw instead of its token | `1.5rem` to `var(--space-6)` | none | `063-unified-timeline.css:9` |
| timeline | `.moment__links` gap `0.25rem`, written raw instead of its token | `0.25rem` to `var(--space-1)` | none | `063-unified-timeline.css:45` |
| timeline | `.moment__links` gap `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `063-unified-timeline.css:45` |
| moment drawer | `.momentform__point` gap `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `066-moment-drawer.css:102` |
| moment drawer | `.fieldera` gap `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `066-moment-drawer.css:115` |
| stories | `.storyrow` gap `0.3rem`, off the scale | `0.3rem` to `var(--space-1)` | -0.8px | `067-stories.css:26` |
| stories | `.storyrow` gap `1.5rem`, written raw instead of its token | `1.5rem` to `var(--space-6)` | none | `067-stories.css:26` |
| stories | `.storyrow__meta` gap `0.3rem`, off the scale | `0.3rem` to `var(--space-1)` | -0.8px | `067-stories.css:47` |
| stories | `.storyrow__premise` font-size `0.9rem`, off the scale | `0.9rem` to `var(--text-ui)` | -0.4px | `067-stories.css:56` |
| stories | `.empty__actions` margin-top `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `067-stories.css:110` |
| story manuscript | `.manuscript` margin-top `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `072-story-manuscript.css:9` |
| story manuscript | `.manuscript__text` margin-top `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `072-story-manuscript.css:28` |
| story manuscript | `.manuscript__text` padding `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `072-story-manuscript.css:29` |
| story manuscript | `.manuscript__text` padding `1.5rem`, written raw instead of its token | `1.5rem` to `var(--space-6)` | none | `072-story-manuscript.css:29` |
| story manuscript | `.manuscript__text` font-size `1.125rem`, written raw instead of its token | `1.125rem` to `var(--text-item)` | none | `072-story-manuscript.css:35` |
| story manuscript | `.namelinker` margin `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `072-story-manuscript.css:80` |
| story manuscript | `.mentionsuggest__option` min-height `2.75rem`, written raw instead of its token | `2.75rem` to `var(--control-touch)` | none | `072-story-manuscript.css:114` |
| story manuscript | `.manuscript__bar` gap `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `073-story-manuscript-2.css:22` |
| story manuscript | `.manuscript__bar` padding `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `073-story-manuscript-2.css:23` |
| story manuscript | `.manuscript__recovery .recovery, .manusc` margin `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `073-story-manuscript-2.css:31` |
| story manuscript | `.manuscript__text` padding `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `073-story-manuscript-2.css:50` |
| story manuscript | `.manuscript__text` font-size `1.0625rem`, off the scale | `1.0625rem` to `var(--text-item)` | +1px | `073-story-manuscript-2.css:51` |
| canon integrity | `.integrity__run` margin `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `076-canon-integrity.css:27` |
| canon integrity | `.integrity__run` font-size `0.85rem`, off the scale | `0.85rem` to `var(--text-ui)` | +0.4px | `076-canon-integrity.css:28` |
| canon integrity | `.integrity__ledger` margin `2rem`, written raw instead of its token | `2rem` to `var(--space-7)` | none | `076-canon-integrity.css:35` |
| canon integrity | `.finding:last-child` padding-bottom `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `076-canon-integrity.css:48` |
| canon integrity | `.finding__mark` top `0.2rem`, off the scale | `0.2rem` to `var(--space-1)` | +0.8px | `076-canon-integrity.css:61` |
| canon integrity | `.finding:last-child .finding__mark` bottom `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `076-canon-integrity.css:68` |
| canon integrity | `.finding__stamp` gap `0.3rem`, off the scale | `0.3rem` to `var(--space-1)` | -0.8px | `076-canon-integrity.css:123` |
| canon integrity | `.finding__stamp` gap `0.7rem`, off the scale | `0.7rem` to `var(--space-3)` | +0.8px | `076-canon-integrity.css:123` |
| canon integrity | `.finding__title` margin `0.3rem`, off the scale | `0.3rem` to `var(--space-1)` | -0.8px | `076-canon-integrity.css:143` |
| canon integrity | `.finding__account` margin `0.7rem`, off the scale | `0.7rem` to `var(--space-3)` | +0.8px | `076-canon-integrity.css:148` |
| canon integrity | `.finding__subjects` gap `0.2rem`, off the scale | `0.2rem` to `var(--space-1)` | +0.8px | `076-canon-integrity.css:158` |
| canon integrity | `.finding__subjects` margin `0.7rem`, off the scale | `0.7rem` to `var(--space-3)` | +0.8px | `076-canon-integrity.css:159` |
| refused AI writes | `.refusal__eyebrow` margin `0.3rem`, off the scale | `0.3rem` to `var(--space-1)` | -0.8px | `077-refused-write.css:16` |
| refused AI writes | `.refusal__title` font-size `1.15rem`, off the scale | `1.15rem` to `var(--text-item)` | -0.4px | `077-refused-write.css:25` |
| refused AI writes | `.refusal__lede` font-size `0.88rem`, off the scale | `0.88rem` to `var(--text-ui)` | -0.08px | `077-refused-write.css:30` |
| refused AI writes | `.refusal__findings` margin `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `077-refused-write.css:35` |
| refused AI writes | `.refusal__what` margin `0.3rem`, off the scale | `0.3rem` to `var(--space-1)` | -0.8px | `077-refused-write.css:61` |
| refused AI writes | `.refusal__what` font-size `1rem`, written raw instead of its token | `1rem` to `var(--text-body)` | none | `077-refused-write.css:64` |
| refused AI writes | `.refusal__account` margin `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `077-refused-write.css:69` |
| refused AI writes | `.refusal__account` font-size `0.88rem`, off the scale | `0.88rem` to `var(--text-ui)` | -0.08px | `077-refused-write.css:70` |
| refused AI writes | `.refusal__subjects` gap `0.2rem`, off the scale | `0.2rem` to `var(--space-1)` | +0.8px | `077-refused-write.css:78` |
| refused AI writes | `.refusal__subjects` gap `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `077-refused-write.css:78` |
| refused AI writes | `.refusal__subjects` font-size `0.82rem`, off the scale | `0.82rem` to `var(--text-sm)` | -0.12px | `077-refused-write.css:81` |
| refused AI writes | `.refusal__aside` margin `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `077-refused-write.css:85` |
| refused AI writes | `.refusal__aside` padding-top `0.8rem`, off the scale | `0.8rem` to `var(--space-3)` | -0.8px | `077-refused-write.css:86` |
| refused AI writes | `.refusal__aside` font-size `0.8rem`, off the scale | `0.8rem` to `var(--text-sm)` | +0.2px | `077-refused-write.css:88` |
| trash | `.trash__outcome` gap `0.25rem`, written raw instead of its token | `0.25rem` to `var(--space-1)` | none | `079-trash.css:124` |
| trash | `.trash__outcome` gap `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `079-trash.css:124` |
| trash | `.trash__bulkconsequences` padding-left `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `079-trash.css:204` |
| touch screens | `.token` padding `0.2rem`, off the scale | `0.2rem` to `var(--space-1)` | +0.8px | `080-touch.css:16` |
| touch screens | `.token` padding `0.2rem`, off the scale | `0.2rem` to `var(--space-1)` | +0.8px | `080-touch.css:16` |
| touch screens | `.token` padding `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `080-touch.css:16` |
| touch screens | `.editor__tool, .segmented__option` min-height `2.75rem`, written raw instead of its token | `2.75rem` to `var(--control-touch)` | none | `080-touch.css:29` |
| touch screens | `.iconpicker__choice` min-height `2.75rem`, written raw instead of its token | `2.75rem` to `var(--control-touch)` | none | `080-touch.css:45` |
| touch screens | `.rail__mark` min-height `2.75rem`, written raw instead of its token | `2.75rem` to `var(--control-touch)` | none | `080-touch.css:64` |
| touch screens | `.tokens__input` min-height `2.5rem`, written raw instead of its token | `2.5rem` to `var(--control-md)` | none | `080-touch.css:71` |
| touch screens | `.crumb a, .relation__name, .finding__sub` padding-top `0.45rem`, off the scale | `0.45rem` to `var(--space-2)` | +0.8px | `080-touch.css:81` |
| touch screens | `.crumb a, .relation__name, .finding__sub` padding-bottom `0.45rem`, off the scale | `0.45rem` to `var(--space-2)` | +0.8px | `080-touch.css:82` |
| touch screens | `.lorechip` padding-top `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `080-touch.css:99` |
| touch screens | `.lorechip` padding-bottom `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `080-touch.css:100` |
| ideas | `.ideas__notice` margin `1.5rem`, written raw instead of its token | `1.5rem` to `var(--space-6)` | none | `081-ideas.css:13` |
| ideas | `.ideas__controls` margin-top `2rem`, written raw instead of its token | `2rem` to `var(--space-7)` | none | `081-ideas.css:17` |
| ideas | `.ideacapture` margin-top `2rem`, written raw instead of its token | `2rem` to `var(--space-7)` | none | `081-ideas.css:35` |
| ideas | `.ideacapture + .ideas__controls` margin-top `1.5rem`, written raw instead of its token | `1.5rem` to `var(--space-6)` | none | `081-ideas.css:67` |
| ideas | `.idearow` gap `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `081-ideas.css:89` |
| ideas | `.idearow` gap `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `081-ideas.css:89` |
| ideas | `.idearow` padding `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `081-ideas.css:90` |
| ideas | `.idearow__main` gap `0.3rem`, off the scale | `0.3rem` to `var(--space-1)` | -0.8px | `081-ideas.css:99` |
| ideas | `.idearow__excerpt, .rulerow__excerpt` font-size `0.9rem`, off the scale | `0.9rem` to `var(--text-ui)` | -0.4px | `081-ideas.css:124` |
| ideas | `.idearow__meta` gap `0.25rem`, written raw instead of its token | `0.25rem` to `var(--space-1)` | none | `081-ideas.css:139` |
| ideas | `.idearow__meta` font-size `0.78rem`, off the scale | `0.78rem` to `var(--text-xs)` | -0.48px | `081-ideas.css:140` |
| ideas | `.idearow__universe` padding `0.45rem`, off the scale | `0.45rem` to `var(--space-2)` | +0.8px | `081-ideas.css:150` |
| ideas | `.idea__failure` margin-top `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `081-ideas.css:186` |
| ideas | `.idea__form, .rule__form` gap `1.6rem`, off the scale | `1.6rem` to `var(--space-6)` | -1.6px | `081-ideas.css:194` |
| ideas | `.idea__form, .rule__form` margin-top `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `081-ideas.css:195` |
| ideas | `.idea__body` font-size `1rem`, written raw instead of its token | `1rem` to `var(--text-body)` | none | `081-ideas.css:200` |
| ideas | `.idea__count` margin `0.45rem`, off the scale | `0.45rem` to `var(--space-2)` | +0.8px | `081-ideas.css:210` |
| ideas | `.idea__subheading` font-size `0.85rem`, off the scale | `0.85rem` to `var(--text-ui)` | +0.4px | `081-ideas.css:222` |
| ideas | `.idea__noreferences` font-size `0.9rem`, off the scale | `0.9rem` to `var(--text-ui)` | -0.4px | `081-ideas.css:229` |
| ideas | `.idearef` gap `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `081-ideas.css:243` |
| ideas | `.idearef` gap `0.8rem`, off the scale | `0.8rem` to `var(--space-3)` | -0.8px | `081-ideas.css:243` |
| ideas | `.dochead` margin-bottom `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `081-ideas.css:251` |
| ideas | `.dochead__back` font-size `0.875rem`, written raw instead of its token | `0.875rem` to `var(--text-ui)` | none | `081-ideas.css:256` |
| ideas | `.dochead__title` margin `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `081-ideas.css:273` |
| ideas | `.dochead__lede` font-size `0.875rem`, written raw instead of its token | `0.875rem` to `var(--text-ui)` | none | `081-ideas.css:283` |
| idea | `.idearef__name` font-size `0.95rem`, off the scale | `0.95rem` to `var(--text-body)` | +0.8px | `082-ideas-2.css:20` |
| idea | `.idearef__context` font-size `0.78rem`, off the scale | `0.78rem` to `var(--text-xs)` | -0.48px | `082-ideas-2.css:30` |
| idea | `.idearef__trashed` font-size `0.78rem`, off the scale | `0.78rem` to `var(--text-xs)` | -0.48px | `082-ideas-2.css:36` |
| idea | `.idea__previewtitle` margin `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `082-ideas-2.css:54` |
| idea | `.ideapicker__notice` margin `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `082-ideas-2.css:61` |
| idea | `.ideapicker__option` gap `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `082-ideas-2.css:74` |
| idea | `.ideapicker__context` font-size `0.78rem`, off the scale | `0.78rem` to `var(--text-xs)` | -0.48px | `082-ideas-2.css:103` |
| idea | `.ideapicker__state` font-size `0.8rem`, off the scale | `0.8rem` to `var(--text-sm)` | +0.2px | `082-ideas-2.css:111` |
| idea | `.idearef__remove` min-height `2.5rem`, written raw instead of its token | `2.5rem` to `var(--control-md)` | none | `082-ideas-2.css:141` |
| world rules | `.rules__notice` margin `1.5rem`, written raw instead of its token | `1.5rem` to `var(--space-6)` | none | `083-world-rules.css:13` |
| world rules | `.rulelist` margin `2rem`, written raw instead of its token | `2rem` to `var(--space-7)` | none | `083-world-rules.css:23` |
| world rules | `.rulerow` gap `0.3rem`, off the scale | `0.3rem` to `var(--space-1)` | -0.8px | `083-world-rules.css:32` |
| world rules | `.rulerow` padding `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `083-world-rules.css:34` |
| world rules | `.rulerow__meta` font-size `0.78rem`, off the scale | `0.78rem` to `var(--text-xs)` | -0.48px | `083-world-rules.css:70` |
| world rules | `.rule__failure` margin-top `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `083-world-rules.css:80` |
| world rules | `.rule__description` font-size `1rem`, written raw instead of its token | `1rem` to `var(--text-body)` | none | `083-world-rules.css:85` |
| world rules | `.rule__count` margin `0.45rem`, off the scale | `0.45rem` to `var(--space-2)` | +0.8px | `083-world-rules.css:90` |
| world rule checks | `.rule__legend` margin-bottom `0.25rem`, written raw instead of its token | `0.25rem` to `var(--space-1)` | none | `084-world-rule-checks.css:23` |
| world rule checks | `.rule__legend` padding `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `084-world-rule-checks.css:24` |
| world rule checks | `.rule__legend` font-size `0.95rem`, off the scale | `0.95rem` to `var(--text-body)` | +0.8px | `084-world-rule-checks.css:26` |
| world rule checks | `.rule__checkfields` gap `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `084-world-rule-checks.css:40` |
| world rule checks | `.termselect__row` gap `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `084-world-rule-checks.css:56` |
| world rule checks | `.termselect__new` margin-top `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `084-world-rule-checks.css:70` |
| world rule checks | `.termselect__new` padding `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `084-world-rule-checks.css:71` |
| world rule checks | `.rulecheck__list` margin `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `084-world-rule-checks.css:113` |
| world rule checks | `.rulecheck__list` padding-left `1.1rem`, off the scale | `1.1rem` to `var(--space-4)` | -1.6px | `084-world-rule-checks.css:114` |
| world rule checks | `.rulecheck__list li + li` margin-top `0.2rem`, off the scale | `0.2rem` to `var(--space-1)` | +0.8px | `084-world-rule-checks.css:118` |
| world rule checks | `.rulecheck__note` margin `0.45rem`, off the scale | `0.45rem` to `var(--space-2)` | +0.8px | `084-world-rule-checks.css:122` |
| world rule checks | `.moment__details` padding-top `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `084-world-rule-checks.css:128` |
| world rule checks | `.moment__details > summary` font-size `0.9rem`, off the scale | `0.9rem` to `var(--text-ui)` | -0.4px | `084-world-rule-checks.css:134` |
| world rule checks | `.moment__details[open] > summary` margin-bottom `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `084-world-rule-checks.css:140` |
| world rule checks | `.moment__validation` font-size `0.8rem`, off the scale | `0.8rem` to `var(--text-sm)` | +0.2px | `084-world-rule-checks.css:156` |
| world rule checks | `.terms__group` margin-top `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `084-world-rule-checks.css:167` |
| world rule checks | `.terms__kind` font-size `0.9rem`, off the scale | `0.9rem` to `var(--text-ui)` | -0.4px | `084-world-rule-checks.css:172` |
| family tree | `.family__picker` margin `1.5rem`, written raw instead of its token | `1.5rem` to `var(--space-6)` | none | `085-family-tree.css:14` |
| family tree | `.family__picker` margin `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `085-family-tree.css:14` |
| family tree | `.discovery__bar` margin `1.5rem`, written raw instead of its token | `1.5rem` to `var(--space-6)` | none | `085-family-tree.css:34` |
| family tree | `.discovery__families` margin-top `2rem`, written raw instead of its token | `2rem` to `var(--space-7)` | none | `085-family-tree.css:57` |
| family tree | `.discovery__families` padding-top `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `085-family-tree.css:58` |
| family tree | `.familycard` gap `0.2rem`, off the scale | `0.2rem` to `var(--space-1)` | +0.8px | `085-family-tree.css:92` |
| family tree | `.familycard` padding `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `085-family-tree.css:95` |
| family tree | `.family__loop` margin `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `085-family-tree.css:153` |
| family tree | `.family__loop` padding-left `1.1rem`, off the scale | `1.1rem` to `var(--space-4)` | -1.6px | `085-family-tree.css:154` |
| family tree | `.family__loop` font-size `0.85rem`, off the scale | `0.85rem` to `var(--text-ui)` | +0.4px | `085-family-tree.css:155` |
| family tree | `.family__note` margin `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `085-family-tree.css:159` |
| family tree | `.family__note` margin `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `085-family-tree.css:159` |
| family tree | `.family__note` font-size `0.85rem`, off the scale | `0.85rem` to `var(--text-ui)` | +0.4px | `085-family-tree.css:160` |
| family tree | `.family__others` margin `1.5rem`, written raw instead of its token | `1.5rem` to `var(--space-6)` | none | `085-family-tree.css:179` |
| family tree | `.family__others` padding-top `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `085-family-tree.css:180` |
| family tree | `.family__otherlist` margin `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `085-family-tree.css:185` |
| family tree | `.family__otherlist` gap `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `085-family-tree.css:190` |
| family tree | `.family__otherlist li` gap `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `085-family-tree.css:197` |
| family tree | `.familytree` gap `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `085-family-tree.css:219` |
| family tree | `.familytree` margin-top `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `085-family-tree.css:220` |
| family tree members | `.familytree__legend` gap `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `087-family-member.css:131` |
| family tree members | `.familytree__legend` font-size `0.78rem`, off the scale | `0.78rem` to `var(--text-xs)` | -0.48px | `087-family-member.css:133` |
| family member details | `.familydetails--sheet::backdrop` background `rgb(0 0 0 / 0.45)`, a raw colour | `rgb(0 0 0 / 0.45)` to `var(--backdrop)` | none | `088-member-details.css:36` |
| family member details | `.familydetails__head` gap `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `088-member-details.css:72` |
| family member details | `.familydetails__name` font-size `1.15rem`, off the scale | `1.15rem` to `var(--text-item)` | -0.4px | `088-member-details.css:88` |
| family member details | `.familydetails__close` margin `-0.25rem`, written raw instead of its token | `-0.25rem` to `calc(-1 * var(--space-1))` | none | `088-member-details.css:103` |
| family member details | `.familydetails__close` margin `-0.25rem`, written raw instead of its token | `-0.25rem` to `calc(-1 * var(--space-1))` | none | `088-member-details.css:103` |
| family tree types | `.family__setup` margin `2rem`, written raw instead of its token | `2rem` to `var(--space-7)` | none | `089-family-tree-types.css:8` |
| family tree types | `.family__setup` padding-top `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `089-family-tree-types.css:9` |
| family tree types | `.family__grouplist input` margin-top `0.2rem`, off the scale | `0.2rem` to `var(--space-1)` | +0.8px | `089-family-tree-types.css:48` |
| publishing settings | `.publication__missing` padding-left `1.1rem`, off the scale | `1.1rem` to `var(--space-4)` | -1.6px | `090-publishing-settings.css:95` |
| publishing settings | `.usage__name` font-size `0.925rem`, off the scale | `0.925rem` to `var(--text-ui)` | -0.8px | `090-publishing-settings.css:179` |
| publishing settings | `.usage__amount` font-size `0.925rem`, off the scale | `0.925rem` to `var(--text-ui)` | -0.8px | `090-publishing-settings.css:189` |
| publishing settings | `.usage__full, .usage__status` font-size `0.875rem`, written raw instead of its token | `0.875rem` to `var(--text-ui)` | none | `090-publishing-settings.css:204` |
| publishing one item | `.contentpub__trigger` gap `0.3rem`, off the scale | `0.3rem` to `var(--space-1)` | -0.8px | `092-publishing-one-item.css:24` |
| publishing one item | `.contentpub__trigger` min-height `2rem`, written raw instead of its token | `2rem` to `var(--control-sm)` | none | `092-publishing-one-item.css:25` |
| publishing one item | `.contentpub__trigger` padding `0.55rem`, off the scale | `0.55rem` to `var(--space-2)` | -0.8px | `092-publishing-one-item.css:26` |
| lore context | `.lorecontext__action` min-height `2.75rem`, written raw instead of its token | `2.75rem` to `var(--control-touch)` | none | `110-lore-context.css:35` |
| lore context | `.lorepreview__back` min-height `2.75rem`, written raw instead of its token | `2.75rem` to `var(--control-touch)` | none | `110-lore-context.css:40` |
| connect to AI | `.connect__heading` font-size `0.925rem`, off the scale | `0.925rem` to `var(--text-ui)` | -0.8px | `112-connect-to-ai.css:36` |
| connect to AI | `.connect__steps, .connect__list, .consen` padding-inline-start `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `112-connect-to-ai.css:44` |
| connect to AI | `.consent__app, .consent__universe` font-size `1.125rem`, written raw instead of its token | `1.125rem` to `var(--text-item)` | none | `112-connect-to-ai.css:139` |
| pending AI changes | `.aichanges__list, .aichange__list` gap `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `113-pending-ai-changes.css:6` |
| pending AI changes | `.aichanges__list, .aichange__list` margin `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `113-pending-ai-changes.css:7` |
| pending AI changes | `.aichange__note` margin-block `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `113-pending-ai-changes.css:60` |
| pending AI changes | `.aichange__toolbar` gap `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `113-pending-ai-changes.css:71` |
| pending AI changes | `.aichange__toolbar` gap `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `113-pending-ai-changes.css:71` |
| pending AI changes | `.aichange__toolbar` margin-block `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `113-pending-ai-changes.css:72` |
| pending AI changes | `.aichange__toolbar` padding `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `113-pending-ai-changes.css:73` |
| pending AI changes | `.aichange__buttons` gap `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `113-pending-ai-changes.css:87` |
| pending AI changes | `.aichangeitem__issues.callout` padding `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `113-pending-ai-changes.css:113` |
| pending AI changes | `.aichangeitem__issues.callout` padding `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `113-pending-ai-changes.css:113` |
| pending AI changes | `.aichangeitem__head` gap `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `113-pending-ai-changes.css:131` |
| pending AI changes | `.aichangeitem__check` margin-top `0.2rem`, off the scale | `0.2rem` to `var(--space-1)` | +0.8px | `113-pending-ai-changes.css:138` |
| pending AI changes | `.aichangeitem__lines` gap `0.25rem`, written raw instead of its token | `0.25rem` to `var(--space-1)` | none | `113-pending-ai-changes.css:173` |
| pending AI changes | `.aichangeitem__line` gap `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `113-pending-ai-changes.css:180` |
| pending AI changes | `.aichangeitem__impact, .aichangeitem__is` padding-inline-start `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `113-pending-ai-changes.css:212` |
| pending AI changes | `.aichangeitem__picture` gap `0.25rem`, written raw instead of its token | `0.25rem` to `var(--space-1)` | none | `113-pending-ai-changes.css:229` |
| pending AI changes | `.aichangeprose__text` padding `0.5rem`, written raw instead of its token | `0.5rem` to `var(--space-2)` | none | `113-pending-ai-changes.css:262` |
| pending AI changes | `.aichangeprose__text` padding `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `113-pending-ai-changes.css:262` |
| pending AI changes | `.aichangeedit` gap `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `113-pending-ai-changes.css:284` |
| pending AI changes | `.aichangeedit` padding `0.75rem`, written raw instead of its token | `0.75rem` to `var(--space-3)` | none | `113-pending-ai-changes.css:285` |
| entry eras | `.progression` margin-top `1.5rem`, written raw instead of its token | `1.5rem` to `var(--space-6)` | none | `115-entry-eras.css:14` |
| entry eras | `.eranav__link` min-height `2rem`, written raw instead of its token | `2rem` to `var(--control-sm)` | none | `115-entry-eras.css:37` |
| entry eras | `.eranav__link` padding `0.25rem`, written raw instead of its token | `0.25rem` to `var(--space-1)` | none | `115-entry-eras.css:38` |
| maps | `.maps__notice` margin `1.5rem`, written raw instead of its token | `1.5rem` to `var(--space-6)` | none | `121-maps.css:7` |
| maps | `.maps__list` margin-top `2rem`, written raw instead of its token | `2rem` to `var(--space-7)` | none | `121-maps.css:17` |
| maps | `.mapcard__meta` font-size `0.78rem`, off the scale | `0.78rem` to `var(--text-xs)` | -0.48px | `121-maps.css:79` |
| map form | `.mapform__choice input` margin-top `0.25rem`, written raw instead of its token | `0.25rem` to `var(--space-1)` | none | `122-maps-2.css:225` |
| idea boards | `.boardline__label` font-size `13px`, written raw instead of its token | `13px` to `var(--text-sm)` | none | `124-idea-boards.css:133` |
| idea boards | `.boardcard__name` font-size `1.05rem`, off the scale | `1.05rem` to `var(--text-body)` | -0.8px | `124-idea-boards.css:209` |
| idea boards | `.boardcard__excerpt` font-size `0.9rem`, off the scale | `0.9rem` to `var(--text-ui)` | -0.4px | `124-idea-boards.css:225` |
| idea boards | `.boardcard__gone` font-size `0.8rem`, off the scale | `0.8rem` to `var(--text-sm)` | +0.2px | `124-idea-boards.css:235` |
| shared rows (facts, lists) | `.facts--ruled` margin `2rem`, written raw instead of its token | `2rem` to `var(--space-7)` | none | `130-shared-rows.css:20` |
| shared rows (facts, lists) | `.facts--ruled .facts__row` gap `1rem`, written raw instead of its token | `1rem` to `var(--space-4)` | none | `130-shared-rows.css:28` |
| shared rows (facts, lists) | `.facts--ruled .facts__key` font-size `0.8rem`, off the scale | `0.8rem` to `var(--text-sm)` | +0.2px | `130-shared-rows.css:36` |
| shared rows (facts, lists) | `.facts--ruled .facts__value` font-size `0.925rem`, off the scale | `0.925rem` to `var(--text-ui)` | -0.8px | `130-shared-rows.css:41` |
| shared rows (facts, lists) | `.facts--grid` gap `0.45rem`, off the scale | `0.45rem` to `var(--space-2)` | +0.8px | `130-shared-rows.css:49` |
| shared rows (facts, lists) | `.facts--grid` gap `1.25rem`, written raw instead of its token | `1.25rem` to `var(--space-5)` | none | `130-shared-rows.css:49` |
| shared rows (facts, lists) | `.facts--grid .facts__key` font-size `0.8rem`, off the scale | `0.8rem` to `var(--text-sm)` | +0.2px | `130-shared-rows.css:58` |
| shared rows (facts, lists) | `.facts--grid .facts__value` font-size `0.95rem`, off the scale | `0.95rem` to `var(--text-body)` | +0.8px | `130-shared-rows.css:64` |
| shared rows (facts, lists) | `.facts--grid .facts__value` margin-bottom `0.55rem`, off the scale | `0.55rem` to `var(--space-2)` | -0.8px | `130-shared-rows.css:109` |
