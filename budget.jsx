/* Annual cash-budget spreadsheet — Budget screen */

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
  return notes.join('\n') + '\n' + rows.map(r => r.map(v => v.includes(',') ? `"${v}"` : v).join(',')).join('\n');
}

function BudgetScreen({ data, setData }) {
  const [colMode,          setColMode]          = React.useState('all');
  const [focusMonth,       setFocusMonth]       = React.useState(new Date().getMonth());
  const [saved,            setSaved]            = React.useState(false);
  const [showInstructions, setShowInstructions] = React.useState(false);

  /* --- Derived totals --- */

  const incomeMonthly = MONTHS.map((_, m) =>
    sum(data.income.map(r => r.monthly[m]))
  );
  const incomeAnnual = sum(incomeMonthly);

  const groupTotals = data.groups.map(g => {
    const monthly = MONTHS.map((_, m) => sum(g.cats.map(c => c.monthly[m])));
    return { id: g.id, monthly, annual: sum(monthly) };
  });

  const disbursementsMonthly = MONTHS.map((_, m) =>
    sum(groupTotals.map(g => g.monthly[m]))
  );
  const disbursementsAnnual = sum(disbursementsMonthly);

  const netMonthly = MONTHS.map((_, m) => incomeMonthly[m] - disbursementsMonthly[m]);
  const netAnnual  = sum(netMonthly);

  /* --- Classify savings by name pattern --- */
  /* LT: name includes "Retirement" or "Long-term"       */
  /* Cash: everything else in the save bucket            */

  const cashSavingsMonthly = MONTHS.map((_, m) => {
    let s = 0;
    data.groups.forEach(g => g.cats.forEach(c => {
      if (c.bucket === 'save' && !isLtSavings(c.name)) s += c.monthly[m];
    }));
    return s;
  });
  const ltSavingsMonthly = MONTHS.map((_, m) => {
    let s = 0;
    data.groups.forEach(g => g.cats.forEach(c => {
      if (c.bucket === 'save' && isLtSavings(c.name)) s += c.monthly[m];
    }));
    return s;
  });

  /* --- Rolling balances with monthly compounding --- */
  /* beginCash[m+1] = beginCash[m] × (1 + cashRate) + cashSavings[m] */
  /* beginLT[m+1]   = beginLT[m]   × (1 + ltRate)   + ltSavings[m]   */

  const cashRate = (data.planCashYield || 0) / 100 / 12;
  const ltRate   = (data.planLtYield   || 0) / 100 / 12;

  const beginCash = [], endCash = [];
  const beginLT   = [], endLT   = [];
  let cashBal = +data.beginningCash     || 0;
  let ltBal   = +data.beginningLongTerm || 0;
  MONTHS.forEach((_, m) => {
    beginCash.push(cashBal);
    beginLT.push(ltBal);
    cashBal = cashBal * (1 + cashRate) + cashSavingsMonthly[m];
    ltBal   = ltBal   * (1 + ltRate)   + ltSavingsMonthly[m];
    endCash.push(cashBal);
    endLT.push(ltBal);
  });

  const bucketAnnual = { needs: 0, wants: 0, save: 0, give: 0, unalloc: 0 };
  data.groups.forEach(g => g.cats.forEach(c => {
    const b = bucketAnnual[c.bucket] != null ? c.bucket : 'unalloc';
    bucketAnnual[b] += sum(c.monthly);
  }));
  const bucketMonthlyAvg = Object.fromEntries(
    Object.entries(bucketAnnual).map(([k, v]) => [k, v / 12])
  );

  /* --- Visible month columns --- */

  const visibleMonths = React.useMemo(() => {
    if (colMode === 'all')     return MONTHS.map((_, i) => i);
    if (colMode === 'quarter') {
      const q = Math.floor(focusMonth / 3);
      return [q*3, q*3+1, q*3+2];
    }
    return [focusMonth];
  }, [colMode, focusMonth]);

  /* --- Mutations --- */

  const setIncomeCell       = (id, m, val) => setData(prev => ({
    ...prev, income: prev.income.map(r =>
      r.id === id ? { ...r, monthly: r.monthly.map((x, i) => i === m ? val : x) } : r)
  }));
  const setCatCell          = (gid, cid, m, val) => setData(prev => ({
    ...prev, groups: prev.groups.map(g => g.id !== gid ? g : {
      ...g, cats: g.cats.map(c =>
        c.id !== cid ? c : { ...c, monthly: c.monthly.map((x, i) => i === m ? val : x) })
    })
  }));
  const setIncomeName       = (id, name) => setData(prev => ({
    ...prev, income: prev.income.map(r => r.id === id ? { ...r, name } : r)
  }));
  const setCatName          = (gid, cid, name) => setData(prev => ({
    ...prev, groups: prev.groups.map(g => g.id !== gid ? g : {
      ...g, cats: g.cats.map(c => c.id !== cid ? c : { ...c, name })
    })
  }));
  const setGroupName        = (gid, name) => setData(prev => ({
    ...prev, groups: prev.groups.map(g => g.id !== gid ? g : { ...g, name })
  }));
  const cycleBucket         = (gid, cid) => setData(prev => ({
    ...prev, groups: prev.groups.map(g => g.id !== gid ? g : {
      ...g, cats: g.cats.map(c => c.id !== cid ? c : {
        ...c, bucket: BUCKET_CYCLE[(BUCKET_CYCLE.indexOf(c.bucket) + 1) % BUCKET_CYCLE.length]
      })
    })
  }));
  const addIncome           = () => setData(prev => ({
    ...prev, income: [...prev.income, { id: 'inc_' + uid(), name: '', monthly: arr12(0) }]
  }));
  const addCat              = (gid) => setData(prev => ({
    ...prev, groups: prev.groups.map(g => g.id !== gid ? g : {
      ...g, cats: [...g.cats, { id: 'c_' + uid(), name: '', bucket: 'needs', monthly: arr12(0) }]
    })
  }));
  const addGroup            = () => setData(prev => ({
    ...prev, groups: [...prev.groups, { id: 'g_' + uid(), name: 'New Group', cats: [] }]
  }));
  const delIncome           = (id) => setData(prev => ({
    ...prev, income: prev.income.filter(r => r.id !== id)
  }));
  const delCat              = (gid, cid) => setData(prev => ({
    ...prev, groups: prev.groups.map(g => g.id !== gid ? g : {
      ...g, cats: g.cats.filter(c => c.id !== cid)
    })
  }));
  const delGroup            = (gid) => {
    const g = data.groups.find(gr => gr.id === gid);
    if (!g) return;
    const msg = g.cats.length > 0
      ? `Delete "${g.name}" and its ${g.cats.length} categor${g.cats.length === 1 ? 'y' : 'ies'}? This cannot be undone.`
      : `Delete the "${g.name}" group?`;
    if (!confirm(msg)) return;
    setData(prev => ({ ...prev, groups: prev.groups.filter(gr => gr.id !== gid) }));
  };
  const setBeginningCash    = (v) => setData(prev => ({ ...prev, beginningCash:     v }));
  const setBeginningLongTerm = (v) => setData(prev => ({ ...prev, beginningLongTerm: v }));
  const copyJan             = () => setData(prev => ({
    ...prev,
    income: prev.income.map(r => ({ ...r, monthly: arr12(r.monthly[0]) })),
    groups: prev.groups.map(g => ({
      ...g, cats: g.cats.map(c => ({ ...c, monthly: arr12(c.monthly[0]) }))
    }))
  }));

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

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
          const income = []; const groupMap = {}; const groupOrder = [];
          rows.forEach(row => {
            const type   = (row['Type'] || '').toLowerCase().trim();
            const group  = (row['Group'] || '').trim() || 'Other';
            const name   = (row['Name'] || row['Category'] || '').trim();
            const bucket = (row['Bucket'] || 'needs').toLowerCase().trim();
            const monthly = monthCols.map(m => parseFloat(row[m] || 0) || 0);
            if (!name) return;
            if (type === 'income') {
              income.push({ id: 'inc_' + uid(), name, monthly });
            } else if (type === 'disbursement' || type === 'category' || type === 'expense' || type === 'cat') {
              if (!groupMap[group]) { groupMap[group] = { id: 'g_' + uid(), name: group, cats: [] }; groupOrder.push(group); }
              const validBucket = ['needs','wants','save','give'].includes(bucket) ? bucket : 'needs';
              groupMap[group].cats.push({ id: 'c_' + uid(), name, bucket: validBucket, monthly });
            }
          });
          const nInc = income.length, nGrp = groupOrder.length;
          const nCat = groupOrder.reduce((a, g) => a + groupMap[g].cats.length, 0);
          if (nInc === 0 && nCat === 0) {
            alert('No budget data found.\n\nMake sure your CSV has a header row with columns:\nType, Group, Name, Bucket, Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec\n\nUse the "CSV template" button to download a sample file.');
            return;
          }
          if (confirm(`Found ${nInc} income source${nInc !== 1 ? 's' : ''} and ${nCat} categor${nCat !== 1 ? 'ies' : 'y'} in ${nGrp} group${nGrp !== 1 ? 's' : ''}.\n\nThis will replace your current budget (transactions and starting balance are kept). Continue?`)) {
            setData(prev => ({
              ...prev,
              income: nInc > 0 ? income : prev.income,
              groups: nGrp > 0 ? groupOrder.map(g => groupMap[g]) : prev.groups,
            }));
          }
        } catch (_) { alert('Could not parse the CSV. Please check the format and try again.'); }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const downloadCSVTemplate = () => {
    const blob = new Blob([generateCSVTemplate()], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'ledger-budget-template.csv'; a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{data.year} <em>cash budget</em></h1>
          <div className="sub">
            Estimate every dollar in and out, month by month.
          </div>
        </div>
        <div className="actions">
          <button className="btn ghost" onClick={downloadCSVTemplate} title="Download a sample CSV showing the expected format for import">CSV template</button>
          <button className="btn ghost" onClick={importCSV} title="Upload a CSV file exported from Google Sheets or Excel">Upload CSV</button>
          <button className="btn ghost" onClick={copyJan}>Fill across from Jan</button>
          <button className="btn primary" onClick={handleSave}>
            {saved ? 'Saved ✓' : 'Save budget'}
          </button>
        </div>
      </div>

      {/* ---- Instructions collapsible ---- */}
      <div style={{
        marginBottom: 20,
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-md)',
        background: 'var(--surface)',
        overflow: 'hidden',
      }}>
        <button
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '11px 18px',
            fontWeight: 500,
            fontSize: 13.5,
            textAlign: 'left',
          }}
          onClick={() => setShowInstructions(v => !v)}
        >
          <span>Instructions</span>
          <span style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {showInstructions ? '▲ Hide' : '▼ Show'}
          </span>
        </button>
        {showInstructions && (
          <div style={{
            padding: '4px 24px 18px',
            borderTop: '1px solid var(--line-soft)',
            fontSize: 13.5,
            lineHeight: 1.65,
            color: 'var(--ink-soft)',
          }}>
            <ul style={{ margin: '10px 0 0', padding: '0 0 0 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <li>
                <strong>Bucket assignment:</strong> Click a colored dot (●) next to any category to cycle its bucket — Needs, Wants, Saving, or Giving.
              </li>
              <li>
                <strong>Cash savings:</strong> Net monthly income is automatically tracked. Alternatively, include a disbursement category with <em>"Savings"</em> or <em>"Cash Savings"</em> in the name. These feed the <strong>Beginning Cash</strong> balance and compound monthly at the Cash Yield set in the Plan tab.
              </li>
              <li>
                <strong>Long-term investments:</strong> Include a savings-bucket category with <em>"Retirement"</em> or <em>"Long-term"</em> in the name (e.g., "Retirement (401k)", "Long-term Investment"). These feed the <strong>Beginning Long-term Invest</strong> balance and compound monthly at the Long-term Yield set in the Plan tab.
              </li>
              <li>
                <strong>Beginning balances</strong> are editable in January (month 1). Subsequent months are computed automatically, compounding each month at the rates from the Plan tab.
              </li>
            </ul>
          </div>
        )}
      </div>

      <div className="kpis">
        <Kpi label="Annual income"        value={incomeAnnual} />
        <Kpi label="Annual outflow"       value={disbursementsAnnual} />
        <Kpi label="Annual savings"       value={bucketAnnual.save} tone={bucketAnnual.save > 0 ? 'pos' : undefined} />
        <Kpi label="Year-end total wealth" value={Math.round(endCash[11] + endLT[11])} />
      </div>

      <div className="sheet-toolbar">
        <div className="left">
          <div className="bucket-legend">
            {BUCKET_ORDER.map(b => (
              <div key={b} className="item">
                <span className={'dot ' + b}></span>
                {BUCKETS[b].label}
              </div>
            ))}
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
              <button className="btn ghost" style={{ padding: '4px 10px' }}
                onClick={() => setFocusMonth((focusMonth + 11) % 12)}>‹</button>
              <span style={{ minWidth: 90, textAlign: 'center', color: 'var(--ink)' }}>
                {colMode === 'quarter' ? 'Q' + (Math.floor(focusMonth / 3) + 1) : MONTHS_LONG[focusMonth]}
              </span>
              <button className="btn ghost" style={{ padding: '4px 10px' }}
                onClick={() => setFocusMonth((focusMonth + 1) % 12)}>›</button>
            </>
          )}
        </div>
      </div>

      <div className="sheet-wrap">
        <div className="sheet-scroll">
          <Sheet
            visibleMonths={visibleMonths}
            data={data}
            incomeMonthly={incomeMonthly}
            incomeAnnual={incomeAnnual}
            groupTotals={groupTotals}
            disbursementsMonthly={disbursementsMonthly}
            disbursementsAnnual={disbursementsAnnual}
            netMonthly={netMonthly}
            netAnnual={netAnnual}
            beginCash={beginCash}
            endCash={endCash}
            beginLT={beginLT}
            endLT={endLT}
            setIncomeCell={setIncomeCell}
            setCatCell={setCatCell}
            setIncomeName={setIncomeName}
            setCatName={setCatName}
            setGroupName={setGroupName}
            cycleBucket={cycleBucket}
            addIncome={addIncome}
            addCat={addCat}
            addGroup={addGroup}
            delIncome={delIncome}
            delCat={delCat}
            delGroup={delGroup}
            setBeginningCash={setBeginningCash}
            setBeginningLongTerm={setBeginningLongTerm}
          />
        </div>
      </div>

      <AllocationSummary
        bucketAnnual={bucketAnnual}
        bucketMonthlyAvg={bucketMonthlyAvg}
        incomeAnnual={incomeAnnual}
        incomeMonthlyAvg={incomeAnnual / 12}
        groupTotals={groupTotals}
        groups={data.groups}
      />

      <div className="foot-note">
        <span>Click a colored dot to cycle a category between needs / wants / saving / giving.</span>
        <span>Changes saved automatically.</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sheet — the spreadsheet grid                                        */

