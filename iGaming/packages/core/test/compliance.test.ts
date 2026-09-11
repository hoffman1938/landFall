/**
 * COMPLIANCE INVARIANTS — the conformance matrices, made executable.
 *
 * Every test here names the clause it enforces. They exist because the gap
 * register's findings were all of a kind: the correct number lived somewhere in
 * the codebase, and nothing asserted that the game actually honoured it. A
 * conformance matrix that is re-derived by hand each release is a matrix that
 * goes stale between releases.
 *
 * docs/10-compliance/11-gli-19-conformance-matrix.md
 * docs/10-compliance/12-georgian-rules-conformance-matrix.md
 * docs/10-compliance/22-compliance-gap-register.md
 */
import { describe, expect, it } from 'vitest';
import {
  RAKE,
  RAKE_SPLIT,
  STORM_POWER_LADDER,
  STORM_POWER_MAX_PAYOUT_MULTIPLE,
  ZONE_COUNT,
  applyFloatRound,
  applyReserveRound,
  balanceJackpot,
  contributeToSurge,
  decommissionSurge,
  economyDisclosure,
  expectedOperatorDelta,
  expectedOverpayment,
  openFloat,
  payOutSurge,
  reconcileOperatorRevenue,
  releaseFloat,
  rollOverSurge,
  settleRound,
  stormPowerPaytable,
  stormPowerRange,
  theoreticalRtp,
  unwinnableTiers,
  RULES_CHANGELOG,
  RULES_VERSION,
  type StakeEntry,
  type SurgePotState,
} from '../src/index.js';

// ---------------------------------------------------------------------------
// G9 — the advertised award must actually be payable
// ---------------------------------------------------------------------------

describe('GLI-19 §4.4.1(f) — every advertised award is winnable (G9)', () => {
  it('no ladder tier is unwinnable at the reference pool shape', () => {
    expect(unwinnableTiers(RAKE, STORM_POWER_MAX_PAYOUT_MULTIPLE)).toEqual([]);
  });

  /**
   * The regression this whole change exists for, and it reached TWO tiers.
   *
   * At the previous 25× cap the ×500 Perfect Storm was clamped whenever the
   * struck harbor held more than 5.68% of the handle — six harbors average
   * 16.7%, so it was clamped in essentially every round it ever landed in and
   * could never be paid at its advertised value. Category 6 ×100 cleared
   * uniform pools but was clamped from 28.4% of handle upward, i.e. on exactly
   * the crowded-harbor rounds the feature is sold on.
   *
   * This test pins the defect so the cap can never be quietly lowered back
   * through it.
   */
  it('the retired 25× cap made the top two tiers unwinnable', () => {
    expect(unwinnableTiers(RAKE, 25).map((t) => t.label)).toEqual(['Category 6', 'PERFECT STORM']);
    // ×500 failed even at perfectly uniform pools — no crowding required.
    expect(unwinnableTiers(RAKE, 25, ZONE_COUNT, 1).map((t) => t.label)).toEqual(['PERFECT STORM']);
  });

  it('every tier pays in full at uniform pools, top tier included', () => {
    const pools: StakeEntry[] = [0, 1, 2, 3, 4, 5].map((z) => ({
      id: `z${z}`,
      zone: z,
      amountMinor: 100_00,
      isHouseSeed: false,
    }));
    const handle = pools.reduce((a, s) => a + s.amountMinor, 0);
    for (const tier of STORM_POWER_LADDER) {
      const r = settleRound(
        pools,
        0,
        RAKE,
        { mNum: tier.mNum, mDen: tier.mDen },
        STORM_POWER_MAX_PAYOUT_MULTIPLE * handle,
      );
      expect(r.powerCapped, `${tier.label} clamped at uniform pools`).toBe(false);
      const realised = r.salvageTotalMinor / r.distributedMinor;
      expect(realised).toBeCloseTo(tier.mNum / tier.mDen, 5);
    }
  });

  it('the top tier still pays in full when the hit harbour holds twice its share', () => {
    // Struck harbor at 2/6 of the handle — the headroom the cap is derived from.
    const pools: StakeEntry[] = [
      { id: 'hit', zone: 0, amountMinor: 200_00, isHouseSeed: false },
      ...[1, 2, 3, 4, 5].map((z) => ({
        id: `z${z}`,
        zone: z,
        amountMinor: 80_00,
        isHouseSeed: false,
      })),
    ];
    const handle = pools.reduce((a, s) => a + s.amountMinor, 0);
    expect(pools[0]!.amountMinor / handle).toBeCloseTo(2 / ZONE_COUNT, 5);
    const r = settleRound(pools, 0, RAKE, { mNum: 500, mDen: 1 }, STORM_POWER_MAX_PAYOUT_MULTIPLE * handle);
    expect(r.powerCapped).toBe(false);
  });

  it('§4.7.3 publishes actual odds and §4.8.6 publishes the min and max', () => {
    const rows = stormPowerPaytable();
    expect(rows).toHaveLength(STORM_POWER_LADDER.length);
    for (const row of rows) {
      expect(row.oddsOneIn).toBeGreaterThan(0);
      expect(row.multiplier).toMatch(/^×/);
    }
    // The headline award is far more frequent than the 1-in-100,000,000 the
    // clause allows to go undisclosed, which is why the odds column is required.
    const top = rows.at(-1)!;
    expect(top.oddsOneIn).toBeCloseTo(1_048_576, 0);
    expect(top.oddsOneIn).toBeLessThan(100_000_000);

    const range = stormPowerRange();
    expect(range.minMultiplier).toBe('×1');
    expect(range.maxMultiplier).toBe('×500');
  });

  it('§4.7.4 states the share above which each tier can be clamped', () => {
    const rows = stormPowerPaytable();
    // Tiers that can never be clamped say so with null rather than a fake number.
    expect(rows[0]!.cappedAboveShare).toBeNull();
    const top = rows.at(-1)!;
    expect(top.cappedAboveShare).not.toBeNull();
    expect(top.cappedAboveShare!).toBeGreaterThan(2 / ZONE_COUNT);
  });
});

