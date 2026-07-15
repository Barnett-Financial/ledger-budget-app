/* shared.jsx: generic UI primitives (Kpi, NumberInput, Info) — split out of index.html (in-browser Babel, no bundler).
   Top-level function declarations stay global across text/babel scripts. */

function NumberInput({ value, onChange, dim }) {
  const [text, setText] = React.useState(value === 0 ? '' : String(value));
  React.useEffect(() => { setText(value === 0 ? '' : (Math.round(value * 100) / 100).toString()); }, [value]);
  return (
    <input value={text} placeholder="-" inputMode="decimal"
      onChange={e => { const t = e.target.value.replace(/[^\d.\-]/g, ''); setText(t); onChange(parseFloat(t) || 0); }}
      style={dim && (!value || value === 0) ? { color:'var(--muted)', opacity:0.6 } : undefined}
    />
  );
}
function Kpi({ label, value, tone, integer, suffix, pct: pctMode }) {
  let text;
  if (pctMode)      text = value + '%';
  else if (integer) text = String(value) + (suffix || '');
  else              text = fmt(value, { zero:'$0' });
  return (
    <div className="kpi">
      <div className="lbl">{label}</div>
      <div className="val">{text}</div>
      {tone && <div className={'delta ' + tone}>{tone === 'pos' ? 'positive savings' : 'over budget'}</div>}
    </div>
  );
}
/* 2026-07-09 mobile-fit: tap/hover ⓘ tooltip. title= attributes never show on
   touch devices, so instructional hints were invisible on iPhone. The popover
   is position:fixed with JS coords so sheet overflow/sticky columns can't clip it. */
function Info({ text, label }) {
  const [pos, setPos] = React.useState(null);
  const ref = React.useRef(null);
  const show = () => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const w = Math.min(260, window.innerWidth - 24);
    let x = r.left + r.width / 2 - w / 2;
    x = Math.max(12, Math.min(x, window.innerWidth - w - 12));
    setPos({ x, y: r.bottom + 6, w });
  };
  React.useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    document.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [pos]);
  const toggle = (e) => { e.stopPropagation(); e.preventDefault(); pos ? setPos(null) : show(); };
  return (
    <span ref={ref} className={'info-tip' + (pos ? ' open' : '')}
      role="button" tabIndex={0} aria-label={label || 'More info'}
      onClick={toggle}
      onMouseEnter={show} onMouseLeave={() => setPos(null)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toggle(e); }}>
      &#9432;
      {pos && <span className="info-pop" style={{ position:'fixed', left:pos.x, top:pos.y, width:pos.w }}>{text}</span>}
    </span>
  );
}
