class HolidayService {
    static FALLBACK_HOLIDAYS = {
        2024: {
            ACT: ['2024-01-01','2024-01-26','2024-03-29','2024-04-01','2024-04-25','2024-06-10','2024-12-25','2024-12-26'],
            NSW: ['2024-01-01','2024-01-26','2024-03-29','2024-04-01','2024-04-25','2024-06-10','2024-10-07','2024-12-25','2024-12-26'],
            NT:  ['2024-01-01','2024-01-26','2024-03-29','2024-04-01','2024-04-25','2024-05-06','2024-12-25','2024-12-26'],
            QLD: ['2024-01-01','2024-01-26','2024-03-29','2024-04-01','2024-04-25','2024-05-06','2024-10-07','2024-12-25','2024-12-26'],
            SA:  ['2024-01-01','2024-01-26','2024-03-29','2024-04-01','2024-04-25','2024-06-10','2024-10-07','2024-12-25','2024-12-26'],
            TAS: ['2024-01-01','2024-01-26','2024-03-29','2024-04-01','2024-04-25','2024-06-10','2024-12-25','2024-12-26'],
            VIC: ['2024-01-01','2024-01-26','2024-03-29','2024-04-01','2024-04-25','2024-06-10','2024-11-05','2024-12-25','2024-12-26'],
            WA:  ['2024-01-01','2024-01-26','2024-03-29','2024-04-01','2024-04-25','2024-06-03','2024-09-23','2024-12-25','2024-12-26']
        }
    };

    static cache = {};

    static async fetchHolidays(year, state) {
        const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/AU`);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        return data
            .filter(h => !h.counties || h.counties.includes(`AU-${state}`))
            .map(h => h.date);
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

class PayCalculator {
    constructor(dailyRate, gstRate, taxRate) {
        this.dailyRate = dailyRate;
        this.gstRate = gstRate;
        this.taxRate = taxRate;
    }

    calculate(workingDays) {
        const incomeExGst = this.dailyRate * workingDays;
        const gstAmount = incomeExGst * this.gstRate;
        const taxAmount = incomeExGst * this.taxRate;
        const netAmount = incomeExGst - taxAmount;
        return { incomeExGst, gstAmount, taxAmount, netAmount };
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
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            years.add(d.getFullYear());
        }
        const holidaySet = new Set();
        for (const y of years) {
            const holidays = await HolidayService.getHolidays(y, state);
            holidays.forEach(h => holidaySet.add(h));
        }
        let count = 0;
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const iso = d.toISOString().slice(0, 10);
            if (!this.isWeekend(d) && !holidaySet.has(iso)) {
                count++;
            }
        }
        this._cache[key] = count;
        return count;
    }
}

(function() {
    function formatMoney(value) {
        return value.toFixed(2);
    }

    const resultsDiv = document.getElementById('results');
    const rateInput = document.getElementById('rate');
    const rateTypeSelect = document.getElementById('rateType');
    const hoursPerDayInput = document.getElementById('hoursPerDay');
    const holidayInput = document.getElementById('holidayDays');
    const furloughContainer = document.getElementById('furloughContainer');
    let prevRateType = rateTypeSelect.value;

    function convertRate(value, from, to) {
        if (isNaN(value)) return 0;
        const hoursPerDay = parseFloat(hoursPerDayInput.value) || 7.2;
        const hoursPerWeek = hoursPerDay * 5;
        let hourly;
        switch (from) {
            case 'hourly': hourly = value; break;
            case 'daily': hourly = value / hoursPerDay; break;
            case 'weekly': hourly = value / hoursPerWeek; break;
        }
        switch (to) {
            case 'hourly': return hourly;
            case 'daily': return hourly * hoursPerDay;
            case 'weekly': return hourly * hoursPerWeek;
        }
        return value;
    }

    function addFurloughRow() {
        const div = document.createElement('div');
        div.className = 'furlough-period';
        div.innerHTML = `<input type="date" class="furlough-start"><input type="date" class="furlough-end"><button type="button" class="remove-furlough">Remove</button>`;
        furloughContainer.insertBefore(div, document.getElementById('addFurlough'));
    }

    furloughContainer.addEventListener('click', function(e) {
        if (e.target.classList.contains('remove-furlough')) {
            e.target.parentElement.remove();
            calculate();
        }
    });
    document.getElementById('addFurlough').addEventListener('click', function() {
        addFurloughRow();
    });

    rateTypeSelect.addEventListener('change', function() {
        const val = parseFloat(rateInput.value) || 0;
        const newVal = convertRate(val, prevRateType, rateTypeSelect.value);
        rateInput.value = newVal.toFixed(2);
        prevRateType = rateTypeSelect.value;
        calculate();
    });

    function attachAutoCalc(id) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', calculate);
    }

    ['rate','gstRate','taxRate','startDate','endDate','state','holidayDays','hoursPerDay'].forEach(attachAutoCalc);

    async function calculate() {
        const rate = parseFloat(rateInput.value) || 0;
        const dailyRate = convertRate(rate, rateTypeSelect.value, 'daily');
        const gstRate = parseFloat(document.getElementById('gstRate').value) / 100 || 0;
        const taxRate = parseFloat(document.getElementById('taxRate').value) / 100 || 0;
        const startDateVal = document.getElementById('startDate').value;
        const endDateVal = document.getElementById('endDate').value;
        const state = document.getElementById('state').value;
        let workingDays = 0;
        if (startDateVal && endDateVal && state) {
            const startDate = new Date(startDateVal);
            const endDate = new Date(endDateVal);
            workingDays = await PayCalculator.countWorkingDays(startDate, endDate, state);

            const holidayDays = parseInt(holidayInput.value) || 0;
            workingDays -= holidayDays;

            const periods = furloughContainer.querySelectorAll('.furlough-period');
            for (const p of periods) {
                const fs = p.querySelector('.furlough-start').value;
                const fe = p.querySelector('.furlough-end').value;
                if (fs && fe) {
                    const start = new Date(fs);
                    const end = new Date(fe);
                    const days = await PayCalculator.countWorkingDays(start, end, state);
                    workingDays -= days;
                }
            }
        }
        if (workingDays < 0) workingDays = 0;
        document.getElementById('workingDays').value = workingDays;

        const calc = new PayCalculator(dailyRate, gstRate, taxRate);
        const { incomeExGst, gstAmount, taxAmount, netAmount } = calc.calculate(workingDays);

        document.getElementById('incomeExGst').textContent = formatMoney(incomeExGst);
        document.getElementById('gstAmount').textContent = formatMoney(gstAmount);
        document.getElementById('taxAmount').textContent = formatMoney(taxAmount);
        document.getElementById('netAmount').textContent = formatMoney(netAmount);

        resultsDiv.hidden = false;
    }

    document.getElementById('calculate').addEventListener('click', calculate);
    calculate();
})();
