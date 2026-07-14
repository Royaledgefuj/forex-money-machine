// Forex Money Machine Academy — free Risk & Lot Size calculators (public, no login required)

function pipValueFor(select, customInput) {
  return select.value === 'custom' ? (Number(customInput.value) || 0) : Number(select.value);
}

// ---- Risk Calculator ----
(function riskCalculator() {
  const balanceEl = document.getElementById('rcBalance');
  if (!balanceEl) return;

  const lotsEl = document.getElementById('rcLots');
  const stopEl = document.getElementById('rcStopPips');
  const pairEl = document.getElementById('rcPair');
  const customWrap = document.getElementById('rcCustomWrap');
  const customEl = document.getElementById('rcCustomPip');
  const dollarOut = document.getElementById('rcDollarRisk');
  const pctOut = document.getElementById('rcPctRisk');
  const warning = document.getElementById('rcWarning');

  function recalc() {
    customWrap.hidden = pairEl.value !== 'custom';
    const balance = Number(balanceEl.value) || 0;
    const lots = Number(lotsEl.value) || 0;
    const stopPips = Number(stopEl.value) || 0;
    const pipValue = pipValueFor(pairEl, customEl);

    const dollarRisk = lots * stopPips * pipValue;
    const pctRisk = balance > 0 ? (dollarRisk / balance) * 100 : 0;

    dollarOut.textContent = `$${dollarRisk.toFixed(2)}`;
    pctOut.textContent = `${pctRisk.toFixed(2)}%`;
    warning.hidden = pctRisk <= 2;
  }

  [balanceEl, lotsEl, stopEl, pairEl, customEl].forEach((el) => el.addEventListener('input', recalc));
  recalc();
})();

// ---- Lot Size Calculator ----
(function lotSizeCalculator() {
  const balanceEl = document.getElementById('lsBalance');
  if (!balanceEl) return;

  const riskPctEl = document.getElementById('lsRiskPct');
  const stopEl = document.getElementById('lsStopPips');
  const pairEl = document.getElementById('lsPair');
  const customWrap = document.getElementById('lsCustomWrap');
  const customEl = document.getElementById('lsCustomPip');
  const dollarOut = document.getElementById('lsDollarRisk');
  const lotOut = document.getElementById('lsLotSize');

  function recalc() {
    customWrap.hidden = pairEl.value !== 'custom';
    const balance = Number(balanceEl.value) || 0;
    const riskPct = Number(riskPctEl.value) || 0;
    const stopPips = Number(stopEl.value) || 0;
    const pipValue = pipValueFor(pairEl, customEl);

    const dollarRisk = balance * (riskPct / 100);
    const lotSize = (stopPips > 0 && pipValue > 0) ? dollarRisk / (stopPips * pipValue) : 0;

    dollarOut.textContent = `$${dollarRisk.toFixed(2)}`;
    lotOut.textContent = `${lotSize.toFixed(2)} lots`;
  }

  [balanceEl, riskPctEl, stopEl, pairEl, customEl].forEach((el) => el.addEventListener('input', recalc));
  recalc();
})();
