/* ══════════════════════════════════════════════════════
   CommunityMarket – server.js
   Express REST API  ·  Uses sql.js
   ══════════════════════════════════════════════════════ */

'use strict';

const express     = require('express');
const cors        = require('cors');
const bcrypt      = require('bcryptjs');
const jwt         = require('jsonwebtoken');
const { initDb, toRows } = require('./db');

const app       = express();
const PORT      = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'communitymarket-secret-2026';

// ── Middleware ───────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));  // serve index.html, style.css, app.js

// ── Logger ───────────────────────────────────────────────
app.use((req, _res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
  next();
});

// ── Globals set after DB init ────────────────────────────
let db;
let save;

// ════════════════════════════════════════════════════════
// GEOCODING HELPER (Nominatim – free, no key needed)
// ════════════════════════════════════════════════════════
async function geocodeAddress(address) {
  if (!address) return { lat: null, lng: null };
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const { default: fetch } = await import('node-fetch').catch(() => ({ default: null }));
    const fetchFn = fetch || (await import('https').then(() => null));
    // Use built-in https as fallback
    const result = await new Promise((resolve, reject) => {
      const https = require('https');
      const req = https.get(url, { headers: { 'User-Agent': 'CommunityMarket/1.0' } }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch { resolve([]); }
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => { req.destroy(); resolve([]); });
    });
    if (result && result[0]) {
      return { lat: parseFloat(result[0].lat), lng: parseFloat(result[0].lon) };
    }
  } catch (e) {
    console.warn('Geocoding failed:', e.message);
  }
  return { lat: null, lng: null };
}

// ════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════
function relativeTime(isoString) {
  if (!isoString) return 'unknown';
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return `${Math.floor(diff / 86400)} days ago`;
}

function pctChange(price, prev) {
  if (!prev || prev === 0) return { value: 0, direction: 'flat' };
  const v = ((price - prev) / prev) * 100;
  return { value: parseFloat(Math.abs(v).toFixed(1)), direction: v > 0 ? 'up' : v < 0 ? 'down' : 'flat' };
}

// sql.js query → array of objects
function query(sql, params = []) {
  return toRows(db.exec(sql, params));
}

// sql.js query → single object or null
function queryOne(sql, params = []) {
  const rows = query(sql, params);
  return rows[0] || null;
}

// sql.js run (INSERT/UPDATE/DELETE) + return last inserted row
function run(sql, params = []) {
  db.run(sql, params);
  save();
}

// ════════════════════════════════════════════════════════
// ROUTES
// ════════════════════════════════════════════════════════

