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

## 2026-07-16 — CSS truncation repair + review batches + starter-data fix

- **Deployed styles.css had been truncated** mid-declaration at `.btn { min` inside the 768px
  media block (auth CSS appended after the break → all `.auth-*` rules swallowed, mobile-fit
  tail dead). Repaired by splicing the intact tail from `styles.2026-07-14.backup.css`
  (asserting script; braces 305/305). Full review + paste-ready batches: `REVIEW-2026-07-16.md`.
- Batches 2–6 (sync pill/autosave flush, Info-popover portal + Escape, iOS 16px inputs,
  password reset, BalancesModal) were applied in follow-up sessions and are live.
- Removed the starter `Retirement (401k)` category from `STARTER_DATA` (data.js) — it was the
  double-count trap vs. the gear modal's payroll 401(k). Existing accounts unaffected.
- Reminder proven again this session: the bash mount served a stale truncated `data.js` right
  after a successful Windows-side Edit — verify via Read/Grep on the Windows path only.

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

## 2026-07-16 (same day) — Batch 3: portal the ⓘ popover, Escape-to-close, dialog a11y

Root cause of "popups fall behind text": `.info-pop` is `position:fixed` but rendered
inside a sticky sheet cell (`z-index:3`), which creates its own stacking context — so the
popover's `z-index:300` only wins within that one cell, and later sticky cells (same
z-index, later in paint order) draw over it.

