#!/usr/bin/env python3
"""
Builds the Unit D&C layer from the tracked D&C rows and the ODNR units layer.

    python3 gis-data/scripts/build_unit_dc.py build \
        gis-data/source/unit_dc.csv \
        gis-data/layers/ODNR_Units_EPSG4326.geojson \
        gis-data/layers/ODNR_Units_DC_EPSG4326.geojson

    python3 gis-data/scripts/build_unit_dc.py extract <workbook.xlsx> \
        gis-data/source/unit_dc.csv          # refresh the rows from a full workbook

`gis-data/source/unit_dc.csv` is the tracked source of truth: one row per unit
hearing, sorted by date then name so a diff reads cleanly. A single new unit is
one appended line, which is why the rows live here rather than only in a
spreadsheet that exists outside the repo. `extract` regenerates the whole file
from a workbook when a full refresh arrives; it needs openpyxl, `build` does
not.

D&C is dollars per lateral foot. `avg_lateral_ft` is the average lateral per
well, which is why the workbook's value is fractional when a unit has more
than one well.

Matching. Unit names join to the shapefile on a normalized key: whitespace
collapsed, a trailing " Unit" dropped, case folded and punctuation treated as
a separator. That alone joins the large majority; NAME_ALIASES covers the rows
where the two files spell one unit differently. Each alias was confirmed
individually, and the shapefile's spelling is authoritative for the output.
Everything else is left unmatched rather than guessed: most of the remainder
are units that genuinely are not in the shapefile yet.

Duplicates. A unit appearing twice keeps its latest hearing date, on the basis
that a later hearing supersedes an earlier one.
"""
import csv
import json
import re
import sys
import collections
import datetime

# Row spelling -> shapefile spelling. Confirmed one by one; the shapefile is
# treated as correct, so the output always carries its name.
NAME_ALIASES = {
    "Cheetah NSH C": "Cheetah NHS C",                                    # transposed letters
    "McMillen TC RSH Unit": "McMillen TC RSH Unit-",                     # trailing hyphen in the shapefile
    "Rogue HWS18 A": "Rogue HWS 18A",                                    # spacing
    "Gingerich N LND GR Unit": "Gingerich North LND GR",                 # N vs North
    "Cologie N GRN HR 3H": "Cologie N GRN HR",                           # well number appended
    "Davis Farms CR UNI South Extension": "Davis Farms South Extension",  # extra CR UNI
    "Shula TWR27 A": "Shula TWR A",                                      # extra 27
    "Snyder CR UNI": "Snyder GR UNI",                                    # CR vs GR
    # "Bearcats NB BUF 210H Unit" is deliberately absent. It is a later
    # single-well hearing, and aliasing it onto "Bearcats NB BUF" let it
    # supersede that unit's own three-well row. The unit keeps the three-well
    # hearing; the 210H row is left unmatched.
}

# Attributes carried over from the units layer so the D&C layer stands alone.
CARRIED = ["UNIT_ID", "UNIT_NAME", "OPERATOR", "STATUS", "FORMATION", "ACRES"]
FIELDNAMES = ["hearing_date", "unit", "wells", "avg_lateral_ft", "dc_per_ft"]


def norm(s):
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    s = re.sub(r"\s+Unit$", "", s, flags=re.I)
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def iso(v):
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime("%Y-%m-%d")
    return str(v or "")[:10]


