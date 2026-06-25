/* -----------------------------------------------------------------------
   Ledger — data model, helpers, starter data
   Loaded as plain JS before any JSX files; exports to window globals.
----------------------------------------------------------------------- */

const MONTHS      = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_LONG = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

const arr12 = (v) => Array.from({ length: 12 }, () => v);

const STARTER_DATA = {
  year: new Date().getFullYear(),
  name: 'Me',
  beginningBalance: 10000,
  income: [
    { id: 'inc1', name: 'Salary',         monthly: arr12(5000) },
    { id: 'inc2', name: 'Partner income', monthly: arr12(5000) },
  ],
  groups: [
    { id: 'g_housing', name: 'Housing', cats: [
      { id: 'rent',     name: 'Rent / Mortgage',    bucket: 'needs', monthly: arr12(1500) },
      { id: 'util',     name: 'Utilities',          bucket: 'needs', monthly: arr12(150)  },
      { id: 'internet', name: 'Internet',           bucket: 'needs', monthly: arr12(60)   },
      { id: 'renters',  name: "Renter's insurance", bucket: 'needs', monthly: arr12(20)   },
    ]},
    { id: 'g_food', name: 'Food', cats: [
      { id: 'grocery',  name: 'Groceries',          bucket: 'needs', monthly: arr12(400)  },
      { id: 'restaur',  name: 'Restaurants',        bucket: 'wants', monthly: arr12(150)  },
      { id: 'coffee',   name: 'Coffee',             bucket: 'wants', monthly: arr12(50)   },
    ]},
    { id: 'g_trans', name: 'Transportation', cats: [
      { id: 'fuel',     name: 'Fuel',               bucket: 'needs', monthly: arr12(150)  },
      { id: 'carmaint', name: 'Car maintenance',    bucket: 'needs', monthly: arr12(75)   },
      { id: 'carins',   name: 'Car insurance',      bucket: 'needs', monthly: arr12(175)  },
    ]},
    { id: 'g_medical', name: 'Medical', cats: [
      { id: 'healthins', name: 'Health insurance',  bucket: 'needs', monthly: arr12(400)  },
      { id: 'medco',     name: 'Co-pays',           bucket: 'needs', monthly: arr12(50)   },
      { id: 'dental',    name: 'Dental',            bucket: 'needs', monthly: arr12(50)   },
    ]},
    { id: 'g_personal', name: 'Personal', cats: [
      { id: 'cell',     name: 'Cell phone',         bucket: 'needs', monthly: arr12(100)  },
      { id: 'gym',      name: 'Gym',                bucket: 'wants', monthly: arr12(50)   },
      { id: 'enter',    name: 'Entertainment',      bucket: 'wants', monthly: arr12(100)  },
      { id: 'clothes',  name: 'Clothing',           bucket: 'wants', monthly: arr12(100)  },
      { id: 'haircut',  name: 'Hair care',          bucket: 'wants', monthly: arr12(50)   },
      { id: 'subs',     name: 'Subscriptions',      bucket: 'wants', monthly: arr12(50)   },
    ]},
    { id: 'g_household', name: 'Household', cats: [
      { id: 'house',    name: 'Household items',    bucket: 'needs', monthly: arr12(100)  },
      { id: 'misc',     name: 'Miscellaneous',      bucket: 'wants', monthly: arr12(100)  },
      { id: 'vacation', name: 'Vacation / Travel',  bucket: 'wants', monthly: arr12(100)  },
    ]},
    { id: 'g_savings', name: 'Savings', cats: [
      { id: 'savings',  name: 'Emergency fund',     bucket: 'save',  monthly: arr12(250)  },
      { id: 'ira',      name: 'Roth IRA',           bucket: 'save',  monthly: arr12(500)  },
      { id: 'k401',     name: '401(k)',             bucket: 'save',  monthly: arr12(250)  },
    ]},
    { id: 'g_giving', name: 'Giving', cats: [
      { id: 'tithe',    name: 'Charitable',         bucket: 'give',  monthly: arr12(200)  },
      { id: 'gifts',    name: 'Gifts',              bucket: 'give',  monthly: arr12(100)  },
    ]},
  ],
  /* transactions: logged expenses for the Track screen
     Each: { id, date (YYYY-MM-DD), categoryId, groupId, amount, note } */
  transactions: [],
};

const BUCKETS = {
  needs:   { label: 'Needs',       color: 'var(--needs)' },
  wants:   { label: 'Wants',       color: 'var(--wants)' },
  save:    { label: 'Saving',      color: 'var(--save)'  },
  give:    { label: 'Giving',      color: 'var(--give)'  },
  unalloc: { label: 'Unallocated', color: 'var(--muted)' },
};
const BUCKET_ORDER = ['needs','wants','save','give'];
const BUCKET_CYCLE = ['needs','wants','save','give','unalloc'];

/* --- Number helpers --- */

function sum(arr) { return arr.reduce((a, b) => a + (+b || 0), 0); }

function fmt(n, { sign = false, zero = '—' } = {}) {
  if (n === 0 || n == null || isNaN(n)) return zero === '0' ? '$0' : zero;
  const s = n < 0 ? '−' : (sign ? '+' : '');
  return s + '$' + Math.abs(Math.round(n)).toLocaleString('en-US');
}

function fmtAccurate(n) {
  if (n === 0 || n == null || isNaN(n)) return '$0';
  const s = n < 0 ? '−' : '';
  return s + '$' + Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 0, maximumFractionDigits: 2
  });
}

function pct(n, denom)  { return denom ? Math.round((n / denom) * 100) + '%' : '—'; }
function pct1(n, denom) { return denom ? ((n / denom) * 100).toFixed(1) + '%' : '—'; }

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* Migrate saved data that predates new fields */
function migrateData(d) {
  if (!d.name)         d.name = 'Me';
  if (!d.transactions) d.transactions = [];
  return d;
}

Object.assign(window, {
  MONTHS, MONTHS_LONG, arr12,
  STARTER_DATA, BUCKETS, BUCKET_ORDER, BUCKET_CYCLE,
  sum, fmt, fmtAccurate, pct, pct1, uid, migrateData,
});
