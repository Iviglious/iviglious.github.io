// Mortgage Lump-Sum Optimizer
(function(){
  const $ = id => document.getElementById(id);

  const principalInput = $('principal');
  const rateInput = $('rate');
  const yearsInput = $('years');
  const monthlyInput = $('monthly');
  const lumpInput = $('lump');
  const lumpLabel = $('lumpLabel');
  const targetPercent = $('targetPercent');
  const recalcBtn = $('recalc');

  const origInterestEl = $('origInterest');
  const newInterestEl = $('newInterest');
  const savedEl = $('saved');
  const newTermEl = $('newTerm');
  const optLumpEl = $('optLump');

  const canvas = $('chart');
  const ctx = canvas.getContext('2d');

  function monthlyRate(annual){ return annual/100/12; }

  function mortgagePayment(P, r, n){
    if(r === 0) return P / n;
    return P * r / (1 - Math.pow(1+r, -n));
  }

  function simulateTotalInterest(P, r, M){
    let balance = P;
    let totalInterest = 0;
    let months = 0;
    const maxIter = 1000*12; // safety
    while(balance > 0.005 && months < maxIter){
      const interest = balance * r;
      let principalPay = M - interest;
      if(principalPay <= 0){
        // payment too small to reduce principal: pay off in one step
        totalInterest += interest;
        balance = 0;
        months += 1;
        break;
      }
      balance -= principalPay;
      totalInterest += interest;
      months += 1;
    }
    return {totalInterest, months};
  }

  function formatMoney(v){ return v.toLocaleString('en-GB', {style:'currency', currency:'GBP', maximumFractionDigits:0}); }
  function formatMoney2(v){ return v.toLocaleString('en-GB', {style:'currency', currency:'GBP', maximumFractionDigits:2}); }

  function computeAll(){
    const P = Number(principalInput.value) || 0;
    const annual = Number(rateInput.value) || 0;
    const years = Number(yearsInput.value) || 0;
    const n = Math.round(years*12);
    const r = monthlyRate(annual);

    // determine monthly payment
    let M = Number(monthlyInput.value);
    if(!M || M <= 0){
      M = mortgagePayment(P, r, n);
    }

    const orig = simulateTotalInterest(P, r, M);
    const origInterest = orig.totalInterest;

    // set slider max to principal
    lumpInput.max = Math.max(0, Math.round(P));

    // compute savings curve
    const steps = 120;
    const pts = [];
    for(let i=0;i<=steps;i++){
      const L = P * i / steps;
      const newP = Math.max(0, P - L);
      const after = simulateTotalInterest(newP, r, M);
      const saved = origInterest - after.totalInterest;
      pts.push({L, saved, months: after.months, afterInterest: after.totalInterest});
    }

    const maxSaved = origInterest; // paying full principal saves all future interest
    const target = maxSaved * (Number(targetPercent.value||90)/100);

    // find minimal L achieving target via binary search using simulate function
    let lo=0, hi=P, opt=P;
    for(let iter=0; iter<40; iter++){
      const mid = (lo+hi)/2;
      const after = simulateTotalInterest(Math.max(0,P-mid), r, M);
      const saved = origInterest - after.totalInterest;
      if(saved >= target){ opt = mid; hi = mid; } else { lo = mid; }
    }

    // current slider value
    const curLump = Number(lumpInput.value)||0;
    const curAfter = simulateTotalInterest(Math.max(0,P-curLump), r, M);
    const curSaved = origInterest - curAfter.totalInterest;

    // update DOM
    origInterestEl.textContent = formatMoney2(origInterest);
    newInterestEl.textContent = formatMoney2(curAfter.totalInterest);
    savedEl.textContent = formatMoney2(curSaved) + ` (${(curSaved / (maxSaved || 1) *100).toFixed(1)}% of max)`;
    newTermEl.textContent = curAfter.months + ' months';
    optLumpEl.textContent = formatMoney2(opt);
    lumpLabel.textContent = formatMoney2(curLump);

    drawChart(pts, curLump, opt);
  }

  function drawChart(points, curLump, optLump){
    const w = canvas.width; const h = canvas.height;
    ctx.clearRect(0,0,w,h);
    // padding
    const pad = 40;
    // find max saved
    const maxSaved = Math.max(...points.map(p=>p.saved));

    // axes
    ctx.strokeStyle = '#e6e9ef'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad,h-pad); ctx.lineTo(w-pad,h-pad); ctx.stroke(); // x
    ctx.beginPath(); ctx.moveTo(pad,h-pad); ctx.lineTo(pad,pad); ctx.stroke(); // y

    // plot line
    ctx.strokeStyle = '#276ef1'; ctx.lineWidth = 2; ctx.beginPath();
    points.forEach((pt,i)=>{
      const x = pad + (w-2*pad) * (pt.L / (points[points.length-1].L || 1));
      const y = (h-pad) - (h-2*pad) * (pt.saved / (maxSaved || 1));
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();

    // fill under curve
    ctx.fillStyle = 'rgba(39,110,241,0.08)'; ctx.lineTo(w-pad,h-pad); ctx.lineTo(pad,h-pad); ctx.closePath(); ctx.fill();

    // mark current lump
    const curX = pad + (w-2*pad) * (curLump / (points[points.length-1].L || 1));
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(curX,pad); ctx.lineTo(curX,h-pad); ctx.setLineDash([6,4]); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#0f172a'; ctx.fillRect(curX-3,h-pad-6,6,6);
    ctx.fillText('Selected', curX+6, pad+12);

    // mark optimal lump
    const optX = pad + (w-2*pad) * (optLump / (points[points.length-1].L || 1));
    ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(optX,pad); ctx.lineTo(optX,h-pad); ctx.stroke();
    ctx.fillStyle = '#16a34a'; ctx.fillRect(optX-3,h-pad-18,6,6);
    ctx.fillText('Suggested', optX+6, pad+28);

    // y-axis labels (0 and max)
    ctx.fillStyle = '#334155'; ctx.font = '12px sans-serif';
    ctx.fillText(formatMoney2(0), 6, h-pad);
    ctx.fillText(formatMoney2(maxSaved), 6, pad+6);
    // x-axis labels
    ctx.fillText(formatMoney2(0), pad, h-6);
    ctx.fillText(formatMoney2(points[points.length-1].L), w-pad-60, h-6);
  }

  // wire events
  lumpInput.addEventListener('input', ()=>{ lumpLabel.textContent = formatMoney2(Number(lumpInput.value)||0); computeAll(); });
  recalcBtn.addEventListener('click', computeAll);
  [principalInput, rateInput, yearsInput, monthlyInput, targetPercent].forEach(el=>el.addEventListener('change', ()=>{
    // update slider max when principal changes
    lumpInput.max = Math.max(0, Math.round(Number(principalInput.value)||0));
    if(Number(lumpInput.value) > Number(lumpInput.max)) lumpInput.value = lumpInput.max;
    computeAll();
  }));

  // initial values
  window.addEventListener('load', ()=>{
    lumpInput.max = Math.max(0, Math.round(Number(principalInput.value)||0));
    computeAll();
  });

})();
