"""Frozen fixture case definitions (approved 2026-09-17).

Every input here is fixed; nothing depends on the clock.  deal_inputs are
assembled with exactly the keys app.py builds in its sidebar block, and the
slot table follows build_slot_template().  Case classes:

  G  golden parity      must match Python within documented tolerances
  P2 phase-2 reference  full-life monkeypatched target (not the production model)
  X  diagnostic         documented expected divergence; never a parity failure
"""

from __future__ import annotations

import copy
from datetime import date

import pandas as pd

EFFECTIVE_DATE = date(2026, 10, 1)
FLAT_OIL = 70.0
FLAT_GAS = 3.75
OIL_SWITCH = date(2030, 9, 1)
GAS_SWITCH = date(2029, 1, 1)
IGNORED_DATE = date(1900, 1, 1)  # what the app passes in flat mode

# --------------------------------------------------------------------------
# Frozen defaults "D"
# --------------------------------------------------------------------------
DEFAULT_DEAL_INPUTS = {
    "use_acquisition_override": False,
    "acquisition_cost_override": 0.0,
    "effective_date": EFFECTIVE_DATE,
    "pricing_mode": "flat",
    "pricing_file_path": "price_file_library.xlsx",
    "oil_price": FLAT_OIL,
    "gas_price": FLAT_GAS,
    "base_oil_price": FLAT_OIL,
    "base_gas_price": FLAT_GAS,
    "oil_flat_start_date": IGNORED_DATE,
    "gas_flat_start_date": IGNORED_DATE,
    "use_dc_override": False,
    "dc_override": 750.0,
    "use_bid_override": False,
    "bid_override": 8000.0,
    "use_carry_override": False,
    "carry_override_pct": 20.0,
    "use_tc_risk_as_main_sensitivity": False,
    "use_dc_pct_sensitivity": False,
    "use_sev_tax_pct": False,
    "oil_sev_tax": 0.10,
    "gas_sev_tax": 0.025,
    "ad_val_tax": 0.025,
    "ethane_rec": False,
    "content_ethane": 0.50,
    "content_propane": 0.25,
    "content_isobutane": 0.065,
    "content_butane": 0.065,
    "content_pentanes": 0.12,
    "rec_ethane": 0.90,
    "rec_propane": 0.98,
    "rec_isobutane": 0.99,
    "rec_butane": 0.99,
    "rec_pentanes": 0.995,
    "rej_ethane": 0.20,
    "rej_propane": 0.90,
    "rej_isobutane": 0.98,
    "rej_butane": 0.98,
    "rej_pentanes": 0.995,
    "shrink_ethane": 0.06634,
    "shrink_propane": 0.091563,
    "shrink_isobutane": 0.09963,
    "shrink_butane": 0.103744,
    "shrink_pentanes": 0.10968,
    "price_ethane": 0.23450,
    "price_propane": 0.82528,
    "price_isobutane": 0.76020,
    "price_butane": 0.61473,
    "price_pentanes": 1.28987,
    "dale_promote_override": False,
    "dale_initial_interest_pct": 6.25,
    "promote_enabled": False,  # set pre-run from slot flags, as the app does
    "promote_wi_reversion_pct": 6.25,
    "promote_multiple": 1.00,
}

# Percent-mode severance values used where a case selects percent mode.
PCT_MODE_SEVERANCE = {"use_sev_tax_pct": True, "oil_sev_tax": 5.0, "gas_sev_tax": 2.5}

FILE_MODE_PRICING = {
    "pricing_mode": "file",
    "oil_flat_start_date": OIL_SWITCH,
    "gas_flat_start_date": GAS_SWITCH,
}


def default_slot(slot_id: int, **over) -> dict:
    """build_slot_template() row from app.py with a frozen spud month."""
    row = {
        "include_slot": True,
        "dale_promote": False,
        "dale_unit_id": f"UNIT-{slot_id}",
        "dale_payout_group": f"UNIT-{slot_id}",
        "dale_first_well_carry": False,
        "carry_enabled": False,
        "carry_wi_reversion_pct": 0.0,
        "slot_id": slot_id,
        "tc_name": "1_north_cond_north",
        "gross_wells": 1.0,
        "net_acres": 25.0,
        "unit_acres": 200.0,
        "use_calc_unit_acres": False,
        "pct_unitized": 1.0,
        "drilling_spud_month": EFFECTIVE_DATE,
        "flowback_delay": 4,
        "net_revenue_interest": 0.80,
        "lateral_length": 15000,
        "dc_costs": 750.0,
        "tc_risk": 1.00,
        "bid_per_acre": 8000.0,
        "oil_diff": -10.00,
        "gas_diff": -2.75,
        "ngl_diff": 0.00,
        "oil_opex_bbl": 1.78,
        "gas_opex_mcf": 0.25,
        "ngl_opex": 2.50,
        "fixed_loe": 3534.0,
        "ngl_yield": 4.2,
    }
    unknown = set(over) - set(row)
    if unknown:
        raise KeyError(f"unknown slot fields {unknown}")
    row.update(over)
    return row


