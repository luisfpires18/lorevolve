# Issue 562 inventory: off-scale values and duplicated UI code

Read-only measurement. Nothing in `src` was changed. Scripts in this folder: `audit.py` (Part A and CSS repeats), `markup.py` (raw markup probes, writes `markup_hits.txt`), `build.py` (this file).


# Part A: off-scale values

Script: `.ai/tmp/audit/audit.py`. Styles dir: `src/LorEvolve.Web/src/styles` (129 files). Rem = 16px. A "raw use" is one raw value inside a declaration (a shorthand with two raw lengths counts two). Spacing counts raw lengths on the listed properties; on-scale raw values (for example `0.5rem`) are included because the token exists. `0` is excluded. Colour counts exclude `001-foundation.css`; entries marked `[token def]` are custom properties defined elsewhere.

## Workspace (all files except 093 to 106)

Declarations scanned: 7075. Tokenised already: spacing 696, z-index 14, radius 142, font-size 245, control-height 40, duration 39.

### Totals
| Category | Raw uses | Distinct raw values | Of which swap changes nothing | Top files |
|---|---|---|---|---|
| font-size | 145 | 41 | 21 | 081-ideas.css (9), 130-shared-rows.css (6), 047-recovered-drafts.css (6), 077-refused-write.css (6), 062-chronology.css (5) |
| spacing | 577 | 61 | 278 | 113-pending-ai-changes.css (27), 085-family-tree.css (26), 081-ideas.css (24), 025-universe-search-bar.css (24), 055-entry-history.css (23) |
| radius | 35 | 9 | 2 | 128-projects-2.css (9), 011-account-menu.css (3), 121-maps.css (3), 129-projects-3.css (3), 062-chronology.css (2) |
| colour | 50 | 13 | - | 128-projects-2.css (20), 129-projects-3.css (19), 043-picture-whole.css (8), 044-thumbnail-cropper.css (2), 088-member-details.css (1) |
| control-height | 38 | 13 | 25 | 080-touch.css (6), 061-workspace-narrow.css (4), 024-universe-workspace.css (3), 026-overview.css (2), 050-types-2.css (2) |
| duration | 10 | 6 | 2 | 009-progress.css (2), 046-article.css (2), 068-stories-2.css (2), 041-entry-page.css (1), 022-shared-surfaces.css (1) |
| z-index | 9 | 4 | 1 | 128-projects-2.css (3), 019-universe-plates.css (1), 127-projects.css (1), 129-projects-3.css (1), 023-atmosphere.css (1) |

