/* Plan screen — compound savings projection with interactive sliders */

function PlanScreen({ data, setData }) {

  /* ---- Defaults derived from budget ---- */

  const cashContribDefault = React.useMemo(() => {
    let s = 0;
    data.groups.forEach(g => g.cats.forEach(c => {
      if (c.bucket === 'save' && !isLtSavings(c.name)) s += sum(c.monthly);
    }));
    return Math.round(s / 12);
  }, [data.groups]);

  const ltContribDefault = React.useMemo(() => {
    let s = 0;
    data.groups.forEach(g => g.cats.forEach(c => {
      if (c.bucket === 'save' && isLtSavings(c.name)) s += sum(c.monthly);
    }));
    return Math.round(s / 12);
  }, [data.groups]);

  const incomeTotalMonthly = React.useMemo(() => {
    return Math.round(sum(data.income.map(r => sum(r.monthly))) / 12);
  }, [data.income]);

  /* ---- Slider state ---- */

  const [cashContrib, setCashContrib] = React.useState(() =>
    cashContribDefault > 0 ? cashContribDefault : 200
  );
  const [ltContrib,   setLtContrib]   = React.useState(() =>
    ltContribDefault > 0 ? ltContribDefault : 600
  );
  const [cashYield,   setCashYield]   = React.useState(data.planCashYield != null ? data.planCashYield : 4);
  const [ltYield,     setLtYield]     = React.useState(data.planLtYield   != null ? data.planLtYield   : 7);
  const [years,       setYears]       = React.useState(10);
  const [startCash,   setStartCash]   = React.useState(data.beginningCash     != null ? data.beginningCash     : 0);
  const [startLT,     setStartLT]     = React.useState(data.beginningLongTerm != null ? data.beginningLongTerm : 0);

  /* Sync yield changes back to data so Budget tab can use them for compounding */
  const updateCashYield = (v) => {
    setCashYield(v);
    setData(d => ({ ...d, planCashYield: v }));
  };
  const updateLtYield = (v) => {
    setLtYield(v);
    setData(d => ({ ...d, planLtYield: v }));
  };

  /* ---- Custom milestones ---- */

  const [customMilestones,    setCustomMilestones]    = React.useState(data.customMilestones || []);
  const [showMilestoneModal,  setShowMilestoneModal]  = React.useState(false);

  /* Persist custom milestones in shared data */
  React.useEffect(() => {
    setData(d => ({ ...d, customMilestones }));
  }, [customMilestones]);

  /* ---- Projection series (two accounts combined) ---- */

  const months = years * 12;

  const seriesTotal = React.useMemo(() => {
    const out = [];
    let cash = startCash;
    let lt   = startLT;
    const rCash = cashYield / 100 / 12;
    const rLT   = ltYield  / 100 / 12;
    for (let m = 0; m <= months; m++) {
      out.push({ m, bal: cash + lt, cash, lt });
      cash = cash * (1 + rCash) + cashContrib;
      lt   = lt   * (1 + rLT)   + ltContrib;
    }
    return out;
  }, [months, cashYield, ltYield, startCash, startLT, cashContrib, ltContrib]);

  const last         = seriesTotal[seriesTotal.length - 1];
  const finalBal     = last.bal;
  const finalCash    = last.cash;
  const finalLT      = last.lt;
  const contributed  = (startCash + startLT) + (cashContrib + ltContrib) * months;
  const earned       = finalBal - contributed;

  /* ---- Milestone helpers ---- */

  /* Reach target using total of both accounts */
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

  /* Reach target using a single account */
  function monthsToReachAccount(target, startBal, monthly, rate) {
    if (startBal >= target) return 0;
    if (monthly <= 0 && rate <= 0) return null;
    let bal = startBal;
    for (let m = 1; m <= 12 * 60; m++) {
      bal = bal * (1 + rate) + monthly;
      if (bal >= target) return m;
    }
    return null;
  }

  /* Monthly needs + wants for milestone targets */
  let monthlyNeedsWants = 0;
  data.groups.forEach(g => g.cats.forEach(c => {
    if (c.bucket === 'needs' || c.bucket === 'wants') {
      monthlyNeedsWants += sum(c.monthly) / 12;
    }
  }));
  if (monthlyNeedsWants === 0) monthlyNeedsWants = 3000;

  const presetMilestones = [
    { name: 'Emergency fund',         detail: '3 months of essentials',  target: monthlyNeedsWants * 3 },
    { name: 'House down payment',     detail: '20% on a $450k home',     target: 90000 },
    { name: 'Sabbatical fund',        detail: '6 months of income',      target: incomeTotalMonthly * 6 },
    { name: 'Financial independence', detail: '25× annual essentials',   target: monthlyNeedsWants * 12 * 25 },
  ];

  const resetToBudget = () => {
    setStartCash(data.beginningCash     || 0);
    setStartLT(data.beginningLongTerm   || 0);
    setCashContrib(cashContribDefault > 0 ? cashContribDefault : 200);
    setLtContrib(ltContribDefault     > 0 ? ltContribDefault   : 600);
    setCashYield(data.planCashYield     || 4);
    setLtYield(data.planLtYield         || 7);
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Plan for what's <em>next</em></h1>
          <div className="sub">
            See how your cash and long-term savings compound over time. Adjust contributions,
            yields, and time horizon to explore your milestones.
          </div>
        </div>
        <div className="actions">
          <button className="btn" onClick={resetToBudget}>Reset to budget</button>
        </div>
      </div>

      <div className="kpis">
        <Kpi label="Cash / month"        value={cashContrib} />
        <Kpi label="Long-term / month"   value={ltContrib} />
        <Kpi label="Projected total"     value={Math.round(finalBal)} />
        <Kpi label="Growth from returns" value={Math.round(earned)} />
      </div>

      <div className="plan-grid">
        <div className="chart-card">
          <h3>Projected balance</h3>
          <div className="caption">
            Cash: {fmt(cashContrib, { zero:'$0' })}/mo @ {cashYield}% · Long-term: {fmt(ltContrib, { zero:'$0' })}/mo @ {ltYield}% · starting from {fmt(Math.round(startCash + startLT), { zero:'$0' })}.
          </div>
          <ProjectionChart series={seriesTotal} years={years} />
          {/* Mini breakdown */}
          <div style={{ display: 'flex', gap: 24, marginTop: 14, fontSize: 12, color: 'var(--muted)' }}>
            <span>Cash at yr {years}: <strong style={{ color:'var(--ink)', fontFamily:'var(--mono)' }}>{fmt(Math.round(finalCash))}</strong></span>
            <span>Long-term at yr {years}: <strong style={{ color:'var(--ink)', fontFamily:'var(--mono)' }}>{fmt(Math.round(finalLT))}</strong></span>
          </div>
        </div>

        <div className="plan-controls">
          {/* Contributions */}
          <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)', padding: '0 2px 2px' }}>
            Monthly contributions
          </div>
          <Slider label="Cash savings / month" value={cashContrib}
            min={0} max={5000} step={50}
            format={v => fmt(v, { zero: '$0' })}
            onChange={setCashContrib} ends={['$0', '$5,000']} />
          <Slider label="Long-term investments / month" value={ltContrib}
            min={0} max={5000} step={50}
            format={v => fmt(v, { zero: '$0' })}
            onChange={setLtContrib} ends={['$0', '$5,000']} />

          {/* Yields */}
          <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)', padding: '8px 2px 2px' }}>
            Annual yields
          </div>
          <Slider label="Cash yield" value={cashYield}
            min={0} max={10} step={0.25}
            format={v => v.toFixed(2) + '%'}
            onChange={updateCashYield} ends={['0%', '10%']} />
          <Slider label="Long-term investment yield" value={ltYield}
            min={0} max={15} step={0.25}
            format={v => v.toFixed(2) + '%'}
            onChange={updateLtYield} ends={['0%', '15%']} />

          {/* Starting balances */}
          <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)', padding: '8px 2px 2px' }}>
            Starting balances
          </div>
          <Slider label="Starting cash balance" value={startCash}
            min={0} max={500000} step={500}
            format={v => fmt(v, { zero: '$0' })}
            onChange={setStartCash} ends={['$0', '$500k']} />
          <Slider label="Starting long-term balance" value={startLT}
            min={0} max={1000000} step={1000}
            format={v => fmt(v, { zero: '$0' })}
            onChange={setStartLT} ends={['$0', '$1M']} />

          {/* Time horizon */}
          <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)', padding: '8px 2px 2px' }}>
            Time horizon
          </div>
          <Slider label="Years to project" value={years}
            min={1} max={40} step={1}
            format={v => v + ' years'}
            onChange={setYears} ends={['1 yr', '40 yrs']} />
        </div>
      </div>

      {/* Milestones */}
      <div className="milestones">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 22, margin: 0, letterSpacing: '-0.01em' }}>
            Milestones at this rate
          </h3>
          <button className="btn" onClick={() => setShowMilestoneModal(true)}>+ Add milestone</button>
        </div>

        {/* Pre-built milestones (use total of both accounts) */}
        {presetMilestones.map(m => {
          const eta = monthsToReachTotal(m.target);
          const p   = Math.min(100, Math.round((finalBal / m.target) * 100));
          return (
            <div className="milestone-row" key={m.name}>
              <div className="ms-name">
                <strong>{m.name}</strong>
                <span>{m.detail} · {fmt(Math.round(m.target))}</span>
              </div>
              <div className="ms-eta">
                {eta == null ? '—' : formatEta(eta)}
                {eta != null && eta > 0 && <span className="unit">to reach</span>}
              </div>
              <div className="ms-pct">{p}% by yr {years}</div>
            </div>
          );
        })}

        {/* Custom milestones */}
        {customMilestones.length > 0 && (
          <div style={{ borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 4 }}>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--muted)', margin: '8px 0 4px' }}>
              Custom milestones
            </div>
            {customMilestones.map(m => {
              const isInvest   = m.accountType === 'invest';
              const mRate      = (isInvest ? ltYield : cashYield) / 100 / 12;
              const mContrib   = isInvest ? ltContrib   : cashContrib;
              const mStartBal  = m.startBalance != null ? m.startBalance : (isInvest ? startLT : startCash);
              const eta        = monthsToReachAccount(m.target, mStartBal, mContrib, mRate);
              const mFinal     = isInvest ? finalLT : finalCash;
              const p          = Math.min(100, Math.round((mFinal / m.target) * 100));
              return (
                <div className="milestone-row" key={m.id}>
                  <div className="ms-name">
                    <strong>{m.name}</strong>
                    <span>
                      {m.detail ? m.detail + ' · ' : ''}
                      {fmt(Math.round(m.target))}
                      <span style={{ marginLeft: 8, color: 'var(--muted)', fontSize: 11,
                        background: 'var(--bg-soft)', padding: '1px 6px', borderRadius: 999 }}>
                        {isInvest ? 'invest' : 'cash'}
                      </span>
                    </span>
                  </div>
                  <div className="ms-eta">
                    {eta == null ? '—' : formatEta(eta)}
                    {eta != null && eta > 0 && <span className="unit">to reach</span>}
                  </div>
                  <div className="ms-pct" style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                    <span>{p}% by yr {years}</span>
                    <button
                      onClick={() => setCustomMilestones(ms => ms.filter(x => x.id !== m.id))}
                      title="Remove milestone"
                      style={{ color: 'var(--muted)', fontSize: 15, lineHeight: 1, cursor: 'pointer', padding: '2px 4px' }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--warn)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; }}
                    >×</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="foot-note">
        <span>Projections assume steady monthly contributions and returns; values are nominal dollars.</span>
        <span>Compounded monthly · Cash and long-term accounts tracked separately</span>
      </div>

      {showMilestoneModal && (
        <AddMilestoneModal
          defaultStartCash={startCash}
          defaultStartLT={startLT}
          onSave={m => setCustomMilestones(ms => [...ms, m])}
          onClose={() => setShowMilestoneModal(false)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Add Milestone modal                                                 */

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
    onSave({
      id: uid(),
      name:        name.trim(),
      detail:      detail.trim(),
      target:      t,
      accountType,
      startBalance: startBal !== '' ? parseFloat(startBal) : null,
    });
    onClose();
  };

  const handleKey = e => { if (e.key === 'Enter' && !e.shiftKey) handleSave(); };
  const defaultBalPlaceholder = accountType === 'invest'
    ? `Default: ${fmt(defaultStartLT, { zero:'$0' })} (LT balance)`
    : `Default: ${fmt(defaultStartCash, { zero:'$0' })} (cash balance)`;

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" onKeyDown={handleKey}>
        <div className="modal-head">
          <h2>Add milestone</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="form-field">
          <label>Milestone name</label>
          <input type="text" className="form-input" value={name}
            onChange={e => setName(e.target.value)} autoFocus
            placeholder="e.g. Beach house fund" />
        </div>

        <div className="form-field">
          <label>
            Description{' '}
            <span style={{ color:'var(--muted)', textTransform:'none', letterSpacing:0 }}>(optional)</span>
          </label>
          <input type="text" className="form-input" value={detail}
            onChange={e => setDetail(e.target.value)}
            placeholder="Brief description" />
        </div>

        <div className="form-field">
          <label>Goal amount ($)</label>
          <input type="number" className="form-input" value={target}
            onChange={e => setTarget(e.target.value)} placeholder="0" min="0" step="100" />
        </div>

        <div className="form-field">
          <label>Account type</label>
          <select className="form-input" value={accountType}
            onChange={e => setAccountType(e.target.value)}>
            <option value="invest">Investment Account — Long-term yield + LT contribution</option>
            <option value="cash">Cash Account — Cash yield + Cash contribution</option>
          </select>
        </div>

        <div className="form-field">
          <label>
            Starting balance{' '}
            <span style={{ color:'var(--muted)', textTransform:'none', letterSpacing:0 }}>(optional)</span>
          </label>
          <input type="number" className="form-input" value={startBal}
            onChange={e => setStartBal(e.target.value)}
            placeholder={defaultBalPlaceholder} min="0" step="100" />
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

/* --- Helpers --- */

function formatEta(m) {
  if (m === 0) return 'now';
  const y  = Math.floor(m / 12);
  const mo = m % 12;
  if (y === 0)  return mo + ' mo';
  if (mo === 0) return y + ' yr' + (y > 1 ? 's' : '');
  return y + 'y ' + mo + 'm';
}

function niceCeil(n) {
  if (n <= 0) return 1000;
  const exp  = Math.pow(10, Math.floor(Math.log10(n)));
  const f    = n / exp;
  let nice;
  if (f <= 1)      nice = 1;
  else if (f <= 2) nice = 2;
  else if (f <= 5) nice = 5;
  else             nice = 10;
  return nice * exp;
}

function abbrev(n) {
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
  if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'k';
  return '$' + Math.round(n);
}

/* --- Sub-components --- */

function Slider({ label, value, min, max, step, format, onChange, ends }) {
  return (
    <div className="control">
      <div className="lbl">{label}</div>
      <div className="val">{format(value)}</div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))} />
      <div className="ends"><span>{ends[0]}</span><span>{ends[1]}</span></div>
    </div>
  );
}

function ProjectionChart({ series, years }) {
  const W = 640, H = 260;
  const PAD_L = 56, PAD_R = 12, PAD_T = 16, PAD_B = 28;
  const maxBal  = Math.max(...series.map(p => p.bal), 1);
  const niceMax = niceCeil(maxBal);
  const x  = m => PAD_L + (m / (series.length - 1)) * (W - PAD_L - PAD_R);
  const y  = b => PAD_T + (1 - b / niceMax) * (H - PAD_T - PAD_B);
  const path = series.map((p, i) =>
    (i ? 'L' : 'M') + x(p.m).toFixed(1) + ' ' + y(p.bal).toFixed(1)
  ).join(' ');
  const areaPath = path
    + ` L ${x(series.length - 1).toFixed(1)} ${(H - PAD_B).toFixed(1)}`
    + ` L ${x(0).toFixed(1)} ${(H - PAD_B).toFixed(1)} Z`;

  const yTicks    = 4;
  const tickVals  = Array.from({ length: yTicks + 1 }, (_, i) => (niceMax * i) / yTicks);
  const xTickCount = Math.min(years, 8);
  const xTicks    = Array.from({ length: xTickCount + 1 }, (_, i) => Math.round((years * i) / xTickCount));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:'auto', display:'block' }}>
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="var(--accent)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {tickVals.map((v, i) => (
        <g key={i}>
          <line x1={PAD_L} x2={W - PAD_R} y1={y(v)} y2={y(v)}
            stroke="var(--line)" strokeWidth="1" />
          <text x={PAD_L - 8} y={y(v) + 4} textAnchor="end"
            fontSize="11" fill="var(--muted)" fontFamily="var(--mono)">{abbrev(v)}</text>
        </g>
      ))}
      {xTicks.map((yr, i) => (
        <text key={i} x={x(yr * 12)} y={H - 10} textAnchor="middle"
          fontSize="11" fill="var(--muted)" fontFamily="var(--mono)">
          {yr === 0 ? 'now' : 'y' + yr}
        </text>
      ))}
      <path d={areaPath} fill="url(#areaGrad)" />
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" />
      <circle
        cx={x(series.length - 1)} cy={y(series[series.length - 1].bal)}
        r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
    </svg>
  );
}

Object.assign(window, { PlanScreen });
