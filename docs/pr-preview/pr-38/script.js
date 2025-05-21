import { AusTaxBrackets } from "./aus_tax_brackets.js";
import { FteConversion } from "./fte_conversion.js";

class HolidayService {
  static FALLBACK_HOLIDAYS = {
    2024: {
      ACT: [
        "2024-01-01",
        "2024-01-26",
        "2024-03-29",
        "2024-04-01",
        "2024-04-25",
        "2024-06-10",
        "2024-12-25",
        "2024-12-26",
      ],
      NSW: [
        "2024-01-01",
        "2024-01-26",
        "2024-03-29",
        "2024-04-01",
        "2024-04-25",
        "2024-06-10",
        "2024-10-07",
        "2024-12-25",
        "2024-12-26",
      ],
      NT: [
        "2024-01-01",
        "2024-01-26",
        "2024-03-29",
        "2024-04-01",
        "2024-04-25",
        "2024-05-06",
        "2024-12-25",
        "2024-12-26",
      ],
      QLD: [
        "2024-01-01",
        "2024-01-26",
        "2024-03-29",
        "2024-04-01",
        "2024-04-25",
        "2024-05-06",
        "2024-10-07",
        "2024-12-25",
        "2024-12-26",
      ],
      SA: [
        "2024-01-01",
        "2024-01-26",
        "2024-03-29",
        "2024-04-01",
        "2024-04-25",
        "2024-06-10",
        "2024-10-07",
        "2024-12-25",
        "2024-12-26",
      ],
      TAS: [
        "2024-01-01",
        "2024-01-26",
        "2024-03-29",
        "2024-04-01",
        "2024-04-25",
        "2024-06-10",
        "2024-12-25",
        "2024-12-26",
      ],
      VIC: [
        "2024-01-01",
        "2024-01-26",
        "2024-03-29",
        "2024-04-01",
        "2024-04-25",
        "2024-06-10",
        "2024-11-05",
        "2024-12-25",
        "2024-12-26",
      ],
      WA: [
        "2024-01-01",
        "2024-01-26",
        "2024-03-29",
        "2024-04-01",
        "2024-04-25",
        "2024-06-03",
        "2024-09-23",
        "2024-12-25",
        "2024-12-26",
      ],
    },
  };

  static cache = {};

