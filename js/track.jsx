/* track.jsx: Track screen and its subcomponents — split out of index.html (in-browser Babel, no bundler).
   Top-level function declarations stay global across text/babel scripts. */

/* ---- TrackScreen ---- */
function TrackScreen({ data, setData, monthIdx, setMonthIdx, autoLog, onAutoLogHandled }) {
  const [showModal,        setShowModal]        = React.useState(false);
  const [showTransactions, setShowTransactions] = React.useState(false);
  const [defaultCatId,     setDefaultCatId]     = React.useState(null);

  /* Fix #3: open the Log-expense modal when the mobile FAB routes here */
  React.useEffect(() => {
    if (autoLog) { setShowModal(true); if (onAutoLogHandled) onAutoLogHandled(); }
  }, [autoLog]);

  const monthTxs = data.transactions.filter(t => {
    const d = new Date(t.date + 'T00:00:00');
    return d.getFullYear() === data.year && d.getMonth() === monthIdx;
  });

  const actualByCat = {};
  monthTxs.forEach(t => { actualByCat[t.categoryId] = (actualByCat[t.categoryId] || 0) + t.amount; });

  /* Fix #1 (Fund): cumulative actuals from January through the selected month, this year */
  const cumActualByCat = {};
  data.transactions.forEach(t => {
    const d = new Date(t.date + 'T00:00:00');
    if (d.getFullYear() === data.year && d.getMonth() <= monthIdx) {
      cumActualByCat[t.categoryId] = (cumActualByCat[t.categoryId] || 0) + t.amount;
    }
  });

  const cats = [];
  data.groups.forEach(g => g.cats.forEach(c => {
    const budgeted = c.monthly[monthIdx] || 0;
    const actual   = actualByCat[c.id]   || 0;
    /* Fund: accrue Jan→selected month of budget, minus cumulative spending to date */
    const accrued     = c.isFund ? sum(c.monthly.slice(0, monthIdx + 1)) : 0;
    const spentToDate = c.isFund ? (cumActualByCat[c.id] || 0) : 0;
    const fundBalance = accrued - spentToDate;
    if (budgeted > 0 || actual > 0 || (c.isFund && (accrued > 0 || spentToDate > 0))) {
      cats.push({ ...c, groupId:g.id, groupName:g.name, budgeted, actual, accrued, spentToDate, fundBalance });
    }
  }));

  const totBud = sum(cats.map(c => c.budgeted));
  const totAct = sum(cats.map(c => c.actual));
  const incomeBud = sum(data.income.map(r => r.monthly[monthIdx]));
  const remaining = totBud - totAct;

  /* Budget spent percentage */
  const spentPct = totBud > 0 ? Math.round((totAct / totBud) * 100) : 0;

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === data.year && today.getMonth() === monthIdx;
  const daysInMonth    = new Date(data.year, monthIdx + 1, 0).getDate();
  const dayOfMonth     = isCurrentMonth ? today.getDate() : daysInMonth;
  const monthPct       = Math.round((dayOfMonth / daysInMonth) * 100);

  const buckets = { needs:{b:0,a:0}, wants:{b:0,a:0}, save:{b:0,a:0}, give:{b:0,a:0} };
  cats.forEach(c => { if (buckets[c.bucket]) { buckets[c.bucket].b += c.budgeted; buckets[c.bucket].a += c.actual; } });

  /* Fix 3.2: an expense dated in another month/year would silently vanish from
     the current view. Follow it: switch to its month, or warn if it's another year. */
  const addTransaction    = tx => {
    setData(d => ({ ...d, transactions: [...d.transactions, { id:uid(), ...tx }] }));
    const td = new Date(tx.date + 'T00:00:00');
    const txMonth = td.getMonth(), txYear = td.getFullYear();
    if (txYear !== data.year) {
      alert('This expense is dated ' + txYear + " — it won't appear in your " + data.year +
            ' views. Change the year at the top of the app to see it.');
    } else if (txMonth !== monthIdx) {
      setMonthIdx(txMonth);
    }
  };
  const deleteTransaction = id => setData(d => ({ ...d, transactions: d.transactions.filter(t => t.id !== id) }));

  const openModalForCat = (catId) => { setDefaultCatId(catId); setShowModal(true); };
  const handleModalClose = () => { setShowModal(false); setDefaultCatId(null); };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{MONTHS_LONG[monthIdx]}, <em>so far</em></h1>
          <div className="sub">
            {isCurrentMonth
              ? 'Day ' + dayOfMonth + ' of ' + daysInMonth + ' — ' + monthPct + '% through the month.'
              : 'Viewing ' + MONTHS_LONG[monthIdx] + ' ' + data.year + '.'}
            {' '}Click any category card to log an expense for it.
          </div>
        </div>
        <div className="actions">
          <button className="btn ghost" onClick={() => setMonthIdx((monthIdx + 11) % 12)}>‹ {MONTHS_LONG[(monthIdx + 11) % 12]}</button>
          <button className="btn ghost" onClick={() => setMonthIdx((monthIdx + 1) % 12)}>{MONTHS_LONG[(monthIdx + 1) % 12]} ›</button>
          <button className="btn ghost" onClick={() => setShowTransactions(v => !v)}>{showTransactions ? 'Card view' : 'Transactions'}</button>
          <button className="btn primary" onClick={() => setShowModal(true)}>Log expense</button>
        </div>
      </div>

      <div className="kpis">
        <Kpi label="Income budgeted" value={incomeBud} />
        <Kpi label="Spent so far"    value={totAct} />
        <Kpi label="Left in budget"  value={remaining} tone={remaining < 0 ? 'neg' : (totAct > 0 ? 'pos' : undefined)} />
        <Kpi label="Budget used"     value={spentPct} pct />
      </div>

      {showTransactions ? (
        <TransactionList transactions={monthTxs} data={data} onDelete={deleteTransaction} onAdd={() => setShowModal(true)} />
      ) : (
        <div className="track-grid">
          <div>
            {cats.length === 0 ? (
              <div className="tx-empty">No budget categories set for this month.</div>
            ) : (
              BUCKET_ORDER.map(b => {
                const bcats = cats.filter(c => c.bucket === b);
                if (!bcats.length) return null;
                const bs = buckets[b], bp = bs.b > 0 ? Math.round((bs.a / bs.b) * 100) : 0;
                return (
                  <div key={b} style={{ marginTop:18 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', padding:'4px 4px 8px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10, fontSize:11.5, textTransform:'uppercase', letterSpacing:'0.12em', color:'var(--ink-soft)' }}>
                        <span className={'bucket-dot ' + b} style={{ margin:0 }}></span>{BUCKETS[b].label}
                      </div>
                      <div style={{ fontSize:12.5, color:'var(--muted)', fontFamily:'var(--mono)' }}>
                        <span style={{ color:'var(--ink)' }}>{fmt(bs.a, { zero:'$0' })}</span> of {fmt(bs.b, { zero:'$0' })} &middot; {bp}%
                      </div>
                    </div>
                    <div className="cat-grid">
                      {bcats.map(c => <CategoryCard key={c.id} cat={c} dayOfMonth={dayOfMonth} daysInMonth={daysInMonth} onClick={() => openModalForCat(c.id)} />)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="month-summary">
            <h3>{MONTHS_LONG[monthIdx]} at a glance</h3>
            <div className="summary-row"><span className="l">Income (budgeted)</span><span className="r">{fmt(incomeBud)}</span></div>
            {BUCKET_ORDER.map(b => (
              <div className="summary-row" key={b}>
                <span className="l"><span className="dot" style={{ background:BUCKETS[b].color }}></span>{BUCKETS[b].label}</span>
                <span className="r">{fmt(buckets[b].a, { zero:'$0' })}<small> of {fmt(buckets[b].b, { zero:'$0' })}</small></span>
              </div>
            ))}
            <div className="summary-row" style={{ borderTop:'1px solid var(--line)', marginTop:4 }}>
              <span className="l">Remaining Budget</span>
              <span className="r" style={{ color: remaining < 0 ? 'var(--warn)' : 'var(--save)' }}>{fmt(remaining, { sign:true, zero:'$0' })}</span>
            </div>
            <div style={{ marginTop:16 }}>
              <button className="btn" style={{ width:'100%', justifyContent:'center' }} onClick={() => setShowModal(true)}>+ Log expense</button>
            </div>
          </div>
        </div>
      )}

      <div className="foot-note">
        <span>{monthTxs.length} transaction{monthTxs.length !== 1 ? 's' : ''} logged this month.</span>
        <span>Click any category card to log an expense for it directly.</span>
      </div>

      {showModal && (
        <LogExpenseModal data={data} monthIdx={monthIdx} year={data.year}
          defaultCategoryId={defaultCatId} onSave={addTransaction} onClose={handleModalClose} />
      )}
    </div>
  );
}

function TransactionList({ transactions, data, onDelete, onAdd }) {
  const catMap = {};
  data.groups.forEach(g => g.cats.forEach(c => { catMap[c.id] = { name:c.name, bucket:c.bucket, group:g.name }; }));
  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date));
  if (!sorted.length) {
    return (
      <div className="tx-empty">
        No expenses logged this month yet.{' '}
        <button className="btn primary" style={{ display:'inline-block', marginLeft:10 }} onClick={onAdd}>Log first expense</button>
      </div>
    );
  }
  return (
    <div className="sheet-wrap tx-table">
      <div className="tx-head"><span>Date</span><span>Note</span><span>Category</span><span style={{ textAlign:'right' }}>Amount</span><span></span></div>
      {sorted.map(tx => {
        const cat = catMap[tx.categoryId];
        return (
          <div key={tx.id} className="tx-row">
            <span style={{ color:'var(--muted)', fontFamily:'var(--mono)', fontSize:12 }}>{tx.date}</span>
            <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color: tx.note ? 'var(--ink)' : 'var(--muted)' }}>{tx.note || '—'}</span>
            <span style={{ display:'flex', alignItems:'center', gap:8, overflow:'hidden' }}>
              {cat && <span className={'bucket-dot ' + cat.bucket} style={{ flexShrink:0, margin:0 }}></span>}
              <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:12.5 }}>
                {cat ? cat.name : <span style={{ color:'var(--muted)' }}>Unknown</span>}
                {cat && <span style={{ color:'var(--muted)', fontSize:11, marginLeft:6 }}>{cat.group}</span>}
              </span>
            </span>
            <span style={{ textAlign:'right', fontFamily:'var(--mono)', fontVariantNumeric:'tabular-nums' }}>{fmt(tx.amount, { zero:'$0' })}</span>
            <button onClick={() => { if (confirm('Delete this transaction?')) onDelete(tx.id); }}
              style={{ color:'var(--muted)', fontSize:16, lineHeight:1, cursor:'pointer' }}
              onMouseEnter={e => e.currentTarget.style.color='var(--warn)'}
              onMouseLeave={e => e.currentTarget.style.color='var(--muted)'}>&#215;</button>
          </div>
        );
      })}
    </div>
  );
}