def deal(**over) -> dict:
    d = copy.deepcopy(DEFAULT_DEAL_INPUTS)
    unknown = set(over) - set(d)
    if unknown:
        raise KeyError(f"unknown deal_inputs keys {unknown}")
    d.update(over)
    return d


# --------------------------------------------------------------------------
# Cases
# --------------------------------------------------------------------------
CASES: dict[str, dict] = {}


def _case(name, cls, purpose, deal_inputs, slots, *, sensitivities=False,
          scenario_matrix=False, notes=None, monkeypatch=None):
    CASES[name] = {
        "name": name,
        "class": cls,
        "purpose": purpose,
        "deal_inputs": deal_inputs,
        "slots": slots,
        "run_sensitivities": sensitivities,
        "run_scenario_matrix": scenario_matrix,
        "notes": notes or [],
        "monkeypatch": monkeypatch,
    }


_case("C01", "G", "Baseline single well (anchor)", deal(), [default_slot(1)])

_case(
    "C02", "G", "File pricing, distinct oil/gas switch dates, ethane recovery, deck-driven negative local gas",
    deal(**FILE_MODE_PRICING, ethane_rec=True),
    [default_slot(1, drilling_spud_month=date(2027, 3, 1))],
    notes=["Deck Apr 2027 gas 2.734 + diff -2.75 gives a negative local gas price."],
)

_case(
    "C03", "G", "Ownership and scaling variants; dry gas; percent severance",
    deal(**PCT_MODE_SEVERANCE),
    [default_slot(
        1, tc_name="4_north_dry_gas", lateral_length=12000, gross_wells=2.0,
        use_calc_unit_acres=True, pct_unitized=0.90, net_revenue_interest=0.8125,
        tc_risk=0.85, dc_costs=850.0, bid_per_acre=6500.0, flowback_delay=6,
    )],
    notes=["unit_acres column is rewritten to 480 by apply_calc_unit_acres before the run, as the app does on Apply."],
)

_case(
    "C04", "G", "Economic limit, curve-exhaustion trigger (shut-in month 286)",
    deal(), [default_slot(1, tc_name="13_core_wet_gas_north")],
)

_case(
    "C05", "G", "Granite carry at slot level, mixed with a non-carry slot",
    deal(),
    [
        default_slot(1, carry_enabled=True, carry_wi_reversion_pct=20.0),
        default_slot(2, tc_name="2_north_rich_cond", drilling_spud_month=date(2027, 1, 1)),
    ],
)

_case(
    "C06", "G", "Dale single unit, payout reached, with Granite carry (ordering rule)",
    deal(),
    [default_slot(
        1, gross_wells=2.0, dale_promote=True, dale_first_well_carry=True,
        carry_enabled=True, carry_wi_reversion_pct=20.0,
    )],
)

_C07_SLOTS = [
    default_slot(1, dale_promote=True, dale_first_well_carry=True,
                 dale_unit_id="UNIT-1", dale_payout_group="POOL-A"),
    default_slot(2, tc_name="14_core_rich_condensate_north", dale_promote=True,
                 dale_first_well_carry=True, dale_unit_id="UNIT-2",
                 dale_payout_group="POOL-A", drilling_spud_month=date(2028, 4, 1)),
    default_slot(3, tc_name="4_north_dry_gas", lateral_length=10000,
                 drilling_spud_month=date(2027, 6, 1)),
]
_case(
    "C07", "G", "Pooled payout group, staggered spuds, late spud truncated by the 360-month calendar",
    deal(promote_multiple=1.25), copy.deepcopy(_C07_SLOTS),
)
_case(
    "C07-FL", "P2", "Full-life reference for C07 (monkeypatched calendar horizon)",
    deal(promote_multiple=1.25), copy.deepcopy(_C07_SLOTS),
    monkeypatch={
        "target": "model.align_to_financial_calendar",
        "change": "wrapper forces months=600 in place of the months=360 passed by build_all_slot_financials",
        "parent": "C07",
    },
)

_case(
    "C08", "G", "Dale never reaches payout; decline-driven economic limit (month 328); oil-weighted mix",
    deal(promote_multiple=3.00),
    [default_slot(1, tc_name="28_south_oil", dale_promote=True)],
)

_case(
    "C09a", "G", "Spud before effective date; flowback 0 (period 0 and 1 share a month, spud != effective)",
    deal(), [default_slot(1, drilling_spud_month=date(2026, 7, 1), flowback_delay=0)],
)

_case(
    "C09b", "X", "Flowback 0 with spud == effective: Python assigns acquisition to both same-month rows",
    deal(), [default_slot(1, flowback_delay=0)],
    notes=[
        "DIAGNOSTIC / EXPECTED DIVERGENCE. Python left-joins two well rows (period 0 and period 1) onto the",
        "single effective-month calendar row, then assigns -acquisition_cost to every row dated effective_date,",
        "so the rollup carries 2x acquisition. TypeScript aggregates by month before joining and books",
        "acquisition once. This case must not be part of the primary parity suite.",
    ],
)

_case(
    "C10", "G", "Zero curve placeholder: shut-in at month 1, IRR None, MOIC 0.0",
    deal(), [default_slot(1, tc_name="27_south_dry_gas", lateral_length=10000)],
)