  static async fetchHolidays(year, state) {
    const response = await fetch(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/AU`,
    );
    if (!response.ok) throw new Error("Network response was not ok");
    const data = await response.json();
    return data
      .filter((h) => !h.counties || h.counties.includes(`AU-${state}`))
      .map((h) => h.date);
  }

  static async getHolidays(year, state) {
    const key = `${year}_${state}`;
    if (this.cache[key]) return this.cache[key];
    try {
      const holidays = await this.fetchHolidays(year, state);
      this.cache[key] = holidays;
      return holidays;
    } catch (e) {
      const fallback = (this.FALLBACK_HOLIDAYS[year] || {})[state];
      this.cache[key] = fallback || [];
      return this.cache[key];
    }
  }
}

class TaxService {
  static cache = {};

  static async getBrackets(year, isResident = true) {
    if (this.cache[year]) return this.cache[year];
    const fy = `${year}-${String((year + 1) % 100).padStart(2, "0")}`;
    const data = AusTaxBrackets.getBrackets(fy, isResident).map((b) => ({
      threshold: b.min,
      base: b.base,
      rate: b.rate,
    }));
    this.cache[year] = data;
    return data;
  }

  static calcTax(income, brackets) {
    if (!Array.isArray(brackets)) return 0;
    for (let i = brackets.length - 1; i >= 0; i--) {
      const b = brackets[i];
      if (income >= b.threshold) {
        return b.base + (income - b.threshold) * b.rate;
      }
    }
    return 0;
  }
}

class PayCalculator {
  constructor(dailyRate, gstRate, taxRate, superRate, hecsRate) {
    this.dailyRate = dailyRate;
    this.gstRate = gstRate;
    this.taxRate = taxRate;
    this.superRate = superRate;
    this.hecsRate = hecsRate;
  }

  calculate(workingDays) {
    const incomeExGst = this.dailyRate * workingDays;
    const gstAmount = incomeExGst * this.gstRate;
    const incomeIncGst = incomeExGst + gstAmount;
    const taxAmount = incomeExGst * this.taxRate;
    const superAmount = incomeExGst * this.superRate;
    const hecsAmount = incomeExGst * this.hecsRate;
    const netAmount = incomeExGst - taxAmount - superAmount - hecsAmount;
    return {
      incomeExGst,
      incomeIncGst,
      gstAmount,
      taxAmount,
      superAmount,
      hecsAmount,
      netAmount,
    };
  }

  static isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
  }

  static async countWorkingDays(startDate, endDate, state) {
    if (!(startDate instanceof Date) || !(endDate instanceof Date)) return 0;
    const key = `${startDate.toISOString()}_${endDate.toISOString()}_${state}`;
    if (!this._cache) this._cache = {};
    if (this._cache[key] !== undefined) return this._cache[key];
    const years = new Set();
    for (
      let d = new Date(startDate);
      d <= endDate;
      d.setDate(d.getDate() + 1)
    ) {
      years.add(d.getFullYear());
    }
    const holidaySet = new Set();
    for (const y of years) {
      const holidays = await HolidayService.getHolidays(y, state);
      holidays.forEach((h) => holidaySet.add(h));
    }
    let count = 0;
    for (
      let d = new Date(startDate);
      d <= endDate;
      d.setDate(d.getDate() + 1)
    ) {
      const iso = d.toISOString().slice(0, 10);
      if (!this.isWeekend(d) && !holidaySet.has(iso)) {
        count++;
      }
    }
    this._cache[key] = count;
    return count;
  }
}

(function () {
  function formatMoney(value) {
    return value.toFixed(2);
  }

  const resultsDiv = document.getElementById("results");
  const errorDiv = document.getElementById("error");
  const rateInput = document.getElementById("rate");
  const rateTypeSelect = document.getElementById("rateType");
  const hoursPerDayInput = document.getElementById("hoursPerDay");
  const holidayInput = document.getElementById("holidayDays");
  const furloughContainer = document.getElementById("furloughContainer");
  const superInput = document.getElementById("superRate");
  const hecsInput = document.getElementById("hecsRate");
  const hasHecsCheckbox = document.getElementById("hasHecs");
  const hecsSection = document.getElementById("hecsSection");
  const riNetInput = document.getElementById("riNet");
  const riFringeInput = document.getElementById("riFringe");
  const riSuperInput = document.getElementById("riSuper");
  const riExemptInput = document.getElementById("riExempt");
  const riRow = document.getElementById("riRow");
  const riValue = document.getElementById("riValue");
  const riSuperNote = document.getElementById("riSuperNote");
  const invoiceFreqSelect = document.getElementById("invoiceFreq");
  const invoiceDayInput = document.getElementById("invoiceDay");
  const invoiceDayGroup = document.getElementById("invoiceDayGroup");
  const ledgerModal = document.getElementById("ledgerModal");
  const ledgerAccountsDiv = document.getElementById("ledgerAccounts");
  const closeLedgerFooterBtn = document.getElementById("closeLedgerFooter");
  const copyLedgerBtn = document.getElementById("copyLedger");
  const hecsInfoModal = document.getElementById("hecsInfoModal");
  const hecsInfoBtn = document.getElementById("openHecsInfo");
  const closeHecsInfoBtn = document.getElementById("closeHecsInfo");
  const riNetInfoModal = document.getElementById("riNetInfoModal");
  const riNetInfoBtn = document.getElementById("riNetInfoBtn");
  const closeRiNetInfoBtn = document.getElementById("closeRiNetInfo");
  const riFringeInfoModal = document.getElementById("riFringeInfoModal");
  const riFringeInfoBtn = document.getElementById("riFringeInfoBtn");
  const closeRiFringeInfoBtn = document.getElementById("closeRiFringeInfo");
  const riSuperInfoModal = document.getElementById("riSuperInfoModal");
  const riSuperInfoBtn = document.getElementById("riSuperInfoBtn");
  const closeRiSuperInfoBtn = document.getElementById("closeRiSuperInfo");
  const riExemptInfoModal = document.getElementById("riExemptInfoModal");
  const riExemptInfoBtn = document.getElementById("riExemptInfoBtn");
  const closeRiExemptInfoBtn = document.getElementById("closeRiExemptInfo");
  const hecsRateInfoModal = document.getElementById("hecsRateInfoModal");
  const hecsRateInfoBtn = document.getElementById("hecsRateInfoBtn");
  const closeHecsRateInfoBtn = document.getElementById("closeHecsRateInfo");
  if (ledgerModal) ledgerModal.hidden = true;
  if (hecsInfoModal) hecsInfoModal.hidden = true;
  if (riNetInfoModal) riNetInfoModal.hidden = true;
  if (riFringeInfoModal) riFringeInfoModal.hidden = true;
  if (riSuperInfoModal) riSuperInfoModal.hidden = true;
  if (riExemptInfoModal) riExemptInfoModal.hidden = true;
  if (hecsRateInfoModal) hecsRateInfoModal.hidden = true;
  let prevRateType = rateTypeSelect.value;

  document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => {
    new bootstrap.Tooltip(el);
  });

  if (hasHecsCheckbox) {
    hasHecsCheckbox.addEventListener("change", () => {
      hecsSection.style.display = hasHecsCheckbox.checked ? "" : "none";
      if (!hasHecsCheckbox.checked) {
        hecsInput.dataset.userEdited = "";
        hecsInput.value = 0;
      }
      calculate();
    });
  }

  if (hecsInput) {
    hecsInput.addEventListener("input", () => {
      hecsInput.dataset.userEdited = "true";
    });
  }

  const currentRateSpan = document.getElementById("currentRate");
  const changedNetSpan = document.getElementById("changedNet");
  const rateChangePercentSpan = document.getElementById("rateChangePercent");
  const rateChangeDiv = document.getElementById("rateChange");

  let baseRate = 0;
  let baseRateType = "daily";
  let baseHoursPerDay = 7.2;
  let currentRate = 0;
  let baseWorkingDays = 0;
  let otherRates = {};

  function convertRate(value, from, to, hours) {
    if (isNaN(value)) return 0;
    const hoursPerDay =
      hours !== undefined ? hours : parseFloat(hoursPerDayInput.value) || 7.2;
    const hoursPerWeek = hoursPerDay * 5;
    let hourly;
    switch (from) {
      case "hourly":
        hourly = value;
        break;
      case "daily":
        hourly = value / hoursPerDay;
        break;
      case "weekly":
        hourly = value / hoursPerWeek;
        break;
    }
    switch (to) {
      case "hourly":
        return hourly;
      case "daily":
        return hourly * hoursPerDay;
      case "weekly":
        return hourly * hoursPerWeek;
    }
    return value;
  }

  function addFurloughRow() {
    const div = document.createElement("div");
    div.className = "furlough-period";
    div.innerHTML = `<input type="date" class="furlough-start" data-bs-toggle="tooltip" title="Unpaid break start"><input type="date" class="furlough-end" data-bs-toggle="tooltip" title="Unpaid break end"><button type="button" class="remove-furlough">Remove</button>`;
    furloughContainer.insertBefore(div, document.getElementById("addFurlough"));
  }

  furloughContainer.addEventListener("click", function (e) {
    if (e.target.classList.contains("remove-furlough")) {
      e.target.parentElement.remove();
      calculate();
    }
  });
  furloughContainer.addEventListener("input", function (e) {
    if (
      e.target.classList.contains("furlough-start") ||
      e.target.classList.contains("furlough-end")
    ) {
      calculate();
    }
  });
  document.getElementById("addFurlough").addEventListener("click", function () {
    addFurloughRow();
  });

  rateTypeSelect.addEventListener("change", function () {
    const val = parseFloat(rateInput.value) || 0;
    const newVal = convertRate(val, prevRateType, rateTypeSelect.value);
    rateInput.value = newVal.toFixed(2);
    prevRateType = rateTypeSelect.value;
    calculate();
  });

  invoiceFreqSelect.addEventListener("change", function () {
    invoiceDayGroup.style.display =
      invoiceFreqSelect.value === "monthly" ? "" : "none";
  });

  function attachAutoCalc(id) {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", calculate);
  }

  function updateRepaymentIncome(taxable, fy, superRate) {
    if (!hasHecsCheckbox || !hasHecsCheckbox.checked) return 0;
    const net = parseFloat(riNetInput.value) || 0;
    const fringe = parseFloat(riFringeInput.value) || 0;
    const additional = parseFloat(riSuperInput.value) || 0;
    const included = taxable * superRate;
    const exempt = parseFloat(riExemptInput.value) || 0;
    const total = taxable + net + fringe + included + additional + exempt;
    const rate = AusTaxBrackets.hecsRate(total, fy) * 100;
    if (!hecsInput.dataset.userEdited) {
      hecsInput.value = rate.toFixed(2);
    }
    if (riRow) riRow.style.display = "";
    if (riValue) riValue.textContent = "$" + formatMoney(total);
    if (riSuperNote) {
      const displayAmount = included * (1 + superRate);
      if (displayAmount > 0) {
        riSuperNote.textContent = `Repayment income already includes $${formatMoney(displayAmount)} from employer super`;
        riSuperNote.hidden = false;
      } else {
        riSuperNote.textContent = "";
        riSuperNote.hidden = true;
      }
    }
    return total;
  }

  function updateRateChangeUI() {
    if (!rateChangeDiv) return;
    currentRateSpan.textContent = "$" + formatMoney(currentRate);
    const daily = convertRate(
      currentRate,
      baseRateType,
      "daily",
      baseHoursPerDay,
    );
    const calc = new PayCalculator(
      daily,
      otherRates.collectGst ? 0.1 : 0,
      otherRates.taxRate,
      otherRates.superRate,
      otherRates.hecsRate,
    );
    const { netAmount } = calc.calculate(baseWorkingDays);
    changedNetSpan.textContent = formatMoney(netAmount);
    const pct = baseRate ? ((currentRate - baseRate) / baseRate) * 100 : 0;
    rateChangePercentSpan.textContent = pct.toFixed(1);
  }

  function generateExplanation(data) {
    const expEl = document.getElementById("resultExplanation");
    if (!expEl) return;
    const sections = [];
    const inv = [];
    inv.push(
      `<p>Total invoice <strong>$${formatMoney(data.incomeIncGst)}</strong></p>`,
    );
    if (data.gstAmount > 0) {
      inv.push(
        `<p>GST portion $${formatMoney(data.gstAmount)} (not yours to keep)</p>`,
      );
    }
    sections.push(
      `<section class="explanation-section invoice-summary"><h3>🧾 Invoice Summary</h3>${inv.join(
        "",
      )}</section>`,
    );

    const taxParts = [];
    taxParts.push(
      `<p>Income tax to set aside <strong>$${formatMoney(data.taxAmount)}</strong></p>`,
    );
    if (data.hecsAmount > 0) {
      taxParts.push(
        `<p>HECS repayment about $${formatMoney(data.hecsAmount)}</p>`,
      );
    }
    sections.push(
      `<section class="explanation-section tax-breakdown"><h3>💸 Tax Breakdown</h3>${taxParts.join(
        "",
      )}</section>`,
    );

    if (data.superAmount > 0) {
      sections.push(
        `<section class="explanation-section super"><h3>🏦 Superannuation</h3><p>Set aside <strong>$${formatMoney(
          data.superAmount,
        )}</strong> for retirement</p></section>`,
      );
    }

    sections.push(
      `<section class="explanation-section take-home"><h3>💰 Take‑home Pay</h3><p class="amount">$${formatMoney(
        data.netAmount,
      )}</p></section>`,
    );

    if (data.fteSalary) {
      const ann = [];
      if (data.superRate > 0) {
        ann.push(
          `<p><strong>Total package</strong> $${formatMoney(data.ftePackage)}</p>`,
        );
        ann.push(
          `<p>Package without super $${formatMoney(data.fteSalary)}</p>`,
        );
      } else {
        ann.push(
          `<p><strong>Total package</strong> $${formatMoney(data.fteSalary)}</p>`,
        );
      }
      ann.push(
        `<p>Less PAYG tax about $${formatMoney(
          data.fteTax,
        )} (assumes first employer & includes Medicare levy)</p>`,
      );
      if (data.hecsRate > 0 && Number.isFinite(data.fteHecs)) {
        ann.push(`<p>Less HECS/HELP about $${formatMoney(data.fteHecs)}</p>`);
      }
      ann.push(
        `<p><strong>Annual take‑home about $${formatMoney(data.fteNet)}</strong></p>`,
      );
      if (data.invoiceFreq) {
        const div = { weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4 }[
          data.invoiceFreq
        ];
        if (div) {
          const label = {
            weekly: "Weekly",
            fortnightly: "Fortnightly",
            monthly: "Monthly",
            quarterly: "Quarterly",
          }[data.invoiceFreq];
          ann.push(`<p>${label} about $${formatMoney(data.fteNet / div)}</p>`);
        }
      }
      ann.push(
        `<div class="fte-explainer"><p>Your invoice rate covers costs an employer normally pays on top of salary, including superannuation, payroll tax, workers' compensation and paid leave. For this reason, a contract rate doesn't convert 1:1 into a permanent package.</p><p>Charging $${formatMoney(
          data.rate,
        )} per ${data.rateType} all year invoices about $${formatMoney(
          data.fteAnnualised,
        )}, which our formula converts to a salary package around $${formatMoney(
          data.ftePackage,
        )}.</p></div>`,
      );
      sections.push(
        `<section class="explanation-section annual"><h3>📈 Full‑Time Equivalent</h3>${ann.join(
          "",
        )}</section>`,
      );
    }

    expEl.innerHTML = sections.join("");
  }

  function adjustRate(delta) {
    currentRate += delta;
    updateRateChangeUI();
  }

  function adjustRatePercent(percent) {
    const delta = baseRate * (percent / 100);
    adjustRate(delta);
  }

  [
    "rate",
    "collectGst",
    "taxRate",
    "superRate",
    "hecsRate",
    "hasHecs",
    "riNet",
    "riFringe",
    "riSuper",
    "riExempt",
    "startDate",
    "endDate",
    "state",
    "holidayDays",
    "hoursPerDay",
  ].forEach(attachAutoCalc);

  async function calculate() {
    const rate = parseFloat(rateInput.value) || 0;
    const dailyRate = convertRate(rate, rateTypeSelect.value, "daily");
    const gstRate = document.getElementById("collectGst").checked ? 0.1 : 0;
    const taxRate =
      parseFloat(document.getElementById("taxRate").value) / 100 || 0;
    const superRate = parseFloat(superInput.value) / 100 || 0;
    let hecsRate = 0;
    const startDateVal = document.getElementById("startDate").value;
    const endDateVal = document.getElementById("endDate").value;
    const state = document.getElementById("state").value;
    errorDiv.textContent = "";
    errorDiv.hidden = true;
    let workingDays = 0;
    let furloughDays = 0;
    if (startDateVal && endDateVal && state) {
      const startDate = new Date(startDateVal);
      const endDate = new Date(endDateVal);
      if (startDate > endDate) {
        errorDiv.textContent = "Start date must be before end date.";
        errorDiv.hidden = false;
        resultsDiv.hidden = true;
        return;
      }
      workingDays = await PayCalculator.countWorkingDays(
        startDate,
        endDate,
        state,
      );

      const holidayDays = parseInt(holidayInput.value) || 0;
      workingDays -= holidayDays;

      const periods = furloughContainer.querySelectorAll(".furlough-period");
      for (const p of periods) {
        const fs = p.querySelector(".furlough-start").value;
        const fe = p.querySelector(".furlough-end").value;
        if (fs && fe) {
          const start = new Date(fs);
          const end = new Date(fe);
          if (start > end) {
            errorDiv.textContent = "Furlough start must be before end.";
            errorDiv.hidden = false;
            resultsDiv.hidden = true;
            return;
          }
          if (start < startDate || end > endDate) {
            errorDiv.textContent =
              "Furlough period must be within contract dates.";
            errorDiv.hidden = false;
            resultsDiv.hidden = true;
            return;
          }
          const days = await PayCalculator.countWorkingDays(start, end, state);
          furloughDays += days;
          workingDays -= days;
        }
      }
    }
    if (workingDays < 0) workingDays = 0;
    document.getElementById("workingDays").value = workingDays;

    const fyDate = startDateVal ? new Date(startDateVal) : new Date();
    const fyStart =
      fyDate.getMonth() >= 6 ? fyDate.getFullYear() : fyDate.getFullYear() - 1;
    const fy = `${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")}`;

    const hoursPerDay = parseFloat(hoursPerDayInput.value) || 7.2;
    let fteSalary = 0;
    let ftePackage = 0;
    let fteAnnualised = 0;
    let fteMultiplier = 0;
    let fteSuper = 0;
    let fteTax = 0;
    if (startDateVal && endDateVal && workingDays > 0) {
      const fteInput = {
        rate: rate,
        rateType: rateTypeSelect.value,
        startDate: startDateVal,
        endDate: endDateVal,
        workingDays:
          workingDays + (parseInt(holidayInput.value) || 0) + furloughDays,
        holidayDays: parseInt(holidayInput.value) || 0,
        furloughDays,
        hoursPerDay,
        state,
      };
      const res = FteConversion.convert(fteInput, true);
      fteSalary = res.baseSalary;
      ftePackage = res.totalPackage;
      fteAnnualised = res.annualisedContractorCost;
      fteMultiplier = res.multiplier;
      fteSuper = res.superAmount;
      fteTax = (res.payg || 0) + (res.medicare || 0);
    }
    const taxableIncome = fteSalary;
    if (hasHecsCheckbox && hasHecsCheckbox.checked) {
      updateRepaymentIncome(taxableIncome, fy, superRate);
      hecsRate = parseFloat(hecsInput.value) / 100 || 0;
    } else {
      hecsRate = 0;
      if (riRow) riRow.style.display = "none";
    }

    const calc = new PayCalculator(
      dailyRate,
      gstRate,
      taxRate,
      superRate,
      hecsRate,
    );
    const {
      incomeExGst,
      incomeIncGst,
      gstAmount,
      taxAmount,
      superAmount,
      hecsAmount,
      netAmount,
    } = calc.calculate(workingDays);

    const incomeLabelEl = document.getElementById("incomeLabel");
    const incomeTotalEl = document.getElementById("incomeTotal");
    if (gstRate > 0) {
      incomeLabelEl.textContent = "Total income (inc GST)";
      incomeTotalEl.textContent = "$" + formatMoney(incomeIncGst);
    } else {
      incomeLabelEl.textContent = "Total income (ex GST)";
      incomeTotalEl.textContent = "$" + formatMoney(incomeExGst);
    }
    document.getElementById("gstAmount").textContent =
      "$" + formatMoney(gstAmount);
    document.getElementById("taxAmount").textContent =
      "$" + formatMoney(taxAmount);
    document.getElementById("superAmount").textContent =
      "$" + formatMoney(superAmount);
    document.getElementById("hecsAmount").textContent =
      "$" + formatMoney(hecsAmount);
    document.getElementById("netAmount").textContent =
      "$" + formatMoney(netAmount);
    document.getElementById("totalFurloughDays").textContent = furloughDays;
    const hoursPerDay = parseFloat(hoursPerDayInput.value) || 7.2;
    document.getElementById("totalHours").textContent = formatMoney(
      workingDays * hoursPerDay,
    );

    resultsDiv.hidden = false;

    baseRate = rate;
    baseRateType = rateTypeSelect.value;
    baseHoursPerDay = parseFloat(hoursPerDayInput.value) || 7.2;
    currentRate = baseRate;
    baseWorkingDays = workingDays;
    otherRates = { collectGst: gstRate > 0, taxRate, superRate, hecsRate };
    const fteHecs = fteSalary * hecsRate;
    const fteNet = fteSalary - fteTax - fteHecs;

    updateRateChangeUI();
    generateExplanation({
      incomeIncGst,
      gstAmount,
      taxAmount,
      superAmount,
      hecsAmount,
      netAmount,
      fteSalary,
      ftePackage,
      fteAnnualised,
      fteMultiplier,
      fteTax,
      fteHecs,
      fteNet,
      invoiceFreq: invoiceFreqSelect.value,
      superRate,
      hecsRate,
      rate,
      rateType: rateTypeSelect.value,
    });
  }

  function collectFormData() {
    const periods = [];
    furloughContainer.querySelectorAll(".furlough-period").forEach((p) => {
      periods.push({
        start: p.querySelector(".furlough-start").value,
        end: p.querySelector(".furlough-end").value,
      });
    });
    return {
      rate: rateInput.value,
      rateType: rateTypeSelect.value,
      startDate: document.getElementById("startDate").value,
      endDate: document.getElementById("endDate").value,
      state: document.getElementById("state").value,
      holidayDays: holidayInput.value,
      collectGst: document.getElementById("collectGst").checked,
      taxRate: document.getElementById("taxRate").value,
      superRate: superInput.value,
      hecsRate: hecsInput.value,
      hasHecs: hasHecsCheckbox.checked,
      riNet: riNetInput.value,
      riFringe: riFringeInput.value,
      riSuper: riSuperInput.value,
      riExempt: riExemptInput.value,
      hoursPerDay: hoursPerDayInput.value,
      invoiceFreq: invoiceFreqSelect.value,
      invoiceDay: invoiceDayInput.value,
      furlough: periods,
    };
  }

  function populateForm(data) {
    if (!data) return;
    rateInput.value = data.rate || "";
    rateTypeSelect.value = data.rateType || "daily";
    prevRateType = rateTypeSelect.value;
    document.getElementById("startDate").value = data.startDate || "";
    document.getElementById("endDate").value = data.endDate || "";
    document.getElementById("state").value = data.state || "ACT";
    holidayInput.value = data.holidayDays || 0;
    document.getElementById("collectGst").checked = data.collectGst !== false;
    document.getElementById("taxRate").value = data.taxRate || 30;
    superInput.value = data.superRate || 12;
    hecsInput.value = data.hecsRate || 0;
    hasHecsCheckbox.checked = !!data.hasHecs;
    hecsSection.style.display = hasHecsCheckbox.checked ? "" : "none";
    riNetInput.value = data.riNet || 0;
    riFringeInput.value = data.riFringe || 0;
    riSuperInput.value = data.riSuper || 0;
    riExemptInput.value = data.riExempt || 0;
    hoursPerDayInput.value = data.hoursPerDay || 7.2;
    invoiceFreqSelect.value = data.invoiceFreq || "weekly";
    invoiceDayInput.value = data.invoiceDay || 1;
    invoiceDayGroup.style.display =
      invoiceFreqSelect.value === "monthly" ? "" : "none";
    furloughContainer
      .querySelectorAll(".furlough-period")
      .forEach((p) => p.remove());
    if (Array.isArray(data.furlough)) {
      data.furlough.forEach((per) => {
        addFurloughRow();
        const row = furloughContainer.querySelectorAll(".furlough-period");
        const div = row[row.length - 1];
        div.querySelector(".furlough-start").value = per.start || "";
        div.querySelector(".furlough-end").value = per.end || "";
      });
    }
  }

  async function createLedger() {
    await calculate();
    const freq = invoiceFreqSelect.value;
    const invoiceDay = parseInt(invoiceDayInput.value) || 1;
    const rate = parseFloat(rateInput.value) || 0;
    const dailyRate = convertRate(rate, rateTypeSelect.value, "daily");
    const gstRate = document.getElementById("collectGst").checked ? 0.1 : 0;
    const taxRate =
      parseFloat(document.getElementById("taxRate").value) / 100 || 0;
    const superRate = parseFloat(superInput.value) / 100 || 0;
    const hecsRate = parseFloat(hecsInput.value) / 100 || 0;
    const startDateVal = document.getElementById("startDate").value;
    const endDateVal = document.getElementById("endDate").value;
    const state = document.getElementById("state").value;
    if (!startDateVal || !endDateVal || !state) return;
    const startDate = new Date(startDateVal);
    const endDate = new Date(endDateVal);
    const calc = new PayCalculator(
      dailyRate,
      gstRate,
      taxRate,
      superRate,
      hecsRate,
    );
    const totals = calc.calculate(baseWorkingDays);

    let currentStart = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      1,
    );

    // Build account ledgers
    if (ledgerAccountsDiv) ledgerAccountsDiv.innerHTML = "";
    const accounts = {
      "Accounts Receivable": [],
      "Income (Sales)": [],
      "GST Liability": [],
      "Super Liability": [],
      "Super Expense": [],
      "HECS Liability": [],
      "HECS Expense": [],
      "Income Tax Liability": [],
      "Income Tax Expense": [],
      "Bank Account": [],
    };

    let superAccrued = 0;
    let hecsAccrued = 0;
    while (currentStart <= endDate) {
      const workingDays = await PayCalculator.countWorkingDays(
        new Date(currentStart),
        new Date(currentStart.getFullYear(), currentStart.getMonth() + 1, 0),
        state,
      );
      const result = calc.calculate(workingDays);
      const invoiceDate = new Date(
        currentStart.getFullYear(),
        currentStart.getMonth(),
        1,
      );
      const paymentDate = new Date(
        currentStart.getFullYear(),
        currentStart.getMonth(),
        15,
      );
      const gstPayDate = new Date(
        currentStart.getFullYear(),
        currentStart.getMonth(),
        21,
      );
      const accrueDate = new Date(
        currentStart.getFullYear(),
        currentStart.getMonth(),
        20,
      );

      accounts["Accounts Receivable"].push({
        date: invoiceDate,
        desc: "Invoice to Client (Incl. GST)",
        debit: result.incomeIncGst,
        credit: 0,
      });
      accounts["Accounts Receivable"].push({
        date: paymentDate,
        desc: "Payment Received",
        debit: 0,
        credit: result.incomeIncGst,
      });

      accounts["Income (Sales)"].push({
        date: invoiceDate,
        desc: "Sales Income (Excl. GST)",
        debit: 0,
        credit: result.incomeExGst,
      });

      accounts["GST Liability"].push({
        date: invoiceDate,
        desc: "GST Collected",
        debit: 0,
        credit: result.gstAmount,
      });
      accounts["GST Liability"].push({
        date: gstPayDate,
        desc: "GST Payment to ATO",
        debit: result.gstAmount,
        credit: 0,
      });

      accounts["Bank Account"].push({
        date: paymentDate,
        desc: "Payment Received from Client",
        debit: result.incomeIncGst,
        credit: 0,
      });
      accounts["Bank Account"].push({
        date: gstPayDate,
        desc: "GST Payment",
        debit: 0,
        credit: result.gstAmount,
      });

      accounts["Super Liability"].push({
        date: accrueDate,
        desc: "Super Liability Accrued",
        debit: 0,
        credit: result.superAmount,
      });
      accounts["Super Expense"].push({
        date: accrueDate,
        desc: "Superannuation Expense",
        debit: result.superAmount,
        credit: 0,
      });
      superAccrued += result.superAmount;
      if ((currentStart.getMonth() + 1) % 3 === 0) {
        accounts["Super Liability"].push({
          date: accrueDate,
          desc: "Transfer to Super Fund",
          debit: superAccrued,
          credit: 0,
        });
        accounts["Bank Account"].push({
          date: accrueDate,
          desc: "Super Contribution Transfer",
          debit: 0,
          credit: superAccrued,
        });
        superAccrued = 0;
      }

      accounts["HECS Liability"].push({
        date: accrueDate,
        desc: "HECS Liability Accrued",
        debit: 0,
        credit: result.hecsAmount,
      });
      accounts["HECS Expense"].push({
        date: accrueDate,
        desc: "HECS Expense",
        debit: result.hecsAmount,
        credit: 0,
      });
      hecsAccrued += result.hecsAmount;

      currentStart.setMonth(currentStart.getMonth() + 1);
    }

    const yearEnd = new Date(endDate.getFullYear(), 5, 30); // 30 June
    accounts["HECS Liability"].push({
      date: yearEnd,
      desc: "Payment to ATO (HECS repayment)",
      debit: hecsAccrued,
      credit: 0,
    });
    accounts["Bank Account"].push({
      date: yearEnd,
      desc: "HECS Payment",
      debit: 0,
      credit: hecsAccrued,
    });

    accounts["Income Tax Liability"].push({
      date: yearEnd,
      desc: "Income Tax Accrued",
      debit: 0,
      credit: totals.taxAmount,
    });
    accounts["Income Tax Expense"].push({
      date: yearEnd,
      desc: "Income Tax Expense",
      debit: totals.taxAmount,
      credit: 0,
    });
    accounts["Income Tax Liability"].push({
      date: yearEnd,
      desc: "Payment of Income Tax to ATO",
      debit: totals.taxAmount,
      credit: 0,
    });
    accounts["Bank Account"].push({
      date: yearEnd,
      desc: "Income Tax Payment",
      debit: 0,
      credit: totals.taxAmount,
    });

    for (const [name, entries] of Object.entries(accounts)) {
      let bal = 0;
      const table = document.createElement("table");
      table.className = "account-table";
      let html =
        `<thead><tr><th colspan="5">${name}</th></tr>` +
        "<tr><th>Date</th><th>Description</th><th>Debit ($)</th><th>Credit ($)</th><th>Balance ($)</th></tr></thead><tbody>";
      entries
        .sort((a, b) => a.date - b.date)
        .forEach((e) => {
          bal += e.debit - e.credit;
          html +=
            `<tr><td>${e.date.toISOString().slice(0, 10)}</td><td>${e.desc}</td>` +
            `<td>${e.debit ? formatMoney(e.debit) : ""}</td>` +
            `<td>${e.credit ? formatMoney(e.credit) : ""}</td>` +
            `<td>${formatMoney(bal)}</td></tr>`;
        });
      html += "</tbody>";
      table.innerHTML = html;
      ledgerAccountsDiv.appendChild(table);
    }

    ledgerModal.hidden = false;
  }

  async function copyShareLink() {
    await calculate();
    const data = collectFormData();
    const encoded = encodeURIComponent(btoa(JSON.stringify(data)));
    const url = `${location.origin}${location.pathname}?link=${encoded}`;
    const displayUrl = `${location.origin}${location.pathname}`;
    const net = document.getElementById("netAmount").textContent || "0";
    const plain = `I've used a contractor income calculator to calculate approximately ${net} should be banked for the period ${data.startDate} to ${data.endDate} @ $${data.rate}/${data.rateType}. ${url}`;
    const html = `<p>I've used a <strong>contractor income calculator</strong> to calculate approximately <strong>${net}</strong> should be banked for the period <strong>${data.startDate}</strong> to <strong>${data.endDate}</strong> @ <strong>$${data.rate}/${data.rateType}</strong>. <a href="${url}">${displayUrl}</a></p>`;
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const item = new ClipboardItem({
          "text/plain": new Blob([plain], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        });
        await navigator.clipboard.write([item]);
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(html);
      }
      alert("Share link copied to clipboard");
    } catch (e) {
      console.error("Clipboard copy failed", e);
    }
  }

