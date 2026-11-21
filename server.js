'use strict';

/**
 * Hussam-Ai — منصة مبيعات اشتراكات تطبيقات الذكاء الاصطناعي
 * خادم Node.js بدون أي حزم خارجية (لا حاجة لـ npm install).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
const UPLOADS_URL = '/uploads';
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const INITIAL_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Hussam@2026';
const MAX_BODY = 1024 * 1024;
const MAX_UPLOAD = 5 * 1024 * 1024;
const MAX_STOCK = 9999;

/* ------------------------------------------------------------------ */
/*  أدوات مساعدة                                                       */
/* ------------------------------------------------------------------ */

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, stored) {
  if (!stored || !stored.salt || !stored.hash) return false;
  const actual = crypto.scryptSync(String(password), stored.salt, 64);
  const expected = Buffer.from(stored.hash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

const str = (value, max) => String(value == null ? '' : value).split('\u0000').join('').trim().slice(0, max);

function digitsOnly(value) {
  return String(value == null ? '' : value).replace(/\D+/g, '').slice(0, 15);
}

function safeColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || '')) ? String(value) : '#2563EB';
}

const ICONS = ['sparkles', 'bot', 'brain', 'image', 'search', 'code', 'wand', 'layers', 'pen', 'bolt'];
const CATEGORIES = ['محادثة', 'صور', 'برمجة', 'بحث', 'ألعاب', 'العروض', 'أخرى'];
const OFFERS_CATEGORY = 'العروض';
const IMAGE_TYPES = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/* ------------------------------------------------------------------ */
/*  التخزين                                                            */
/* ------------------------------------------------------------------ */

