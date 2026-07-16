# Ledger Budget App — Project Notes

Live URL: https://ledger-budget-app-zeta.vercel.app
Repo: static site, no build step. Auto-deploys to Vercel from GitHub `main`.
Architecture (as of 2026-07-15): `index.html` is now just a **shell** (head + `<div id="root">` + script tags). React (via Babel CDN, unpkg) components live in separate `<script type="text/babel" src="js/*.jsx">` files. `data.js` (plain JS, defines window globals) still loads first. Load order in `index.html`: `data.js` → `js/shared.jsx` → `js/budget.jsx` → `js/track.jsx` → `js/plan.jsx` → `js/app.jsx` (mount, loads LAST). Top-level `function` declarations stay global across the text/babel scripts, so no import/export is used. Because component files load via `src=`, the app must be served over http (Vercel is fine); opening `index.html` from `file://` will fail to fetch the jsx.
  - `js/shared.jsx` — Kpi, NumberInput, Info
  - `js/budget.jsx` — CSV helpers + BudgetScreen, Sheet, AllocationSummary, LegItem, Rule, RowSettingsModal, DebtRateModal, GivingGoalModal
  - `js/track.jsx` — TrackScreen, TransactionList, CategoryCombobox, LogExpenseModal, CategoryCard
  - `js/plan.jsx` — PlanScreen, AddMilestoneModal, Slider, ProjectionChart, formatEta/niceCeil/abbrev
  - `js/app.jsx` — App, AuthScreen, Root, ReactDOM mount

## Environment quirk — read before editing

The sandbox's bash mount of this folder can serve a STALE/truncated copy of `index.html`
(and sometimes `styles.css`) even right after Read/Edit tools write correct content —
the Windows file layer (Read/Edit/Grep tools) is the source of truth. Verify file
integrity (script-tag balance, tail, line count) via the **Read/Grep tools on the
Windows path**, not via bash `tail`/`wc`/`grep`. If you need a real jsdom render test,
reconstruct the file in `/tmp` by re-applying the same edits (with `assert`s) to a
fresh `*.backup.html` captured at session start — don't trust a live bash read of
`index.html` itself. Never run `git status`/`add`/`commit` in bash against this repo —
it operates on the stale mount and can leave a lock file the sandbox can't delete.
Jason commits via GitHub Desktop.

## 2026-07-14 — Mobile allocation-summary cleanup

- Replaced the 13-bubble mobile month-switcher (`.month-chips` buttons) with a
  compact dropdown (`<select className="month-select">`) plus ‹ › arrow buttons,
  in `BudgetScreen`. Desktop is unaffected (`.month-chips` still `display:none`
  above the 768px breakpoint).
- Fixed crowded/misaligned Housing / Savings rate / Giving rows in
  `AllocationSummary`'s `.alloc-rules`: added `justify-content: space-between`
  to `.rule` so the percentage always sits at the row's right edge regardless of
  label/subtext length, and added row dividers on the mobile single-column layout.
- Giving previously always compared against a hardcoded 10%-of-income threshold
  with no way to change it, so it showed red for most people with no path to fix
  it. Added a real "giving goal" feature: a `givingGoalPct` field on `data`
  (unset by default), editable via a new `GivingGoalModal` (pencil-style pill
  button on the Giving row, same pattern as the existing debt-interest-rate
  button). With no goal set, the Giving row is neutral gray instead of red;
  once a goal is set, it goes green/red against *that* target.

## 2026-07-14 (same day, 2nd pass) — Mobile sheet (budget table) cleanup

