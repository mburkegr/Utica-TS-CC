#!/usr/bin/env python3
"""
Builds the live price deck the app ships with from the tracked monthly rows.

    python3 data/scripts/build_price_deck.py build \
        data/source/price_deck.csv \
        data/price_file_library.json

    python3 data/scripts/build_price_deck.py extract <workbook.xlsx> \
        data/source/price_deck.csv       # refresh the rows from a new strip

`data/source/price_deck.csv` is the tracked source of truth: one row per month,
sorted by month so a diff shows exactly which months moved. `extract`
regenerates it from a price workbook and needs openpyxl; `build` is stdlib only
and is what CI re-runs to prove the committed JSON matches the committed rows.

The CSV carries the source workbook's sha256 on a leading comment line so the
JSON's `source_sha256` keeps naming the file the numbers actually came from.

This deck is data, not engine behaviour. The reconciliation suite deliberately
does NOT read it: it reads `data/validation_price_deck.json`, the frozen deck
the Python golden fixtures were generated from. Refreshing prices therefore
cannot move a reconciliation result. See ENGINE_VALIDATION_SUMMARY.md section 9.
"""

import csv
import hashlib
import json
import sys

HEADER = ["month", "oil_price", "gas_price"]
UNITS = {"oil_price": "$/bbl WTI index", "gas_price": "$/Mcf Henry Hub index"}
SHA_PREFIX = "# source_sha256="


def month_key(iso):
    """'2026-01-01' -> 24312, the month index used for contiguity checks."""
    y, m, d = (int(x) for x in iso.split("-"))
    if d != 1:
        raise SystemExit(f"month {iso!r} must be the first of the month")
    return y * 12 + (m - 1)


def read_rows(csv_path):
    """Returns (rows, source_sha256). Applies the same rules as loadPriceDeck."""
    with open(csv_path, newline="", encoding="utf-8") as fh:
        lines = fh.read().splitlines()
    sha = ""
    while lines and lines[0].startswith("#"):
        head = lines.pop(0)
        if head.startswith(SHA_PREFIX):
            sha = head[len(SHA_PREFIX):].strip()
    reader = csv.DictReader(lines)
    if reader.fieldnames != HEADER:
        raise SystemExit(f"expected header {HEADER}, got {reader.fieldnames}")

    rows = []
    for r in reader:
        iso = r["month"].strip()
        oil, gas = float(r["oil_price"]), float(r["gas_price"])
        for name, v in (("oil_price", oil), ("gas_price", gas)):
            if v != v or v in (float("inf"), float("-inf")) or v <= 0:
                raise SystemExit(f"{iso}: {name} must be a positive finite number, got {v!r}")
        rows.append({"month": iso, "oil_price": oil, "gas_price": gas})
    if not rows:
        raise SystemExit("the pricing file does not contain any pricing rows")

    rows.sort(key=lambda r: month_key(r["month"]))
    keys = [month_key(r["month"]) for r in rows]
    dupes = sorted({rows[i]["month"] for i in range(1, len(keys)) if keys[i] == keys[i - 1]})
    if dupes:
        raise SystemExit(f"duplicate months: {', '.join(dupes)}")
    gaps = [k for k in range(keys[0], keys[-1] + 1) if k not in set(keys)]
    if gaps:
        shown = ", ".join(f"{k // 12:04d}-{k % 12 + 1:02d}-01" for k in gaps[:12])
        raise SystemExit(f"missing monthly pricing for: {shown}")
    return rows, sha


def build(csv_path, json_path):
    rows, sha = read_rows(csv_path)
    deck = {"source_sha256": sha, "units": UNITS, "rows": rows}
    with open(json_path, "w", encoding="utf-8") as fh:
        json.dump(deck, fh, indent=1)
        fh.write("\n")

    oil = [r["oil_price"] for r in rows]
    gas = [r["gas_price"] for r in rows]
    print(f"wrote {json_path}")
    print(f"  months   : {len(rows)}  {rows[0]['month']} .. {rows[-1]['month']}")
    print(f"  oil $/bbl: min {min(oil):.2f}  max {max(oil):.2f}")
    print(f"  gas $/Mcf: min {min(gas):.3f}  max {max(gas):.3f}")
    print(f"  source   : {sha or '(none recorded)'}")


def extract(xlsx_path, csv_path):
    import openpyxl  # only the refresh path needs it

    ws = openpyxl.load_workbook(xlsx_path, data_only=True).worksheets[0]
    grid = list(ws.iter_rows(values_only=True))
    head = [str(c).strip().lower() if c is not None else "" for c in grid[0][:3]]
    if head != HEADER:
        raise SystemExit(f"expected columns {HEADER} on the first sheet, got {head}")

    out = []
    for month, oil, gas in (r[:3] for r in grid[1:]):
        if month is None:
            continue
        iso = month.strftime("%Y-%m-01") if hasattr(month, "strftime") else str(month)[:8] + "01"
        out.append([iso, repr(float(oil)), repr(float(gas))])
    out.sort(key=lambda r: month_key(r[0]))

    sha = hashlib.sha256(open(xlsx_path, "rb").read()).hexdigest()
    with open(csv_path, "w", newline="", encoding="utf-8") as fh:
        fh.write(f"{SHA_PREFIX}{sha}\n")
        w = csv.writer(fh, lineterminator="\n")
        w.writerow(HEADER)
        w.writerows(out)

    read_rows(csv_path)  # fail here rather than at build time
    print(f"wrote {csv_path}: {len(out)} months, {out[0][0]} .. {out[-1][0]}")
    print(f"  source sha256: {sha}")


def main():
    args = sys.argv[1:]
    if args[:1] == ["build"] and len(args) == 3:
        build(args[1], args[2])
    elif args[:1] == ["extract"] and len(args) == 3:
        extract(args[1], args[2])
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