function seedData() {
  const now = Date.now();
  return {
    secret: crypto.randomBytes(32).toString('hex'),
    createdAt: now,
    settings: {
      siteName: 'Hussam-Ai',
      tagline: 'اشتراكات الذكاء الاصطناعي الأصلية — أسعار واضحة وتسليم فوري',
      heroTitle: 'كل تطبيقات الذكاء الاصطناعي التي تحتاجها… في مكان واحد',
      heroText:
        'اختر التطبيق الذي يناسبك، أضفه إلى السلة، وأتمم اشتراكك عبر واتساب خلال دقائق. أسعار منافسة، بدون وسطاء، ودعم بشري في كل خطوة.',
      announcement: 'تسليم فوري خلال دقائق • دعم مباشر عبر واتساب • أسعار قابلة للتحديث',
      whatsapp: '966500000000',
      currency: 'ر.س',
      assistantEnabled: true,
      assistantGreeting: 'أهلاً وسهلاً بك في Hussam-Ai 👋 أنا مساعدك الذكي، أستطيع أن أعرض لك الأسعار والمزايا والعروض وطريقة الاشتراك.',
      password: hashPassword(INITIAL_ADMIN_PASSWORD),
    },
    stats: { visits: 0, visitors: 0, orders: 0 },
    seenVisitors: [],
    apps: [
      {
        id: crypto.randomUUID(),
        name: 'ChatGPT Plus',
        vendor: 'OpenAI',
        category: 'محادثة',
        description: 'وصول كامل لأحدث نماذج GPT مع توليد الصور والبحث والتصفح الذكي.',
        price: 79,
        oldPrice: 99,
        duration: 'شهري',
        badge: 'الأكثر مبيعاً',
        color: '#10A37F',
        icon: 'sparkles',
        features: ['أحدث نماذج GPT', 'توليد وتحليل الصور', 'تصفح وبحث متقدم', 'أولوية عند الضغط'],
        active: true,
        stock: 12,
        offer: true,
        offerText: 'خصم 20% لأول 12 مشترك',
        image: '',
        createdAt: now - 60000,
      },
      {
        id: crypto.randomUUID(),
        name: 'Claude Pro',
        vendor: 'Anthropic',
        category: 'محادثة',
        description: 'مساعد كتابة وتحليل بسياق طويل جداً ودقة عالية في الملفات والأكواد.',
        price: 89,
        oldPrice: 109,
        duration: 'شهري',
        badge: 'مفضّل المحترفين',
        color: '#D97757',
        icon: 'brain',
        features: ['سياق طويل جداً', 'تحليل ملفات وكود', 'كتابة احترافية', 'استجابة سريعة'],
        active: true,
        stock: 8,
        offer: false,
        offerText: '',
        image: '',
        createdAt: now - 50000,
      },
      {
        id: crypto.randomUUID(),
        name: 'Gemini Advanced',
        vendor: 'Google',
        category: 'محادثة',
        description: 'قوة Gemini المتقدمة مدمجة مع خدمات Google وأدوات التحليل والصور.',
        price: 65,
        oldPrice: 85,
        duration: 'شهري',
        badge: '',
        color: '#4285F4',
        icon: 'bot',
        features: ['أحدث نماذج Gemini', 'تكامل مع Google', 'تحليل مستندات', 'مساحة تخزين إضافية'],
        active: true,
        stock: 6,
        offer: true,
        offerText: 'عرض محدود: 3 أشهر بسعر شهرين',
        image: '',
        createdAt: now - 40000,
      },
      {
        id: crypto.randomUUID(),
        name: 'Midjourney',
        vendor: 'Midjourney',
        category: 'صور',
        description: 'توليد صور فنية فائقة الجودة من وصف نصي، بأسلوب سينمائي مذهل.',
        price: 99,
        oldPrice: 125,
        duration: 'شهري',
        badge: 'جودة خيالية',
        color: '#7C3AED',
        icon: 'image',
        features: ['صور بدقة عالية', 'أنماط فنية متعددة', 'تحرير وتوسيع الصور', 'استخدام تجاري'],
        active: true,
        stock: 5,
        offer: true,
        offerText: 'خصم 15% على الاشتراك السنوي',
        image: '',
        createdAt: now - 30000,
      },
      {
        id: crypto.randomUUID(),
        name: 'Perplexity Pro',
        vendor: 'Perplexity',
        category: 'بحث',
        description: 'محرك بحث ذكي يجيب بمصادر موثقة ويوفّر عليك ساعات من التنقيب.',
        price: 55,
        oldPrice: 70,
        duration: 'شهري',
        badge: '',
        color: '#20808D',
        icon: 'search',
        features: ['إجابات بمصادر', 'بحث معمّق', 'رفع ملفات', 'نماذج متعددة'],
        active: true,
        stock: 15,
        offer: false,
        offerText: '',
        image: '',
        createdAt: now - 20000,
      },
      {
        id: crypto.randomUUID(),
        name: 'GitHub Copilot',
        vendor: 'GitHub',
        category: 'برمجة',
        description: 'مساعد برمجي ذكي يكمل كودك ويشرحه ويساعدك على إصلاح الأخطاء بسرعة.',
        price: 69,
        oldPrice: 85,
        duration: 'شهري',
        badge: 'للمطورين',
        color: '#6E7681',
        icon: 'code',
        features: ['إكمال ذكي للكود', 'شرح وتحسين الدوال', 'دعم أشهر المحررات', 'اقتراحات فورية'],
        active: true,
        stock: 20,
        offer: false,
        offerText: '',
        image: '',
        createdAt: now - 10000,
      },
    ],
    orders: [],
  };
}

function clampStock(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(MAX_STOCK, Math.floor(number)));
}

