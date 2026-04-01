/* ══════════════════════════════════════════════════════
   PriceWatch – db.js
   SQLite database via sql.js (pure JS, no native build)
   Persists to pricewatch.db using fs read/write
   ══════════════════════════════════════════════════════ */

'use strict';

const fs         = require('fs');
const path       = require('path');
const initSqlJs  = require('sql.js');

const RENDER_DISK = '/opt/render/project/data';
const DB_DIR = process.env.NODE_ENV === 'production' && require('fs').existsSync(RENDER_DISK)
  ? RENDER_DISK
  : __dirname;
const DB_PATH = path.join(DB_DIR, 'pricewatch.db');

// ── Helper: save DB to disk ──────────────────────────────
function saveDb(db) {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ════════════════════════════════════════════════════════
// SEED DATA
// ════════════════════════════════════════════════════════
function ago(mins) {
  const d = new Date(Date.now() - mins * 60 * 1000);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

const SEED_REPORTS = [
  { name:'Basmati Rice',        category:'groceries',   price:85,    prev_price:79,    unit:'per kg',    store:'Big Bazaar',       city:'Mumbai',    reporter:'Priya S.',      note:'1121 variety',       verified:1, created_at:ago(2)   },
  { name:'Petrol (92 Octane)',   category:'fuel',        price:105,   prev_price:108,   unit:'per litre', store:'HP Petrol Pump',   city:'Delhi',     reporter:'Rohan M.',      note:null,                 verified:1, created_at:ago(5)   },
  { name:'Tomatoes',            category:'vegetables',  price:28,    prev_price:22,    unit:'per kg',    store:'Local Mandi',      city:'Bangalore', reporter:'Anita R.',      note:'Medium quality',     verified:0, created_at:ago(8)   },
  { name:'Onions',              category:'vegetables',  price:35,    prev_price:42,    unit:'per kg',    store:'Reliance Fresh',   city:'Hyderabad', reporter:'Suresh K.',     note:null,                 verified:1, created_at:ago(12)  },
  { name:'Diesel',              category:'fuel',        price:92,    prev_price:91,    unit:'per litre', store:'IOCL Bunk',        city:'Chennai',   reporter:'Kumar V.',      note:null,                 verified:1, created_at:ago(15)  },
  { name:'Wheat Flour (Atta)',   category:'groceries',   price:48,    prev_price:50,    unit:'per kg',    store:'D-Mart',           city:'Pune',      reporter:'Meena J.',      note:'Aashirvaad brand',   verified:1, created_at:ago(20)  },
  { name:'Eggs (Dozen)',         category:'groceries',   price:90,    prev_price:85,    unit:'per dozen', store:"Nature's Basket", city:'Mumbai',    reporter:'Vikram S.',     note:null,                 verified:0, created_at:ago(25)  },
  { name:'5G Smartphone 128GB', category:'electronics', price:18999, prev_price:19499, unit:'per piece', store:'Croma',            city:'Delhi',     reporter:'Arjun P.',      note:'Realme brand',       verified:1, created_at:ago(60)  },
  { name:'Potatoes',            category:'vegetables',  price:20,    prev_price:18,    unit:'per kg',    store:'Local Market',     city:'Kolkata',   reporter:'Debashish D.', note:null,                 verified:1, created_at:ago(60)  },
  { name:'Cooking Oil (1L)',     category:'groceries',   price:140,   prev_price:145,   unit:'per litre', store:'Metro Cash',       city:'Ahmedabad', reporter:'Hiral P.',      note:'Sunflower oil',      verified:1, created_at:ago(120) },
  { name:'Milk (Full Cream)',    category:'groceries',   price:68,    prev_price:65,    unit:'per litre', store:'Amul Parlour',     city:'Jaipur',    reporter:'Neha G.',       note:null,                 verified:0, created_at:ago(120) },
  { name:'LED TV 43"',           category:'electronics', price:24999, prev_price:27000, unit:'per piece', store:'Samsung Store',    city:'Bangalore', reporter:'Ram V.',        note:'4K UHD model',       verified:1, created_at:ago(180) },
  { name:'Cotton T-Shirt',       category:'clothing',    price:299,   prev_price:349,   unit:'per piece', store:'H&M',              city:'Mumbai',    reporter:'Pooja L.',      note:null,                 verified:1, created_at:ago(240) },
  { name:'Auto Fare (3km)',      category:'transport',   price:45,    prev_price:40,    unit:'per trip',  store:'Local Auto',       city:'Chennai',   reporter:'Anonymous',     note:null,                 verified:0, created_at:ago(240) },
  { name:'Paracetamol 500mg',    category:'medicine',    price:28,    prev_price:26,    unit:'per pack',  store:'MedPlus',          city:'Hyderabad', reporter:'Dr. Sana A.',   note:'10s strip',          verified:1, created_at:ago(300) },
  { name:'1BHK Rent',            category:'housing',     price:15000, prev_price:14000, unit:'per month', store:'NoBroker',         city:'Pune',      reporter:'Santosh R.',    note:'Semi-furnished',     verified:1, created_at:ago(360) },
  { name:'Green Chilli',         category:'vegetables',  price:60,    prev_price:80,    unit:'per kg',    store:'Vegetable Market', city:'Delhi',     reporter:'Sunita T.',     note:null,                 verified:1, created_at:ago(420) },
  { name:'Laptop 15" (i5)',      category:'electronics', price:55000, prev_price:58000, unit:'per piece', store:'Vijay Sales',      city:'Mumbai',    reporter:'Nikhil D.',     note:'8GB RAM, 512GB SSD', verified:1, created_at:ago(480) },
];

const SEED_CONTRIBUTORS = [
  { username:'RaviKumar_99',   avatar:'👨‍💻', city:'Mumbai',    points:8650, badges:'["🥇","🔥","⭐"]' },
  { username:'PriyaShops',     avatar:'👩‍🍳', city:'Delhi',     points:7200, badges:'["🥈","🛒","💎"]' },
  { username:'MarketWatcher',  avatar:'🧔',   city:'Bangalore', points:6100, badges:'["🥉","📊"]'       },
  { username:'DailyPrices',    avatar:'👩',   city:'Hyderabad', points:5040, badges:'["📈"]'             },
  { username:'FuelTracker_MH', avatar:'👦',   city:'Pune',      points:4550, badges:'["⛽","🔍"]'       },
  { username:'SavvyShopper',   avatar:'👩‍💼', city:'Chennai',   points:4130, badges:'["🛒"]'             },
  { username:'VeggieKing',     avatar:'🧑',   city:'Kolkata',   points:3570, badges:'["🥦"]'             },
  { username:'TechPrices',     avatar:'👨',   city:'Ahmedabad', points:3360, badges:'["💻"]'             },
  { username:'MediSave',       avatar:'👩‍🔬', city:'Jaipur',    points:2940, badges:'["💊"]'             },
  { username:'RetailRadar',    avatar:'🧓',   city:'Surat',     points:2660, badges:'["📍"]'             },
];

function genPriceSeries(base, vol) {
  const rows = [];
  let val = base;
  for (let i = 29; i >= 0; i--) {
    val += (Math.random() - 0.48) * vol;
    val  = Math.round(val * 100) / 100;
    const d = new Date();
    d.setDate(d.getDate() - i);
    rows.push({ category: null, price: val, date: d.toISOString().slice(0, 10) });
  }
  return rows;
}

const CHART_CATEGORIES = [
  { id:'groceries',   base:75, vol:3  },
  { id:'fuel',        base:104, vol:1 },
  { id:'vegetables',  base:32, vol:5  },
  { id:'electronics', base:29, vol:2  },
];

// ════════════════════════════════════════════════════════
// INIT DB
// ════════════════════════════════════════════════════════
async function initDb() {
  const SQL = await initSqlJs();

  let db;
  if (fs.existsSync(DB_PATH)) {
    console.log('📂 Loading existing database from', DB_PATH);
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    console.log('🆕 Creating new database at', DB_PATH);
    db = new SQL.Database();
  }

  // ── Schema ──────────────────────────────────────────
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL,
      email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT    NOT NULL,
      role          TEXT    NOT NULL DEFAULT 'customer',
      shop_name     TEXT,
      shop_category TEXT,
      city          TEXT    DEFAULT 'Unknown',
      phone         TEXT,
      created_at    TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS price_reports (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT    NOT NULL,
      category        TEXT    NOT NULL,
      price           REAL    NOT NULL,
      prev_price      REAL,
      unit            TEXT    DEFAULT 'per kg',
      store           TEXT    DEFAULT 'Unknown Store',
      city            TEXT    DEFAULT 'Unknown City',
      reporter        TEXT    DEFAULT 'Anonymous',
      reporter_id     INTEGER,
      reporter_role   TEXT    DEFAULT 'anonymous',
      reporter_shop   TEXT,
      note            TEXT,
      verified        INTEGER DEFAULT 0,
      created_at      TEXT    DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      category    TEXT    NOT NULL,
      price       REAL    NOT NULL,
      recorded_at TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contributors (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT    NOT NULL UNIQUE,
      avatar   TEXT    DEFAULT '🧑',
      city     TEXT    DEFAULT 'Unknown',
      points   INTEGER DEFAULT 0,
      badges   TEXT    DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS seller_ratings (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_id   INTEGER NOT NULL,
      rater_id    INTEGER,
      rater_name  TEXT    DEFAULT 'Anonymous',
      rating      INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      comment     TEXT,
      created_at  TEXT    DEFAULT (datetime('now')),
      FOREIGN KEY(seller_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number     TEXT    NOT NULL UNIQUE,
      customer_id      INTEGER NOT NULL,
      seller_id        INTEGER NOT NULL,
      product_id       INTEGER NOT NULL,
      product_name     TEXT    NOT NULL,
      qty              INTEGER NOT NULL DEFAULT 1,
      unit_price       REAL    NOT NULL,
      total            REAL    NOT NULL,
      fulfillment      TEXT    NOT NULL DEFAULT 'pickup',
      delivery_address TEXT,
      customer_phone   TEXT,
      status           TEXT    NOT NULL DEFAULT 'pending',
      created_at       TEXT    DEFAULT (datetime('now')),
      updated_at       TEXT    DEFAULT (datetime('now')),
      FOREIGN KEY(customer_id) REFERENCES users(id),
      FOREIGN KEY(seller_id)   REFERENCES users(id),
      FOREIGN KEY(product_id)  REFERENCES price_reports(id)
    );
  `);

  // ── Migrations (safe: ignore errors if columns already exist) ───
  const migrations = [
    `ALTER TABLE price_reports ADD COLUMN reporter_id   INTEGER`,
    `ALTER TABLE price_reports ADD COLUMN reporter_role TEXT DEFAULT 'anonymous'`,
    `ALTER TABLE price_reports ADD COLUMN reporter_shop TEXT`,
    `ALTER TABLE price_reports ADD COLUMN is_listing    INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN shop_address TEXT`,
    `ALTER TABLE users ADD COLUMN shop_lat     REAL`,
    `ALTER TABLE users ADD COLUMN shop_lng     REAL`,
    `ALTER TABLE users ADD COLUMN is_verified  INTEGER DEFAULT 0`,
  ];
  for (const m of migrations) {
    try { db.run(m); } catch (_) { /* column already exists */ }
  }
  // ── Seed reports ─────────────────────────────────────
  const [[{ count: reportCount }]] = db.exec('SELECT COUNT(*) AS count FROM price_reports').map(r =>
    r.values.map(v => Object.fromEntries(r.columns.map((c,i) => [c, v[i]])))
  );

  if (reportCount === 0) {
    for (const r of SEED_REPORTS) {
      db.run(
        `INSERT INTO price_reports (name,category,price,prev_price,unit,store,city,reporter,note,verified,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [r.name,r.category,r.price,r.prev_price??null,r.unit,r.store,r.city,r.reporter,r.note??null,r.verified,r.created_at]
      );
    }
    console.log(`✅ Seeded ${SEED_REPORTS.length} price reports`);
  }

  // ── Seed history ─────────────────────────────────────
  const [[{ count: histCount }]] = db.exec('SELECT COUNT(*) AS count FROM price_history').map(r =>
    r.values.map(v => Object.fromEntries(r.columns.map((c,i) => [c, v[i]])))
  );

  if (histCount === 0) {
    for (const cat of CHART_CATEGORIES) {
      const series = genPriceSeries(cat.base, cat.vol);
      for (const pt of series) {
        db.run(
          'INSERT INTO price_history (category,price,recorded_at) VALUES (?,?,?)',
          [cat.id, pt.price, pt.date]
        );
      }
    }
    console.log('✅ Seeded 30-day price history for 4 categories');
  }

  // ── Seed contributors ─────────────────────────────────
  const [[{ count: contribCount }]] = db.exec('SELECT COUNT(*) AS count FROM contributors').map(r =>
    r.values.map(v => Object.fromEntries(r.columns.map((c,i) => [c, v[i]])))
  );

  if (contribCount === 0) {
    for (const c of SEED_CONTRIBUTORS) {
      db.run(
        'INSERT INTO contributors (username,avatar,city,points,badges) VALUES (?,?,?,?,?)',
        [c.username,c.avatar,c.city,c.points,c.badges]
      );
    }
    console.log(`✅ Seeded ${SEED_CONTRIBUTORS.length} contributors`);
  }

  saveDb(db);
  console.log('💾 Database ready\n');
  return { db, saveDb: () => saveDb(db) };
}

// ════════════════════════════════════════════════════════
// QUERY HELPER
// ════════════════════════════════════════════════════════
// Converts sql.js result set into array of plain objects
function toRows(results) {
  if (!results || results.length === 0) return [];
  const { columns, values } = results[0];
  return values.map(v => Object.fromEntries(columns.map((c, i) => [c, v[i]])));
}

module.exports = { initDb, toRows };