### font-size
| Raw value | Count | Nearest token | Swap changes render by | Files (count) | Example |
|---|---|---|---|---|---|
| `0.8rem` | 18 | --text-sm (13px) | -0.20px | 025-universe-search-bar.css (2), 029-chronology-date-periods.css (2), 047-recovered-drafts.css (2), 061-workspace-narrow.css (2) +9 more | 010-avatar.css:88 |
| `0.9rem` | 11 | --text-ui (14px) | +0.40px | 081-ideas.css (2), 084-world-rule-checks.css (2), 016-restore-backup.css (1), 039-lore-phone.css (1) +5 more | 016-restore-backup.css:70 |
| `0.925rem` | 10 | --text-ui (14px) | +0.80px | 016-restore-backup.css (2), 090-publishing-settings.css (2), 004-auth-canvas.css (1), 011-account-menu.css (1) +4 more | 004-auth-canvas.css:66 |
| `0.85rem` | 10 | --text-ui (14px) | -0.40px | 046-article.css (2), 085-family-tree.css (2), 047-recovered-drafts.css (1), 058-relation-kinds.css (1) +4 more | 046-article.css:72 |
| `0.95rem` | 9 | --text-body (16px) | -0.80px | 062-chronology.css (2), 004-auth-canvas.css (1), 011-account-menu.css (1), 048-tokens.css (1) +4 more | 004-auth-canvas.css:32 |
| `0.78rem` | 8 | --text-xs (12px) | +0.48px | 082-ideas-2.css (3), 047-recovered-drafts.css (1), 081-ideas.css (1), 083-world-rules.css (1) +2 more | 047-recovered-drafts.css:14 |
| `1.25rem` | 7 | --text-item (18px) | +2.00px | 002-foundation-2.css (1), 015-create-composer.css (1), 029-chronology-date-periods.css (1), 115-entry-eras.css (1) +3 more | 002-foundation-2.css:20 |
| `0.875rem` | 6 | --text-ui (14px) | none | 081-ideas.css (2), 022-shared-surfaces.css (1), 025-universe-search-bar.css (1), 057-entity-picker.css (1) +1 more | 022-shared-surfaces.css:223 |
| `1.0625rem` | 5 | --text-body (16px) | +1.00px | 020-collaborators.css (1), 026-overview.css (1), 040-entry-lore-article.css (1), 057-entity-picker.css (1) +1 more | 020-collaborators.css:85 |
| `1.05rem` | 5 | --text-body (16px) | +0.80px | 030-calendar.css (2), 029-chronology-date-periods.css (1), 085-family-tree.css (1), 124-idea-boards.css (1) | 029-chronology-date-periods.css:109 |
| `1rem` | 5 | --text-body (16px) | none | 046-article.css (1), 047-recovered-drafts.css (1), 077-refused-write.css (1), 081-ideas.css (1) +1 more | 046-article.css:147 |
| `inherit` | 4 | n/a | not a plain length (clamp/calc/%/keyword): context-dependent | 130-shared-rows.css (2), 021-states.css (1), 121-maps.css (1) | 021-states.css:41 |
| `clamp(1.05rem, 1.6vw, 1.25rem)` | 4 | n/a | not a plain length (clamp/calc/%/keyword): context-dependent | 062-chronology.css (1), 081-ideas.css (1), 083-world-rules.css (1), 121-maps.css (1) | 062-chronology.css:154 |
| `0.75rem` | 3 | --text-xs (12px) | none | 010-avatar.css (1), 055-entry-history.css (1), 124-idea-boards.css (1) | 010-avatar.css:73 |
| `1.75rem` | 3 | --text-section (22px) | +6.00px | 120-lorevolve-admin.css (2), 026-overview.css (1) | 026-overview.css:61 |
| `1.125rem` | 3 | --text-item (18px) | none | 045-tiptap.css (1), 072-story-manuscript.css (1), 112-connect-to-ai.css (1) | 045-tiptap.css:63 |
| `1.15rem` | 3 | --text-item (18px) | +0.40px | 054-relation-form.css (1), 077-refused-write.css (1), 088-member-details.css (1) | 054-relation-form.css:18 |
| `1.5rem` | 2 | --text-section (22px) | +2.00px | 010-avatar.css (1), 045-tiptap.css (1) | 010-avatar.css:80 |
| `0.9375rem` | 2 | --text-ui (14px) | +1.00px | 013-page-header.css (2) | 013-page-header.css:102 |
| `1.35rem` | 2 | --text-section (22px) | -0.40px | 024-universe-workspace.css (1), 055-entry-history.css (1) | 024-universe-workspace.css:37 |
| `1.3125rem` | 2 | --text-section (22px) | -1.00px | 026-overview.css (2) | 026-overview.css:125 |
| `1.1875rem` | 2 | --text-item (18px) | +1.00px | 035-lore-cards.css (1), 049-types.css (1) | 035-lore-cards.css:113 |
| `0.88rem` | 2 | --text-ui (14px) | +0.08px | 077-refused-write.css (2) | 077-refused-write.css:30 |
| `0.82rem` | 2 | --text-sm (13px) | +0.12px | 077-refused-write.css (1), 084-world-rule-checks.css (1) | 077-refused-write.css:81 |
| `16px` | 1 | --text-body (16px) | none | 001-foundation.css (1) | 001-foundation.css:196 |
| `clamp(2.75rem, 6vw, 4.25rem)` | 1 | n/a | not a plain length (clamp/calc/%/keyword): context-dependent | 002-foundation-2.css (1) | 002-foundation-2.css:26 |
| `3rem` | 1 | --text-section (22px) | +26.00px | 010-avatar.css (1) | 010-avatar.css:29 |
| `0.8125rem` | 1 | --text-sm (13px) | none | 013-page-header.css (1) | 013-page-header.css:152 |
| `1.1rem` | 1 | --text-item (18px) | -0.40px | 016-restore-backup.css (1) | 016-restore-backup.css:49 |
| `5.5rem` | 1 | --text-section (22px) | +66.00px | 019-universe-plates.css (1) | 019-universe-plates.css:67 |
| `1.375rem` | 1 | --text-section (22px) | none | 019-universe-plates.css (1) | 019-universe-plates.css:109 |
| `1.3rem` | 1 | --text-section (22px) | -1.20px | 024-universe-workspace.css (1) | 024-universe-workspace.css:125 |
| `1.03rem` | 1 | --text-body (16px) | +0.48px | 025-universe-search-bar.css (1) | 025-universe-search-bar.css:159 |
| `0.83rem` | 1 | --text-sm (13px) | +0.28px | 025-universe-search-bar.css (1) | 025-universe-search-bar.css:182 |
| `1.2rem` | 1 | --text-item (18px) | +1.20px | 045-tiptap.css (1) | 045-tiptap.css:96 |
| `1.4rem` | 1 | --text-section (22px) | +0.40px | 055-entry-history.css (1) | 055-entry-history.css:108 |
| `clamp(1.4rem, 2.2vw, 1.85rem)` | 1 | n/a | not a plain length (clamp/calc/%/keyword): context-dependent | 062-chronology.css (1) | 062-chronology.css:42 |
| `clamp(1.15rem, 1.8vw, 1.4rem)` | 1 | n/a | not a plain length (clamp/calc/%/keyword): context-dependent | 067-stories.css (1) | 067-stories.css:34 |
| `clamp(1.6rem, 2.6vw, 2.1rem)` | 1 | n/a | not a plain length (clamp/calc/%/keyword): context-dependent | 081-ideas.css (1) | 081-ideas.css:272 |
| `1.625rem` | 1 | --text-section (22px) | +4.00px | 112-connect-to-ai.css (1) | 112-connect-to-ai.css:94 |
| `13px` | 1 | --text-sm (13px) | none | 124-idea-boards.css (1) | 124-idea-boards.css:141 |

