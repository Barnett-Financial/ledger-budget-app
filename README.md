# Ledger — Personal Budget App

A warm, minimal annual budget compiler, monthly expense tracker, and savings planner. Built as a single-page web app with no build step required.

## Features

- **Budget** — Annual 12-month cash budget spreadsheet with income, expense categories, and allocation buckets (needs / wants / saving / giving). Editable groups and categories, column view modes, allocation bar chart, and financial rules of thumb.
- **Track** — Log actual expenses month by month and compare against your budget. Card view by bucket or full transaction list. Add/delete individual transactions.
- **Plan** — Compound savings projector with interactive sliders for monthly contribution, expected return, time horizon, and starting balance. Shows when you'll hit key milestones (emergency fund, down payment, financial independence).

All data is stored in `localStorage` — nothing leaves your device. Use **Export** to save a JSON backup and **Import** to restore it.

## Running locally

Because the app loads `.jsx` files via `<script src="...">`, you need to serve it over HTTP rather than opening `index.html` directly as a `file://` URL. Any simple HTTP server works:

```bash
# Python 3
python -m http.server 8080

# Node.js (npx)
npx serve .

# Node.js (http-server)
npx http-server -p 8080
```

Then open `http://localhost:8080` in your browser.

## Deploying to GitHub Pages

1. Push this folder to a GitHub repository.
2. Go to **Settings → Pages → Source** and select the branch/folder containing these files.
3. GitHub Pages will serve `index.html` at `https://<username>.github.io/<repo>/`.

No build step, no CI needed — just push and it works.

## Customizing your budget

On first load the app shows sample starter data. Edit category names, amounts, and buckets directly in the spreadsheet. Use **Export** to save your data, and **Import** to load it on another device or after clearing browser storage.

## Data model

All data is a single JSON object stored under the `ledger.data.v2` localStorage key:

```json
{
  "year": 2025,
  "name": "Me",
  "beginningBalance": 18000,
  "income": [...],
  "groups": [...],
  "transactions": [
    { "id": "...", "date": "2025-06-15", "categoryId": "grocery", "groupId": "g_food", "amount": 94.50, "note": "Whole Foods" }
  ]
}
```

## Tech stack

- **React 18** (production CDN build)
- **Babel Standalone** (in-browser JSX compilation — no bundler needed)
- Vanilla CSS with CSS custom properties
- Google Fonts: Instrument Serif, Geist, Geist Mono

## License

MIT — use it, fork it, share it with friends.
