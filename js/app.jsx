/* app.jsx: App, AuthScreen, Root, and the ReactDOM mount (loads LAST) — split out of index.html (in-browser Babel, no bundler).
   Top-level function declarations stay global across text/babel scripts. */

/* 2026-07-20: robust, multi-section CSV export. Replaces the old flat round-trip CSV.
   A .csv file can't hold real worksheet tabs, so each "tab" here is a clearly labeled
   section separated by a blank line — it opens cleanly in Excel / Google Sheets / Numbers,
   where you can split sections onto their own tabs if you like. Numbers are written raw
   (no $ or commas) so spreadsheets treat them as numbers, not text. */
function exportBudgetCSV(data) {
  const esc = (v) => { v = (v == null) ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const r2  = (n) => Math.round((+n || 0) * 100) / 100;
  const rows = [];
  const push = (...cells) => rows.push(cells);
  const blank = () => rows.push([]);

  const income = data.income || [];
  const groups = data.groups || [];
  const txns   = data.transactions || [];
  const year   = data.year;

  /* payroll-deduction helpers (mirror budget.jsx) */
  const pd       = (r) => r.payrollDeductions || {};
  const pdRetHsa = (r) => (+pd(r).retirement401k || 0) + (+pd(r).hsa || 0);
  const pdOther  = (r) => (+pd(r).pretaxPremiums || 0) + (+pd(r).otherPretax || 0);
  const pdSum    = (r) => pdRetHsa(r) + pdOther(r);
  const payrollActive = income.some(r => pdSum(r) > 0);

  /* monthly aggregates */
  const incomeMonthly    = MONTHS.map((_, m) => sum(income.map(r => +r.monthly[m] || 0)));
  const deductionMonthly = MONTHS.map((_, m) => sum(income.map(r => (r.monthly[m] > 0 ? pdSum(r)    : 0))));
  const retHsaMonthly    = MONTHS.map((_, m) => sum(income.map(r => (r.monthly[m] > 0 ? pdRetHsa(r) : 0))));
  const otherMonthly     = MONTHS.map((_, m) => sum(income.map(r => (r.monthly[m] > 0 ? pdOther(r)  : 0))));
  const grossMonthly     = MONTHS.map((_, m) => incomeMonthly[m] + deductionMonthly[m]);
  const outflowMonthly   = MONTHS.map((_, m) => sum(groups.map(g => sum(g.cats.map(c => +c.monthly[m] || 0)))));
  const netMonthly       = MONTHS.map((_, m) => incomeMonthly[m] - outflowMonthly[m]);

  const incomeAnnual  = sum(incomeMonthly);
  const grossAnnual   = sum(grossMonthly);
  const outflowAnnual = sum(outflowMonthly);
  const netAnnual     = incomeAnnual - outflowAnnual;
  const retHsaAnnual  = sum(retHsaMonthly);
  const otherAnnual   = sum(otherMonthly);

  /* bucket totals (budgeted) */
  const bkt = { needs:0, wants:0, save:0, give:0, unalloc:0 };
  groups.forEach(g => g.cats.forEach(c => { const a = sum(c.monthly); bkt[c.bucket] = (bkt[c.bucket] || 0) + a; }));
  const denom = (payrollActive ? grossAnnual : incomeAnnual) || 1;
  const pctOf = (n) => (Math.round((n / denom) * 1000) / 10) + '%';

  /* ---------- Section: header ---------- */
  push('LEDGER BUDGET EXPORT');
  push('Name', data.name || 'Me');
  push('Year', year);
  push('Generated', new Date().toISOString().slice(0, 10));
  blank();

  /* ---------- Section: beginning balances ---------- */
  push('BEGINNING BALANCES & PLAN ASSUMPTIONS');
  push('Beginning cash', r2(data.beginningCash));
  push('Beginning long-term investments', r2(data.beginningLongTerm));
  push('Beginning debt', r2(data.beginningDebt));
  push('Debt interest rate (%)', r2(data.debtInterestRate));
  push('Plan cash yield (%)', r2(data.planCashYield));
  push('Plan long-term yield (%)', r2(data.planLtYield));
  if (data.givingGoalPct != null) push('Giving goal (% of income)', r2(data.givingGoalPct));
  blank();

  /* ---------- Section: income ---------- */
  push('INCOME (take-home)', ...MONTHS, 'Annual');
  income.forEach(r => push(r.name || 'Income', ...r.monthly.map(r2), r2(sum(r.monthly))));
  push('Total income', ...incomeMonthly.map(r2), r2(incomeAnnual));
  blank();

  /* ---------- Section: pretax payroll deductions (only if used) ---------- */
  if (payrollActive) {
    push('PRETAX PAYROLL DEDUCTIONS', ...MONTHS, 'Annual');
    push('Retirement / HSA', ...retHsaMonthly.map(r2), r2(retHsaAnnual));
    push('Other pretax (premiums, etc.)', ...otherMonthly.map(r2), r2(otherAnnual));
    push('Gross income (take-home + deductions)', ...grossMonthly.map(r2), r2(grossAnnual));
    blank();
  }

  /* ---------- Section: budget categories ---------- */
  push('BUDGET CATEGORIES', 'Group', 'Bucket', 'Fill', 'Fund', 'Flow', ...MONTHS, 'Annual');
  groups.forEach(g => g.cats.forEach(c => {
    push(
      c.name || 'Category', g.name,
      (BUCKETS[c.bucket] ? BUCKETS[c.bucket].label : c.bucket),
      (c.fillMode === 'manual' ? 'Manual' : 'Fill right'),
      (c.isFund ? 'Yes' : ''),
      (c.flow && c.flow !== 'auto' ? c.flow : ''),
      ...c.monthly.map(r2), r2(sum(c.monthly))
    );
  }));
  push('Total outflow', '', '', '', '', '', ...outflowMonthly.map(r2), r2(outflowAnnual));
  push('Net (income − outflow)', '', '', '', '', '', ...netMonthly.map(r2), r2(netAnnual));
  blank();

  /* ---------- Section: allocation summary ---------- */
  push('ALLOCATION SUMMARY', 'Annual', '% of ' + (payrollActive ? 'gross' : 'income'));
  push('Needs',  r2(bkt.needs),  pctOf(bkt.needs));
  push('Wants',  r2(bkt.wants),  pctOf(bkt.wants));
  push('Saving (budgeted)', r2(bkt.save), pctOf(bkt.save));
  if (payrollActive) push('Pretax savings (401k/HSA)', r2(retHsaAnnual), pctOf(retHsaAnnual));
  push('Giving', r2(bkt.give),  pctOf(bkt.give));
  push('Unallocated / net', r2(netAnnual), pctOf(netAnnual));
  push('Effective savings rate', r2(bkt.save + netAnnual + retHsaAnnual), pctOf(bkt.save + netAnnual + retHsaAnnual));
  blank();

  /* ---------- Section: tracked actuals (from the database) ---------- */
  const catMeta = {};        /* id -> {name, group, bucket} */
  groups.forEach(g => g.cats.forEach(c => { catMeta[c.id] = { name: c.name, group: g.name, bucket: c.bucket }; }));
  const actualsByCat = {};   /* id -> [12] */
  const ensure = (id) => (actualsByCat[id] || (actualsByCat[id] = MONTHS.map(() => 0)));
  let anyActuals = false;
  txns.forEach(t => {
    const d = new Date(t.date + 'T00:00:00');
    if (d.getFullYear() !== year) return;
    ensure(t.categoryId)[d.getMonth()] += (+t.amount || 0);
    anyActuals = true;
  });
  push('TRACKED ACTUALS — spent per category by month (' + year + ')');
  if (!anyActuals) {
    push('No expenses logged for ' + year + ' yet.');
  } else {
    push('Category', 'Group', 'Bucket', ...MONTHS, 'Actual total', 'Budgeted (annual)', 'Variance (budget − actual)');
    const budgetedAnnualForCat = (id) => {
      for (const g of groups) { const c = g.cats.find(x => x.id === id); if (c) return sum(c.monthly); }
      return 0;
    };
    const colTotals = MONTHS.map(() => 0); let grandActual = 0, grandBudget = 0;
    Object.keys(actualsByCat).forEach(id => {
      const meta = catMeta[id] || { name: '(deleted category)', group: '', bucket: '' };
      const arr  = actualsByCat[id];
      const tot  = sum(arr);
      const bud  = budgetedAnnualForCat(id);
      arr.forEach((v, i) => colTotals[i] += v);
      grandActual += tot; grandBudget += bud;
      push(meta.name, meta.group, (BUCKETS[meta.bucket] ? BUCKETS[meta.bucket].label : meta.bucket),
           ...arr.map(r2), r2(tot), r2(bud), r2(bud - tot));
    });
    push('Total spent', '', '', ...colTotals.map(r2), r2(grandActual), r2(grandBudget), r2(grandBudget - grandActual));
  }
  blank();

  const csv = '﻿' + rows.map(row => row.map(esc).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'ledger-' + year + '-export.csv'; a.click(); URL.revokeObjectURL(a.href);
}

/* ---- App shell ---- */
function App({ session }) {
  /* Fix 1.1: remember the active tab and viewed month across refreshes. */
  const [screen,   setScreen]   = React.useState(() => {
    try { const s = localStorage.getItem('ledger.ui.screen'); if (['budget','track','plan'].includes(s)) return s; } catch (_) {}
    return 'budget';
  });
  const [monthIdx, setMonthIdx] = React.useState(() => {
    try { const m = parseInt(localStorage.getItem('ledger.ui.month'), 10); if (m >= 0 && m <= 11) return m; } catch (_) {}
    return Math.min(new Date().getMonth(), 11);
  });
  const [showDataMenu,      setShowDataMenu]      = React.useState(false);   // Fix #3
  const [pendingLogExpense, setPendingLogExpense] = React.useState(false);   // Fix #3 (FAB)
  useEscapeClose(() => { if (showDataMenu) setShowDataMenu(false); });   // only acts while the Data menu is open
  const [data,     setData]     = React.useState(() => {
    try {
      const raw = localStorage.getItem('ledger.data.v2');
      if (raw) { const p = JSON.parse(raw); if (p && p.groups) return migrateData(p); }
    } catch (_) {}
    return { ...STARTER_DATA };
  });

  React.useEffect(() => {
    try { localStorage.setItem('ledger.data.v2', JSON.stringify(data)); } catch (_) {}
  }, [data]);
  React.useEffect(() => { try { localStorage.setItem('ledger.ui.screen', screen); } catch (_) {} }, [screen]);
  React.useEffect(() => { try { localStorage.setItem('ledger.ui.month', String(monthIdx)); } catch (_) {} }, [monthIdx]);

  /* ---- Cloud sync (Supabase): load THIS user's budget, then keep it saved to the cloud. ----
     localStorage above still runs as an instant, offline fallback cache. */
  const cloudReady = React.useRef(false);
  const saveTimer  = React.useRef(null);
  const userId = (session && session.user) ? session.user.id : null;
  const [syncState, setSyncState] = React.useState('idle');   // 'idle' | 'saving' | 'saved' | 'error'

  React.useEffect(() => {
    let cancelled = false;
    if (!window.sb || !userId) { cloudReady.current = true; return; }
    cloudReady.current = false;
    (async () => {
      try {
        const { data: row, error } = await window.sb
          .from('ledger_state').select('data').eq('user_id', userId).maybeSingle();
        if (cancelled) return;
        if (error) console.warn('Ledger cloud load:', error.message);
        if (row && row.data && row.data.groups) {
          setData(migrateData(row.data));            // cloud is the source of truth
        } else {
          /* First sign-in on this account: seed the cloud from whatever is here now. */
          await window.sb.from('ledger_state')
            .upsert({ user_id: userId, data, updated_at: new Date().toISOString() });
        }
      } catch (e) { console.warn('Ledger cloud load failed:', e); }
      finally { if (!cancelled) cloudReady.current = true; }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  React.useEffect(() => {
    if (!window.sb || !userId || !cloudReady.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSyncState('saving');
    saveTimer.current = setTimeout(() => {
      window.sb.from('ledger_state')
        .upsert({ user_id: userId, data, updated_at: new Date().toISOString() })
        .then(({ error }) => {
          if (error) console.warn('Ledger cloud save:', error.message);
          setSyncState(error ? 'error' : 'saved');
        });
    }, 800);
  }, [data, userId]);

  /* Fix: flush the pending debounced save on tab switch/close so the last edit isn't lost. */
  React.useEffect(() => {
    const flush = () => {
      if (!window.sb || !userId || !saveTimer.current) return;
      clearTimeout(saveTimer.current); saveTimer.current = null;
      window.sb.from('ledger_state')
        .upsert({ user_id: userId, data, updated_at: new Date().toISOString() })
        .then(({ error }) => setSyncState(error ? 'error' : 'saved'));
    };
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flush);
    return () => { document.removeEventListener('visibilitychange', onVis);
                   window.removeEventListener('pagehide', flush); };
  }, [data, userId]);

  const retrySync = () => {
    if (!window.sb || !userId) return;
    setSyncState('saving');
    window.sb.from('ledger_state')
      .upsert({ user_id: userId, data, updated_at: new Date().toISOString() })
      .then(({ error }) => setSyncState(error ? 'error' : 'saved'));
  };

  /* Fix 2.2: one-time notice that Ledger keeps a single budget across years. */
  const changeYear = (delta) => {
    try {
      if (!localStorage.getItem('ledger.notice.year')) {
        alert('Ledger keeps one budget. Changing the year relabels it and shows only that year’s logged expenses.');
        localStorage.setItem('ledger.notice.year', '1');
      }
    } catch (_) {}
    setData(d => ({ ...d, year: d.year + delta }));
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'ledger-' + data.year + '.json'; a.click(); URL.revokeObjectURL(a.href);
  };

  const importData = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = e => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const p = JSON.parse(ev.target.result);
          if (p && p.groups) setData(migrateData(p));
          else alert("This doesn't look like a Ledger data file.");
        } catch (_) { alert('Could not parse the file.'); }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const resetData = () => {
    if (confirm('Reset to starter data? All your budget and transactions will be lost.'))
      setData({ ...STARTER_DATA, year: new Date().getFullYear() });
  };

  const signOut = () => {
    if (window.sb) window.sb.auth.signOut();
    /* Shared-device privacy: clear this user's cached budget so the next
       person to sign in on this browser doesn't seed their new cloud
       budget with the previous user's data. */
    try {
      localStorage.removeItem('ledger.data.v2');
      localStorage.removeItem('ledger.ui.screen');
      localStorage.removeItem('ledger.ui.month');
    } catch (_) {}
  };

  const initials = (data.name || 'Me').trim().split(/\s+/).map(w => w[0] || '').join('').toUpperCase().slice(0, 2) || 'ME';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"></span>
          <span className="brand-name">Ledger</span>
        </div>
        <nav className="nav">
          {[['budget','Budget'],['track','Track'],['plan','Plan']].map(([k, label]) => (
            <button key={k} className={screen === k ? 'active' : ''} onClick={() => setScreen(k)}>{label}</button>
          ))}
        </nav>
        <div className="topbar-right">
          <div className="year-pill">
            <button onClick={() => changeYear(-1)} aria-label="Previous year">‹</button>
            <span>{data.year}</span>
            <button onClick={() => changeYear(1)} aria-label="Next year">›</button>
          </div>
          <div className="desktop-data-actions">
            {/* 2026-07-20: collapsed the loose Export/Import/Reset/Sign-out buttons into one
                menu so Reset can't be hit by accident. Opens the same panel as the mobile "More" tab. */}
            <button className="btn ghost" style={{ fontSize:12, padding:'5px 12px' }} onClick={() => setShowDataMenu(true)} aria-haspopup="menu">Menu ▾</button>
          </div>
          {session && syncState !== 'idle' && (
            <button
              className={'sync-pill' + (syncState === 'error' ? ' error' : '')}
              onClick={syncState === 'error' ? retrySync : undefined}
              disabled={syncState !== 'error'}
              title={syncState === 'error' ? 'Tap to retry saving to the cloud' : undefined}
            >
              {syncState === 'saving' && 'Saving…'}
              {syncState === 'saved'  && 'Saved ✓'}
              {syncState === 'error'  && 'Not saved — tap to retry'}
            </button>
          )}
          <div className="avatar" title={data.name || 'Me'}>{initials}</div>
        </div>
      </header>
      <main className="main">
        {screen === 'budget' && <BudgetScreen data={data} setData={setData} />}
        {screen === 'track'  && <TrackScreen  data={data} setData={setData} monthIdx={monthIdx} setMonthIdx={setMonthIdx}
                                    autoLog={pendingLogExpense} onAutoLogHandled={() => setPendingLogExpense(false)} />}
        {screen === 'plan'   && <PlanScreen   data={data} setData={setData} />}
      </main>

      {/* Fix #3 — mobile bottom tab bar (hidden on desktop via CSS) */}
      <nav className="bottom-nav">
        <button className={screen === 'budget' ? 'active' : ''} onClick={() => setScreen('budget')}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="3" y="4" width="14" height="12" rx="2"/><line x1="3" y1="8" x2="17" y2="8"/><line x1="9" y1="8" x2="9" y2="16"/></svg>
          <span>Budget</span>
        </button>
        <button className={screen === 'track' ? 'active' : ''} onClick={() => setScreen('track')}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="10" cy="10" r="7"/><line x1="10" y1="10" x2="10" y2="3.5"/><line x1="10" y1="10" x2="15.4" y2="13.2"/></svg>
          <span>Track</span>
        </button>
        <button className={screen === 'plan' ? 'active' : ''} onClick={() => setScreen('plan')}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="3,14 8,9 12,12 17,5"/><line x1="3" y1="17" x2="17" y2="17"/></svg>
          <span>Plan</span>
        </button>
        <button onClick={() => setShowDataMenu(true)}>
          <svg viewBox="0 0 20 20" fill="currentColor" stroke="none"><circle cx="5" cy="10" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="15" cy="10" r="1.5"/></svg>
          <span>More</span>
        </button>
      </nav>

      {/* Fix #3 — mobile FAB for Log expense (hidden on desktop via CSS) */}
      <button className="fab" aria-label="Log expense" title="Log expense"
        onClick={() => { setScreen('track'); setPendingLogExpense(true); }}>+</button>

      {/* Fix #3 — Data / More menu (Export / Import / Reset) */}
      {showDataMenu && (
        <div className="data-menu-overlay" onClick={() => setShowDataMenu(false)}>
          <div className="data-menu" onClick={e => e.stopPropagation()}>
            <div className="dm-head">
              <h4>Menu</h4>
              <button className="modal-close" onClick={() => setShowDataMenu(false)} aria-label="Close">&#215;</button>
            </div>
            <button className="dm-item" onClick={() => { setShowDataMenu(false); exportBudgetCSV(data); }}><span className="dm-ico">&#8681;</span>Export budget (CSV)</button>
            <button className="dm-item" onClick={() => { setShowDataMenu(false); exportData(); }}><span className="dm-ico">&#8595;</span>Export data (.json)</button>
            <button className="dm-item" onClick={() => { setShowDataMenu(false); importData(); }}><span className="dm-ico">&#8593;</span>Import data (.json)</button>
            <button className="dm-item" onClick={() => { setShowDataMenu(false); resetData(); }}><span className="dm-ico">&#8635;</span>Reset to starter data</button>
            {session && <button className="dm-item" onClick={() => { setShowDataMenu(false); signOut(); }}><span className="dm-ico">&#8592;</span>Sign out</button>}
          </div>
        </div>
      )}
    </div>
  );
}

/* 2026-07-16: plain-language mapping for the handful of raw Supabase auth error
   strings a user is likely to actually see. Anything else passes through as-is. */
function friendlyAuthError(message) {
  if (message === 'Invalid login credentials') return 'Email or password is incorrect.';
  if (message === 'Email not confirmed')       return 'Please confirm your email first — check your inbox.';
  return message;
}

/* 2026-07-16: shared show/hide toggle for password inputs (sign-in/up + reset). */
function PasswordField({ label, value, onChange, autoComplete, minLength }) {
  const [show, setShow] = React.useState(false);
  return (
    <label className="auth-field">{label}
      <div style={{ display:'flex', alignItems:'stretch', gap:6 }}>
        <input type={show ? 'text' : 'password'} value={value} autoComplete={autoComplete}
          onChange={onChange} required minLength={minLength} style={{ flex:1, minWidth:0 }} />
        <button type="button" onClick={() => setShow(s => !s)}
          aria-label={show ? 'Hide password' : 'Show password'}
          style={{ minWidth:44, minHeight:44, flexShrink:0, border:'1px solid var(--line)',
                   borderRadius:'var(--r-md)', background:'var(--bg-soft)', color:'var(--muted)', fontSize:12 }}>
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
    </label>
  );
}

/* ---- Auth gate: each person signs in; their budget is private to their login. ---- */
function AuthScreen() {
  const [mode,  setMode]  = React.useState('signin');   // 'signin' | 'signup'
  const [email, setEmail] = React.useState('');
  const [pw,    setPw]    = React.useState('');
  const [msg,   setMsg]   = React.useState('');
  const [busy,  setBusy]  = React.useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!window.sb) { setMsg('Cloud sign-in is unavailable right now.'); return; }
    setBusy(true); setMsg('');
    try {
      if (mode === 'signup') {
        /* explicit emailRedirectTo so the confirmation link lands here regardless of
           whatever the Supabase project's Site URL happens to be set to (e.g. a
           leftover localhost default) — same fix as the password-reset redirect. */
        const { data, error } = await window.sb.auth.signUp({ email, password: pw,
          options: { emailRedirectTo: window.location.origin } });
        if (error) setMsg(friendlyAuthError(error.message));
        else if (!data.session) setMsg('Account created. Check your email to confirm, then sign in.');
        /* if data.session exists, onAuthStateChange signs us straight in */
      } else {
        const { error } = await window.sb.auth.signInWithPassword({ email, password: pw });
        if (error) setMsg(friendlyAuthError(error.message));
      }
    } catch (err) { setMsg(String((err && err.message) || err)); }
    finally { setBusy(false); }
  };

  /* 2026-07-16: "Forgot password?" (sign-in mode only) — emails a recovery link that
     lands back on this app; Root's onAuthStateChange picks up the PASSWORD_RECOVERY
     event and shows SetNewPassword. */
  const forgotPassword = async () => {
    if (!email) { setMsg('Enter your email above, then tap "Forgot password?" again.'); return; }
    if (!window.sb) { setMsg('Cloud sign-in is unavailable right now.'); return; }
    setBusy(true); setMsg('');
    try {
      const { error } = await window.sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      setMsg(error ? friendlyAuthError(error.message) : 'Check your email for a reset link.');
    } catch (err) { setMsg(String((err && err.message) || err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand"><span className="brand-mark"></span><span className="brand-name">Ledger</span></div>
        <h2 className="auth-title">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h2>
        <p className="auth-sub">Your budget is private to your login.</p>
        <label className="auth-field">Email
          <input type="email" value={email} autoComplete="username"
            onChange={e => setEmail(e.target.value)} required />
        </label>
        <PasswordField label="Password" value={pw} onChange={e => setPw(e.target.value)}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={6} />
        {mode === 'signin' && (
          <button type="button" onClick={forgotPassword} disabled={busy}
            style={{ background:'none', border:'none', padding:0, marginTop:-8,
                     fontSize:12.5, color:'var(--accent)', textDecoration:'underline', cursor:'pointer' }}>
            Forgot password?
          </button>
        )}
        <button className="btn primary auth-submit" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : (mode === 'signup' ? 'Create account' : 'Sign in')}
        </button>
        {msg && <div className="auth-msg">{msg}</div>}
        <button type="button" className="auth-switch"
          onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setMsg(''); }}>
          {mode === 'signup' ? 'Have an account? Sign in' : 'New here? Create an account'}
        </button>
      </form>
    </div>
  );
}

/* 2026-07-16: password-reset deep link. Supabase signs the user into a special
   "recovery" session and fires this event when they land back here from the email
   link; while `recovery` is set we show SetNewPassword instead of the normal app. */
function SetNewPassword({ onDone }) {
  const [pw1, setPw1] = React.useState('');
  const [pw2, setPw2] = React.useState('');
  const [msg, setMsg] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    if (pw1.length < 6)  { setMsg('Password must be at least 6 characters.'); return; }
    if (pw1 !== pw2)     { setMsg('Passwords do not match.'); return; }
    setBusy(true);
    try {
      const { error } = await window.sb.auth.updateUser({ password: pw1 });
      if (error) setMsg(friendlyAuthError(error.message));
      else onDone();
    } catch (err) { setMsg(String((err && err.message) || err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand"><span className="brand-mark"></span><span className="brand-name">Ledger</span></div>
        <h2 className="auth-title">Set a new password</h2>
        <p className="auth-sub">Choose a new password for your account.</p>
        <PasswordField label="New password" value={pw1}
          onChange={e => setPw1(e.target.value)} autoComplete="new-password" minLength={6} />
        <PasswordField label="Confirm new password" value={pw2}
          onChange={e => setPw2(e.target.value)} autoComplete="new-password" minLength={6} />
        <button className="btn primary auth-submit" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : 'Set new password'}
        </button>
        {msg && <div className="auth-msg">{msg}</div>}
      </form>
    </div>
  );
}

function Root() {
  const [session,  setSession]  = React.useState(undefined);   // undefined = still checking
  const [recovery, setRecovery] = React.useState(false);
  React.useEffect(() => {
    if (!window.sb) { setSession(null); return; }
    window.sb.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = window.sb.auth.onAuthStateChange((evt, s) => {
      if (evt === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(s);
    });
    return () => { if (sub && sub.subscription) sub.subscription.unsubscribe(); };
  }, []);

  if (!window.sb) return <App session={null} />;                     // cloud unavailable → local-only
  if (session === undefined)
    return <div className="auth-wrap"><div className="auth-card auth-loading">Loading…</div></div>;
  if (recovery) return <SetNewPassword onDone={() => setRecovery(false)} />;
  if (!session) return <AuthScreen />;
  return <App key={session.user.id} session={session} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />); /* mount v2026-07-14 cloud-auth */
