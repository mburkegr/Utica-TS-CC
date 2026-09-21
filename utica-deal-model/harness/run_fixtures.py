"""Generate golden fixtures from the pinned Python reference model.

Usage:  python run_fixtures.py [--out DIR] [--cases C01,C02,...]

The production model code is never modified.  model.py is imported from the
pinned clone; app.py functions are AST-extracted (see reference_loader.py).
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import os
import platform
import sys
import time
import traceback

import numpy as np
import pandas as pd

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import cases as C  # noqa: E402
import export as E  # noqa: E402
import reference_loader as rl  # noqa: E402

HARNESS_VERSION = "1.0.0"
HARNESS_FILES = ["reference_loader.py", "export.py", "cases.py", "run_fixtures.py", "TOLERANCES.md"]

LEGACY_CALENDAR_MONTHS = 360
FULL_LIFE_MONTHS = 600  # comfortably past the latest curve end in any case


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def harness_source_hash() -> str:
    h = hashlib.sha256()
    for f in HARNESS_FILES:
        with open(os.path.join(HERE, f), "rb") as fh:
            h.update(f.encode())
            h.update(fh.read())
    return h.hexdigest()


def frames_equal(a: pd.DataFrame, b: pd.DataFrame, label: str):
    """Exact equality (same code path) with a readable error."""
    try:
        pd.testing.assert_frame_equal(
            a.reset_index(drop=True), b.reset_index(drop=True), check_dtype=False, check_exact=True
        )
    except AssertionError as exc:
        raise AssertionError(f"consistency check failed: {label}\n{exc}") from None


def series_dict(s: pd.Series) -> dict:
    return {str(k): v for k, v in s.items()}


def payback_interpolation(deal_df: pd.DataFrame, cutoff: pd.Timestamp | None):
    """Same interpolation as build_cumulative_fcf_chart, optionally without its 2040 cutoff."""
    df = deal_df.copy()
    df["date"] = pd.to_datetime(df["date"])
    if cutoff is not None:
        df = df[df["date"] <= cutoff].copy()
    monthly = df.groupby("date", as_index=False)["slot_total_cash_flow"].sum()
    monthly["cum_fcf"] = monthly["slot_total_cash_flow"].cumsum() / 1000.0
    for i in range(1, len(monthly)):
        prev_val = monthly.loc[i - 1, "cum_fcf"]
        curr_val = monthly.loc[i, "cum_fcf"]
        if prev_val < 0 <= curr_val:
            prev_date = monthly.loc[i - 1, "date"]
            curr_date = monthly.loc[i, "date"]
            frac = 0 if curr_val == prev_val else (0 - prev_val) / (curr_val - prev_val)
            payback_date = prev_date + (curr_date - prev_date) * frac
            years = (payback_date - monthly.loc[0, "date"]).days / 365.25
            return {"payback_date": payback_date, "payback_years": float(years), "start_date": monthly.loc[0, "date"]}
    return {"payback_date": None, "payback_years": None, "start_date": monthly.loc[0, "date"]}


def read_vline_from_fig(fig):
    for sh in fig.layout.shapes:
        if (sh.type == "line" and sh.xref == "x" and sh.yref in ("paper", "y domain")
                and sh.x0 == sh.x1 and sh.line.dash == "dot"):
            return pd.Timestamp(sh.x0)
    return None


# ---------------------------------------------------------------------------
# dynamic reporting (harness-derived expected new behavior)
# ---------------------------------------------------------------------------
def dynamic_period_table(deal_df, all_slots_df, slot_df, granularity: str, n_quarters: int | None):
    """Period aggregation mirroring build_quarterly_output_table.build_section formulas,
    with period labels derived from the actual deal calendar instead of hard-coded lists."""
    deal = deal_df.copy()
    slots = all_slots_df.copy()
    slot_inputs = slot_df.copy()
    deal["date"] = pd.to_datetime(deal["date"])
    slots["date"] = pd.to_datetime(slots["date"])
    slot_inputs["drilling_spud_month"] = pd.to_datetime(slot_inputs["drilling_spud_month"])

    active = deal[
        (deal[["slot_gross_boe", "slot_total_cash_flow"]].abs().sum(axis=1) > 0)
    ]
    econ_end = active["date"].max() if not active.empty else deal["date"].max()
    cal_start = deal["date"].min()

    if granularity == "quarter":
        deal["label"] = "Q" + deal["date"].dt.quarter.astype(str) + " " + deal["date"].dt.strftime("%y")
        starts = pd.date_range(cal_start.to_period("Q").to_timestamp(), periods=n_quarters, freq="QS")
        labels = ["Q" + str(s.quarter) + " " + s.strftime("%y") for s in starts]
        days = pd.Series({lab: int((s + pd.offsets.QuarterEnd(0) - s).days + 1) for lab, s in zip(labels, starts)}, dtype=float)
        slot_inputs["label"] = "Q" + slot_inputs["drilling_spud_month"].dt.quarter.astype(str) + " " + slot_inputs["drilling_spud_month"].dt.strftime("%y")
    else:
        deal["label"] = deal["date"].dt.year.astype(str)
        years = list(range(cal_start.year, econ_end.year + 1))
        labels = [str(y) for y in years]
        days = pd.Series({str(y): int((pd.Timestamp(y, 12, 31) - pd.Timestamp(y, 1, 1)).days + 1) for y in years}, dtype=float)
        slot_inputs["label"] = slot_inputs["drilling_spud_month"].dt.year.astype(str)

    prices = deal.groupby("label")[["index_oil_price", "index_gas_price"]].mean().reindex(labels)
    df = deal.groupby("label").sum(numeric_only=True).reindex(labels)

    # wells spud (same rule as Python: effective_net_wells on the spud-month row, fallback formula)
    spud_wi = slots[["slot_id", "date", "effective_net_wells"]].merge(
        slot_inputs[["slot_id", "drilling_spud_month"]], on="slot_id", how="inner"
    )
    spud_wi = spud_wi[spud_wi["date"] == spud_wi["drilling_spud_month"]]
    net_by_slot = spud_wi.groupby("slot_id")["effective_net_wells"].first()
    unit_acres_final = np.where(
        slot_inputs["use_calc_unit_acres"].fillna(False),
        slot_inputs["gross_wells"] * slot_inputs["lateral_length"] / 50.0,
        slot_inputs["unit_acres"],
    )
    fb_wi = np.where(unit_acres_final != 0, (slot_inputs["net_acres"] / unit_acres_final) * slot_inputs["pct_unitized"], 0.0)
    slot_inputs["net_wells_spud"] = slot_inputs["slot_id"].map(net_by_slot).fillna(pd.Series(fb_wi * slot_inputs["gross_wells"], index=slot_inputs.index))
    slot_inputs["gross_wells_spud"] = slot_inputs["gross_wells"]
    spud = slot_inputs.groupby("label")[["gross_wells_spud", "net_wells_spud"]].sum().reindex(labels).fillna(0.0)

    def safe_div(n, d):
        return np.where((d != 0) & pd.notnull(d), n / d, 0.0)

    out = pd.DataFrame(index=[], columns=labels, dtype=float)
    oil_idx, gas_idx = prices["index_oil_price"], prices["index_gas_price"]
    realized_oil = safe_div(df["slot_oil_revenue"], df["slot_net_oil_production"])
    realized_gas = safe_div(df["slot_gas_revenue"], df["slot_net_gas_production"])
    realized_ngl = safe_div(df["slot_ngl_revenue"], df["slot_net_ngl_production"])
    total_mcfe = df["slot_net_oil_production"] * 6.0 + df["slot_net_ngl_production"] * 6.0 + df["slot_net_gas_production"]
    taxes_pos, loe_pos = -df["slot_tax"], -df["slot_loe"]
    total_opex = taxes_pos + loe_pos
    d_and_c, acq = -df["slot_capex"], -df["slot_asset_purchase"]
    fcf = df["slot_total_cash_flow"]

    out.loc["Assumed Index Pricing - Crude Oil"] = oil_idx
    out.loc["Assumed Index Pricing - Natural Gas"] = gas_idx
    out.loc["Realized Pricing - Crude Oil"] = realized_oil
    out.loc["Realized Pricing - NGL (% of WTI)"] = safe_div(realized_ngl, oil_idx)
    out.loc["Realized Pricing - Natural Gas"] = realized_gas
    out.loc["Gross Wells Spud"] = spud["gross_wells_spud"]
    out.loc["Net Wells Spud"] = spud["net_wells_spud"]
    out.loc["Production - Crude Oil"] = safe_div(df["slot_net_oil_production"], days)
    out.loc["Production - NGL's"] = safe_div(df["slot_net_ngl_production"], days)
    out.loc["Production - Natural Gas"] = safe_div(df["slot_net_gas_production"], days)
    out.loc["Production - Total (Mcfe/d)"] = safe_div(total_mcfe, days)
    out.loc["Revenues - Crude Oil"] = df["slot_oil_revenue"] / 1000.0
    out.loc["Revenues - NGL's"] = df["slot_ngl_revenue"] / 1000.0
    out.loc["Revenues - Natural Gas"] = df["slot_gas_revenue"] / 1000.0
    out.loc["Revenues - Total"] = df["slot_total_revenue"] / 1000.0
    out.loc["Operating Expenses - Taxes"] = taxes_pos / 1000.0
    out.loc["Operating Expenses - LOE"] = loe_pos / 1000.0
    out.loc["Operating Expenses - Total Opex"] = total_opex / 1000.0
    out.loc["Taxes / Mcfe"] = safe_div(taxes_pos, total_mcfe)
    out.loc["LOE / Mcfe"] = safe_div(loe_pos, total_mcfe)
    out.loc["EBITDA"] = (df["slot_total_revenue"] - total_opex) / 1000.0
    out.loc["Capital Expenditures - D&C"] = d_and_c / 1000.0
    out.loc["Capital Expenditures - Acquisition"] = acq / 1000.0
    out.loc["Capital Expenditures - Total"] = (d_and_c + acq) / 1000.0
    out.loc["Free Cash Flow"] = fcf / 1000.0
    out.loc["Cumulative FCF"] = (fcf / 1000.0).cumsum()
    return out.astype(float), {"calendar_start": cal_start, "economic_end": econ_end}


def compare_overlap(legacy: pd.DataFrame, dynamic: pd.DataFrame, label: str):
    """Assert the harness dynamic table equals the Python legacy table on shared columns."""
    common = [c for c in legacy.columns if c in dynamic.columns]
    mism = []
    for c in common:
        for r in legacy.index:
            lv = legacy.loc[r, c]
            dv = dynamic.loc[r, c] if r in dynamic.index else np.nan
            if pd.isna(lv) and pd.isna(dv):
                continue
            if pd.isna(lv) or pd.isna(dv) or not np.isclose(float(lv), float(dv), rtol=1e-12, atol=1e-9):
                mism.append((r, c, lv, dv))
    if mism:
        raise AssertionError(f"dynamic-vs-legacy overlap mismatch in {label}: {mism[:5]}")
    return common


# ---------------------------------------------------------------------------
# sensitivity specifications (replicates the app's Sensitivity Tables block)
# ---------------------------------------------------------------------------
def sensitivity_specs(slot_df, deal_inputs, fns, use_tc_risk_as_main: bool, use_dc_pct: bool):
    base_dc = float(deal_inputs["dc_override"]) if deal_inputs["use_dc_override"] else fns["weighted_avg_by_net_acres"](slot_df, "dc_costs")
    base_bid = max(1.0, float(deal_inputs["bid_override"]) if deal_inputs["use_bid_override"] else fns["weighted_avg_by_net_acres"](slot_df, "bid_per_acre"))
    base_tc_risk = fns["weighted_avg_by_net_acres"](slot_df, "tc_risk")
    base_ngl_yield = fns["weighted_avg_by_net_acres"](slot_df, "ngl_yield")
    bid_values = fns["build_sensitivity_range"](base_bid, 500.0, 4, min_value=1.0)
    tc_risk_values = [max(0.0, base_tc_risk + 0.05 * i) for i in range(-4, 5)]
    if use_dc_pct:
        dc_values = fns["build_percentage_sensitivity_range"](base_dc, pct_step=0.05, steps_each_way=4, min_value=0.0)
    else:
        dc_values = fns["build_sensitivity_range"](base_dc, 50.0, 4, min_value=0.0)
    oil_values = fns["build_sensitivity_range"](float(deal_inputs["oil_price"]), 5.0, 4)
    gas_values = fns["build_sensitivity_range"](float(deal_inputs["gas_price"]), 0.25, 4)
    ngl_yield_values = fns["build_sensitivity_range"](base_value=base_ngl_yield, step=0.50, steps_each_way=4, min_value=0.0)
    base_spud_month = fns["weighted_avg_spud_month_by_net_acres"](slot_df)
    spud_date_values = [base_spud_month + pd.DateOffset(months=3 * i) for i in range(-4, 5)]

    if use_tc_risk_as_main:
        main_values, main_variable, main_base = tc_risk_values, "tc_risk", base_tc_risk
        cross_x_values, cross_x_variable, cross_base_x = bid_values, "bid", base_bid
    else:
        main_values, main_variable, main_base = bid_values, "bid", base_bid
        cross_x_values, cross_x_variable, cross_base_x = tc_risk_values, "tc_risk", base_tc_risk

    specs = [
        dict(key="dc_main", x_values=dc_values, x_variable="dc", y_values=main_values, y_variable=main_variable, base_x=base_dc, base_y=main_base),
        dict(key="oil_main", x_values=oil_values, x_variable="oil", y_values=main_values, y_variable=main_variable, base_x=deal_inputs["oil_price"], base_y=main_base),
        dict(key="ngl_main", x_values=ngl_yield_values, x_variable="ngl_yield", y_values=main_values, y_variable=main_variable, base_x=base_ngl_yield, base_y=main_base),
        dict(key="gas_main", x_values=gas_values, x_variable="gas", y_values=main_values, y_variable=main_variable, base_x=deal_inputs["gas_price"], base_y=main_base),
        dict(key="gas_dc", x_values=gas_values, x_variable="gas", y_values=dc_values, y_variable="dc", base_x=deal_inputs["gas_price"], base_y=base_dc),
        dict(key="oil_gas", x_values=oil_values, x_variable="oil", y_values=gas_values, y_variable="gas", base_x=deal_inputs["oil_price"], base_y=deal_inputs["gas_price"]),
        dict(key="cross_main", x_values=cross_x_values, x_variable=cross_x_variable, y_values=main_values, y_variable=main_variable, base_x=cross_base_x, base_y=main_base),
        dict(key="spud_tc", x_values=spud_date_values, x_variable="spud_date", y_values=tc_risk_values, y_variable="tc_risk", base_x=base_spud_month, base_y=base_tc_risk),
    ]
    # Carry / entry customs with the app's default control values
    carry_start, carry_step, bid_start, bid_step = 10.0, 5.0, float(max(1.0, base_bid)), 500.0
    carry_sens_values = [round((carry_start + carry_step * i) / 100.0, 10) for i in range(7)]
    bid_sens_values = [max(1.0, round(bid_start + bid_step * i, 10)) for i in range(7)]
    customs = [
        dict(key="carry_dc_custom", x_values=dc_values, x_variable="dc", y_values=carry_sens_values, y_variable="carry",
             forcing="bid_override=1.0"),
        dict(key="bid_dc_custom", x_values=dc_values, x_variable="dc", y_values=bid_sens_values, y_variable="bid",
             forcing="carry off on every slot; carry override off"),
    ]
    bases = dict(base_dc=base_dc, base_bid=base_bid, base_tc_risk=base_tc_risk, base_ngl_yield=base_ngl_yield,
                 base_spud_month=base_spud_month, bid_values=bid_values, tc_risk_values=tc_risk_values,
                 dc_values=dc_values, oil_values=oil_values, gas_values=gas_values,
                 ngl_yield_values=ngl_yield_values, spud_date_values=spud_date_values,
                 carry_sens_values=carry_sens_values, bid_sens_values=bid_sens_values)
    return specs, customs, bases


def run_spec(spec, slot_df, deal_inputs, fns):
    sens_slot_df = slot_df.copy()
    sens_deal_inputs = dict(deal_inputs)
    if spec["key"] == "carry_dc_custom":
        sens_deal_inputs["use_bid_override"] = True
        sens_deal_inputs["bid_override"] = 1.0
    elif spec["key"] == "bid_dc_custom":
        sens_deal_inputs["use_carry_override"] = False
        sens_deal_inputs["carry_override_pct"] = 0.0
        sens_slot_df["carry_enabled"] = False
        sens_slot_df["carry_wi_reversion_pct"] = 0.0
    irr_df, moic_df = fns["run_two_way_sensitivity"](
        slot_df=sens_slot_df, deal_inputs=sens_deal_inputs,
        x_values=spec["x_values"], x_variable=spec["x_variable"],
        y_values=spec["y_values"], y_variable=spec["y_variable"],
    )
    return {
        "key": spec["key"], "x_variable": spec["x_variable"], "y_variable": spec["y_variable"],
        "x_values": list(spec["x_values"]), "y_values": list(spec["y_values"]),
        "base_x": spec.get("base_x"), "base_y": spec.get("base_y"), "forcing": spec.get("forcing"),
        "irr": irr_df.astype(float), "moic": moic_df.astype(float),
    }


def scenario_matrix(slot_df, deal_inputs, fns, model, base_bid, base_dc):
    """Read IRR points back from the production figure and reconcile against a
    harness reconstruction (which also carries MOIC)."""
    fig = fns["build_scenario_scatter_chart"](slot_df=slot_df, deal_inputs=deal_inputs, base_bid=base_bid, base_dc=base_dc)
    fig_points = []
    for tr in fig.data:
        if tr.name == "Current Base Point":
            continue
        for x, y, cd in zip(tr.x, tr.y, tr.customdata):
            fig_points.append(dict(bid=float(x), irr=float(y), tc_risk=float(cd[0]), oil=float(cd[1]), gas=float(cd[2]), trace=tr.name))
    # Reconstruction with the same definitions as build_scenario_scatter_chart
    bid_values = fns["build_sensitivity_range"](base_bid, 500.0, 3, min_value=1.0)
    dc_cases = [("Low", base_dc - 50.0), ("Base", base_dc), ("High", base_dc + 50.0)]
    tc_values = [0.80, 1.00, 1.20]
    bo, bg = float(deal_inputs["oil_price"]), float(deal_inputs["gas_price"])
    pricing = [("Downside", max(0.0, bo - 5.0), max(0.0, bg - 0.25)), ("Base", bo, bg), ("Upside", bo + 5.0, bg + 0.25)]
    rows = []
    for pname, op, gp in pricing:
        for dlabel, dval in dc_cases:
            for tc in tc_values:
                for bid in bid_values:
                    di = dict(deal_inputs); di.update(oil_price=float(op), gas_price=float(gp), use_bid_override=True,
                                                    bid_override=float(bid), use_dc_override=True, dc_override=float(dval))
                    sd = slot_df.copy(); sd["tc_risk"] = float(tc)
                    try:
                        irr, moic = model.run_deal_metrics(sd, di)
                    except Exception:
                        irr, moic = None, None
                    rows.append(dict(pricing_case=pname, oil_price=op, gas_price=gp, dc_case=dlabel, dc_value=dval,
                                     tc_risk=tc, bid=bid, irr=irr, moic=moic))
    recon = pd.DataFrame(rows)
    # Reconcile: every figure point must match a reconstructed row exactly
    unmatched = 0
    for p in fig_points:
        m = recon[(recon.bid == p["bid"]) & (recon.tc_risk == p["tc_risk"]) & (recon.oil_price == p["oil"]) & (recon.gas_price == p["gas"])]
        m = m[m["dc_case"].map(lambda d: d in p["trace"])]
        if len(m) != 1 or not np.isclose(float(m.irr.iloc[0]), p["irr"], rtol=0, atol=1e-12):
            unmatched += 1
    if unmatched:
        raise AssertionError(f"scenario matrix read-back mismatch: {unmatched} figure points did not reconcile")
    labels = {"figure_dc_legend_labels": sorted({t.name for t in fig.data if t.name != "Current Base Point"}),
              "actual_dc_values": {k: v for k, v in dc_cases},
              "note": "Legend text shows +/-100 while the computed D&C cases are +/-50 (documented label defect)."}
    return recon, len(fig_points), labels


# ---------------------------------------------------------------------------
# the stepwise pipeline
# ---------------------------------------------------------------------------
def run_case(case: dict, fns: dict, model, out_dir: str, ref_report, parent_results=None):
    name = case["name"]
    case_dir = os.path.join(out_dir, name)
    os.makedirs(case_dir, exist_ok=True)
    t0 = time.time()
    written = {}

    def emit(level: str, obj):
        path = E.dump(obj, os.path.join(case_dir, f"{level}.json"))
        with open(path, "rb") as fh:
            written[f"{level}.json"] = hashlib.sha256(fh.read()).hexdigest()

    slot_df, run_deal_inputs = C.app_preprocess(case["slots"], case["deal_inputs"], fns)

    # ---- monkeypatch (P2 only) ------------------------------------------
    patch_record = None
    original_align = model.align_to_financial_calendar
    if case["monkeypatch"]:
        def patched_align(slot_df_, effective_date, months=LEGACY_CALENDAR_MONTHS):
            return original_align(slot_df_, effective_date, months=FULL_LIFE_MONTHS)
        model.align_to_financial_calendar = patched_align
        eff = pd.Timestamp(run_deal_inputs["effective_date"])
        patch_record = {
            "applied": True,
            "target": "model.align_to_financial_calendar (module attribute rebound in harness process only)",
            "call_site_affected": "model.build_all_slot_financials passes months=360 by literal; wrapper ignores it and passes months=600",
            "behaviors_changed": [
                f"calendar_end moves from {(eff + pd.DateOffset(months=LEGACY_CALENDAR_MONTHS - 1)).date()} to {(eff + pd.DateOffset(months=FULL_LIFE_MONTHS - 1)).date()}",
                "every slot frame gains the extra zero-filled or curve-tail months; the late-spud slot recovers curve months that the 360-month calendar dropped",
                "deal_df, promote schedule, IRR, MOIC, payback and reporting are computed over the extended calendar",
            ],
            "behaviors_unchanged": [
                "single-well economics (run_single_slot_economics), ownership, NGL, pricing, shut-in test, Dale/carry layers",
                "calendar_start rule, acquisition placement, fill rules (numeric NaN -> 0, period -> 0 on empty rows)",
                "all rows dated on or before the legacy calendar_end are asserted identical to the parent case",
            ],
            "source_of_truth_warning": "OUTPUTS OF THIS CASE ARE NOT PRODUCTION-MODEL OUTPUTS. They are a Phase 2 full-life reference only.",
            "parent_case": case["monkeypatch"]["parent"],
        }
    try:
        # ---- L0 prepared inputs ----------------------------------------
        raw_inputs = {"slots_as_entered": case["slots"], "deal_inputs_as_entered": case["deal_inputs"]}
        slot_inputs = model.prepare_slot_inputs(slot_df, run_deal_inputs)
        deal_settings = model.prepare_deal_settings(run_deal_inputs)
        global_assumptions = model.prepare_global_assumptions(run_deal_inputs)
        emit("L00_inputs", {
            "raw": raw_inputs,
            "model_slot_df_after_app_preprocessing": slot_df,
            "run_deal_inputs_after_app_preprocessing": run_deal_inputs,
            "prepared_slot_inputs": slot_inputs,
            "deal_settings": deal_settings,
            "global_assumptions": global_assumptions,
        })

        type_curve_library = model.load_type_curve_library("type_curve_library.xlsx")
        total_net_acres = pd.to_numeric(slot_inputs["net_acres"], errors="coerce").fillna(0).sum()

        # ---- L1 .. L5 per slot ---------------------------------------
        l1, l2, l3, l4, l5 = {}, {}, {}, {}, {}
        for _, slot_row in slot_inputs.iterrows():
            sid = str(int(slot_row["slot_id"]))
            metrics = model.calc_slot_metrics(slot_row, deal_settings, total_net_acres)
            l1[sid] = series_dict(metrics)
            ngl = model.build_slot_ngl_factors(
                slot=metrics, global_assumptions=global_assumptions,
                content_percentages=global_assumptions["content_percentages"],
                recover_ethane_percentages=global_assumptions["recover_ethane_percentages"],
                reject_ethane_percentages=global_assumptions["reject_ethane_percentages"],
                ngl_prices=global_assumptions["ngl_prices"], ngl_shrink_factors=global_assumptions["ngl_shrink_factors"],
            )
            l2[sid] = {k: v for k, v in ngl.items()}
            one_well = model.run_single_slot_economics(slot=metrics, type_curve_library=type_curve_library,
                                                       global_assumptions=global_assumptions, slot_ngl=ngl)
            l4[sid] = one_well
            l3[sid] = model.build_index_price_series(dates=one_well["date"], global_assumptions=global_assumptions)
            l5[sid] = model.build_slot_financials(slot=slot_row, deal_settings=deal_settings,
                                                  type_curve_library=type_curve_library,
                                                  global_assumptions=global_assumptions, total_net_acres=total_net_acres)
        tc_lengths = {n: int(len(v["monthly"])) for n, v in type_curve_library.items() if n in set(model.clean_tc_name(x) for x in slot_inputs["tc_name"])}
        emit("L01_slot_metrics", l1)
        emit("L02_ngl_factors", l2)
        emit("L04_single_well_frames", l4)
        emit("L05_slot_financials_pre_alignment", l5)

        # ---- L6 aligned + acquisition ----------------------------------
        all_slots = model.build_all_slot_financials(slot_inputs=slot_inputs, deal_settings=deal_settings,
                                                    type_curve_library=type_curve_library, global_assumptions=global_assumptions)
        l3["deal_calendar"] = model.build_index_price_series(dates=all_slots["date"].drop_duplicates().sort_values(),
                                                              global_assumptions=global_assumptions)
        emit("L03_price_series", l3)
        emit("L06_aligned_slots_with_acquisition", all_slots)

        # ---- L7 promote schedule ---------------------------------------
        promoted = all_slots[all_slots["dale_promote"].fillna(False).astype(bool)]
        if deal_settings["promote_enabled"] and not promoted.empty:
            schedule = model.build_promote_schedule(promoted.copy(), deal_settings)
        else:
            schedule = pd.DataFrame()
        emit("L07_promote_schedule", {"promote_enabled": bool(deal_settings["promote_enabled"]), "schedule": schedule})

        # ---- L8 post-promote -------------------------------------------
        all_slots_post = model.apply_promote_to_slots(all_slots, deal_settings)
        emit("L08_all_slots_post_promote", all_slots_post)

        # ---- L9 deal frame ---------------------------------------------
        deal_df = model.roll_up_deal(all_slots_post)
        deal_df = deal_df.merge(model.build_index_price_series(dates=deal_df["date"], global_assumptions=global_assumptions), on="date", how="left")
        emit("L09_deal_frame", deal_df)

        # ---- end-to-end consistency ------------------------------------
        e2e_all, e2e_deal, e2e_slot_audit, e2e_deal_audit, e2e_irr, e2e_moic = model.run_deal_model(slot_df, run_deal_inputs)
        frames_equal(all_slots_post, e2e_all, "stepwise L8 vs run_deal_model all_slots_df")
        frames_equal(deal_df, e2e_deal, "stepwise L9 vs run_deal_model deal_df")

        # ---- L10 returns -----------------------------------------------
        irr = model.calc_financial_irr(deal_df)
        moic = model.calc_financial_moic(deal_df)
        assert (irr is None and e2e_irr is None) or np.isclose(irr, e2e_irr, rtol=0, atol=0), "IRR stepwise vs e2e"
        assert (moic is None and e2e_moic is None) or np.isclose(moic, e2e_moic, rtol=0, atol=0), "MOIC stepwise vs e2e"
        metrics_irr, metrics_moic = model.run_deal_metrics(slot_df, run_deal_inputs)
        standalone = fns["run_individual_slot_returns"](slot_df=slot_df, deal_inputs=run_deal_inputs)

        cum_fig = fns["build_cumulative_fcf_chart"](deal_df, slot_df)
        legacy_pb = payback_interpolation(deal_df, cutoff=pd.Timestamp("2040-12-31"))
        fig_vline = read_vline_from_fig(cum_fig)
        if (fig_vline is None) != (legacy_pb["payback_date"] is None):
            raise AssertionError("payback read-back: presence mismatch between figure and interpolation")
        if fig_vline is not None and abs((fig_vline - legacy_pb["payback_date"]).total_seconds()) > 1e-3:
            raise AssertionError(f"payback read-back mismatch: figure {fig_vline} vs interpolation {legacy_pb['payback_date']}")
        dynamic_pb = payback_interpolation(deal_df, cutoff=None)

        active = deal_df[(deal_df[["slot_gross_boe", "slot_total_cash_flow"]].abs().sum(axis=1) > 0)]
        emit("L10_returns", {
            "irr": irr, "moic": moic,
            "irr_from_run_deal_metrics": metrics_irr, "moic_from_run_deal_metrics": metrics_moic,
            "irr_method": "pyxirr.xirr(deal_df.date, deal_df.slot_total_cash_flow); None on exception",
            "moic_method": "sum(positive monthly deal CF) / -sum(negative monthly deal CF) on deal-level netted series; None if invested == 0",
            "standalone_slot_returns": {str(k): v for k, v in standalone.items()},
            "payback_legacy_python_golden": {**legacy_pb, "note": "build_cumulative_fcf_chart filters dates <= 2040-12-31 before interpolating; value read back from figure vline"},
            "payback_dynamic_expected": {**dynamic_pb, "note": "HARNESS-DERIVED full-life payback with the same interpolation; intentional new behavior, not a Python parity target"},
            "calendar_start": deal_df["date"].min(), "calendar_end": deal_df["date"].max(),
            "economic_calendar_end_last_nonzero_month": active["date"].max() if not active.empty else None,
            "deal_rows": int(len(deal_df)),
        })

        # ---- L11 reporting ---------------------------------------------
        quarterly_legacy = fns["build_quarterly_output_table"](deal_df=deal_df, all_slots_df=all_slots_post, slot_df=slot_df, deal_inputs=run_deal_inputs)
        q_cols = [c for c in quarterly_legacy.columns if str(c).startswith("Q")]
        y_cols = [c for c in quarterly_legacy.columns if str(c).isdigit()]
        legacy_q = quarterly_legacy[q_cols].astype(float)
        legacy_y = quarterly_legacy[y_cols].astype(float)
        dyn_q, meta_q = dynamic_period_table(deal_df, all_slots_post, slot_df, "quarter", 8)
        dyn_y, meta_y = dynamic_period_table(deal_df, all_slots_post, slot_df, "year", None)
        common_q = compare_overlap(legacy_q, dyn_q, "quarterly")
        common_y = compare_overlap(legacy_y, dyn_y, "annual")
        display_df, row_styles = fns["build_quarterly_output_display_table"](quarterly_legacy)

        eur = {}
        for _, r in slot_df.iterrows():
            sid = str(int(r["slot_id"]))
            o, g, sh = fns["calc_slot_eur_metrics"](r, run_deal_inputs)
            frame = l4[sid]
            prod = frame[frame["period"].between(1, 360)]
            ll = float(slot_inputs.loc[slot_inputs["slot_id"] == int(sid), "lateral_length"].iloc[0])
            o_x = prod["gross_oil_production"].sum() / ll
            g_x = prod["gross_gas_production"].sum() / ll
            if not (np.isclose(o, o_x, rtol=1e-12, atol=1e-12) and np.isclose(g, g_x, rtol=1e-12, atol=1e-12)):
                raise AssertionError(f"EUR cross-check failed for slot {sid}")
            eur[sid] = {
                "oil_eur_per_ft_risked_post_economic_limit": o,
                "residue_gas_eur_per_ft_risked_post_shrink_post_economic_limit": g,
                "raw_gas_eur_per_ft_risked_pre_shrink_post_economic_limit_harness_derived": prod["base_gas_scaled"].sum() / ll,
                "gas_shrink_fraction": sh,
                "months_summed": "periods 1..360 of the single-well frame (post shut-in zeroing)",
                "lateral_length": ll,
            }
        tc_table_df, tc_row_styles = fns["build_tc_assumptions_output_display_table"](slot_df=slot_df, deal_inputs=run_deal_inputs, slot_returns=standalone)
        dale_group_audit = fns["build_dale_group_audit"](e2e_slot_audit)

        emit("L11_reporting", {
            "legacy_python_golden": {
                "quarterly_table_numeric": legacy_q, "annual_table_numeric": legacy_y,
                "columns_note": "hard-coded Q1 26..Q4 27 and 2026..2033 in app.py; NaN where the deal has no rows in the period",
                "display_table_strings": display_df, "display_row_styles": row_styles,
                "tc_assumptions_display_strings": tc_table_df, "tc_row_styles": tc_row_styles,
                "dale_group_audit": dale_group_audit,
            },
            "dynamic_expected_harness_derived": {
                "note": "NOT production-model output. Period labels derived from the deal calendar; formulas mirror build_quarterly_output_table. Asserted equal to the legacy table on overlapping columns.",
                "quarterly_8_from_calendar_start": dyn_q, "annual_through_economic_life": dyn_y,
                "calendar_start": meta_q["calendar_start"], "economic_end": meta_q["economic_end"],
                "overlap_columns_verified": {"quarterly": common_q, "annual": common_y},
            },
            "eur_per_ft": eur,
            "type_curve_lengths_used": tc_lengths,
        })

        # ---- L12 sensitivities -----------------------------------------
        if case["run_sensitivities"]:
            sens_inputs = dict(run_deal_inputs)
            results, all_bases = {}, {}
            if case["run_sensitivities"] == "overrides_only":
                specs, customs, bases = sensitivity_specs(slot_df, sens_inputs, fns, False, False)
                all_bases["toggles_off"] = bases
                for spec in specs:
                    if spec["key"] == "dc_main":
                        results["dc_main"] = run_spec(spec, slot_df, sens_inputs, fns)
                for spec in customs:
                    if spec["key"] == "carry_dc_custom":
                        results["carry_dc_custom"] = run_spec(spec, slot_df, sens_inputs, fns)
            else:
                specs, customs, bases = sensitivity_specs(slot_df, sens_inputs, fns, False, False)
                all_bases["toggles_off"] = bases
                for spec in specs + customs:
                    results[spec["key"]] = run_spec(spec, slot_df, sens_inputs, fns)
                specs_tc, _, bases_tc = sensitivity_specs(slot_df, sens_inputs, fns, True, False)
                all_bases["tc_risk_as_main"] = bases_tc
                for spec in specs_tc:
                    if spec["key"] in ("dc_main", "cross_main"):
                        results[f"{spec['key']}__tc_risk_as_main"] = run_spec(spec, slot_df, sens_inputs, fns)
                specs_pct, _, bases_pct = sensitivity_specs(slot_df, sens_inputs, fns, False, True)
                all_bases["dc_pct_steps"] = bases_pct
                for spec in specs_pct:
                    if spec["key"] == "dc_main":
                        results["dc_main__dc_pct_steps"] = run_spec(spec, slot_df, sens_inputs, fns)
            payload = {"bases": all_bases, "grids": results,
                       "grid_convention": "irr/moic dataframes: index = y_values (rows), columns = x_values; None where run_deal_metrics raised"}
            if case["run_scenario_matrix"]:
                recon, n_fig_points, labels = scenario_matrix(slot_df, sens_inputs, fns, model, all_bases["toggles_off"]["base_bid"], all_bases["toggles_off"]["base_dc"])
                payload["scenario_matrix"] = {"rows": recon, "figure_points_reconciled": n_fig_points, "labels": labels,
                                              "definition": "pricing +/-5 oil, +/-0.25 gas; D&C override base +/-50; tc_risk absolute 0.8/1.0/1.2 on every slot; bid override base +/-3x500 floored at 1"}
            emit("L12_sensitivities", payload)

        # ---- P2 vs parent assertions -----------------------------------
        p2_checks = None
        if case["monkeypatch"] and parent_results is not None:
            parent_deal = parent_results["deal_df"]
            legacy_end = parent_deal["date"].max()
            child_trunc = deal_df[deal_df["date"] <= legacy_end].reset_index(drop=True)
            frames_equal(child_trunc[parent_deal.columns], parent_deal.reset_index(drop=True), "C07-FL rows <= legacy calendar_end vs C07 deal_df")
            parent_all = parent_results["all_slots_post"]
            child_all_trunc = all_slots_post[all_slots_post["date"] <= legacy_end].reset_index(drop=True)
            frames_equal(child_all_trunc[parent_all.columns], parent_all.sort_values(["slot_id", "date"]).reset_index(drop=True), "C07-FL slot rows <= legacy calendar_end vs C07")
            last_nonzero = active["date"].max()
            tail_zero = deal_df[deal_df["date"] > last_nonzero]
            flow_cols = [c for c in deal_df.columns if c.startswith("slot_")]
            assert tail_zero[flow_cols].abs().sum().sum() == 0, "flow columns after last nonzero month are not all zero"
            recovered = deal_df[deal_df["date"] > legacy_end]["slot_total_cash_flow"].sum()
            diff = deal_df["slot_total_cash_flow"].sum() - parent_deal["slot_total_cash_flow"].sum()
            assert np.isclose(recovered, diff, rtol=0, atol=1e-6), "cumulative CF difference != recovered tail"
            per_slot_tail = all_slots_post[all_slots_post["date"] > legacy_end].groupby("slot_id")["slot_total_cash_flow"].sum()
            p2_checks = {
                "rows_on_or_before_legacy_end_identical_to_parent": True,
                "rows_after_last_nonzero_month_all_zero": True,
                "cumulative_cf_difference_equals_recovered_tail": True,
                "legacy_calendar_end": legacy_end, "full_life_calendar_end": deal_df["date"].max(),
                "economic_calendar_end": last_nonzero,
                "recovered_tail_cash_flow_total": float(recovered),
                "recovered_tail_cash_flow_by_slot": {str(int(k)): float(v) for k, v in per_slot_tail.items()},
                "parent_irr": parent_results["irr"], "full_life_irr": irr,
                "parent_moic": parent_results["moic"], "full_life_moic": moic,
            }
            emit("P2_full_life_vs_parent", p2_checks)

    finally:
        model.align_to_financial_calendar = original_align

    elapsed = time.time() - t0
    manifest = {
        "case": name, "class": case["class"], "purpose": case["purpose"], "notes": case["notes"],
        "reference_commit_sha": ref_report.commit_sha,
        "reference_files_sha256": {
            "model.py": ref_report.model_file_sha256, "app.py": ref_report.app_file_sha256,
            "type_curve_library.xlsx": rl.sha256_file(os.path.join(rl.REPO_DIR, "type_curve_library.xlsx")),
            "price_file_library.xlsx": rl.sha256_file(os.path.join(rl.REPO_DIR, "price_file_library.xlsx")),
        },
        "harness_version": HARNESS_VERSION, "harness_source_sha256": harness_source_hash(),
        "generated_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "elapsed_seconds": round(elapsed, 2),
        "monkeypatch": patch_record or {"applied": False},
        "production_model_output": not bool(patch_record),
        "parity_suite_member": case["class"] == "G",
        "expected_divergence_case": case["class"] == "X",
        "files_sha256": written,
        "levels_written": sorted(written),
    }
    E.dump(manifest, os.path.join(case_dir, "manifest.json"))
    print(f"  {name:7s} [{case['class']:2s}] {elapsed:6.1f}s  IRR={irr}  MOIC={moic}", flush=True)
    return {"deal_df": deal_df, "all_slots_post": all_slots_post, "irr": irr, "moic": moic, "manifest": manifest}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="/mnt/user-data/outputs/utica_fixtures")
    ap.add_argument("--cases", default=None)
    args = ap.parse_args()

    fns, ref_report = rl.extract_app_functions()
    import model  # pinned, already loaded by the extractor
    os.chdir(rl.REPO_DIR)  # relative workbook paths inside model/app functions
    print(f"reference commit {ref_report.commit_sha}; harness {HARNESS_VERSION}/{harness_source_hash()[:12]}", flush=True)

    selected = list(C.CASES) if not args.cases else args.cases.split(",")
    results, failures = {}, {}
    for name in selected:
        case = C.CASES[name]
        parent = results.get(case["monkeypatch"]["parent"]) if case["monkeypatch"] else None
        try:
            results[name] = run_case(case, fns, model, args.out, ref_report, parent_results=parent)
        except Exception as exc:
            failures[name] = {"exception_type": type(exc).__name__, "message": str(exc),
                              "traceback": traceback.format_exc(),
                              "origin": "reference model" if "/Utica-Model-V7/" in traceback.format_exc().split("run_case")[-1] else "harness"}
            E.dump({"case": name, "class": case["class"], "status": "REFERENCE_EXCEPTION",
                    "reference_commit_sha": ref_report.commit_sha, "environment_pandas": pd.__version__,
                    **failures[name]}, os.path.join(args.out, name, "reference_exception.json"))
            print(f"  {name:7s} FAILED ({failures[name]['origin']}): {type(exc).__name__}: {str(exc)[:120]}", flush=True)

    import plotly, pyxirr, openpyxl
    root_manifest = {
        "fixture_set": "Utica-Model-V7 golden fixtures",
        "reference_repository": "https://github.com/mburkegr/Utica-Model-V7",
        "reference_commit_sha": ref_report.commit_sha,
        "reference_files_sha256": results[next(iter(results))]["manifest"]["reference_files_sha256"] if results else {},
        "harness_version": HARNESS_VERSION, "harness_source_sha256": harness_source_hash(),
        "generated_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "environment": {"python": platform.python_version(), "pandas": pd.__version__, "numpy": np.__version__,
                        "pyxirr": pyxirr.__version__, "plotly": plotly.__version__, "openpyxl": openpyxl.__version__,
                        "platform": platform.platform()},
        "extraction_report": {
            "functions_extracted": ref_report.extracted_functions, "constants": ref_report.extracted_constants,
            "decorator_replacements": ref_report.decorator_replacements, "verification": ref_report.verification,
            "skipped_top_level_statements": ref_report.skipped_top_level_statements,
        },
        "cases": {n: {"class": C.CASES[n]["class"], "purpose": C.CASES[n]["purpose"],
                      "parity_suite_member": C.CASES[n]["class"] == "G",
                      "expected_divergence_case": C.CASES[n]["class"] == "X",
                      "production_model_output": C.CASES[n]["monkeypatch"] is None,
                      "monkeypatch": results[n]["manifest"]["monkeypatch"] if n in results else None,
                      "irr": results[n]["irr"] if n in results else None,
                      "moic": results[n]["moic"] if n in results else None,
                      "status": "ok" if n in results else "FAILED"} for n in selected},
        "failures": failures,
        "tolerances_document": "TOLERANCES.md",
    }
    # Merge with an existing root manifest so the set can be generated in chunks.
    root_path = os.path.join(args.out, "manifest.json")
    if os.path.exists(root_path):
        import json as _json
        prev = _json.load(open(root_path))
        if prev.get("reference_commit_sha") != root_manifest["reference_commit_sha"]:
            raise RuntimeError("existing manifest was generated from a different commit; refusing to merge")
        merged_cases = dict(prev.get("cases", {})); merged_cases.update(root_manifest["cases"])
        merged_fail = dict(prev.get("failures", {})); merged_fail.update(failures)
        for n in selected:
            if n in results:
                merged_fail.pop(n, None)
        root_manifest["cases"] = {n: merged_cases[n] for n in C.CASES if n in merged_cases}
        root_manifest["failures"] = merged_fail
        if not root_manifest["reference_files_sha256"]:
            root_manifest["reference_files_sha256"] = prev.get("reference_files_sha256", {})
    E.dump(root_manifest, root_path)
    print(f"done: {len(results)} ok, {len(failures)} failed", flush=True)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