def extract(xlsx_path, csv_path):
    """Regenerate the tracked rows from a full workbook."""
    import openpyxl  # only needed for a refresh, so not a dependency of `build`

    rows = []
    for r in openpyxl.load_workbook(xlsx_path, data_only=True)["Sheet1"].iter_rows(min_row=2, values_only=True):
        if not r[1]:
            continue
        dc, ll = num(r[4]), num(r[3])
        rows.append({
            "hearing_date": iso(r[0]),
            "unit": re.sub(r"\s+", " ", str(r[1])).strip(),
            "wells": int(r[2]) if num(r[2]) is not None else "",
            "avg_lateral_ft": round(ll) if ll is not None else "",
            "dc_per_ft": round(dc, 2) if dc is not None else "",
        })
    rows.sort(key=lambda x: (x["hearing_date"], x["unit"]))
    with open(csv_path, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDNAMES, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    print(f"  wrote {csv_path}: {len(rows)} rows")


def read_rows(csv_path):
    with open(csv_path, newline="") as fh:
        reader = csv.DictReader(fh)
        missing = set(FIELDNAMES) - set(reader.fieldnames or [])
        if missing:
            raise SystemExit(f"{csv_path} is missing columns: {sorted(missing)}")
        return list(reader)


def build(csv_path, units_path, out_path):
    rows = read_rows(csv_path)
    units = json.load(open(units_path))
    by_key = {}
    for f in units["features"]:
        by_key.setdefault(norm(f["properties"]["UNIT_NAME"]), []).append(f)
    collisions = {k: len(v) for k, v in by_key.items() if len(v) > 1}
    if collisions:
        raise SystemExit(f"shapefile names collide after normalization, refusing to guess: {collisions}")

    # Latest hearing date wins. An alias can also collapse two rows onto one
    # unit, which is reported separately: those are not simple re-hearings of
    # an identically named unit and deserve a look.
    best, seen = {}, collections.defaultdict(list)
    for r in rows:
        name = r["unit"].strip()
        key = norm(NAME_ALIASES.get(name, name))
        rec = {"date": r["hearing_date"], "name": name, "wells": num(r["wells"]),
               "ll": num(r["avg_lateral_ft"]), "dc": num(r["dc_per_ft"])}
        seen[key].append(rec)
        if key not in best or rec["date"] > best[key]["date"]:
            best[key] = rec
    superseded = len(rows) - len(best)
    collapsed = {k: v for k, v in seen.items() if len(v) > 1 and len({r["name"] for r in v}) > 1}

    features, unmatched, no_dc = [], [], []
    for key, rec in sorted(best.items()):
        match = by_key.get(key)
        if not match:
            unmatched.append(rec["name"])
            continue
        if rec["dc"] is None:
            no_dc.append(rec["name"])
            continue
        src = match[0]
        props = {k: src["properties"].get(k) for k in CARRIED}
        props["DC_PER_FT"] = round(rec["dc"], 2)
        props["HEARING_DATE"] = rec["date"]
        props["WELLS"] = int(rec["wells"]) if rec["wells"] is not None else 0
        props["AVG_LATERAL_FT"] = round(rec["ll"]) if rec["ll"] is not None else 0
        features.append({"type": "Feature", "properties": props, "geometry": src["geometry"]})

    features.sort(key=lambda f: f["properties"]["UNIT_ID"])
    fc = {
        "type": "FeatureCollection",
        "name": "ODNR_Units_DC",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "features": features,
    }
    with open(out_path, "w") as fh:
        json.dump(fc, fh, separators=(",", ":"))
        fh.write("\n")

    aliased = sum(1 for r in rows if r["unit"].strip() in NAME_ALIASES)
    print(f"  source rows        : {len(rows)}")
    print(f"  superseded dupes   : {superseded}")
    print(f"  joined via alias   : {aliased}")
    print(f"  units with D&C     : {len(features)}")
    print(f"  unmatched names    : {len(unmatched)}")
    print(f"  matched but no D&C : {len(no_dc)}")
    d = [f["properties"]["DC_PER_FT"] for f in features]
    print(f"  D&C $/ft           : min {min(d):.2f}  median {sorted(d)[len(d)//2]:.2f}  max {max(d):.2f}")
    if collapsed:
        print("\n  alias collapsed two differently named rows onto one unit (latest kept):")
        for v in collapsed.values():
            for i, r in enumerate(sorted(v, key=lambda x: x["date"], reverse=True)):
                print(f"    {'KEPT   ' if i == 0 else 'dropped'} {r['date']}  {r['name']!r}  wells={int(r['wells'] or 0)} ll={r['ll']:.0f} dc={r['dc']:.2f}")
    print("\n  unmatched:")
    for n in sorted(unmatched):
        print(f"    {n}")


def main():
    args = sys.argv[1:]
    if args[:1] == ["build"] and len(args) == 4:
        build(args[1], args[2], args[3])
    elif args[:1] == ["extract"] and len(args) == 3:
        extract(args[1], args[2])
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
