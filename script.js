(function() {
    function formatMoney(value) {
        return value.toFixed(2);
    }

    const calculateBtn = document.getElementById('calculate');
    const resultsDiv = document.getElementById('results');

    calculateBtn.addEventListener('click', function() {
        const dailyRate = parseFloat(document.getElementById('dailyRate').value) || 0;
        const workingDays = parseFloat(document.getElementById('workingDays').value) || 0;
        const gstRate = parseFloat(document.getElementById('gstRate').value) / 100 || 0;
        const taxRate = parseFloat(document.getElementById('taxRate').value) / 100 || 0;

        const incomeExGst = dailyRate * workingDays;
        const gstAmount = incomeExGst * gstRate;
        const taxAmount = incomeExGst * taxRate;
        const netAmount = incomeExGst - taxAmount;

        document.getElementById('incomeExGst').textContent = formatMoney(incomeExGst);
        document.getElementById('gstAmount').textContent = formatMoney(gstAmount);
        document.getElementById('taxAmount').textContent = formatMoney(taxAmount);
        document.getElementById('netAmount').textContent = formatMoney(netAmount);

        resultsDiv.hidden = false;
    });
})();
