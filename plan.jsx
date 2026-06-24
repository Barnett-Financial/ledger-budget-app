/* Plan screen — compound savings projection with interactive sliders */

function PlanScreen({ data }) {
  /* Derive defaults from the current budget */
  const monthlySaveDefault = React.useMemo(() => {
    let s = 0;
    data.groups.forEach(g => g.cats.forEach(c => {
      if (c.bucket === 'save') s += sum(c.monthly);
    }));
    return Math.round(s / 12);
  }, [data.groups]);

  const incomeTotalMonthly = React.useMemo(() => {
    return Math.round(sum(data.income.map(r => sum(r.monthly))) / 12);
  }, [data.income]);

  const [monthlySave,  setMonthlySave]  = React.useState(monthlySaveDefault > 0 ? monthlySaveDefault : 800);
  const [annualReturn, setAnnualReturn] = React.useState(6);
  const [years,        setYears]        = React.useState(10);
  const [startBalance, setStartBalance] = React.useState(data.beginningBalance || 18000);

  const months = years * 12;
  const r      = annualReturn / 100 / 12;

  const series = React.useMemo(() => {
    const out = [];
    let bal   = startBalance;
    for (let m = 0; m <= months; m++) {
      out.push({ m, bal });
      bal = bal * (1 + r) + monthlySave;
    }
    return out;
  }, [months, r, startBalance, monthlySave]);

  const finalBal    = series[series.length - 1].bal;
  const contributed = startBalance + monthlySave * months;
  const earned      = finalBal - contributed;

  /* Monthly needs + wants for milestone targets */
  let monthlyNeedsWants = 0;
  data.groups.forEach(g => g.cats.forEach(c => {
    if (c.bucket === 'needs' || c.bucket === 'wants') {
      monthlyNeedsWants += sum(c.monthly) / 12;
    }
  }));
  if (monthlyNeedsWants === 0) monthlyNeedsWants = 3000;

  const milestones = [
    { name: 'Emergency fund',         detail: '3 months of essentials',  target: monthlyNeedsWants * 3 },
    { name: 'House down payment',     detail: '20% on a $450k home',     target: 90000 },
    { name: 'Sabbatical fund',        detail: '6 months of income',      target: incomeTotalMonthly * 6 },
    { name: 'Financial independence', detail: '25× annual essentials',   target: monthlyNeedsWants * 12 * 25 },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Plan for what's <em>next</em></h1>
          <div className="sub">
            See how your saving rate compounds over time. Adjust contribution and return
            to test how your milestones move in or out of reach.
          </div>
        </div>
        <div className="actions">
          <button className="btn ghost"
            onClick={() => {
              setMonthlySave(monthlySaveDefault > 0 ? monthlySaveDefault : 800);
              setStartBalance(data.beginningBalance || 0);
            }}>
            Reset to budget
          </button>
        </div>
      </div>

      <div className="kpis">
        <Kpi label="Saving / month"      value={monthlySave} />
        <Kpi label="Time horizon"        value={years} integer suffix=" yrs" />
        <Kpi label="Projected balance"   value={Math.round(finalBal)} />
        <Kpi label="Growth from returns" value={Math.round(earned)} />
      </div>

      <div className="plan-grid">
        <div className="chart-card">
          <h3>Projected balance</h3>
          <div className="caption">
            {fmt(monthlySave, { zero:'$0' })}/mo at {annualReturn}% return, starting from {fmt(startBalance, { zero:'$0' })}.
          </div>
          <ProjectionChart series={series} years={years} />
        </div>

        <div className="plan-controls">
          <Slider label="Monthly contribution" value={monthlySave}
            min={0} max={5000} step={50}
            format={v => fmt(v, { zero: '$0' })}
            onChange={setMonthlySave} ends={['$0', '$5,000']} />
          <Slider label="Expected annual return" value={annualReturn}
            min={0} max={12} step={0.5}
            format={v => v + '%'}
            onChange={setAnnualReturn} ends={['0%', '12%']} />
          <Slider label="Time horizon" value={years}
            min={1} max={40} step={1}
            format={v => v + ' years'}
            onChange={setYears} ends={['1 yr', '40 yrs']} />
          <Slider label="Starting balance" value={startBalance}
            min={0} max={1000000} step={1000}
            format={v => fmt(v, { zero: '$0' })}
            onChange={setStartBalance} ends={['$0', '$1M']} />
        </div>
      </div>

      <div className="milestones">
        <h3>Milestones at this rate</h3>
        {milestones.map(m => {
          const eta = monthsToReach(m.target, startBalance, monthlySave, r);
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
      </div>

      <div className="foot-note">
        <span>Projections assume steady monthly contributions and returns; values are nominal dollars.</span>
        <span>Compounded monthly</span>
      </div>
    </div>
  );
}

/* --- Helpers --- */

function monthsToReach(target, start, monthly, r) {
  let bal = start;
  if (bal >= target) return 0;
  if (monthly <= 0 && r <= 0) return null;
  for (let m = 1; m <= 12 * 60; m++) {
    bal = bal * (1 + r) + monthly;
    if (bal >= target) return m;
  }
  return null;
}

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
  if (f <= 1)  nice = 1;
  else if (f <= 2) nice = 2;
  else if (f <= 5) nice = 5;
  else nice = 10;
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