function CategoryCombobox({ data, value, onChange }) {
  const [query, setQuery] = React.useState('');
  const [open,  setOpen]  = React.useState(false);
  const inputRef          = React.useRef(null);

  const allCats = React.useMemo(() => {
    const list = [];
    data.groups.forEach(g => g.cats.forEach(c => list.push({ id:c.id, name:c.name, group:g.name, bucket:c.bucket })));
    return list;
  }, [data.groups]);

  const selectedCat = allCats.find(c => c.id === value);

  const filtered = React.useMemo(() => {
    if (!query.trim()) return allCats;
    const q = query.toLowerCase();
    return allCats.filter(c => c.name.toLowerCase().includes(q) || c.group.toLowerCase().includes(q));
  }, [allCats, query]);

  const handleFocus = () => { setQuery(''); setOpen(true); };
  const handleBlur  = () => { setTimeout(() => setOpen(false), 160); };
  const selectCat   = (cat) => { onChange(cat.id); setQuery(''); setOpen(false); if (inputRef.current) inputRef.current.blur(); };

  const renderItems = () => {
    if (query.trim()) {
      if (!filtered.length) return <div style={{ padding:'10px 12px', color:'var(--muted)', fontSize:13 }}>No categories match</div>;
      return filtered.map(c => (
        <div key={c.id} onMouseDown={() => selectCat(c)}
          style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', cursor:'pointer', background: c.id === value ? 'var(--bg-soft)' : 'transparent', fontSize:13.5 }}
          onMouseEnter={e => { e.currentTarget.style.background='var(--bg)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = c.id === value ? 'var(--bg-soft)' : 'transparent'; }}>
          <span className={'bucket-dot ' + c.bucket} style={{ margin:0, flexShrink:0 }}></span>
          <span style={{ flex:1 }}>{c.name}</span>
          <span style={{ color:'var(--muted)', fontSize:11.5 }}>{c.group}</span>
        </div>
      ));
    }
    return data.groups.map(g => (
      <React.Fragment key={g.id}>
        <div style={{ padding:'6px 12px 3px', fontSize:10.5, textTransform:'uppercase', letterSpacing:'0.12em', color:'var(--muted)', background:'var(--bg-soft)', borderTop:'1px solid var(--line-soft)' }}>{g.name}</div>
        {g.cats.map(c => (
          <div key={c.id} onMouseDown={() => selectCat(c)}
            style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 12px 7px 18px', cursor:'pointer', background: c.id === value ? 'var(--bg-soft)' : 'transparent', fontSize:13.5 }}
            onMouseEnter={e => { e.currentTarget.style.background='var(--bg)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = c.id === value ? 'var(--bg-soft)' : 'transparent'; }}>
            <span className={'bucket-dot ' + c.bucket} style={{ margin:0, flexShrink:0 }}></span>
            <span>{c.name}</span>
          </div>
        ))}
      </React.Fragment>
    ));
  };

  return (
    <div style={{ position:'relative' }}>
      <input ref={inputRef} type="text" className="form-input"
        value={open ? query : (selectedCat ? selectedCat.name : '')}
        placeholder="Type to search or scroll to select…"
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={handleFocus} onBlur={handleBlur} />
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'var(--surface)', border:'1px solid var(--line)', borderRadius:'var(--r-md)', boxShadow:'0 8px 28px rgba(0,0,0,0.13)', maxHeight:240, overflowY:'auto', zIndex:200 }}>
          {renderItems()}
        </div>
      )}
    </div>
  );
}

