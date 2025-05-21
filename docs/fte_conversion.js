/**
 * @fileoverview  Contractor-to-Permanent “Full-Time Equivalent” converter.
 *
 *   • 100 % browser-side, ES-module.  No external dependencies except
 *     `AusTaxBrackets` if you want PAYG/Medicare estimates.
 *   • Follows the detailed formula set agreed with Troy (May 2025).
 *   • All inputs/outputs are plain numbers (AUD) or strings for rate-type.
 *
 * Update the constant block once a year (SG %, payroll-tax thresholds etc.).
 *
 * @author  ChatGPT (o3)
 * @license CC BY 4.0 – feel free to use in the Production City calculator.
 */

/* eslint-disable max-len */

export class FteConversion {
  // ---------------------------------------------------------------------------
  // CONSTANTS -- editable in one place.
  // ---------------------------------------------------------------------------

  /** @private */
  static #CONST = {
    /** Super-guarantee rate from 1 July 2025. */
    SG_RATE: 0.115,

    /**
     * Payroll-tax headline rates by state/territory.
     * Values are fractions of gross wages above the local threshold.
     * Set to 0 if the business remains under the threshold.
     */
    PAYROLL_TAX_RATES: /** @type {!Record<string, number>} */ ({
      ACT: 0.062,
      NSW: 0.0545,
      NT: 0.055,
      QLD: 0.048,
      SA: 0.0495,
      TAS: 0.06,
      VIC: 0.0435,
      WA: 0.055,
    }),

    /** Average WorkCover (workers-comp) premium for low-risk white-collar. */
    WORKCOVER_RATE: 0.016,

    /** 17.5 % leave loading applied to 4 weeks’ annual leave. */
    LEAVE_LOADING_RATE: 0.175 * 4 / 52, // ≈ 0.01346

    /** Chargeable days per year for a permanent employee. */
    CHARGEABLE_DAYS: 220,

    /** Standard full-time hours per day (used for hourly-rate conversions). */
    STD_HOURS_PER_DAY: 7.6,