function safeImagePath(value) {
  const candidate = str(value, 300);
  if (!candidate) return '';
  if (/^https?:\/\/[^\s"'<>]+$/i.test(candidate)) return candidate.slice(0, 300);
  if (candidate.startsWith(UPLOADS_URL + '/') && !candidate.includes('..')) return candidate;
  return '';
}

function migrateApp(app) {
  const base = app && typeof app === 'object' ? app : {};
  const stock = base.stock === undefined || base.stock === null ? 10 : clampStock(base.stock);
  return {
    ...base,
    stock,
    offer: base.offer === true || base.category === OFFERS_CATEGORY,
    offerText: str(base.offerText, 90),
    image: safeImagePath(base.image),
  };
}

function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('bad data');
    parsed.apps = Array.isArray(parsed.apps) ? parsed.apps.map(migrateApp) : [];
    parsed.orders = Array.isArray(parsed.orders) ? parsed.orders : [];
    parsed.seenVisitors = Array.isArray(parsed.seenVisitors) ? parsed.seenVisitors : [];
    parsed.stats = parsed.stats || { visits: 0, visitors: 0, orders: 0 };
    parsed.settings = parsed.settings || {};
    return parsed;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('[Hussam-Ai] تعذّر قراءة ملف البيانات، سيتم إنشاء ملف جديد:', error.message);
    }
    const fresh = seedData();
    // استخدم نسخة البداية إن وُجدت (بدون الأسرار) عند أول تشغيل على استضافة جديدة
    try {
      const seedPath = path.join(DATA_DIR, 'seed.json');
      if (fs.existsSync(seedPath)) {
        const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
        if (Array.isArray(seed.apps)) fresh.apps = seed.apps.map(migrateApp);
        if (Array.isArray(seed.orders)) fresh.orders = seed.orders;
        if (seed.stats) fresh.stats = seed.stats;
        if (seed.settings) fresh.settings = { ...fresh.settings, ...seed.settings };
      }
    } catch (error) {
      console.warn('[Hussam-Ai] تعذّر قراءة seed.json:', error.message);
    }
    fresh.secret = crypto.randomBytes(32).toString('hex');
    fresh.settings.password = hashPassword(INITIAL_ADMIN_PASSWORD);
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(fresh, null, 2), 'utf8');
    return fresh;
  }
}

let data = loadData();

const GIST_ID = process.env.GIST_ID || '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

async function loadFromGist() {
  if (!GIST_ID || !GITHUB_TOKEN) return;
  const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, 'User-Agent': 'hussam-ai', Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new Error(`gist fetch: ${response.status}`);
  const gist = await response.json();
  const file = gist.files && gist.files['store.json'];
  if (!file || !file.content) return;
  fs.writeFileSync(DATA_FILE, file.content, 'utf8');
  data = loadData();
  console.log('[Hussam-Ai] تم تحميل البيانات من التخزين السحابي');
}

function syncToGist() {
  if (!GIST_ID || !GITHUB_TOKEN) return;
  fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'hussam-ai',
      Accept: 'application/vnd.github+json',
    },
    body: JSON.stringify({ files: { 'store.json': { content: JSON.stringify(data, null, 2) } } }),
  }).then((response) => {
    if (!response.ok) console.warn('[Hussam-Ai] تعذّر حفظ البيانات سحابياً:', response.status);
  }).catch((error) => console.warn('[Hussam-Ai] تعذّر حفظ البيانات سحابياً:', error.message));
}

function saveData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
  syncToGist();
}

if (!data.settings.password) {
  data.settings.password = hashPassword(INITIAL_ADMIN_PASSWORD);
  saveData();
}

/* ------------------------------------------------------------------ */
/*  المصادقة                                                           */
/* ------------------------------------------------------------------ */

function createToken() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 8 * 60 * 60 * 1000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', data.secret).update(payload).digest('base64url');
  return payload + '.' + sig;
}

function verifyToken(token) {
  if (typeof token !== 'string' || token.indexOf('.') === -1) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = crypto.createHmac('sha256', data.secret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number(parsed.exp) > Date.now();
  } catch {
    return false;
  }
}

const loginAttempts = new Map();

function clientIp(req) {
  return (req.socket.remoteAddress || 'unknown').replace('::ffff:', '');
}

