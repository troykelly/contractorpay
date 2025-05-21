/* eslint-disable max-len */
/**
 * @fileoverview Client-side Australian income-tax helper.
 * Provides marginal-rate tables (resident & non-resident, FY 2019-20 → 2024-25)
 * and utilities to calculate tax for:
 *   • a full financial-year taxable-income figure; or
 *   • any arbitrary date range with an annual salary.
 *
 * Data source: ATO tax-rate tables, updated 5 Jun 2024.
 * © Commonwealth of Australia, CC BY 2.5 (AU).  Attribution required.
 *
 * Usage (ES modules only):
 *   import {AusTaxBrackets} from './aus_tax_brackets.js';
 *
 *   // Full-year tax on $95 000 in FY 2024-25 (resident)
 *   const annualTax = AusTaxBrackets.calculateTax(95_000, '2024-25');
 *
 *   // Tax on the period 1 Sep 2023 – 31 Aug 2024, salary $120 000 p.a. (non-resident)
 *   const periodTax = AusTaxBrackets.calculateTaxForPeriod(
 *       '2023-09-01', '2024-08-31', 120_000, /* isResident = *\/ false);
 */

/** @typedef {Object} TaxBracket
 *  @property {number} min  Inclusive lower bound ($).
 *  @property {number} max  Exclusive upper bound ($; Infinity for top tier).
 *  @property {number} base Tax on income < `min` (per FY).
 *  @property {number} rate Marginal rate as a decimal (e.g. 0.325 ≙ 32.5 %).
 */

export class AusTaxBrackets {
  // ---------------------------------------------------------------------------
  // === PRIVATE DATA ===========================================================
  // ---------------------------------------------------------------------------

