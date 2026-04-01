/* ══════════════════════════════════════════════════════════
   CommunityMarket – app.js
   Frontend logic – all data loaded from the REST API
   ══════════════════════════════════════════════════════════ */

'use strict';

const API = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3001/api'
  : `${window.location.origin}/api`;

// ── AUTH STATE ──
let currentUser  = JSON.parse(localStorage.getItem('cm_user')  || 'null');
let currentToken = localStorage.getItem('cm_token') || null;

// ────────────────────────────────────────────────────────────
// STATE
// ────────────────────────────────────────────────────────────
let activeCategory = 'all';
let activeChartCat = 'groceries';
let searchQuery    = '';
let sortMode       = 'recent';
let visibleCount   = 9;
let allProducts    = [];   // cached from last fetch
let priceChart     = null; // Chart.js instance
let detailChart    = null; // detail modal chart

// ── CART STATE ──
let cart = JSON.parse(localStorage.getItem('cm_cart') || '[]');

// ── WISHLIST STATE ──
let wishlist = JSON.parse(localStorage.getItem('cm_wishlist') || '[]');

// ── COMPARE STATE ──
let compareList = []; // array of product IDs, max 4

// ────────────────────────────────────────────────────────────
// CONSTANTS
// ────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id:'all',          label:'All',           emoji:'🌐' },
  { id:'groceries',    label:'Groceries',     emoji:'🛒' },
  { id:'vegetables',   label:'Vegetables',    emoji:'🥦' },
  { id:'fuel',         label:'Fuel',          emoji:'⛽' },
  { id:'electronics',  label:'Electronics',   emoji:'💻' },
  { id:'clothing',     label:'Clothing',      emoji:'👕' },
  { id:'medicine',     label:'Medicine',      emoji:'💊' },
  { id:'transport',    label:'Transport',     emoji:'🚗' },
  { id:'housing',      label:'Housing',       emoji:'🏠' },
];

// ────────────────────────────────────────────────────────────
// INIT
// ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  updateNavAuth();
  setupNavScroll();
  setupHamburger();
  buildFilterPills();
  setupSearch();
  setupSort();
  setupChartTabs();
  setupLoadMore();
  updateCartBadge();
  updateWishlistBadge();
  updateCompareBar();
  initGeolocation();

  // Wire submit modal button
  const submitBtn = document.getElementById('openSubmitModal');
  if (submitBtn) submitBtn.addEventListener('click', openModal);

  // Show skeletons while data loads
  showProductSkeletons();
  showOverviewSkeletons();

  // Parallel data load
  await Promise.all([
    loadStats(),
    loadTicker(),
    loadOverview(),
    loadProducts(),
    loadChart(activeChartCat),
    loadLeaderboard(),
    loadFeed(),
  ]);

  // Live polling every 20 seconds
  setInterval(() => { loadTicker(); loadFeed(); }, 20_000);
});

// ────────────────────────────────────────────────────────────
// FETCH HELPER
// ────────────────────────────────────────────────────────────
async function apiFetch(path) {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json();
}

// ────────────────────────────────────────────────────────────
// STATS
// ────────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const data = await apiFetch('/stats');
    animateCounter('statReports',   data.reports,    '');
    animateCounter('statUsers',     data.contribs,   '');
    animateCounter('statCities',    data.cities,     '+');
    animateCounter('statCategories',data.categories, '+');
  } catch (e) {
    console.warn('Stats load failed:', e.message);
  }
}

function animateCounter(elId, end, suffix) {
  const el = document.getElementById(elId);
  if (!el) return;
  const duration = 1800;
  const start = Date.now();
  const tick = () => {
    const progress = Math.min((Date.now() - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.floor(eased * end).toLocaleString() + suffix;
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ────────────────────────────────────────────────────────────
// TICKER
// ────────────────────────────────────────────────────────────
async function loadTicker() {
  try {
    const items = await apiFetch('/ticker');
    buildTicker(items);
  } catch (e) {
    console.warn('Ticker load failed:', e.message);
  }
}

function buildTicker(items) {
  const track = document.getElementById('tickerTrack');
  if (!track) return;
  const all = [...items, ...items]; // duplicate for seamless loop
  track.innerHTML = all.map(t => `
    <span class="ticker-item">
      <span>${t.icon}</span>
      <span class="t-name">${t.name}</span>
      <span class="t-price">${t.price}</span>
      <span class="${t.up ? 't-up' : 't-down'}">${t.up ? '▲' : '▼'} ${t.change}</span>
    </span>
  `).join('');
}

// ────────────────────────────────────────────────────────────
// OVERVIEW CARDS
// ────────────────────────────────────────────────────────────
function showOverviewSkeletons() {
  const grid = document.getElementById('overviewGrid');
  if (!grid) return;
  grid.innerHTML = Array(8).fill(`
    <div class="overview-card" style="gap:12px;display:flex;flex-direction:column;">
      <div class="skeleton" style="width:40px;height:40px;border-radius:8px;"></div>
      <div class="skeleton" style="width:60%;height:12px;"></div>
      <div class="skeleton" style="width:80%;height:28px;"></div>
      <div class="skeleton" style="width:50%;height:12px;"></div>
    </div>
  `).join('');
}

async function loadOverview() {
  try {
    const cards = await apiFetch('/overview');
    buildOverview(cards);
  } catch (e) {
    console.warn('Overview load failed:', e.message);
    document.getElementById('overviewGrid').innerHTML =
      `<p style="color:var(--text3);text-align:center;grid-column:1/-1;">Could not load market data.</p>`;
  }
}

function buildOverview(cards) {
  const grid = document.getElementById('overviewGrid');
  if (!grid) return;
  const grads = [
    '#7c6bff,#5eead4','#f97316,#fbbf24','#34d399,#38bdf8','#fb7185,#f97316',
    '#818cf8,#c084fc','#38bdf8,#34d399','#fb7185,#fb923c','#a78bfa,#60a5fa'
  ];
  grid.innerHTML = cards.map((d, i) => `
    <div class="overview-card" style="--card-grad:linear-gradient(135deg,${grads[i % grads.length]});">
      <div class="ov-icon">${d.icon}</div>
      <div class="ov-label">${d.label}</div>
      <div class="ov-price">${d.price}</div>
      <div class="ov-change ${d.up ? 'up' : 'down'}">${d.up ? '▲' : '▼'} ${d.change} vs last report</div>
      <div class="ov-meta">${d.meta}</div>
    </div>
  `).join('');
}

// ────────────────────────────────────────────────────────────
// CHART
// ────────────────────────────────────────────────────────────
async function loadChart(category) {
  try {
    const data = await apiFetch(`/chart/${category}`);
    const labels = data.points.map(p => {
      const d = new Date(p.date);
      return d.toLocaleDateString('en-IN', { day:'numeric', month:'short' });
    });
    const prices = data.points.map(p => p.price);
    renderChart(labels, prices, data.color, data.label);
    updateChartLegend(prices, data.color, data.label);
  } catch (e) {
    console.warn('Chart load failed:', e.message);
  }
}

function renderChart(labels, prices, color, label) {
  const ctx = document.getElementById('priceChart');
  if (!ctx) return;
  const context = ctx.getContext('2d');

  const gradient = context.createLinearGradient(0, 0, 0, 350);
  gradient.addColorStop(0, hexToRgba(color, 0.35));
  gradient.addColorStop(1, hexToRgba(color, 0.0));

  const dataset = {
    label,
    data: prices,
    borderColor: color,
    backgroundColor: gradient,
    fill: true,
    tension: 0.4,
    pointRadius: 3,
    pointHoverRadius: 7,
    pointBackgroundColor: color,
    pointBorderColor: '#fff',
    pointBorderWidth: 2,
    borderWidth: 2.5,
  };

  if (priceChart) {
    priceChart.data.labels             = labels;
    priceChart.data.datasets[0]        = dataset;
    priceChart.update('active');
  } else {
    priceChart = new Chart(context, {
      type: 'line',
      data: { labels, datasets: [dataset] },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 3,
        interaction: { intersect:false, mode:'index' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(17,20,34,0.95)',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            padding: 12,
            titleColor: '#9ba3c7',
            bodyColor:  '#e8eaf6',
            callbacks: {
              label: ctx => ` ₹ ${ctx.parsed.y.toFixed(2)}`,
            }
          }
        },
        scales: {
          x: {
            grid:  { color:'rgba(255,255,255,0.04)', drawBorder:false },
            ticks: { color:'#5b6494', font:{ size:11 }, maxTicksLimit:10 }
          },
          y: {
            grid:  { color:'rgba(255,255,255,0.04)', drawBorder:false },
            ticks: { color:'#5b6494', font:{ size:11 }, callback: v => '₹' + v }
          }
        }
      }
    });
  }
}

function updateChartLegend(prices, color, label) {
  const max = Math.max(...prices), min = Math.min(...prices);
  const cur = prices[prices.length - 1];
  const change = (((cur - prices[0]) / prices[0]) * 100).toFixed(1);
  const up = change >= 0;
  document.getElementById('chartLegend').innerHTML = `
    <div class="legend-item"><span class="legend-dot" style="background:${color}"></span>${label}</div>
    <div class="legend-item">📍 Current: <strong>₹${cur}</strong></div>
    <div class="legend-item">📈 30-day High: <strong>₹${max}</strong></div>
    <div class="legend-item">📉 30-day Low: <strong>₹${min}</strong></div>
    <div class="legend-item">Trend: <strong style="color:${up ? '#34d399' : '#fb7185'}">${up ? '▲' : '▼'} ${Math.abs(change)}%</strong></div>
  `;
}

function setupChartTabs() {
  document.querySelectorAll('.chart-tab').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.chart-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeChartCat = btn.dataset.cat;
      await loadChart(activeChartCat);
    });
  });
}

