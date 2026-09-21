/** Per-slot NGL profiles: a slot on a named profile must equal a deal whose default profile is that profile;
 *  a slot without a profile must equal the pre-profile deal-level behavior; unknown profile ids must fail loudly. */
import { loadJson, toDealInputs, toSlotInputs, type Frame } from "./harness";
import { deck, lib } from "./adapters";
import { runDeal } from "../engine/index";
import type { NglProfile } from "../engine/index";
const data = { typeCurves: lib, priceDeck: deck };
let failures = 0;
const check = (n: string, ok: boolean, d = "") => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${d ? "  (" + d + ")" : ""}`); if (!ok) failures++; };
console.log("\nNGL profiles regression");
const L0 = loadJson("C11", "L00_inputs.json");
const deal = toDealInputs(L0.run_deal_inputs_after_app_preprocessing);
const slots = toSlotInputs(L0.model_slot_df_after_app_preprocessing as Frame);
const rich: NglProfile = { id: "p-rich", name: "Rich (70% ethane)", content: { ethane: 0.70, propane: 0.15, isobutane: 0.04, butane: 0.04, pentanes: 0.07 },
  recoverEthane: deal.recoverEthane, rejectEthane: deal.rejectEthane, nglShrink: deal.nglShrink, nglPrices: deal.nglPrices };

// 1. All slots default: identical to a deal with no profiles at all.
const a = runDeal(slots, deal, data);
const b = runDeal(slots.map((s) => ({ ...s, nglProfileId: null })), { ...deal, nglProfiles: [rich] }, data);
check("unassigned slots ignore extra profiles (IRR identical)", a.irr === b.irr && a.moic === b.moic, `${a.irr} vs ${b.irr}`);

// 2. Slot 2 on 'rich' equals: run slot 2 alone with the deal default replaced by rich's components.
const s2 = slots[1];
const viaProfile = runDeal([{ ...s2, nglProfileId: "p-rich" }], { ...deal, nglProfiles: [rich] }, data);
const viaDefault = runDeal([{ ...s2, nglProfileId: null }], { ...deal, content: rich.content }, data);
check("slot on a profile equals deal-default run with the same components", viaProfile.irr === viaDefault.irr && viaProfile.moic === viaDefault.moic, `${viaProfile.irr} vs ${viaDefault.irr}`);
check("profile changes the slot's shrink and % of WTI", viaProfile.slots[0].ngl.shrink !== a.slots[1].ngl.shrink && viaProfile.slots[0].ngl.profileName === "Rich (70% ethane)");

// 3. Mixed deal: only the assigned slot changes; other slots' single-well frames identical.
const mixed = runDeal(slots.map((s) => (s.slotId === 2 ? { ...s, nglProfileId: "p-rich" } : s)), { ...deal, nglProfiles: [rich] }, data);
const same = (i: number) => JSON.stringify(mixed.slots[i].well.rows.slice(0, 12)) === JSON.stringify(a.slots[i].well.rows.slice(0, 12));
check("mixed deal: slots 1 and 3 unchanged, slot 2 changed", same(0) && same(2) && !same(1));

// 4. Ethane recover/reject switch stays deal-level and applies to profiled slots too.
const rec = runDeal([{ ...s2, nglProfileId: "p-rich" }], { ...deal, nglProfiles: [rich], ethaneRec: true }, data);
check("deal-level ethane recovery switch applies to a profiled slot", rec.slots[0].ngl.recoveryCase === "recover" && rec.irr !== viaProfile.irr);

// 5. Unknown id fails loudly.
let threw = false; try { runDeal([{ ...s2, nglProfileId: "missing" }], deal, data); } catch { threw = true; }
check("unknown profile id throws", threw);
console.log(failures ? `\n${failures} check(s) FAILED` : "\nNGL profiles: all checks passed");
process.exit(failures ? 1 : 0);