// ---------------------------------------------------------------------------
// G11 — Storm Reserve solvency
// ---------------------------------------------------------------------------

describe('GLI-19 §A.4.1 / §4.13.5 — Storm Reserve solvency (G11)', () => {
  it('the balance never goes negative; a shortfall becomes an explicit backstop', () => {
    const opened = { balanceMinor: 1_000, backstopTotalMinor: 0 };
    const m = applyReserveRound(opened, 100, 50_000);
    expect(m.state.balanceMinor).toBe(0);
    expect(m.backstopMinor).toBe(50_000 - 1_100);
    expect(m.state.backstopTotalMinor).toBe(m.backstopMinor);
  });

  it('a solvent round books no backstop and the balance is exact', () => {
    const m = applyReserveRound({ balanceMinor: 10_000, backstopTotalMinor: 0 }, 500, 300);
    expect(m.backstopMinor).toBe(0);
    expect(m.state.balanceMinor).toBe(10_200);
  });

  it('conserves across a long random walk — balance + backstop reconciles exactly', () => {
    let s = 987_654;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 2 ** 32);
    let state = { balanceMinor: 0, backstopTotalMinor: 0 };
    let inflows = 0;
    let outflows = 0;
    for (let i = 0; i < 20_000; i++) {
      const inflow = Math.floor(rnd() * 500);
      const outflow = rnd() < 0.01 ? Math.floor(rnd() * 90_000) : Math.floor(rnd() * 400);
      const m = applyReserveRound(state, inflow, outflow);
      state = m.state;
      inflows += m.inflowMinor;
      outflows += m.outflowMinor;
      expect(state.balanceMinor).toBeGreaterThanOrEqual(0);
    }
    // Every unit is accounted for: what came in, plus what the house injected,
    // minus what went out, is what remains.
    expect(inflows + state.backstopTotalMinor - outflows).toBe(state.balanceMinor);
  });

  /**
   * §4.13.5 — "diversion schemes shall not have infinite mathematical
   * expectation". The ladder is a finite set of finite multipliers and the cap
   * bounds the worst single round, so both the mean and the maximum are finite.
   */
  it('§4.13.5 — expectation and worst case are both finite and bounded', () => {
    const eOver = expectedOverpayment();
    expect(Number.isFinite(eOver)).toBe(true);
    // Funding invariant: E[M−1]·(1−r) ≤ reserve share of the rake.
    expect(eOver * (1 - RAKE)).toBeLessThanOrEqual(RAKE_SPLIT.stormReserve * RAKE);

    // Worst-case single-round outflow is bounded by the cap, whatever the pools.
    const pools: StakeEntry[] = [0, 1, 2, 3, 4, 5].map((z) => ({
      id: `z${z}`,
      zone: z,
      amountMinor: 1_000_00,
      isHouseSeed: false,
    }));
    const handle = pools.reduce((a, e) => a + e.amountMinor, 0);
    const r = settleRound(pools, 0, RAKE, { mNum: 500, mDen: 1 }, STORM_POWER_MAX_PAYOUT_MULTIPLE * handle);
    expect(r.houseDeltaMinor).toBeLessThanOrEqual(STORM_POWER_MAX_PAYOUT_MULTIPLE * handle);
  });
});

