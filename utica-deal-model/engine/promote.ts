/**
 * Dale promote / WI back-in. Mirrors model.build_promote_schedule and
 * model.apply_promote_to_slots.
 *
 * Per payout group: investment = acquisition + all funded D&C (including the
 * Dale first-well carry); distributions = positive-only monthly OCF at the
 * GR-parties (pre-carry) interest. The hurdle is reached when cumulative
 * distributions / cumulative investment >= promoteMultiple (with investment
 * > 0); the back-in is active from the following month, permanently, and
 * scales USEDC's ownership economics (not slotPromoteOcf, Dale carry capex or
 * acquisition) by (1 - promoteWiReversionPct).
 *
 * A group that never reaches its hurdle yields a schedule with all flags
 * false and null hurdle/effective dates (the intended behavior; the Python
 * reference crashes on pandas 3 in that path).
 */

import type { AlignedSlotFrame, AlignedSlotMonth, DealCalendar } from "./calendar";
import type { MonthIndex } from "./months";
import type { DealSettings } from "./types";

export interface PromoteScheduleRow {
  payoutGroup: string;
  month: MonthIndex;
  monthlyInvestment: number;
  monthlyDistributions: number;
  cumulativeInvestment: number;
  cumulativeDistributions: number;
  runningMultiple: number;
  hurdleReached: boolean;
  active: boolean;
  hurdleDate: MonthIndex | null;
  effectiveDate: MonthIndex | null;
}

export interface PromoteState {
  preWorkingInterest: number;
  preNetWells: number;
  ownershipFactor: number; // 1 or (1 - reversion)
  wiTransferred: number;
  postWorkingInterest: number;
  postNetWells: number;
  schedule: Omit<PromoteScheduleRow, "payoutGroup" | "month"> | null; // null when the slot has no schedule row
}

export interface PromotedSlotMonth extends AlignedSlotMonth {
  promote: PromoteState;
}

export interface PromotedSlotFrame extends Omit<AlignedSlotFrame, "rows"> {
  rows: PromotedSlotMonth[];
}

export interface PromoteResult {
  enabled: boolean;
  schedule: PromoteScheduleRow[]; // ordered by payout group then month
  slots: PromotedSlotFrame[];
}

const SCALE_FIELDS = [
  "slotNetOilProduction", "slotNetGasProduction", "slotNetNglProduction", "slotNetBoe",
  "slotOilRevenue", "slotGasRevenue", "slotNglRevenue", "slotTotalRevenue",
  "slotLoe", "slotTax", "slotOperatingProfit", "slotBaseCapex",
] as const;

export function buildPromoteSchedule(promotedSlots: AlignedSlotFrame[], settings: DealSettings): PromoteScheduleRow[] {
  // Aggregate by (group, month), summing in slot order (matches groupby().sum() on the concatenated frame).
  const groups = new Map<string, Map<MonthIndex, { ocf: number; capex: number; asset: number }>>();
  for (const sf of promotedSlots) {
    const gname = sf.constants.dalePayoutGroup;
    let gm = groups.get(gname);
    if (!gm) { gm = new Map(); groups.set(gname, gm); }
    for (const r of sf.rows) {
      const acc = gm.get(r.month) ?? { ocf: 0, capex: 0, asset: 0 };
      acc.ocf += r.slotPromoteOcf; acc.capex += r.slotCapex; acc.asset += r.slotAssetPurchase;
      gm.set(r.month, acc);
    }
  }
  const hurdle = settings.promoteMultiple;
  const out: PromoteScheduleRow[] = [];
  for (const gname of [...groups.keys()].sort()) {
    const gm = groups.get(gname)!;
    const months = [...gm.keys()].sort((a, b) => a - b);
    let cumInv = 0, cumDist = 0, vested = false, prevVested = false;
    let hurdleDate: MonthIndex | null = null, effectiveDate: MonthIndex | null = null;
    const rows: PromoteScheduleRow[] = [];
    for (const m of months) {
      const a = gm.get(m)!;
      const inv = -Math.min(a.asset, 0.0) - Math.min(a.capex, 0.0);
      const dist = Math.max(a.ocf, 0.0);
      cumInv += inv; cumDist += dist;
      const multiple = cumInv > 0.0 ? cumDist / cumInv : 0.0;
      const reached = cumInv > 0.0 && multiple >= hurdle;
      prevVested = vested;
      vested = vested || reached;
      const active = prevVested; // shift(1): active the month after first vesting
      if (reached && hurdleDate === null) hurdleDate = m;
      if (active && effectiveDate === null) effectiveDate = m;
      rows.push({ payoutGroup: gname, month: m, monthlyInvestment: inv, monthlyDistributions: dist, cumulativeInvestment: cumInv,
        cumulativeDistributions: cumDist, runningMultiple: multiple, hurdleReached: reached, active, hurdleDate: null, effectiveDate: null });
    }
    for (const r of rows) { r.hurdleDate = hurdleDate; r.effectiveDate = effectiveDate; }
    out.push(...rows);
  }
  return out;
}

export function applyPromote(cal: DealCalendar, settings: DealSettings): PromoteResult {
  const promotedSlots = cal.slots.filter((s) => s.constants.dalePromote);
  const enabled = settings.promoteEnabled && promotedSlots.length > 0;
  const schedule = enabled ? buildPromoteSchedule(promotedSlots, settings) : [];
  const byKey = new Map<string, PromoteScheduleRow>();
  for (const r of schedule) byKey.set(`${r.payoutGroup}|${r.month}`, r);
  const reversion = Math.min(1.0, Math.max(0.0, settings.promoteWiReversionPct));
  const postFactor = 1.0 - reversion;

  const slots: PromotedSlotFrame[] = cal.slots.map((sf) => {
    const rows: PromotedSlotMonth[] = sf.rows.map((r0) => {
      const r: PromotedSlotMonth = { ...r0, promote: {
        preWorkingInterest: r0.effectiveWorkingInterest, preNetWells: r0.effectiveNetWells, ownershipFactor: 1.0, wiTransferred: 0.0,
        postWorkingInterest: r0.effectiveWorkingInterest, postNetWells: r0.effectiveNetWells, schedule: null,
      } };
      // Schedule fields are merged by (group, month) onto every slot sharing the group name (Python behavior, preserved).
      const s = enabled ? byKey.get(`${sf.constants.dalePayoutGroup}|${r0.month}`) : undefined;
      if (s) {
        const { payoutGroup: _pg, month: _m, ...rest } = s;
        r.promote.schedule = rest;
      }
      const activePromoted = enabled && sf.constants.dalePromote && Boolean(s?.active);
      if (activePromoted) {
        r.promote.ownershipFactor = postFactor;
        r.promote.wiTransferred = r.promote.preWorkingInterest * reversion;
        r.promote.postWorkingInterest = r.promote.preWorkingInterest * postFactor;
        r.promote.postNetWells = r.promote.preNetWells * postFactor;
        for (const f of SCALE_FIELDS) (r as any)[f] = (r as any)[f] * postFactor;
        r.slotCapex = r.slotBaseCapex + r.slotDaleCarryCapex;
        r.effectiveWorkingInterest = r.promote.postWorkingInterest;
        r.effectiveNetWells = r.promote.postNetWells;
        r.ownershipFactor = r.ownershipFactor * postFactor;
      }
      r.slotPudCashFlow = r.slotOperatingProfit + r.slotCapex;
      r.slotTotalCashFlow = r.slotPudCashFlow + r.slotAssetPurchase;
      return r;
    });
    return { ...sf, rows };
  });
  return { enabled, schedule, slots };
}
