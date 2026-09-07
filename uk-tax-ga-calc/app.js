(() => {
  "use strict";

  const BASIC_RATE = 0.20;
  const HIGHER_RATE = 0.40;
  const BASIC_RATE_BAND = 37700;
  const DEFAULT_INCOME = 80000;
  const DEFAULT_TAX_DEDUCTED = 20000;
  const currentDate = new Date();
  const latestYearStart = currentDate.getMonth() >= 3 ? currentDate.getFullYear() - 1 : currentDate.getFullYear() - 2;

  // The standard personal allowance has been £12,570 throughout the four years
  // currently shown. Keeping it in the year data makes future changes explicit.
  const allowanceByYear = {
    "2025/26": 12570,
    "2024/25": 12570,
    "2023/24": 12570,
    "2022/23": 12570
  };

  const years = Array.from({ length: 4 }, (_, index) => {
    const start = latestYearStart - index;
    return `${start}/${String(start + 1).slice(-2)}`;
  });

  const currency = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
  const number = (value) => Number.isFinite(value) ? value : 0;
  const pounds = (value) => currency.format(number(value));
  const inputValue = (id) => Number.parseFloat(document.getElementById(id).value) || 0;

  function calculate(year) {
    const income = Math.max(0, inputValue(`income-${year}`));
    const allowance = Math.max(0, inputValue(`allowance-${year}`));
    const donation = Math.max(0, inputValue(`gift-aid-${year}`));
    const deducted = Math.max(0, inputValue(`deducted-${year}`));
    const earlierUnderpayment = Math.max(0, inputValue(`earlier-underpayment-${year}`));
    const taxableIncome = Math.max(0, income - allowance);
    const giftAidGross = Math.max(0, donation) / (1 - BASIC_RATE);
    const basicRateAmount = Math.min(taxableIncome, BASIC_RATE_BAND + giftAidGross);
    const higherRateAmount = Math.max(0, taxableIncome - basicRateAmount);
    const basicRateTax = basicRateAmount * BASIC_RATE;
    const higherRateTax = higherRateAmount * HIGHER_RATE;
    const calculatedTax = basicRateTax + higherRateTax + earlierUnderpayment;
    const balance = calculatedTax - deducted;

    document.getElementById(`taxable-${year}`).textContent = pounds(taxableIncome);
    document.getElementById(`gift-gross-${year}`).textContent = pounds(giftAidGross);
    document.getElementById(`basic-band-${year}`).textContent = pounds(basicRateAmount);
    document.getElementById(`basic-tax-${year}`).textContent = pounds(basicRateTax);
    document.getElementById(`higher-band-${year}`).textContent = pounds(higherRateAmount);
    document.getElementById(`higher-tax-${year}`).textContent = pounds(higherRateTax);
    document.getElementById(`earlier-${year}`).textContent = pounds(earlierUnderpayment);
    document.getElementById(`calculated-${year}`).textContent = pounds(calculatedTax);

    const total = document.getElementById(`total-${year}`);
    total.textContent = balance < 0 ? `${pounds(Math.abs(balance))} to be returned` : `${pounds(balance)} to be paid`;
    total.className = `result-row total ${balance < 0 ? "negative" : "positive"}`;
    updateSummary(year, balance, {
      taxableIncome,
      giftAidGross,
      basicRateTax,
      higherRateTax,
      earlierUnderpayment,
      calculatedTax
    });
  }

  function row(label, id, extraClass = "") {
    return `<div class="result-row ${extraClass}"><dt>${label}</dt><dd id="${id}">${pounds(0)}</dd></div>`;
  }

  function renderYear(year) {
    const allowance = allowanceByYear[year] || 12570;
    return `
      <article class="year-card tab-panel" id="panel-${year}" role="tabpanel" aria-labelledby="tab-${year}">
        <div class="year-heading">
          <h2>Financial year ${year}</h2>
          <span>Tax year ending 5 April ${year.slice(-2)}</span>
        </div>
        <div class="year-content">
          <div class="inputs">
            <div class="field">
              <label for="income-${year}">Total income from P60</label>
              <div class="money-input"><span>£</span><input id="income-${year}" type="number" min="0" step="0.01" value="${DEFAULT_INCOME}" inputmode="decimal"></div>
            </div>
            <div class="field">
              <label for="allowance-${year}">Personal allowance</label>
              <div class="money-input"><span>£</span><input id="allowance-${year}" type="number" min="0" step="0.01" value="${allowance}" inputmode="decimal"></div>
              <small>Default standard allowance for this tax year; change it if your allowance was reduced.</small>
            </div>
            <div class="field">
              <label for="gift-aid-${year}">Gift Aid paid during the year</label>
              <div class="money-input"><span>£</span><input id="gift-aid-${year}" type="number" min="0" step="0.01" value="0" inputmode="decimal"></div>
              <small>Enter the amount you paid, not the grossed-up amount.</small>
            </div>
            <div class="field">
              <label for="deducted-${year}">Total tax deducted from P60</label>
              <div class="money-input"><span>£</span><input id="deducted-${year}" type="number" min="0" step="0.01" value="${DEFAULT_TAX_DEDUCTED}" inputmode="decimal"></div>
            </div>
            <div class="field">
              <label for="earlier-underpayment-${year}">Underpaid tax from previous year</label>
              <div class="money-input"><span>£</span><input id="earlier-underpayment-${year}" type="number" min="0" step="0.01" value="0" inputmode="decimal"></div>
              <small>Enter any earlier-year underpayment that should be added to this year's amount due.</small>
            </div>
          </div>
          <div class="results">
            <h3>Calculation</h3>
            <dl class="result-list">
              ${row("Total income on which tax is due", `taxable-${year}`)}
              ${row("Gift Aid gross amount (extends basic rate band)", `gift-gross-${year}`)}
              ${row("Basic rate amount", `basic-band-${year}`)}
              ${row("Basic rate tax (20%)", `basic-tax-${year}`)}
              ${row("Higher rate amount", `higher-band-${year}`)}
              ${row("Higher rate tax (40%)", `higher-tax-${year}`)}
              ${row("Underpaid tax from previous year", `earlier-${year}`)}
              ${row("Total calculated tax due", `calculated-${year}`, "subtotal")}
              <div id="total-${year}" class="result-row total">£0.00 to be paid</div>
            </dl>
            <p class="method-note">Total calculated tax due includes the basic-rate tax, higher-rate tax and the underpayment entered above. The final line subtracts tax deducted; a negative result means a repayment is estimated.</p>
          </div>
        </div>
      </article>`;
  }

  function renderSummary() {
    return `
      <section class="summary-panel tab-panel" id="panel-summary" role="tabpanel" aria-labelledby="tab-summary">
        <div class="summary-heading">
          <div>
            <h2>Summary of all tax years</h2>
            <p>Main calculation metrics for comparison and printing.</p>
          </div>
          <button class="print-button" type="button" id="print-summary">Print summary</button>
        </div>
        <div class="summary-table-wrap">
          <table class="summary-table">
            <thead><tr>
              <th>Tax year</th><th>Income on which tax is due</th><th>Gift Aid gross</th>
              <th>Basic rate tax</th><th>Higher rate tax</th><th>Previous underpayment</th>
              <th>Total calculated tax due</th><th>Tax to pay / return</th>
            </tr></thead>
            <tbody>
              ${years.map((year) => `<tr id="summary-row-${year}">
                <th scope="row">${year}</th>
                <td id="summary-taxable-${year}">${pounds(0)}</td>
                <td id="summary-gift-${year}">${pounds(0)}</td>
                <td id="summary-basic-${year}">${pounds(0)}</td>
                <td id="summary-higher-${year}">${pounds(0)}</td>
                <td id="summary-earlier-${year}">${pounds(0)}</td>
                <td id="summary-calculated-${year}">${pounds(0)}</td>
                <td id="summary-total-${year}">${pounds(0)}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>
        <p class="method-note">The summary updates whenever an input changes in a year tab. Use your browser's print dialog to save or print this comparison on A4 paper.</p>
      </section>`;
  }

  function updateSummary(year, balance, values) {
    document.getElementById(`summary-taxable-${year}`).textContent = pounds(values.taxableIncome);
    document.getElementById(`summary-gift-${year}`).textContent = pounds(values.giftAidGross);
    document.getElementById(`summary-basic-${year}`).textContent = pounds(values.basicRateTax);
    document.getElementById(`summary-higher-${year}`).textContent = pounds(values.higherRateTax);
    document.getElementById(`summary-earlier-${year}`).textContent = pounds(values.earlierUnderpayment);
    document.getElementById(`summary-calculated-${year}`).textContent = pounds(values.calculatedTax);
    const summaryTotal = document.getElementById(`summary-total-${year}`);
    summaryTotal.textContent = balance < 0 ? `${pounds(Math.abs(balance))} return` : `${pounds(balance)} due`;
    summaryTotal.className = balance < 0 ? "negative" : "positive";
  }

  document.getElementById("tabs").innerHTML = years.map((year, index) =>
    `<button class="tab-button${index === 0 ? " active" : ""}" type="button" id="tab-${year}" role="tab" aria-controls="panel-${year}" aria-selected="${index === 0}">${year}</button>`
  ).join("") + `<button class="tab-button" type="button" id="tab-summary" role="tab" aria-controls="panel-summary" aria-selected="false">Summary</button>`;
  document.getElementById("tab-panels").innerHTML = years.map(renderYear).join("") + renderSummary();

  function showTab(tabId) {
    document.querySelectorAll(".tab-button").forEach((button) => {
      const active = button.id === `tab-${tabId}`;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active);
    });
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.hidden = panel.id !== `panel-${tabId}`;
    });
  }

  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => showTab(button.id.replace("tab-", "")));
  });
  document.getElementById("print-summary").addEventListener("click", () => {
    showTab("summary");
    window.print();
  });
  showTab(years[0]);

  years.forEach((year) => {
    ["income", "allowance", "gift-aid", "deducted", "earlier-underpayment"].forEach((field) => {
      document.getElementById(`${field}-${year}`).addEventListener("input", () => calculate(year));
    });
    calculate(year);
  });
})();
