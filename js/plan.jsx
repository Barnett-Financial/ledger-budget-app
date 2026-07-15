/* plan.jsx: Plan screen and its subcomponents — split out of index.html (in-browser Babel, no bundler).
   Top-level function declarations stay global across text/babel scripts. */

/* ---- PlanScreen ---- */
function PlanScreen({ data, setData }) {
  const cashContribDefault = React.useMemo(() => {
    let s = 0;
    data.groups.forEach(g => g.cats.forEach(c => { if (c.bucket === 'save' && !catIsLtSavings(c) && !catIsDebtPayment(c)) s += sum(c.monthly); }));
    return Math.round(s / 12);
  }, [data.groups]);

  const ltContribDefault = React.useMemo(() => {
    let s = 0;
    data.groups.forEach(g => g.cats.forEach(c => { if (c.bucket === 'save' && catIsLtSavings(c) && !catIsDebtPayment(c)) s += sum(c.monthly); }));
    /* Fix #6: pretax 401k + HSA (monthly) also flow into long-term investments */
    data.income.forEach(r => { const p = r.payrollDeductions || {}; s += ((+p.retirement401k||0) + (+p.hsa||0)) * 12; });
    return Math.round(s / 12);
  }, [data.groups, data.income]);

  /* Default debt payment from budget categories with "debt" or "interest" in name */
  const debtPaymentDefault = React.useMemo(() => {
    let s = 0;
    data.groups.forEach(g => g.cats.forEach(c => { if (catIsDebtPayment(c)) s += sum(c.monthly); }));
    return Math.round(s / 12);
  }, [data.groups]);

  const incomeTotalMonthly = React.useMemo(() => Math.round(sum(data.income.map(r => sum(r.monthly))) / 12), [data.income]);

  /* Fix #5: seed from a saved projection if one exists, else fall back to budget-derived defaults */
  const pp = data.planProjection || null;
  const seed = (key, fallback) => (pp && pp[key] != null ? pp[key] : fallback);
  const [cashContrib,        setCashContrib]        = React.useState(() => seed('cashContrib', cashContribDefault));
  const [ltContrib,          setLtContrib]          = React.useState(() => seed('ltContrib', ltContribDefault > 0 ? ltContribDefault : 600));
  const [debtPaymentMonthly, setDebtPaymentMonthly] = React.useState(() => seed('debtPaymentMonthly', debtPaymentDefault));
  const [cashYield,          setCashYield]          = React.useState(() => seed('cashYield', data.planCashYield != null ? data.planCashYield : 4));
  const [ltYield,            setLtYield]            = React.useState(() => seed('ltYield', data.planLtYield != null ? data.planLtYield : 7));
  const [years,              setYears]              = React.useState(() => seed('years', 10));
  const [startCash,          setStartCash]          = React.useState(() => seed('startCash', data.beginningCash     != null ? data.beginningCash     : 0));
  const [startLT,            setStartLT]            = React.useState(() => seed('startLT', data.beginningLongTerm != null ? data.beginningLongTerm : 0));
  const [startDebt,          setStartDebt]          = React.useState(() => seed('startDebt', data.beginningDebt     != null ? data.beginningDebt     : 0));
  const [savedProj,          setSavedProj]          = React.useState(false);

  const debtInterestRate = data.debtInterestRate || 0;

  const updateCashYield = (v) => { setCashYield(v); setData(d => ({ ...d, planCashYield: v })); };
  const updateLtYield   = (v) => { setLtYield(v);   setData(d => ({ ...d, planLtYield:   v })); };

  const [customMilestones,   setCustomMilestones]   = React.useState(data.customMilestones || []);
  const [showMilestoneModal, setShowMilestoneModal] = React.useState(false);

  React.useEffect(() => { setData(d => ({ ...d, customMilestones })); }, [customMilestones]);

  const months = years * 12;

  const seriesTotal = React.useMemo(() => {
    const out = [];
    let cash = startCash, lt = startLT, debt = startDebt;
    const rC = cashYield / 100 / 12, rL = ltYield / 100 / 12;
    const rD = debtInterestRate / 100 / 12;
    for (let m = 0; m <= months; m++) {
      out.push({ m, bal: cash + lt - debt, cash, lt, debt });
      cash = cash * (1 + rC) + cashContrib;
      lt   = lt   * (1 + rL) + ltContrib;
      debt = Math.max(0, debt * (1 + rD) - debtPaymentMonthly);
    }
    return out;
  }, [months, cashYield, ltYield, startCash, startLT, cashContrib, ltContrib, startDebt, debtPaymentMonthly, debtInterestRate]);

  const last = seriesTotal[seriesTotal.length - 1];
  const finalBal = last.bal, finalCash = last.cash, finalLT = last.lt, finalDebt = last.debt;
  const grossInvested = (startCash + startLT) + (cashContrib + ltContrib) * months;
  const earned        = (finalCash + finalLT) - grossInvested;

  function monthsToReachTotal(target) {
    if ((startCash + startLT) >= target) return 0;
    let cash = startCash, lt = startLT;
    const rC = cashYield / 100 / 12, rL = ltYield / 100 / 12;
    for (let m = 1; m <= 12 * 60; m++) {
      cash = cash * (1 + rC) + cashContrib;
      lt   = lt   * (1 + rL) + ltContrib;
      if ((cash + lt) >= target) return m;
    }
    return null;
  }

  function monthsToReachAccount(target, startBal, monthly, rate) {
    if (startBal >= target) return 0;
    if (monthly <= 0 && rate <= 0) return null;
    let bal = startBal;
    for (let m = 1; m <= 12 * 60; m++) { bal = bal * (1 + rate) + monthly; if (bal >= target) return m; }
    return null;
  }

  function monthsToBeDebtFree(startD, annualRate, payment) {
    if (startD <= 0) return 0;
    if (payment <= 0) return null;
    const r = annualRate / 100 / 12;
    let d = startD;
    for (let m = 1; m <= 12 * 80; m++) {
      d = d * (1 + r) - payment;
      if (d <= 0) return m;
    }
    return null;
  }

  let monthlyNeedsWants = 0;
  data.groups.forEach(g => g.cats.forEach(c => { if (c.bucket === 'needs' || c.bucket === 'wants') monthlyNeedsWants += sum(c.monthly) / 12; }));
  if (monthlyNeedsWants === 0) monthlyNeedsWants = 3000;

  /* Sabbatical replaced by Debt Free (computed separately below) */
  const presetMilestones = [
    { name: 'Emergency fund',         detail: '3 months of essentials',   target: monthlyNeedsWants * 3 },
    { name: 'House down payment',     detail: '20% on a $450k home',      target: 90000 },
    { name: 'Financial independence', detail: '25\xD7 annual essentials', target: monthlyNeedsWants * 12 * 25 },
  ];

  const resetToBudget = () => {
    setStartCash(data.beginningCash  || 0);
    setStartLT(data.beginningLongTerm || 0);
    setStartDebt(data.beginningDebt  || 0);
    setCashContrib(cashContribDefault);
    setLtContrib(ltContribDefault > 0 ? ltContribDefault : 600);
    setDebtPaymentMonthly(debtPaymentDefault);
    setCashYield(data.planCashYield || 4);
    setLtYield(data.planLtYield     || 7);
    setYears(10);
    /* Fix #5: clear any saved projection so the tab reverts to budget defaults on reload */
    setData(d => ({ ...d, planProjection: null }));
    setSavedProj(false);
  };

  /* Fix #5: persist the current slider inputs so they survive navigation / closing the app */
  const saveProjection = () => {
    setData(d => ({
      ...d,
      planProjection: { cashContrib, ltContrib, debtPaymentMonthly, cashYield, ltYield, years, startCash, startLT, startDebt },
      planCashYield: cashYield, planLtYield: ltYield,
    }));
    setSavedProj(true);
    setTimeout(() => setSavedProj(false), 2000);
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Plan for what&#8217;s <em>next</em></h1>
          <div className="sub">See how your cash and long-term savings compound over time.</div>
        </div>
        <div className="actions">
          <button className="btn" onClick={resetToBudget}>Reset to budget</button>
          <button className="btn primary" onClick={saveProjection}>{savedProj ? 'Saved ✓' : 'Save projection'}</button>
        </div>
      </div>

      <div className="kpis">
        <Kpi label="Cash / month"        value={cashContrib} />
        <Kpi label="Long-term / month"   value={ltContrib} />
        <Kpi label="Projected net worth" value={Math.round(finalBal)} />
        <Kpi label="Growth from returns" value={Math.round(earned)} />
      </div>

      <div className="plan-grid">
        <div className="chart-card">
          <h3>Projected balance</h3>
          <div className="caption">
            Cash: {fmt(cashContrib, { zero:'$0' })}/mo @ {cashYield}%
            {' · '}Long-term: {fmt(ltContrib, { zero:'$0' })}/mo @ {ltYield}%
            {startDebt > 0 ? ' · Debt: ' + fmt(Math.round(startDebt), { zero:'$0' }) + ' @ ' + debtInterestRate.toFixed(1) + '%' : ''}
            {' · '}starting from {fmt(Math.round(startCash + startLT), { zero:'$0' })}.
          </div>
          <ProjectionChart series={seriesTotal} years={years} />
          <div style={{ display:'flex', gap:24, marginTop:14, fontSize:12, color:'var(--muted)', flexWrap:'wrap' }}>
            <span>Cash at yr {years}: <strong style={{ color:'var(--ink)', fontFamily:'var(--mono)' }}>{fmt(Math.round(finalCash))}</strong></span>
            <span>LT at yr {years}: <strong style={{ color:'var(--ink)', fontFamily:'var(--mono)' }}>{fmt(Math.round(finalLT))}</strong></span>
            {startDebt > 0 && <span>Debt at yr {years}: <strong style={{ color:'var(--warn)', fontFamily:'var(--mono)' }}>{finalDebt > 0 ? fmt(Math.round(finalDebt)) : 'Paid off'}</strong></span>}
          </div>
        </div>

        <div className="plan-controls">
          <div style={{ fontSize:10.5, textTransform:'uppercase', letterSpacing:'0.12em', color:'var(--muted)', padding:'0 2px 2px' }}>Monthly contributions</div>
          <Slider compact label="Cash savings / month"          value={cashContrib}        min={0} max={5000}   step={50}   format={v => fmt(v, { zero:'$0' })} onChange={setCashContrib}        ends={['$0','$5k']} />
          <Slider compact label="Long-term investments / month" value={ltContrib}          min={0} max={5000}   step={50}   format={v => fmt(v, { zero:'$0' })} onChange={setLtContrib}          ends={['$0','$5k']} />
          <Slider compact label="Debt payment / month"         value={debtPaymentMonthly} min={0} max={10000}  step={50}   format={v => fmt(v, { zero:'$0' })} onChange={setDebtPaymentMonthly} ends={['$0','$10k']} />
          <div style={{ fontSize:10.5, textTransform:'uppercase', letterSpacing:'0.12em', color:'var(--muted)', padding:'6px 2px 2px' }}>Annual yields</div>
          <Slider compact label="Cash yield"                   value={cashYield}          min={0} max={10}     step={0.25} format={v => v.toFixed(2) + '%'}    onChange={updateCashYield}       ends={['0%','10%']} />
          <Slider compact label="Long-term investment yield"   value={ltYield}            min={0} max={15}     step={0.25} format={v => v.toFixed(2) + '%'}    onChange={updateLtYield}         ends={['0%','15%']} />
          <div style={{ fontSize:10.5, textTransform:'uppercase', letterSpacing:'0.12em', color:'var(--muted)', padding:'6px 2px 2px' }}>Starting balances</div>
          <Slider compact label="Starting cash balance"        value={startCash}          min={0} max={500000} step={500}  format={v => fmt(v, { zero:'$0' })} onChange={setStartCash}          ends={['$0','$500k']} />
          <Slider compact label="Starting long-term balance"  value={startLT}            min={0} max={1000000} step={1000} format={v => fmt(v, { zero:'$0' })} onChange={setStartLT}           ends={['$0','$1M']} />
          <Slider compact label="Starting debt balance"       value={startDebt}          min={0} max={1000000} step={1000} format={v => fmt(v, { zero:'$0' })} onChange={setStartDebt}         ends={['$0','$1M']} />
          <div style={{ fontSize:10.5, textTransform:'uppercase', letterSpacing:'0.12em', color:'var(--muted)', padding:'6px 2px 2px' }}>Time horizon</div>
          <Slider compact label="Years to project"             value={years}              min={1} max={40}     step={1}    format={v => v + ' years'}           onChange={setYears}              ends={['1 yr','40 yrs']} />
        </div>
      </div>

      <div className="milestones">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <h3 style={{ fontFamily:'var(--serif)', fontWeight:400, fontSize:22, margin:0, letterSpacing:'-0.01em' }}>Milestones at this rate</h3>
          <button className="btn" onClick={() => setShowMilestoneModal(true)}>+ Add milestone</button>
        </div>

        {presetMilestones.map(m => {
          const eta = monthsToReachTotal(m.target);
          /* Fix 3.4: asset milestones use cash+LT for BOTH the % and the ETA sim
             (the ETA function already ignores debt); the Debt-free row covers debt. */
          const p   = Math.min(100, Math.round(((finalCash + finalLT) / m.target) * 100));
          return (
            <div className="milestone-row" key={m.name}>
              <div className="ms-name"><strong>{m.name}</strong><span>{m.detail} &middot; {fmt(Math.round(m.target))}</span></div>
              <div className="ms-eta">{eta == null ? '—' : formatEta(eta)}{eta != null && eta > 0 && <span className="unit">to reach</span>}</div>
              <div className="ms-pct">{p}% by yr {years}</div>
            </div>
          );
        })}

        {/* Debt Free milestone (replaces Sabbatical) */}
        {(() => {
          if (startDebt <= 0) {
            return (
              <div className="milestone-row">
                <div className="ms-name"><strong>Debt free</strong><span>No debt balance set</span></div>
                <div className="ms-eta">now</div>
                <div className="ms-pct">100%</div>
              </div>
            );
          }
          const eta       = monthsToBeDebtFree(startDebt, debtInterestRate, debtPaymentMonthly);
          const paidSoFar = startDebt - finalDebt;
          const p         = Math.min(100, startDebt > 0 ? Math.round((paidSoFar / startDebt) * 100) : 100);
          return (
            <div className="milestone-row">
              <div className="ms-name">
                <strong>Debt free</strong>
                <span>{fmt(Math.round(startDebt))} @ {debtInterestRate.toFixed(1)}% interest &middot; {fmt(debtPaymentMonthly, { zero:'$0' })}/mo payment</span>
              </div>
              <div className="ms-eta">
                {eta == null ? '—' : formatEta(eta)}
                {eta != null && eta > 0 && <span className="unit">to reach</span>}
              </div>
              <div className="ms-pct">{p}% paid by yr {years}</div>
            </div>
          );
        })()}

        {customMilestones.length > 0 && (
          <div style={{ borderTop:'1px solid var(--line)', marginTop:12, paddingTop:4 }}>
            <div style={{ fontSize:10.5, textTransform:'uppercase', letterSpacing:'0.12em', color:'var(--muted)', margin:'8px 0 4px' }}>Custom milestones</div>
            {customMilestones.map(m => {
              const isInvest  = m.accountType === 'invest';
              const mRate     = (isInvest ? ltYield : cashYield) / 100 / 12;
              const mContrib  = isInvest ? ltContrib  : cashContrib;
              const mStartBal = m.startBalance != null ? m.startBalance : (isInvest ? startLT : startCash);
              const eta       = monthsToReachAccount(m.target, mStartBal, mContrib, mRate);
              const mFinal    = isInvest ? finalLT : finalCash;
              const p         = Math.min(100, Math.round((mFinal / m.target) * 100));
              return (
                <div className="milestone-row" key={m.id}>
                  <div className="ms-name">
                    <strong>{m.name}</strong>
                    <span>
                      {m.detail ? m.detail + ' \xB7 ' : ''}{fmt(Math.round(m.target))}
                      <span style={{ marginLeft:8, color:'var(--muted)', fontSize:11, background:'var(--bg-soft)', padding:'1px 6px', borderRadius:999 }}>{isInvest ? 'invest' : 'cash'}</span>
                    </span>
                  </div>
                  <div className="ms-eta">{eta == null ? '—' : formatEta(eta)}{eta != null && eta > 0 && <span className="unit">to reach</span>}</div>
                  <div className="ms-pct" style={{ display:'flex', alignItems:'center', gap:8, justifyContent:'flex-end' }}>
                    <span>{p}% by yr {years}</span>
                    <button onClick={() => setCustomMilestones(ms => ms.filter(x => x.id !== m.id))}
                      style={{ color:'var(--muted)', fontSize:15, lineHeight:1, cursor:'pointer', padding:'2px 4px' }}
                      onMouseEnter={e => { e.currentTarget.style.color='var(--warn)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color='var(--muted)'; }}>&#215;</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="foot-note">
        <span>Projections assume steady monthly contributions and returns; values are nominal dollars.</span>
        <span>Compounded monthly &middot; Cash and long-term accounts tracked separately</span>
      </div>

      {showMilestoneModal && (
        <AddMilestoneModal
          defaultStartCash={startCash} defaultStartLT={startLT}
          onSave={m => setCustomMilestones(ms => [...ms, m])}
          onClose={() => setShowMilestoneModal(false)} />
      )}
    </div>
  );
}

function AddMilestoneModal({ defaultStartCash, defaultStartLT, onSave, onClose }) {
  const [name,        setName]        = React.useState('');
  const [detail,      setDetail]      = React.useState('');
  const [target,      setTarget]      = React.useState('');
  const [accountType, setAccountType] = React.useState('invest');
  const [startBal,    setStartBal]    = React.useState('');
  const [err,         setErr]         = React.useState('');

  const handleSave = () => {
    if (!name.trim()) { setErr('Enter a milestone name.'); return; }
    const t = parseFloat(target);
    if (!target || isNaN(t) || t <= 0) { setErr('Enter a valid goal amount greater than zero.'); return; }
    onSave({ id: uid(), name: name.trim(), detail: detail.trim(), target: t, accountType, startBalance: startBal !== '' ? parseFloat(startBal) : null });
    onClose();
  };

  const ph = accountType === 'invest'
    ? 'Default: ' + fmt(defaultStartLT, { zero:'$0' }) + ' (LT balance)'
    : 'Default: ' + fmt(defaultStartCash, { zero:'$0' }) + ' (cash balance)';

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSave(); }}>
        <div className="modal-head"><h2>Add milestone</h2><button className="modal-close" aria-label="Close" onClick={onClose}>&#215;</button></div>
        <div className="form-field">
          <label>Milestone name</label>
          <input type="text" className="form-input" value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="e.g. Beach house fund" />
        </div>
        <div className="form-field">
          <label>Description <span style={{ color:'var(--muted)', textTransform:'none', letterSpacing:0 }}>(optional)</span></label>
          <input type="text" className="form-input" value={detail} onChange={e => setDetail(e.target.value)} placeholder="Brief description" />
        </div>
        <div className="form-field">
          <label>Goal amount ($)</label>
          <input type="number" inputMode="decimal" className="form-input" value={target} onChange={e => setTarget(e.target.value)} placeholder="0" min="0" step="100" />
        </div>
        <div className="form-field">
          <label>Account type</label>
          <select className="form-input" value={accountType} onChange={e => setAccountType(e.target.value)}>
            <option value="invest">Investment Account (long-term yield + LT contribution)</option>
            <option value="cash">Cash Account (cash yield + cash contribution)</option>
          </select>
        </div>
        <div className="form-field">
          <label>Starting balance <span style={{ color:'var(--muted)', textTransform:'none', letterSpacing:0 }}>(optional)</span></label>
          <input type="number" inputMode="decimal" className="form-input" value={startBal} onChange={e => setStartBal(e.target.value)} placeholder={ph} min="0" step="100" />
        </div>
        {err && <div className="form-error">{err}</div>}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={handleSave}>Add milestone</button>
        </div>
      </div>
    </div>
  );
}

function formatEta(m) {
  if (m === 0) return 'now';
  const y = Math.floor(m / 12), mo = m % 12;
  if (y === 0)  return mo + ' mo';
  if (mo === 0) return y + ' yr' + (y > 1 ? 's' : '');
  return y + 'y ' + mo + 'm';
}
function niceCeil(n) {
  if (n <= 0) return 1000;
  const exp = Math.pow(10, Math.floor(Math.log10(n))), f = n / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}
function abbrev(n) {
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
  if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'k';
  return '$' + Math.round(n);
}

function Slider({ label, value, min, max, step, format, onChange, ends, compact }) {
  return (
    <div className="control" style={compact ? { padding:'9px 14px' } : undefined}>
      <div className="lbl">{label}</div>
      <div className="val" style={compact ? { fontSize:20, marginBottom:6 } : undefined}>{format(value)}</div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} />
      <div className="ends"><span>{ends[0]}</span><span>{ends[1]}</span></div>
    </div>
  );
}

function ProjectionChart({ series, years }) {
  const W=640, H=260, PL=56, PR=12, PT=16, PB=28;
  const maxBal=Math.max(...series.map(p=>p.bal),1), niceMax=niceCeil(maxBal);
  const x=m=>PL+(m/(series.length-1))*(W-PL-PR);
  const y=b=>PT+(1-b/niceMax)*(H-PT-PB);
  const path=series.map((p,i)=>(i?'L':'M')+x(p.m).toFixed(1)+' '+y(p.bal).toFixed(1)).join(' ');
  const areaPath=path+' L '+x(series.length-1).toFixed(1)+' '+(H-PB).toFixed(1)+' L '+x(0).toFixed(1)+' '+(H-PB).toFixed(1)+' Z';
  const tickVals=Array.from({length:5},(_,i)=>(niceMax*i)/4);
  const xTickCount=Math.min(years,8);
  const xTicks=Array.from({length:xTickCount+1},(_,i)=>Math.round((years*i)/xTickCount));
  return (
    <svg viewBox={'0 0 ' + W + ' ' + H} style={{ width:'100%', height:'auto', display:'block' }}>
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="var(--accent)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {tickVals.map((v,i)=>(
        <g key={i}>
          <line x1={PL} x2={W-PR} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
          <text x={PL-8} y={y(v)+4} textAnchor="end" fontSize="11" fill="var(--muted)" fontFamily="var(--mono)">{abbrev(v)}</text>
        </g>
      ))}
      {xTicks.map((yr,i)=>(
        <text key={i} x={x(yr*12)} y={H-10} textAnchor="middle" fontSize="11" fill="var(--muted)" fontFamily="var(--mono)">{yr===0?'now':'y'+yr}</text>
      ))}
      <path d={areaPath} fill="url(#areaGrad)" />
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" />
      <circle cx={x(series.length-1)} cy={y(series[series.length-1].bal)} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
    </svg>
  );
}
