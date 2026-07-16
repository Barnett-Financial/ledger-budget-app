/* budget.jsx: Budget screen + CSV helpers + its modals — split out of index.html (in-browser Babel, no bundler).
   Top-level function declarations stay global across text/babel scripts. */

/* ---- CSV import helpers ---- */
function splitCSVRow(row) {
  const result = []; let cur = '', inQuote = false;
  for (let i = 0; i < row.length; i++) {
    if (row[i] === '"') {
      if (inQuote && row[i+1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (row[i] === ',' && !inQuote) { result.push(cur); cur = ''; }
    else cur += row[i];
  }
  result.push(cur); return result;
}
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => !l.trim().startsWith('#'));
  const headers = splitCSVRow(lines[0]).map(h => h.trim());
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = splitCSVRow(line);
    return Object.fromEntries(headers.map((h, i) => [h, (vals[i] || '').trim()]));
  });
}
function generateCSVTemplate() {
  const notes = [
    '# Ledger Budget Import Template',
    '# IMPORTANT: Format all amount cells as "General" (not Number/Currency) before saving.',
    '#   Number-formatted cells may add commas (e.g. 1,923) which will break the import.',
    '# Type column accepts: Income or Disbursement',
    '# Bucket column accepts: needs, wants, save, give',
    '# Savings tip: name LT savings with "Retirement" or "Long-term"; cash savings with "Savings" or "Cash Savings"',
    '#',
  ];
  const rows = [
    ['Type','Group','Name','Bucket','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
    ['Income','','Salary','','4600','4600','4600','4600','4600','4600','4600','4600','4600','4600','4600','4600'],
    ['Income','','Partner income','','3432','3432','3432','3432','3432','3432','3432','3432','3432','3432','3432','3432'],
    ['Disbursement','Housing','Rent','needs','1923','1923','1923','1923','1923','1923','1923','1923','1923','1923','1923','1923'],
    ['Disbursement','Housing','Utilities','needs','175','175','175','175','175','175','175','175','175','175','175','175'],
    ['Disbursement','Food','Groceries','needs','500','500','500','500','500','500','500','500','500','500','500','500'],
    ['Disbursement','Food','Restaurants','wants','125','125','125','125','125','125','125','125','125','125','125','125'],
    ['Disbursement','Savings','Cash Savings','save','300','300','300','300','300','300','300','300','300','300','300','300'],
    ['Disbursement','Savings','Retirement (401k)','save','500','500','500','500','500','500','500','500','500','500','500','500'],
    ['Disbursement','Giving','Charitable giving','give','1200','1200','1200','1200','1200','1200','1200','1200','1200','1200','1200','1200'],
  ];
  return notes.join('\n') + '\n' + rows.map(r => r.map(v => v.includes(',') ? '"' + v + '"' : v).join(',')).join('\n');
}

/* ---- BudgetScreen ---- */
function BudgetScreen({ data, setData }) {
  const [colMode,            setColMode]            = React.useState('all');
  const [focusMonth,         setFocusMonth]         = React.useState(new Date().getMonth());
  const [showInstructions,   setShowInstructions]   = React.useState(false);
  const [showDebtRateModal,  setShowDebtRateModal]  = React.useState(false);
  const [showGivingGoalModal, setShowGivingGoalModal] = React.useState(false);
  const [settingsRow,        setSettingsRow]        = React.useState(null);
  /* Fix 2.3: pulse the ⚙ gear on first mobile run so it's discoverable */
  const [gearHint,           setGearHint]           = React.useState(
    () => { try { return !localStorage.getItem('ledger.seen.gear'); } catch (_) { return false; } });
  React.useEffect(() => {
    if (settingsRow && gearHint) { setGearHint(false); try { localStorage.setItem('ledger.seen.gear', '1'); } catch (_) {} }
  }, [settingsRow]);
  /* Fix #5: phones use a month-switcher instead of a 12-column scroll */
  const [isMobile,           setIsMobile]           = React.useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches);
  const [mobileAnnual,       setMobileAnnual]       = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = e => setIsMobile(e.matches);
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  const incomeMonthly = MONTHS.map((_, m) => sum(data.income.map(r => r.monthly[m])));
  const incomeAnnual  = sum(incomeMonthly);

  /* Fix 5.1: pretax payroll deductions per income source (monthly amounts).
     Annualized correctly — a deduction only counts in a month where that
     income row actually pays out (take-home > 0), never a flat ×12. */
  const pdFields  = (r) => r.payrollDeductions || {};
  const pdSum     = (r) => { const p = pdFields(r); return (+p.retirement401k||0) + (+p.hsa||0) + (+p.pretaxPremiums||0) + (+p.otherPretax||0); };
  const pdRetHsa  = (r) => { const p = pdFields(r); return (+p.retirement401k||0) + (+p.hsa||0); };
  const pdOther   = (r) => { const p = pdFields(r); return (+p.pretaxPremiums||0) + (+p.otherPretax||0); };
  const payrollActive        = data.income.some(r => pdSum(r) > 0);
  const deductionMonthly     = MONTHS.map((_, m) => sum(data.income.map(r => r.monthly[m] > 0 ? pdSum(r)    : 0)));
  const retHsaMonthlyArr     = MONTHS.map((_, m) => sum(data.income.map(r => r.monthly[m] > 0 ? pdRetHsa(r) : 0)));
  const otherDeductMonthly   = MONTHS.map((_, m) => sum(data.income.map(r => r.monthly[m] > 0 ? pdOther(r)  : 0)));
  const deductionAnnual      = sum(deductionMonthly);
  const retHsaAnnual         = sum(retHsaMonthlyArr);   /* 401k + HSA feed LT savings */
  const otherDeductAnnual    = sum(otherDeductMonthly);
  const grossReceiptsMonthly = MONTHS.map((_, m) => incomeMonthly[m] + deductionMonthly[m]);
  const grossIncomeAnnual    = incomeAnnual + deductionAnnual;

  const groupTotals = data.groups.map(g => {
    const monthly = MONTHS.map((_, m) => sum(g.cats.map(c => c.monthly[m])));
    return { id: g.id, monthly, annual: sum(monthly) };
  });

  const disbursementsMonthly = MONTHS.map((_, m) => sum(groupTotals.map(g => g.monthly[m])));
  const disbursementsAnnual  = sum(disbursementsMonthly);
  const netMonthly = MONTHS.map((_, m) => incomeMonthly[m] - disbursementsMonthly[m]);
  const netAnnual  = sum(netMonthly);

  /* Fix 3.1: routing honors a category's explicit "Counts as" override (c.flow)
     first, falling back to the name regex only when set to Auto. */
  const cashSavingsMonthly = MONTHS.map((_, m) => {
    let s = 0;
    data.groups.forEach(g => g.cats.forEach(c => {
      if (c.bucket === 'save' && !catIsLtSavings(c) && !catIsDebtPayment(c)) s += c.monthly[m];
    }));
    return s;
  });
  const ltSavingsMonthly = MONTHS.map((_, m) => {
    let s = 0;
    data.groups.forEach(g => g.cats.forEach(c => {
      if (c.bucket === 'save' && catIsLtSavings(c) && !catIsDebtPayment(c)) s += c.monthly[m];
    }));
    /* Fix 5.1: pretax 401k + HSA compound into Long-term Invest, month-gated */
    return s + retHsaMonthlyArr[m];
  });

  /* Debt payments = explicit "Debt payment" flow, or name with "debt"/"interest" */
  const debtPaymentsMonthly = MONTHS.map((_, m) => {
    let s = 0;
    data.groups.forEach(g => g.cats.forEach(c => {
      if (catIsDebtPayment(c)) s += (c.monthly[m] || 0);
    }));
    return s;
  });

  const cashRate = (data.planCashYield || 0) / 100 / 12;
  const ltRate   = (data.planLtYield   || 0) / 100 / 12;
  const debtRate = (data.debtInterestRate || 0) / 100 / 12;
  const beginCash = [], endCash = [], beginLT = [], endLT = [], beginDebt = [], endDebt = [];
  let cashBal = +data.beginningCash     || 0;
  let ltBal   = +data.beginningLongTerm || 0;
  let debtBal = +data.beginningDebt     || 0;
  MONTHS.forEach((_, m) => {
    beginCash.push(cashBal); beginLT.push(ltBal); beginDebt.push(debtBal);
    /* Fix 5.2: unallocated net income lands in cash (over-allocation drags it
       down), so end balances reconcile with the "Annual savings" KPI. */
    cashBal = cashBal * (1 + cashRate) + cashSavingsMonthly[m] + netMonthly[m];
    ltBal   = ltBal   * (1 + ltRate)   + ltSavingsMonthly[m];
    debtBal = Math.max(0, debtBal * (1 + debtRate) - debtPaymentsMonthly[m]);
    endCash.push(cashBal); endLT.push(ltBal); endDebt.push(debtBal);
  });

  const bucketAnnual = { needs: 0, wants: 0, save: 0, give: 0, unalloc: 0 };
  data.groups.forEach(g => g.cats.forEach(c => {
    const b = bucketAnnual[c.bucket] != null ? c.bucket : 'unalloc';
    bucketAnnual[b] += sum(c.monthly);
  }));
  const bucketMonthlyAvg = Object.fromEntries(
    Object.entries(bucketAnnual).map(([k, v]) => [k, v / 12])
  );

  /* Fix #2: any under-allocation (net) flows into savings; over-allocation reduces it.
     Fix #6: pretax 401k + HSA also count toward annual savings. */
  const effectiveSaveAnnual = bucketAnnual.save + netAnnual + retHsaAnnual;

  /* Fix 5.1: warn if a payroll deduction duplicates an existing budget category
     (the starter data ships a 'Retirement (401k)' category — a real double-count trap). */
  const deductionCatMatches = [];
  data.groups.forEach(g => g.cats.forEach(c => {
    if (/401k|403b|retirement|hsa/i.test(c.name || '')) deductionCatMatches.push({ name: c.name, monthlyAvg: sum(c.monthly) / 12 });
  }));

  const visibleMonths = React.useMemo(() => {
    if (isMobile)              return mobileAnnual ? [] : [focusMonth];
    if (colMode === 'all')     return MONTHS.map((_, i) => i);
    if (colMode === 'quarter') { const q = Math.floor(focusMonth / 3); return [q*3, q*3+1, q*3+2]; }
    return [focusMonth];
  }, [isMobile, mobileAnnual, colMode, focusMonth]);

  const setIncomeCell      = (id, m, val) => setData(prev => ({ ...prev, income: prev.income.map(r => r.id === id ? { ...r, monthly: r.monthly.map((x, i) => i === m ? val : x) } : r) }));
  const setCatCell         = (gid, cid, m, val) => setData(prev => ({ ...prev, groups: prev.groups.map(g => g.id !== gid ? g : { ...g, cats: g.cats.map(c => c.id !== cid ? c : { ...c, monthly: c.monthly.map((x, i) => i === m ? val : x) }) }) }));
  const setIncomeName      = (id, name) => setData(prev => ({ ...prev, income: prev.income.map(r => r.id === id ? { ...r, name } : r) }));
  const setCatName         = (gid, cid, name) => setData(prev => ({ ...prev, groups: prev.groups.map(g => g.id !== gid ? g : { ...g, cats: g.cats.map(c => c.id !== cid ? c : { ...c, name }) }) }));
  const setGroupName       = (gid, name) => setData(prev => ({ ...prev, groups: prev.groups.map(g => g.id !== gid ? g : { ...g, name }) }));
  const cycleBucket        = (gid, cid) => setData(prev => ({ ...prev, groups: prev.groups.map(g => g.id !== gid ? g : { ...g, cats: g.cats.map(c => c.id !== cid ? c : { ...c, bucket: BUCKET_CYCLE[(BUCKET_CYCLE.indexOf(c.bucket) + 1) % BUCKET_CYCLE.length] }) }) }));
  const addIncome          = () => setData(prev => ({ ...prev, income: [...prev.income, { id: 'inc_' + uid(), name: '', monthly: arr12(0) }] }));
  const addCat             = (gid) => setData(prev => ({ ...prev, groups: prev.groups.map(g => g.id !== gid ? g : { ...g, cats: [...g.cats, { id: 'c_' + uid(), name: '', bucket: 'needs', monthly: arr12(0) }] }) }));
  const addGroup           = () => setData(prev => ({ ...prev, groups: [...prev.groups, { id: 'g_' + uid(), name: 'New Group', cats: [] }] }));
  const delIncome          = (id) => setData(prev => ({ ...prev, income: prev.income.filter(r => r.id !== id) }));
  const delCat             = (gid, cid) => setData(prev => ({ ...prev, groups: prev.groups.map(g => g.id !== gid ? g : { ...g, cats: g.cats.filter(c => c.id !== cid) }) }));
  const delGroup           = (gid) => {
    const g = data.groups.find(gr => gr.id === gid); if (!g) return;
    const msg = g.cats.length > 0
      ? 'Delete "' + g.name + '" and its ' + g.cats.length + ' categor' + (g.cats.length === 1 ? 'y' : 'ies') + '? This cannot be undone.'
      : 'Delete the "' + g.name + '" group?';
    if (!confirm(msg)) return;
    setData(prev => ({ ...prev, groups: prev.groups.filter(gr => gr.id !== gid) }));
  };
  const setBeginningCash      = (v) => setData(prev => ({ ...prev, beginningCash:      v }));
  const setBeginningLongTerm  = (v) => setData(prev => ({ ...prev, beginningLongTerm:  v }));
  const setBeginningDebt      = (v) => setData(prev => ({ ...prev, beginningDebt:      v }));
  const setDebtInterestRate   = (v) => setData(prev => ({ ...prev, debtInterestRate:   v }));
  const setGivingGoal         = (v) => setData(prev => ({ ...prev, givingGoalPct:      v }));
  /* Fix #1: "Fill across from Jan" skips rows set to manual fill (e.g. one-time bonus). */
  const copyJan  = () => setData(prev => ({ ...prev, income: prev.income.map(r => r.fillMode === 'manual' ? r : ({ ...r, monthly: arr12(r.monthly[0]) })), groups: prev.groups.map(g => ({ ...g, cats: g.cats.map(c => c.fillMode === 'manual' ? c : ({ ...c, monthly: arr12(c.monthly[0]) })) })) }));

  /* Fix #1 / #6: per-row settings (fill mode, fund classification, payroll deductions) */
  const setCatSettings    = (gid, cid, patch) => setData(prev => ({ ...prev, groups: prev.groups.map(g => g.id !== gid ? g : { ...g, cats: g.cats.map(c => c.id !== cid ? c : { ...c, ...patch }) }) }));
  const setIncomeSettings = (id, patch)       => setData(prev => ({ ...prev, income: prev.income.map(r => r.id !== id ? r : { ...r, ...patch }) }));

  const importCSV = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.csv,.txt';
    input.onchange = e => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const rows = parseCSV(ev.target.result);
          const monthCols = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          /* Fix 2.1: the CSV has no columns for row settings, so preserve them for
             any imported row whose name matches an existing one (case-insensitive). */
          const incSettings = {};
          data.income.forEach(r => { incSettings[(r.name || '').trim().toLowerCase()] = { fillMode: r.fillMode, payrollDeductions: r.payrollDeductions }; });
          const catSettings = {};
          data.groups.forEach(g => g.cats.forEach(c => { catSettings[(c.name || '').trim().toLowerCase()] = { fillMode: c.fillMode, isFund: c.isFund, flow: c.flow }; }));
          const clean = (o) => { const out = {}; Object.keys(o).forEach(k => { if (o[k] !== undefined) out[k] = o[k]; }); return out; };

          const income = []; const groupMap = {}; const groupOrder = [];
          rows.forEach(row => {
            const type   = (row['Type'] || '').toLowerCase().trim();
            const group  = (row['Group'] || '').trim() || 'Other';
            const name   = (row['Name'] || row['Category'] || '').trim();
            const bucket = (row['Bucket'] || 'needs').toLowerCase().trim();
            const monthly = monthCols.map(m => parseFloat(row[m] || 0) || 0);
            if (!name) return;
            if (type === 'income') {
              income.push({ id: 'inc_' + uid(), name, monthly, ...clean(incSettings[name.toLowerCase()] || {}) });
            } else {
              if (!groupMap[group]) { groupMap[group] = { id: 'g_' + uid(), name: group, cats: [] }; groupOrder.push(group); }
              const validBucket = ['needs','wants','save','give'].includes(bucket) ? bucket : 'needs';
              groupMap[group].cats.push({ id: 'c_' + uid(), name, bucket: validBucket, monthly, ...clean(catSettings[name.toLowerCase()] || {}) });
            }
          });
          const nInc = income.length, nGrp = groupOrder.length;
          const nCat = groupOrder.reduce((a, g) => a + groupMap[g].cats.length, 0);
          if (nInc === 0 && nCat === 0) { alert('No budget data found. Check the CSV format.'); return; }
          if (confirm('Found ' + nInc + ' income source' + (nInc !== 1 ? 's' : '') + ' and ' + nCat + ' categor' + (nCat !== 1 ? 'ies' : 'y') + '. Replace current budget?\n\nRow settings (payroll deductions, Fund, fill mode, "counts as") are kept only for rows whose name matches an existing one; any others reset.')) {
            setData(prev => ({ ...prev, income: nInc > 0 ? income : prev.income, groups: nGrp > 0 ? groupOrder.map(g => groupMap[g]) : prev.groups }));
          }
        } catch (_) { alert('Could not parse the CSV.'); }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const downloadCSVTemplate = () => {
    const blob = new Blob([generateCSVTemplate()], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'ledger-budget-template.csv'; a.click(); URL.revokeObjectURL(a.href);
  };

  /* Fix 2.1: export the current budget in the same CSV shape as the template,
     so it round-trips (edit in a spreadsheet, re-import; matching names keep settings). */
  const exportBudgetCSV = () => {
    const monthCols = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const esc = (v) => { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const lines = [['Type','Group','Name','Bucket', ...monthCols].join(',')];
    data.income.forEach(r => { lines.push(['Income', '', r.name, '', ...r.monthly.map(n => Math.round(n * 100) / 100)].map(esc).join(',')); });
    data.groups.forEach(g => g.cats.forEach(c => { lines.push(['Disbursement', g.name, c.name, c.bucket, ...c.monthly.map(n => Math.round(n * 100) / 100)].map(esc).join(',')); }));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'ledger-budget-' + data.year + '.csv'; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{data.year} <em>cash budget</em></h1>
          <div className="sub">Estimate every dollar in and out, month by month.</div>
        </div>
        <div className="actions">
          <button className="btn ghost" onClick={downloadCSVTemplate}>CSV template</button>
          <button className="btn ghost" onClick={exportBudgetCSV}>Export budget (CSV)</button>
          <button className="btn ghost" onClick={importCSV}>Upload CSV</button>
          <button className="btn ghost" onClick={copyJan}>Fill across from Jan</button>
        </div>
      </div>

      <div style={{ marginBottom:20, border:'1px solid var(--line)', borderRadius:'var(--r-md)', background:'var(--surface)', overflow:'hidden' }}>
        <button style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'11px 18px', fontWeight:500, fontSize:13.5, textAlign:'left' }}
          onClick={() => setShowInstructions(v => !v)}>
          <span>Key notes</span>
          <span style={{ color:'var(--muted)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.08em' }}>{showInstructions ? '▲ Hide' : '▼ Show'}</span>
        </button>
        {showInstructions && (
          <div style={{ padding:'4px 24px 18px', borderTop:'1px solid var(--line-soft)', fontSize:13.5, lineHeight:1.65, color:'var(--ink-soft)' }}>
            <ul style={{ margin:'10px 0 0', padding:'0 0 0 20px', display:'flex', flexDirection:'column', gap:10 }}>
              <li><strong>Bucket assignment:</strong> Click a colored dot next to any category to cycle its bucket: Needs, Wants, Saving, or Giving.</li>
              <li><strong>Cash savings:</strong> Categories with <em>Savings</em> or <em>Cash Savings</em> in the name feed the <strong>Beginning Cash</strong> balance, compounding monthly at the Cash Yield set in the Plan tab.</li>
              <li><strong>Long-term investments:</strong> Categories with <em>Retirement</em> or <em>Long-term</em> in the name feed the <strong>Beginning Long-term Invest</strong> balance, compounding at the Long-term Yield from the Plan tab.</li>
              <li><strong>Debt payments:</strong> Categories with <em>Debt</em> or <em>Interest</em> in the name automatically reduce the Beginning Debt balance each month.</li>
              <li><strong>Row settings (⚙ gear):</strong> Click the gear on any income or category row to open its settings. There you can switch a row to <em>Fill manually</em> so <em>Fill across from Jan</em> skips it (useful for one-time items like a bonus), mark a category as a <em>Fund</em> (it accrues its monthly budget and draws down as you log expenses on the Track tab), or record <em>pretax payroll deductions</em> (401k, HSA, premiums) on an income source for a more accurate savings rate.</li>
              <li><strong>Beginning asset/debt balances</strong> are editable in January only. Subsequent months are auto-computed.</li>
            </ul>
          </div>
        )}
      </div>

      <div className={'kpis' + (payrollActive ? ' kpis-5' : '')}>
        <Kpi label={payrollActive ? 'Take-home income' : 'Annual income'} value={incomeAnnual} />
        {payrollActive && <Kpi label="Gross income" value={grossIncomeAnnual} />}
        <Kpi label="Annual outflow"        value={disbursementsAnnual} />
        <Kpi label="Annual savings"        value={effectiveSaveAnnual} tone={effectiveSaveAnnual > 0 ? 'pos' : undefined} />
        <Kpi label={(+data.beginningDebt || 0) > 0 ? 'Year-end net position' : 'Year-end total wealth'}
             value={Math.round(endCash[11] + endLT[11] - endDebt[11])} />
      </div>

      <AllocationSummary
        bucketAnnual={bucketAnnual} bucketMonthlyAvg={bucketMonthlyAvg}
        incomeAnnual={incomeAnnual} incomeMonthlyAvg={incomeAnnual / 12}
        groupTotals={groupTotals} groups={data.groups}
        netAnnual={netAnnual} grossIncomeAnnual={grossIncomeAnnual}
        retHsaAnnual={retHsaAnnual} otherDeductAnnual={otherDeductAnnual} payrollActive={payrollActive}
        givingGoalPct={data.givingGoalPct} onGivingGoalClick={() => setShowGivingGoalModal(true)}
      />

      <div className="sheet-toolbar">
        <div className="left">
          <div className="bucket-legend">
            {BUCKET_ORDER.map(b => (
              <div key={b} className="item"><span className={'dot ' + b}></span>{BUCKETS[b].label}</div>
            ))}
            <div className="item">
              <Info label="About buckets"
                text="Every category is tagged Needs, Wants, Saving, or Giving. Tap the colored dot on a row to change its bucket — the allocation bar and the rule-of-thumb checks above use these tags." />
            </div>
          </div>
        </div>
        <div className="right">
          <span>Show:</span>
          <select className="col-mode" value={colMode} onChange={e => setColMode(e.target.value)}>
            <option value="all">All 12 months</option>
            <option value="quarter">One quarter</option>
            <option value="month">Single month</option>
          </select>
          {colMode !== 'all' && (
            <>
              <button className="btn ghost" style={{ padding:'4px 10px' }} onClick={() => setFocusMonth((focusMonth + 11) % 12)}>‹</button>
              <span style={{ minWidth:90, textAlign:'center', color:'var(--ink)' }}>
                {colMode === 'quarter' ? 'Q' + (Math.floor(focusMonth / 3) + 1) : MONTHS_LONG[focusMonth]}
              </span>
              <button className="btn ghost" style={{ padding:'4px 10px' }} onClick={() => setFocusMonth((focusMonth + 1) % 12)}>›</button>
            </>
          )}
        </div>
      </div>

      <div className="month-chips">
        <div className="month-nav">
          <button className="month-arrow" aria-label="Previous month"
            onClick={() => { setMobileAnnual(false); setFocusMonth((focusMonth + 11) % 12); }}>&#8249;</button>
          <select className="month-select"
            value={mobileAnnual ? 'annual' : String(focusMonth)}
            onChange={e => {
              const v = e.target.value;
              if (v === 'annual') setMobileAnnual(true);
              else { setMobileAnnual(false); setFocusMonth(parseInt(v, 10)); }
            }}>
            {MONTHS_LONG.map((mo, i) => <option key={i} value={i}>{mo}</option>)}
            <option value="annual">Annual (full year)</option>
          </select>
          <button className="month-arrow" aria-label="Next month"
            onClick={() => { setMobileAnnual(false); setFocusMonth((focusMonth + 1) % 12); }}>&#8250;</button>
        </div>
      </div>

      <div className={'sheet-wrap' + (gearHint ? ' gear-hint' : '')}>
        <div className="sheet-scroll">
          <Sheet
            visibleMonths={visibleMonths} data={data} isMobile={isMobile}
            incomeMonthly={incomeMonthly} incomeAnnual={incomeAnnual}
            payrollActive={payrollActive}
            deductionMonthly={deductionMonthly} deductionAnnual={deductionAnnual}
            grossReceiptsMonthly={grossReceiptsMonthly} grossReceiptsAnnual={grossIncomeAnnual}
            groupTotals={groupTotals}
            disbursementsMonthly={disbursementsMonthly} disbursementsAnnual={disbursementsAnnual}
            netMonthly={netMonthly} netAnnual={netAnnual}
            beginCash={beginCash} endCash={endCash} beginLT={beginLT} endLT={endLT}
            beginDebt={beginDebt} endDebt={endDebt}
            debtInterestRate={data.debtInterestRate || 0}
            setIncomeCell={setIncomeCell} setCatCell={setCatCell}
            setIncomeName={setIncomeName} setCatName={setCatName} setGroupName={setGroupName}
            cycleBucket={cycleBucket}
            addIncome={addIncome} addCat={addCat} addGroup={addGroup}
            delIncome={delIncome} delCat={delCat} delGroup={delGroup}
            setBeginningCash={setBeginningCash} setBeginningLongTerm={setBeginningLongTerm}
            setBeginningDebt={setBeginningDebt}
            onDebtRateClick={() => setShowDebtRateModal(true)}
            onOpenSettings={setSettingsRow}
          />
        </div>
      </div>

      <div className="foot-note">
        <span>Click a colored dot to cycle a category between needs / wants / saving / giving.</span>
        <span>Changes saved automatically.</span>
      </div>

      {showDebtRateModal && (
        <DebtRateModal
          currentRate={data.debtInterestRate || 0}
          onSave={setDebtInterestRate}
          onClose={() => setShowDebtRateModal(false)}
        />
      )}

      {showGivingGoalModal && (
        <GivingGoalModal
          currentGoal={data.givingGoalPct}
          onSave={setGivingGoal}
          onClose={() => setShowGivingGoalModal(false)}
        />
      )}

      {settingsRow && (() => {
        if (settingsRow.kind === 'income') {
          const row = data.income.find(r => r.id === settingsRow.id);
          if (!row) return null;
          return (
            <RowSettingsModal
              kind="income" row={row} netMonthlyAvg={sum(row.monthly) / 12}
              deductionCatMatches={deductionCatMatches}
              onSave={patch => setIncomeSettings(row.id, patch)}
              onClose={() => setSettingsRow(null)}
            />
          );
        }
        const grp = data.groups.find(g => g.id === settingsRow.gid);
        const cat = grp && grp.cats.find(c => c.id === settingsRow.id);
        if (!cat) return null;
        return (
          <RowSettingsModal
            kind="cat" row={cat}
            onSave={patch => setCatSettings(grp.id, cat.id, patch)}
            onClose={() => setSettingsRow(null)}
          />
        );
      })()}
    </div>
  );
}