### spacing
| Raw value | Count | Nearest token | Swap changes render by | Files (count) | Example |
|---|---|---|---|---|---|
| `0.5rem` | 58 | --space-2 (8px) | none | 085-family-tree.css (6), 046-article.css (5), 084-world-rule-checks.css (4), 113-pending-ai-changes.css (4) +24 more | 004-auth-canvas.css:59 |
| `1rem` | 54 | --space-4 (16px) | none | 029-chronology-date-periods.css (5), 113-pending-ai-changes.css (5), 025-universe-search-bar.css (4), 046-article.css (4) +22 more | 010-avatar.css:58 |
| `1.25rem` | 44 | --space-5 (20px) | none | 055-entry-history.css (5), 054-relation-form.css (4), 085-family-tree.css (4), 081-ideas.css (3) +22 more | 006-buttons.css:18 |
| `0.75rem` | 42 | --space-3 (12px) | none | 113-pending-ai-changes.css (8), 046-article.css (4), 030-calendar.css (3), 047-recovered-drafts.css (3) +17 more | 005-forms.css:76 |
| `1.5rem` | 26 | --space-6 (24px) | none | 085-family-tree.css (3), 010-avatar.css (2), 060-narrow-screens.css (2), 081-ideas.css (2) +17 more | 001-foundation.css:273 |
| `0.35rem` | 26 | --space-1 (4px) | +1.60px | 082-ideas-2.css (3), 088-member-details.css (3), 016-restore-backup.css (2), 039-lore-phone.css (2) +14 more | 016-restore-backup.css:25 |
| `0.6rem` | 24 | --space-2 (8px) | +1.60px | 081-ideas.css (3), 025-universe-search-bar.css (2), 029-chronology-date-periods.css (2), 046-article.css (2) +14 more | 002-foundation-2.css:7 |
| `2rem` | 21 | --space-7 (32px) | none | 004-auth-canvas.css (4), 062-chronology.css (3), 081-ideas.css (2), 007-universe-home.css (1) +11 more | 004-auth-canvas.css:12 |
| `0.4rem` | 21 | --space-2 (8px) | -1.60px | 084-world-rule-checks.css (4), 061-workspace-narrow.css (2), 081-ideas.css (2), 005-forms.css (1) +12 more | 005-forms.css:30 |
| `0.25rem` | 21 | --space-1 (4px) | none | 045-tiptap.css (2), 058-relation-kinds.css (2), 113-pending-ai-changes.css (2), 025-universe-search-bar.css (1) +14 more | 025-universe-search-bar.css:103 |
| `0.9rem` | 20 | --space-4 (16px) | -1.60px | 016-restore-backup.css (4), 055-entry-history.css (3), 029-chronology-date-periods.css (2), 047-recovered-drafts.css (2) +8 more | 016-restore-backup.css:24 |
| `0.3rem` | 19 | --space-1 (4px) | +0.80px | 061-workspace-narrow.css (3), 048-tokens.css (2), 067-stories.css (2), 076-canon-integrity.css (2) +9 more | 025-universe-search-bar.css:114 |
| `0.2rem` | 17 | --space-1 (4px) | -0.80px | 055-entry-history.css (2), 076-canon-integrity.css (2), 080-touch.css (2), 022-shared-surfaces.css (1) +10 more | 022-shared-surfaces.css:282 |
| `0.45rem` | 14 | --space-2 (8px) | -0.80px | 024-universe-workspace.css (3), 080-touch.css (2), 081-ideas.css (2), 005-forms.css (1) +6 more | 005-forms.css:76 |
| `0.1rem` | 14 | none (hairline nudge, below --space-1) | n/a | 019-universe-plates.css (2), 048-tokens.css (2), 082-ideas-2.css (2), 130-shared-rows.css (2) +6 more | 019-universe-plates.css:156 |
| `2px` | 13 | none (hairline nudge, below --space-1) | n/a | 006-buttons.css (2), 011-account-menu.css (2), 018-controls.css (2), 034-lore-types-navigation.css (2) +5 more | 006-buttons.css:18 |
| `0.7rem` | 13 | --space-3 (12px) | -0.80px | 076-canon-integrity.css (3), 046-article.css (2), 057-entity-picker.css (2), 025-universe-search-bar.css (1) +5 more | 025-universe-search-bar.css:201 |
| `0.15rem` | 12 | --space-1 (4px) | -1.60px | 055-entry-history.css (3), 122-maps-2.css (2), 011-account-menu.css (1), 030-calendar.css (1) +5 more | 011-account-menu.css:184 |
| `2.5rem` | 12 | --space-7 (32px) | +8.00px | 018-controls.css (2), 076-canon-integrity.css (2), 022-shared-surfaces.css (1), 025-universe-search-bar.css (1) +6 more | 018-controls.css:9 |
| `0.8rem` | 9 | --space-3 (12px) | +0.80px | 025-universe-search-bar.css (3), 018-controls.css (1), 046-article.css (1), 061-workspace-narrow.css (1) +3 more | 018-controls.css:27 |
| `1.1rem` | 7 | --space-4 (16px) | +1.60px | 024-universe-workspace.css (1), 045-tiptap.css (1), 055-entry-history.css (1), 056-history-narrow.css (1) +3 more | 024-universe-workspace.css:25 |
| `-1px` | 7 | none (hairline nudge, below --space-1) | n/a | 028-workspace-page-shell.css (1), 030-calendar.css (1), 043-picture-whole.css (1), 067-stories.css (1) +3 more | 028-workspace-page-shell.css:44 |
| `0.125rem` | 7 | none (hairline nudge, below --space-1) | n/a | 125-idea-boards-2.css (2), 031-lore-browser.css (1), 037-lore-front-page.css (1), 068-stories-2.css (1) +2 more | 031-lore-browser.css:105 |
| `0.85rem` | 5 | --space-3 (12px) | +1.60px | 025-universe-search-bar.css (1), 029-chronology-date-periods.css (1), 055-entry-history.css (1), 084-world-rule-checks.css (1) +1 more | 025-universe-search-bar.css:122 |
| `0.375rem` | 5 | --space-1 (4px) | +2.00px | 113-pending-ai-changes.css (3), 031-lore-browser.css (1), 037-lore-front-page.css (1) | 031-lore-browser.css:103 |
| `1.75rem` | 4 | --space-6 (24px) | +4.00px | 005-forms.css (1), 015-create-composer.css (1), 062-chronology.css (1), 087-family-member.css (1) | 005-forms.css:11 |
| `0.65rem` | 4 | --space-3 (12px) | -1.60px | 025-universe-search-bar.css (1), 061-workspace-narrow.css (1), 082-ideas-2.css (1), 092-publishing-one-item.css (1) | 025-universe-search-bar.css:123 |
| `-0.25rem` | 4 | calc(-1 * var(--space-1)) (-4px) | none | 088-member-details.css (2), 030-calendar.css (1), 046-article.css (1) | 030-calendar.css:124 |
| `2.25rem` | 4 | --space-7 (32px) | +4.00px | 051-type-icon-picker.css (2), 060-narrow-screens.css (1), 062-chronology.css (1) | 051-type-icon-picker.css:127 |
| `4px` | 4 | --space-1 (4px) | none | 128-projects-2.css (4) | 128-projects-2.css:20 |
| `4.5rem` | 3 | --space-9 (64px) | +8.00px | 004-auth-canvas.css (2), 039-lore-phone.css (1) | 004-auth-canvas.css:12 |
| `3.5rem` | 3 | --space-8 (48px) | +8.00px | 007-universe-home.css (1), 018-controls.css (1), 060-narrow-screens.css (1) | 007-universe-home.css:143 |
| `0.0625rem` | 3 | none (hairline nudge, below --space-1) | n/a | 014-status-badge.css (1), 108-entry-knowledge.css (1), 121-maps.css (1) | 014-status-badge.css:54 |
| `1.6rem` | 3 | --space-6 (24px) | +1.60px | 030-calendar.css (1), 081-ideas.css (1), 083-world-rules.css (1) | 030-calendar.css:110 |
| `0.55rem` | 3 | --space-2 (8px) | +0.80px | 045-tiptap.css (1), 092-publishing-one-item.css (1), 130-shared-rows.css (1) | 045-tiptap.css:31 |
| `2.75rem` | 2 | --space-8 (48px) | -4.00px | 004-auth-canvas.css (1), 085-family-tree.css (1) | 004-auth-canvas.css:59 |
| `0.35em` | 2 | n/a | em is relative to font-size: no token | 014-status-badge.css (1), 018-controls.css (1) | 014-status-badge.css:11 |
| `0.1em` | 2 | n/a | em is relative to font-size: no token | 025-universe-search-bar.css (1), 035-lore-cards.css (1) | 025-universe-search-bar.css:194 |
| `7px` | 2 | --space-2 (8px) | -1.00px | 128-projects-2.css (2) | 128-projects-2.css:5 |
| `0.42rem` | 2 | --space-2 (8px) | -1.28px | 129-projects-3.css (2) | 129-projects-3.css:52 |
| `-1.75rem` | 1 | calc(-1 * var(--space-6)) (-24px) | +4.00px | 004-auth-canvas.css (1) | 004-auth-canvas.css:70 |
| `-1rem` | 1 | calc(-1 * var(--space-4)) (-16px) | none | 005-forms.css (1) | 005-forms.css:22 |
| `3rem` | 1 | --space-8 (48px) | none | 007-universe-home.css (1) | 007-universe-home.css:17 |
| `4rem` | 1 | --space-9 (64px) | none | 007-universe-home.css (1) | 007-universe-home.css:143 |
| `-0.75rem` | 1 | calc(-1 * var(--space-3)) (-12px) | none | 016-restore-backup.css (1) | 016-restore-backup.css:10 |
| `1.2rem` | 1 | --space-5 (20px) | -0.80px | 016-restore-backup.css (1) | 016-restore-backup.css:66 |
| `6.75rem` | 1 | --space-9 (64px) | +44.00px | 018-controls.css (1) | 018-controls.css:41 |
| `-0.35em` | 1 | n/a | em is relative to font-size: no token | 019-universe-plates.css (1) | 019-universe-plates.css:65 |
| `0.22rem` | 1 | --space-1 (4px) | -0.48px | 025-universe-search-bar.css (1) | 025-universe-search-bar.css:138 |
| `0.12rem` | 1 | none (hairline nudge, below --space-1) | n/a | 025-universe-search-bar.css (1) | 025-universe-search-bar.css:149 |
| `1.4rem` | 1 | --space-6 (24px) | -1.60px | 045-tiptap.css (1) | 045-tiptap.css:112 |
| `1.125rem` | 1 | --space-4 (16px) | +2.00px | 049-types.css (1) | 049-types.css:63 |
| `0.05rem` | 1 | none (hairline nudge, below --space-1) | n/a | 055-entry-history.css (1) | 055-entry-history.css:67 |
| `-0.3125rem` | 1 | calc(-1 * var(--space-1)) (-4px) | +1.00px | 062-chronology.css (1) | 062-chronology.css:101 |
| `-0.1875rem` | 1 | calc(-1 * var(--space-1)) (-4px) | -1.00px | 062-chronology.css (1) | 062-chronology.css:118 |
| `0.15em` | 1 | n/a | em is relative to font-size: no token | 072-story-manuscript.css (1) | 072-story-manuscript.css:74 |
| `7.5rem` | 1 | --space-9 (64px) | +56.00px | 076-canon-integrity.css (1) | 076-canon-integrity.css:60 |
| `1em` | 1 | n/a | em is relative to font-size: no token | 108-entry-knowledge.css (1) | 108-entry-knowledge.css:57 |
| `0.875rem` | 1 | --space-3 (12px) | +2.00px | 113-pending-ai-changes.css (1) | 113-pending-ai-changes.css:16 |
| `0.625rem` | 1 | --space-2 (8px) | +2.00px | 113-pending-ai-changes.css (1) | 113-pending-ai-changes.css:73 |
| `0.25em` | 1 | n/a | em is relative to font-size: no token | 125-idea-boards-2.css (1) | 125-idea-boards-2.css:91 |