- `js/shared.jsx`, `Info`: popover now renders via `ReactDOM.createPortal(..., document.body)`,
  escaping every stacking context. (`ReactDOM` is a pre-existing global from the CDN
  `<script>` tag in `index.html`'s `<head>`, loaded well before `js/shared.jsx`.)
- `js/shared.jsx`: added `useEscapeClose(onClose)` — a tiny global hook (top-level
  `function`, no import/export, same cross-file pattern as `Info`/`Kpi`) that closes on
  `Escape`.
- Wired into `RowSettingsModal`, `DebtRateModal`, `GivingGoalModal` (`js/budget.jsx`),
  `LogExpenseModal` (`js/track.jsx`), `AddMilestoneModal` (`js/plan.jsx`) — one line each,
  `useEscapeClose(onClose);` at the top of the component. For the Data menu in
  `js/app.jsx` (not a component, just conditionally-rendered JSX in `App`), called
  `useEscapeClose(() => { if (showDataMenu) setShowDataMenu(false); })` unconditionally
  (hooks can't be called conditionally) with the guard inside the handler instead.
- Added `role="dialog" aria-modal="true" aria-label="..."` to each `.modal` div (the 5
  modals above; the Data menu uses `.data-menu`, not `.modal`, so left as-is per the
  literal scope of the request).
- Verified via Windows-path Read tool: all 5 edited files (`shared.jsx`, `budget.jsx`,
  `track.jsx`, `plan.jsx`, `app.jsx`) end cleanly with the expected final lines/line
  counts — no truncation this pass. Not yet spot-checked on the live site (scroll test +
  Escape-in-each-modal) — do that after Jason deploys.

## 2026-07-16 (same day) — Batch 4: stop iOS zoom-on-focus + touch polish

- `styles.css`, inside `@media (max-width: 768px)` (right after the existing
  `.form-input { min-height: 44px; }` line): added `font-size: 16px` for
  `.form-input`, `.auth-field input`, `.num input`, `.name input` (iOS Safari zooms the
  viewport on focus of any input under 16px — fixed at the font-size, not via
  `maximum-scale` in the viewport meta, which would break pinch-zoom accessibility), plus
  `.num { font-size: 14px; }` so the (now-larger) sheet number column doesn't blow out a
  5-digit amount in single-month view.
- `styles.css`, top level (outside any media query, right after the existing
  `button`/`input, select` resets at the top of the file): added
  `button, input, select { touch-action: manipulation; }` and
  `button { -webkit-tap-highlight-color: transparent; }` — removes the ~350ms
  double-tap-zoom delay and the gray tap-flash on the sheet's bucket dots/gear buttons.
- Verified via Windows-path Read tool: file grew from 1327 → 1336 lines exactly as
  expected (9 new lines), tail (`.auth-switch:hover`) intact, no truncation this pass.
- Not yet verified on an actual phone — do that after Jason deploys: tap a budget cell
  and confirm the page doesn't zoom, and check a 5-digit amount in single-month view
  still fits the column.

## 2026-07-16 (same day) — Batch 5: password reset + friendlier auth errors

- `js/app.jsx`: added `friendlyAuthError(message)` mapping `'Invalid login credentials'`
  → "Email or password is incorrect." and `'Email not confirmed'` → "Please confirm your
  email first — check your inbox."; applied in `AuthScreen.submit`, `forgotPassword`, and
  `SetNewPassword.submit`.
- Added a reusable `PasswordField` component (show/hide toggle, `type` swap between
  `password`/`text`, ≥44px button, `aria-label`) used for sign-in/up's password field and
  both fields in the new reset form — no `styles.css` changes needed, sizing/spacing done
  inline with existing CSS vars.
- `AuthScreen`: "Forgot password?" link under the password field, sign-in mode only, only
  active if postgres email is filled. Calls
  `window.sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })`.
- Added `SetNewPassword` component (two `PasswordField`s, 6-char minimum, must match,
  calls `window.sb.auth.updateUser({ password })`, `onDone()` on success).
- `Root`: added `recovery` state; `onAuthStateChange` now checks
  `evt === 'PASSWORD_RECOVERY'` and sets it. Render order: loading → **recovery →
  SetNewPassword** → no-session → AuthScreen → App. Because the recovery event also
  carries a real session, clearing `recovery` on success drops the user straight into
  `<App>` without a separate sign-in step.
- Verified via Windows-path Read tool: file complete, ends cleanly at line 406
  (`ReactDOM.createRoot(...)`), no truncation.
- **Important — not yet confirmed:** `resetPasswordForEmail`'s `redirectTo` only works if
  the target URL is on Supabase's allow-list. In the Supabase dashboard for project
  `bmhzvokxpglsdcrdbmra`: **Authentication → URL Configuration**, confirm the live Vercel
  URL (`https://ledger-budget-app-zeta.vercel.app`) is set as the Site URL and/or in
  Redirect URLs — otherwise the reset email link may not land back on the app. This
  wasn't checked this session (no MCP tool exposes Auth URL config; it's dashboard-only).
- Full flow (request reset → open email link → set new password → sign in with it) not
  yet tested end-to-end — needs a real test account and access to its inbox, so this is
  on Jason to run after deploying.
- Follow-up same session: Supabase project `bmhzvokxpglsdcrdbmra`'s Site URL was still
  `http://localhost:3000` (a leftover default). Jason added the Vercel URL as a Redirect
  URL, which covers `resetPasswordForEmail`'s explicit `redirectTo`. Also patched
  `signUp()` to pass `options: { emailRedirectTo: window.location.origin }` so new-user
  confirmation emails don't depend on the Site URL setting either. Site URL itself is
  still `localhost:3000` — harmless now that both auth calls pass explicit redirects, but
  worth updating in the dashboard eventually for general hygiene (magic links, etc. can
  fall back to it).

## 2026-07-16 (same day) — Batch 6: edit beginning balances from any month

- `js/budget.jsx`: added `BalancesModal` (same modal-overlay/modal/modal-head/
  modal-actions pattern as `DebtRateModal`, `useEscapeClose`, `role="dialog"`) with four
  fields — Beginning Cash Savings, Beginning Long-term Invest, Beginning Debt, and the
  debt interest rate — saving through the existing setters (`setBeginningCash`,
  `setBeginningLongTerm`, `setBeginningDebt`, `setDebtInterestRate`) passed down from
  `BudgetScreen`. Includes the required one-line hint: "Balances are as of January 1.
  Later months are computed."
- `BudgetScreen`: new `showBalancesModal` state (same pattern as
  `showDebtRateModal`/`showGivingGoalModal`), rendered alongside the other modals; passes
  `onBalancesClick` down to `Sheet`.
- `Sheet`: added `const janVisible = visibleMonths.includes(0);` — true whenever the
  currently-visible column(s) include January (desktop "all" months, a Q1 quarter, or
  January itself), false otherwise (mobile single-month view on any other month, or
  desktop single-month/quarter view landed on a non-Q1 range). When `!janVisible`, each of
  the three "Beginning …" rows' name cell becomes a button (with a small ✎/`&#9998;`
  affordance, `minHeight:44` inline on mobile) that opens `BalancesModal`; the existing
  January inline `NumberInput`s are untouched. The Debt row's existing standalone
  "X% rate" pill (opens `DebtRateModal`) is kept as-is alongside the new button — two
  entry points to (overlapping) rate-editing, both harmless.
- Verified via Windows-path Read tool: `budget.jsx` ends cleanly after `GivingGoalModal`'s
  closing brace, no truncation; spot-checked all three balance rows, the modal-render
  block, and the full `BalancesModal` component.
- Not yet tested live — do that after Jason deploys: on mobile, jump to July, tap
  "Cash Savings" (now a button), set Beginning Cash to 25000 via the modal, and confirm
  July's beginning-cash figure and the KPIs update.

## 2026-07-16 (same day) — Mobile name-column truncation fix

Root cause: the sheet name cell kept its 36px/24px desktop indent on mobile, and the
fixed-width Fund/Manual badges + gear button squeezed the flexible name `<input>` to
zero width — category/income names (e.g. "Car insurance") rendered blank on phones,
worst on Fund rows (extra badge).

