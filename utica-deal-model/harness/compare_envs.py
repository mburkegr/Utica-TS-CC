"""Compare two fixture trees numerically (not by string equality).

Used to prove the golden fixtures are independent of the pandas/numpy version:
    python compare_envs.py PRIMARY_DIR OTHER_DIR REPORT_JSON

Ignored keys: generation metadata and dtype names (pandas 3 reports 'str'
where pandas 2 reports 'object'; values are what matter).
"""

from __future__ import annotations

import json
import math
import os
import sys

IGNORE_KEYS = {"generated_utc", "elapsed_seconds", "environment", "files_sha256", "dtypes", "dtype",
               "harness_source_sha256", "traceback", "environment_pandas"}
RTOL, ATOL = 1e-12, 1e-9


def walk(a, b, path, stats):
    if isinstance(a, dict) and isinstance(b, dict):
        for k in set(a) | set(b):
            if k in IGNORE_KEYS:
                continue
            if k not in a or k not in b:
                stats["structural"].append(f"{path}/{k}: missing on one side")
                continue
            walk(a[k], b[k], f"{path}/{k}", stats)
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            stats["structural"].append(f"{path}: length {len(a)} vs {len(b)}")
            return
        for i, (x, y) in enumerate(zip(a, b)):
            walk(x, y, f"{path}[{i}]", stats)
    elif isinstance(a, bool) or isinstance(b, bool):
        if a != b:
            stats["value"].append(f"{path}: {a} vs {b}")
    elif isinstance(a, (int, float)) and isinstance(b, (int, float)):
        stats["numeric_compared"] += 1
        if math.isnan(a) and math.isnan(b):
            return
        diff = abs(a - b)
        if diff > ATOL + RTOL * abs(b):
            stats["value"].append(f"{path}: {a!r} vs {b!r}")
        stats["max_abs_diff"] = max(stats["max_abs_diff"], diff)
        if diff > 0:
            stats["nonzero_diffs"] += 1
    elif isinstance(a, str) and isinstance(b, str) and _looks_like_timestamp(a) and _looks_like_timestamp(b):
        # Timestamps: compare numerically in seconds (pandas 2 = ns resolution, pandas 3 = us resolution).
        try:
            ta, tb = _parse_ts(a), _parse_ts(b)
        except Exception:
            if a != b:
                stats["value"].append(f"{path}: {a!r} vs {b!r}")
            return
        stats["timestamps_compared"] = stats.get("timestamps_compared", 0) + 1
        d = abs(ta - tb)
        stats["max_timestamp_diff_seconds"] = max(stats.get("max_timestamp_diff_seconds", 0.0), d)
        if d > TS_ATOL_SECONDS:
            stats["value"].append(f"{path}: {a!r} vs {b!r} ({d:.3g}s apart)")
    else:
        if a != b:
            stats["value"].append(f"{path}: {a!r} vs {b!r}")


TS_ATOL_SECONDS = 1.0


def _looks_like_timestamp(s):
    return len(s) >= 10 and s[4] == "-" and s[7] == "-" and s[:4].isdigit()


def _parse_ts(s):
    import datetime as dt
    sep = "T" if "T" in s else " "
    date_part, _, time_part = s.partition(sep)
    y, m, d = (int(x) for x in date_part.split("-"))
    base = dt.datetime(y, m, d).timestamp()
    if not time_part:
        return base
    hh, mm, ss = time_part.split(":")
    return base + int(hh) * 3600 + int(mm) * 60 + float(ss)


def main(primary, other, report_path):
    report = {"primary": primary, "other": other, "files": {}, "only_in_primary": [], "only_in_other": []}
    p_files = {os.path.relpath(os.path.join(r, f), primary) for r, _, fs in os.walk(primary) for f in fs if f.endswith(".json")}
    o_files = {os.path.relpath(os.path.join(r, f), other) for r, _, fs in os.walk(other) for f in fs if f.endswith(".json")}
    report["only_in_primary"] = sorted(p_files - o_files)
    report["only_in_other"] = sorted(o_files - p_files)
    for rel in sorted(p_files & o_files):
        if rel == "manifest.json" or rel.endswith("/manifest.json"):
            continue
        a = json.load(open(os.path.join(primary, rel)))
        b = json.load(open(os.path.join(other, rel)))
        stats = {"structural": [], "value": [], "numeric_compared": 0, "nonzero_diffs": 0, "max_abs_diff": 0.0}
        walk(a, b, "", stats)
        report["files"][rel] = {
            "numeric_values_compared": stats["numeric_compared"],
            "timestamps_compared": stats.get("timestamps_compared", 0),
            "max_timestamp_diff_seconds": stats.get("max_timestamp_diff_seconds", 0.0),
            "values_with_any_difference": stats["nonzero_diffs"],
            "max_abs_difference": stats["max_abs_diff"],
            "out_of_tolerance": len(stats["value"]),
            "structural_differences": len(stats["structural"]),
            "examples": (stats["value"] + stats["structural"])[:5],
        }
    total_bad = sum(v["out_of_tolerance"] + v["structural_differences"] for v in report["files"].values())
    report["summary"] = {
        "files_compared": len(report["files"]),
        "numeric_values_compared": sum(v["numeric_values_compared"] for v in report["files"].values()),
        "values_with_any_difference": sum(v["values_with_any_difference"] for v in report["files"].values()),
        "max_abs_difference_overall": max([v["max_abs_difference"] for v in report["files"].values()] or [0.0]),
        "out_of_tolerance_or_structural": total_bad,
        "timestamps_compared": sum(v["timestamps_compared"] for v in report["files"].values()),
        "max_timestamp_diff_seconds": max([v["max_timestamp_diff_seconds"] for v in report["files"].values()] or [0.0]),
        "tolerance": {"rtol": RTOL, "atol": ATOL, "timestamp_atol_seconds": TS_ATOL_SECONDS},
        "note": "Primary tree = pandas 2.2.3; other tree = pandas 3.0.2. C08 is absent from the pandas 3 tree because the reference model raises there (recorded in C08/reference_exception.json of that tree).",
    }
    json.dump(report, open(report_path, "w"), indent=1)
    print(json.dumps(report["summary"], indent=1))
    print("only in primary:", report["only_in_primary"])
    print("only in other:", report["only_in_other"])
    return 0 if total_bad == 0 else 1


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:4]))