  /** @private @const {!Record<string, !Array<!TaxBracket>>} */
  static #RESIDENT = {
    "2019-20": [
      { min: 0, max: 18_200, base: 0, rate: 0 },
      { min: 18_200, max: 37_000, base: 0, rate: 0.19 },
      { min: 37_000, max: 90_000, base: 3_572, rate: 0.325 },
      { min: 90_000, max: 180_000, base: 20_797, rate: 0.37 },
      { min: 180_000, max: Infinity, base: 54_097, rate: 0.45 },
    ],
    "2020-21": [
      { min: 0, max: 18_200, base: 0, rate: 0 },
      { min: 18_200, max: 45_000, base: 0, rate: 0.19 },
      { min: 45_000, max: 120_000, base: 5_092, rate: 0.325 },
      { min: 120_000, max: 180_000, base: 29_467, rate: 0.37 },
      { min: 180_000, max: Infinity, base: 51_667, rate: 0.45 },
    ],
    // FY 2021-22 & 2022-23 identical to 2020-21:
    "2021-22": /** @type {!Array<!TaxBracket>} */ (null),
    "2022-23": /** @type {!Array<!TaxBracket>} */ (null),
    "2023-24": [
      { min: 0, max: 18_200, base: 0, rate: 0 },
      { min: 18_200, max: 45_000, base: 0, rate: 0.19 },
      { min: 45_000, max: 120_000, base: 5_092, rate: 0.325 },
      { min: 120_000, max: 180_000, base: 29_467, rate: 0.37 },
      { min: 180_000, max: Infinity, base: 51_667, rate: 0.45 },
    ],
    "2024-25": [
      { min: 0, max: 18_200, base: 0, rate: 0 },
      { min: 18_200, max: 45_000, base: 0, rate: 0.16 },
      { min: 45_000, max: 135_000, base: 4_288, rate: 0.3 },
      { min: 135_000, max: 190_000, base: 31_288, rate: 0.37 },
      { min: 190_000, max: Infinity, base: 51_638, rate: 0.45 },
    ],
  };

  /** @private @const {!Record<string, !Array<!TaxBracket>>} */
  static #NON_RESIDENT = {
    "2019-20": [
      { min: 0, max: 90_000, base: 0, rate: 0.325 },
      { min: 90_000, max: 180_000, base: 29_250, rate: 0.37 },
      { min: 180_000, max: Infinity, base: 62_550, rate: 0.45 },
    ],
    "2020-21": [
      { min: 0, max: 120_000, base: 0, rate: 0.325 },
      { min: 120_000, max: 180_000, base: 39_000, rate: 0.37 },
      { min: 180_000, max: Infinity, base: 61_200, rate: 0.45 },
    ],
    // FY 2021-22 & 2022-23 identical to 2020-21:
    "2021-22": /** @type {!Array<!TaxBracket>} */ (null),
    "2022-23": /** @type {!Array<!TaxBracket>} */ (null),
    "2023-24": [
      { min: 0, max: 120_000, base: 0, rate: 0.325 },
      { min: 120_000, max: 180_000, base: 39_000, rate: 0.37 },
      { min: 180_000, max: Infinity, base: 61_200, rate: 0.45 },
    ],
    "2024-25": [
      { min: 0, max: 135_000, base: 0, rate: 0.3 },
      { min: 135_000, max: 190_000, base: 40_500, rate: 0.37 },
      { min: 190_000, max: Infinity, base: 60_850, rate: 0.45 },
    ],
  };

  /** @private @const {!Record<string, !Array<{min:number,max:number,rate:number}>>} */
  static #HECS = {
    "2024-25": [
      { min: 0, max: 50_000, rate: 0 },
      { min: 50_000, max: 60_000, rate: 0.01 },
      { min: 60_000, max: 70_000, rate: 0.02 },
      { min: 70_000, max: 80_000, rate: 0.03 },
      { min: 80_000, max: 90_000, rate: 0.04 },
      { min: 90_000, max: 100_000, rate: 0.05 },
      { min: 100_000, max: 110_000, rate: 0.06 },
      { min: 110_000, max: 120_000, rate: 0.07 },
      { min: 120_000, max: 130_000, rate: 0.08 },
      { min: 130_000, max: 140_000, rate: 0.09 },
      { min: 140_000, max: Infinity, rate: 0.1 },
    ],
  };

  /** Collapse identical FY mappings declared as `null` above. */
  static {
    ["2021-22", "2022-23"].forEach((fy) => {
      AusTaxBrackets.#RESIDENT[fy] = AusTaxBrackets.#RESIDENT["2020-21"];
      AusTaxBrackets.#NON_RESIDENT[fy] =
        AusTaxBrackets.#NON_RESIDENT["2020-21"];
    });
  }

  // ---------------------------------------------------------------------------
  // === PUBLIC API =============================================================
  // ---------------------------------------------------------------------------

  /**
   * Returns the marginal brackets for a financial year.
   * @param {string} fy Financial-year key, e.g. `'2024-25'`.
   * @param {boolean=} isResident Defaults → `true`.
   * @return {!Array<!TaxBracket>} A defensive copy.
   * @throws {RangeError} If data unavailable.
   */
  static getBrackets(fy, isResident = true) {
    const src = isResident
      ? AusTaxBrackets.#RESIDENT
      : AusTaxBrackets.#NON_RESIDENT;
    let brackets = src[fy];
    if (!brackets) {
      const nearest = AusTaxBrackets.#nearestYear(fy, isResident);
      console.warn(`No bracket data for FY ${fy}; using ${nearest} instead.`);
      brackets = src[nearest];
    }
    return brackets.map((b) => ({ ...b }));
  }

  /**
   * Calculates tax payable on a given taxable-income figure *for the FY*.
   * @param {number} income   Taxable income ($).
   * @param {string} fy       Financial year string.
   * @param {boolean=} isResident Defaults → `true`.
   * @return {number} Tax payable ($).
   * @throws {RangeError} Bad inputs or bracket lookup failure.
   */
  static calculateTax(income, fy, isResident = true) {
    if (income < 0 || !Number.isFinite(income)) {
      throw new RangeError("Income must be a non-negative finite number.");
    }
    const brackets = AusTaxBrackets.getBrackets(fy, isResident);
    const tier = brackets.find((b) => income < b.max);
    if (!tier) {
      throw new RangeError(`Incomplete bracket table for FY ${fy}.`);
    }
    return tier.base + (income - tier.min) * tier.rate;
  }

  /**
   * Calculates tax payable on a salary for an arbitrary date range.
   *
   * If bracket data for a year is missing, the closest available FY is used
   * (logged with `console.warn`).  Days are prorated with day-level precision
   * (inclusive of both start & end dates).
   *
   * @param {(Date|string)} start Start date (inclusive).
   * @param {(Date|string)} end   End date (inclusive).
   * @param {number} annualSalary Salary per annum ($).
   * @param {boolean=} isResident Defaults → `true`.
   * @return {number} Tax payable for the period ($).
   * @throws {RangeError} On invalid parameters.
   */
  static calculateTaxForPeriod(start, end, annualSalary, isResident = true) {
    const s = AusTaxBrackets.#toDate(start);
    const e = AusTaxBrackets.#toDate(end);
    if (e < s) {
      throw new RangeError("End date must be on/after start date.");
    }
    if (annualSalary < 0 || !Number.isFinite(annualSalary)) {
      throw new RangeError("Salary must be a non-negative finite number.");
    }

    let totalTax = 0;
    let cursor = new Date(s);

    while (cursor <= e) {
      const fy = AusTaxBrackets.#dateToFy(cursor);
      const fyEnd = AusTaxBrackets.#endOfFy(fy);
      const segEnd = e < fyEnd ? e : fyEnd;

      const daysInSeg = AusTaxBrackets.#daysBetween(cursor, segEnd);
      const daysInFy = AusTaxBrackets.#daysBetween(
        AusTaxBrackets.#startOfFy(fy),
        fyEnd,
      );

      const segIncome = (annualSalary * daysInSeg) / daysInFy;
      totalTax += AusTaxBrackets.calculateTax(segIncome, fy, isResident);

      // Advance cursor to first day of next FY
      cursor = new Date(fyEnd.getTime() + 86_400_000); // +1 day
    }
    return totalTax;
  }

  /**
   * Calculates compulsory HECS/HELP repayment for an annual income.
   * @param {number} income Taxable income ($).
   * @param {string} fy Financial year string.
   * @return {number} Repayment amount ($).
   * @throws {RangeError} On bad inputs or lookup failure.
   */
  static calculateHecs(income, fy = "2024-25") {
    if (income < 0 || !Number.isFinite(income)) {
      throw new RangeError("Income must be a non-negative finite number.");
    }
    let table = AusTaxBrackets.#HECS[fy];
    if (!table) {
      const nearest = AusTaxBrackets.#nearestYear(fy, true);
      console.warn(`No HECS data for FY ${fy}; using ${nearest} instead.`);
      table = AusTaxBrackets.#HECS[nearest];
    }
    const tier = table.find((b) => income < b.max);
    if (!tier) {
      throw new RangeError(`Incomplete HECS table for FY ${fy}.`);
    }
    return income * tier.rate;
  }

  // ---------------------------------------------------------------------------
  // === INTERNAL HELPERS =======================================================
  // ---------------------------------------------------------------------------

  /**
   * Parses a value to a `Date`.
   * @param {(Date|string)} val
   * @return {!Date}
   * @private
   */
  static #toDate(val) {
    const d = val instanceof Date ? new Date(val) : new Date(String(val));
    if (Number.isNaN(d.valueOf())) {
      throw new RangeError(`Invalid date: ${val}`);
    }
    // Zero the time component for safe day maths.
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Returns the Australian financial-year string for a date.
   * Example: 5 Feb 2024 → `'2023-24'` (FY ends 30 Jun 2024).
   * @param {!Date} d
   * @return {string}
   * @private
   */
  static #dateToFy(d) {
    const year = d.getFullYear();
    const isAfterJun = d.getMonth() >= 6; // July = 6
    const fyStart = isAfterJun ? year : year - 1;
    const fyEnd = (fyStart + 1) % 100; // 24 for 2023-24
    return `${fyStart}-${fyEnd.toString().padStart(2, "0")}`;
  }

  /**
   * Start of FY as Date (00:00 on 1 Jul).
   * @param {string} fy e.g. `'2024-25'`
   * @return {!Date}
   * @private
   */
  static #startOfFy(fy) {
    const y = parseInt(fy.slice(0, 4), 10);
    return new Date(Date.UTC(y, 6, 1)); // 1 Jul YYYY
  }

  /**
   * End of FY as Date (23:59:59 on 30 Jun).
   * @param {string} fy
   * @return {!Date}
   * @private
   */
  static #endOfFy(fy) {
    const y = parseInt(fy.slice(0, 4), 10) + 1;
    return new Date(Date.UTC(y, 5, 30, 23, 59, 59, 999)); // 30 Jun YYYY+1
  }

  /**
   * Inclusive day count between two dates.
   * @param {!Date} a
   * @param {!Date} b
   * @return {number}
   * @private
   */
  static #daysBetween(a, b) {
    const ms = b.getTime() - a.getTime();
    return Math.floor(ms / 86_400_000) + 1;
  }

  /**
   * Finds the closest FY string for which we have tables.
   * @param {string} target
   * @param {boolean} isResident
   * @return {string}
   * @private
   */
  static #nearestYear(target, isResident) {
    const src = isResident
      ? AusTaxBrackets.#RESIDENT
      : AusTaxBrackets.#NON_RESIDENT;
    const tgt = parseInt(target.slice(0, 4), 10);
    const years = Object.keys(src).map((fy) => parseInt(fy.slice(0, 4), 10));
    const nearestStart = years.reduce(
      (best, y) => (Math.abs(y - tgt) < Math.abs(best - tgt) ? y : best),
      years[0],
    );
    const suffix = ((nearestStart + 1) % 100).toString().padStart(2, "0");
    return `${nearestStart}-${suffix}`;
  }
}

