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
        const taxAmount = incomeExGst * this.taxRate;
        const superAmount = incomeExGst * this.superRate;
        const hecsAmount = incomeExGst * this.hecsRate;
        const netAmount = incomeExGst - taxAmount - superAmount - hecsAmount;
        return { incomeExGst, gstAmount, taxAmount, superAmount, hecsAmount, netAmount };
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
    const errorDiv = document.getElementById('error');
    const rateInput = document.getElementById('rate');
    const rateTypeSelect = document.getElementById('rateType');
    const hoursPerDayInput = document.getElementById('hoursPerDay');
    const holidayInput = document.getElementById('holidayDays');
    const furloughContainer = document.getElementById('furloughContainer');
    const superInput = document.getElementById('superRate');
    const hecsInput = document.getElementById('hecsRate');
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
    furloughContainer.addEventListener('input', function(e) {
        if (e.target.classList.contains('furlough-start') || e.target.classList.contains('furlough-end')) {
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

    ['rate','gstRate','taxRate','superRate','hecsRate','startDate','endDate','state','holidayDays','hoursPerDay'].forEach(attachAutoCalc);

    async function calculate() {
        const rate = parseFloat(rateInput.value) || 0;
        const dailyRate = convertRate(rate, rateTypeSelect.value, 'daily');
        const gstRate = parseFloat(document.getElementById('gstRate').value) / 100 || 0;
        const taxRate = parseFloat(document.getElementById('taxRate').value) / 100 || 0;
        const superRate = parseFloat(superInput.value) / 100 || 0;
        const hecsRate = parseFloat(hecsInput.value) / 100 || 0;
        const startDateVal = document.getElementById('startDate').value;
        const endDateVal = document.getElementById('endDate').value;
        const state = document.getElementById('state').value;
        errorDiv.textContent = '';
        errorDiv.hidden = true;
        let workingDays = 0;
        let furloughDays = 0;
        if (startDateVal && endDateVal && state) {
            const startDate = new Date(startDateVal);
            const endDate = new Date(endDateVal);
            if (startDate > endDate) {
                errorDiv.textContent = 'Start date must be before end date.';
                errorDiv.hidden = false;
                resultsDiv.hidden = true;
                return;
            }
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
                    if (start > end) {
                        errorDiv.textContent = 'Furlough start must be before end.';
                        errorDiv.hidden = false;
                        resultsDiv.hidden = true;
                        return;
                    }
                    if (start < startDate || end > endDate) {
                        errorDiv.textContent = 'Furlough period must be within contract dates.';
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
        document.getElementById('workingDays').value = workingDays;

        const calc = new PayCalculator(dailyRate, gstRate, taxRate, superRate, hecsRate);
        const { incomeExGst, gstAmount, taxAmount, superAmount, hecsAmount, netAmount } = calc.calculate(workingDays);

        document.getElementById('incomeExGst').textContent = formatMoney(incomeExGst);
        document.getElementById('gstAmount').textContent = formatMoney(gstAmount);
        document.getElementById('taxAmount').textContent = formatMoney(taxAmount);
        document.getElementById('superAmount').textContent = formatMoney(superAmount);
        document.getElementById('hecsAmount').textContent = formatMoney(hecsAmount);
        document.getElementById('netAmount').textContent = formatMoney(netAmount);
        document.getElementById('totalFurloughDays').textContent = furloughDays;
        const hoursPerDay = parseFloat(hoursPerDayInput.value) || 7.2;
        document.getElementById('totalHours').textContent = formatMoney(workingDays * hoursPerDay);

        resultsDiv.hidden = false;
    }

    function collectFormData() {
        const periods = [];
        furloughContainer.querySelectorAll('.furlough-period').forEach(p => {
            periods.push({
                start: p.querySelector('.furlough-start').value,
                end: p.querySelector('.furlough-end').value
            });
        });
        return {
            rate: rateInput.value,
            rateType: rateTypeSelect.value,
            startDate: document.getElementById('startDate').value,
            endDate: document.getElementById('endDate').value,
            state: document.getElementById('state').value,
            holidayDays: holidayInput.value,
            gstRate: document.getElementById('gstRate').value,
            taxRate: document.getElementById('taxRate').value,
            superRate: superInput.value,
            hecsRate: hecsInput.value,
            hoursPerDay: hoursPerDayInput.value,
            furlough: periods
        };
    }

    function populateForm(data) {
        if (!data) return;
        rateInput.value = data.rate || '';
        rateTypeSelect.value = data.rateType || 'daily';
        document.getElementById('startDate').value = data.startDate || '';
        document.getElementById('endDate').value = data.endDate || '';
        document.getElementById('state').value = data.state || 'ACT';
        holidayInput.value = data.holidayDays || 0;
        document.getElementById('gstRate').value = data.gstRate || 10;
        document.getElementById('taxRate').value = data.taxRate || 30;
        superInput.value = data.superRate || 11;
        hecsInput.value = data.hecsRate || 0;
        hoursPerDayInput.value = data.hoursPerDay || 7.2;
        furloughContainer.querySelectorAll('.furlough-period').forEach(p => p.remove());
        if (Array.isArray(data.furlough)) {
            data.furlough.forEach(per => {
                addFurloughRow();
                const row = furloughContainer.querySelectorAll('.furlough-period');
                const div = row[row.length - 1];
                div.querySelector('.furlough-start').value = per.start || '';
                div.querySelector('.furlough-end').value = per.end || '';
            });
        }
    }

    async function copyShareLink() {
        await calculate();
        const data = collectFormData();
        const encoded = encodeURIComponent(btoa(JSON.stringify(data)));
        const url = `${location.origin}${location.pathname}?link=${encoded}`;
        const net = document.getElementById('netAmount').textContent || '0';
        const text = `I've used a contractor income calculator to calculate approximately $${net} should be banked for the period ${data.startDate} to ${data.endDate} @ $${data.rate}/${data.rateType}. ${url}`;
        try {
            await navigator.clipboard.writeText(text);
            alert('Share link copied to clipboard');
        } catch (e) {
            console.error('Clipboard copy failed', e);
        }
    }

    const params = new URLSearchParams(location.search);
    if (params.has('link')) {
        try {
            const decoded = JSON.parse(atob(decodeURIComponent(params.get('link'))));
            populateForm(decoded);
            calculate();
        } catch (e) {
            console.error('Invalid share link', e);
        }
    }

    document.getElementById('calculate').addEventListener('click', calculate);
    const copyBtn = document.getElementById('copyLink');
    if (copyBtn) copyBtn.addEventListener('click', copyShareLink);
    calculate();
})();