### radius
| Raw value | Count | Nearest token | Swap changes render by | Files (count) | Example |
|---|---|---|---|---|---|
| `50%` | 16 | none (shape, not size) | n/a | 121-maps.css (3), 128-projects-2.css (3), 011-account-menu.css (2), 010-avatar.css (1) +7 more | 010-avatar.css:16 |
| `2px` | 12 | --radius-xs (3px) | -1.00px | 128-projects-2.css (4), 017-universe-colour.css (2), 011-account-menu.css (1), 018-controls.css (1) +4 more | 011-account-menu.css:76 |
| `999px` | 1 | --radius-full | none (pill) | 022-shared-surfaces.css (1) | 022-shared-surfaces.css:284 |
| `0.1875rem` | 1 | --radius-xs (3px) | none | 062-chronology.css (1) | 062-chronology.css:122 |
| `0.2em` | 1 | --radius-xs (3px) | -2.80px | 072-story-manuscript.css (1) | 072-story-manuscript.css:75 |
| `2.75rem` | 1 | --radius-md (10px) | +34.00px | 128-projects-2.css (1) | 128-projects-2.css:101 |
| `0.45rem` | 1 | --radius-sm (6px) | +1.20px | 128-projects-2.css (1) | 128-projects-2.css:188 |
| `1px` | 1 | --radius-xs (3px) | -2.00px | 129-projects-3.css (1) | 129-projects-3.css:41 |
| `3px` | 1 | --radius-xs (3px) | none | 129-projects-3.css (1) | 129-projects-3.css:128 |

