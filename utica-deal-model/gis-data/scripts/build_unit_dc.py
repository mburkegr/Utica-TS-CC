#!/usr/bin/env python3
"""
Joins the D&C workbook to the ODNR units layer and writes the Unit D&C GeoJSON.

    pip install openpyxl
    python3 gis-data/scripts/build_unit_dc.py <workbook.xlsx> \
        gis-data/layers/ODNR_Units_EPSG4326.geojson \
        gis-data/layers/ODNR_Units_DC_EPSG4326.geojson

The workbook is one row per unit hearing: Hearing Date, Unit, Wells, LL, D&C.
D&C is dollars per foot (508 - 1308 across the current file); LL is the average
lateral per well, which is why it is fractional when Wells > 1.

Matching. Unit names are joined on a normalized key: whitespace collapsed, a
trailing " Unit" dropped, case folded and punctuation treated as a separator.
That alone joins 358 of 402 rows with no ambiguity — no two shapefile units
share a normalized key. NAME_ALIASES adds the rows where the two files spell
one unit differently; each was confirmed individually, and the shapefile's
spelling is authoritative for the output. Everything else is left unmatched
rather than guessed: most of the remainder are units that genuinely are not in
the shapefile, not misspellings.

Duplicates. A unit appearing twice keeps its latest hearing date, on the basis
that a later hearing supersedes an earlier one.
"""
import json
import re
import sys
import collections
import datetime
import openpyxl

# Workbook spelling -> shapefile spelling. Confirmed one by one; the shapefile
# is treated as correct, so the output always carries its name.
NAME_ALIASES = {
    "Cheetah NSH C": "Cheetah NHS C",                                    # transposed letters
    "McMillen TC RSH Unit": "McMillen TC RSH Unit-",                     # trailing hyphen in the shapefile
    "Rogue HWS18 A": "Rogue HWS 18A",                                    # spacing
    "Gingerich N LND GR Unit": "Gingerich North LND GR",                 # N vs North
    "Cologie N GRN HR 3H": "Cologie N GRN HR",                           # well number appended
    # "Bearcats NB BUF 210H Unit" is deliberately absent. It is a later
    # single-well hearing, and aliasing it onto "Bearcats NB BUF" let it
    # supersede that unit's own three-well row. The unit keeps the three-well
    # hearing; the 210H row is left unmatched.
    "Davis Farms CR UNI South Extension": "Davis Farms South Extension",  # extra CR UNI
    "Shula TWR27 A": "Shula TWR A",                                      # extra 27
    "Snyder CR UNI": "Snyder GR UNI",                                    # CR vs GR
}

# Attributes carried over from the units layer so the D&C layer stands alone.
CARRIED = ["UNIT_ID", "UNIT_NAME", "OPERATOR", "STATUS", "FORMATION", "ACRES"]


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


def main():
    xlsx, units_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    rows = [r for r in openpyxl.load_workbook(xlsx, data_only=True)["Sheet1"].iter_rows(min_row=2, values_only=True) if r[1]]
    units = json.load(open(units_path))
    by_key = {}
    for f in units["features"]:
        by_key.setdefault(norm(f["properties"]["UNIT_NAME"]), []).append(f)
    collisions = {k: len(v) for k, v in by_key.items() if len(v) > 1}
    if collisions:
        raise SystemExit(f"shapefile names collide after normalization, refusing to guess: {collisions}")

    # Latest hearing date wins. An alias can also collapse two workbook rows onto
    # one unit, which is reported separately: those are not simple re-hearings of
    # an identically named unit and deserve a look.
    best, seen = {}, collections.defaultdict(list)
    for r in rows:
        name = str(r[1]).strip()
        key = norm(NAME_ALIASES.get(name, name))
        date = iso(r[0])
        rec = {"date": date, "name": name, "wells": num(r[2]), "ll": num(r[3]), "dc": num(r[4])}
        seen[key].append(rec)
        prior = best.get(key)
        if prior is None or date > prior["date"]:
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

    aliased = sum(1 for r in rows if str(r[1]).strip() in NAME_ALIASES)
    print(f"  workbook rows      : {len(rows)}")
    print(f"  superseded dupes   : {superseded}")
    print(f"  joined via alias   : {aliased}")
    print(f"  units with D&C     : {len(features)}")
    print(f"  unmatched names    : {len(unmatched)}")
    print(f"  matched but no D&C : {len(no_dc)}")
    d = [f["properties"]["DC_PER_FT"] for f in features]
    print(f"  D&C $/ft           : min {min(d):.2f}  median {sorted(d)[len(d)//2]:.2f}  max {max(d):.2f}")
    if collapsed:
        print("\n  alias collapsed two differently named rows onto one unit (latest kept):")
        for k, v in collapsed.items():
            for i, r in enumerate(sorted(v, key=lambda x: x["date"], reverse=True)):
                print(f"    {'KEPT   ' if i == 0 else 'dropped'} {r['date']}  {r['name']!r}  wells={int(r['wells'] or 0)} ll={r['ll']:.0f} dc={r['dc']:.2f}")
    print("\n  unmatched:")
    for n in sorted(unmatched):
        print(f"    {n}")


if __name__ == "__main__":
    main()