  async function copyLedger() {
    if (!ledgerAccountsDiv) return;
    const html = ledgerAccountsDiv.innerHTML;
    const plain = ledgerAccountsDiv.innerText;
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const item = new ClipboardItem({
          "text/plain": new Blob([plain], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        });
        await navigator.clipboard.write([item]);
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(html);
      }
      alert("Ledger copied to clipboard");
    } catch (e) {
      console.error("Clipboard copy failed", e);
    }
  }

  const params = new URLSearchParams(location.search);
  if (params.has("link")) {
    try {
      const decoded = JSON.parse(atob(decodeURIComponent(params.get("link"))));
      populateForm(decoded);
      calculate();
    } catch (e) {
      console.error("Invalid share link", e);
    }
  }

  const startInput = document.getElementById("startDate");
  const endInput = document.getElementById("endDate");
  const today = new Date();
  const fyYear =
    today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
  const fyStart = new Date(fyYear, 6, 1);
  const fyEnd = new Date(fyYear + 1, 5, 30);
  if (!startInput.value) startInput.value = fyStart.toISOString().slice(0, 10);
  if (!endInput.value) endInput.value = fyEnd.toISOString().slice(0, 10);

  document.getElementById("calculate").addEventListener("click", calculate);
  const copyBtn = document.getElementById("copyLink");
  if (copyBtn) copyBtn.addEventListener("click", copyShareLink);
  const ledgerBtn = document.getElementById("createLedger");
  if (ledgerBtn) ledgerBtn.addEventListener("click", createLedger);
  if (copyLedgerBtn) copyLedgerBtn.addEventListener("click", copyLedger);
  const closeLedgerBtn = document.getElementById("closeLedger");
  if (closeLedgerBtn)
    closeLedgerBtn.addEventListener("click", () => (ledgerModal.hidden = true));
  if (closeLedgerFooterBtn)
    closeLedgerFooterBtn.addEventListener(
      "click",
      () => (ledgerModal.hidden = true),
    );
  if (ledgerModal)
    ledgerModal.addEventListener("click", function (e) {
      if (e.target === ledgerModal) ledgerModal.hidden = true;
    });
  if (hecsInfoBtn)
    hecsInfoBtn.addEventListener("click", () => (hecsInfoModal.hidden = false));
  if (closeHecsInfoBtn)
    closeHecsInfoBtn.addEventListener(
      "click",
      () => (hecsInfoModal.hidden = true),
    );
  if (hecsInfoModal)
    hecsInfoModal.addEventListener("click", function (e) {
      if (e.target === hecsInfoModal) hecsInfoModal.hidden = true;
    });
  if (riNetInfoBtn)
    riNetInfoBtn.addEventListener(
      "click",
      () => (riNetInfoModal.hidden = false),
    );
  if (closeRiNetInfoBtn)
    closeRiNetInfoBtn.addEventListener(
      "click",
      () => (riNetInfoModal.hidden = true),
    );
  if (riNetInfoModal)
    riNetInfoModal.addEventListener("click", (e) => {
      if (e.target === riNetInfoModal) riNetInfoModal.hidden = true;
    });
  if (riFringeInfoBtn)
    riFringeInfoBtn.addEventListener(
      "click",
      () => (riFringeInfoModal.hidden = false),
    );
  if (closeRiFringeInfoBtn)
    closeRiFringeInfoBtn.addEventListener(
      "click",
      () => (riFringeInfoModal.hidden = true),
    );
  if (riFringeInfoModal)
    riFringeInfoModal.addEventListener("click", (e) => {
      if (e.target === riFringeInfoModal) riFringeInfoModal.hidden = true;
    });
  if (riSuperInfoBtn)
    riSuperInfoBtn.addEventListener(
      "click",
      () => (riSuperInfoModal.hidden = false),
    );
  if (closeRiSuperInfoBtn)
    closeRiSuperInfoBtn.addEventListener(
      "click",
      () => (riSuperInfoModal.hidden = true),
    );
  if (riSuperInfoModal)
    riSuperInfoModal.addEventListener("click", (e) => {
      if (e.target === riSuperInfoModal) riSuperInfoModal.hidden = true;
    });
  if (riExemptInfoBtn)
    riExemptInfoBtn.addEventListener(
      "click",
      () => (riExemptInfoModal.hidden = false),
    );
  if (closeRiExemptInfoBtn)
    closeRiExemptInfoBtn.addEventListener(
      "click",
      () => (riExemptInfoModal.hidden = true),
    );
  if (riExemptInfoModal)
    riExemptInfoModal.addEventListener("click", (e) => {
      if (e.target === riExemptInfoModal) riExemptInfoModal.hidden = true;
    });
  if (hecsRateInfoBtn)
    hecsRateInfoBtn.addEventListener(
      "click",
      () => (hecsRateInfoModal.hidden = false),
    );
  if (closeHecsRateInfoBtn)
    closeHecsRateInfoBtn.addEventListener(
      "click",
      () => (hecsRateInfoModal.hidden = true),
    );
  if (hecsRateInfoModal)
    hecsRateInfoModal.addEventListener("click", (e) => {
      if (e.target === hecsRateInfoModal) hecsRateInfoModal.hidden = true;
    });
  if (rateChangeDiv) {
    rateChangeDiv.addEventListener("click", function (e) {
      if (e.target.dataset) {
        if (e.target.dataset.inc) {
          adjustRate(parseFloat(e.target.dataset.inc));
        } else if (e.target.dataset.pct) {
          adjustRatePercent(parseFloat(e.target.dataset.pct));
        }
      }
    });
  }
  invoiceFreqSelect.dispatchEvent(new Event("change"));
  calculate();
})();