### colour
| Raw value | Count | Nearest token | Swap changes render by | Files (count) | Example |
|---|---|---|---|---|---|
| `white` | 19 | see tokens in 001 | n/a | 128-projects-2.css (10), 129-projects-3.css (9) | 128-projects-2.css:108 |
| `black` | 11 | see tokens in 001 | n/a | 129-projects-3.css (7), 128-projects-2.css (4) | 128-projects-2.css:113 |
| `rgb() ` | 8 | see tokens in 001 | n/a | 043-picture-whole.css (4), 044-thumbnail-cropper.css (2), 088-member-details.css (1), 129-projects-3.css (1) | 043-picture-whole.css:28 |
| `#f0ece3` | 3 | see tokens in 001 | n/a | 043-picture-whole.css (3) | 043-picture-whole.css:18 |
| `#fff` | 1 | see tokens in 001 | n/a | 043-picture-whole.css (1) | 043-picture-whole.css:57 |
| `#2a2f3a [token def]` | 1 | see tokens in 001 | n/a | 128-projects-2.css (1) | 128-projects-2.css:95 |
| `#4a4f5c` | 1 | see tokens in 001 | n/a | 128-projects-2.css (1) | 128-projects-2.css:131 |
| `#15171d` | 1 | see tokens in 001 | n/a | 128-projects-2.css (1) | 128-projects-2.css:131 |
| `#12141a [token def]` | 1 | see tokens in 001 | n/a | 128-projects-2.css (1) | 128-projects-2.css:138 |
| `#12141a` | 1 | see tokens in 001 | n/a | 128-projects-2.css (1) | 128-projects-2.css:161 |
| `#0b0c10` | 1 | see tokens in 001 | n/a | 128-projects-2.css (1) | 128-projects-2.css:192 |
| `#0d0e12 [token def]` | 1 | see tokens in 001 | n/a | 129-projects-3.css (1) | 129-projects-3.css:12 |
| `#23262b [token def]` | 1 | see tokens in 001 | n/a | 129-projects-3.css (1) | 129-projects-3.css:89 |

