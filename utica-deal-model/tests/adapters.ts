// Maps engine slot-level rows to the Python column names used in L05/L06/L08.
import * as fs from "node:fs";
import { monthToIso } from "../engine/months";
import type { SlotFrame, SlotLayerConstants, SlotMonth } from "../engine/layers";
import { loadPriceDeck } from "../engine/pricing";
import { loadTypeCurveLibrary } from "../engine/typecurve";

export const deck = loadPriceDeck(JSON.parse(fs.readFileSync(new URL("../data/price_file_library.json", import.meta.url), "utf8")));
export const lib = loadTypeCurveLibrary(JSON.parse(fs.readFileSync(new URL("../data/type_curve_library.json", import.meta.url), "utf8")));

export function slotRowToPython(r: SlotMonth, k: SlotLayerConstants, extra: Record<string, any> = {}): Record<string, any> {
  const w = r.well;
  return {
    period: r.period, date: monthToIso(r.month), index_oil_price: w.indexOilPrice, index_gas_price: w.indexGasPrice,
    base_oil_scaled: w.baseOilScaled, base_gas_scaled: w.baseGasScaled, gross_oil_production: w.grossOilProduction,
    gross_gas_production: w.grossGasProduction, gross_ngl_production: w.grossNglProduction, monthly_production_boe: w.monthlyProductionBoe,
    oil_royalty_volumes: w.oilRoyaltyVolumes, gas_royalty_volumes: w.gasRoyaltyVolumes, ngl_royalty_volumes: w.nglRoyaltyVolumes,
    equity_oil_production: w.equityOilProduction, equity_gas_production: w.equityGasProduction, equity_ngl_production: w.equityNglProduction,
    local_oil_price: w.localOilPrice, local_gas_price: w.localGasPrice, local_ngl_price: w.localNglPrice,
    oil_revenue: w.oilRevenue, gas_revenue: w.gasRevenue, ngl_revenue: w.nglRevenue, total_revenue: w.totalRevenue,
    net_revenue: w.totalRevenue, opex: w.variableLoe, variable_loe: w.variableLoe, fixed_loe_monthly: w.fixedLoeMonthly, total_loe: w.totalLoe,
    tax: w.tax, capex: w.capex, pre_shut_in_operating_cf: w.preShutInOperatingCf, economic_limit_reached: w.economicLimitReached,
    well_shut_in: w.wellShutIn, operating_cf: w.operatingCf, operating_cf_shut_in: w.operatingCf, cash_flow: w.cashFlow,
    slot_id: k.slotId, tc_name: k.tcName, dale_promote: k.dalePromote, dale_unit_id: k.daleUnitId, dale_payout_group: k.dalePayoutGroup,
    dale_first_well_carry: k.daleFirstWellCarry, dale_initial_interest_pct: k.daleInitialInterestPct,
    pre_dale_working_interest: k.preDaleWorkingInterest, dale_initial_working_interest: k.daleInitialWorkingInterest,
    post_initial_dale_working_interest: k.grPartiesWorkingInterest, gr_parties_working_interest: k.grPartiesWorkingInterest,
    gr_parties_net_wells: k.grPartiesNetWells, dale_first_well_carry_wells: k.daleFirstWellCarryWells,
    dale_carry_dnc_net_wells: k.daleCarryDncNetWells, funded_dnc_net_wells: k.fundedDncNetWells,
    carry_reversion_active: r.carryReversionActive, ownership_factor: r.ownershipFactor,
    effective_working_interest: r.effectiveWorkingInterest, effective_net_wells: r.effectiveNetWells,
    pre_carry_working_interest: k.preCarryWorkingInterest, post_carry_working_interest: k.postCarryWorkingInterest,
    pre_carry_effective_nri: k.preCarryEffectiveNri, post_carry_effective_nri: k.postCarryEffectiveNri,
    pre_carry_net_wells: k.preCarryNetWells, post_carry_net_wells: k.postCarryNetWells,
    slot_gross_oil_production: r.slotGrossOilProduction, slot_gross_gas_production: r.slotGrossGasProduction,
    slot_gross_ngl_production: r.slotGrossNglProduction, slot_gross_boe: r.slotGrossBoe,
    slot_net_oil_production: r.slotNetOilProduction, slot_net_gas_production: r.slotNetGasProduction,
    slot_net_ngl_production: r.slotNetNglProduction, slot_net_boe: r.slotNetBoe,
    slot_oil_revenue: r.slotOilRevenue, slot_gas_revenue: r.slotGasRevenue, slot_ngl_revenue: r.slotNglRevenue,
    slot_total_revenue: r.slotTotalRevenue, slot_loe: r.slotLoe, slot_tax: r.slotTax, slot_operating_profit: r.slotOperatingProfit,
    slot_promote_ocf: r.slotPromoteOcf, slot_base_capex: r.slotBaseCapex, slot_dale_carry_capex: r.slotDaleCarryCapex,
    slot_capex: r.slotCapex, slot_pud_cash_flow: r.slotPudCashFlow, slot_asset_purchase: r.slotAssetPurchase, slot_promote: 0.0,
    slot_total_cash_flow: r.slotTotalCashFlow, working_interest: k.preDaleWorkingInterest, net_wells: k.netWells,
    gross_wells: k.grossWells, acquisition_cost: k.acquisitionCost, bid_price_final: k.bidPriceFinal,
    ngl_recovery_case: k.nglRecoveryCase, slot_shrink: k.slotShrink, slot_ngl_pct_of_wti: k.slotNglPctOfWti, carry_enabled: k.carryEnabled,
    ...extra,
  };
}