function LogExpenseModal({ data, monthIdx, year, defaultCategoryId, onSave, onClose }) {
  useEscapeClose(onClose);
  const today = new Date();
  const defaultDate = (today.getFullYear() === year && today.getMonth() === monthIdx)
    ? today.toISOString().slice(0, 10)
    : year + '-' + String(monthIdx + 1).padStart(2, '0') + '-01';

  const [date,       setDate]       = React.useState(defaultDate);
  const [amount,     setAmount]     = React.useState('');
  const [note,       setNote]       = React.useState('');
  const [categoryId, setCategoryId] = React.useState('');
  const [groupId,    setGroupId]    = React.useState('');
  const [err,        setErr]        = React.useState('');

  React.useEffect(() => {
    const catId = defaultCategoryId;
    if (catId) {
      setCategoryId(catId);
      for (const g of data.groups) { if (g.cats.find(c => c.id === catId)) { setGroupId(g.id); break; } }
    } else if (data.groups.length > 0 && data.groups[0].cats.length > 0) {
      setCategoryId(data.groups[0].cats[0].id);
      setGroupId(data.groups[0].id);
    }
  }, []);

  const handleCatChange = (id) => {
    setCategoryId(id);
    for (const g of data.groups) { if (g.cats.find(c => c.id === id)) { setGroupId(g.id); break; } }
  };

  const handleSave = () => {
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0) { setErr('Enter a valid amount greater than zero.'); return; }
    if (!categoryId) { setErr('Select a category.'); return; }
    if (!date)       { setErr('Select a date.'); return; }
    onSave({ date, categoryId, groupId, amount: Math.round(amt * 100) / 100, note: note.trim() });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Log expense" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSave(); }}>
        <div className="modal-head">
          <h2>Log expense</h2>
          <button className="modal-close" aria-label="Close" onClick={onClose}>&#215;</button>
        </div>
        <div className="form-field">
          <label>Amount</label>
          <input type="number" inputMode="decimal" min="0.01" step="0.01" className="form-input"
            placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
        </div>
        <div className="form-field">
          <label>Category</label>
          <CategoryCombobox data={data} value={categoryId} onChange={handleCatChange} />
        </div>
        <div className="form-field">
          <label>Note <span style={{ color:'var(--muted)', textTransform:'none', letterSpacing:0 }}>(optional)</span></label>
          <input type="text" className="form-input" placeholder="e.g. Whole Foods run" value={note} onChange={e => setNote(e.target.value)} />
        </div>
        <div className="form-field">
          <label>Date</label>
          <input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        {err && <div className="form-error">{err}</div>}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={handleSave}>Save expense</button>
        </div>
      </div>
    </div>
  );
}