/* ---------------------------------------------------------------------------
 * === LIGHTWEIGHT SELF-TESTS (no production impact) ==========================
 * ------------------------------------------------------------------------- */
if (import.meta.url.endsWith("aus_tax_brackets.js")) {
  const assert = (cond, msg) => {
    if (!cond) {
      throw new Error(msg);
    }
  };

  // 1. Full FY ≙ period calc parity
  const fy = "2024-25";
  const salary = 100_000;
  const fullYearTax = AusTaxBrackets.calculateTax(salary, fy, true);

  const periodTax = AusTaxBrackets.calculateTaxForPeriod(
    "2024-07-01",
    "2025-06-30",
    salary,
    true,
  );
  assert(
    fullYearTax === periodTax,
    "Full-year parity failed for resident FY 2024-25",
  );

  // 2. Cross-FY (half & half)
  const t = AusTaxBrackets.calculateTaxForPeriod(
    "2024-01-01",
    "2024-12-31",
    150_000,
    true,
  );
  assert(Number.isFinite(t) && t > 0, "Cross-FY calculation failed.");

  // 3. HECS repayment sanity
  const hecs = AusTaxBrackets.calculateHecs(100_000, fy);
  assert(Number.isFinite(hecs) && hecs >= 0, "HECS calculation failed.");

  console.info("AusTaxBrackets smoke-tests passed.");
}