// ────────────────────────────────────────────────────────────
// PRODUCTS
// ────────────────────────────────────────────────────────────
function showProductSkeletons() {
  const grid = document.getElementById('productsGrid');
  if (!grid) return;
  grid.innerHTML = Array(6).fill(`
    <div class="product-card" style="gap:10px;display:flex;flex-direction:column;">
      <div class="skeleton" style="width:90px;height:20px;border-radius:99px;"></div>
      <div class="skeleton" style="width:80%;height:18px;"></div>
      <div class="skeleton" style="width:60%;height:12px;"></div>
      <div style="display:flex;gap:8px;align-items:center;">
        <div class="skeleton" style="width:80px;height:32px;"></div>
        <div class="skeleton" style="width:120px;height:40px;flex:1;border-radius:8px;"></div>
      </div>
      <div class="skeleton" style="width:100%;height:12px;"></div>
    </div>
  `).join('');
}

async function loadProducts() {
  try {
    const params = new URLSearchParams({ sort: sortMode, limit: 100 });
    if (activeCategory !== 'all') params.set('category', activeCategory);
    if (searchQuery) params.set('search', searchQuery);

    const data = await apiFetch(`/products?${params}`);
    allProducts = data;
    renderProducts();
  } catch (e) {
    console.warn('Products load failed:', e.message);
    document.getElementById('productsGrid').innerHTML =
      `<div style="grid-column:1/-1;text-align:center;padding:60px 0;color:var(--text3);">
        <div style="font-size:3rem;margin-bottom:12px;">⚠️</div>
        <p>Could not connect to the server. Make sure it's running on port 3001.</p>
        <p style="margin-top:8px;font-size:0.82rem;">Run: <code style="background:var(--surface);padding:2px 8px;border-radius:4px;">npm start</code></p>
      </div>`;
  }
}

function getFilteredProducts() {
  let list = [...allProducts];
  if (activeCategory !== 'all') list = list.filter(p => p.category === activeCategory);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(p =>
      p.name.toLowerCase().includes(q)  ||
      p.city.toLowerCase().includes(q)  ||
      (p.store && p.store.toLowerCase().includes(q))
    );
  }
  switch (sortMode) {
    case 'price-asc':  list.sort((a,b) => a.price - b.price); break;
    case 'price-desc': list.sort((a,b) => b.price - a.price); break;
    case 'change':
      list.sort((a,b) => {
        const ca = a.pctChange ? a.pctChange.value : 0;
        const cb = b.pctChange ? b.pctChange.value : 0;
        return cb - ca;
      });
      break;
    default: break;
  }
  return list;
}

function sparklineSVG(product) {
  const base = product.prev_price || product.price;
  const cur  = product.price;
  const pts  = [base];
  let v = base;
  for (let i = 0; i < 9; i++) { v += (Math.random()-0.4)*(base*0.04); pts.push(v); }
  pts.push(cur);
  const mn = Math.min(...pts), mx = Math.max(...pts);
  const rng = mx - mn || 1;
  const W = 220, H = 40;
  const coords = pts.map((p,i) => {
    const x = (i / (pts.length-1)) * W;
    const y = H - ((p - mn) / rng) * (H - 6) - 3;
    return `${x},${y}`;
  });
  const up = cur >= base;
  const color = up ? '#34d399' : '#fb7185';
  const areaPath = `M${coords.join('L')}L${W},${H}L0,${H}Z`;
  return `<svg class="sparkline-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs>
      <linearGradient id="sg${product.id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path class="spark-area" d="${areaPath}" fill="url(#sg${product.id})"/>
    <polyline class="spark-line" points="${coords.join(' ')}" stroke="${color}"/>
  </svg>`;
}

function priceDisplay(p) {
  if (p.price >= 1000) return '₹' + (p.price/1000).toFixed(1) + 'k';
  return '₹' + p.price;
}