function Sheet(props) {
  const {
    visibleMonths, data,
    incomeMonthly, incomeAnnual,
    groupTotals,
    disbursementsMonthly, disbursementsAnnual,
    netMonthly, netAnnual,
    beginCash, endCash, beginLT, endLT,
    setIncomeCell, setCatCell, setIncomeName, setCatName, setGroupName,
    cycleBucket, addIncome, addCat, addGroup, delIncome, delCat, delGroup,
    setBeginningCash, setBeginningLongTerm,
  } = props;

  /* Dynamic grid template based on how many months are visible */
  const n  = visibleMonths.length;
  const ct = `28px 224px repeat(${n}, minmax(70px, 1fr)) 92px 28px`;
  const rs = { gridTemplateColumns: ct }; /* row style shorthand */

  return (
    <div>
      {/* Header row */}
      <div className="row head" style={rs}>
        <div></div>
        <div>Category</div>
        {visibleMonths.map(m => <div key={m} className="month">{MONTHS[m]}</div>)}
        <div className="annual">Annual</div>
        <div></div>
      </div>

      {/* Beginning Cash Savings */}
      <div className="row balance begin" style={rs}>
        <div></div>
        <div className="name" style={{ fontSize: 12.5 }}>
          Beginning Cash Savings
          <span style={{ color: 'var(--muted)', fontSize: 10.5, marginLeft: 6 }}>
            @ {(data.planCashYield || 0).toFixed(1)}% yield
          </span>
        </div>
        {visibleMonths.map(m => (
          <div key={m} className="num month">
            {m === 0
              ? <NumberInput value={data.beginningCash} onChange={setBeginningCash} />
              : <span>{fmt(beginCash[m])}</span>
            }
          </div>
        ))}
        <div className="num annual">—</div>
        <div></div>
      </div>

      {/* Beginning Long-term Invest */}
      <div className="row balance begin" style={{ ...rs, borderBottom: '1px solid var(--line)' }}>
        <div></div>
        <div className="name" style={{ fontSize: 12.5 }}>
          Beginning Long-term Invest
          <span style={{ color: 'var(--muted)', fontSize: 10.5, marginLeft: 6 }}>
            @ {(data.planLtYield || 0).toFixed(1)}% yield
          </span>
        </div>
        {visibleMonths.map(m => (
          <div key={m} className="num month">
            {m === 0
              ? <NumberInput value={data.beginningLongTerm} onChange={setBeginningLongTerm} />
              : <span>{fmt(beginLT[m])}</span>
            }
          </div>
        ))}
        <div className="num annual">—</div>
        <div></div>
      </div>

      {/* ---- RECEIPTS ---- */}
      <div className="row section" style={rs}>
        <div></div>
        <div>Receipts</div>
        {visibleMonths.map(m => <div key={m}></div>)}
        <div></div><div></div>
      </div>

      {data.income.map(row => (
        <div key={row.id} className="row income" style={rs}>
          <div><span className="bucket-dot inc" title="Income"></span></div>
          <div className="name">
            <input value={row.name} placeholder="Income source"
              onChange={e => setIncomeName(row.id, e.target.value)} />
          </div>
          {visibleMonths.map(m => (
            <div key={m} className="num month">
              <NumberInput value={row.monthly[m]}
                onChange={v => setIncomeCell(row.id, m, v)} />
            </div>
          ))}
          <div className="num annual">{fmt(sum(row.monthly))}</div>
          <button className="row-del" onClick={() => delIncome(row.id)} title="Remove">×</button>
        </div>
      ))}

      <button className="add-row" onClick={addIncome}>
        <span className="plus">+</span>
        <span className="lbl">Add income source</span>
      </button>

      <div className="row total" style={rs}>
        <div></div>
        <div className="name">Total receipts</div>
        {visibleMonths.map(m => (
          <div key={m} className="num month">{fmt(incomeMonthly[m])}</div>
        ))}
        <div className="num annual">{fmt(incomeAnnual)}</div>
        <div></div>
      </div>

      {/* ---- DISBURSEMENTS ---- */}
      <div className="row section" style={rs}>
        <div></div>
        <div>Disbursements</div>
        {visibleMonths.map(m => <div key={m}></div>)}
        <div></div><div></div>
      </div>

      {data.groups.map((g, gi) => {
        const gt = groupTotals[gi];
        return (
          <React.Fragment key={g.id}>
            <div className="row group" style={rs}>
              <div></div>
              <div className="name">
                <input value={g.name} placeholder="Group name"
                  onChange={e => setGroupName(g.id, e.target.value)}
                  style={{ fontWeight: 500 }} />
              </div>
              {visibleMonths.map(m => (
                <div key={m} className="num month muted">
                  {fmt(gt.monthly[m], { zero: '·' })}
                </div>
              ))}
              <div className="num annual">{fmt(gt.annual)}</div>
              <button className="row-del" onClick={() => delGroup(g.id)} title="Delete group">×</button>
            </div>

            {g.cats.map(c => (
              <div key={c.id} className="row cat" style={rs}>
                <div>
                  <span
                    className={'bucket-dot ' + c.bucket}
                    title={'Bucket: ' + BUCKETS[c.bucket].label + ' — click to change'}
                    onClick={() => cycleBucket(g.id, c.id)}
                  ></span>
                </div>
                <div className="name">
                  <input value={c.name} placeholder="Category"
                    onChange={e => setCatName(g.id, c.id, e.target.value)} />
                </div>
                {visibleMonths.map(m => (
                  <div key={m} className="num month">
                    <NumberInput value={c.monthly[m]}
                      onChange={v => setCatCell(g.id, c.id, m, v)} dim />
                  </div>
                ))}
                <div className="num annual">{fmt(sum(c.monthly))}</div>
                <button className="row-del" onClick={() => delCat(g.id, c.id)} title="Remove">×</button>
              </div>
            ))}

            <button className="add-row" onClick={() => addCat(g.id)}>
              <span className="plus">+</span>
              <span className="lbl">Add to {g.name.toLowerCase() || 'group'}</span>
            </button>
          </React.Fragment>
        );
      })}

      {/* Add group */}
      <button className="add-row" onClick={addGroup}
        style={{ borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line-soft)' }}>
        <span className="plus">+</span>
        <span className="lbl">Add group</span>
      </button>

      {/* Total disbursements */}
      <div className="row total" style={rs}>
        <div></div>
        <div className="name">Total disbursements</div>
        {visibleMonths.map(m => (
          <div key={m} className="num month">{fmt(disbursementsMonthly[m])}</div>
        ))}
        <div className="num annual">{fmt(disbursementsAnnual)}</div>
        <div></div>
      </div>

      {/* Net income */}
      <div className="row net" style={rs}>
        <div></div>
        <div className="name">Net income</div>
        {visibleMonths.map(m => (
          <div key={m} className={'num month ' + (netMonthly[m] < 0 ? 'neg' : '')}>
            {fmt(netMonthly[m], { sign: true, zero: '$0' })}
          </div>
        ))}
        <div className={'num annual ' + (netAnnual < 0 ? 'neg' : '')}>
          {fmt(netAnnual, { sign: true, zero: '$0' })}
        </div>
        <div></div>
      </div>

      {/* Total savings wealth (Cash + LT) */}
      <div className="row balance" style={rs}>
        <div></div>
        <div className="name" style={{ fontStyle: 'italic', color: 'var(--accent)' }}>
          Total savings (Cash + LT)
        </div>
        {visibleMonths.map(m => (
          <div key={m} className="num month" style={{ color: 'var(--accent)' }}>
            {fmt(Math.round(endCash[m] + endLT[m]))}
          </div>
        ))}
        <div className="num annual" style={{ color: 'var(--accent)' }}>
          {fmt(Math.round(endCash[11] + endLT[11]))}
        </div>
        <div></div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Allocation summary bar at the bottom of the Budget page            */

function AllocationSummary({ bucketAnnual, bucketMonthlyAvg, incomeAnnual, incomeMonthlyAvg, groupTotals, groups }) {
  const denom    = incomeAnnual || 1;
  const allocTotal = Object.values(bucketAnnual).reduce((a, b) => a + b, 0);
  const barDenom = allocTotal || 1;
  const seg      = n => Math.max(0, (n / barDenom) * 100);
  const showUnalloc = bucketAnnual.unalloc > 0;

  const housingGroup = groupTotals.find((gt, i) => groups[i] && groups[i].name.toLowerCase() === 'housing');
  const housingPct   = housingGroup ? housingGroup.annual / denom : 0;
  const savingRate   = bucketAnnual.save / denom;
  const givingRate   = bucketAnnual.give / denom;

  return (
    <div className="alloc">
      <div className="alloc-head">
        <h3>Allocation of every dollar earned</h3>
        <div className="income">
          {fmtAccurate(incomeMonthlyAvg)} avg / month · {fmt(incomeAnnual)} / year
        </div>
      </div>

      <div className="alloc-bar">
        <div className="seg-needs" style={{ width: seg(bucketAnnual.needs) + '%' }}></div>
        <div className="seg-wants" style={{ width: seg(bucketAnnual.wants) + '%' }}></div>
        <div className="seg-save"  style={{ width: seg(bucketAnnual.save)  + '%' }}></div>
        <div className="seg-give"  style={{ width: seg(bucketAnnual.give)  + '%' }}></div>
        {showUnalloc && (
          <div className="seg-left" style={{ width: seg(bucketAnnual.unalloc) + '%' }}></div>
        )}
      </div>

      <div className="alloc-legend">
        <LegItem dot="needs" label="Needs"   amt={bucketAnnual.needs} p={bucketAnnual.needs / denom} avg={bucketMonthlyAvg.needs} />
        <LegItem dot="wants" label="Wants"   amt={bucketAnnual.wants} p={bucketAnnual.wants / denom} avg={bucketMonthlyAvg.wants} />
        <LegItem dot="save"  label="Saving"  amt={bucketAnnual.save}  p={bucketAnnual.save  / denom} avg={bucketMonthlyAvg.save} />
        <LegItem dot="give"  label="Giving"  amt={bucketAnnual.give}  p={bucketAnnual.give  / denom} avg={bucketMonthlyAvg.give} />
        {showUnalloc && (
          <LegItem dot="left" label="Unallocated" amt={bucketAnnual.unalloc} p={bucketAnnual.unalloc / denom} avg={bucketMonthlyAvg.unalloc} />
        )}
      </div>

      <div className="alloc-rules">
        <Rule label="Housing"      sub="rule of thumb: under 30% of income"
          val={pct1(housingGroup ? housingGroup.annual : 0, denom)} ok={housingPct <= 0.30} />
        <Rule label="Savings rate" sub="rule of thumb: 15% or more"
          val={pct1(bucketAnnual.save, denom)} ok={savingRate >= 0.15} />
        <Rule label="Giving"       sub="if charitable goal is 10%"
          val={pct1(bucketAnnual.give, denom)} ok={givingRate >= 0.10} />
      </div>
    </div>
  );
}

function LegItem({ dot, label, amt, p, avg }) {
  return (
    <div className="leg">
      <div className="row1"><span className={'dot ' + dot}></span>{label}</div>
      <div className="amt">{fmt(amt, { zero: '$0' })}</div>
      <div className="pct">{Math.round(p * 100)}% · {fmt(avg, { zero: '$0' })}/mo</div>
    </div>
  );
}

function Rule({ label, sub, val, ok }) {
  return (
    <div className="rule">
      <div className="lhs"><span>{label}</span><small>{sub}</small></div>
      <div className={'rhs ' + (ok ? 'ok' : 'warn')}>{val}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared cell components (also used by Track screen)                 */

function NumberInput({ value, onChange, dim }) {
  const [text, setText] = React.useState(value === 0 ? '' : String(value));
  React.useEffect(() => {
    setText(value === 0 ? '' : (Math.round(value * 100) / 100).toString());
  }, [value]);
  return (
    <input
      value={text}
      placeholder="·"
      inputMode="decimal"
      onChange={e => {
        const t = e.target.value.replace(/[^\d.\-]/g, '');
        setText(t);
        onChange(parseFloat(t) || 0);
      }}
      style={dim && (!value || value === 0) ? { color: 'var(--muted)', opacity: 0.6 } : undefined}
    />
  );
}

function Kpi({ label, value, tone, integer, suffix, pct: pctMode }) {
  let text;
  if (pctMode)      text = value + '%';
  else if (integer) text = String(value) + (suffix || '');
  else              text = fmt(value, { zero: '$0' });
  return (
    <div className="kpi">
      <div className="lbl">{label}</div>
      <div className="val">{text}</div>
      {tone && (
        <div className={'delta ' + tone}>
          {tone === 'pos' ? 'positive savings' : 'over budget'}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { BudgetScreen, AllocationSummary, Kpi, NumberInput });