- **Oversized bucket-dot circles, cut off at the screen edge:** root cause was
  that `.bucket-dot.needs/.wants/.save/.give/.inc/.empty` set color via the
  `background:` *shorthand*. A mobile-only rule enlarges the tap target with
  `padding:12px; margin:-12px; background-clip:content-box` so only the 8px
  dot paints while the padding stays an invisible 32px hit area — but any
  later `background:` shorthand resets `background-clip` back to `border-box`,
  so the whole 32px box was painting solid, and since the dot column is
  sticky at `left:0`, the negative margin pushed half of that big circle past
  the viewport edge. Fixed by switching every `.bucket-dot*` color rule to
  `background-color:` (a longhand, doesn't touch `background-clip`).
- **Delete "×" button overlapping the annual amount:** `.row-del` (the sheet's
  actual last grid column, 22px wide, sticky at `right:0`) was blown up to
  44×44 with `margin:-12px`, which spilled left into the annual-amount column
  next to it and covered the last digit(s). Fixed by widening that grid
  column itself (22px → 30px, see `Sheet()`'s mobile `grid-template-columns`)
  and sizing `.row-del` to match exactly with no negative margin, so it can't
  overlap its neighbor. Rebalanced by shrinking the dot column 22px → 18px and
  the annual column 84px → 80px so the total row width is unchanged.
- **Category/income names truncating badly** ("Utilitie:", "Interne", "Rent /"):
  `.row-gear` (the ⚙ button inline inside the flexible name cell) was also
  blown up to 44px wide, eating almost all the name column's width. Shrunk it
  to 24px wide / 44px tall (full row height, modest width) so there's more
  room left for the actual text.
- **"Beginning Cash Savings @ 4.0% yield ⓘ" truncating hard:** these three
  "Beginning …" rows now show short labels on mobile only (`isMobile` prop,
  already threaded into `Sheet`) — "Cash Savings", "Long-term Invest", "Debt"
  — and hide the non-interactive "@ X% yield" badge on mobile (kept on
  desktop). The debt-rate button stays on both, since it's functional
  (opens the rate modal), not just decorative.
- Verification note: bash `cp`-based backups made mid-session were corrupt
  (stale mount) — see `ledger-fs-sync-quirk` memory. Verified this pass
  instead via Windows-path Read/Grep (script tags 8/8, CSS braces 289/289,
  clean tails) plus a full jsdom + real React render of the reconstructed app
  (forced `matchMedia` to mobile, rendered `STARTER_DATA`, checked for JS
  errors and the specific fixed strings/classes) — zero errors, all checks
  passed.

## 2026-07-15 — Refactor: split index.html into modular jsx files

- Pure refactor, **no behavior change**. `index.html` went from ~2,160 lines
  (four inline `<script type="text/babel">` blocks holding 23 components) to a
  45-line shell that loads `js/shared.jsx`, `js/budget.jsx`, `js/track.jsx`,
  `js/plan.jsx`, `js/app.jsx` via `<script type="text/babel" src="...">`. See
  the Architecture note near the top for the load order and which component
  lives in which file. Kept in-browser Babel — no Vite/webpack/bundler added.
- Supabase cloud login untouched: the head still has the supabase-js CDN tag +
  `window.sb`/`window.LEDGER_SB` config; `App({ session })`, `AuthScreen`,
  `Root`, and the `<Root />` mount are all verbatim in `js/app.jsx`.
- This session the bash mount was NOT stale (verified: `wc -l`=2162 matched the
  Read tool, tail clean, script tags 10/10, 26 line-anchors matched), so the
  split was done by slicing the intact `index.html` with an asserting Python
  script — guarantees verbatim content, no transcription/truncation risk.
- Verification: all 5 jsx Babel-parse cleanly; a full jsdom + real React render
  boots the app with zero JS errors and renders Budget (68k chars), Track, and
  Plan screens; no `import`/`export` introduced; `data.js` and `styles.css`
  unchanged. Windows-path Read confirmed `index.html` shell and `js/app.jsx`.
- Backups this session (verified byte-identical via bash `cp`, mount was clean):
  `index.2026-07-15-prerefactor.backup.html`, `styles.2026-07-15-prerefactor.backup.css`.

## 2026-07-16 — Batch 2: trustworthy autosave + sync-status pill

Implemented `REVIEW-2026-07-16.md`'s Batch 2 (removed the placebo "Save budget" button;
autosave was already real — instant localStorage + 800ms-debounced Supabase upsert — it
just had no visible/trustworthy status).

- `js/budget.jsx` (`BudgetScreen`): removed `saved` state, `handleSave`, and the
  "Save budget" button from `.page-head .actions`. The existing foot-note
  ("Changes saved automatically.") is now the only save messaging on that screen.
- `js/app.jsx` (`App`): added `syncState` ('idle'|'saving'|'saved'|'error'), set on the
  debounced cloud-save effect (`'saving'` when scheduled, `'saved'`/`'error'` in the
  upsert `.then`). Added a `visibilitychange`/`pagehide` flush effect so a pending
  debounced save isn't lost if the tab is closed/hidden mid-edit. Added `retrySync()`
  (re-runs the upsert) wired to the error pill's `onClick`.
- Topbar: new `.sync-pill` next to the avatar — hidden when idle, shows "Saving…" /
  "Saved ✓" / "Not saved — tap to retry". `.sync-pill.error` uses `var(--warn)` and gets
  a ≥44px touch target under the 768px breakpoint.
- `signOut` now clears `ledger.data.v2`, `ledger.ui.screen`, `ledger.ui.month` from
  localStorage (shared-device privacy — otherwise the next person signing in on the same
  browser seeds their new cloud budget with the previous user's data via the first-sign-in
  cloud-seed path in the cloud-load effect).
- **Caught a live truncation on `styles.css` from this session's own edits** (not the
  Batch-1 deployed-file issue, which was already fixed locally before this session started
  — see `styles.2026-07-16-pre-batch1.backup.css`). After adding the `.sync-pill` rules,
  a bash-side read showed the file's tail (all `.auth-*` rules) missing and brace count
  off by one (306 open / 305 close vs. a clean 305/305 backup). Recovered per
  [[ledger-fs-sync-quirk]]: restored the last verified-complete backup
  (`styles.2026-07-16-pre-syncpill.backup.css`, 1308 lines, 305/305 braces) and reapplied
  both CSS additions with an asserting Python script instead of the editor. Result verified
  balanced (310/310 braces) and complete (1327 lines) via both bash and the Windows-path
  Read tool.
- **New wrinkle for the FS-sync quirk:** this session bash's view of `js/app.jsx` and
  `js/budget.jsx` also went stale/corrupt after edits (bash reported 267 lines with a
  truncated `return` for `app.jsx`, and a null-byte-padded tail for `budget.jsx`), while
  the Windows-path Read tool showed both files complete and correct throughout (313 and
  980 lines respectively, matching expected line-count deltas from the edits). Treated
  Read tool as ground truth per existing guidance and did not touch either file via bash.
  So the quirk isn't limited to `index.html`/`styles.css` — any file in this repo can show
  a stale bash view after an edit; **always verify via the Windows-path Read tool**, and
  only reach for a bash-side reconstruction (backup + asserting script) if Read/Grep on
  the Windows path itself shows a problem.
- Not yet done: Jason still needs to commit (`js/budget.jsx`, `js/app.jsx`, `styles.css`,
  `.gitignore`) via GitHub Desktop and confirm on the live Vercel URL.