    GST_RATE: 0.10,
  };

  // ---------------------------------------------------------------------------
  // PUBLIC CONSTANT ACCESSORS / MUTATORS
  // ---------------------------------------------------------------------------

  /**
   * Returns a deep clone of the constants object (read-only for callers).
   * @return {!Object<string, *>} Safe copy.
   */
  static getConstants() {
    return structuredClone(FteConversion.#CONST);
  }

  /**
   * Updates one numeric constant at run-time (e.g. SG rate bump).
   * @param {keyof typeof FteConversion.#CONST} key
   * @param {*} value  New value (type-checked shallowly).
   */
  static setConstant(key, value) {
    if (!(key in FteConversion.#CONST)) {
      throw new RangeError(`Unknown constant “${key}”.`);
    }
    if (typeof FteConversion.#CONST[key] !== typeof value) {
      throw new TypeError(
          `Type mismatch for ${key}: expected ` +
          typeof FteConversion.#CONST[key]);
    }
    // eslint-disable-next-line no-console
    console.info(`FteConversion constant ${key} changed from ` +
                 `${FteConversion.#CONST[key]} → ${value}`);
    // @ts-ignore – private OK here
    FteConversion.#CONST[key] = value;
  }

  /**
   * Updates payroll-tax rate for one state; creates new key if needed.
   * @param {string} state  Two-letter AUS state/territory code (upper-case).
   * @param {number} rate   Fraction e.g. 0.0545 for 5.45 %.
   */
  static setPayrollTaxRate(state, rate) {
    if (typeof rate !== 'number' || rate < 0 || rate > 0.2) {
      throw new RangeError('Payroll-tax rate should be a fraction 0–0.20.');
    }
    FteConversion.#CONST.PAYROLL_TAX_RATES[state] = rate;
  }

  // ---------------------------------------------------------------------------
  // MAIN API
  // ---------------------------------------------------------------------------

  /**
   * @typedef {{
   *   rate: number,
   *   rateType: 'hourly'|'daily'|'weekly',
   *   startDate: (Date|string),
   *   endDate: (Date|string),
   *   workingDays: number,
   *   holidayDays: number,
   *   furloughDays: number,
   *   hoursPerDay: number,
   *   state: string,
   * }}
   */
  // eslint-disable-next-line no-unused-vars
  FteInput;

  /**
   * @typedef {{
   *   grossContractorExGst: number,
   *   annualisedContractorCost: number,
   *   multiplier: number,
   *   baseSalary: number,
   *   superAmount: number,
   *   totalPackage: number,
   *   payg?: number,
   *   medicare?: number,
   *   netTakeHome?: number,
   * }}
   */
  // eslint-disable-next-line no-unused-vars
  FteResult;

  /**
   * Core conversion – returns all intermediate and final numbers.
   *
   * @param {!FteConversion.FteInput} input
   * @param {boolean=} includeTax If true, calculates PAYG + Medicare using
   *     `AusTaxBrackets`.  Requires that class to be globally/import available.
   * @return {!FteConversion.FteResult}
   */
  static convert(input, includeTax = false) {
    // -------- Date maths -----------------------------------------------------
    const start = FteConversion.#toDate(input.startDate);
    const end = FteConversion.#toDate(input.endDate);
    if (end < start) {
      throw new RangeError('endDate must be ≥ startDate');
    }
    const effectiveDays =
        input.workingDays - input.holidayDays - input.furloughDays;
    if (effectiveDays <= 0) {
      throw new RangeError('No chargeable contractor days in the period.');
    }

    // -------- Step 1 – contractor revenue for period -------------------------
    const unitsWorked = {
      hourly: effectiveDays * input.hoursPerDay,
      daily: effectiveDays,
      weekly: effectiveDays / 5,
    }[input.rateType];

    const grossContractorExGst = input.rate * unitsWorked;

    // -------- Step 2 – annualise to a full year ------------------------------
    const annualisedContractorCost =
        grossContractorExGst *
        (FteConversion.#CONST.CHARGEABLE_DAYS / effectiveDays);

    // -------- Step 3 – employer on-cost multiplier ---------------------------
    const sg = FteConversion.#CONST.SG_RATE;
    const wc = FteConversion.#CONST.WORKCOVER_RATE;
    const ll = FteConversion.#CONST.LEAVE_LOADING_RATE;
    const pt = FteConversion.#payrollTaxRateFor(input.state);
    const multiplier =
        1 + sg + wc + ll + pt * (1 + sg + ll);  // derives from doc formula

    const baseSalary = annualisedContractorCost / multiplier;
    const superAmount = baseSalary * sg;
    const totalPackage = baseSalary + superAmount;

    /** @type {!FteConversion.FteResult} */
    const result = {
      grossContractorExGst: FteConversion.#round(grossContractorExGst),
      annualisedContractorCost: FteConversion.#round(annualisedContractorCost),
      multiplier: FteConversion.#round(multiplier, 4),
      baseSalary: FteConversion.#round(baseSalary),
      superAmount: FteConversion.#round(superAmount),
      totalPackage: FteConversion.#round(totalPackage),
    };

    // -------- Optional tax illustrations ------------------------------------
    if (includeTax && typeof AusTaxBrackets !== 'undefined') {
      const fy = FteConversion.#dateToFy(start);
      const payg = AusTaxBrackets.calculateTax(baseSalary, fy, true);
      const medicare = baseSalary * 0.02;
      result.payg = FteConversion.#round(payg);
      result.medicare = FteConversion.#round(medicare);
      result.netTakeHome =
          FteConversion.#round(baseSalary - payg - medicare);
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // INTERNAL HELPERS
  // ---------------------------------------------------------------------------

  /** @param {(Date|string)} d @return {!Date} */
  static #toDate(d) {
    const dt = d instanceof Date ? new Date(d) : new Date(String(d));
    if (Number.isNaN(dt.valueOf())) {
      throw new RangeError(`Invalid date: ${d}`);
    }
    dt.setHours(0, 0, 0, 0);
    return dt;
  }

  /** @param {string} state @return {number} */
  static #payrollTaxRateFor(state) {
    return FteConversion.#CONST.PAYROLL_TAX_RATES[state] ?? 0;
  }

  /**
   * Converts Date to FY string e.g. 3 Aug 2024 → ‘2024-25’.
   * @param {!Date} d
   * @return {string}
   */
  static #dateToFy(d) {
    const y = d.getFullYear();
    const fyStart = d.getMonth() >= 6 ? y : y - 1;  // 1 Jul cutoff
    return `${fyStart}-${String((fyStart + 1) % 100).padStart(2, '0')}`;
  }

  /** Rounds to cents (or custom decimals). */
  static #round(n, decimals = 2) {
    const f = 10 ** decimals;
    return Math.round(n * f) / f;
  }
}

/* ---------------------------------------------------------------------------
 * EXAMPLE  –  paste into console or integrate with your <button id="calculate">
 * ---------------------------------------------------------------------------
 *
 * import {FteConversion} from './fte_conversion.js';
 *
 * const input = {
 *   rate: Number(document.querySelector('#rate').value),
 *   rateType: /** @type {'hourly'|'daily'|'weekly'} *\/ (
 *       document.querySelector('#rateType').value),
 *   startDate: document.querySelector('#startDate').value,
 *   endDate: document.querySelector('#endDate').value,
 *   workingDays: Number(document.querySelector('#workingDays').value),
 *   holidayDays: Number(document.querySelector('#holidayDays').value),
 *   furloughDays: calcFurloughDays(),          // your own helper
 *   hoursPerDay: Number(document.querySelector('#hoursPerDay').value),
 *   state: document.querySelector('#state').value,
 * };
 *
 * const out = FteConversion.convert(input, /* includeTax = */ true);
 * console.log(out);
 *
 * ---------------------------------------------------------------------------
 * LIGHT SMOKE-TEST – runs when file executed standalone                 */
if (import.meta.url.endsWith('fte_conversion.js')) {
  const demo = {
    rate: 800,
    rateType: 'daily',
    startDate: '2025-07-01',
    endDate: '2025-12-31',
    workingDays: 92,
    holidayDays: 0,
    furloughDays: 0,
    hoursPerDay: 7.6,
    state: 'NSW',
  };
  // eslint-disable-next-line no-console
  console.table(FteConversion.convert(demo, false));
}
