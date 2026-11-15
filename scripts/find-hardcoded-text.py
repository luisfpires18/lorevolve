"""Find user-visible English still written into the web app's components (ADR 0071).

Every string a reader sees belongs in `src/i18n/en/`, read through `t`, `tn` or `tx`. This is the
check for that: it strips comments, strings and `{...}` expressions from each `.tsx`, then reports
the prose left between tags. A grep cannot do it, because the text that slipped through review sat
after an element (`<ActionIcon /> Add appearance`) or wrapped over two lines.

    python scripts/find-hardcoded-text.py

Exits 1 when it finds anything, so a hook or a workflow step can use it. The brand name in
`Wordmark.tsx` is the one string that stays in English, and it is reported: there is nothing else
to hide behind an exception list yet.
"""
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent / 'src' / 'LorEvolve.Web' / 'src'
WORD = re.compile(r"[A-Za-z]{2,}")
TYPEY = re.compile(r"^(Promise|Record|Array|Map|Set|Partial|Omit|Pick|Readonly)\b")

findings = []
for path in sorted(root.rglob('*.tsx')):
    src = path.read_text(encoding='utf-8')
    # Drop comments, strings and template literals, then every {...} expression.
    body = re.sub(r"/\*[\s\S]*?\*/|//[^\n]*", '', src)
    body = re.sub(r"'(?:[^'\\]|\\.)*'|\"(?:[^\"\\]|\\.)*\"|`(?:[^`\\]|\\.)*`", "''", body)
    for _ in range(12):
        reduced = re.sub(r"\{[^{}]*\}", '{}', body)
        if reduced == body:
            break
        body = reduced
    # Whatever remains between a closing > and the next opening < is rendered text.
    for match in re.finditer(r">([^<>{}]+)<", body):
        text = ' '.join(match.group(1).split())
        if not text or not WORD.search(text) or TYPEY.match(text):
            continue
        # Prose, not leftover code: a capitalised phrase of real words and ordinary punctuation.
        if not re.fullmatch(r"[A-Z][A-Za-z0-9 ,.;:'’‘“”?!…()%-]*", text):
            continue
        if ' ' not in text and len(text) < 3:
            continue
        line = body[:match.start()].count('\n') + 1
        findings.append(f"{path.relative_to(root)}:{line}: {text[:90]}")

print(f"{len(findings)} rendered English string(s) left in components")
for f in findings:
    print(' ', f)
sys.exit(1 if findings else 0)