function checkLoginLimit(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry) return;
  if (entry.blockedUntil > Date.now()) {
    throw new HttpError(429, 'محاولات كثيرة. حاول مرة أخرى بعد بضع دقائق.');
  }
}

function registerFailure(ip) {
  const entry = loginAttempts.get(ip) || { count: 0, blockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= 8) {
    entry.blockedUntil = Date.now() + 10 * 60 * 1000;
    entry.count = 0;
  }
  loginAttempts.set(ip, entry);
}

/* ------------------------------------------------------------------ */
/*  التحقق من المدخلات                                                 */
/* ------------------------------------------------------------------ */

function normalizeApp(input, existing) {
  const name = str(input.name, 80);
  if (!name) throw new HttpError(400, 'اسم التطبيق مطلوب');

  const price = Number(input.price);
  if (!Number.isFinite(price) || price < 0 || price > 1000000) {
    throw new HttpError(400, 'السعر غير صالح');
  }

  let oldPrice = Number(input.oldPrice);
  if (!Number.isFinite(oldPrice) || oldPrice < 0 || oldPrice > 1000000) oldPrice = 0;

  const features = Array.isArray(input.features)
    ? input.features.map((item) => str(item, 90)).filter(Boolean).slice(0, 6)
    : [];

  const category = CATEGORIES.includes(str(input.category, 20)) ? str(input.category, 20) : 'أخرى';
  const icon = ICONS.includes(str(input.icon, 20)) ? str(input.icon, 20) : 'sparkles';

  const base = existing || {};
  const stock = input.stock === undefined || input.stock === ''
    ? (base.stock === undefined ? 10 : clampStock(base.stock))
    : clampStock(input.stock);

  const offer = input.offer === true || category === OFFERS_CATEGORY;

  return {
    id: base.id || crypto.randomUUID(),
    name,
    vendor: str(input.vendor, 40) || 'AI',
    category,
    description: str(input.description, 400),
    price: Math.round(price * 100) / 100,
    oldPrice: Math.round(oldPrice * 100) / 100,
    duration: str(input.duration, 24) || 'شهري',
    badge: str(input.badge, 32),
    color: safeColor(input.color),
    icon,
    features,
    stock,
    offer,
    offerText: str(input.offerText, 90),
    image: safeImagePath(input.image),
    active: input.active !== false,
    createdAt: base.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
}

/* ---------- إدارة ملفات الصور ---------- */

function removeUploadedImage(value) {
  const imagePath = safeImagePath(value);
  if (!imagePath.startsWith(UPLOADS_URL + '/')) return;
  const filename = path.basename(imagePath);
  if (!filename) return;
  const target = path.join(UPLOADS_DIR, filename);
  const relative = path.relative(UPLOADS_DIR, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return;
  fs.promises.unlink(target).catch(() => {});
}

async function saveUploadedImage(dataUrl) {
  const text = String(dataUrl || '');
  const match = /^data:(image\/[a-zA-Z+]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(text);
  if (!match) throw new HttpError(400, 'صيغة الصورة غير مدعومة');

  const mime = match[1].toLowerCase();
  const extension = IMAGE_TYPES[mime];
  if (!extension) throw new HttpError(400, 'الصيغة المدعومة: PNG أو JPG أو WEBP أو GIF');

  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (!buffer.length) throw new HttpError(400, 'الملف فارغ');
  if (buffer.length > MAX_UPLOAD) throw new HttpError(413, 'حجم الصورة يجب أن يكون أقل من 5 ميجابايت');

  await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });
  const filename = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}${extension}`;
  await fs.promises.writeFile(path.join(UPLOADS_DIR, filename), buffer);
  return `${UPLOADS_URL}/${filename}`;
}

/* ------------------------------------------------------------------ */
/*  الاستجابات                                                         */
/* ------------------------------------------------------------------ */

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, 'حجم الطلب كبير جداً'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (!text) return resolve({});
      try {
        const parsed = JSON.parse(text);
        resolve(parsed && typeof parsed === 'object' ? parsed : {});
      } catch {
        reject(new HttpError(400, 'صيغة الطلب غير صالحة'));
      }
    });
    req.on('error', reject);
  });
}

function requireAuth(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!verifyToken(token)) throw new HttpError(401, 'انتهت الجلسة، يرجى تسجيل الدخول من جديد');
}

function publicSettings() {
  const s = data.settings;
  return {
    siteName: s.siteName || 'Hussam-Ai',
    tagline: s.tagline || '',
    heroTitle: s.heroTitle || '',
    heroText: s.heroText || '',
    announcement: s.announcement || '',
    whatsapp: s.whatsapp || '',
    currency: s.currency || 'ر.س',
    assistantEnabled: s.assistantEnabled !== false,
    assistantGreeting: s.assistantGreeting || '',
  };
}

/* ------------------------------------------------------------------ */
/*  نقاط الـ API                                                       */
/* ------------------------------------------------------------------ */

async function handleApi(req, res, url) {
  const method = req.method || 'GET';
  const route = url.pathname;

  /* ---------- عام ---------- */
  if (route === '/api/public' && method === 'GET') {
    return json(res, 200, {
      settings: publicSettings(),
      apps: data.apps
        .filter((app) => app.active)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(({ updatedAt, ...rest }) => rest),
      stats: {
        visits: data.stats.visits || 0,
        visitors: data.stats.visitors || 0,
        apps: data.apps.filter((app) => app.active).length,
        offers: data.apps.filter((app) => app.active && (app.offer || app.category === OFFERS_CATEGORY)).length,
      },
    });
  }

  if (route === '/api/visit' && method === 'POST') {
    const body = await readBody(req);
    const clientId = str(body.clientId, 80).replace(/[^a-zA-Z0-9_-]/g, '');
    data.stats.visits = (data.stats.visits || 0) + 1;

    if (clientId && !data.seenVisitors.includes(clientId)) {
      data.seenVisitors.push(clientId);
      data.stats.visitors = (data.stats.visitors || 0) + 1;
      if (data.seenVisitors.length > 30000) data.seenVisitors.splice(0, 5000);
    }
    saveData();
    return json(res, 200, { visits: data.stats.visits, visitors: data.stats.visitors });
  }

  if (route === '/api/orders' && method === 'POST') {
    const body = await readBody(req);
    const rawItems = Array.isArray(body.items) ? body.items.slice(0, 30) : [];
    const items = [];

    for (const raw of rawItems) {
      const app = data.apps.find((item) => item.id === String(raw.id) && item.active);
      if (!app) continue;
      const available = clampStock(app.stock);
      if (available <= 0) continue;
      const requested = Math.min(20, Math.max(1, parseInt(raw.qty, 10) || 1));
      const qty = Math.min(requested, available);
      items.push({ id: app.id, name: app.name, price: app.price, qty });
    }

    if (!items.length) throw new HttpError(400, 'السلة فارغة أو الكميات غير متاحة حالياً');

    /* خصم الكمية من المخزون تلقائياً بعد تثبيت الطلب */
    for (const item of items) {
      const app = data.apps.find((entry) => entry.id === item.id);
      if (app) app.stock = Math.max(0, clampStock(app.stock) - item.qty);
    }

    const total = Math.round(items.reduce((sum, item) => sum + item.price * item.qty, 0) * 100) / 100;
    const order = {
      id: crypto.randomUUID(),
      items,
      total,
      currency: data.settings.currency || 'ر.س',
      name: str(body.name, 80),
      phone: digitsOnly(body.phone),
      note: str(body.note, 400),
      channel: 'whatsapp',
      createdAt: Date.now(),
    };

    data.orders.push(order);
    if (data.orders.length > 500) data.orders.splice(0, data.orders.length - 500);
    data.stats.orders = (data.stats.orders || 0) + 1;
    saveData();

    const soldOut = items
      .map((item) => data.apps.find((entry) => entry.id === item.id))
      .filter((app) => app && clampStock(app.stock) === 0)
      .map((app) => app.name);

    return json(res, 201, {
      ok: true,
      orderId: order.id,
      stock: items.map((item) => {
        const app = data.apps.find((entry) => entry.id === item.id);
        return { id: item.id, stock: app ? clampStock(app.stock) : 0 };
      }),
      soldOut,
    });
  }

  /* ---------- المصادقة ---------- */
  if (route === '/api/admin/login' && method === 'POST') {
    const ip = clientIp(req);
    checkLoginLimit(ip);
    const body = await readBody(req);
    const password = String(body.password || '');

    if (!verifyPassword(password, data.settings.password)) {
      registerFailure(ip);
      throw new HttpError(401, 'كلمة المرور غير صحيحة');
    }
    loginAttempts.delete(ip);
    return json(res, 200, { token: createToken(), expiresIn: 8 * 60 * 60 });
  }

  /* ---------- من هنا: يتطلب مصادقة ---------- */
  if (route.startsWith('/api/admin/')) {
    requireAuth(req);
  }

  if (route === '/api/admin/data' && method === 'GET') {
    const { password, ...settings } = data.settings;
    return json(res, 200, {
      settings,
      apps: [...data.apps].sort((a, b) => b.createdAt - a.createdAt),
      stats: data.stats,
      orders: [...data.orders].reverse().slice(0, 100),
    });
  }

  if (route === '/api/admin/apps' && method === 'POST') {
    const body = await readBody(req);
    const app = normalizeApp(body, null);
    data.apps.push(app);
    saveData();
    return json(res, 201, { app });
  }

  if (route === '/api/admin/upload' && method === 'POST') {
    const body = await readBody(req, Math.ceil(MAX_UPLOAD * 1.4) + 4096);
    const previous = safeImagePath(body.previous);
    const url = await saveUploadedImage(body.dataUrl);
    if (previous && previous !== url) removeUploadedImage(previous);
    return json(res, 201, { url });
  }

  if (route.startsWith('/api/admin/apps/')) {
    const id = decodeURIComponent(route.slice('/api/admin/apps/'.length));
    const index = data.apps.findIndex((item) => item.id === id);
    if (index === -1) throw new HttpError(404, 'التطبيق غير موجود');

    if (method === 'PUT') {
      const body = await readBody(req);
      const previousImage = data.apps[index].image;
      const app = normalizeApp(body, data.apps[index]);
      data.apps[index] = app;
      saveData();
      if (previousImage && previousImage !== app.image) removeUploadedImage(previousImage);
      return json(res, 200, { app });
    }

    if (method === 'DELETE') {
      const [removed] = data.apps.splice(index, 1);
      saveData();
      if (removed) removeUploadedImage(removed.image);
      return json(res, 200, { ok: true });
    }
  }

  if (route === '/api/admin/settings' && method === 'PATCH') {
    const body = await readBody(req);
    const s = data.settings;

    if (body.siteName !== undefined) {
      const name = str(body.siteName, 40);
      if (!name) throw new HttpError(400, 'اسم المنصة مطلوب');
      s.siteName = name;
    }
    if (body.tagline !== undefined) s.tagline = str(body.tagline, 160);
    if (body.heroTitle !== undefined) s.heroTitle = str(body.heroTitle, 200);
    if (body.heroText !== undefined) s.heroText = str(body.heroText, 400);
    if (body.announcement !== undefined) s.announcement = str(body.announcement, 200);
    if (body.currency !== undefined) s.currency = str(body.currency, 10) || 'ر.س';
    if (body.assistantEnabled !== undefined) s.assistantEnabled = body.assistantEnabled !== false;
    if (body.assistantGreeting !== undefined) s.assistantGreeting = str(body.assistantGreeting, 300);
    if (body.whatsapp !== undefined) {
      const number = digitsOnly(body.whatsapp);
      if (number.length < 8) throw new HttpError(400, 'رقم واتساب غير صالح (أدخل الرقم مع رمز الدولة)');
      s.whatsapp = number;
    }

    saveData();
    const { password, ...rest } = s;
    return json(res, 200, { settings: rest });
  }

  if (route === '/api/admin/password' && method === 'POST') {
    const body = await readBody(req);
    const current = String(body.current || '');
    const next = String(body.next || '');

    if (!verifyPassword(current, data.settings.password)) {
      throw new HttpError(400, 'كلمة المرور الحالية غير صحيحة');
    }
    if (next.length < 6) throw new HttpError(400, 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل');

    data.settings.password = hashPassword(next);
    saveData();
    return json(res, 200, { ok: true });
  }

  if (route === '/api/admin/stats/reset' && method === 'POST') {
    data.stats.visits = 0;
    data.stats.visitors = 0;
    data.seenVisitors = [];
    saveData();
    return json(res, 200, { stats: data.stats });
  }

  if (route.startsWith('/api/admin/orders/') && method === 'DELETE') {
    const id = decodeURIComponent(route.slice('/api/admin/orders/'.length));
    const before = data.orders.length;
    data.orders = data.orders.filter((order) => order.id !== id);
    if (data.orders.length === before) throw new HttpError(404, 'الطلب غير موجود');
    saveData();
    return json(res, 200, { ok: true });
  }

  if (route.startsWith('/api/admin/orders') && method === 'GET') {
    return json(res, 200, { orders: [...data.orders].reverse() });
  }

  throw new HttpError(404, 'المسار غير موجود');
}

/* ------------------------------------------------------------------ */
/*  الملفات الثابتة                                                    */
/* ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req, res, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    pathname = '/';
  }

  if (pathname === '/') pathname = '/index.html';

  const filePath = path.join(PUBLIC_DIR, path.normalize(pathname).replace(/^([/\\])+/, ''));
  const relative = path.relative(PUBLIC_DIR, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      if (pathname !== '/index.html' && !path.extname(pathname)) {
        // صفحات افتراضية -> الصفحة الرئيسية
        const fallback = path.join(PUBLIC_DIR, 'index.html');
        return fs.readFile(fallback, (err, content) => {
          if (err) return res.writeHead(404).end('Not found');
          res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
          res.end(content);
        });
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('الصفحة غير موجودة');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });

    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ------------------------------------------------------------------ */
/*  الخادم                                                             */
/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  let url;
  try {
    url = new URL(req.url || '/', 'http://localhost');
  } catch {
    return json(res, 400, { error: 'طلب غير صالح' });
  }

  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return json(res, 405, { error: 'الطريقة غير مسموحة' });
    }

    serveStatic(req, res, url);
  } catch (error) {
    if (res.headersSent) return;
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error('[Hussam-Ai]', error);
    json(res, status, { error: status === 500 ? 'حدث خطأ غير متوقع في الخادم' : error.message });
  }
});

loadFromGist().catch((error) => {
  console.warn('[Hussam-Ai] تعذّر تحميل البيانات من التخزين السحابي:', error.message);
}).finally(() => {
  server.listen(PORT, HOST, () => {
    const password = data.settings.password && verifyPassword(INITIAL_ADMIN_PASSWORD, data.settings.password)
      ? INITIAL_ADMIN_PASSWORD
      : '(كلمة المرور التي عيّنتها)';
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════╗');
    console.log('  ║            Hussam-Ai  •  منصة الاشتراكات          ║');
    console.log('  ╚══════════════════════════════════════════════════╝');
    console.log('  المتجر:      http://localhost:' + PORT);
    console.log('  لوحة التحكم: زر «لوحة التحكم» في الترويسة');
    console.log('  كلمة المرور: ' + password);
    console.log('');
  });
});
