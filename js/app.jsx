/* app.jsx: App, AuthScreen, Root, and the ReactDOM mount (loads LAST) — split out of index.html (in-browser Babel, no bundler).
   Top-level function declarations stay global across text/babel scripts. */

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
            <button className="btn ghost" style={{ fontSize:12, padding:'5px 12px' }} onClick={exportData}>Export</button>
            <button className="btn ghost" style={{ fontSize:12, padding:'5px 12px' }} onClick={importData}>Import</button>
            <button className="btn ghost" style={{ fontSize:12, padding:'5px 12px' }} onClick={resetData}>Reset</button>
            {session && <button className="btn ghost" style={{ fontSize:12, padding:'5px 12px' }} onClick={signOut}>Sign out</button>}
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
              <h4>Data</h4>
              <button className="modal-close" onClick={() => setShowDataMenu(false)} aria-label="Close">&#215;</button>
            </div>
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
        const { data, error } = await window.sb.auth.signUp({ email, password: pw });
        if (error) setMsg(error.message);
        else if (!data.session) setMsg('Account created. Check your email to confirm, then sign in.');
        /* if data.session exists, onAuthStateChange signs us straight in */
      } else {
        const { error } = await window.sb.auth.signInWithPassword({ email, password: pw });
        if (error) setMsg(error.message);
      }
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
        <label className="auth-field">Password
          <input type="password" value={pw}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            onChange={e => setPw(e.target.value)} required minLength={6} />
        </label>
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

function Root() {
  const [session, setSession] = React.useState(undefined);   // undefined = still checking
  React.useEffect(() => {
    if (!window.sb) { setSession(null); return; }
    window.sb.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = window.sb.auth.onAuthStateChange((_evt, s) => setSession(s));
    return () => { if (sub && sub.subscription) sub.subscription.unsubscribe(); };
  }, []);

  if (!window.sb) return <App session={null} />;                     // cloud unavailable → local-only
  if (session === undefined)
    return <div className="auth-wrap"><div className="auth-card auth-loading">Loading…</div></div>;
  if (!session) return <AuthScreen />;
  return <App key={session.user.id} session={session} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />); /* mount v2026-07-14 cloud-auth */