### control-height
| Raw value | Count | Nearest token | Swap changes render by | Files (count) | Example |
|---|---|---|---|---|---|
| `min-height:2.75rem` | 12 | --control-touch (44px) | none | 080-touch.css (5), 110-lore-context.css (2), 018-controls.css (1), 025-universe-search-bar.css (1) +3 more | 018-controls.css:55 |
| `height:2rem` | 4 | --control-sm (32px) | none | 011-account-menu.css (1), 026-overview.css (1), 049-types.css (1), 050-types-2.css (1) | 011-account-menu.css:128 |
| `min-height:2.25rem` | 4 | --control-sm (32px) | +4.00px | 061-workspace-narrow.css (3), 012-action-menu.css (1) | 012-action-menu.css:47 |
| `height:2.5rem` | 3 | --control-md (40px) | none | 024-universe-workspace.css (1), 038-lore-front-page-2.css (1), 128-projects-2.css (1) | 024-universe-workspace.css:34 |
| `height:3rem` | 3 | --control-touch (44px) | +4.00px | 038-lore-front-page-2.css (1), 088-member-details.css (1), 120-lorevolve-admin.css (1) | 038-lore-front-page-2.css:24 |
| `height:2.25rem` | 2 | --control-sm (32px) | +4.00px | 020-collaborators.css (1), 050-types-2.css (1) | 020-collaborators.css:76 |
| `height:2.75rem` | 2 | --control-touch (44px) | none | 024-universe-workspace.css (1), 026-overview.css (1) | 024-universe-workspace.css:91 |
| `min-height:2.5rem` | 2 | --control-md (40px) | none | 080-touch.css (1), 082-ideas-2.css (1) | 080-touch.css:71 |
| `min-height:2rem` | 2 | --control-sm (32px) | none | 092-publishing-one-item.css (1), 115-entry-eras.css (1) | 092-publishing-one-item.css:25 |
| `height:2.15rem` | 1 | --control-sm (32px) | +2.40px | 001-foundation.css (1) | 001-foundation.css:263 |
| `min-height:1.75rem` | 1 | --control-sm (32px) | -4.00px | 018-controls.css (1) | 018-controls.css:212 |
| `min-height:2.375rem` | 1 | --control-md (40px) | -2.00px | 024-universe-workspace.css (1) | 024-universe-workspace.css:201 |
| `height:1.75rem` | 1 | --control-sm (32px) | -4.00px | 112-connect-to-ai.css (1) | 112-connect-to-ai.css:90 |