// ---------------------------------------------------------------------------
// G8 — house-seed ring-fence
// ---------------------------------------------------------------------------

describe('GLI-19 §A.7.1(c)–(d) — house seed ring-fenced from revenue (G8)', () => {
  it('float P&L never reaches operator revenue: rake alone is the inflow', () => {
    const rakeMinor = 4_200;
    // The only credit path into the operator account is the rake share.
    expect(reconcileOperatorRevenue(rakeMinor, rakeMinor)).toEqual({
      leakageMinor: 0,
      incident: false,
    });
    // A single credit of seed profit landing in revenue is an incident.
    expect(reconcileOperatorRevenue(rakeMinor + 1, rakeMinor).incident).toBe(true);
  });

  it('the operator account has one inflow and three disclosed outflows', () => {
    // Funding the float, the reserve and the jackpot reset all move money
    // TOWARD players, so they reduce the operator's position rather than
    // breaching §A.7.1(c) — which is a rule about profit, not about net worth.
    expect(
      expectedOperatorDelta({
        rakeMinor: 10_000,
        floatTopUpMinor: 2_000,
        reserveBackstopMinor: 3_000,
        jackpotResetFundedMinor: 1_000,
      }),
    ).toBe(4_000);
  });

  it('books a winning and a losing round against the float, not the house', () => {
    const float = openFloat(100_000);
    const win = applyFloatRound(float, 6_000, 7_500);
    expect(win.netMinor).toBe(1_500);
    expect(win.topUpMinor).toBe(0);
    expect(win.state.balanceMinor).toBe(101_500);

    const loss = applyFloatRound(win.state, 6_000, 0);
    expect(loss.netMinor).toBe(-6_000);
    expect(loss.state.balanceMinor).toBe(95_500);
  });

  it('a float that cannot fund its seed books an explicit operator top-up', () => {
    const r = applyFloatRound({ balanceMinor: 500, contributedMinor: 0, releasedMinor: 0 }, 6_000, 0);
    expect(r.topUpMinor).toBe(5_500);
    expect(r.state.contributedMinor).toBe(5_500);
    expect(r.state.balanceMinor).toBe(0);
  });

  it('§A.7.1(d) — float money can only ever reach player-facing funds', () => {
    const float = openFloat(10_000);
    for (const to of ['SEED', 'SURGE_POT', 'STORM_RESERVE'] as const) {
      expect(releaseFloat(float, 1_000, to).releasedMinor).toBe(1_000);
    }
    // Releasing more than the float holds is refused, never overdrawn.
    expect(() => releaseFloat(float, 10_001, 'SURGE_POT')).toThrow(/exceeds balance/);
  });
});

// ---------------------------------------------------------------------------
// G10 — jackpot controls
// ---------------------------------------------------------------------------

