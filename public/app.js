/* ==================================================================
   Hussam-Ai — منطق الواجهة
   ================================================================== */
(() => {
  'use strict';

  /* ---------- أدوات ---------- */
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const ICONS = new Set(['sparkles', 'bot', 'brain', 'image', 'search', 'code', 'wand', 'layers', 'pen', 'bolt']);
  const CART_KEY = 'hussam-ai:cart';
  const THEME_KEY = 'hussam-ai:theme';
  const VISITOR_KEY = 'hussam-ai:visitor-id';
  const TOKEN_KEY = 'hussam-ai:token';
  const SESSION_VISIT_KEY = 'hussam-ai:visit-counted';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const state = {
    settings: {
      siteName: 'Hussam-Ai',
      currency: 'ر.س',
      whatsapp: '',
    },
    apps: [],
    stats: { visits: 0, visitors: 0 },
    cart: [],
    filter: 'all',
    query: '',
    admin: {
      token: sessionStorage.getItem(TOKEN_KEY) || '',
      data: null,
      editorImage: '',
    },
  };

  const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  const dateFmt = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });

  const esc = (value) =>
    String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));

  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${ICONS.has(name) ? name : 'sparkles'}"/></svg>`;
  const money = (value) => `${nf.format(Number(value) || 0)} ${state.settings.currency || 'ر.س'}`;

  function waLink(text) {
    const number = String(state.settings.whatsapp || '').replace(/\D+/g, '');
    const base = number ? `https://wa.me/${number}` : 'https://wa.me/';
    return text ? `${base}?text=${encodeURIComponent(text)}` : base;
  }

  function toast(message, type = 'success') {
    const host = $('#toasts');
    if (!host) return;
    while (host.children.length >= 3) host.firstElementChild.remove();
    const el = document.createElement('div');
    el.className = `toast ${type === 'error' ? 'error' : ''}`;
    el.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#i-${type === 'error' ? 'x' : 'check'}"/></svg><span>${esc(message)}</span>`;
    host.appendChild(el);
    window.setTimeout(() => {
      el.classList.add('out');
      window.setTimeout(() => el.remove(), 260);
    }, 3400);
  }

  async function api(path, options = {}) {
    const { method = 'GET', body, auth = false } = options;
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && state.admin.token) headers.Authorization = `Bearer ${state.admin.token}`;

    const response = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });

    let payload = null;
    try { payload = await response.json(); } catch { /* ignore */ }

    if (!response.ok) {
      const error = new Error((payload && payload.error) || 'تعذّر إكمال العملية، حاول مجدداً');
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function readCart() {
    try {
      const raw = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((item) => item && typeof item.id === 'string')
        .slice(0, 30)
        .map((item) => ({ id: item.id, qty: Math.min(20, Math.max(1, parseInt(item.qty, 10) || 1)) }));
    } catch {
      return [];
    }
  }

  function saveCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(state.cart)); } catch { /* ignore */ }
  }

  function cartDetails() {
    return state.cart
      .map((line) => {
        const app = state.apps.find((item) => item.id === line.id);
        return app ? { ...line, app } : null;
      })
      .filter(Boolean);
  }

  function cartTotals() {
    const details = cartDetails()
      .map((line) => ({ ...line, qty: Math.min(line.qty, maxFor(line.app)) }))
      .filter((line) => line.qty > 0);
    const count = details.reduce((sum, line) => sum + line.qty, 0);
    const total = details.reduce((sum, line) => sum + line.app.price * line.qty, 0);
    return { details, count, total: Math.round(total * 100) / 100 };
  }

  /* ---------- المظهر ---------- */
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#070D19' : '#2563EB');
  }

  function initTheme() {
    let stored = null;
    try { stored = localStorage.getItem(THEME_KEY); } catch { /* ignore */ }
    const preferred = stored || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(preferred);

    $('#themeToggle')?.addEventListener('click', () => {
      applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    });
  }

  /* ---------- عدّاد الزوار ---------- */
  function visitorId() {
    try {
      let id = localStorage.getItem(VISITOR_KEY);
      if (!id) {
        id = (crypto.randomUUID ? crypto.randomUUID() : `v-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        localStorage.setItem(VISITOR_KEY, id);
      }
      return id;
    } catch {
      return '';
    }
  }

  function animateNumber(el, target) {
    if (!el) return;
    const value = Number(target) || 0;
    const text = nf.format(value);
    if (el.textContent === text) return;
    el.textContent = text;
    if (!reduceMotion) {
      el.classList.remove('num-pop');
      void el.offsetWidth;
      el.classList.add('num-pop');
    }
  }

  function paintVisitors(count) {
    state.stats.visitors = count;
    animateNumber($('#visitorCount'), count);
    animateNumber($('#statVisitors'), count);
  }

  async function countVisit() {
    const id = visitorId();
    const already = sessionStorage.getItem(SESSION_VISIT_KEY) === '1';
    if (already) return;

    try {
      const result = await api('/api/visit', { method: 'POST', body: { clientId: id } });
      sessionStorage.setItem(SESSION_VISIT_KEY, '1');
      if (result && typeof result.visitors === 'number') {
        paintVisitors(result.visitors);
      }
    } catch {
      /* العداد ليس حرجاً */
    }
  }

  /* ---------- النصوص والروابط ---------- */
  function applySettings() {
    const s = state.settings;
    const brandName = $('#brandName');
    if (brandName) brandName.textContent = s.siteName || 'Hussam-Ai';
    const footerBrand = $('#footerBrand');
    if (footerBrand) footerBrand.textContent = s.siteName || 'Hussam-Ai';
    document.title = `${s.siteName || 'Hussam-Ai'} — اشتراكات تطبيقات الذكاء الاصطناعي`;

    const heroTitle = $('#heroTitle');
    if (heroTitle && s.heroTitle) heroTitle.textContent = s.heroTitle;

    const heroText = $('#heroText');
    if (heroText && s.heroText) heroText.textContent = s.heroText;

    const announcement = $('#announcementText');
    if (announcement && s.announcement) announcement.textContent = s.announcement;

    $('#footerWhatsapp').textContent = s.whatsapp
      ? `+${s.whatsapp}`
      : 'تواصل عبر واتساب';

    const message = `مرحباً ${s.siteName || 'Hussam-Ai'} 👋\nأرغب بالاستفسار عن اشتراكات تطبيقات الذكاء الاصطناعي.`;
    $$('[data-whatsapp-link]').forEach((link) => { link.href = waLink(message); });

    const year = $('#year');
    if (year) year.textContent = String(new Date().getFullYear());
  }

  /* ---------- التطبيقات ---------- */
  const OFFERS_KEY = 'offers';
  const OFFERS_CATEGORY = 'العروض';
  const GAMES_KEY = 'games';
  const GAMES_CATEGORY = 'ألعاب';
  const MAX_QTY = 20;

  const stockOf = (app) => {
    const value = Number(app && app.stock);
    return Number.isFinite(value) ? Math.max(0, Math.min(9999, Math.floor(value))) : 0;
  };
  const isOffer = (app) => Boolean(app) && (app.offer === true || app.category === OFFERS_CATEGORY);
  const offerApps = () => state.apps.filter(isOffer);
  const stockState = (stock) => (stock <= 0 ? 'out' : stock <= 3 ? 'low' : 'ok');
  const stockLabel = (stock) => (stock <= 0 ? 'غير متوفر' : stock <= 3 ? 'كمية محدودة' : 'متوفر');

  function stockRow(stock) {
    const level = stockState(stock);
    const percent = stock <= 0 ? 100 : Math.max(8, Math.min(100, Math.round((stock / 20) * 100)));
    return `
      <div class="stock-row ${level}">
        <span class="stock-label"><svg class="icon" aria-hidden="true"><use href="#i-box"/></svg> الكمية</span>
        <span class="stock-meter" role="img" aria-label="المتبقي ${stock}"><i style="width:${percent}%"></i></span>
        <span class="stock-value">${stock <= 0 ? '0' : nf.format(stock)}</span>
      </div>`;
  }

  function appImageMarkup(app, className = 'app-image') {
    if (!app.image) return '';
    return `<div class="${className}"><img src="${esc(app.image)}" alt="صورة ${esc(app.name)}" loading="lazy" decoding="async" /></div>`;
  }

  const HIDDEN_CHIP_CATEGORIES = ['صور', 'محادثة', 'أخرى'];

  function renderChips() {
    const host = $('#categoryChips');
    if (!host) return;
    const categories = [...new Set(state.apps.map((app) => app.category).filter(Boolean))]
      .filter((cat) => cat !== OFFERS_CATEGORY && cat !== GAMES_CATEGORY && !HIDDEN_CHIP_CATEGORIES.includes(cat));
    const offersCount = offerApps().length;
    const gamesCount = state.apps.filter((app) => app.category === GAMES_CATEGORY && app.active !== false).length;
    const items = [
      { key: 'all', label: 'الكل' },
      { key: OFFERS_KEY, label: `العروض${offersCount ? ` (${nf.format(offersCount)})` : ''}` },
      { key: GAMES_KEY, label: `شحن الألعاب${gamesCount ? ` (${nf.format(gamesCount)})` : ''}` },
      ...categories.map((cat) => ({ key: cat, label: cat })),
    ];

    host.innerHTML = items
      .map((item) => `<button type="button" aria-pressed="${state.filter === item.key}" class="chip ${state.filter === item.key ? 'active' : ''}" data-cat="${esc(item.key)}">${esc(item.label)}</button>`)
      .join('');
  }

  function filteredApps() {
    const query = state.query.trim().toLowerCase();
    return state.apps.filter((app) => {
      if (state.filter === GAMES_KEY) {
        if (app.category !== GAMES_CATEGORY) return false;
      } else if (app.category === GAMES_CATEGORY) {
        return false;
      }
      const matchCategory = state.filter === 'all'
        ? true
        : state.filter === OFFERS_KEY
          ? isOffer(app)
          : state.filter === GAMES_KEY
            ? true
            : app.category === state.filter;
      if (!matchCategory) return false;
      if (!query) return true;
      return [app.name, app.vendor, app.description, app.category, app.offerText]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(query));
    });
  }

  function appCard(app, index) {
    const features = Array.isArray(app.features) ? app.features.slice(0, 4) : [];
    const onRequest = app.priceOnRequest === true;
    const oldPrice = !onRequest && Number(app.oldPrice) > Number(app.price);
    const free = !onRequest && Number(app.price) <= 0;
    const stock = stockOf(app);
    const level = stockState(stock);
    const soldOut = stock <= 0;
    const waMessage = onRequest
      ? `مرحباً، أرغب بالاستفسار عن ${app.name} والباقات المتاحة وإعرف السعر.`
      : `مرحباً، أرغب بالاشتراك في ${app.name}${free ? '' : ` بسعر ${money(app.price)}`}.`;

    return `
      <article class="app-card" style="--app:${esc(app.color || '#2563EB')}; animation-delay:${Math.min(index * 45, 260)}ms">
        ${appImageMarkup(app)}

        <div class="app-top">
          <span class="app-icon">${icon(app.icon)}</span>
          <div class="app-title">
            <h3>${esc(app.name)}</h3>
            <span class="app-vendor">${esc(app.vendor || 'AI')}</span>
            <div class="app-flags">
              ${isOffer(app) ? `<span class="offer-flag"><svg class="icon" aria-hidden="true"><use href="#i-tag"/></svg> عرض</span>` : ''}
              <span class="stock-chip ${level === 'ok' ? '' : level}">${esc(stockLabel(stock))}</span>
            </div>
          </div>
          ${app.badge ? `<span class="app-badge">${esc(app.badge)}</span>` : ''}
        </div>

        ${app.description ? `<p class="app-desc">${esc(app.description)}</p>` : ''}

        ${features.length ? `<ul class="app-features">
          ${features.map((feature) => `<li><svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>${esc(feature)}</li>`).join('')}
        </ul>` : ''}

        ${stockRow(stock)}

        <div class="app-bottom">
          <div class="app-price">
            ${onRequest
              ? `<div class="price-row"><strong class="price-request">السعر عبر واتساب</strong></div>`
              : free
                ? `<div class="price-row"><strong class="price-free">مجاناً</strong></div>`
                : `<div class="price-row"><strong>${nf.format(app.price)}</strong><span>${esc(state.settings.currency)} / ${esc(app.duration || 'شهري')}</span></div>`}
            ${oldPrice ? `<span class="price-old">${nf.format(app.oldPrice)} ${esc(state.settings.currency)}</span>` : ''}
          </div>
          <div class="app-actions">
            <a class="wa-btn" href="${waLink(waMessage)}" target="_blank" rel="noopener" aria-label="استفسار عن ${esc(app.name)} عبر واتساب">
              <svg class="icon" aria-hidden="true"><use href="#i-whatsapp"/></svg>
            </a>
            ${onRequest
              ? `<a class="add-btn ask-btn" href="${waLink(waMessage)}" target="_blank" rel="noopener"><svg class="icon" aria-hidden="true"><use href="#i-whatsapp"/></svg> اسأل عبر واتساب</a>`
              : `<button class="add-btn${soldOut ? ' is-out' : ''}" type="button" data-add="${esc(app.id)}" aria-label="${soldOut ? `${esc(app.name)} غير متوفر حالياً` : `أضف ${esc(app.name)} إلى السلة`}" ${soldOut ? 'disabled' : ''}>
              <svg class="icon" aria-hidden="true"><use href="#i-${soldOut ? 'box' : 'cart'}"/></svg>
              ${soldOut ? 'نفدت الكمية' : 'أضف إلى السلة'}
            </button>`}
          </div>
        </div>
      </article>`;
  }

  function offerCard(app, index) {
    const stock = stockOf(app);
    const level = stockState(stock);
    const soldOut = stock <= 0;
    const onRequest = app.priceOnRequest === true;
    const oldPrice = !onRequest && Number(app.oldPrice) > Number(app.price);
    const waMessage = onRequest
      ? `مرحباً، أرغب بالاستفسار عن ${app.name}${app.offerText ? ` — ${app.offerText}` : ''} وإعرف السعر.`
      : `مرحباً، أرغب بالاستفادة من العرض: ${app.name}${app.offerText ? ` — ${app.offerText}` : ''}.`;

    return `
      <article class="offer-card" style="--app:${esc(app.color || '#EA580C')}; animation-delay:${Math.min(index * 50, 300)}ms">
        <span class="offer-ribbon"><svg class="icon" aria-hidden="true"><use href="#i-bolt"/></svg> عرض خاص</span>

        ${appImageMarkup(app, 'app-image')}

        <div class="offer-top">
          <span class="app-icon" style="--app:${esc(app.color || '#EA580C')}">${icon(app.icon)}</span>
          <div class="offer-info">
            <h3>${esc(app.name)}</h3>
            <small>${esc(app.vendor || 'AI')} • ${esc(app.duration || 'شهري')}</small>
          </div>
          <span class="stock-chip ${level === 'ok' ? '' : level}">${esc(stockLabel(stock))}</span>
        </div>

        ${app.offerText ? `<p class="offer-text">${esc(app.offerText)}</p>` : ''}

        ${Array.isArray(app.features) && app.features.length ? `<ul class="app-features">
          ${app.features.slice(0, 3).map((feature) => `<li><svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>${esc(feature)}</li>`).join('')}
        </ul>` : ''}

        ${stockRow(stock)}

        <div class="offer-price">
          ${onRequest
            ? `<strong class="price-request">السعر عبر واتساب</strong>`
            : `<strong>${nf.format(app.price)}</strong><span>${esc(state.settings.currency)} / ${esc(app.duration || 'شهري')}</span>${oldPrice ? `<del>${nf.format(app.oldPrice)} ${esc(state.settings.currency)}</del>` : ''}`}
        </div>

        <div class="offer-actions">
          ${onRequest
            ? `<a class="add-btn ask-btn" href="${waLink(waMessage)}" target="_blank" rel="noopener"><svg class="icon" aria-hidden="true"><use href="#i-whatsapp"/></svg> اسأل عبر واتساب</a>`
            : `<button class="add-btn${soldOut ? ' is-out' : ''}" type="button" data-add="${esc(app.id)}" ${soldOut ? 'disabled' : ''} aria-label="${soldOut ? `${esc(app.name)} غير متوفر حالياً` : `أضف ${esc(app.name)} إلى السلة`}">
            <svg class="icon" aria-hidden="true"><use href="#i-${soldOut ? 'box' : 'cart'}"/></svg>
            ${soldOut ? 'نفدت الكمية' : 'أضف إلى السلة'}
          </button>`}
          <a class="wa-btn" href="${waLink(waMessage)}" target="_blank" rel="noopener" aria-label="استفسار عن عرض ${esc(app.name)}">
            <svg class="icon" aria-hidden="true"><use href="#i-whatsapp"/></svg>
          </a>
        </div>
      </article>`;
  }

  function renderOffers() {
    const grid = $('#offersGrid');
    const empty = $('#offersEmpty');
    if (!grid) return;
    const offers = offerApps();
    grid.innerHTML = offers.map(offerCard).join('');
    if (empty) empty.hidden = offers.length > 0;
  }

  function renderGames() {
    const grid = $('#gamesGrid');
    const empty = $('#gamesEmpty');
    if (!grid) return;
    const games = state.apps.filter((app) => app.active !== false && app.category === GAMES_CATEGORY);
    grid.innerHTML = games.map(appCard).join('');
    if (empty) empty.hidden = games.length > 0;
  }

  function renderApps() {
    const grid = $('#appsGrid');
    const empty = $('#appsEmpty');
    const count = $('#appsCount');
    if (!grid) return;

    const apps = filteredApps();
    grid.innerHTML = apps.map(appCard).join('');
    if (empty) empty.hidden = apps.length > 0;

    if (count) {
      count.textContent = apps.length === state.apps.length
        ? `${nf.format(apps.length)} تطبيقات متاحة`
        : `${nf.format(apps.length)} من ${nf.format(state.apps.length)}`;
    }
  }

  function renderStats() {
    animateNumber($('#statApps'), state.apps.length);
    paintVisitors(Number(state.stats.visitors) || 0);
  }

  function renderShowcase() {
    const list = $('#showcaseList');
    if (!list) return;

    if (!state.apps.length) {
      list.innerHTML = '<div class="mini-empty">لا توجد تطبيقات معروضة حالياً</div>';
      const totalEl = $('#showcaseTotal');
      if (totalEl) totalEl.textContent = `0 ${state.settings.currency}`;
      const countEl = $('#showcaseCartCount');
      if (countEl) countEl.textContent = '0';
      return;
    }

    const showcaseApps = state.apps.slice(0, 3);
    list.innerHTML = showcaseApps.map((app) => `
      <div class="mini-app">
        <span class="mini-icon" style="--c:${esc(app.color || '#2563EB')}">${icon(app.icon)}</span>
        <span class="mini-info"><strong>${esc(app.name)}</strong><small>${esc(app.duration || 'شهري')} • ${esc(app.vendor || 'AI')}</small></span>
        <span class="mini-price">${nf.format(app.price)} <small>${esc(state.settings.currency)}</small></span>
      </div>`).join('');

    const total = showcaseApps.reduce((sum, app) => sum + (Number(app.price) || 0), 0);
    const totalEl = $('#showcaseTotal');
    if (totalEl) totalEl.textContent = `${nf.format(total)} ${state.settings.currency}`;
    const countEl = $('#showcaseCartCount');
    if (countEl) countEl.textContent = nf.format(showcaseApps.length);
  }

  async function loadPublic() {
    try {
      const data = await api('/api/public');
      state.settings = { ...state.settings, ...(data.settings || {}) };
      state.apps = Array.isArray(data.apps) ? data.apps : [];
      state.stats = data.stats || state.stats;

      applySettings();
      renderStats();
      renderChips();
      renderApps();
      renderOffers();
      renderGames();
      renderShowcase();
      renderCart();
    } catch (error) {
      toast(error.message || 'تعذّر تحميل بيانات المتجر', 'error');
      renderApps();
    }
  }

  /* ---------- السلة ---------- */
  const maxFor = (app) => Math.max(0, Math.min(MAX_QTY, stockOf(app)));

  function addToCart(id) {
    const app = state.apps.find((item) => item.id === id);
    if (!app) {
      toast('هذا التطبيق غير متاح حالياً', 'error');
      return;
    }
    const stock = stockOf(app);
    if (stock <= 0) {
      toast(`نفدت كمية ${app.name} — تواصل معنا عبر واتساب`, 'error');
      return;
    }
    const limit = maxFor(app);
    const existing = state.cart.find((line) => line.id === id);
    if (existing) {
      if (existing.qty >= limit) {
        toast(`الكمية المتاحة من ${app.name} هي ${nf.format(limit)} فقط`, 'error');
        return;
      }
      existing.qty += 1;
    } else {
      state.cart.push({ id, qty: 1 });
    }
    saveCart();
    renderCart();
    bumpBadge();
    toast(`تمت إضافة ${app.name} إلى السلة`);
  }

  function setQty(id, delta) {
    const line = state.cart.find((item) => item.id === id);
    if (!line) return;
    const app = state.apps.find((item) => item.id === id);
    const limit = app ? maxFor(app) : MAX_QTY;
    if (limit <= 0) {
      toast('نفدت الكمية، سيتم إزالة العنصر من السلة', 'error');
      removeFromCart(id);
      return;
    }
    if (line.qty > limit) line.qty = limit;
    if (delta > 0 && line.qty >= limit) {
      toast(`الكمية المتاحة ${nf.format(limit)} فقط`, 'error');
      return;
    }
    line.qty = Math.min(limit, Math.max(1, line.qty + delta));
    saveCart();
    renderCart();
  }

  function removeFromCart(id) {
    state.cart = state.cart.filter((line) => line.id !== id);
    saveCart();
    renderCart();
  }

  function bumpBadge() {
    const badge = $('#cartBadge');
    if (!badge) return;
    badge.style.animation = 'none';
    void badge.offsetWidth;
    badge.style.animation = '';
  }

  function renderCart() {
    const { details, count, total } = cartTotals();
    const body = $('#cartBody');
    const foot = $('#cartFoot');
    const badge = $('#cartBadge');
    const subtitle = $('#cartSubtitle');
    const mobileBar = $('#mobileCartBar');

    if (badge) {
      badge.textContent = nf.format(count);
      badge.hidden = count === 0;
    }

    if (subtitle) subtitle.textContent = count === 0 ? 'السلة فارغة' : `${nf.format(count)} عنصر في السلة`;

    if (!body) return;

    if (!details.length) {
      body.innerHTML = `
        <div class="cart-empty">
          <span class="empty-icon"><svg class="icon" aria-hidden="true"><use href="#i-cart"/></svg></span>
          <h3>سلتك فارغة</h3>
          <p>أضف الاشتراكات التي تريدها ثم أتمم طلبك عبر واتساب.</p>
          <button class="btn btn-primary" type="button" data-close-cart>تصفّح التطبيقات</button>
        </div>`;
      if (foot) foot.hidden = true;
    } else {
      const unavailable = cartDetails().filter((line) => stockOf(line.app) <= 0);
      body.innerHTML = `${unavailable.length ? `
        <div class="cart-alert">
          <svg class="icon" aria-hidden="true"><use href="#i-box"/></svg>
          <span>نفدت كمية: ${unavailable.map((line) => esc(line.app.name)).join('، ')} — أُزيلت من الطلب.</span>
        </div>` : ''}${details.map(({ app, qty }) => {
        const stock = stockOf(app);
        const limit = maxFor(app);
        const level = stockState(stock);
        const plusDisabled = qty >= limit;
        return `
        <div class="cart-item" style="--app:${esc(app.color || '#2563EB')}">
          <span class="cart-thumb">${icon(app.icon)}</span>
          <div class="cart-info">
            <strong>${esc(app.name)}</strong>
            <span class="cart-unit">${nf.format(app.price)} ${esc(state.settings.currency)} / ${esc(app.duration || 'شهري')}</span>
            <div class="cart-line">
              <div class="qty">
                <button type="button" data-qty="${esc(app.id)}" data-delta="-1" aria-label="إنقاص الكمية"><svg class="icon" aria-hidden="true"><use href="#i-minus"/></svg></button>
                <span>${nf.format(qty)}</span>
                <button type="button" data-qty="${esc(app.id)}" data-delta="1" aria-label="زيادة الكمية" ${plusDisabled ? 'disabled' : ''}><svg class="icon" aria-hidden="true"><use href="#i-plus"/></svg></button>
              </div>
              <span class="cart-line-price">${nf.format(app.price * qty)} ${esc(state.settings.currency)}</span>
            </div>
            ${level === 'ok' ? '' : `<span class="cart-note ${level}">${level === 'out' ? 'نفدت الكمية — يُرجى إزالة العنصر' : `متبقي ${nf.format(stock)} فقط في المخزون`}</span>`}
          </div>
          <button class="cart-remove" type="button" data-remove="${esc(app.id)}" aria-label="إزالة ${esc(app.name)}">
            <svg class="icon" aria-hidden="true"><use href="#i-trash"/></svg>
          </button>
        </div>`;
      }).join('')}`;
      if (foot) foot.hidden = false;
    }

    const totalEl = $('#cartTotal');
    if (totalEl) totalEl.textContent = money(total);

    if (mobileBar) {
      mobileBar.hidden = count === 0;
      document.body.classList.toggle('has-cart', count > 0);
      const mcbCount = $('#mcbCount');
      const mcbTotal = $('#mcbTotal');
      if (mcbCount) mcbCount.textContent = nf.format(count);
      if (mcbTotal) mcbTotal.textContent = money(total);
    }
  }

  function openCart() {
    const drawer = $('#cartDrawer');
    const scrim = $('#cartScrim');
    if (!drawer) return;
    renderCart();
    if (scrim) scrim.hidden = false;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    window.setTimeout(() => $('#cartClose')?.focus(), 120);
  }

  function closeCart() {
    const drawer = $('#cartDrawer');
    const scrim = $('#cartScrim');
    if (!drawer || !drawer.classList.contains('open')) return;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    if (scrim) scrim.hidden = true;
    if (!isAdminOpen()) document.body.classList.remove('no-scroll');
  }

  async function checkout() {
    const { details, total } = cartTotals();
    if (!details.length) {
      toast('أضف تطبيقاً واحداً على الأقل للسلة', 'error');
      return;
    }

    /* مزامنة السلة مع الكميات المتاحة فعلياً قبل بناء رسالة الطلب */
    const synced = details.map(({ app, qty }) => ({ id: app.id, qty }));
    const changed = synced.length !== state.cart.length
      || synced.some((line, index) => {
        const current = state.cart[index];
        return !current || current.id !== line.id || current.qty !== line.qty;
      });
    if (changed) {
      state.cart = synced;
      saveCart();
      renderCart();
      toast('تم تعديل الكميات وفق المخزون المتاح', 'error');
    }

    const name = $('#orderName')?.value.trim() || '';
    const note = $('#orderNote')?.value.trim() || '';
    const siteName = state.settings.siteName || 'Hussam-Ai';

    const lines = details.map(({ app, qty }) => `• ${app.name} × ${qty} — ${money(app.price * qty)}`);
    const message = [
      `مرحباً ${siteName} 👋`,
      'أرغب بالاشتراك في:',
      ...lines,
      '',
      `الإجمالي: ${money(total)}`,
      name ? `الاسم: ${name}` : '',
      note ? `ملاحظة: ${note}` : '',
    ].filter((line) => line !== '').join('\n');

    const win = window.open('', '_blank');
    const button = $('#checkoutBtn');
    if (button) {
      button.disabled = true;
      button.dataset.label = button.innerHTML;
      button.innerHTML = 'جارٍ تجهيز طلبك…';
    }

    let recorded = true;
    let result = null;
    try {
      result = await api('/api/orders', {
        method: 'POST',
        body: { items: state.cart, name, note },
      });
    } catch {
      recorded = false;
    }

    if (button) {
      button.disabled = false;
      if (button.dataset.label) button.innerHTML = button.dataset.label;
    }

    const target = waLink(message);
    if (win) win.location.href = target;
    else window.location.href = target;

    if (recorded) {
      /* تحديث الكميات المتبقية فوراً بعد خصم المخزون على الخادم */
      if (result && Array.isArray(result.stock)) {
        result.stock.forEach((entry) => {
          const app = state.apps.find((item) => item.id === entry.id);
          if (app) app.stock = entry.stock;
        });
      }
      state.cart = [];
      saveCart();
      renderChips();
      renderApps();
      renderOffers();
      renderGames();
      renderCart();
      closeCart();
      const soldOut = Array.isArray(result && result.soldOut) ? result.soldOut : [];
      toast('تم تجهيز طلبك — أرسل الرسالة في واتساب لإكمال الاشتراك');
      if (soldOut.length) {
        window.setTimeout(() => toast(`نفدت كمية: ${soldOut.join('، ')}`, 'error'), 900);
      }
      refreshPublicQuietly();
    } else {
      toast('تعذّر تسجيل الطلب في اللوحة، لكن يمكنك المتابعة عبر واتساب', 'error');
    }
  }

  async function refreshPublicQuietly() {
    try {
      const data = await api('/api/public');
      state.settings = { ...state.settings, ...(data.settings || {}) };
      state.apps = Array.isArray(data.apps) ? data.apps : state.apps;
      state.stats = data.stats || state.stats;
      renderChips();
      renderApps();
      renderOffers();
      renderGames();
      renderCart();
    } catch { /* تجاهل */ }
  }

  /* ---------- لوحة التحكم ---------- */
  const isAdminOpen = () => {
    const modal = $('#adminModal');
    return Boolean(modal && !modal.hidden);
  };

  function setAdminView(view) {
    const login = $('#adminLogin');
    const app = $('#adminApp');
    if (login) login.hidden = view !== 'login';
    if (app) app.hidden = view !== 'app';
  }

  function openAdmin() {
    const modal = $('#adminModal');
    const scrim = $('#adminScrim');
    if (!modal) return;
    if (scrim) scrim.hidden = false;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');

    if (state.admin.token) {
      setAdminView('app');
      loadAdminData().catch(() => {
        state.admin.token = '';
        sessionStorage.removeItem(TOKEN_KEY);
        state.admin.data = null;
        setAdminView('login');
        window.setTimeout(() => $('#loginPassword')?.focus(), 100);
      });
    } else {
      setAdminView('login');
      window.setTimeout(() => $('#loginPassword')?.focus(), 100);
    }
  }

  function closeAdmin() {
    const modal = $('#adminModal');
    const scrim = $('#adminScrim');
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    if (scrim) scrim.hidden = true;
    closeEditor();
    if (!document.querySelector('.cart-drawer.open')) document.body.classList.remove('no-scroll');
  }

  async function loadAdminData() {
    const data = await api('/api/admin/data', { auth: true });
    state.admin.data = data;
    if (data.settings) state.settings = { ...state.settings, ...data.settings };
    renderAdminStats();
    renderAdminApps();
    renderAdminOrders();
    fillSettings();
  }

  function renderAdminStats() {
    const host = $('#adminStats');
    const data = state.admin.data;
    if (!host || !data) return;
    const stats = data.stats || {};
    const activeCount = (data.apps || []).filter((app) => app.active).length;
    const offersCount = (data.apps || []).filter((app) => app.active && isOffer(app)).length;
    host.innerHTML = `
      <div class="admin-stat"><span>زيارات</span><strong>${nf.format(stats.visits || 0)}</strong></div>
      <div class="admin-stat"><span>زوار فريدون</span><strong>${nf.format(stats.visitors || 0)}</strong></div>
      <div class="admin-stat"><span>طلبات</span><strong>${nf.format(stats.orders || 0)}</strong></div>
      <div class="admin-stat"><span>تطبيقات معروضة</span><strong>${nf.format(activeCount)}</strong></div>
      <div class="admin-stat"><span>عروض نشطة</span><strong>${nf.format(offersCount)}</strong></div>`;
  }

  function renderAdminApps() {
    const host = $('#adminAppsList');
    const data = state.admin.data;
    if (!host || !data) return;

    if (!data.apps.length) {
      host.innerHTML = '<div class="admin-empty">لا توجد تطبيقات بعد. ابدأ بإضافة أول تطبيق.</div>';
      return;
    }

    host.innerHTML = data.apps.map((app) => {
      const stock = stockOf(app);
      const level = stockState(stock);
      return `
      <div class="admin-app-row ${app.active ? '' : 'is-off'}">
        <span class="app-icon" style="--app:${esc(app.color || '#2563EB')}">${icon(app.icon)}</span>
        <div class="admin-app-info">
          <strong>
            ${esc(app.name)}
            ${isOffer(app) ? '<span class="offer-flag"><svg class="icon" aria-hidden="true"><use href="#i-tag"/></svg> عرض</span>' : ''}
          </strong>
          <small>${esc(app.vendor || 'AI')} • ${esc(app.category || 'أخرى')} • ${esc(app.duration || 'شهري')}</small>
        </div>
        <div class="admin-app-price">
          ${nf.format(app.price)} ${esc(state.settings.currency)}
          <small>${Number(app.oldPrice) > Number(app.price) ? `قبل ${nf.format(app.oldPrice)}` : '&nbsp;'}</small>
        </div>
        <span class="admin-stock ${level === 'ok' ? '' : level}" title="الكمية المتاحة">
          <svg class="icon" aria-hidden="true"><use href="#i-box"/></svg>
          ${nf.format(stock)}
        </span>
        <span class="status-pill ${app.active ? '' : 'off'}">${app.active ? 'معروض' : 'مخفي'}</span>
        <div class="admin-app-actions">
          <button class="mini-btn" type="button" data-edit="${esc(app.id)}" aria-label="تعديل ${esc(app.name)}">
            <svg class="icon" aria-hidden="true"><use href="#i-edit"/></svg>
          </button>
          <button class="mini-btn danger" type="button" data-delete="${esc(app.id)}" aria-label="حذف ${esc(app.name)}">
            <svg class="icon" aria-hidden="true"><use href="#i-trash"/></svg>
          </button>
        </div>
      </div>`;
    }).join('');
  }

  function renderAdminOrders() {
    const host = $('#adminOrders');
    const data = state.admin.data;
    if (!host || !data) return;

    if (!data.orders.length) {
      host.innerHTML = '<div class="admin-empty">لا توجد طلبات مسجّلة بعد. ستظهر هنا الطلبات التي تُرسل من السلة.</div>';
      return;
    }

    host.innerHTML = data.orders.map((order) => {
      const items = order.items.map((item) => `${esc(item.name)} × ${item.qty}`).join('<br>');
      const date = order.createdAt ? dateFmt.format(new Date(order.createdAt)) : '';
      return `
        <article class="order-card">
          <div class="order-head">
            <strong>#${esc(String(order.id).slice(0, 6))}${order.name ? ` — ${esc(order.name)}` : ''}</strong>
            <span class="order-meta">${esc(date)}</span>
          </div>
          <div class="order-items">${items}</div>
          ${order.note ? `<div class="order-note">ملاحظة: ${esc(order.note)}</div>` : ''}
          <div class="order-total">
            <span>الإجمالي <strong>${nf.format(order.total)} ${esc(order.currency || state.settings.currency)}</strong></span>
            <button class="mini-btn danger" type="button" data-order-delete="${esc(order.id)}" aria-label="حذف الطلب">
              <svg class="icon" aria-hidden="true"><use href="#i-trash"/></svg>
            </button>
          </div>
        </article>`;
    }).join('');
  }

  function fillSettings() {
    const s = state.admin.data?.settings;
    if (!s) return;
    const map = {
      setSiteName: s.siteName,
      setWhatsapp: s.whatsapp,
      setCurrency: s.currency,
      setTagline: s.tagline,
      setHeroTitle: s.heroTitle,
      setHeroText: s.heroText,
      setAnnouncement: s.announcement,
      setAssistantGreeting: s.assistantGreeting,
    };
    Object.entries(map).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.value = value || '';
    });
    const assistantToggle = $('#setAssistantEnabled');
    if (assistantToggle) assistantToggle.checked = s.assistantEnabled !== false;
  }

  function switchTab(name) {
    $$('.admin-tab').forEach((tab) => {
      const active = tab.dataset.tab === name;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    $$('.admin-tab-panel').forEach((panel) => {
      panel.hidden = panel.dataset.panel !== name;
    });
  }

  function openEditor(app) {
    const editor = $('#appEditor');
    if (!editor) return;
    $('#appError').hidden = true;

    $('#editorTitle').textContent = app ? 'تعديل التطبيق' : 'إضافة تطبيق جديد';
    $('#appId').value = app ? app.id : '';
    $('#appName').value = app ? app.name : '';
    $('#appVendor').value = app ? app.vendor || '' : '';
    $('#appPrice').value = app ? app.price : '';
    $('#appPriceOnRequest').checked = app ? Boolean(app.priceOnRequest) : false;
    $('#appOldPrice').value = app ? app.oldPrice || '' : '';
    $('#appDuration').value = app ? app.duration || 'شهري' : 'شهري';
    $('#appCategory').value = app ? app.category || 'أخرى' : 'محادثة';
    $('#appStock').value = app ? stockOf(app) : 10;
    $('#appBadge').value = app ? app.badge || '' : '';
    $('#appColor').value = app ? app.color || '#2563EB' : '#2563EB';
    $('#appIcon').value = app ? app.icon || 'sparkles' : 'sparkles';
    $('#appDescription').value = app ? app.description || '' : '';
    $('#appFeatures').value = app && Array.isArray(app.features) ? app.features.join('\n') : '';
    $('#appOffer').checked = app ? isOffer(app) : false;
    $('#appOfferText').value = app ? app.offerText || '' : '';
    $('#appActive').checked = app ? Boolean(app.active) : true;

    state.admin.editorImage = app ? app.image || '' : '';
    $('#appImageUrl').value = app && /^https?:\/\//i.test(app.image || '') ? app.image : '';
    $('#appImageInput').value = '';
    setImageHint('');
    paintEditorImage();

    editor.hidden = false;
    window.setTimeout(() => $('#appName')?.focus(), 100);
  }

  function closeEditor() {
    const editor = $('#appEditor');
    if (editor) editor.hidden = true;
  }

  /* ---------- صورة التطبيق ---------- */
  function setImageHint(message, isError = false) {
    const hint = $('#appImageHint');
    if (!hint) return;
    hint.textContent = message || '';
    hint.hidden = !message;
    hint.classList.toggle('error', Boolean(message) && isError);
  }

  function paintEditorImage() {
    const preview = $('#appImagePreview');
    if (!preview) return;
    const url = state.admin.editorImage || '';
    const current = $('img', preview);
    if (url) {
      if (current && current.getAttribute('src') === url) return;
      preview.innerHTML = `<img src="${esc(url)}" alt="معاينة صورة التطبيق" />`;
      preview.dataset.empty = '0';
    } else {
      preview.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-image"/></svg><span>لا توجد صورة</span>';
      preview.dataset.empty = '1';
    }
  }

  function setEditorImage(url) {
    state.admin.editorImage = url || '';
    paintEditorImage();
    if (!url) {
      $('#appImageUrl').value = '';
      setImageHint('');
    }
  }

  async function handleImageFile(file) {
    if (!file) return;
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      setImageHint('الصيغة غير مدعومة. استخدم PNG أو JPG أو WEBP أو GIF.', true);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageHint('حجم الصورة أكبر من 5 ميجابايت. اختر صورة أصغر.', true);
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || '');
      setEditorImage(dataUrl);
      setImageHint('جارٍ رفع الصورة…');

      const button = $('#appSaveBtn');
      if (button) button.disabled = true;
      try {
        const result = await api('/api/admin/upload', {
          method: 'POST',
          auth: true,
          body: { dataUrl, previous: '' },
        });
        setEditorImage(result.url);
        $('#appImageUrl').value = '';
        setImageHint('تم رفع الصورة بنجاح ✓');
      } catch (error) {
        if (error.status === 401) handleSessionExpired();
        setImageHint(error.message || 'تعذّر رفع الصورة', true);
      } finally {
        if (button) button.disabled = false;
      }
    };
    reader.onerror = () => setImageHint('تعذّر قراءة الملف', true);
    reader.readAsDataURL(file);
  }

  function applyImageUrl() {
    const input = $('#appImageUrl');
    if (!input) return;
    const value = input.value.trim();
    if (!value) return;
    if (!/^https?:\/\/[^\s"'<>]+$/i.test(value)) {
      setImageHint('أدخل رابط صورة صحيحاً يبدأ بـ https://', true);
      return;
    }
    setEditorImage(value);
    setImageHint('سيتم استخدام رابط الصورة هذا.');
  }

  async function saveApp(event) {
    event.preventDefault();
    const id = $('#appId').value;
    const errorBox = $('#appError');
    errorBox.hidden = true;

    const features = $('#appFeatures').value
      .split(/[\n,،]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 6);

    const payload = {
      name: $('#appName').value.trim(),
      vendor: $('#appVendor').value.trim(),
      price: Number($('#appPrice').value),
      priceOnRequest: $('#appPriceOnRequest').checked,
      oldPrice: Number($('#appOldPrice').value) || 0,
      duration: $('#appDuration').value.trim() || 'شهري',
      category: $('#appCategory').value,
      stock: Number($('#appStock').value),
      badge: $('#appBadge').value.trim(),
      color: $('#appColor').value,
      icon: $('#appIcon').value,
      description: $('#appDescription').value.trim(),
      features,
      offer: $('#appOffer').checked,
      offerText: $('#appOfferText').value.trim(),
      image: state.admin.editorImage || '',
      active: $('#appActive').checked,
    };

    if (!payload.name) {
      errorBox.textContent = 'اسم التطبيق مطلوب';
      errorBox.hidden = false;
      return;
    }
    if (!Number.isFinite(payload.price) || payload.price < 0) {
      errorBox.textContent = 'أدخل سعراً صحيحاً (0 أو أكثر)';
      errorBox.hidden = false;
      return;
    }
    if (!Number.isFinite(payload.stock) || payload.stock < 0) {
      errorBox.textContent = 'أدخل كمية صحيحة (0 أو أكثر)';
      errorBox.hidden = false;
      return;
    }

    const button = $('#appSaveBtn');
    button.disabled = true;

    try {
      if (id) {
        const updated = await api(`/api/admin/apps/${encodeURIComponent(id)}`, {
          method: 'PUT', auth: true, body: payload,
        });
        const index = state.admin.data.apps.findIndex((app) => app.id === id);
        if (index !== -1) state.admin.data.apps[index] = updated.app;
      } else {
        const created = await api('/api/admin/apps', { method: 'POST', auth: true, body: payload });
        state.admin.data.apps.unshift(created.app);
        state.admin.data.stats.apps = (state.admin.data.stats.apps || 0) + 1;
      }

      closeEditor();
      renderAdminApps();
      renderAdminStats();
      await loadPublic();
      toast(id ? 'تم تحديث التطبيق بنجاح' : 'تمت إضافة التطبيق بنجاح');
    } catch (error) {
      if (error.status === 401) handleSessionExpired();
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    } finally {
      button.disabled = false;
    }
  }

  async function deleteApp(id) {
    const app = state.admin.data?.apps.find((item) => item.id === id);
    if (!app) return;
    if (!window.confirm(`حذف «${app.name}» نهائياً من المتجر؟`)) return;

    try {
      await api(`/api/admin/apps/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true });
      state.admin.data.apps = state.admin.data.apps.filter((item) => item.id !== id);
      renderAdminApps();
      renderAdminStats();
      await loadPublic();
      toast('تم حذف التطبيق');
    } catch (error) {
      if (error.status === 401) return handleSessionExpired();
      toast(error.message, 'error');
    }
  }

  async function deleteOrder(id) {
    if (!window.confirm('حذف هذا الطلب من السجل؟')) return;
    try {
      await api(`/api/admin/orders/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true });
      state.admin.data.orders = state.admin.data.orders.filter((order) => order.id !== id);
      renderAdminOrders();
      toast('تم حذف الطلب');
    } catch (error) {
      if (error.status === 401) return handleSessionExpired();
      toast(error.message, 'error');
    }
  }

  async function login(event) {
    event.preventDefault();
    const input = $('#loginPassword');
    const errorBox = $('#loginError');
    const button = $('#loginBtn');
    errorBox.hidden = true;

    const password = input.value;
    if (!password) {
      errorBox.textContent = 'أدخل كلمة المرور';
      errorBox.hidden = false;
      return;
    }

    button.disabled = true;
    try {
      const result = await api('/api/admin/login', { method: 'POST', body: { password } });
      state.admin.token = result.token;
      sessionStorage.setItem(TOKEN_KEY, result.token);
      input.value = '';
      setAdminView('app');
      await loadAdminData();
      toast('مرحباً بك في لوحة التحكم');
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
      input.focus();
    } finally {
      button.disabled = false;
    }
  }

  function handleSessionExpired() {
    state.admin.token = '';
    state.admin.data = null;
    sessionStorage.removeItem(TOKEN_KEY);
    setAdminView('login');
    toast('انتهت الجلسة، سجّل الدخول من جديد', 'error');
    window.setTimeout(() => $('#loginPassword')?.focus(), 100);
  }

  async function saveSettings(event) {
    event.preventDefault();
    const button = $('#saveSettingsBtn');
    button.disabled = true;
    try {
      const result = await api('/api/admin/settings', {
        method: 'PATCH',
        auth: true,
        body: {
          siteName: $('#setSiteName').value.trim(),
          whatsapp: $('#setWhatsapp').value.trim(),
          currency: $('#setCurrency').value.trim(),
          tagline: $('#setTagline').value.trim(),
          heroTitle: $('#setHeroTitle').value.trim(),
          heroText: $('#setHeroText').value.trim(),
          announcement: $('#setAnnouncement').value.trim(),
          assistantEnabled: $('#setAssistantEnabled').checked,
          assistantGreeting: $('#setAssistantGreeting').value.trim(),
        },
      });
      state.admin.data.settings = result.settings;
      state.settings = { ...state.settings, ...result.settings };
      applySettings();
      renderCart();
      await loadPublic();
      applyAssistantSetting();
      toast('تم حفظ إعدادات المنصة');
    } catch (error) {
      if (error.status === 401) return handleSessionExpired();
      toast(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    const current = $('#currentPassword').value;
    const next = $('#newPassword').value;
    try {
      await api('/api/admin/password', { method: 'POST', auth: true, body: { current, next } });
      $('#currentPassword').value = '';
      $('#newPassword').value = '';
      toast('تم تحديث كلمة المرور');
    } catch (error) {
      if (error.status === 401) return handleSessionExpired();
      toast(error.message, 'error');
    }
  }

  async function resetStats() {
    if (!window.confirm('هل تريد تصفير عدّاد الزيارات والزوار؟ لا يمكن التراجع.')) return;
    try {
      await api('/api/admin/stats/reset', { method: 'POST', auth: true });
      state.admin.data.stats = { ...state.admin.data.stats, visits: 0, visitors: 0 };
      state.stats = { ...state.stats, visits: 0, visitors: 0 };
      renderAdminStats();
      paintVisitors(0);
      toast('تم تصفير عدّاد الزوار');
    } catch (error) {
      if (error.status === 401) return handleSessionExpired();
      toast(error.message, 'error');
    }
  }

  function logout() {
    state.admin.token = '';
    state.admin.data = null;
    sessionStorage.removeItem(TOKEN_KEY);
    setAdminView('login');
    toast('تم تسجيل الخروج');
  }

  /* ---------- المساعد الآلي ---------- */
  const assistant = { open: false, started: false, busy: false, teaserDismissed: false };

  const normalizeText = (value) => String(value || '')
    .toLowerCase()
    .replace(/[إأآا]/g, 'ا')
    .replace(/[ىي]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const moneyText = (value) => `${nf.format(Number(value) || 0)} ${state.settings.currency || 'ر.س'}`;
  const appList = () => state.apps.filter((app) => app.active !== false);

  function findApp(query) {
    const q = normalizeText(query);
    if (!q) return null;
    const apps = appList();
    return apps.find((app) => normalizeText(app.name).includes(q))
      || apps.find((app) => q.includes(normalizeText(app.name)))
      || apps.find((app) => normalizeText(app.vendor || '').includes(q) && q.length >= 3)
      || null;
  }

  function appLine(app) {
    const stock = stockOf(app);
    const stockNote = stock <= 0 ? ' — نفدت الكمية' : stock <= 3 ? ` — متبقي ${nf.format(stock)} فقط` : '';
    return `<li><svg class="icon" aria-hidden="true"><use href="#i-${stock <= 0 ? 'box' : 'check'}"/></svg><span><strong>${esc(app.name)}</strong> — <span class="msg-price">${moneyText(app.price)}</span> / ${esc(app.duration || 'شهري')}${stockNote}</span></li>`;
  }

  function pricesAnswer() {
    const apps = appList();
    if (!apps.length) return '<p>لا توجد اشتراكات معروضة الآن، لكن يسعدني مساعدتك عبر واتساب.</p>';
    return `<p>هذه أسعار الاشتراكات المتاحة حالياً:</p>
      <ul class="msg-list">${apps.map(appLine).join('')}</ul>
      <p>الأسعار تشمل مدة الاشتراك المذكورة، ويمكنك إضافة أكثر من اشتراك إلى السلة.</p>`;
  }

  function offersAnswer() {
    const offers = offerApps();
    if (!offers.length) return '<p>لا توجد عروض نشطة في هذه اللحظة، لكن أسعارنا تنافسية دائماً. أستطيع أن أعرض لك الأسعار الحالية.</p>';
    return `<p>هذه العروض المتاحة الآن 🎁</p>
      <ul class="msg-list">${offers.map((app) => `<li><svg class="icon" aria-hidden="true"><use href="#i-tag"/></svg><span><strong>${esc(app.name)}</strong> — <span class="msg-price">${moneyText(app.price)}</span>${app.offerText ? ` • ${esc(app.offerText)}` : ''}${stockOf(app) <= 0 ? ' • نفدت الكمية' : ''}</span></li>`).join('')}</ul>
      <p>كميات العروض محدودة، والطلب يتم عبر واتساب أو بإضافتها إلى السلة.</p>`;
  }

  function appAnswer(app) {
    const stock = stockOf(app);
    const features = Array.isArray(app.features) ? app.features : [];
    return `<p><strong>${esc(app.name)}</strong>${app.vendor ? ` من ${esc(app.vendor)}` : ''}</p>
      ${app.description ? `<p>${esc(app.description)}</p>` : ''}
      <p>السعر: <span class="msg-price">${moneyText(app.price)}</span> / ${esc(app.duration || 'شهري')}${Number(app.oldPrice) > Number(app.price) ? ` (بدلاً من ${moneyText(app.oldPrice)})` : ''}</p>
      ${features.length ? `<ul class="msg-list">${features.slice(0, 5).map((f) => `<li><svg class="icon" aria-hidden="true"><use href="#i-check"/></svg><span>${esc(f)}</span></li>`).join('')}</ul>` : ''}
      <p>الكمية المتاحة: <strong>${stock <= 0 ? 'نفدت حالياً' : `${nf.format(stock)} اشتراك`}</strong>${isOffer(app) && app.offerText ? ` • عرض: ${esc(app.offerText)}` : ''}</p>`;
  }

  function featuresAnswer() {
    const apps = appList().slice(0, 5);
    if (!apps.length) return '<p>لا توجد تطبيقات معروضة الآن.</p>';
    return `<p>أهم ما يميّز كل اشتراك:</p>
      <ul class="msg-list">${apps.map((app) => `<li><svg class="icon" aria-hidden="true"><use href="#i-check"/></svg><span><strong>${esc(app.name)}</strong>: ${esc((app.features || []).slice(0, 3).join('، ') || 'مزايا متعددة')}</span></li>`).join('')}</ul>`;
  }

  function contactAnswer() {
    return `<p>يسعدني تواصلك معي مباشرة 💬</p>
      <ul class="msg-list">
        <li><svg class="icon" aria-hidden="true"><use href="#i-whatsapp"/></svg><span>واتساب: <strong dir="ltr">+${esc(state.settings.whatsapp || '')}</strong></span></li>
        <li><svg class="icon" aria-hidden="true"><use href="#i-clock"/></svg><span>أوقات الرد: يومياً من 9 صباحاً حتى 12 منتصف الليل</span></li>
      </ul>
      <p>اضغط زر «التحدث معي على واتساب» في أسفل النافذة وسأرد عليك فوراً.</p>`;
  }

  function stepsAnswer() {
    return `<p>الاشتراك يتم في 3 خطوات بسيطة:</p>
      <ul class="msg-list">
        <li><svg class="icon" aria-hidden="true"><use href="#i-check"/></svg><span>اختر التطبيق المناسب من قسم التطبيقات أو العروض.</span></li>
        <li><svg class="icon" aria-hidden="true"><use href="#i-check"/></svg><span>اضغط «أضف إلى السلة» وحدّد الكمية (لا تتجاوز المتوفر).</span></li>
        <li><svg class="icon" aria-hidden="true"><use href="#i-check"/></svg><span>أتمم الطلب عبر واتساب، وسيتم التسليم خلال دقائق.</span></li>
      </ul>
      <p>لا تحتاج إلى حساب أو بطاقة على الموقع، والدفع يتم بالاتفاق عبر واتساب.</p>`;
  }

  function deliveryAnswer() {
    return `<p>التسليم فوري خلال دقائق من تأكيد الطلب عبر واتساب، وتصلك بيانات الاشتراك مباشرة. الاشتراكات أصلية ومضمونة طوال المدة.</p>`;
  }

  function fallbackAnswer() {
    return `<p>أستطيع مساعدتك في:</p>
      <ul class="msg-list">
        <li><svg class="icon" aria-hidden="true"><use href="#i-tag"/></svg><span>الأسعار الحالية لكل الاشتراكات</span></li>
        <li><svg class="icon" aria-hidden="true"><use href="#i-wand"/></svg><span>العروض والخصومات المتاحة</span></li>
        <li><svg class="icon" aria-hidden="true"><use href="#i-check"/></svg><span>مزايا أي تطبيق بالتفصيل</span></li>
        <li><svg class="icon" aria-hidden="true"><use href="#i-whatsapp"/></svg><span>طريقة التواصل والاشتراك</span></li>
      </ul>
      <p>اكتب اسم التطبيق مباشرة (مثل: ChatGPT) أو اختر أحد الأزرار السريعة أدناه.</p>`;
  }

  function answerFor(rawText) {
    const text = normalizeText(rawText);
    const app = findApp(rawText);
    const has = (...words) => words.some((word) => text.includes(normalizeText(word)));
    const hasWord = (...words) => words.some((word) => {
      const clean = normalizeText(word);
      return clean ? new RegExp(`(^|\\s)${clean}(\\s|$)`).test(text) : false;
    });

    if (has('عرض', 'عروض', 'خصم', 'خصومات', 'تخفيض')) return offersAnswer();
    if (hasWord('كم') || has('سعر', 'اسعار', 'بكم', 'تكلفه', 'تكلفة', 'ثمن')) {
      return app ? appAnswer(app) : pricesAnswer();
    }
    if (has('ميزه', 'ميزات', 'مميزات', 'مزايا', 'ميزة', 'features')) {
      return app ? appAnswer(app) : featuresAnswer();
    }
    if (has('تواصل', 'واتساب', 'رقم', 'اتصال', 'كلمني', 'راسل')) return contactAnswer();
    if (has('اشتراك', 'اشترك', 'طلب', 'شراء', 'كيف', 'خطوات', 'طريقه')) return stepsAnswer();
    if (has('تسليم', 'مده', 'مدة', 'وقت', 'متى', 'فوري')) return deliveryAnswer();
    if (app) return appAnswer(app);
    if (has('مرحبا', 'السلام', 'اهلا', 'هلا', 'هاي', 'صباح', 'مساء')) {
      return `<p>${esc(state.settings.assistantGreeting || 'أهلاً بك 👋 كيف أساعدك اليوم؟')}</p>${pricesAnswer()}`;
    }
    if (has('شكرا', 'مشكور', 'الله يعطيك')) {
      return '<p>على الرحب والسعة 🌟 أنا هنا دائماً لخدمتك. يمكنك سؤالي عن أي اشتراك أو عرض.</p>';
    }
    return fallbackAnswer();
  }

  function scrollAssistant() {
    const body = $('#assistantBody');
    if (body) body.scrollTop = body.scrollHeight;
  }

  function addAssistantMessage(role, html, actions = []) {
    const body = $('#assistantBody');
    if (!body) return;
    const wrapper = document.createElement('div');
    wrapper.className = `msg ${role === 'user' ? 'user' : 'bot'}`;
    wrapper.innerHTML = role === 'user'
      ? `<div class="msg-bubble">${esc(html)}</div>`
      : `<span class="msg-avatar" aria-hidden="true"><svg class="icon"><use href="#i-bot"/></svg></span>
         <div class="msg-bubble">${html}${actions.length ? `<div class="msg-actions">${actions.map((a) => `<button class="msg-action" type="button" data-assistant-send="${esc(a.send || a.label)}">${esc(a.label)}</button>`).join('')}</div>` : ''}</div>`;
    body.appendChild(wrapper);
    scrollAssistant();
  }

  function showTyping() {
    const body = $('#assistantBody');
    if (!body) return null;
    const el = document.createElement('div');
    el.className = 'msg bot';
    el.dataset.typing = '1';
    el.innerHTML = '<span class="msg-avatar" aria-hidden="true"><svg class="icon"><use href="#i-bot"/></svg></span><div class="msg-bubble"><span class="typing" aria-label="يكتب"><i></i><i></i><i></i></span></div>';
    body.appendChild(el);
    scrollAssistant();
    return el;
  }

  const delay = (ms) => new Promise((resolve) => { window.setTimeout(resolve, ms); });

  async function assistantReply(text) {
    if (assistant.busy) return;
    assistant.busy = true;
    addAssistantMessage('user', text);
    const typing = showTyping();
    await delay(reduceMotion ? 120 : 520);
    if (typing) typing.remove();
    addAssistantMessage('bot', answerFor(text));
    assistant.busy = false;
  }

  function renderQuickReplies() {
    const host = $('#assistantQuick');
    if (!host) return;
    const items = ['الأسعار', 'العروض', 'المزايا', 'طريقة الاشتراك', 'تواصل معي'];
    host.innerHTML = items.map((label) => `<button type="button" data-assistant-send="${esc(label)}">${esc(label)}</button>`).join('');
  }

  function greetAssistant() {
    if (assistant.started) return;
    assistant.started = true;
    const greeting = state.settings.assistantGreeting
      || `أهلاً وسهلاً بك في ${state.settings.siteName || 'Hussam-Ai'} 👋 أنا مساعدك الذكي.`;
    addAssistantMessage('bot', `<p>${esc(greeting)}</p><p>يمكنني أن أعرض لك <strong>الأسعار</strong> و<strong>العروض</strong> و<strong>المزايا</strong> و<strong>طريقة الاشتراك</strong>.</p>`, [
      { label: 'الأسعار', send: 'الأسعار' },
      { label: 'العروض', send: 'العروض' },
      { label: 'كيف أشترك؟', send: 'طريقة الاشتراك' },
    ]);
    renderQuickReplies();
  }

  function openAssistant() {
    const panel = $('#assistantPanel');
    const launcher = $('#assistantLauncher');
    if (!panel) return;
    if (state.settings.assistantEnabled === false) {
      toast('المساعد الآلي غير مفعّل حالياً — تواصل معنا عبر واتساب', 'error');
      return;
    }
    hideTeaser();
    greetAssistant();
    assistant.open = true;
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    $('#assistant')?.classList.add('is-open');
    if (launcher) launcher.setAttribute('aria-expanded', 'true');
    const dot = $('#assistantDot');
    if (dot) dot.hidden = true;
    window.setTimeout(() => $('#assistantInput')?.focus(), 220);
  }

  function closeAssistant() {
    const panel = $('#assistantPanel');
    const launcher = $('#assistantLauncher');
    if (!panel) return;
    assistant.open = false;
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    $('#assistant')?.classList.remove('is-open');
    if (launcher) launcher.setAttribute('aria-expanded', 'false');
  }

  function toggleAssistant() {
    if (assistant.open) closeAssistant();
    else openAssistant();
  }

  function hideTeaser() {
    const teaser = $('#assistantTeaser');
    if (teaser) teaser.hidden = true;
    assistant.teaserDismissed = true;
  }

  function showTeaser() {
    const teaser = $('#assistantTeaser');
    if (!teaser || assistant.open || assistant.teaserDismissed) return;
    if (state.settings.assistantEnabled === false) return;
    teaser.hidden = false;
    const dot = $('#assistantDot');
    if (dot) dot.hidden = false;
  }

  function applyAssistantSetting() {
    const launcher = $('#assistantLauncher');
    if (!launcher) return;
    const enabled = state.settings.assistantEnabled !== false;
    launcher.hidden = !enabled;
    if (!enabled) {
      closeAssistant();
      hideTeaser();
    }
  }

  function sendAssistantText(text) {
    const value = String(text || '').trim();
    if (!value) return;
    const input = $('#assistantInput');
    if (input) input.value = '';
    assistantReply(value);
  }

  function initAssistant() {
    applyAssistantSetting();
    renderQuickReplies();

    $('#assistantLauncher')?.addEventListener('click', toggleAssistant);
    $('#assistantClose')?.addEventListener('click', closeAssistant);
    $$('[data-open-assistant]').forEach((button) => {
      button.addEventListener('click', openAssistant);
    });
    $('#assistantTeaser')?.addEventListener('click', openAssistant);
    $('#assistantTeaserClose')?.addEventListener('click', (event) => {
      event.stopPropagation();
      hideTeaser();
    });

    $('#assistantForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      sendAssistantText($('#assistantInput')?.value || '');
    });

    $('#assistantBody')?.addEventListener('click', (event) => {
      const action = event.target.closest('[data-assistant-send]');
      if (action) sendAssistantText(action.dataset.assistantSend);
    });

    $('#assistantQuick')?.addEventListener('click', (event) => {
      const action = event.target.closest('[data-assistant-send]');
      if (action) sendAssistantText(action.dataset.assistantSend);
    });

    if (state.settings.assistantEnabled !== false) {
      window.setTimeout(() => {
        if (!assistant.open) showTeaser();
      }, 6500);
    }
  }

  /* ---------- الأحداث ---------- */
  function bindEvents() {
    /* الترويسة */
    window.addEventListener('scroll', () => {
      const header = $('#siteHeader');
      if (header) header.classList.toggle('is-scrolled', window.scrollY > 8);
    }, { passive: true });

    $('#cartTrigger')?.addEventListener('click', openCart);
    $('#mobileCartOpen')?.addEventListener('click', openCart);
    $('#cartClose')?.addEventListener('click', closeCart);
    $('#cartScrim')?.addEventListener('click', closeCart);
    $('#checkoutBtn')?.addEventListener('click', checkout);

    $('#cartBody')?.addEventListener('click', (event) => {
      const qtyBtn = event.target.closest('[data-qty]');
      if (qtyBtn) {
        setQty(qtyBtn.dataset.qty, Number(qtyBtn.dataset.delta) || 0);
        return;
      }
      const removeBtn = event.target.closest('[data-remove]');
      if (removeBtn) {
        removeFromCart(removeBtn.dataset.remove);
        return;
      }
      if (event.target.closest('[data-close-cart]')) closeCart();
    });

    /* التطبيقات */
    $('#appsGrid')?.addEventListener('click', (event) => {
      const addBtn = event.target.closest('[data-add]');
      if (addBtn) addToCart(addBtn.dataset.add);
    });

    $('#gamesGrid')?.addEventListener('click', (event) => {
      const addBtn = event.target.closest('[data-add]');
      if (addBtn) addToCart(addBtn.dataset.add);
    });

    $('#searchInput')?.addEventListener('input', (event) => {
      state.query = event.target.value;
      renderApps();
    });

    $('#categoryChips')?.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-cat]');
      if (!chip) return;
      state.filter = chip.dataset.cat;
      renderChips();
      renderApps();
    });

    $('#resetFilters')?.addEventListener('click', () => {
      state.filter = 'all';
      state.query = '';
      const search = $('#searchInput');
      if (search) search.value = '';
      renderChips();
      renderApps();
    });

    /* لوحة التحكم */
    $('#adminTrigger')?.addEventListener('click', openAdmin);
    $('#adminTriggerFooter')?.addEventListener('click', openAdmin);
    $('#adminClose')?.addEventListener('click', closeAdmin);
    $('#adminScrim')?.addEventListener('click', closeAdmin);
    $('#loginForm')?.addEventListener('submit', login);
    $('#passwordToggle')?.addEventListener('click', () => {
      const input = $('#loginPassword');
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
      input.focus();
    });

    $$('.admin-tab').forEach((tab) => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    $('#addAppBtn')?.addEventListener('click', () => openEditor(null));
    $('#appForm')?.addEventListener('submit', saveApp);
    $('#editorClose')?.addEventListener('click', closeEditor);
    $('#editorCancel')?.addEventListener('click', closeEditor);

    /* صورة التطبيق */
    $('#appImageInput')?.addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0];
      handleImageFile(file);
    });
    $('#appImageUrl')?.addEventListener('change', applyImageUrl);
    $('#appImageUrl')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); applyImageUrl(); }
    });
    $('#appImageClear')?.addEventListener('click', () => {
      setEditorImage('');
      const input = $('#appImageInput');
      if (input) input.value = '';
      setImageHint('تمت إزالة الصورة.');
    });
    $('#appCategory')?.addEventListener('change', (event) => {
      if (event.target.value === OFFERS_CATEGORY) {
        const offer = $('#appOffer');
        if (offer) offer.checked = true;
      }
    });

    $('#adminAppsList')?.addEventListener('click', (event) => {
      const editBtn = event.target.closest('[data-edit]');
      if (editBtn) {
        const app = state.admin.data?.apps.find((item) => item.id === editBtn.dataset.edit);
        if (app) openEditor(app);
        return;
      }
      const deleteBtn = event.target.closest('[data-delete]');
      if (deleteBtn) deleteApp(deleteBtn.dataset.delete);
    });

    $('#adminOrders')?.addEventListener('click', (event) => {
      const deleteBtn = event.target.closest('[data-order-delete]');
      if (deleteBtn) deleteOrder(deleteBtn.dataset.orderDelete);
    });

    $('#refreshOrdersBtn')?.addEventListener('click', async () => {
      try {
        await loadAdminData();
        switchTab('orders');
        toast('تم تحديث الطلبات');
      } catch (error) {
        if (error.status === 401) return handleSessionExpired();
        toast(error.message, 'error');
      }
    });

    $('#settingsForm')?.addEventListener('submit', saveSettings);
    $('#passwordForm')?.addEventListener('submit', changePassword);
    $('#resetStatsBtn')?.addEventListener('click', resetStats);
    $('#logoutBtn')?.addEventListener('click', logout);

    /* لوحة المفاتيح */
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      const editor = $('#appEditor');
      if (editor && !editor.hidden) { closeEditor(); return; }
      if (isAdminOpen()) { closeAdmin(); return; }
      if (assistant.open) { closeAssistant(); return; }
      closeCart();
    });
  }

  /* ---------- ظهور العناصر ---------- */
  function initReveal() {
    const items = $$('.reveal');
    if (reduceMotion || !('IntersectionObserver' in window)) {
      items.forEach((item) => item.classList.add('in'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    items.forEach((item) => observer.observe(item));
  }

  /* ---------- التشغيل ---------- */
  function init() {
    initTheme();
    state.cart = readCart();
    bindEvents();
    renderCart();
    initReveal();
    initAssistant();
    loadPublic().then(() => {
      applyAssistantSetting();
      countVisit();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
