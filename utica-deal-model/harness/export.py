"""Deterministic JSON export for pandas / numpy objects.

Rules (documented for the TypeScript comparison layer):
  * floats are written with 17 significant digits ('%.17g'), which round-trips
    every IEEE-754 double exactly; NaN and +/-inf are written as null;
  * pandas Timestamps / datetime.date are written as ISO 'YYYY-MM-DD'
    (all model dates are month starts; no time component is ever nonzero);
  * NaT and None are written as null;
  * numpy bools/ints become JSON true/false and integers;
  * DataFrames are written as {"columns": [...], "dtypes": {...},
    "index": [...], "rows": [[...], ...]} so dtype is available alongside
    the nulls;
  * dict keys are written in insertion order (never sorted) so row/column
    order matches what Python produced.
"""

from __future__ import annotations

import datetime as _dt
import math
import os

import numpy as np
import pandas as pd

FLOAT_FMT = "%.17g"


def _fmt_float(x: float) -> str:
    if math.isnan(x) or math.isinf(x):
        return "null"
    s = FLOAT_FMT % x
    # Guarantee the token parses as a JSON number (17g may emit e.g. '1e+20').
    return s


def _scalar(v):
    """Convert a scalar to a JSON-writable python value or a preformatted token."""
    if v is None or v is pd.NaT:
        return None
    if isinstance(v, (bool, np.bool_)):
        return bool(v)
    if isinstance(v, (int, np.integer)) and not isinstance(v, bool):
        return int(v)
    if isinstance(v, (float, np.floating)):
        return _RawFloat(float(v))
    if isinstance(v, pd.Timestamp):
        if pd.isna(v):
            return None
        if v.hour or v.minute or v.second or v.microsecond or v.nanosecond:
            return v.isoformat()
        return v.strftime("%Y-%m-%d")
    if isinstance(v, np.datetime64):
        return None if np.isnat(v) else _scalar(pd.Timestamp(v))
    if isinstance(v, _dt.datetime):
        ts = pd.Timestamp(v)
        return None if ts is pd.NaT else _scalar(ts)
    if isinstance(v, _dt.date):
        return v.isoformat()
    if isinstance(v, pd.Timedelta):
        return v.isoformat()
    if isinstance(v, str):
        return v
    if v is pd.NaT:
        return None
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(v, np.ndarray):
        return [_scalar(x) for x in v.tolist()]
    if isinstance(v, (list, tuple)):
        return [_scalar(x) for x in v]
    if isinstance(v, dict):
        return {str(k): _scalar(x) for k, x in v.items()}
    if isinstance(v, pd.Series):
        return series_to_obj(v)
    if isinstance(v, pd.DataFrame):
        return frame_to_obj(v)
    if isinstance(v, (set, frozenset)):
        return [_scalar(x) for x in sorted(v, key=str)]
    return str(v)


class _RawFloat:
    __slots__ = ("v",)

    def __init__(self, v):
        self.v = v


def frame_to_obj(df: pd.DataFrame) -> dict:
    df = df.copy()
    cols = [str(c) for c in df.columns]
    dtypes = {str(c): str(df[c].dtype) for c in df.columns}
    rows = []
    values = df.to_numpy(dtype=object)
    for r in range(values.shape[0]):
        rows.append([_scalar(values[r, c]) for c in range(values.shape[1])])
    index = [_scalar(i) for i in df.index.tolist()]
    return {
        "type": "dataframe",
        "shape": [int(df.shape[0]), int(df.shape[1])],
        "columns": cols,
        "dtypes": dtypes,
        "index": index,
        "rows": rows,
    }


def series_to_obj(s: pd.Series) -> dict:
    return {
        "type": "series",
        "name": None if s.name is None else str(s.name),
        "dtype": str(s.dtype),
        "index": [_scalar(i) for i in s.index.tolist()],
        "values": [_scalar(v) for v in s.tolist()],
    }


def _write(obj, out: list, indent: int, level: int):
    pad = " " * (indent * level)
    pad_in = " " * (indent * (level + 1))
    if obj is None:
        out.append("null")
    elif isinstance(obj, _RawFloat):
        out.append(_fmt_float(obj.v))
    elif isinstance(obj, bool):
        out.append("true" if obj else "false")
    elif isinstance(obj, int):
        out.append(str(obj))
    elif isinstance(obj, float):
        out.append(_fmt_float(obj))
    elif isinstance(obj, str):
        out.append(_json_str(obj))
    elif isinstance(obj, dict):
        if not obj:
            out.append("{}")
            return
        out.append("{\n")
        first = True
        for k, v in obj.items():
            if not first:
                out.append(",\n")
            first = False
            out.append(pad_in)
            out.append(_json_str(str(k)))
            out.append(": ")
            _write(v, out, indent, level + 1)
        out.append("\n" + pad + "}")
    elif isinstance(obj, (list, tuple)):
        if not obj:
            out.append("[]")
            return
        # Compact rows of scalars on one line; nested structures expanded.
        if all(not isinstance(x, (dict, list, tuple)) for x in obj):
            out.append("[")
            first = True
            for x in obj:
                if not first:
                    out.append(", ")
                first = False
                _write(x, out, indent, level + 1)
            out.append("]")
        else:
            out.append("[\n")
            first = True
            for x in obj:
                if not first:
                    out.append(",\n")
                first = False
                out.append(pad_in)
                _write(x, out, indent, level + 1)
            out.append("\n" + pad + "]")
    else:
        _write(_scalar(obj), out, indent, level)


def _json_str(s: str) -> str:
    return '"' + (
        s.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t")
    ) + '"'


def dumps(obj, indent: int = 1) -> str:
    out: list[str] = []
    _write(_scalar(obj) if not isinstance(obj, dict) else {k: _scalar(v) for k, v in obj.items()}, out, indent, 0)
    return "".join(out) + "\n"


def dump(obj, path: str, indent: int = 1) -> str:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    text = dumps(obj, indent=indent)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
    return path


def sha256_text(text: str) -> str:
    import hashlib

    return hashlib.sha256(text.encode("utf-8")).hexdigest()