export function slotFrameToPython(sf: SlotFrame): Record<string, any>[] {
  return sf.rows.map((r) => slotRowToPython(r, sf.constants));
}

// ---------------------------------------------------------------------------
// Aligned (calendar) rows -> Python L06/L08 columns, reproducing Python's
// left-join artifacts on months without well data (numeric constants 0,
// bool flags null, local prices 0).
// ---------------------------------------------------------------------------
import type { AlignedSlotFrame, AlignedSlotMonth } from "../engine/calendar";

const ZERO_ON_EMPTY = ["dale_initial_interest_pct","pre_dale_working_interest","dale_initial_working_interest","post_initial_dale_working_interest",
  "gr_parties_working_interest","gr_parties_net_wells","dale_first_well_carry_wells","dale_carry_dnc_net_wells","funded_dnc_net_wells",
  "pre_carry_working_interest","post_carry_working_interest","pre_carry_effective_nri","post_carry_effective_nri","pre_carry_net_wells","post_carry_net_wells",
  "working_interest","net_wells","gross_wells","acquisition_cost","bid_price_final","slot_shrink","slot_ngl_pct_of_wti"];

export function alignedRowToPython(r: AlignedSlotMonth, k: SlotLayerConstants, extra: Record<string, any> = {}): Record<string, any> {
  const o: Record<string, any> = {
    period: r.period, date: monthToIso(r.month), index_oil_price: r.indexOilPrice, index_gas_price: r.indexGasPrice,
    base_oil_scaled: r.baseOilScaled, base_gas_scaled: r.baseGasScaled, gross_oil_production: r.grossOilProduction,
    gross_gas_production: r.grossGasProduction, gross_ngl_production: r.grossNglProduction, monthly_production_boe: r.monthlyProductionBoe,
    oil_royalty_volumes: r.oilRoyaltyVolumes, gas_royalty_volumes: r.gasRoyaltyVolumes, ngl_royalty_volumes: r.nglRoyaltyVolumes,
    equity_oil_production: r.equityOilProduction, equity_gas_production: r.equityGasProduction, equity_ngl_production: r.equityNglProduction,
    local_oil_price: r.localOilPrice, local_gas_price: r.localGasPrice, local_ngl_price: r.localNglPrice,
    oil_revenue: r.oilRevenue, gas_revenue: r.gasRevenue, ngl_revenue: r.nglRevenue, total_revenue: r.totalRevenue,
    net_revenue: r.totalRevenue, opex: r.variableLoe, variable_loe: r.variableLoe, fixed_loe_monthly: r.fixedLoeMonthly, total_loe: r.totalLoe,
    tax: r.tax, capex: r.capex, pre_shut_in_operating_cf: r.preShutInOperatingCf, economic_limit_reached: r.economicLimitReached,
    well_shut_in: r.wellShutIn, operating_cf: r.operatingCf, operating_cf_shut_in: r.operatingCf, cash_flow: r.cashFlow,
    slot_id: k.slotId, tc_name: k.tcName, dale_promote: k.dalePromote, dale_unit_id: k.daleUnitId, dale_payout_group: k.dalePayoutGroup,
    dale_first_well_carry: k.daleFirstWellCarry, dale_initial_interest_pct: k.daleInitialInterestPct,
    pre_dale_working_interest: k.preDaleWorkingInterest, dale_initial_working_interest: k.daleInitialWorkingInterest,
    post_initial_dale_working_interest: k.grPartiesWorkingInterest, gr_parties_working_interest: k.grPartiesWorkingInterest,
    gr_parties_net_wells: k.grPartiesNetWells, dale_first_well_carry_wells: k.daleFirstWellCarryWells,
    dale_carry_dnc_net_wells: k.daleCarryDncNetWells, funded_dnc_net_wells: k.fundedDncNetWells,
    carry_reversion_active: r.carryReversionActive, ownership_factor: r.ownershipFactor,
    effective_working_interest: r.effectiveWorkingInterest, effective_net_wells: r.effectiveNetWells,
    pre_carry_working_interest: k.preCarryWorkingInterest, post_carry_working_interest: k.postCarryWorkingInterest,
    pre_carry_effective_nri: k.preCarryEffectiveNri, post_carry_effective_nri: k.postCarryEffectiveNri,
    pre_carry_net_wells: k.preCarryNetWells, post_carry_net_wells: k.postCarryNetWells,
    slot_gross_oil_production: r.slotGrossOilProduction, slot_gross_gas_production: r.slotGrossGasProduction,
    slot_gross_ngl_production: r.slotGrossNglProduction, slot_gross_boe: r.slotGrossBoe,
    slot_net_oil_production: r.slotNetOilProduction, slot_net_gas_production: r.slotNetGasProduction,
    slot_net_ngl_production: r.slotNetNglProduction, slot_net_boe: r.slotNetBoe,
    slot_oil_revenue: r.slotOilRevenue, slot_gas_revenue: r.slotGasRevenue, slot_ngl_revenue: r.slotNglRevenue,
    slot_total_revenue: r.slotTotalRevenue, slot_loe: r.slotLoe, slot_tax: r.slotTax, slot_operating_profit: r.slotOperatingProfit,
    slot_promote_ocf: r.slotPromoteOcf, slot_base_capex: r.slotBaseCapex, slot_dale_carry_capex: r.slotDaleCarryCapex,
    slot_capex: r.slotCapex, slot_pud_cash_flow: r.slotPudCashFlow, slot_asset_purchase: r.slotAssetPurchase, slot_promote: 0.0,
    slot_total_cash_flow: r.slotTotalCashFlow, working_interest: k.preDaleWorkingInterest, net_wells: k.netWells,
    gross_wells: k.grossWells, acquisition_cost: k.acquisitionCost, bid_price_final: k.bidPriceFinal,
    ngl_recovery_case: k.nglRecoveryCase, slot_shrink: k.slotShrink, slot_ngl_pct_of_wti: k.slotNglPctOfWti, carry_enabled: k.carryEnabled,
    ...extra,
  };
  if (!r.hasWellData) for (const c of ZERO_ON_EMPTY) o[c] = 0;
  return o;
}