// ── GET /api/health ──────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── GET /api/stats ───────────────────────────────────────
app.get('/api/stats', (_req, res) => {
  try {
    const reports    = queryOne('SELECT COUNT(*) AS c FROM price_reports').c;
    const contribs   = queryOne('SELECT COUNT(*) AS c FROM contributors').c;
    const cities     = queryOne('SELECT COUNT(DISTINCT city) AS c FROM price_reports').c;
    const categories = queryOne('SELECT COUNT(DISTINCT name) AS c FROM price_reports').c;
    res.json({ reports, contribs, cities, categories });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ── GET /api/ticker ──────────────────────────────────────
app.get('/api/ticker', (_req, res) => {
  try {
    const CAT_EMOJI = {
      groceries:'🛒', vegetables:'🍅', fuel:'⛽',
      electronics:'💻', clothing:'👕', medicine:'💊',
      transport:'🚗', housing:'🏠'
    };
    const rows = query(
      'SELECT name, price, prev_price, category FROM price_reports ORDER BY created_at DESC LIMIT 20'
    );
    const items = rows.map(r => {
      const ch = pctChange(r.price, r.prev_price);
      return {
        name:   r.name.length > 16 ? r.name.slice(0, 14) + '…' : r.name,
        price:  `₹${r.price}`,
        change: `${ch.value}%`,
        up:     ch.direction === 'up',
        icon:   CAT_EMOJI[r.category] || '📦',
      };
    });
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch ticker' });
  }
});

// ── GET /api/overview ────────────────────────────────────
app.get('/api/overview', (_req, res) => {
  try {
    const META = {
      groceries:   { icon:'🛒', label:'Groceries Avg',  unit:'kg',    meta:'Based on community reports' },
      fuel:        { icon:'⛽', label:'Fuel Price',      unit:'litre', meta:'Pan-India average'           },
      vegetables:  { icon:'🥦', label:'Vegetables Avg', unit:'kg',    meta:'Seasonal variation'          },
      electronics: { icon:'💻', label:'Electronics',    unit:'piece', meta:'Top products avg'            },
      clothing:    { icon:'👕', label:'Clothing',       unit:'piece', meta:'Mid-range category'          },
      transport:   { icon:'🚗', label:'Transport',      unit:'trip',  meta:'Auto fare average'           },
      medicine:    { icon:'💊', label:'Medicine',       unit:'pack',  meta:'Generic drug avg'            },
      housing:     { icon:'🏠', label:'Avg Rent 1BHK',  unit:'month', meta:'Metro city average'          },
    };

    const rows = query(`
      SELECT   category,
               ROUND(AVG(price),2)      AS avg_price,
               ROUND(AVG(prev_price),2) AS avg_prev,
               COUNT(*)                 AS report_count
      FROM     price_reports
      GROUP BY category
      ORDER BY category
    `);

    const cards = rows.map(r => {
      const m   = META[r.category] || { icon:'📦', label:r.category, unit:'', meta:'' };
      const ch  = pctChange(r.avg_price, r.avg_prev);
      const disp = r.avg_price >= 1000
        ? `₹${(r.avg_price/1000).toFixed(1)}k/${m.unit}`
        : `₹${r.avg_price}/${m.unit}`;
      return {
        category:  r.category,
        icon:      m.icon,
        label:     m.label,
        price:     disp,
        change:    `${ch.direction === 'up' ? '+' : ch.direction === 'down' ? '-' : ''}${ch.value}%`,
        up:        ch.direction === 'up',
        meta:      `${m.meta} · ${r.report_count} report${r.report_count !== 1 ? 's' : ''}`,
      };
    });
    res.json(cards);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch overview' });
  }
});

// ── GET /api/chart/:category ─────────────────────────────
app.get('/api/chart/:category', (req, res) => {
  try {
    const { category } = req.params;
    const allowed = ['groceries', 'fuel', 'vegetables', 'electronics'];
    if (!allowed.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    const rows = query(
      'SELECT recorded_at AS date, price FROM price_history WHERE category = ? ORDER BY recorded_at ASC',
      [category]
    );
    const LABELS = {
      groceries:   'Groceries Avg (₹/kg)',
      fuel:        'Petrol (₹/L)',
      vegetables:  'Vegetables Avg (₹/kg)',
      electronics: 'Electronics (₹ 000s)',
    };
    const COLORS = {
      groceries:'#7c6bff', fuel:'#f97316', vegetables:'#34d399', electronics:'#38bdf8'
    };
    res.json({
      category,
      label:  LABELS[category],
      color:  COLORS[category],
      points: rows.map(r => ({ date: r.date, price: r.price })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch chart data' });
  }
});

// ── GET /api/products ────────────────────────────────────
app.get('/api/products', (req, res) => {
  try {
    const { category, search, sort, limit = 100, offset = 0 } = req.query;

    let sql    = `SELECT pr.*, u.shop_lat, u.shop_lng, u.shop_address, u.is_verified AS seller_verified
                   FROM price_reports pr LEFT JOIN users u ON pr.reporter_id = u.id WHERE 1=1`;
    const params = [];

    if (category && category !== 'all') {
      sql += ' AND category = ?';
      params.push(category);
    }
    if (search) {
      sql += ' AND (name LIKE ? OR city LIKE ? OR store LIKE ?)';
      const q = `%${search}%`;
      params.push(q, q, q);
    }

    switch (sort) {
      case 'price-asc':  sql += ' ORDER BY price ASC';  break;
      case 'price-desc': sql += ' ORDER BY price DESC'; break;
      case 'change':
        sql += ' ORDER BY ABS(price - IFNULL(prev_price, price)) / MAX(IFNULL(prev_price,1),1) DESC';
        break;
      default: sql += ' ORDER BY created_at DESC';
    }

    sql += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const rows = query(sql, params);
    res.json(rows.map(r => ({
      ...r,
      verified:  r.verified === 1,
      time:      relativeTime(r.created_at),
      pctChange: pctChange(r.price, r.prev_price),
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// ── GET /api/products/compare ────────────────────────────
app.get('/api/products/compare', (req, res) => {
  try {
    const idsParam = req.query.ids || '';
    const ids = idsParam.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);
    if (ids.length < 2 || ids.length > 4) {
      return res.status(400).json({ error: 'Provide 2–4 product IDs to compare' });
    }
    const placeholders = ids.map(() => '?').join(',');
    const products = query(
      `SELECT * FROM price_reports WHERE id IN (${placeholders}) ORDER BY price ASC`,
      ids
    );
    // Enrich with seller ratings
    const enriched = products.map(p => {
      let sellerRating = null;
      if (p.reporter_id && p.reporter_role === 'seller') {
        const agg = queryOne(
          'SELECT ROUND(AVG(rating),1) AS avg_rating, COUNT(*) AS total FROM seller_ratings WHERE seller_id = ?',
          [p.reporter_id]
        );
        sellerRating = { avg: agg?.avg_rating || 0, count: agg?.total || 0 };
      }
      return {
        ...p,
        verified: p.verified === 1,
        time: relativeTime(p.created_at),
        pctChange: pctChange(p.price, p.prev_price),
        sellerRating,
      };
    });
    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to compare products' });
  }
});

// ── GET /api/products/:id ────────────────────────────────
app.get('/api/products/:id', (req, res) => {
  try {
    const row = queryOne('SELECT * FROM price_reports WHERE id = ?', [parseInt(req.params.id)]);
    if (!row) return res.status(404).json({ error: 'Product not found' });
    res.json({ ...row, verified: row.verified === 1, time: relativeTime(row.created_at) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// ── GET /api/products/:id/history ────────────────────────
app.get('/api/products/:id/history', (req, res) => {
  try {
    const row = queryOne('SELECT name, category FROM price_reports WHERE id = ?', [parseInt(req.params.id)]);
    if (!row) return res.status(404).json({ error: 'Product not found' });

    // Get all reports for the same product name + category, ordered by date
    const history = query(
      `SELECT price, prev_price, store, city, reporter, created_at
       FROM price_reports
       WHERE LOWER(name) = LOWER(?) AND category = ?
       ORDER BY created_at ASC`,
      [row.name, row.category]
    );

    res.json({
      product: row.name,
      category: row.category,
      points: history.map(h => ({
        price: h.price,
        prev_price: h.prev_price,
        store: h.store,
        city: h.city,
        reporter: h.reporter,
        date: h.created_at,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch product history' });
  }
});

// ── POST /api/products ───────────────────────────────────
app.post('/api/products', (req, res) => {
  try {
    // Optional auth extraction
    const header = req.headers.authorization || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (token) {
      try { req.user = jwt.verify(token, JWT_SECRET); } catch (e) {}
    }

    const { name, category, price, unit, store, city, reporter, note, is_listing } = req.body;

    if (!name || !category || price === undefined || price === null) {
      return res.status(400).json({ error: 'name, category, and price are required' });
    }
    const numericPrice = parseFloat(price);
    if (isNaN(numericPrice) || numericPrice < 0) {
      return res.status(400).json({ error: 'price must be a positive number' });
    }

    // Find most recent price for same product
    const prevRow = queryOne(
      'SELECT price FROM price_reports WHERE LOWER(name) = LOWER(?) AND category = ? ORDER BY created_at DESC LIMIT 1',
      [name, category]
    );
    const prev_price = prevRow ? prevRow.price : null;

    const reporterName = (reporter || req.user?.name || '').trim() || 'Anonymous';
    const storeName    = (store  || '').trim() || 'Unknown Store';
    const cityName     = (city   || '').trim() || 'Unknown City';
    const noteVal      = (note   || '').trim() || null;
    const listingFlag  = is_listing ? 1 : 0;

    // Insert report
    let reporterRole = req.user?.role || 'anonymous';
    let reporterShop = null;
    if (reporterRole === 'seller') {
      // shop_name may not be in old JWTs; fall back to DB
      reporterShop = req.user?.shop_name ||
        queryOne('SELECT shop_name FROM users WHERE id = ?', [req.user?.id])?.shop_name ||
        storeName;
    }
    run(
      `INSERT INTO price_reports (name,category,price,prev_price,unit,store,city,reporter,reporter_id,reporter_role,reporter_shop,note,is_listing)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [name.trim(), category, numericPrice, prev_price, unit||'per kg', storeName, cityName,
       reporterName, req.user?.id || null, reporterRole, reporterShop, noteVal, listingFlag]
    );


    // Get the inserted row (last insert)
    const newRow = queryOne('SELECT * FROM price_reports ORDER BY id DESC LIMIT 1');

    // Upsert contributor (100 pts per report)
    const POINTS = 100;
    const existing = queryOne('SELECT * FROM contributors WHERE username = ?', [reporterName]);
    if (existing) {
      run('UPDATE contributors SET points = points + ?, city = ? WHERE username = ?', [POINTS, cityName, reporterName]);
    } else {
      run('INSERT INTO contributors (username, city, points) VALUES (?,?,?)', [reporterName, cityName, POINTS]);
    }

    res.status(201).json({
      ...newRow,
      verified:      false,
      time:          'just now',
      pctChange:     pctChange(numericPrice, prev_price),
      pointsAwarded: POINTS,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

// ── GET /api/leaderboard ─────────────────────────────────
app.get('/api/leaderboard', (_req, res) => {
  try {
    const rows = query('SELECT * FROM contributors ORDER BY points DESC LIMIT 10');
    const MEDALS = { 1:'🥇', 2:'🥈', 3:'🥉' };
    const result = rows.map((r, i) => {
      const rank    = i + 1;
      const reports = queryOne(
        'SELECT COUNT(*) AS c FROM price_reports WHERE reporter = ?', [r.username]
      )?.c || 0;
      return {
        rank,
        medal:    MEDALS[rank] || String(rank),
        username: r.username,
        avatar:   r.avatar || '🧑',
        city:     r.city,
        reports,
        points:   r.points,
        badges:   JSON.parse(r.badges || '[]'),
      };
    });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// ── GET /api/feed ────────────────────────────────────────
app.get('/api/feed', (_req, res) => {
  try {
    const AVATARS = ['🧑','👩','🧔','👨','👩‍💼','🧓','👩‍🍳','👨‍💻'];
    const rows = query(
      'SELECT name, price, unit, city, reporter, created_at FROM price_reports ORDER BY created_at DESC LIMIT 6'
    );
    res.json(rows.map(r => ({
      avatar:  AVATARS[Math.floor(Math.random() * AVATARS.length)],
      name:    r.reporter,
      product: `${r.name} – ₹${r.price} ${r.unit}`,
      city:    r.city,
      time:    relativeTime(r.created_at),
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
});

// ── 404 catch-all ────────────────────────────────────────
// ════════════════════════════════════════════════════════
// AUTH MIDDLEWARE
// ════════════════════════════════════════════════════════
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ════════════════════════════════════════════════════════
// AUTH ROUTES
// ════════════════════════════════════════════════════════

// ── POST /api/auth/register ──────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role, shop_name, shop_category, city, phone, shop_address, shop_lat, shop_lng } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'name, email, password and role are required' });
    }
    if (!['customer', 'seller'].includes(role)) {
      return res.status(400).json({ error: 'role must be customer or seller' });
    }
    if (role === 'seller' && !shop_name) {
      return res.status(400).json({ error: 'shop_name is required for sellers' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = queryOne('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const password_hash = await bcrypt.hash(password, 10);

    // Auto-geocode shop address so customers can see distance
    let resolvedLat = shop_lat || null;
    let resolvedLng = shop_lng || null;
    if (role === 'seller' && shop_address && !resolvedLat) {
      const geo = await geocodeAddress(`${shop_address}, ${city || ''}, India`);
      resolvedLat = geo.lat;
      resolvedLng = geo.lng;
      if (resolvedLat) console.log(`📍 Geocoded shop → ${resolvedLat}, ${resolvedLng}`);
    }

    run(
      `INSERT INTO users (name, email, password_hash, role, shop_name, shop_category, city, phone, shop_address, shop_lat, shop_lng, is_verified)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [name.trim(), email.toLowerCase().trim(), password_hash,
       role, shop_name || null, shop_category || null,
       city || 'Unknown', phone || null,
       shop_address || null, resolvedLat, resolvedLng, 0]
    );

    const user = queryOne('SELECT * FROM users ORDER BY id DESC LIMIT 1');
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role, shop_name: user.shop_name, is_verified: user.is_verified || 0 },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Also upsert into contributors
    run('INSERT OR IGNORE INTO contributors (username, city) VALUES (?,?)', [user.name, user.city || 'Unknown']);

    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role,
              shop_name: user.shop_name, shop_category: user.shop_category, city: user.city,
              shop_address: user.shop_address, shop_lat: user.shop_lat, shop_lng: user.shop_lng,
              is_verified: user.is_verified || 0 }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ── POST /api/auth/login ─────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

    const user = queryOne('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role, shop_name: user.shop_name, is_verified: user.is_verified || 0 },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role,
              shop_name: user.shop_name, shop_category: user.shop_category, city: user.city,
              shop_address: user.shop_address, shop_lat: user.shop_lat, shop_lng: user.shop_lng,
              is_verified: user.is_verified || 0 }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── GET /api/auth/me ─────────────────────────────────────
app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = queryOne('SELECT id, name, email, role, shop_name, shop_category, city, phone, created_at FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// ── GET /api/sellers ─────────────────────────────────────
app.get('/api/sellers', (_req, res) => {
  try {
    const sellers = query(`
      SELECT u.id, u.name, u.shop_name, u.shop_category, u.city,
             ROUND(AVG(sr.rating), 1)  AS avg_rating,
             COUNT(sr.id)              AS rating_count,
             COUNT(DISTINCT pr.id)     AS report_count
      FROM   users u
      LEFT JOIN seller_ratings sr ON sr.seller_id = u.id
      LEFT JOIN price_reports  pr ON pr.reporter_id = u.id
      WHERE  u.role = 'seller'
      GROUP BY u.id
      ORDER BY avg_rating DESC
    `);
    res.json(sellers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch sellers' });
  }
});

// ── GET /api/sellers/:id/ratings ─────────────────────────
app.get('/api/sellers/:id/ratings', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const seller = queryOne(
      'SELECT id, name, shop_name, shop_category, city FROM users WHERE id = ? AND role = ?',
      [id, 'seller']
    );
    if (!seller) return res.status(404).json({ error: 'Seller not found' });

    const ratings = query(
      'SELECT rater_name, rating, comment, created_at FROM seller_ratings WHERE seller_id = ? ORDER BY created_at DESC LIMIT 20',
      [id]
    );
    const agg = queryOne(
      'SELECT ROUND(AVG(rating),1) AS avg_rating, COUNT(*) AS total FROM seller_ratings WHERE seller_id = ?',
      [id]
    );
    const dist = query(
      'SELECT rating, COUNT(*) AS count FROM seller_ratings WHERE seller_id = ? GROUP BY rating ORDER BY rating DESC',
      [id]
    );
    res.json({ seller, ratings, avg_rating: agg?.avg_rating || 0, total: agg?.total || 0, distribution: dist });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch ratings' });
  }
});

// ── POST /api/sellers/:id/rate ────────────────────────────
app.post('/api/sellers/:id/rate', (req, res) => {
  try {
    const sellerId = parseInt(req.params.id);
    const { rating, comment, rater_name } = req.body;

    const numRating = parseInt(rating);
    if (!numRating || numRating < 1 || numRating > 5) {
      return res.status(400).json({ error: 'Rating must be 1–5' });
    }
    const seller = queryOne('SELECT id FROM users WHERE id = ? AND role = ?', [sellerId, 'seller']);
    if (!seller) return res.status(404).json({ error: 'Seller not found' });

    // Decode JWT if present (optional auth)
    let raterId = null, raterDisplayName = (rater_name || 'Anonymous').trim();
    const header = req.headers.authorization || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        raterId = decoded.id;
        raterDisplayName = decoded.name;
        if (raterId === sellerId) return res.status(400).json({ error: 'You cannot rate yourself' });
      } catch (_) {}
    }

    run(
      'INSERT INTO seller_ratings (seller_id, rater_id, rater_name, rating, comment) VALUES (?,?,?,?,?)',
      [sellerId, raterId, raterDisplayName, numRating, (comment || '').trim() || null]
    );

    const agg = queryOne(
      'SELECT ROUND(AVG(rating),1) AS avg_rating, COUNT(*) AS total FROM seller_ratings WHERE seller_id = ?',
      [sellerId]
    );
    res.status(201).json({ success: true, avg_rating: agg.avg_rating, total: agg.total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit rating' });
  }
});

// ── GET /api/seller/dashboard ────────────── (auth required)
app.get('/api/seller/dashboard', authMiddleware, (req, res) => {
  try {
    if (req.user.role !== 'seller') return res.status(403).json({ error: 'Seller accounts only' });

    const seller = queryOne(
      'SELECT id, name, shop_name, shop_category, city, phone, created_at FROM users WHERE id = ?',
      [req.user.id]
    );

    const products = query(
      `SELECT id, name, category, price, prev_price, unit, store, city, note, verified, created_at
       FROM price_reports WHERE reporter_id = ? AND is_listing = 1 ORDER BY created_at DESC`,
      [req.user.id]
    ).map(p => ({ ...p, pctChange: pctChange(p.price, p.prev_price), time: relativeTime(p.created_at) }));

    const ratingStats = queryOne(
      'SELECT ROUND(AVG(rating),1) AS avg_rating, COUNT(*) AS total FROM seller_ratings WHERE seller_id = ?',
      [req.user.id]
    );

    const recentReviews = query(
      'SELECT rater_name, rating, comment, created_at FROM seller_ratings WHERE seller_id = ? ORDER BY created_at DESC LIMIT 5',
      [req.user.id]
    );

    res.json({
      seller,
      products,
      avg_rating:   ratingStats?.avg_rating || 0,
      rating_count: ratingStats?.total       || 0,
      reviews: recentReviews,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// ── PATCH /api/products/:id ─────────────── (auth required, own products)
app.patch('/api/products/:id', authMiddleware, (req, res) => {
  try {
    const id  = parseInt(req.params.id);
    const own = queryOne('SELECT id, reporter_id FROM price_reports WHERE id = ?', [id]);
    if (!own) return res.status(404).json({ error: 'Product not found' });
    if (own.reporter_id !== req.user.id) return res.status(403).json({ error: 'You can only edit your own listings' });

    const { price, unit, note, name, category } = req.body;
    const current = queryOne('SELECT * FROM price_reports WHERE id = ?', [id]);

    const newPrice = price !== undefined ? parseFloat(price) : current.price;
    if (isNaN(newPrice) || newPrice <= 0) return res.status(400).json({ error: 'Invalid price' });

    run(
      `UPDATE price_reports
       SET prev_price = price,
           price    = ?,
           unit     = COALESCE(?,unit),
           note     = COALESCE(?,note),
           name     = COALESCE(?,name),
           category = COALESCE(?,category)
       WHERE id = ?`,
      [newPrice, unit || null, note || null, name || null, category || null, id]
    );

    const updated = queryOne('SELECT * FROM price_reports WHERE id = ?', [id]);
    res.json({ ...updated, pctChange: pctChange(updated.price, updated.prev_price) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// ── DELETE /api/products/:id ──────────────  (auth required, own products)
app.delete('/api/products/:id', authMiddleware, (req, res) => {
  try {
    const id  = parseInt(req.params.id);
    const own = queryOne('SELECT id, reporter_id FROM price_reports WHERE id = ?', [id]);
    if (!own) return res.status(404).json({ error: 'Product not found' });
    if (own.reporter_id !== req.user.id) return res.status(403).json({ error: 'You can only delete your own listings' });

    run('DELETE FROM price_reports WHERE id = ?', [id]);
    res.json({ success: true, deleted: id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// ── 404 catch-all ─────────────────────────────────────────
app.use('/api/*', (_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});


// ════════════════════════════════════════════════════════
// START SERVER
// ════════════════════════════════════════════════════════
// ORDER SYSTEM
// ════════════════════════════════════════════════════════

// ── POST /api/orders ─────────── (auth required)
app.post('/api/orders', authMiddleware, (req, res) => {
  try {
    const { items, fulfillment, delivery_address, customer_phone } = req.body;
    if (!items || !items.length) return res.status(400).json({ error: 'No items in order' });
    if (!['pickup', 'delivery'].includes(fulfillment)) {
      return res.status(400).json({ error: 'fulfillment must be pickup or delivery' });
    }
    if (fulfillment === 'delivery' && !delivery_address) {
      return res.status(400).json({ error: 'Delivery address is required for delivery orders' });
    }

    const createdOrders = [];
    for (const item of items) {
      const product = queryOne('SELECT * FROM price_reports WHERE id = ?', [item.product_id]);
      if (!product) continue;
      if (!product.reporter_id || !product.is_listing) continue;

      const qty = Math.max(1, parseInt(item.qty) || 1);
      const total = product.price * qty;
      const orderNum = 'CM-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2,5).toUpperCase();

      run(
        `INSERT INTO orders (order_number, customer_id, seller_id, product_id, product_name, qty, unit_price, total, fulfillment, delivery_address, customer_phone, status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [orderNum, req.user.id, product.reporter_id, product.id, product.name, qty, product.price, total,
         fulfillment, delivery_address || null, customer_phone || null, 'pending']
      );
      createdOrders.push({ order_number: orderNum, product_name: product.name, qty, total, fulfillment });
    }

    if (createdOrders.length === 0) {
      return res.status(400).json({ error: 'No valid seller listings found in cart' });
    }

    const grandTotal = createdOrders.reduce((s, o) => s + o.total, 0);
    res.status(201).json({
      message: `${createdOrders.length} order${createdOrders.length > 1 ? 's' : ''} placed!`,
      orders: createdOrders,
      grand_total: grandTotal,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to place order' });
  }
});

// ── GET /api/orders/my ───────── (auth, customer orders)
app.get('/api/orders/my', authMiddleware, (req, res) => {
  try {
    const orders = query(
      `SELECT o.*, u.shop_name AS seller_shop, u.name AS seller_name, u.city AS seller_city,
              u.shop_address AS seller_address, u.shop_lat, u.shop_lng, u.phone AS seller_phone
       FROM orders o JOIN users u ON u.id = o.seller_id
       WHERE o.customer_id = ? ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    res.json(orders.map(o => ({ ...o, time: relativeTime(o.created_at) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// ── GET /api/orders/seller ───── (auth, seller incoming orders)
app.get('/api/orders/seller', authMiddleware, (req, res) => {
  try {
    if (req.user.role !== 'seller') return res.status(403).json({ error: 'Seller accounts only' });
    const orders = query(
      `SELECT o.*, u.name AS customer_name, u.phone AS cust_phone, u.city AS customer_city
       FROM orders o JOIN users u ON u.id = o.customer_id
       WHERE o.seller_id = ? ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    res.json(orders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch seller orders' });
  }
});

// ── PATCH /api/orders/:id/status ── (seller updates order status)
app.patch('/api/orders/:id/status', authMiddleware, (req, res) => {
  try {
    const orderId = parseInt(req.params.id);
    const { status } = req.body;
    const valid = ['pending', 'confirmed', 'ready', 'out_for_delivery', 'completed', 'cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const order = queryOne('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.seller_id !== req.user.id) return res.status(403).json({ error: 'Not your order' });

    run('UPDATE orders SET status = ?, updated_at = datetime(?) WHERE id = ?', [status, new Date().toISOString(), orderId]);
    res.json({ ...order, status, updated_at: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// ════════════════════════════════════════════════════════
// START
async function start() {
  const { db: sqlDb, saveDb } = await initDb();
  db   = sqlDb;
  save = saveDb;

  app.listen(PORT, () => {
    console.log('');
    console.log('  🛒  CommunityMarket API running!');
    console.log(`  🌐 App   → http://localhost:${PORT}/`);
    console.log(`  📡 API   → http://localhost:${PORT}/api/health`);
    console.log('');
  });
}

start().catch(err => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
