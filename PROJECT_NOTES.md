# Ledger Budget App — Project Notes

Live URL: https://ledger-budget-app-zeta.vercel.app
Repo: static site — `index.html` (React via Babel CDN, unpkg) + `data.js` + `styles.css`, no build step. Auto-deploys to Vercel from GitHub `main`.

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