### duration
| Raw value | Count | Nearest token | Swap changes render by | Files (count) | Example |
|---|---|---|---|---|---|
| `700ms` | 4 | --duration-3 (240ms) | +460ms | 046-article.css (2), 068-stories-2.css (2) | 046-article.css:24 |
| `120ms` | 2 | --duration-1 (120ms) | none | 009-progress.css (1), 041-entry-page.css (1) | 009-progress.css:21 |
| `1.1s` | 1 | --duration-3 (240ms) | +860ms | 009-progress.css (1) | 009-progress.css:26 |
| `80ms` | 1 | --duration-1 (120ms) | -40ms | 022-shared-surfaces.css (1) | 022-shared-surfaces.css:56 |
| `160ms` | 1 | --duration-2 (180ms) | -20ms | 043-picture-whole.css (1) | 043-picture-whole.css:84 |
| `0.01ms` | 1 | --duration-1 (120ms) | -120ms | 061-workspace-narrow.css (1) | 061-workspace-narrow.css:266 |

### z-index
| Raw value | Count | Nearest token | Swap changes render by | Files (count) | Example |
|---|---|---|---|---|---|
| `1` | 4 | none (local stacking inside a component) | n/a | 019-universe-plates.css (1), 127-projects.css (1), 128-projects-2.css (1), 129-projects-3.css (1) | 019-universe-plates.css:51 |
| `2` | 3 | none (local stacking inside a component) | n/a | 128-projects-2.css (2), 122-maps-2.css (1) | 122-maps-2.css:33 |
| `-1` | 1 | none (local stacking inside a component) | n/a | 023-atmosphere.css (1) | 023-atmosphere.css:13 |
| `20` | 1 | --z-dropdown (20) | none | 057-entity-picker.css (1) | 057-entity-picker.css:25 |