function CategoryCard({ cat, dayOfMonth, daysInMonth, onClick }) {
  const barColor  = BUCKETS[cat.bucket] ? BUCKETS[cat.bucket].color : 'var(--muted)';

  /* Fund cards show accrued budget-to-date less cumulative spending (a running balance). */
  if (cat.isFund) {
    const accrued = cat.accrued || 0, spent = cat.spentToDate || 0, bal = accrued - spent;
    const fp      = accrued > 0 ? Math.min(100, Math.round((spent / accrued) * 100)) : (spent > 0 ? 100 : 0);
    const over    = spent > accrued && accrued > 0;
    return (
      <div className={'cat-card fund' + (over ? ' over' : '')} onClick={onClick}
        style={{ cursor:'pointer', transition:'box-shadow 0.15s' }}
        onMouseEnter={e => { e.currentTarget.style.boxShadow='0 2px 10px rgba(0,0,0,0.09)'; }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow=''; }}>
        <div className="cat-head">
          <div className="name-c"><span className="dot" style={{ background:barColor }}></span>{cat.name}<span className="fund-badge" style={{ cursor:'help' }} title="Fund: accrues its monthly budget and draws down as you log expenses — the amount shown is what remains available, not a monthly reset.">Fund</span></div>
          <div className="amounts"><span style={{ color: bal < 0 ? 'var(--warn)' : 'var(--ink)' }}>{fmt(bal, { zero:'$0' })}</span><span className="of"> avail</span></div>
        </div>
        <div className="bar">
          <div style={{ width: fp + '%', background: barColor }}></div>
        </div>
        <div className="meta">
          <span className="left">accrued {fmt(accrued, { zero:'$0' })} &middot; spent {fmt(spent, { zero:'$0' })}</span>
          <span>{fmt(cat.actual, { zero:'$0' })}/{fmt(cat.budgeted, { zero:'$0' })} mo</span>
        </div>
      </div>
    );
  }

  const p         = cat.budgeted > 0 ? Math.min(100, Math.round((cat.actual / cat.budgeted) * 100)) : (cat.actual > 0 ? 100 : 0);
  const over      = cat.actual > cat.budgeted && cat.budgeted > 0;
  const unstarted = cat.actual === 0;
  const expPct    = Math.round((dayOfMonth / daysInMonth) * 100);
  const remaining = cat.budgeted - cat.actual;
  return (
    <div className={'cat-card' + (over ? ' over' : '') + (unstarted ? ' unstarted' : '')}
      onClick={onClick}
      style={{ cursor:'pointer', transition:'box-shadow 0.15s' }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow='0 2px 10px rgba(0,0,0,0.09)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow=''; }}>
      <div className="cat-head">
        <div className="name-c"><span className="dot" style={{ background:barColor }}></span>{cat.name}</div>
        <div className="amounts"><span>{fmt(cat.actual, { zero:'$0' })}</span><span className="of"> / {fmt(cat.budgeted, { zero:'$0' })}</span></div>
      </div>
      <div className="bar">
        <div style={{ width: p + '%', background: barColor }}></div>
        {cat.budgeted > 0 && <div style={{ position:'absolute', left: expPct + '%', top:-3, bottom:-3, width:1, background:'var(--ink-soft)', opacity:0.35 }}></div>}
      </div>
      <div className="meta">
        <span className="left">{unstarted ? 'click to log' : over ? fmt(-remaining) + ' over' : fmt(remaining) + ' left'}</span>
        <span>{p}%</span>
      </div>
    </div>
  );
}