- `styles.css`, inside `@media (max-width: 768px)`: `.row.cat .name` padding-left
  36px→14px, `.row.income .name` 24px→12px (mobile-only overrides, same pattern as the
  `.form-input` 16px override); `.row-tag { display:none; }` (badges hidden on mobile —
  the same info is in the ⚙ settings modal); added
  `.sheet-scroll .row.group { height:auto; min-height:44px; }` next to the existing
  cat/income touch-target rule; bumped `.main`'s mobile bottom padding 96px→150px so the
  FAB can't cover the sheet's last rows.
- `js/budget.jsx`, `Sheet()`: added `monthColsMobile` (72px min per column, vs. desktop's
  64px `monthCols`, which is now only used by nothing — see note below) and rebalanced
  the mobile grid template from `18px minmax(112px,1fr) ... 80px 30px` to
  `18px minmax(132px,1.4fr) ... 76px 30px` — the name column goes from a plain `1fr`
  share to a `1.4fr` share with a higher floor (132px), at the cost of 4px off the
  annual column and 8px off each month column's minimum.
- `js/budget.jsx`: both `⚙` gear buttons (income row, category row) changed from
  `&#9881;` to `&#9881;&#xFE0E;` — the U+FE0E variation selector forces the flat
  text-style glyph; without it iOS renders a big colored emoji gear that visually broke
  the row.
- Verified two ways: (1) Windows-path Read tool confirmed both files complete, no
  truncation. (2) Built a real render test — extracted `Sheet()` verbatim plus its
  `data.js`/`shared.jsx` dependencies into a standalone harness, transpiled with
  `@babel/standalone` (classic JSX runtime), and rendered with
  `react-dom/server.renderToStaticMarkup` under three scenarios (mobile/July with a Fund
  category, desktop/all-months, mobile/January). All 11 assertions passed: no render
  errors, "Car insurance" and a Fund-flagged category name both appear in the rendered
  HTML, the Fund badge is still in the DOM (CSS-hidden, not removed), both gear buttons
  carry the U+FE0E selector, and the BalancesModal button from the prior batch only
  appears when January isn't visible. Caveat: SSR has no layout engine, so this proves
  the component/DOM output is correct but can't confirm the actual pixel-level
  visual fix — that needs the live-site check below. Test harness left at
  `outputs/sheet-test-source.js` + `outputs/run-sheet-test.js` (scratch, not part of the
  repo).
- Minor leftover: the original `monthCols` const in `Sheet()` is now unused (its only
  caller — the mobile branch — was switched to `monthColsMobile`); harmless dead code,
  not cleaned up since it wasn't part of the requested change.
- Not yet verified live — do that after Jason deploys: check "Car insurance" and any
  Fund-category rows show their full names on an actual phone, and confirm the ⚙ renders
  as a flat gray glyph rather than a colored emoji.

## 2026-07-16 (same day) — Group subtotal styling + sticky sheet header

- `styles.css`: `.row.group` background `#FDFBF5` → `var(--bg-soft)` (was a near-duplicate
  of the surface color, barely tinted); `.row.group .num` → `color: var(--ink); font-weight:
  600;` (was `--ink-soft` / 500 — same as a plain category row, no visual hierarchy).
- `js/budget.jsx`: removed the `muted` class from the group header's month cells
  (`className="num month"`, was `"num month muted"`) so subtotals read at full contrast
  instead of grayed out to match the old near-white background.
- Added a sticky header to the sheet (`.row.head` — the Category/Month/Annual row):
  `position: sticky; top: 80px; z-index: 10;` on desktop, with `top: 60px` inside the
  mobile media query. Sticks correctly despite `.sheet-wrap`'s `overflow: hidden`
  because that wrapper has no fixed height (nothing to clip vertically) — same mechanism
  already used for `.month-summary`/`.chart-card` on the Plan tab, which is where the
  `80px` desktop offset comes from. The existing horizontal-sticky corner cells (dot /
  annual columns, `nth-child`/`nth-last-child` rule) are unaffected — different axis,
  same row, no conflict.
- **Caveat, flagged for Jason to check live:** the `top` offsets are estimates based on
  the topbar's typical rendered height (80px desktop matches the existing sidebar
  convention; 60px mobile is a new estimate — nav and the desktop-only data-action
  buttons are hidden on mobile, so the topbar is normally one short row, but it can wrap
  to two lines on very narrow phones or while the sync-pill is showing). If the sticky
  sheet header sits a few pixels off from flush against the topbar on an actual phone,
  nudge the mobile `.row.head { top: ... }` value in `styles.css`'s media block up or
  down to match — no other change needed.
- Verified via Windows-path Read tool only this time (no code-behavior change, so no
  jsdom re-run) — both files complete, no truncation, no leftover `muted` class.
- Not yet verified live — do after deploying: on both desktop and mobile, scroll down a
  sheet with several groups/categories and confirm (a) group rows read as a tinted, bold
  band above their categories, and (b) the Category/Month/Annual header stays pinned
  near the top of the screen instead of scrolling away.