_C11_SLOTS = [
    default_slot(1, net_acres=30.0, unit_acres=240.0, dc_costs=700.0, bid_per_acre=7000.0,
                 tc_risk=0.90, ngl_yield=3.5, drilling_spud_month=date(2026, 10, 1)),
    default_slot(2, tc_name="14_core_rich_condensate_north", net_acres=25.0, unit_acres=200.0,
                 dc_costs=750.0, bid_per_acre=8000.0, tc_risk=1.00, ngl_yield=4.2,
                 drilling_spud_month=date(2027, 1, 1)),
    default_slot(3, tc_name="7_core_condensate_north", lateral_length=11000, net_acres=20.0,
                 unit_acres=180.0, dc_costs=800.0, bid_per_acre=9000.0, tc_risk=1.10,
                 ngl_yield=5.0, drilling_spud_month=date(2027, 4, 1)),
]
_case(
    "C11", "G", "Heterogeneous deal; full sensitivity engine; standalone slot returns; scenario matrix",
    deal(**FILE_MODE_PRICING), copy.deepcopy(_C11_SLOTS),
    sensitivities=True, scenario_matrix=True,
)

_case(
    "C12", "G", "Deal-level D&C, bid and carry overrides (override branches of the sensitivity engine)",
    deal(use_dc_override=True, dc_override=775.0, use_bid_override=True, bid_override=7500.0,
         use_carry_override=True, carry_override_pct=15.0),
    copy.deepcopy(_C11_SLOTS),
    sensitivities="overrides_only",
)


# --------------------------------------------------------------------------
# App pre-run preprocessing, reproduced from app.py's form-submit and Run
# Model blocks.  These are UI steps but they shape the exact DataFrame the
# model receives, so they are part of the fixture definition.
# --------------------------------------------------------------------------
def app_preprocess(slots: list[dict], deal_inputs: dict, app_fns: dict):
    slot_df = pd.DataFrame(slots)

    # --- form submit cleaning (Apply Slot Changes) ---
    cleaned = slot_df.copy()
    cleaned["tc_risk"] = pd.to_numeric(cleaned["tc_risk"], errors="coerce").fillna(1.0).astype(float)
    cleaned["dale_promote"] = cleaned["dale_promote"].fillna(False).astype(bool)
    cleaned["dale_first_well_carry"] = cleaned["dale_first_well_carry"].fillna(False).astype(bool)
    cleaned["dale_unit_id"] = cleaned["dale_unit_id"].fillna("").astype(str).str.strip()
    cleaned["dale_payout_group"] = cleaned["dale_payout_group"].fillna("").astype(str).str.strip()
    default_unit_ids = cleaned["slot_id"].map(lambda x: f"UNIT-{int(x)}")
    cleaned.loc[cleaned["dale_unit_id"].eq(""), "dale_unit_id"] = default_unit_ids
    cleaned.loc[cleaned["dale_payout_group"].eq(""), "dale_payout_group"] = cleaned["dale_unit_id"]
    cleaned["carry_enabled"] = cleaned["carry_enabled"].fillna(False).astype(bool)
    cleaned["carry_wi_reversion_pct"] = (
        pd.to_numeric(cleaned["carry_wi_reversion_pct"], errors="coerce").fillna(0.0).clip(lower=0.0, upper=100.0)
    )
    cleaned["bid_per_acre"] = pd.to_numeric(cleaned["bid_per_acre"], errors="coerce").fillna(1.0).clip(lower=1.0)
    cleaned = app_fns["apply_calc_unit_acres"](cleaned)

    # --- Run Model block ---
    included = cleaned[cleaned["include_slot"].fillna(True)].copy()
    if included.empty or (included["tc_name"] == "Choose TC").any():
        raise ValueError("fixture slot table invalid")
    model_slot_df = included.drop(columns=["include_slot"], errors="ignore").copy()
    model_slot_df["bid_per_acre"] = (
        pd.to_numeric(model_slot_df["bid_per_acre"], errors="coerce").fillna(1.0).clip(lower=1.0)
    )
    if deal_inputs.get("dale_promote_override", False):
        model_slot_df["dale_promote"] = True

    invalid_first_well = model_slot_df[
        model_slot_df["dale_first_well_carry"].fillna(False) & ~model_slot_df["dale_promote"].fillna(False)
    ]
    dup = (
        model_slot_df.loc[
            model_slot_df["dale_promote"].fillna(False) & model_slot_df["dale_first_well_carry"].fillna(False)
        ].groupby("dale_unit_id").size()
    )
    if not invalid_first_well.empty or (dup > 1).any():
        raise ValueError("fixture violates the app's Dale first-well validation")

    run_deal_inputs = dict(deal_inputs)
    run_deal_inputs["promote_enabled"] = bool(model_slot_df["dale_promote"].fillna(False).any())
    if not run_deal_inputs["promote_enabled"]:
        run_deal_inputs["promote_wi_reversion_pct"] = 0.0
        run_deal_inputs["promote_multiple"] = 0.0

    return model_slot_df.reset_index(drop=True), run_deal_inputs
