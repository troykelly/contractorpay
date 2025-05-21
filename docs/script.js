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

    static async fetchHolidays(year, state) {
        const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/AU`);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        return data
            .filter(h => !h.counties || h.counties.includes(`AU-${state}`))
            .map(h => h.date);
    }

    static async getHolidays(year, state) {
        try {
            return await this.fetchHolidays(year, state);
        } catch (e) {
            const fallback = (this.FALLBACK_HOLIDAYS[year] || {})[state];
            return fallback || [];
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
        return count;
    }
}

(function() {
    function formatMoney(value) {
        return value.toFixed(2);
    }

    const calculateBtn = document.getElementById('calculate');
    const resultsDiv = document.getElementById('results');

    calculateBtn.addEventListener('click', async function() {
        const dailyRate = parseFloat(document.getElementById('dailyRate').value) || 0;
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
        }
        document.getElementById('workingDays').value = workingDays;

        const calc = new PayCalculator(dailyRate, gstRate, taxRate);
        const { incomeExGst, gstAmount, taxAmount, netAmount } = calc.calculate(workingDays);

        document.getElementById('incomeExGst').textContent = formatMoney(incomeExGst);
        document.getElementById('gstAmount').textContent = formatMoney(gstAmount);
        document.getElementById('taxAmount').textContent = formatMoney(taxAmount);
        document.getElementById('netAmount').textContent = formatMoney(netAmount);

        resultsDiv.hidden = false;
    });
})();