### font-weight distribution
| Value | Count |
|---|---|
| 600 | 78 |
| 400 | 32 |
| 500 | 20 |

### line-height distribution
| Value | Count |
|---|---|
| 1.25 | 15 |
| 1.3 | 14 |
| 1.6 | 9 |
| 1.5 | 8 |
| 1.2 | 8 |
| 1 | 7 |
| 1.55 | 6 |
| 1.4 | 6 |
| 1.45 | 6 |
| 1.1 | 3 |
| 1.7 | 2 |
| 0 | 2 |
| 1.05 | 2 |
| 1.35 | 2 |
| 1.25rem | 1 |
| 1.72 | 1 |
| 1.75 | 1 |
| 1.15 | 1 |

### Workspace: files with the most off-scale values (all categories)
| File | Raw uses |
|---|---|
| 128-projects-2.css | 46 |
| 081-ideas.css | 34 |
| 025-universe-search-bar.css | 30 |
| 085-family-tree.css | 29 |
| 046-article.css | 28 |
| 113-pending-ai-changes.css | 27 |
| 062-chronology.css | 26 |
| 084-world-rule-checks.css | 26 |
| 055-entry-history.css | 26 |
| 061-workspace-narrow.css | 26 |
| 129-projects-3.css | 25 |
| 029-chronology-date-periods.css | 21 |
