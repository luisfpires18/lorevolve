"""Runs one shard of the backend suite in CI: `python3 scripts/dotnet-test-shard.py 2/3`.

Test classes are dealt round-robin by name, so every class lands in exactly one shard and a new
class needs no list kept anywhere. Each class still runs whole, in one process, against its own
host and in-memory database, as it does unsharded. After the run, the shard checks from its own
results that it ran exactly the classes dealt to it - no more, no fewer - so a filter that
silently matched too much or too little fails the job instead of losing coverage.

Expects a Release build of tests/LorEvolve.Api.Tests already in place (`--no-build`).
"""

import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

PROJECT = "tests/LorEvolve.Api.Tests"
TRX = "{http://microsoft.com/schemas/VisualStudio/TeamTest/2010}"


def test_command(*extra):
    return ["dotnet", "test", PROJECT, "-c", "Release", "--no-build", *extra]


def all_classes():
    out = subprocess.run(test_command("--list-tests"), check=True, capture_output=True, encoding="utf-8", errors="replace").stdout
    lines = out.splitlines()
    start = next(i for i, line in enumerate(lines) if "The following Tests are available" in line) + 1
    # "Namespace.Class.Method" or "Namespace.Class.Method(argument: ...)" for a theory case.
    return sorted({line.strip().split("(")[0].rsplit(".", 1)[0] for line in lines[start:] if line.startswith("    ")})


def main():
    shard, total = (int(part) for part in sys.argv[1].split("/"))
    classes = all_classes()
    mine = classes[shard - 1 :: total]
    print(f"Shard {shard}/{total}: {len(mine)} of {len(classes)} test classes", flush=True)

    # The trailing dot keeps "Foo." from also matching "FooBar"; every class shares one namespace.
    test_filter = "|".join(f"FullyQualifiedName~{name}." for name in mine)
    results = Path(tempfile.mkdtemp())
    run = subprocess.run(test_command("--filter", test_filter, "--logger", "trx;LogFileName=shard.trx", "--results-directory", str(results)))

    root = ET.parse(results / "shard.trx").getroot()
    ran = {method.get("className") for method in root.iter(f"{TRX}TestMethod")}
    if ran != set(mine):
        print(f"::error::Shard {shard}/{total} ran the wrong classes. Missing: {sorted(set(mine) - ran)}. Extra: {sorted(ran - set(mine))}.")
        return 1
    count = sum(1 for _ in root.iter(f"{TRX}UnitTestResult"))
    print(f"Shard {shard}/{total} ran exactly its {len(mine)} classes: {count} test results.")
    return run.returncode


if __name__ == "__main__":
    sys.exit(main())