describe('Order 222 Art. 17 / GLI §4.13 — jackpot controls (G10)', () => {
  const policy = { resetMinor: 500_00, ceilingMinor: 5_000_00 };
  const fresh = (): SurgePotState => ({ potMinor: 500_00, diversionMinor: 0 });

  it('§4.13.6 — contributions are never lost: pot + diversion is exact', () => {
    let state = fresh();
    let contributed = 0;
    for (let i = 0; i < 5_000; i++) {
      const c = contributeToSurge(state, 250, policy);
      expect(c.toPotMinor + c.toDiversionMinor).toBe(250);
      state = c.state;
      contributed += 250;
    }
    expect(state.potMinor + state.diversionMinor).toBe(500_00 + contributed);
  });

  it('§4.13.3 — the pot stops at the ceiling and the overflow diverts', () => {
    const atCeiling: SurgePotState = { potMinor: policy.ceilingMinor, diversionMinor: 0 };
    const c = contributeToSurge(atCeiling, 10_000, policy);
    expect(c.toPotMinor).toBe(0);
    expect(c.toDiversionMinor).toBe(10_000);
    expect(c.state.potMinor).toBe(policy.ceilingMinor);
    expect(c.atCeiling).toBe(true);
  });

  it('§4.13.6 — payout is not truncated and the reset comes from diversion first', () => {
    const state: SurgePotState = { potMinor: 5_000_00, diversionMinor: 300_00 };
    const p = payOutSurge(state, policy);
    expect(p.paidMinor).toBe(5_000_00); // exact, to the minor unit
    expect(p.fromDiversionMinor).toBe(300_00);
    expect(p.fromHouseMinor).toBe(200_00);
    expect(p.state.potMinor).toBe(policy.resetMinor);
    expect(p.state.diversionMinor).toBe(0);
  });

  it('Art. 17.3 — an unpaid jackpot rolls over untouched and is never cancelled', () => {
    const state: SurgePotState = { potMinor: 1_234_56, diversionMinor: 78 };
    expect(rollOverSurge(state)).toEqual(state);
  });

  it('Art. 17.4 — decommissioning into worse odds is refused, not adjusted', () => {
    const source: SurgePotState = { potMinor: 900_00, diversionMinor: 100_00 };
    const dest: SurgePotState = { potMinor: 50_00, diversionMinor: 0 };
    expect(() => decommissionSurge(source, dest, 0.04, 0.02)).toThrow(/refused/);
    const ok = decommissionSurge(source, dest, 0.04, 0.04);
    expect(ok.transferredMinor).toBe(1_000_00);
    expect(ok.destination.potMinor).toBe(950_00);
    expect(ok.destination.diversionMinor).toBe(100_00);
  });

  it('Art. 17.2 — balancing is exact, and any discrepancy raises an incident', () => {
    const clean = balanceJackpot({
      openingMinor: 500_00,
      contributionsMinor: 1_200_00,
      paidOutMinor: 1_400_00,
      houseSeededMinor: 200_00,
      closingMinor: 500_00,
    });
    expect(clean.discrepancyMinor).toBe(0);
    expect(clean.incident).toBe(false);

    const drifted = balanceJackpot({
      openingMinor: 500_00,
      contributionsMinor: 1_200_00,
      paidOutMinor: 1_400_00,
      houseSeededMinor: 200_00,
      closingMinor: 500_01,
    });
    expect(drifted.discrepancyMinor).toBe(1);
    expect(drifted.incident).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// G24 — RTP definition
// ---------------------------------------------------------------------------

describe('Order 240 Art. 2.2(a.e) / GLI §4.7.2 — RTP is defined and derived (G24)', () => {
  it('the three flows sum to the published figure', () => {
    const b = theoreticalRtp();
    expect(b.baseReturn).toBeCloseTo(1 - RAKE / ZONE_COUNT, 10);
    expect(b.surgeReturn).toBeCloseTo(RAKE_SPLIT.surge * (RAKE / ZONE_COUNT), 10);
    expect(b.baseReturn + b.stormPowerReturn + b.surgeReturn).toBeCloseTo(b.totalRtp, 10);
    expect(b.totalRtp + b.operatorHold).toBeCloseTo(1, 10);
  });

  /**
   * The stale-figure finding. "≈ 98%" is the BASE term alone; the same sentence
   * that quoted it also listed the surge and reserve return flows, which add a
   * further percentage point. §4.7.2 requires a displayed figure to match its
   * own stated derivation.
   */
  it('the player-facing figure is the derived one, not the base term', () => {
    const b = theoreticalRtp();
    expect(b.baseReturn).toBeCloseTo(0.98, 4); // the old, stale quote
    expect(b.totalRtp).toBeGreaterThan(0.98);
    expect(economyDisclosure().longRunReturn).toBe('99.0%');
  });

  it('operator hold is the house share of the rake and nothing else', () => {
    const b = theoreticalRtp();
    expect(b.operatorHold).toBeCloseTo(RAKE_SPLIT.house * (RAKE / ZONE_COUNT), 4);
  });
});

// ---------------------------------------------------------------------------
// G45 — versioned rules artefact
// ---------------------------------------------------------------------------

describe('GLI-19 §A.5.1 / Law Art. 12.1(f) — versioned rules (G45)', () => {
  it('the changelog is contiguous and reaches the current version', () => {
    RULES_CHANGELOG.forEach((row, i) => expect(row.version).toBe(i + 1));
    expect(RULES_CHANGELOG.at(-1)!.version).toBe(RULES_VERSION);
  });

  it('every rules change carries a material-change classification', () => {
    for (const row of RULES_CHANGELOG) {
      expect(typeof row.material).toBe('boolean');
      expect(row.effective).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Law Art. 24¹.2 — a material change must name the limb it engages, so the
      // re-authorization filing can be written from the changelog alone.
      if (row.material) expect(row.limb).toBeTruthy();
    }
  });
});
