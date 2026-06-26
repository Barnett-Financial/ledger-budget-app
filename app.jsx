/* Main app shell — navigation, shared state, persistence */

function App() {
  const [screen,   setScreen]   = React.useState('budget');
  const [monthIdx, setMonthIdx] = React.useState(Math.min(new Date().getMonth(), 11));
  const [data,     setData]     = React.useState(() => {
    try {
      const raw = localStorage.getItem('ledger.data.v2');
      if (raw) {
        const p = JSON.parse(raw);
        if (p && p.groups) return migrateData(p);
      }
    } catch (_) {}
    return { ...STARTER_DATA };
  });

  /* Auto-save every time data changes */
  React.useEffect(() => {
    try { localStorage.setItem('ledger.data.v2', JSON.stringify(data)); } catch (_) {}
  }, [data]);

  /* Export data as a JSON file download */
  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `ledger-${data.year}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /* Import data from a JSON file */
  const importData = () => {
    const input   = document.createElement('input');
    input.type    = 'file';
    input.accept  = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const p = JSON.parse(ev.target.result);
          if (p && p.groups) {
            setData(migrateData(p));
          } else {
            alert('This doesn\'t look like a Ledger data file.');
          }
        } catch (_) {
          alert('Could not parse the file. Make sure it\'s a valid JSON file.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const resetData = () => {
    if (confirm('Reset to starter data? All your budget and transactions will be lost.')) {
      setData({ ...STARTER_DATA, year: new Date().getFullYear() });
    }
  };

  const initials = (data.name || 'Me')
    .trim().split(/\s+/)
    .map(w => w[0] || '')
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'ME';

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"></span>
          <span className="brand-name">Ledger</span>
        </div>

        <nav className="nav">
          {[['budget','Budget'],['track','Track'],['plan','Plan']].map(([k, label]) => (
            <button key={k}
              className={screen === k ? 'active' : ''}
              onClick={() => setScreen(k)}
            >{label}</button>
          ))}
        </nav>

        <div className="topbar-right">
          <div className="year-pill">
            <button onClick={() => setData(d => ({ ...d, year: d.year - 1 }))} aria-label="Previous year">‹</button>
            <span>{data.year}</span>
            <button onClick={() => setData(d => ({ ...d, year: d.year + 1 }))} aria-label="Next year">›</button>
          </div>
          <button className="btn ghost" style={{ fontSize: 12, padding: '5px 12px' }}
            onClick={exportData} title="Download data as JSON">Export</button>
          <button className="btn ghost" style={{ fontSize: 12, padding: '5px 12px' }}
            onClick={importData} title="Load data from JSON file">Import</button>
          <button className="btn ghost" style={{ fontSize: 12, padding: '5px 12px' }}
            onClick={resetData} title="Reset to starter data">Reset</button>
          <div className="avatar" title={data.name || 'Me'}>{initials}</div>
        </div>
      </header>

      <main className="main">
        {screen === 'budget' && (
          <BudgetScreen data={data} setData={setData} />
        )}
        {screen === 'track' && (
          <TrackScreen data={data} setData={setData} monthIdx={monthIdx} setMonthIdx={setMonthIdx} />
        )}
        {screen === 'plan' && (
          <PlanScreen data={data} setData={setData} />
        )}
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