function renderProducts() {
  const grid  = document.getElementById('productsGrid');
  const list  = getFilteredProducts();
  const shown = list.slice(0, visibleCount);

  if (!shown.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px 0;color:var(--text3);">
        <div style="font-size:3rem;margin-bottom:12px;">🔍</div>
        <p>No products found. Try adjusting your filters.</p>
      </div>`;
    document.getElementById('loadMoreBtn').style.display = 'none';
    return;
  }

  grid.innerHTML = shown.map(p => {
    const ch      = p.pctChange || { value:0, direction:'flat' };
    const catInfo = CATEGORIES.find(c => c.id === p.category) || { emoji:'📦', label:p.category };
    const chCls   = ch.direction === 'up' ? 'up' : ch.direction === 'down' ? 'down' : 'flat';
    const arrow   = ch.direction === 'up' ? '▲' : ch.direction === 'down' ? '▼' : '–';
    const isSellerListing = p.reporter_role === 'seller' && p.is_listing;
    const sellerBadge = isSellerListing
      ? `<span class="pc-seller-badge">\uD83C\uDFEA ${escHtml(p.reporter_shop || p.store || 'Verified Seller')}</span>`
      : '';
    const ratingRow = isSellerListing && p.reporter_id
      ? `<div style="margin-top:6px;display:flex;align-items:center;gap:6px;">
           <span class="pc-stars" id="stars-${p.id}"><span style="color:var(--text3);font-size:0.72rem;">Loading...</span></span>
           <button class="pc-rating-btn" onclick="event.stopPropagation();openRatingModal(${p.reporter_id},'${escHtml(p.reporter)}','${escHtml(p.reporter_shop||'')}')">Rate seller</button>
         </div>`
      : '';
    const noteRow = p.note
      ? `<div class="pc-note">\uD83D\uDCDD ${escHtml(p.note)}</div>`
      : '';
    const isOwner = currentUser && currentUser.role === 'seller' && p.reporter_id && currentUser.id === p.reporter_id && p.is_listing;
    const ownerBadge = isOwner ? `<span class="pc-owner-badge">\u2728 Your Listing</span>` : '';
    const editBtn = isOwner
      ? `<button class="pc-edit-btn" onclick="event.stopPropagation();openEditProduct(${p.id})">\u270f\ufe0f Edit</button>`
      : '';
    const prevPriceHtml = p.prev_price && p.prev_price !== p.price
      ? `<div class="pc-prev-price">\u20b9${p.prev_price}</div>`
      : '';
    const inWishlist = wishlist.some(w => w.id === p.id);
    const inCompare = compareList.includes(p.id);
    return `
    <div class="product-card" id="product-${p.id}" onclick="showProductDetail(${p.id})">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        <div class="pc-category-badge">${catInfo.emoji} ${catInfo.label}</div>
        ${sellerBadge}
        ${ownerBadge}
        ${editBtn}
      </div>
      <div class="pc-name">${p.name}</div>
      <div class="pc-location">\uD83D\uDCCD ${p.store}, ${p.city} ${getDistanceText(p)} ${getVerifiedBadge(p)}</div>
      ${noteRow}
      ${ratingRow}
      <div class="pc-price-row">
        ${prevPriceHtml}
        <div class="pc-price">${priceDisplay(p)}</div>
        <div class="pc-unit">${p.unit}</div>
        <div class="pc-change ${chCls}">${arrow} ${ch.value}%</div>
      </div>
      <div class="pc-sparkline">${sparklineSVG(p)}</div>
      <div class="pc-meta">
        <span>${isSellerListing ? '<span class="pc-verified">🏪 Seller Listed</span>' : (p.verified ? '<span class="pc-verified">\u2713 Verified</span>' : '📋 Pending Review')}</span>
        <span>${isSellerListing ? '🏪 Sold by ' + escHtml(p.reporter_shop || p.store) : '👤 Reported by ' + escHtml(p.reporter)}</span>
      </div>
      <div class="pc-actions-row">
        <button class="pc-cart-btn" onclick="event.stopPropagation();addToCart(${p.id})">\uD83D\uDED2 Cart</button>
        <button class="pc-wishlist-btn ${inWishlist ? 'active' : ''}" onclick="event.stopPropagation();toggleWishlistItem(${p.id})"><span class="heart-icon">${inWishlist ? '\u2764\ufe0f' : '\uD83E\uDD0D'}</span> ${inWishlist ? 'Saved' : 'Save'}</button>
        <button class="pc-compare-btn ${inCompare ? 'active' : ''}" onclick="event.stopPropagation();toggleCompare(${p.id})">\u2696\ufe0f ${inCompare ? 'Selected' : 'Compare'}</button>
      </div>
    </div>`;
  }).join('');

  // Load inline seller ratings
  shown.filter(p => p.reporter_role === 'seller' && p.is_listing && p.reporter_id).forEach(p => {
    loadInlineRating(p.reporter_id, p.id);
  });

  const btn = document.getElementById('loadMoreBtn');
  btn.style.display = list.length > visibleCount ? 'inline-flex' : 'none';
}

async function showProductDetail(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;

  const catInfo = CATEGORIES.find(c => c.id === p.category) || { emoji:'\uD83D\uDCE6', label:p.category };
  document.getElementById('detailTitle').textContent = p.name;
  document.getElementById('detailSub').textContent = `${catInfo.emoji} ${catInfo.label} \u00b7 \uD83D\uDCCD ${p.store}, ${p.city}`;

  const ch = p.pctChange || { value:0, direction:'flat' };
  const chCls = ch.direction === 'up' ? 'up' : 'down';
  const arrow = ch.direction === 'up' ? '\u25b2' : ch.direction === 'down' ? '\u25bc' : '\u2013';
  document.getElementById('detailPrices').innerHTML = `
    <div class="detail-price-card">
      <div class="detail-price-label">Current Price</div>
      <div class="detail-price-value current">\u20b9${p.price}</div>
      <div class="detail-change-pill ${chCls}">${arrow} ${ch.value}%</div>
    </div>
    <div class="detail-price-card">
      <div class="detail-price-label">Previous Price</div>
      <div class="detail-price-value previous">${p.prev_price ? '\u20b9' + p.prev_price : '\u2013'}</div>
      <div style="font-size:0.78rem;color:var(--text3);margin-top:6px;">${p.unit}</div>
    </div>
  `;

  const isSellerListing = p.reporter_role === 'seller' && p.is_listing;
  const sellerLabel = isSellerListing ? 'Seller' : 'Reported by';
  const sellerValue = isSellerListing ? escHtml(p.reporter_shop || p.store) : escHtml(p.reporter);
  const statusLabel = isSellerListing ? '🏪 Seller Listed' : (p.verified ? '✓ Verified' : '📋 Pending Review');
  document.getElementById('detailInfo').innerHTML = `
    <div class="detail-info-item"><div class="detail-info-label">Store</div>${escHtml(p.store)}</div>
    <div class="detail-info-item"><div class="detail-info-label">City</div>${escHtml(p.city)}</div>
    <div class="detail-info-item"><div class="detail-info-label">${sellerLabel}</div>${sellerValue}</div>
    <div class="detail-info-item"><div class="detail-info-label">Status</div>${statusLabel}</div>
    ${p.note ? `<div class="detail-info-item" style="grid-column:1/-1;"><div class="detail-info-label">Notes</div>${escHtml(p.note)}</div>` : ''}
  `;

  const isOwner = currentUser && currentUser.role === 'seller' && p.reporter_id && currentUser.id === p.reporter_id && p.is_listing;
  const inWishlist = wishlist.some(w => w.id === p.id);
  if (isOwner) {
    document.getElementById('detailActions').innerHTML = `
      <div class="detail-actions-grid">
        <button class="btn-primary" onclick="openEditProduct(${p.id});closeDetailModal()">✏️ Edit Listing</button>
        <button class="btn-outline" style="border-color:var(--rose);color:var(--rose);" onclick="deleteSdProduct(${p.id});closeDetailModal()">🗑 Delete</button>
        <button class="btn-outline" onclick="addToCart(${p.id});closeDetailModal()">\uD83D\uDED2 Add to Cart</button>
        <button class="btn-outline" onclick="closeDetailModal()">Close</button>
      </div>
    `;
  } else {
    document.getElementById('detailActions').innerHTML = `
      <div class="detail-actions-grid">
        <button class="btn-primary" onclick="addToCart(${p.id});closeDetailModal()">\uD83D\uDED2 Add to Cart</button>
        <button class="btn-outline" onclick="toggleWishlistItem(${p.id});closeDetailModal()" style="${inWishlist ? 'border-color:var(--rose);color:var(--rose);' : ''}">
          ${inWishlist ? '❤️ In Wishlist' : '🤍 Add to Wishlist'}
        </button>
        <button class="btn-outline" onclick="toggleCompare(${p.id});closeDetailModal()">⚖️ Compare</button>
        <button class="btn-outline" onclick="closeDetailModal()">Close</button>
      </div>
    `;
  }

  document.getElementById('detailOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';

  document.getElementById('detailChartLegend').innerHTML = '<span style="color:var(--text3)">Loading chart...</span>';
  try {
    const histData = await apiFetch(`/products/${id}/history`);
    renderDetailChart(histData, p);
  } catch (e) {
    document.getElementById('detailChartLegend').innerHTML = '<span style="color:var(--text3)">No price history available</span>';
  }
}

function renderDetailChart(histData, product) {
  const ctx = document.getElementById('detailChart');
  if (!ctx) return;
  const context = ctx.getContext('2d');

  const points = histData.points;
  if (!points || points.length === 0) {
    document.getElementById('detailChartLegend').innerHTML = '<span style="color:var(--text3)">No price history yet</span>';
    return;
  }

  const labels = points.map(pt => {
    const d = new Date(pt.date);
    return d.toLocaleDateString('en-IN', { day:'numeric', month:'short' });
  });
  const prices = points.map(pt => pt.price);
  const color = '#7c6bff';

  const gradient = context.createLinearGradient(0, 0, 0, 220);
  gradient.addColorStop(0, 'rgba(124,107,255,0.3)');
  gradient.addColorStop(1, 'rgba(124,107,255,0)');

  if (detailChart) detailChart.destroy();
  detailChart = new Chart(context, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: product.name,
        data: prices,
        borderColor: color,
        backgroundColor: gradient,
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 8,
        pointBackgroundColor: color,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        borderWidth: 2.5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2.5,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(17,20,34,0.95)',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          padding: 12,
          titleColor: '#9ba3c7',
          bodyColor: '#e8eaf6',
          callbacks: { label: ctx => ` \u20b9${ctx.parsed.y}` },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
          ticks: { color: '#5b6494', font: { size: 10 } },
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
          ticks: { color: '#5b6494', font: { size: 10 }, callback: v => '\u20b9' + v },
        },
      },
    },
  });

  const max = Math.max(...prices), min = Math.min(...prices);
  const cur = prices[prices.length - 1];
  const first = prices[0];
  const trend = first > 0 ? (((cur - first) / first) * 100).toFixed(1) : 0;
  const up = trend >= 0;
  document.getElementById('detailChartLegend').innerHTML = `
    <span>\uD83D\uDCCD Current: <strong>\u20b9${cur}</strong></span>
    <span>\uD83D\uDCC8 High: <strong>\u20b9${max}</strong></span>
    <span>\uD83D\uDCC9 Low: <strong>\u20b9${min}</strong></span>
    <span>Trend: <strong style="color:${up ? '#fb7185' : '#34d399'}">${up ? '\u25b2' : '\u25bc'} ${Math.abs(trend)}%</strong></span>
    <span>${points.length} report${points.length !== 1 ? 's' : ''}</span>
  `;
}

function closeDetailModal() {
  document.getElementById('detailOverlay').classList.remove('open');
  document.body.style.overflow = '';
  if (detailChart) { detailChart.destroy(); detailChart = null; }
}

function handleDetailOverlay(e) {
  if (e.target === document.getElementById('detailOverlay')) closeDetailModal();
}

function setupSearch() {
  document.getElementById('searchInput').addEventListener('input', e => {
    searchQuery  = e.target.value.trim();
    visibleCount = 9;
    renderProducts();
  });
}

function setupSort() {
  document.getElementById('sortSelect').addEventListener('change', e => {
    sortMode = e.target.value;
    renderProducts();
  });
}

function setupLoadMore() {
  document.getElementById('loadMoreBtn').addEventListener('click', () => {
    visibleCount += 6;
    renderProducts();
  });
}

// ────────────────────────────────────────────────────────────
// FILTER PILLS
// ────────────────────────────────────────────────────────────
function buildFilterPills() {
  const wrap = document.getElementById('filterPills');
  if (!wrap) return;
  wrap.innerHTML = CATEGORIES.map(c => `
    <button class="filter-pill ${c.id === 'all' ? 'active' : ''}" id="pill-${c.id}" data-id="${c.id}">
      ${c.emoji} ${c.label}
    </button>
  `).join('');
  wrap.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      wrap.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeCategory = pill.dataset.id;
      visibleCount   = 9;
      renderProducts();
    });
  });
}

// ────────────────────────────────────────────────────────────
// LEADERBOARD
// ────────────────────────────────────────────────────────────
async function loadLeaderboard() {
  try {
    const data = await apiFetch('/leaderboard');
    buildLeaderboard(data);
  } catch (e) {
    console.warn('Leaderboard load failed:', e.message);
  }
}

function buildLeaderboard(data) {
  const table = document.getElementById('lbTable');
  if (!table) return;
  const rankClass = r => r===1?'top1': r===2?'top2': r===3?'top3':'';

  table.innerHTML = `
    <thead><tr>
      <th>#</th><th>Contributor</th><th>Reports</th><th>Points</th><th>Badges</th>
    </tr></thead>
    <tbody>
    ${data.map(u => `
      <tr>
        <td><span class="lb-rank ${rankClass(u.rank)}">${u.medal}</span></td>
        <td><div class="lb-user">
          <div class="lb-avatar">${u.avatar}</div>
          <div>
            <div class="lb-username">${u.username}</div>
            <div class="lb-city">📍 ${u.city}</div>
          </div>
        </div></td>
        <td>${u.reports.toLocaleString()}</td>
        <td><span class="lb-pts">${u.points.toLocaleString()}</span></td>
        <td>${u.badges.join(' ') || '–'}</td>
      </tr>
    `).join('')}
    </tbody>`;

  document.getElementById('badgesRow').innerHTML = [
    { e:'🥉', l:'Bronze Reporter' },
    { e:'🔥', l:'On Fire' },
    { e:'📍', l:'Local Hero' },
  ].map(b => `<div class="badge">${b.e} ${b.l}</div>`).join('');
}

// ────────────────────────────────────────────────────────────
// FEED
// ────────────────────────────────────────────────────────────
async function loadFeed() {
  try {
    const data = await apiFetch('/feed');
    buildRecentFeed(data);
  } catch (e) {
    console.warn('Feed load failed:', e.message);
  }
}

function buildRecentFeed(data) {
  const el = document.getElementById('recentFeed');
  if (!el) return;
  el.innerHTML = data.map(f => `
    <div class="feed-item">
      <div class="feed-avatar">${f.avatar}</div>
      <div class="feed-content">
        <div class="feed-name">${f.name} <span class="feed-time">${f.time}</span></div>
        <div class="feed-detail">📦 ${f.product} · 📍 ${f.city}</div>
      </div>
    </div>
  `).join('');
}

// ────────────────────────────────────────────────────────────
// MODAL
// ────────────────────────────────────────────────────────────
function openModal() {
  document.getElementById('modalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('productName').focus(), 50);
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
}

// openModal and modalClose wired in DOMContentLoaded above
document.getElementById('modalClose').addEventListener('click', closeModal);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal(); closeAuthModal(); closeDetailModal(); closeCompareModal();
    if (typeof closeCheckoutModal === 'function') closeCheckoutModal();
    const cartOv = document.getElementById('cartOverlay');
    if (cartOv && cartOv.classList.contains('open')) toggleCart();
    const wlOv = document.getElementById('wishlistOverlay');
    if (wlOv && wlOv.classList.contains('open')) toggleWishlist();
  }
});

// ────────────────────────────────────────────────────────────
// SUBMIT PRICE
// ────────────────────────────────────────────────────────────
document.getElementById('priceForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Submitting…';

  const token = currentToken;
  const body = {
    name:     document.getElementById('productName').value.trim(),
    category: document.getElementById('productCategory').value,
    price:    parseFloat(document.getElementById('productPrice').value),
    unit:     document.getElementById('productUnit').value,
    store:    document.getElementById('storeName').value.trim(),
    city:     document.getElementById('locationName').value.trim(),
    reporter: currentUser ? currentUser.name : document.getElementById('reporterName').value.trim(),
    note:     document.getElementById('priceNote').value.trim(),
    is_listing: false,
  };

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API}/products`, {
      method:  'POST',
      headers,
      body:    JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Submission failed');
    }

    const newProduct = await res.json();

    // Prepend to cached list and re-render
    allProducts.unshift(newProduct);
    visibleCount = 9;
    renderProducts();

    // Refresh stats counter
    const statEl = document.getElementById('statReports');
    if (statEl) {
      const cur = parseInt(statEl.textContent.replace(/\D/g, ''), 10) || 0;
      statEl.textContent = (cur + 1).toLocaleString();
    }

    // Refresh ticker and feed
    await Promise.all([loadTicker(), loadFeed()]);

    e.target.reset();
    closeModal();
    showToast(`📋 Price report submitted for review! +${newProduct.pointsAwarded} pts. Our team will verify it shortly.`);
  } catch (err) {
    showToast(`❌ ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit for Review ✓';
  }
});

// ────────────────────────────────────────────────────────────
// NAV
// ────────────────────────────────────────────────────────────
function setupNavScroll() {
  const nav = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 50);
  });
}

function setupHamburger() {
  document.getElementById('hamburger').addEventListener('click', () => {
    document.getElementById('mobileMenu').classList.toggle('open');
  });
}

function closeMobile() {
  document.getElementById('mobileMenu').classList.remove('open');
}

// ────────────────────────────────────────────────────────────
// TOAST
// ────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 4500);
}

// ────────────────────────────────────────────────────────────
// HELPER
// ────────────────────────────────────────────────────────────
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════

function updateNavAuth() {
  const guest       = document.getElementById('navAuthGuest');
  const userDiv     = document.getElementById('navAuthUser');
  const info        = document.getElementById('navUserInfo');
  const dashBtn     = document.getElementById('sellerDashBtn');
  const ordersBtn   = document.getElementById('myOrdersBtn');
  if (!guest || !userDiv) return;
  if (currentUser) {
    guest.style.display   = 'none';
    userDiv.style.display = 'flex';
    const isSeller = currentUser.role === 'seller';
    if (dashBtn)   dashBtn.style.display   = isSeller  ? 'inline-flex' : 'none';
    if (ordersBtn) ordersBtn.style.display = !isSeller ? 'inline-flex' : 'none';
    info.innerHTML = `
      <span>${currentUser.name}</span>
      ${isSeller
        ? `<span class="nav-seller-badge">🏪 Seller</span>`
        : `<span class="nav-user-role">Customer</span>`
      }
    `;
  } else {
    guest.style.display   = 'flex';
    userDiv.style.display = 'none';
    if (dashBtn)   dashBtn.style.display   = 'none';
    if (ordersBtn) ordersBtn.style.display = 'none';
  }
}

function openAuthModal(tab = 'login') {
  document.getElementById('authOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  switchAuthTab(tab);
}

function closeAuthModal() {
  document.getElementById('authOverlay').classList.remove('open');
  document.body.style.overflow = '';
  document.getElementById('loginError').textContent    = '';
  document.getElementById('registerError').textContent = '';
}

function handleAuthOverlayClick(e) {
  if (e.target === document.getElementById('authOverlay')) closeAuthModal();
}

function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('loginForm').style.display    = isLogin ? '' : 'none';
  document.getElementById('registerForm').style.display = isLogin ? 'none' : '';
  document.getElementById('tabLogin').classList.toggle('active',    isLogin);
  document.getElementById('tabRegister').classList.toggle('active', !isLogin);
  setTimeout(() => {
    (isLogin
      ? document.getElementById('loginEmail')
      : document.getElementById('regName')
    ).focus();
  }, 50);
}

function selectRole(role) {
  document.getElementById('regRole').value = role;
  document.getElementById('roleCustomer').classList.toggle('active', role === 'customer');
  document.getElementById('roleSeller').classList.toggle('active',   role === 'seller');
  document.getElementById('sellerFields').style.display = role === 'seller' ? '' : 'none';
  // Require shop address for sellers
  const addrEl = document.getElementById('regShopAddress');
  if (addrEl) addrEl.required = role === 'seller';
}

async function submitLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  btn.disabled = true; btn.textContent = 'Logging in…';
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  try {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email:    document.getElementById('loginEmail').value.trim(),
        password: document.getElementById('loginPassword').value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');

    currentToken = data.token;
    currentUser  = data.user;
    localStorage.setItem('cm_token', currentToken);
    localStorage.setItem('cm_user',  JSON.stringify(currentUser));

    updateNavAuth();
    closeAuthModal();
    e.target.reset();
    showToast(`👋 Welcome back, ${currentUser.name}!`);
  } catch (err) {
    errEl.textContent = err.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Login →';
  }
}

async function submitRegister(e) {
  e.preventDefault();
  const btn = document.getElementById('registerBtn');
  btn.disabled = true; btn.textContent = 'Creating account…';
  const errEl = document.getElementById('registerError');
  errEl.textContent = '';
  try {
    const role = document.getElementById('regRole').value;
    const body = {
      name:          document.getElementById('regName').value.trim(),
      email:         document.getElementById('regEmail').value.trim(),
      password:      document.getElementById('regPassword').value,
      city:          document.getElementById('regCity').value.trim(),
      phone:         document.getElementById('regPhone').value.trim(),
      role,
      shop_name:     role === 'seller' ? document.getElementById('regShopName').value.trim() : undefined,
      shop_category: role === 'seller' ? document.getElementById('regShopCat').value          : undefined,
      shop_address:  role === 'seller' ? document.getElementById('regShopAddress').value.trim() : undefined,
    };
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');

    currentToken = data.token;
    currentUser  = data.user;
    localStorage.setItem('cm_token', currentToken);
    localStorage.setItem('cm_user',  JSON.stringify(currentUser));

    updateNavAuth();
    closeAuthModal();
    e.target.reset();
    const isSeller = currentUser.role === 'seller';
    showToast(`🎉 Welcome to CommunityMarket, ${currentUser.name}! ${isSeller ? '🏪 Seller account created.' : '🛍️ Happy shopping!'}`);
  } catch (err) {
    errEl.textContent = err.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Create Account →';
  }
}

function appLogout() {
  currentUser  = null;
  currentToken = null;
  localStorage.removeItem('cm_token');
  localStorage.removeItem('cm_user');
  updateNavAuth();
  showToast('👋 Logged out. See you soon!');
}

// ════════════════════════════════════════════════════════
// SELLER RATINGS
// ════════════════════════════════════════════════════════

let activeRatingSellerId = null;

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

async function loadInlineRating(sellerId, productId) {
  try {
    const data = await apiFetch(`/sellers/${sellerId}/ratings`);
    const el = document.getElementById(`stars-${productId}`);
    if (!el) return;
    const avg   = data.avg_rating || 0;
    const total = data.total || 0;
    if (total === 0) {
      el.innerHTML = `<span style="color:var(--text3);font-size:0.72rem;">No ratings yet</span>`;
    } else {
      const filled = '★'.repeat(Math.round(avg));
      const empty  = '☆'.repeat(5 - Math.round(avg));
      el.innerHTML = `${filled}${empty} <span class="star-count">${avg} (${total})</span>`;
    }
  } catch (_) {}
}

async function openRatingModal(sellerId, sellerName, shopName) {
  activeRatingSellerId = sellerId;
  document.getElementById('ratingModalTitle').textContent = `⭐ Rate ${sellerName}`;
  document.getElementById('ratingModalSub').textContent   = shopName ? `🏪 ${shopName}` : '';
  document.getElementById('ratingValue').value   = '0';
  document.getElementById('ratingComment').value = '';
  document.getElementById('ratingError').textContent = '';
  document.getElementById('starLabel').textContent = 'Click to rate';
  document.querySelectorAll('.star-btn').forEach(s => s.classList.remove('active'));

  document.getElementById('ratingOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';

  // Load existing ratings
  try {
    const data = await apiFetch(`/sellers/${sellerId}/ratings`);
    buildRatingSummary(data);
    buildRecentReviews(data.ratings);
  } catch (_) {
    document.getElementById('ratingSummary').innerHTML   = '';
    document.getElementById('recentReviews').innerHTML   = '';
  }

  // Wire star hover/click
  const stars = document.querySelectorAll('.star-btn');
  stars.forEach(star => {
    const v = parseInt(star.dataset.v);
    star.onmouseenter = () => stars.forEach(s =>
      parseInt(s.dataset.v) <= v ? s.classList.add('active') : s.classList.remove('active')
    );
    star.onmouseleave = () => {
      const cur = parseInt(document.getElementById('ratingValue').value) || 0;
      stars.forEach(s =>
        parseInt(s.dataset.v) <= cur ? s.classList.add('active') : s.classList.remove('active')
      );
    };
    star.onclick = () => {
      document.getElementById('ratingValue').value = v;
      const labels = ['','Poor','Fair','Good','Great','Excellent'];
      document.getElementById('starLabel').textContent = labels[v];
      stars.forEach(s =>
        parseInt(s.dataset.v) <= v ? s.classList.add('active') : s.classList.remove('active')
      );
    };
  });
}

function buildRatingSummary(data) {
  const avg   = data.avg_rating || 0;
  const total = data.total || 0;
  const el    = document.getElementById('ratingSummary');
  if (total === 0) {
    el.innerHTML = `<p style="color:var(--text3);font-size:0.88rem;">No ratings yet — be the first to rate!</p>`;
    return;
  }
  const stars5 = '★'.repeat(Math.round(avg)) + '☆'.repeat(5 - Math.round(avg));
  const dist   = data.distribution || [];
  const bars   = [5,4,3,2,1].map(n => {
    const found = dist.find(d => d.rating === n);
    const count = found ? found.count : 0;
    const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
    return `<div class="rs-bar-row">
      <span style="width:8px;text-align:right;">${n}</span>
      <span style="color:#fbbf24;font-size:0.8rem;">★</span>
      <div class="rs-bar-track"><div class="rs-bar-fill" style="width:${pct}%"></div></div>
      <span style="width:26px;">${count}</span>
    </div>`;
  }).join('');
  el.innerHTML = `
    <div style="text-align:center;">
      <div class="rs-big-num">${avg}</div>
      <div class="rs-stars">${stars5}</div>
      <div class="rs-count">${total} rating${total !== 1 ? 's' : ''}</div>
    </div>
    <div class="rs-bars">${bars}</div>
  `;
}

function buildRecentReviews(ratings) {
  const el = document.getElementById('recentReviews');
  if (!ratings || ratings.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML =
    `<p style="font-weight:600;font-size:0.85rem;margin-bottom:8px;color:var(--text2);">Recent Reviews</p>` +
    ratings.slice(0,5).map(r => {
      const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
      const date  = new Date(r.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short' });
      return `<div class="review-item">
        <div class="review-header">
          <span class="review-name">👤 ${escHtml(r.rater_name)}</span>
          <span class="review-stars">${stars}</span>
        </div>
        ${r.comment ? `<div class="review-comment">"${escHtml(r.comment)}"</div>` : ''}
        <div class="review-date">${date}</div>
      </div>`;
    }).join('');
}

function closeRatingModal() {
  const ov = document.getElementById('ratingOverlay');
  if (ov) ov.classList.remove('open');
  document.body.style.overflow = '';
  activeRatingSellerId = null;
}

function handleRatingOverlayClick(e) {
  if (e.target === document.getElementById('ratingOverlay')) closeRatingModal();
}

async function submitSellerRating() {
  const rating = parseInt(document.getElementById('ratingValue').value);
  const errEl  = document.getElementById('ratingError');
  errEl.textContent = '';

  if (!rating || rating < 1) {
    errEl.textContent = 'Please select a star rating first.';
    return;
  }
  if (!activeRatingSellerId) return;

  const btn = document.getElementById('submitRatingBtn');
  btn.disabled = true; btn.textContent = 'Submitting…';

  try {
    const comment = document.getElementById('ratingComment').value.trim();
    const headers = { 'Content-Type': 'application/json' };
    if (currentToken) headers['Authorization'] = `Bearer ${currentToken}`;

    const res = await fetch(`${API}/sellers/${activeRatingSellerId}/rate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        rating,
        comment,
        rater_name: currentUser ? currentUser.name : 'Anonymous',
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Rating failed');

    const sid = activeRatingSellerId;
    closeRatingModal();
    showToast(`⭐ Rating submitted! ${data.avg_rating}/5 (${data.total} total)`);

    // Refresh inline stars for cards from this seller
    document.querySelectorAll('[id^="stars-"]').forEach(el => {
      const productCard = el.closest('.product-card');
      if (productCard) {
        const pid = parseInt(productCard.id.replace('product-', ''));
        const prod = allProducts.find(p => p.id === pid);
        if (prod && prod.reporter_id === sid) loadInlineRating(sid, pid);
      }
    });
  } catch (err) {
    errEl.textContent = err.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Submit Rating ★';
  }
}

// ════════════════════════════════════════════════════════
// SELLER DASHBOARD
// ════════════════════════════════════════════════════════

let sdAllProducts = []; // cached dashboard products

async function openSellerDashboard() {
  if (!currentUser || currentUser.role !== 'seller') return;
  document.getElementById('sdOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  await loadSellerDashboard();
}

function closeSellerDashboard() {
  document.getElementById('sdOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

function handleSdOverlay(e) {
  if (e.target === document.getElementById('sdOverlay')) closeSellerDashboard();
}

async function loadSellerDashboard() {
  document.getElementById('sdLoadingMsg') && (document.getElementById('sdLoadingMsg').style.display = 'block');
  try {
    const res = await fetch(`${API}/seller/dashboard`, {
      headers: { 'Authorization': `Bearer ${currentToken}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load');

    sdAllProducts = data.products || [];

    // Header
    document.getElementById('sdShopName').textContent = data.seller.shop_name || data.seller.name;
    document.getElementById('sdShopMeta').textContent =
      `${data.seller.shop_category ? '🏦 ' + data.seller.shop_category : ''} · 📍 ${data.seller.city}`;

    // Stats
    document.getElementById('sdTotalProducts').textContent = sdAllProducts.length;
    document.getElementById('sdAvgRating').textContent =
      data.avg_rating ? `${data.avg_rating} ★` : 'No ratings';
    document.getElementById('sdRatingCount').textContent = data.rating_count || 0;

    // Reviews
    const reviewList = document.getElementById('sdReviewList');
    if (!data.reviews || data.reviews.length === 0) {
      reviewList.innerHTML = `<p style="color:var(--text3);font-size:0.8rem;">No reviews yet.</p>`;
    } else {
      reviewList.innerHTML = data.reviews.map(r => {
        const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
        return `<div class="sd-review-item">
          <div class="sd-review-top">
            <span class="sd-review-name">${escHtml(r.rater_name)}</span>
            <span class="sd-review-stars">${stars}</span>
          </div>
          ${r.comment ? `<div class="sd-review-comment">"${escHtml(r.comment)}"</div>` : ''}
        </div>`;
      }).join('');
    }

    renderSdProducts(sdAllProducts);

    // Load incoming orders
    try {
      const ordersRes = await fetch(`${API}/orders/seller`, {
        headers: { 'Authorization': `Bearer ${currentToken}` },
      });
      if (ordersRes.ok) {
        const orders = await ordersRes.json();
        renderSdOrders(orders);
        // Update pending count stat + badge
        const pending = orders.filter(o => o.status === 'pending').length;
        const pendingEl = document.getElementById('sdPendingOrders');
        if (pendingEl) pendingEl.textContent = pending;
        const badge = document.getElementById('sdOrdersBadge');
        if (badge) {
          badge.textContent = pending;
          badge.style.display = pending > 0 ? 'inline-flex' : 'none';
        }
      }
    } catch(_) {}
  } catch (err) {
    document.getElementById('sdProductsWrap').innerHTML =
      `<div class="sd-empty"><div class="sd-empty-icon">⚠️</div><p>${err.message}</p></div>`;
  }
}

// ── Seller dashboard tab switcher ──────────────────────────
function sdSwitchTab(tab) {
  const isProducts = tab === 'products';
  document.getElementById('sdPanelProducts').style.display = isProducts ? '' : 'none';
  document.getElementById('sdPanelOrders').style.display   = isProducts ? 'none' : '';
  document.getElementById('sdTabProducts').classList.toggle('active',  isProducts);
  document.getElementById('sdTabOrders').classList.toggle('active',   !isProducts);
}

const SD_CAT_LABELS = {
  groceries:'🛒 Groceries', vegetables:'🥦 Vegetables', fuel:'⛽ Fuel',
  electronics:'💻 Electronics', clothing:'👕 Clothing',
  medicine:'💊 Medicine', transport:'🚗 Transport', housing:'🏠 Housing'
};

function renderSdProducts(products) {
  const wrap = document.getElementById('sdProductsWrap');
  if (!products.length) {
    wrap.innerHTML = `<div class="sd-empty">
      <div class="sd-empty-icon">📦</div>
      <p>No listings yet. Click <strong>+ Add Product</strong> to get started!</p>
    </div>`;
    return;
  }
  const rows = products.map(p => {
    const cat = SD_CAT_LABELS[p.category] || p.category;
    const ch  = p.pctChange || { value:0, direction:'flat' };
    const chHtml = ch.direction === 'up'
      ? `<span class="sd-change-up">▲${ch.value}%</span>`
      : ch.direction === 'down'
      ? `<span class="sd-change-down">▼${ch.value}%</span>`
      : `<span style="color:var(--text3);font-size:0.75rem;">–</span>`;
    return `<tr>
      <td>
        <div class="sd-product-name">${escHtml(p.name)}</div>
        <div style="font-size:0.75rem;color:var(--text3);margin-top:2px;">${escHtml(p.note || '')}</div>
      </td>
      <td><span class="sd-cat-pill">${cat}</span></td>
      <td>
        <span class="sd-price">₹${p.price}</span> <span style="color:var(--text3);font-size:0.78rem;">${p.unit}</span>
        <div style="margin-top:3px;">${chHtml}</div>
      </td>
      <td style="color:var(--text3);font-size:0.78rem;">${p.time}</td>
      <td>
        <div class="sd-actions">
          <button class="sd-btn-edit" onclick="openEditProduct(${p.id})">✏️ Edit</button>
          <button class="sd-btn-del" onclick="deleteSdProduct(${p.id})">🗑</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `<table class="sd-table">
    <thead><tr>
      <th>Product</th><th>Category</th><th>Price</th><th>Listed</th><th>Actions</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function filterSdProducts() {
  const q = document.getElementById('sdSearch').value.toLowerCase();
  const filtered = q
    ? sdAllProducts.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.note || '').toLowerCase().includes(q)
      )
    : sdAllProducts;
  renderSdProducts(filtered);
}

function renderSdOrders(orders) {
  const container = document.getElementById('sdOrdersWrap');
  if (!container) return;

  if (!orders || orders.length === 0) {
    container.innerHTML = `<div class="sd-empty" style="padding:40px 0;">
      <div class="sd-empty-icon">🛍️</div>
      <p>No orders yet. Orders from customers will appear here.</p>
    </div>`;
    return;
  }

  const STATUS_BADGE = {
    pending:          '🟡 Pending',
    confirmed:        '🔵 Confirmed',
    ready:            '🟢 Ready',
    out_for_delivery: '🚚 Out for Delivery',
    completed:        '✅ Completed',
    cancelled:        '❌ Cancelled',
  };

  container.innerHTML = `<table class="sd-table">
    <thead><tr>
      <th>Order #</th><th>Customer</th><th>Product</th><th>Qty</th><th>Total</th><th>Type</th><th>Status</th>
    </tr></thead>
    <tbody>${orders.map(o => `<tr>
      <td style="font-family:monospace;font-size:0.78rem;">${o.order_number}</td>
      <td>
        ${escHtml(o.customer_name)}
        ${o.cust_phone ? `<div style="font-size:0.7rem;color:var(--text3);">📞 ${escHtml(o.cust_phone)}</div>` : ''}
        ${o.delivery_address ? `<div style="font-size:0.7rem;color:var(--text3);">📍 ${escHtml(o.delivery_address)}</div>` : ''}
      </td>
      <td>${escHtml(o.product_name)}</td>
      <td>${o.qty}</td>
      <td><span class="sd-price">₹${o.total}</span></td>
      <td>${o.fulfillment === 'delivery' ? '🚚 Delivery' : '🏪 Pickup'}</td>
      <td>
        <select class="sd-status-select" onchange="updateOrderStatus(${o.id}, this.value)" ${o.status === 'completed' || o.status === 'cancelled' ? 'disabled' : ''}>
          ${Object.entries(STATUS_BADGE).map(([k,v]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </td>
    </tr>`).join('')}</tbody>
  </table>`;
}



async function updateOrderStatus(orderId, status) {
  try {
    const res = await fetch(`${API}/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    showToast(`📦 Order updated to: ${status.replace(/_/g,' ')}`);
  } catch (err) {
    showToast(`❌ ${err.message}`);
  }
}

// ────────────────────────────────────────────────────────
// Edit product modal
// ────────────────────────────────────────────────────────
function openEditProduct(id) {
  const p = sdAllProducts.find(x => x.id === id) || allProducts.find(x => x.id === id);
  if (!p) return;
  document.getElementById('editProductId').value   = id;
  document.getElementById('editName').value        = p.name;
  document.getElementById('editCategory').value    = p.category;
  document.getElementById('editPrice').value       = p.price;
  document.getElementById('editUnit').value        = p.unit || 'per kg';
  document.getElementById('editNote').value        = p.note || '';
  document.getElementById('editError').textContent = '';
  document.getElementById('editProductOverlay').classList.add('open');
}

function closeEditProduct() {
  document.getElementById('editProductOverlay').classList.remove('open');
}

function handleEditOverlay(e) {
  if (e.target === document.getElementById('editProductOverlay')) closeEditProduct();
}

async function saveEditProduct() {
  const id    = parseInt(document.getElementById('editProductId').value);
  const price = parseFloat(document.getElementById('editPrice').value);
  const errEl = document.getElementById('editError');
  errEl.textContent = '';

  if (!price || price <= 0) { errEl.textContent = 'Please enter a valid price.'; return; }

  const btn = document.querySelector('#editProductModal .btn-primary');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    const res = await fetch(`${API}/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${currentToken}` },
      body: JSON.stringify({
        name:     document.getElementById('editName').value.trim(),
        category: document.getElementById('editCategory').value,
        price,
        unit:     document.getElementById('editUnit').value,
        note:     document.getElementById('editNote').value.trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Update failed');

    closeEditProduct();
    showToast(`✅ "${data.name}" updated to ₹${data.price}!`);
    if (document.getElementById('sdOverlay').classList.contains('open')) {
      await loadSellerDashboard(); // refresh dashboard table if open
    }
    await loadProducts();        // refresh public products grid
  } catch (err) {
    errEl.textContent = err.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Save Changes ✓';
  }
}

async function deleteSdProduct(id) {
  const p = sdAllProducts.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`Delete "${p.name}" from your listings? This cannot be undone.`)) return;

  try {
    const res = await fetch(`${API}/products/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${currentToken}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Delete failed');

    showToast(`🗑 "${p.name}" removed from your listings.`);
    await loadSellerDashboard();
    await loadProducts();
  } catch (err) {
    showToast(`❌ ${err.message}`);
  }
}

// ════════════════════════════════════════════════════════
// SELLER ADD PRODUCT (dedicated modal above dashboard)
// ════════════════════════════════════════════════════════

function openSdAddProduct() {
  if (!currentUser || currentUser.role !== 'seller') return;

  // Auto-fill hidden fields from logged-in seller's profile
  document.getElementById('sdAddStore').value = currentUser.shop_name || currentUser.name;
  document.getElementById('sdAddCity').value  = currentUser.city || '';

  // Label under title
  document.getElementById('sdAddShopLabel').textContent =
    `🏪 ${currentUser.shop_name || currentUser.name}  ·  📍 ${currentUser.city || ''}`;

  // Reset form
  document.getElementById('sdAddName').value     = '';
  document.getElementById('sdAddCategory').value = '';
  document.getElementById('sdAddPrice').value    = '';
  document.getElementById('sdAddUnit').value     = 'per kg';
  document.getElementById('sdAddNote').value     = '';
  document.getElementById('sdAddError').textContent = '';

  document.getElementById('sdAddOverlay').classList.add('open');
}

function closeSdAddProduct() {
  document.getElementById('sdAddOverlay').classList.remove('open');
}

function handleSdAddOverlay(e) {
  if (e.target === document.getElementById('sdAddOverlay')) closeSdAddProduct();
}

async function submitSdAddProduct() {
  const name     = document.getElementById('sdAddName').value.trim();
  const category = document.getElementById('sdAddCategory').value;
  const price    = parseFloat(document.getElementById('sdAddPrice').value);
  const unit     = document.getElementById('sdAddUnit').value;
  const note     = document.getElementById('sdAddNote').value.trim();
  const store    = document.getElementById('sdAddStore').value;
  const city     = document.getElementById('sdAddCity').value;
  const errEl    = document.getElementById('sdAddError');
  errEl.textContent = '';

  // Validation
  if (!name)           { errEl.textContent = 'Product name is required.'; return; }
  if (!category)       { errEl.textContent = 'Please select a category.'; return; }
  if (!price || price <= 0) { errEl.textContent = 'Please enter a valid price greater than 0.'; return; }

  const btn = document.getElementById('sdAddSubmitBtn');
  btn.disabled = true; btn.textContent = 'Adding…';

  try {
    const res = await fetch(`${API}/products`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${currentToken}`,
      },
      body: JSON.stringify({ name, category, price, unit, store, city, note, is_listing: true }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add product');

    closeSdAddProduct();
    showToast(`✅ "${data.name}" added at ₹${data.price} — visible to all customers!`);

    // Refresh dashboard listing and public products grid
    await loadSellerDashboard();
    await loadProducts();
  } catch (err) {
    errEl.textContent = err.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Add to Shop ✓';
  }
}

// ════════════════════════════════════════════════════════
// CART SYSTEM
// ════════════════════════════════════════════════════════

function saveCart() {
  localStorage.setItem('cm_cart', JSON.stringify(cart));
  updateCartBadge();
  renderCartItems();
}

function updateCartBadge() {
  const badge = document.getElementById('cartBadge');
  if (!badge) return;
  const total = cart.reduce((s, item) => s + item.qty, 0);
  badge.textContent = total;
  badge.classList.remove('pulse');
  void badge.offsetWidth; // reflow
  if (total > 0) badge.classList.add('pulse');
}

function addToCart(productId) {
  const p = allProducts.find(x => x.id === productId);
  if (!p) return;

  const existing = cart.find(item => item.id === productId);
  if (existing) {
    existing.qty++;
  } else {
    cart.push({
      id: p.id,
      name: p.name,
      price: p.price,
      unit: p.unit,
      store: p.store,
      city: p.city,
      category: p.category,
      qty: 1,
    });
  }
  saveCart();
  showToast(`🛒 ${p.name} added to cart!`);
}

function removeFromCart(productId) {
  cart = cart.filter(item => item.id !== productId);
  saveCart();
}

function updateCartQty(productId, delta) {
  const item = cart.find(x => x.id === productId);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    cart = cart.filter(x => x.id !== productId);
  }
  saveCart();
}

function toggleCart() {
  const overlay = document.getElementById('cartOverlay');
  overlay.classList.toggle('open');
  if (overlay.classList.contains('open')) {
    document.body.style.overflow = 'hidden';
    renderCartItems();
  } else {
    document.body.style.overflow = '';
  }
}

function handleCartOverlay(e) {
  if (e.target === document.getElementById('cartOverlay')) toggleCart();
}

function renderCartItems() {
  const container = document.getElementById('cartItems');
  const footer = document.getElementById('cartFooter');
  if (!container) return;

  if (cart.length === 0) {
    container.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">🛒</div>
        <p>Your cart is empty</p>
        <p style="font-size:0.82rem;margin-top:8px;">Browse products and add items to get started!</p>
      </div>`;
    footer.style.display = 'none';
    return;
  }

  footer.style.display = '';
  const CAT_EMOJI = {
    groceries:'🛒', vegetables:'🥦', fuel:'⛽',
    electronics:'💻', clothing:'👕', medicine:'💊',
    transport:'🚗', housing:'🏠'
  };

  container.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div class="cart-item-info">
        <div class="cart-item-name">${CAT_EMOJI[item.category] || '📦'} ${escHtml(item.name)}</div>
        <div class="cart-item-meta">📍 ${escHtml(item.store)}, ${escHtml(item.city)} · ${item.unit}</div>
        <div class="cart-item-qty">
          <button class="cart-qty-btn" onclick="updateCartQty(${item.id},-1)">−</button>
          <span class="cart-qty-num">${item.qty}</span>
          <button class="cart-qty-btn" onclick="updateCartQty(${item.id},1)">+</button>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
        <div class="cart-item-price">₹${(item.price * item.qty).toLocaleString()}</div>
        <button class="cart-item-remove" onclick="removeFromCart(${item.id})">✕ Remove</button>
      </div>
    </div>
  `).join('');

  const total = cart.reduce((s, item) => s + item.price * item.qty, 0);
  document.getElementById('cartTotal').textContent = `₹${total.toLocaleString()}`;
}

function checkoutCart() {
  if (cart.length === 0) {
    showToast('🛒 Your cart is empty!');
    return;
  }
  const total = cart.reduce((s, item) => s + item.price * item.qty, 0);
  const count = cart.reduce((s, item) => s + item.qty, 0);
  showToast(`🎉 Checkout: ${count} item${count !== 1 ? 's' : ''} · ₹${total.toLocaleString()} — Thank you!`);
  cart = [];
  saveCart();
  toggleCart();
}

// ════════════════════════════════════════════════════════
// WISHLIST SYSTEM
// ════════════════════════════════════════════════════════

function saveWishlist() {
  localStorage.setItem('cm_wishlist', JSON.stringify(wishlist));
  updateWishlistBadge();
  renderWishlistItems();
}

function updateWishlistBadge() {
  const badge = document.getElementById('wishlistBadge');
  if (!badge) return;
  badge.textContent = wishlist.length;
  badge.classList.remove('pulse');
  void badge.offsetWidth;
  if (wishlist.length > 0) badge.classList.add('pulse');
}

function toggleWishlistItem(productId) {
  const idx = wishlist.findIndex(w => w.id === productId);
  if (idx > -1) {
    wishlist.splice(idx, 1);
    saveWishlist();
    showToast('🤍 Removed from wishlist');
  } else {
    const p = allProducts.find(x => x.id === productId);
    if (!p) return;
    wishlist.push({
      id: p.id,
      name: p.name,
      price: p.price,
      unit: p.unit,
      store: p.store,
      city: p.city,
      category: p.category,
    });
    saveWishlist();
    showToast(`❤️ ${p.name} added to wishlist!`);
  }
  renderProducts(); // re-render to update heart icons
}

function removeFromWishlist(productId) {
  wishlist = wishlist.filter(w => w.id !== productId);
  saveWishlist();
  renderProducts();
}

function moveWishlistToCart(productId) {
  const item = wishlist.find(w => w.id === productId);
  if (!item) return;
  addToCart(productId);
  wishlist = wishlist.filter(w => w.id !== productId);
  saveWishlist();
  renderProducts();
}

function moveAllWishlistToCart() {
  if (wishlist.length === 0) {
    showToast('❤️ Your wishlist is empty!');
    return;
  }
  wishlist.forEach(item => {
    const existing = cart.find(c => c.id === item.id);
    if (existing) {
      existing.qty++;
    } else {
      cart.push({ ...item, qty: 1 });
    }
  });
  const count = wishlist.length;
  wishlist = [];
  saveWishlist();
  saveCart();
  renderProducts();
  showToast(`🛒 Moved ${count} item${count !== 1 ? 's' : ''} to cart!`);
}

function toggleWishlist() {
  const overlay = document.getElementById('wishlistOverlay');
  overlay.classList.toggle('open');
  if (overlay.classList.contains('open')) {
    document.body.style.overflow = 'hidden';
    renderWishlistItems();
  } else {
    document.body.style.overflow = '';
  }
}

function handleWishlistOverlay(e) {
  if (e.target === document.getElementById('wishlistOverlay')) toggleWishlist();
}

function renderWishlistItems() {
  const container = document.getElementById('wishlistItems');
  const footer = document.getElementById('wishlistFooter');
  if (!container) return;

  if (wishlist.length === 0) {
    container.innerHTML = `
      <div class="cart-empty">
        <div class="cart-empty-icon">❤️</div>
        <p>Your wishlist is empty</p>
        <p style="font-size:0.82rem;margin-top:8px;">Save products you love by clicking the heart button!</p>
      </div>`;
    if (footer) footer.style.display = 'none';
    return;
  }

  if (footer) footer.style.display = '';
  const CAT_EMOJI = {
    groceries:'🛒', vegetables:'🥦', fuel:'⛽',
    electronics:'💻', clothing:'👕', medicine:'💊',
    transport:'🚗', housing:'🏠'
  };

  container.innerHTML = wishlist.map(item => `
    <div class="wishlist-item">
      <div class="wishlist-item-info">
        <div class="wishlist-item-name">${CAT_EMOJI[item.category] || '📦'} ${escHtml(item.name)}</div>
        <div class="wishlist-item-meta">📍 ${escHtml(item.store)}, ${escHtml(item.city)} · ${item.unit}</div>
        <div class="wishlist-item-actions">
          <button class="wishlist-move-btn" onclick="moveWishlistToCart(${item.id})">🛒 Move to Cart</button>
          <button class="cart-item-remove" onclick="removeFromWishlist(${item.id})">✕ Remove</button>
        </div>
      </div>
      <div class="wishlist-item-price">₹${item.price.toLocaleString()}</div>
    </div>
  `).join('');
}

// ════════════════════════════════════════════════════════
// COMPARE SYSTEM
// ════════════════════════════════════════════════════════

function toggleCompare(productId) {
  const idx = compareList.indexOf(productId);
  if (idx > -1) {
    compareList.splice(idx, 1);
  } else {
    if (compareList.length >= 4) {
      showToast('⚖️ Maximum 4 products can be compared at once. Remove one first.');
      return;
    }
    compareList.push(productId);
  }
  updateCompareBar();
  renderProducts(); // re-render to update button states
}

function clearCompare() {
  compareList = [];
  updateCompareBar();
  renderProducts();
}

function updateCompareBar() {
  const bar = document.getElementById('compareBar');
  const itemsEl = document.getElementById('compareBarItems');
  const countEl = document.getElementById('compareBarCount');
  const compareBtn = document.getElementById('compareBarBtn');
  if (!bar) return;

  if (compareList.length === 0) {
    bar.classList.remove('visible');
    return;
  }

  bar.classList.add('visible');
  countEl.textContent = `${compareList.length} item${compareList.length !== 1 ? 's' : ''} selected`;
  compareBtn.disabled = compareList.length < 2;

  itemsEl.innerHTML = compareList.map(id => {
    const p = allProducts.find(x => x.id === id);
    if (!p) return '';
    return `
      <div class="compare-bar-chip">
        ${p.name.length > 18 ? p.name.slice(0, 16) + '…' : p.name}
        <button class="compare-bar-chip-remove" onclick="toggleCompare(${id})">✕</button>
      </div>
    `;
  }).join('');
}

function closeCompareModal() {
  document.getElementById('compareOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

function handleCompareOverlay(e) {
  if (e.target === document.getElementById('compareOverlay')) closeCompareModal();
}

async function openCompareModal() {
  if (compareList.length < 2) {
    showToast('⚖️ Select at least 2 products to compare.');
    return;
  }

  document.getElementById('compareOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('compareContent').innerHTML = `
    <div style="text-align:center;padding:40px;color:var(--text3);">
      <div style="font-size:2rem;margin-bottom:12px;">⚖️</div>
      <p>Loading comparison…</p>
    </div>`;

  try {
    const ids = compareList.join(',');
    const products = await apiFetch(`/products/compare?ids=${ids}`);
    renderCompareContent(products);
  } catch (e) {
    document.getElementById('compareContent').innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--text3);">
        <p>Failed to load comparison. Try again.</p>
      </div>`;
  }
}

function renderCompareContent(products) {
  if (!products || products.length === 0) return;

  const cheapest = products.reduce((a, b) => a.price < b.price ? a : b);
  const mostExpensive = products.reduce((a, b) => a.price > b.price ? a : b);
  const savings = mostExpensive.price - cheapest.price;

  const colClass = `cols-${Math.min(products.length, 4)}`;

  const cards = products.map(p => {
    const isCheapest = p.id === cheapest.id && products.length > 1;
    const ch = p.pctChange || { value: 0, direction: 'flat' };
    const chCls = ch.direction === 'up' ? 'up' : ch.direction === 'down' ? 'down' : 'flat';
    const arrow = ch.direction === 'up' ? '▲' : ch.direction === 'down' ? '▼' : '–';
    const isSeller = p.reporter_role === 'seller';

    let ratingHtml = '';
    if (p.sellerRating && p.sellerRating.count > 0) {
      const filled = '★'.repeat(Math.round(p.sellerRating.avg));
      const empty = '☆'.repeat(5 - Math.round(p.sellerRating.avg));
      ratingHtml = `<div class="compare-card-rating">${filled}${empty} ${p.sellerRating.avg} (${p.sellerRating.count})</div>`;
    }

    return `
      <div class="compare-card ${isCheapest ? 'cheapest' : ''}">
        ${isCheapest ? '<div class="compare-cheapest-tag">💰 Best Price</div>' : ''}
        <div class="compare-card-name">${escHtml(p.name)}</div>
        <div class="compare-card-store">📍 ${escHtml(p.store)}, ${escHtml(p.city)}</div>
        <div class="compare-card-price">₹${p.price.toLocaleString()}</div>
        <div class="compare-card-unit">${p.unit}</div>
        <div class="compare-card-change ${chCls}">${arrow} ${ch.value}%</div>
        <div class="compare-card-meta">
          <span>👤 ${escHtml(p.reporter)}</span>
          ${isSeller ? `<span class="compare-card-seller">🏪 ${escHtml(p.reporter_shop || 'Verified Seller')}</span>` : ''}
          ${ratingHtml}
          ${p.verified ? '<span style="color:var(--accent2);">✓ Verified</span>' : '<span>⏳ Unverified</span>'}
          ${p.note ? `<span>📝 ${escHtml(p.note)}</span>` : ''}
          <span>${p.time}</span>
        </div>
        <div class="compare-card-actions">
          <button class="btn-primary" onclick="addToCart(${p.id});closeCompareModal()">🛒 Add to Cart</button>
        </div>
      </div>
    `;
  }).join('');

  let savingsHtml = '';
  if (savings > 0) {
    const pct = ((savings / mostExpensive.price) * 100).toFixed(1);
    savingsHtml = `
      <div class="compare-savings">
        <div class="compare-savings-label">💰 You could save by picking the best price</div>
        <div class="compare-savings-value">₹${savings.toLocaleString()} (${pct}% less)</div>
      </div>
    `;
  }

  document.getElementById('compareContent').innerHTML = `
    <div class="compare-grid ${colClass}">${cards}</div>
    ${savingsHtml}
  `;
}

// ════════════════════════════════════════════════════════
// GEOLOCATION & DISTANCE
// ════════════════════════════════════════════════════════

let userLat = null, userLng = null;

function initGeolocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    pos => {
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
      renderProducts(); // re-render to show distances
    },
    () => { /* permission denied, no distance shown */ },
    { enableHighAccuracy: false, timeout: 8000 }
  );
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function getDistanceText(p) {
  if (!userLat || !userLng || !p.shop_lat || !p.shop_lng) return '';
  const km = haversineKm(userLat, userLng, p.shop_lat, p.shop_lng);
  if (km < 1) return `📍 ${Math.round(km * 1000)}m away`;
  return `📍 ${km.toFixed(1)} km away`;
}

// ════════════════════════════════════════════════════════
// CHECKOUT & ORDER SYSTEM
// ════════════════════════════════════════════════════════

let selectedFulfillment = 'pickup';

function selectFulfillment(type) {
  selectedFulfillment = type;
  document.getElementById('fulfillPickup').classList.toggle('active', type === 'pickup');
  document.getElementById('fulfillDelivery').classList.toggle('active', type === 'delivery');
  document.getElementById('deliveryFields').style.display = type === 'delivery' ? '' : 'none';
}

function openCheckoutModal() {
  if (cart.length === 0) {
    showToast('🛒 Your cart is empty!');
    return;
  }
  if (!currentUser) {
    showToast('🔒 Please login to place an order.');
    toggleCart();
    openAuthModal('login');
    return;
  }

  // Close cart, open checkout
  const cartOv = document.getElementById('cartOverlay');
  if (cartOv && cartOv.classList.contains('open')) toggleCart();

  document.getElementById('checkoutOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  document.getElementById('checkoutError').textContent = '';
  if (currentUser.phone) document.getElementById('checkoutPhone').value = currentUser.phone;
  selectFulfillment('pickup');

  // Build summary
  const total = cart.reduce((s, item) => s + item.price * item.qty, 0);
  const count = cart.reduce((s, item) => s + item.qty, 0);
  document.getElementById('checkoutSummary').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:var(--surface);border-radius:var(--radius);margin-bottom:16px;">
      <div>
        <div style="font-weight:600;">${count} item${count !== 1 ? 's' : ''}</div>
        <div style="font-size:0.8rem;color:var(--text3);">${cart.map(i => i.name).join(', ')}</div>
      </div>
      <div style="font-family:'Outfit',sans-serif;font-weight:700;font-size:1.2rem;">₹${total.toLocaleString()}</div>
    </div>
  `;
}

function closeCheckoutModal() {
  document.getElementById('checkoutOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

function handleCheckoutOverlay(e) {
  if (e.target === document.getElementById('checkoutOverlay')) closeCheckoutModal();
}

async function placeOrder() {
  const errEl = document.getElementById('checkoutError');
  errEl.textContent = '';

  const fulfillment = selectedFulfillment;
  const delivery_address = document.getElementById('checkoutAddress').value.trim();
  const customer_phone = document.getElementById('checkoutPhone').value.trim();

  if (fulfillment === 'delivery' && !delivery_address) {
    errEl.textContent = 'Please enter a delivery address.';
    return;
  }

  const btn = document.getElementById('placeOrderBtn');
  btn.disabled = true; btn.textContent = 'Placing order…';

  try {
    const items = cart.map(item => ({ product_id: item.id, qty: item.qty }));
    const res = await fetch(`${API}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
      body: JSON.stringify({ items, fulfillment, delivery_address, customer_phone }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Order failed');

    // Clear cart
    cart = [];
    saveCart();
    closeCheckoutModal();

    const emoji = fulfillment === 'pickup' ? '🏪' : '🚚';
    const method = fulfillment === 'pickup' ? 'Pickup in Store' : 'Home Delivery';
    showToast(`🎉 Order placed! ${emoji} ${method} · ₹${data.grand_total.toLocaleString()} · ${data.orders.map(o => o.order_number).join(', ')}`);
  } catch (err) {
    errEl.textContent = err.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Place Order ✓';
  }
}

// ════════════════════════════════════════════════════════
// VERIFIED SELLER BADGE
// ════════════════════════════════════════════════════════

function getVerifiedBadge(p) {
  if (!p.is_listing || p.reporter_role !== 'seller') return '';
  if (p.seller_verified) return '<span class="pc-verified-badge">✅ Verified</span>';
  return '<span class="pc-pending-badge">⏳ Pending</span>';
}

// ════════════════════════════════════════════════════════
// MY ORDERS (Customer)
// ════════════════════════════════════════════════════════

function openMyOrders() {
  if (!currentUser) { openAuthModal('login'); return; }
  document.getElementById('myOrdersOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  loadMyOrders();
}

function closeMyOrders() {
  document.getElementById('myOrdersOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

function handleMyOrdersOverlay(e) {
  if (e.target === document.getElementById('myOrdersOverlay')) closeMyOrders();
}

async function loadMyOrders() {
  const container = document.getElementById('myOrdersList');
  container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text3);">
    <div style="font-size:2rem;margin-bottom:10px;">⏳</div><p>Loading orders…</p>
  </div>`;

  try {
    const res = await fetch(`${API}/orders/my`, {
      headers: { 'Authorization': `Bearer ${currentToken}` },
    });
    if (!res.ok) throw new Error('Failed to load');
    const orders = await res.json();
    renderMyOrders(orders);
  } catch (e) {
    container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text3);">
      <div style="font-size:2rem;">⚠️</div><p>Could not load orders.</p>
    </div>`;
  }
}

function renderMyOrders(orders) {
  const container = document.getElementById('myOrdersList');
  if (!orders || orders.length === 0) {
    container.innerHTML = `
      <div class="orders-empty">
        <div style="font-size:3rem;margin-bottom:12px;">📦</div>
        <p style="font-weight:600;font-size:1rem;margin-bottom:6px;">No orders yet</p>
        <p style="color:var(--text3);font-size:0.85rem;">Browse products and place your first order!</p>
      </div>`;
    return;
  }

  const STATUS_INFO = {
    pending:          { emoji:'🟡', label:'Pending',           color:'#fbbf24' },
    confirmed:        { emoji:'🔵', label:'Confirmed',         color:'#60a5fa' },
    ready:            { emoji:'🟢', label:'Ready for Pickup',  color:'#34d399' },
    out_for_delivery: { emoji:'🚚', label:'Out for Delivery',  color:'#a78bfa' },
    completed:        { emoji:'✅', label:'Completed',         color:'#34d399' },
    cancelled:        { emoji:'❌', label:'Cancelled',         color:'#fb7185' },
  };

  container.innerHTML = orders.map(o => {
    const s = STATUS_INFO[o.status] || { emoji:'📦', label: o.status, color:'var(--text3)' };
    const distText = getDistanceText(o);
    const isPickup = o.fulfillment === 'pickup';
    const fulfillmentHtml = isPickup
      ? `<span class="order-fulfill-pill pickup">🏪 Pickup in Store</span>`
      : `<span class="order-fulfill-pill delivery">🚚 Home Delivery</span>`;

    const addressHtml = isPickup && o.seller_address
      ? `<div class="order-shop-address">📍 ${escHtml(o.seller_address)}${distText ? ` <span class="order-distance">${distText}</span>` : ''}</div>`
      : o.delivery_address
      ? `<div class="order-shop-address">🏠 Deliver to: ${escHtml(o.delivery_address)}</div>`
      : '';

    const phoneHtml = isPickup && o.seller_phone
      ? `<a href="tel:${escHtml(o.seller_phone)}" class="order-call-btn">📞 Call Shop</a>`
      : '';

    return `
    <div class="order-card" id="order-${o.id}">
      <div class="order-card-header">
        <div>
          <div class="order-number">${escHtml(o.order_number)}</div>
          <div class="order-time">${o.time || ''}</div>
        </div>
        <div class="order-status-pill" style="--status-color:${s.color}">
          ${s.emoji} ${s.label}
        </div>
      </div>

      <div class="order-card-body">
        <div class="order-product-row">
          <div class="order-product-name">${escHtml(o.product_name)}</div>
          <div class="order-qty-price">
            <span>×${o.qty}</span>
            <span class="order-total">₹${o.total.toLocaleString()}</span>
          </div>
        </div>

        <div class="order-shop-info">
          <div class="order-shop-name">🏪 ${escHtml(o.seller_shop || o.seller_name)}</div>
          <div class="order-shop-city">📍 ${escHtml(o.seller_city || '')}${distText ? ' · ' + distText : ''}</div>
          ${addressHtml}
        </div>

        <div class="order-footer">
          ${fulfillmentHtml}
          ${phoneHtml}
          ${o.status === 'completed'
            ? `<button class="order-reorder-btn" onclick="reorderItem(${o.product_id})">🔄 Reorder</button>`
            : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

async function reorderItem(productId) {
  addToCart(productId);
  closeMyOrders();
  showToast('🛒 Added to cart! Open cart to checkout.');
}