function Sheet(props) {
  const {
    visibleMonths, data, isMobile,
    incomeMonthly, incomeAnnual, groupTotals,
    payrollActive, deductionMonthly, deductionAnnual, grossReceiptsMonthly, grossReceiptsAnnual,
    disbursementsMonthly, disbursementsAnnual,
    netMonthly, netAnnual,
    beginCash, endCash, beginLT, endLT,
    beginDebt, endDebt, debtInterestRate,
    setIncomeCell, setCatCell, setIncomeName, setCatName, setGroupName,
    cycleBucket, addIncome, addCat, addGroup, delIncome, delCat, delGroup,
    setBeginningCash, setBeginningLongTerm, setBeginningDebt, onDebtRateClick,
    onOpenSettings,
  } = props;

  const n  = visibleMonths.length;
  const monthCols = n > 0 ? 'repeat(' + n + ', minmax(64px, 1fr)) ' : '';
  /* Mobile corners: 18px dot / 80px annual / 30px delete-icon column — the
     delete column is wider than the dot column (row-del needs real tap room
     and must not overlap the annual amount to its left; see styles.css). */
  const ct = isMobile
    ? '18px minmax(112px, 1fr) ' + monthCols + '80px 30px'
    : '28px 224px repeat(' + n + ', minmax(70px, 1fr)) 92px 28px';
  const rs = { gridTemplateColumns: ct };

  return (
    <div>
      <div className="row head" style={rs}>
        <div></div><div>Category</div>
        {visibleMonths.map(m => <div key={m} className="month">{MONTHS[m]}</div>)}
        <div className="annual">Annual</div><div></div>
      </div>

      <div className="row balance begin" style={rs}>
        <div></div>
        <div className="name" style={{ fontSize:12.5 }}>
          {isMobile ? 'Cash Savings' : 'Beginning Cash Savings'}
          {!isMobile && <span style={{ color:'var(--muted)', fontSize:10.5, marginLeft:6 }}>@ {(data.planCashYield||0).toFixed(1)}% yield</span>}
          <Info label="About beginning cash"
            text="Your cash/savings balance on Jan 1. Editable in January only — later months are computed, compounding at the Cash Yield from the Plan tab, plus cash-savings categories each month." />
        </div>
        {visibleMonths.map(m => (
          <div key={m} className="num month">
            {m === 0 ? <NumberInput value={data.beginningCash} onChange={setBeginningCash} /> : <span>{fmt(beginCash[m])}</span>}
          </div>
        ))}
        <div className="num annual">&#8212;</div><div></div>
      </div>

      <div className="row balance begin" style={rs}>
        <div></div>
        <div className="name" style={{ fontSize:12.5 }}>
          {isMobile ? 'Long-term Invest' : 'Beginning Long-term Invest'}
          {!isMobile && <span style={{ color:'var(--muted)', fontSize:10.5, marginLeft:6 }}>@ {(data.planLtYield||0).toFixed(1)}% yield</span>}
          <Info label="About beginning long-term balance"
            text="Your long-term investment balance on Jan 1. Editable in January only — later months compound at the Long-term Yield, plus retirement/long-term categories and any pretax 401(k)/HSA each month." />
        </div>
        {visibleMonths.map(m => (
          <div key={m} className="num month">
            {m === 0 ? <NumberInput value={data.beginningLongTerm} onChange={setBeginningLongTerm} /> : <span>{fmt(beginLT[m])}</span>}
          </div>
        ))}
        <div className="num annual">&#8212;</div><div></div>
      </div>

      <div className="row balance begin" style={{ ...rs, borderBottom:'1px solid var(--line)' }}>
        <div></div>
        <div className="name" style={{ fontSize:12.5 }}>
          {isMobile ? 'Debt' : 'Beginning Debt'}
          <button
            onClick={onDebtRateClick}
            title="Set debt interest rate"
            style={{ marginLeft:6, fontSize:10.5, color:'var(--warn)', background:'rgba(200,54,43,0.08)', border:'1px solid rgba(200,54,43,0.25)', borderRadius:4, padding:'1px 7px', cursor:'pointer', fontFamily:'var(--mono)' }}>
            {(debtInterestRate||0).toFixed(1)}% rate
          </button>
          <Info label="About beginning debt"
            text="Your debt balance on Jan 1. Categories that count as debt payments reduce it each month; interest accrues at the rate on the button. Set a category to “Debt payment” in its ⚙ settings if the name isn’t obvious." />
        </div>
        {visibleMonths.map(m => (
          <div key={m} className="num month" style={{ color:'var(--warn)' }}>
            {m === 0
              ? <NumberInput value={data.beginningDebt} onChange={setBeginningDebt} />
              : beginDebt[m] > 0 ? <span>{fmt(beginDebt[m])}</span> : <span style={{ color:'var(--muted)' }}>&#8212;</span>}
          </div>
        ))}
        <div className="num annual">&#8212;</div><div></div>
      </div>

      <div className="row section" style={rs}>
        <div></div><div>Receipts</div>
        {visibleMonths.map(m => <div key={m}></div>)}
        <div></div><div></div>
      </div>

      {data.income.map(row => (
        <div key={row.id} className="row income" style={rs}>
          <div><span className="bucket-dot inc"></span></div>
          <div className="name" style={{ display:'flex', alignItems:'center', gap:4 }}>
            <input style={{ flex:1, minWidth:0 }} value={row.name} placeholder="Income source" onChange={e => setIncomeName(row.id, e.target.value)} />
            {(row.payrollDeductions && ((+row.payrollDeductions.retirement401k||0)+(+row.payrollDeductions.hsa||0)+(+row.payrollDeductions.pretaxPremiums||0)+(+row.payrollDeductions.otherPretax||0)) > 0) && <span className="row-tag">Pretax</span>}
            {row.fillMode === 'manual' && <span className="row-tag">Manual</span>}
            <button className="row-gear" aria-label="Income settings" title="Income settings — fill mode &amp; payroll deductions" onClick={() => onOpenSettings({ kind:'income', id:row.id })}>&#9881;</button>
          </div>
          {visibleMonths.map(m => (
            <div key={m} className="num month"><NumberInput value={row.monthly[m]} onChange={v => setIncomeCell(row.id, m, v)} /></div>
          ))}
          <div className="num annual">{fmt(sum(row.monthly))}</div>
          <button className="row-del" aria-label="Delete income source" onClick={() => delIncome(row.id)}>&#215;</button>
        </div>
      ))}

      <button className="add-row" onClick={addIncome}><span className="plus">+</span><span className="lbl">Add income source</span></button>

      <div className="row total" style={rs}>
        <div></div><div className="name">{payrollActive ? 'Total receipts (take-home)' : 'Total receipts'}</div>
        {visibleMonths.map(m => <div key={m} className="num month">{fmt(incomeMonthly[m])}</div>)}
        <div className="num annual">{fmt(incomeAnnual)}</div><div></div>
      </div>

      {/* Fix 5.1: make pretax dollars visibly flow through the sheet */}
      {payrollActive && (
        <div className="row balance" style={rs}>
          <div></div>
          <div className="name" style={{ fontSize:12.5, color:'var(--muted)' }}>
            Pretax payroll deductions
            <Info label="About pretax deductions"
              text="401(k), HSA, premiums and other pretax amounts withheld before take-home pay. Read-only — edit these on an income row's ⚙ settings." />
          </div>
          {visibleMonths.map(m => (
            <div key={m} className="num month" style={{ color:'var(--muted)' }}>{fmt(deductionMonthly[m], { zero:'—' })}</div>
          ))}
          <div className="num annual" style={{ color:'var(--muted)' }}>{fmt(deductionAnnual)}</div><div></div>
        </div>
      )}
      {payrollActive && (
        <div className="row total" style={rs}>
          <div></div><div className="name">Gross receipts</div>
          {visibleMonths.map(m => <div key={m} className="num month">{fmt(grossReceiptsMonthly[m])}</div>)}
          <div className="num annual">{fmt(grossReceiptsAnnual)}</div><div></div>
        </div>
      )}

      <div className="row section" style={rs}>
        <div></div><div>Disbursements</div>
        {visibleMonths.map(m => <div key={m}></div>)}
        <div></div><div></div>
      </div>

      {data.groups.map((g, gi) => {
        const gt = groupTotals[gi];
        return (
          <React.Fragment key={g.id}>
            <div className="row group" style={rs}>
              <div></div>
              <div className="name"><input value={g.name} placeholder="Group name" onChange={e => setGroupName(g.id, e.target.value)} style={{ fontWeight:500 }} /></div>
              {visibleMonths.map(m => <div key={m} className="num month muted">{fmt(gt.monthly[m], { zero:'-' })}</div>)}
              <div className="num annual">{fmt(gt.annual)}</div>
              <button className="row-del" aria-label="Delete group" onClick={() => delGroup(g.id)}>&#215;</button>
            </div>

            {g.cats.map(c => (
              <div key={c.id} className="row cat" style={rs}>
                <div>
                  <span className={'bucket-dot ' + c.bucket}
                    title={'Bucket: ' + BUCKETS[c.bucket].label + ' — click to change'}
                    onClick={() => cycleBucket(g.id, c.id)}></span>
                </div>
                <div className="name" style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <input style={{ flex:1, minWidth:0 }} value={c.name} placeholder="Category" onChange={e => setCatName(g.id, c.id, e.target.value)} />
                  {c.isFund && <span className="row-tag fund" style={{ cursor:'help' }} title="Fund: this category accrues its monthly budget and draws down as you log expenses on the Track tab, showing a running balance instead of resetting each month.">Fund</span>}
                  {c.fillMode === 'manual' && <span className="row-tag">Manual</span>}
                  <button className="row-gear" aria-label="Category settings" title="Category settings — fill mode, fund &amp; counts-as" onClick={() => onOpenSettings({ kind:'cat', gid:g.id, id:c.id })}>&#9881;</button>
                </div>
                {visibleMonths.map(m => (
                  <div key={m} className="num month"><NumberInput value={c.monthly[m]} onChange={v => setCatCell(g.id, c.id, m, v)} dim /></div>
                ))}
                <div className="num annual">{fmt(sum(c.monthly))}</div>
                <button className="row-del" aria-label="Delete category" onClick={() => delCat(g.id, c.id)}>&#215;</button>
              </div>
            ))}

            <button className="add-row" onClick={() => addCat(g.id)}>
              <span className="plus">+</span><span className="lbl">Add to {g.name.toLowerCase() || 'group'}</span>
            </button>
          </React.Fragment>
        );
      })}

      <button className="add-row" onClick={addGroup} style={{ borderTop:'1px solid var(--line)', borderBottom:'1px solid var(--line-soft)' }}>
        <span className="plus">+</span><span className="lbl">Add group</span>
      </button>

      <div className="row total" style={rs}>
        <div></div><div className="name">Total disbursements</div>
        {visibleMonths.map(m => <div key={m} className="num month">{fmt(disbursementsMonthly[m])}</div>)}
        <div className="num annual">{fmt(disbursementsAnnual)}</div><div></div>
      </div>

      <div className="row net" style={rs}>
        <div></div>
        <div className="name" style={{ color: netAnnual < 0 ? 'var(--warn)' : 'var(--ink)' }}>
          {netAnnual < 0 ? 'Over allocated' : 'Under allocated'}
        </div>
        {visibleMonths.map(m => (
          <div key={m} className={'num month ' + (netMonthly[m] < 0 ? 'neg' : '')}>
            {fmt(netMonthly[m], { sign:true, zero:'$0' })}
          </div>
        ))}
        <div className={'num annual ' + (netAnnual < 0 ? 'neg' : '')}>{fmt(netAnnual, { sign:true, zero:'$0' })}</div>
        <div></div>
      </div>

      <div className="row balance" style={rs}>
        <div></div>
        <div className="name" style={{ fontStyle:'italic', color:'var(--accent)' }}>Total savings (Cash + LT)</div>
        {visibleMonths.map(m => (
          <div key={m} className="num month" style={{ color:'var(--accent)' }}>{fmt(Math.round(endCash[m] + endLT[m]))}</div>
        ))}
        <div className="num annual" style={{ color:'var(--accent)' }}>{fmt(Math.round(endCash[11] + endLT[11]))}</div>
        <div></div>
      </div>
    </div>
  );
}

function AllocationSummary({ bucketAnnual, bucketMonthlyAvg, incomeAnnual, incomeMonthlyAvg, groupTotals, groups, netAnnual = 0, grossIncomeAnnual = 0, retHsaAnnual = 0, otherDeductAnnual = 0, payrollActive = false, givingGoalPct, onGivingGoalClick }) {
  /* Fix 4.2: when payroll deductions are set, the WHOLE component uses gross as
     the denominator and shows pretax dollars as their own bar segments, so the
     bar, legend, and rules all share one baseline (gross). Without deductions
     it behaves exactly as before (take-home baseline). */
  const denom      = (payrollActive ? grossIncomeAnnual : incomeAnnual) || 1;
  /* Fix #2: fold net (under/over allocation) into Saving so leftover cash is saved. */
  const saveWithNet = bucketAnnual.save + netAnnual;
  const saveAvg     = saveWithNet / 12;
  const seg        = n => Math.max(0, (n / denom) * 100);
  const showUnalloc = bucketAnnual.unalloc > 0;
  const showPretax  = payrollActive && retHsaAnnual > 0;
  const showOther   = payrollActive && otherDeductAnnual > 0;
  const housingGroup = groupTotals.find((gt, i) => groups[i] && groups[i].name.toLowerCase() === 'housing');
  const housingPct   = housingGroup ? housingGroup.annual / denom : 0;
  const savingsRateNum = saveWithNet + retHsaAnnual;   /* pretax 401k/HSA count as saving */
  const savingRate     = savingsRateNum / denom;
  const givingRate     = bucketAnnual.give / denom;
  /* Giving has no universal rule of thumb like Housing/Savings do, so it only
     turns red/green once the user sets their own goal (⚙ pill below). With no
     goal set it stays neutral instead of defaulting to a misleading red. */
  const hasGivingGoal  = givingGoalPct != null && givingGoalPct !== '';
  const givingOk       = hasGivingGoal ? givingRate >= (givingGoalPct / 100) : null;
  return (
    <div className="alloc">
      <div className="alloc-head">
        <h3>Allocation of every dollar earned</h3>
        <div className="income">
          {payrollActive
            ? fmtAccurate(grossIncomeAnnual / 12) + ' gross avg / month · ' + fmt(grossIncomeAnnual) + ' gross / year'
            : fmtAccurate(incomeMonthlyAvg) + ' avg / month · ' + fmt(incomeAnnual) + ' / year'}
        </div>
      </div>
      <div className="alloc-bar">
        <div className="seg-needs" style={{ width: seg(bucketAnnual.needs) + '%' }}></div>
        <div className="seg-wants" style={{ width: seg(bucketAnnual.wants) + '%' }}></div>
        <div className="seg-save"  style={{ width: seg(saveWithNet)        + '%' }}></div>
        {showPretax && <div className="seg-save" style={{ width: seg(retHsaAnnual) + '%', opacity:0.6 }}></div>}
        {showOther  && <div style={{ width: seg(otherDeductAnnual) + '%', height:'100%', background:'var(--muted)', opacity:0.35 }}></div>}
        <div className="seg-give"  style={{ width: seg(bucketAnnual.give)  + '%' }}></div>
        {showUnalloc && <div className="seg-left" style={{ width: seg(bucketAnnual.unalloc) + '%' }}></div>}
      </div>
      <div className="alloc-legend">
        <LegItem dot="needs" label="Needs"  amt={bucketAnnual.needs} p={bucketAnnual.needs/denom} avg={bucketMonthlyAvg.needs} />
        <LegItem dot="wants" label="Wants"  amt={bucketAnnual.wants} p={bucketAnnual.wants/denom} avg={bucketMonthlyAvg.wants} />
        <LegItem dot="save"  label="Saving" amt={saveWithNet}        p={saveWithNet /denom}       avg={saveAvg} />
        {showPretax && <LegItem dot="save" label="Pretax savings"           amt={retHsaAnnual}     p={retHsaAnnual/denom}     avg={retHsaAnnual/12} />}
        {showOther  && <LegItem dot="left" label="Other payroll deductions" amt={otherDeductAnnual} p={otherDeductAnnual/denom} avg={otherDeductAnnual/12} />}
        <LegItem dot="give"  label="Giving" amt={bucketAnnual.give}  p={bucketAnnual.give /denom} avg={bucketMonthlyAvg.give} />
        {showUnalloc && <LegItem dot="left" label="Unallocated" amt={bucketAnnual.unalloc} p={bucketAnnual.unalloc/denom} avg={bucketMonthlyAvg.unalloc} />}
      </div>
      <div className="alloc-rules">
        <Rule label="Housing"      sub={payrollActive ? 'rule of thumb: under 30% of gross' : 'rule of thumb: under 30% of income'} val={pct1(housingGroup ? housingGroup.annual : 0, denom)} ok={housingPct <= 0.30} />
        <Rule label="Savings rate" sub={payrollActive ? 'rule of thumb: 15% or more (of gross)' : 'rule of thumb: 15% or more'} val={pct1(savingsRateNum, denom)} ok={savingRate >= 0.15} />
        <Rule label="Giving"
          sub={hasGivingGoal ? 'your goal: ' + givingGoalPct + '% or more' : 'no goal set yet'}
          val={pct1(bucketAnnual.give, denom)} ok={givingOk}
          goalBtn={
            <button type="button" className="goal-pill" onClick={onGivingGoalClick}>
              {hasGivingGoal ? 'Edit goal' : 'Set a giving goal'}
            </button>
          } />
      </div>
    </div>
  );
}

function LegItem({ dot, label, amt, p, avg }) {
  return (
    <div className="leg">
      <div className="row1"><span className={'dot ' + dot}></span>{label}</div>
      <div className="amt">{fmt(amt, { zero:'$0' })}</div>
      <div className="pct">{Math.round(p * 100)}% &middot; {fmt(avg, { zero:'$0' })}/mo</div>
    </div>
  );
}
function Rule({ label, sub, val, ok, goalBtn }) {
  const state = ok === null || ok === undefined ? 'neutral' : (ok ? 'ok' : 'warn');
  return (
    <div className="rule">
      <div className="lhs">
        <span>{label}</span>
        {sub && <small>{sub}</small>}
        {goalBtn}
      </div>
      <div className={'rhs ' + state}>{val}</div>
    </div>
  );
}
/* Fix #1 / #6: per-row settings — fill mode, fund classification, payroll deductions */
function RowSettingsModal({ kind, row, netMonthlyAvg = 0, deductionCatMatches = [], onSave, onClose }) {
  useEscapeClose(onClose);
  const isIncome = kind === 'income';
  const [fillMode, setFillMode] = React.useState(row.fillMode === 'manual' ? 'manual' : 'across');
  const [isFund,   setIsFund]   = React.useState(!!row.isFund);
  const [flow,     setFlow]     = React.useState(row.flow || 'auto');   /* Fix 3.1 */

  const pd = row.payrollDeductions || {};
  const [r401k, setR401k] = React.useState(pd.retirement401k != null ? String(pd.retirement401k) : '');
  const [hsa,   setHsa]   = React.useState(pd.hsa            != null ? String(pd.hsa)            : '');
  const [prem,  setPrem]  = React.useState(pd.pretaxPremiums != null ? String(pd.pretaxPremiums) : '');
  const [other, setOther] = React.useState(pd.otherPretax    != null ? String(pd.otherPretax)    : '');
  const [gross, setGross] = React.useState(pd.grossMonthly   != null ? String(pd.grossMonthly)   : '');

  const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
  const dedTotal   = num(r401k) + num(hsa) + num(prem) + num(other);
  const net        = netMonthlyAvg || 0;
  const grossGiven = gross.trim() !== '';
  const grossVal   = grossGiven ? num(gross) : (net + dedTotal);
  const implied    = grossGiven ? (grossVal - net - dedTotal) : 0;

  let error = '';
  if (num(r401k) < 0 || num(hsa) < 0 || num(prem) < 0 || num(other) < 0 || num(gross) < 0) error = 'Amounts cannot be negative.';
  else if (net > 0 && dedTotal > net * 2) error = 'Pretax deductions look too large versus take-home pay. Enter monthly amounts.';
  else if (grossGiven && implied < 0)     error = 'Gross pay is less than take-home plus deductions — check your numbers.';

  const handleSave = () => {
    if (error) return;
    if (isIncome) {
      /* Fix 5.1: double-count guard — a 401k/HSA deduction plus a same-named
         budget category would count the money twice. */
      if ((num(r401k) > 0 || num(hsa) > 0) && deductionCatMatches.length) {
        const list = deductionCatMatches
          .map(m => "'" + m.name + "' (" + fmt(m.monthlyAvg, { zero:'$0' }) + '/mo)').join(', ');
        const ok = confirm(
          'You also budget ' + list + ' as a spending category.\n\n' +
          'If that is the same money as this payroll deduction, it will be counted twice. ' +
          'Recommended: keep the payroll deduction here and delete that budget category.\n\n' +
          'OK = save the deduction anyway   ·   Cancel = go back');
        if (!ok) return;
      }
      const payrollDeductions = {
        retirement401k: num(r401k), hsa: num(hsa),
        pretaxPremiums: num(prem),  otherPretax: num(other),
      };
      if (grossGiven) payrollDeductions.grossMonthly = num(gross);
      onSave({ fillMode, payrollDeductions });
    } else {
      onSave({ fillMode, isFund, flow });
    }
    onClose();
  };

  const dedField = (label, value, setter) => (
    <div className="form-field" style={{ marginBottom:10 }}>
      <label style={{ marginBottom:4 }}>{label} <span style={{ color:'var(--muted)', textTransform:'none', letterSpacing:0 }}>/ month</span></label>
      <input type="number" inputMode="decimal" min="0" step="10" className="form-input" placeholder="0" value={value} onChange={e => setter(e.target.value)} />
    </div>
  );
  const reconRow = (label, val, opts) => (
    <div style={{ display:'flex', justifyContent:'space-between', fontSize:12.5, padding:'3px 0', color:(opts && opts.muted) ? 'var(--muted)' : 'var(--ink-soft)', ...(opts && opts.strong ? { fontWeight:600, color:'var(--ink)', borderTop:'1px solid var(--line)', marginTop:4, paddingTop:6 } : {}) }}>
      <span>{label}</span><span style={{ fontFamily:'var(--mono)' }}>{val}</span>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={isIncome ? 'Income settings' : 'Category settings'} style={{ width: isIncome ? 440 : 380 }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSave(); }}>
        <div className="modal-head">
          <h2>{isIncome ? 'Income settings' : 'Category settings'}</h2>
          <button className="modal-close" aria-label="Close" onClick={onClose}>&#215;</button>
        </div>
        <div style={{ fontSize:13, color:'var(--muted)', margin:'-4px 0 14px' }}>{row.name || (isIncome ? 'Income source' : 'Category')}</div>

        <div className="form-field">
          <label>Fill behavior</label>
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:4 }}>
            <label style={{ display:'flex', alignItems:'flex-start', gap:8, cursor:'pointer', fontWeight:400, textTransform:'none', letterSpacing:0 }}>
              <input type="radio" name="fillMode" checked={fillMode === 'across'} onChange={() => setFillMode('across')} style={{ marginTop:2 }} />
              <span><strong>Fill across</strong> — "Fill across from Jan" copies January to every month.</span>
            </label>
            <label style={{ display:'flex', alignItems:'flex-start', gap:8, cursor:'pointer', fontWeight:400, textTransform:'none', letterSpacing:0 }}>
              <input type="radio" name="fillMode" checked={fillMode === 'manual'} onChange={() => setFillMode('manual')} style={{ marginTop:2 }} />
              <span><strong>Fill manually</strong> — leave this row alone (e.g. a one-time bonus).</span>
            </label>
          </div>
        </div>

        {!isIncome && (
          <div className="form-field">
            <label>Classification</label>
            <label style={{ display:'flex', alignItems:'flex-start', gap:8, cursor:'pointer', fontWeight:400, textTransform:'none', letterSpacing:0, marginTop:4 }}>
              <input type="checkbox" checked={isFund} onChange={e => setIsFund(e.target.checked)} style={{ marginTop:2 }} />
              <span><strong>Fund</strong> — accrues its monthly budget and draws down as you log expenses on the Track tab. The Track card shows accrued budget to date less actual spending.</span>
            </label>

            <label style={{ marginTop:16 }}>Counts as</label>
            <select className="form-input" value={flow} onChange={e => setFlow(e.target.value)}>
              <option value="auto">Auto — decide from the category name</option>
              <option value="cash">Cash savings — feeds Beginning Cash</option>
              <option value="lt">Long-term investing — feeds Beginning Long-term</option>
              <option value="debt">Debt payment — reduces Beginning Debt</option>
            </select>
            <p style={{ fontSize:12, color:'var(--muted)', margin:'6px 0 0', textTransform:'none', letterSpacing:0 }}>
              Overrides the name guess. Use this so "Roth IRA" or "Brokerage" route to long-term, and "Student loan" or "Car payment" count as debt.
            </p>
          </div>
        )}

        {isIncome && (
          <div className="form-field">
            <label>Pretax payroll deductions</label>
            <p style={{ fontSize:12, color:'var(--muted)', margin:'2px 0 12px', textTransform:'none', letterSpacing:0 }}>
              Money withheld before your take-home pay. Leaving these at zero keeps every calculation exactly as before. Enter each amount here <em>only if it is not already a budget category</em> — otherwise it will be counted twice.
            </p>
            {dedField('401(k) / 403(b)', r401k, setR401k)}
            {dedField('HSA', hsa, setHsa)}
            {dedField('Pretax premiums', prem, setPrem)}
            {dedField('Other pretax', other, setOther)}
            <div className="form-field" style={{ marginBottom:6 }}>
              <label style={{ marginBottom:4 }}>Gross pay <span style={{ color:'var(--muted)', textTransform:'none', letterSpacing:0 }}>/ month (optional)</span></label>
              <input type="number" inputMode="decimal" min="0" step="50" className="form-input" placeholder="optional — reveals implied taxes" value={gross} onChange={e => setGross(e.target.value)} />
            </div>
            <div style={{ background:'var(--bg-soft)', border:'1px solid var(--line-soft)', borderRadius:'var(--r-md)', padding:'10px 14px', marginTop:6 }}>
              {reconRow('Take-home (avg / mo)', fmtAccurate(net), { muted:true })}
              {reconRow('+ 401(k) / 403(b)', fmtAccurate(num(r401k)), { muted:true })}
              {reconRow('+ HSA', fmtAccurate(num(hsa)), { muted:true })}
              {reconRow('+ Pretax premiums', fmtAccurate(num(prem)), { muted:true })}
              {reconRow('+ Other pretax', fmtAccurate(num(other)), { muted:true })}
              {grossGiven && reconRow('+ Implied taxes / withholding', fmtAccurate(implied), { muted:true })}
              {reconRow(grossGiven ? 'Gross pay (entered)' : 'Gross pay (implied)', fmtAccurate(grossVal), { strong:true })}
            </div>
          </div>
        )}

        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={handleSave} disabled={!!error} style={error ? { opacity:0.5, cursor:'not-allowed' } : undefined}>Save</button>
        </div>
      </div>
    </div>
  );
}