export function alignedFrameToPython(af: AlignedSlotFrame, extraFor?: (r: AlignedSlotMonth) => Record<string, any>): Record<string, any>[] {
  return af.rows.map((r) => alignedRowToPython(r, af.constants, extraFor ? extraFor(r) : {}));
}

/** Collapse Python duplicate (slot_id, date) rows (flowbackDelay = 0) to one month-level row for comparison. */
export function aggregatePythonByMonth(rows: Record<string, any>[], flowCols: Set<string>): Record<string, any>[] {
  const out: Record<string, any>[] = [];
  const idx = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.slot_id}|${r.date}`;
    const at = idx.get(key);
    if (at === undefined) { idx.set(key, out.length); out.push({ ...r }); continue; }
    const acc = out[at];
    const lead = (r.period ?? 0) > (acc.period ?? 0) ? r : acc;
    for (const c of Object.keys(r)) {
      if (flowCols.has(c)) acc[c] = (acc[c] ?? 0) + (r[c] ?? 0);
      else if (c === "economic_limit_reached" || c === "well_shut_in") acc[c] = Boolean(acc[c]) || Boolean(r[c]);
      else acc[c] = lead[c];
    }
  }
  return out;
}

export const PY_FLOW_COLS = new Set([
  "base_oil_scaled","base_gas_scaled","gross_oil_production","gross_gas_production","gross_ngl_production","monthly_production_boe",
  "oil_royalty_volumes","gas_royalty_volumes","ngl_royalty_volumes","equity_oil_production","equity_gas_production","equity_ngl_production",
  "oil_revenue","gas_revenue","ngl_revenue","total_revenue","net_revenue","opex","variable_loe","fixed_loe_monthly","total_loe","tax","capex",
  "pre_shut_in_operating_cf","operating_cf","operating_cf_shut_in","cash_flow",
  "slot_gross_oil_production","slot_gross_gas_production","slot_gross_ngl_production","slot_gross_boe",
  "slot_net_oil_production","slot_net_gas_production","slot_net_ngl_production","slot_net_boe",
  "slot_oil_revenue","slot_gas_revenue","slot_ngl_revenue","slot_total_revenue","slot_loe","slot_tax","slot_operating_profit","slot_promote_ocf",
  "slot_base_capex","slot_dale_carry_capex","slot_capex","slot_pud_cash_flow","slot_asset_purchase","slot_promote","slot_total_cash_flow",
]);

import type { PromotedSlotMonth, PromoteScheduleRow } from "../engine/promote";
export function promoteExtra(r: PromotedSlotMonth): Record<string, any> {
  const s = r.promote.schedule;
  return {
    pre_promote_working_interest: r.promote.preWorkingInterest, pre_promote_net_wells: r.promote.preNetWells,
    promote_ownership_factor: r.promote.ownershipFactor, promote_wi_transferred: r.promote.wiTransferred,
    post_promote_working_interest: r.promote.postWorkingInterest, post_promote_net_wells: r.promote.postNetWells,
    promote_monthly_investment: s?.monthlyInvestment ?? 0, promote_monthly_distributions: s?.monthlyDistributions ?? 0,
    promote_cumulative_investment: s?.cumulativeInvestment ?? 0, promote_cumulative_distributions: s?.cumulativeDistributions ?? 0,
    promote_running_multiple: s?.runningMultiple ?? 0, promote_hurdle_reached: s?.hurdleReached ?? false, promote_active: s?.active ?? false,
    promote_hurdle_date: s?.hurdleDate == null ? null : monthToIso(s.hurdleDate),
    promote_effective_date: s?.effectiveDate == null ? null : monthToIso(s.effectiveDate),
  };
}
export function scheduleToPython(rows: PromoteScheduleRow[]): Record<string, any>[] {
  return rows.map((r) => ({
    dale_payout_group: r.payoutGroup, date: monthToIso(r.month), promote_monthly_investment: r.monthlyInvestment,
    promote_monthly_distributions: r.monthlyDistributions, promote_cumulative_investment: r.cumulativeInvestment,
    promote_cumulative_distributions: r.cumulativeDistributions, promote_running_multiple: r.runningMultiple,
    promote_hurdle_reached: r.hurdleReached, promote_active: r.active,
    promote_hurdle_date: r.hurdleDate == null ? null : monthToIso(r.hurdleDate), promote_effective_date: r.effectiveDate == null ? null : monthToIso(r.effectiveDate),
  }));
}