function DebtRateModal({ currentRate, onSave, onClose }) {
  useEscapeClose(onClose);
  const [rate, setRate] = React.useState(String(currentRate));
  const handleSave = () => {
    const r = parseFloat(rate);
    if (!isNaN(r) && r >= 0 && r <= 100) onSave(r);
    onClose();
  };
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Debt interest rate" style={{ width:340 }} onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}>
        <div className="modal-head">
          <h2>Debt interest rate</h2>
          <button className="modal-close" aria-label="Close" onClick={onClose}>&#215;</button>
        </div>
        <div className="form-field">
          <label>Annual interest rate (%)</label>
          <input type="number" inputMode="decimal" className="form-input" value={rate}
            onChange={e => setRate(e.target.value)}
            min="0" max="100" step="0.25" autoFocus placeholder="e.g. 6.5" />
        </div>
        <p style={{ fontSize:12.5, color:'var(--muted)', margin:'-4px 0 16px' }}>
          Used to accrue monthly interest on your Beginning Debt balance. Categories named with "debt" or "interest" automatically reduce the balance each month.
        </p>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}

function GivingGoalModal({ currentGoal, onSave, onClose }) {
  useEscapeClose(onClose);
  const [goal, setGoal] = React.useState(currentGoal != null ? String(currentGoal) : '');
  const handleSave = () => {
    const g = parseFloat(goal);
    if (!isNaN(g) && g >= 0 && g <= 100) onSave(g);
    else onSave(null);
    onClose();
  };
  const handleClear = () => { onSave(null); onClose(); };
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Giving goal" style={{ width:340 }} onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}>
        <div className="modal-head">
          <h2>Giving goal</h2>
          <button className="modal-close" aria-label="Close" onClick={onClose}>&#215;</button>
        </div>
        <div className="form-field">
          <label>Target giving (% of income)</label>
          <input type="number" inputMode="decimal" className="form-input" value={goal}
            onChange={e => setGoal(e.target.value)}
            min="0" max="100" step="0.5" autoFocus placeholder="e.g. 10" />
        </div>
        <p style={{ fontSize:12.5, color:'var(--muted)', margin:'-4px 0 16px' }}>
          There's no universal rule of thumb for giving the way there is for housing or savings — set whatever target fits your own goals. The Giving row above turns green once you're at or above it.
        </p>
        <div className="modal-actions">
          {currentGoal != null && <button className="btn" onClick={handleClear}>Clear goal</button>}
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
