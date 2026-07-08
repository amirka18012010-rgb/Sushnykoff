// ============================================================
// ПОЛНЫЙ SERVER.JS (better-sqlite3 + фото для категорий и брендов)
// ============================================================
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const Database = require('better-sqlite3');

// ---- Создаём папки ----
['./uploads', './uploads/backgrounds', './uploads/brands', './uploads/categories', './db'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Подключение к БД ----
const db = new Database('./db/database.sqlite');
db.pragma('foreign_keys = ON');

// ---- Создание таблиц (все, включая новые) ----
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    icon TEXT,
    image TEXT
  );

  CREATE TABLE IF NOT EXISTS brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    image TEXT,
    category_id INTEGER NOT NULL,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS volumes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    category_id INTEGER NOT NULL,
    brand_id INTEGER NOT NULL,
    volume_id INTEGER NOT NULL,
    image TEXT,
    description TEXT,
    avg_rating REAL DEFAULT 0,
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (brand_id) REFERENCES brands(id),
    FOREIGN KEY (volume_id) REFERENCES volumes(id)
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    login TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    is_blocked INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    items TEXT NOT NULL,
    total REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    payment_id TEXT,
    is_deleted INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    user_name TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS favorites (
    user_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, product_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    login TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
  );
`);

// ---- Начальные настройки ----
const defaultSettings = {
  about_text: 'Мы — команда энтузиастов, которые любят вкусные напитки.',
  contacts_address: 'г. Нальчик, Рынок Дубки 2/172',
  contacts_phone: '+7 (988) 936-97-30',
  contacts_email: 'kugotovaina@yandex.ru',
  contacts_schedule: 'Пн-Вс 8:00 – 17:00',
  site_background: ''
};
const stmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
Object.entries(defaultSettings).forEach(([key, val]) => stmt.run(key, val));

// ---- Админ ----
const adminLogin = process.env.ADMIN_LOGIN || 'admin';
const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
const adminStmt = db.prepare('INSERT OR IGNORE INTO admin (login, password) VALUES (?, ?)');
adminStmt.run(adminLogin, adminPass);

console.log('✅ База данных инициализирована (better-sqlite3)');

// ---- Middleware ----
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

app.use(session({
  secret: process.env.SESSION_SECRET || 'default_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

// ---- Multer ----
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadDir = './uploads';
    if (req.url.includes('background')) uploadDir = './uploads/backgrounds';
    else if (req.url.includes('brands')) uploadDir = './uploads/brands';
    else if (req.url.includes('categories')) uploadDir = './uploads/categories';
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// ---- Вспомогательные функции ----
function isAdmin(req) { return req.session && req.session.isAdmin; }
function isAuthenticated(req) { return req.session && req.session.userId; }
function isBlocked(userId) {
  const row = db.prepare('SELECT is_blocked FROM users WHERE id = ?').get(userId);
  return row ? row.is_blocked : 0;
}

// ============================================================
// МАРШРУТЫ ДЛЯ НОВОЙ СТРУКТУРЫ КАТАЛОГА
// ============================================================

// ---- 1. Категории (с иконками и фото) ----
app.get('/api/categories', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM categories ORDER BY name').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 2. Бренды по категории ----
app.get('/api/brands', (req, res) => {
  try {
    const { categoryId } = req.query;
    let sql = 'SELECT * FROM brands';
    const params = [];
    if (categoryId) {
      sql += ' WHERE category_id = ?';
      params.push(categoryId);
    }
    sql += ' ORDER BY name';
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 3. Получить бренд по ID ----
app.get('/api/brands/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM brands WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Бренд не найден' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 4. Уникальные объёмы для бренда ----
app.get('/api/volumes', (req, res) => {
  try {
    const { brandId } = req.query;
    if (!brandId) return res.json([]);
    const rows = db.prepare(`
      SELECT DISTINCT v.*
      FROM volumes v
      JOIN products p ON p.volume_id = v.id
      WHERE p.brand_id = ?
      ORDER BY v.sort_order, v.name
    `).all(brandId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 5. Товары с фильтром по бренду, объёму, категории, поиском ----
app.get('/api/products', (req, res) => {
  try {
    const { brandId, volumeId, category, search, page = 1, limit = 12 } = req.query;
    let sql = `
      SELECT p.*, c.name as category_name, b.name as brand_name, v.name as volume_name
      FROM products p
      JOIN categories c ON p.category_id = c.id
      JOIN brands b ON p.brand_id = b.id
      JOIN volumes v ON p.volume_id = v.id
    `;
    const params = [];
    const conditions = [];

    if (brandId) {
      conditions.push('p.brand_id = ?');
      params.push(brandId);
    }
    if (volumeId) {
      conditions.push('p.volume_id = ?');
      params.push(volumeId);
    }
    if (category && category !== 'all') {
      conditions.push('p.category_id = ?');
      params.push(category);
    }
    if (search && search.trim() !== '') {
      const words = search.trim().split(/\s+/).filter(w => w.length > 0);
      words.forEach(word => {
        conditions.push('(p.name LIKE ? COLLATE NOCASE OR p.description LIKE ? COLLATE NOCASE)');
        params.push('%' + word + '%', '%' + word + '%');
      });
    }

    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');

    const countStmt = db.prepare('SELECT COUNT(*) as total FROM products p' + (conditions.length ? ' WHERE ' + conditions.join(' AND ') : ''));
    const totalRow = countStmt.get(...params);
    const total = totalRow.total;
    const offset = (page - 1) * limit;
    sql += ' ORDER BY p.id DESC LIMIT ? OFFSET ?';
    const dataStmt = db.prepare(sql);
    const rows = dataStmt.all(...params, limit, offset);
    res.json({ items: rows, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 6. Получить товар по ID (с брендом и объёмом) ----
app.get('/api/products/:id', (req, res) => {
  try {
    const row = db.prepare(`
      SELECT p.*, c.name as category_name, b.name as brand_name, v.name as volume_name
      FROM products p
      JOIN categories c ON p.category_id = c.id
      JOIN brands b ON p.brand_id = b.id
      JOIN volumes v ON p.volume_id = v.id
      WHERE p.id = ?
    `).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Товар не найден' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 7. Отзывы (без изменений) ----
app.get('/api/products/:id/reviews', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM reviews WHERE product_id = ? ORDER BY created_at DESC').all(req.params.id);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products/:id/reviews', (req, res) => {
  try {
    const { user_name, rating, comment } = req.body;
    if (!user_name || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Заполните имя и рейтинг' });
    }
    const info = db.prepare('INSERT INTO reviews (product_id, user_name, rating, comment) VALUES (?, ?, ?, ?)')
      .run(req.params.id, user_name, rating, comment || '');
    const avgRow = db.prepare('SELECT AVG(rating) as avg FROM reviews WHERE product_id = ?').get(req.params.id);
    if (avgRow && avgRow.avg !== null) {
      db.prepare('UPDATE products SET avg_rating = ? WHERE id = ?').run(avgRow.avg, req.params.id);
    }
    res.json({ id: info.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 8. Избранное (без изменений) ----
app.get('/api/favorites', (req, res) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Необходимо войти' });
  try {
    const rows = db.prepare('SELECT product_id FROM favorites WHERE user_id = ?').all(req.session.userId);
    res.json(rows.map(r => r.product_id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/favorites', (req, res) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Необходимо войти' });
  const { productId } = req.body;
  if (!productId) return res.status(400).json({ error: 'Не указан товар' });
  try {
    db.prepare('INSERT OR IGNORE INTO favorites (user_id, product_id) VALUES (?, ?)').run(req.session.userId, productId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/favorites/:productId', (req, res) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Необходимо войти' });
  try {
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND product_id = ?').run(req.session.userId, req.params.productId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 9. Новости (без изменений) ----
app.get('/api/news/latest', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM news WHERE is_active = 1 ORDER BY created_at DESC LIMIT 3').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 10. Настройки (без изменений) ----
app.get('/api/settings', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    rows.forEach(row => settings[row.key] = row.value);
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 11. Уведомления (без изменений) ----
app.get('/api/notifications', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM notifications WHERE is_read = 0 ORDER BY created_at DESC').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notifications/read', (req, res) => {
  try {
    db.prepare('UPDATE notifications SET is_read = 1').run();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 12. Фон (без изменений) ----
app.get('/api/background', (req, res) => {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('site_background');
    res.json({ background: row ? row.value : '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 13. Аутентификация (без изменений) ----
app.post('/api/auth/register', async (req, res) => {
  try {
    const { firstName, lastName, login, password } = req.body;
    if (!firstName || !lastName || !login || !password) {
      return res.status(400).json({ error: 'Заполните все поля' });
    }
    const check = db.prepare('SELECT id FROM users WHERE login = ?').get(login);
    if (check) return res.status(400).json({ error: 'Логин уже занят' });
    const hashed = await bcrypt.hash(password, 10);
    const info = db.prepare('INSERT INTO users (first_name, last_name, login, password) VALUES (?, ?, ?, ?)')
      .run(firstName, lastName, login, hashed);
    req.session.userId = info.lastInsertRowid;
    res.json({ success: true, userId: info.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка регистрации' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { login, password } = req.body;
    if (!login || !password) return res.status(400).json({ error: 'Введите логин и пароль' });
    const user = db.prepare('SELECT * FROM users WHERE login = ?').get(login);
    if (!user) return res.status(401).json({ error: 'Неверный логин или пароль' });
    if (user.is_blocked) return res.status(403).json({ error: 'Ваш аккаунт заблокирован' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Неверный логин или пароль' });
    req.session.userId = user.id;
    res.json({ success: true, userId: user.id, firstName: user.first_name, lastName: user.last_name });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

app.get('/api/auth/me', (req, res) => {
  try {
    if (!isAuthenticated(req)) return res.json({ user: null });
    const user = db.prepare('SELECT id, first_name, last_name, login FROM users WHERE id = ?').get(req.session.userId);
    if (!user) { req.session.destroy(); return res.json({ user: null }); }
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.post('/api/auth/recover-login', (req, res) => {
  try {
    const { firstName, lastName } = req.body;
    if (!firstName || !lastName) return res.status(400).json({ error: 'Введите имя и фамилию' });
    const row = db.prepare('SELECT login FROM users WHERE first_name = ? AND last_name = ?').get(firstName, lastName);
    if (!row) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json({ login: row.login });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { firstName, lastName, login, newPassword } = req.body;
    if (!firstName || !lastName || !login || !newPassword) return res.status(400).json({ error: 'Заполните все поля' });
    const user = db.prepare('SELECT id FROM users WHERE first_name = ? AND last_name = ? AND login = ?').get(firstName, lastName, login);
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    const hashed = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 14. Корзина (без изменений) ----
app.get('/api/cart', (req, res) => res.json(req.session.cart || []));

app.post('/api/cart', (req, res) => {
  try {
    const { productId, quantity } = req.body;
    let cart = req.session.cart || [];
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    if (!product) return res.status(404).json({ error: 'Товар не найден' });
    const existing = cart.find(item => item.productId === productId);
    if (existing) {
      existing.quantity = quantity > 0 ? quantity : existing.quantity;
      if (quantity <= 0) cart = cart.filter(item => item.productId !== productId);
    } else if (quantity > 0) cart.push({ productId, quantity });
    req.session.cart = cart;
    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/cart/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    let cart = req.session.cart || [];
    cart = cart.filter(item => item.productId !== id);
    req.session.cart = cart;
    res.json(cart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 15. Заказы (без изменений) ----
app.post('/api/orders', (req, res) => {
  try {
    if (!isAuthenticated(req)) return res.status(401).json({ error: 'Необходимо войти' });
    if (isBlocked(req.session.userId)) return res.status(403).json({ error: 'Ваш аккаунт заблокирован' });
    const cart = req.session.cart || [];
    if (cart.length === 0) return res.status(400).json({ error: 'Корзина пуста' });
    const ids = cart.map(item => item.productId);
    const placeholders = ids.map(() => '?').join(',');
    const products = db.prepare(`SELECT * FROM products WHERE id IN (${placeholders})`).all(...ids);
    const productMap = {};
    products.forEach(p => productMap[p.id] = p);
    let total = 0;
    const orderItems = cart.map(item => {
      const product = productMap[item.productId];
      const price = product ? product.price : 0;
      total += price * item.quantity;
      return { productId: item.productId, name: product ? product.name : 'Неизвестно', price, quantity: item.quantity };
    });
    const info = db.prepare('INSERT INTO orders (user_id, items, total, status) VALUES (?, ?, ?, ?)')
      .run(req.session.userId, JSON.stringify(orderItems), total, 'pending');
    req.session.cart = [];
    res.json({ orderId: info.lastInsertRowid, total, message: 'Заказ создан' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/history', (req, res) => {
  try {
    if (!isAuthenticated(req)) return res.status(401).json({ error: 'Необходимо войти' });
    const rows = db.prepare('SELECT * FROM orders WHERE user_id = ? AND is_deleted = 0 ORDER BY created_at DESC')
      .all(req.session.userId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/orders/history', (req, res) => {
  try {
    if (!isAuthenticated(req)) return res.status(401).json({ error: 'Необходимо войти' });
    const info = db.prepare('UPDATE orders SET is_deleted = 1 WHERE user_id = ?').run(req.session.userId);
    res.json({ success: true, deleted: info.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// АДМИН-МАРШРУТЫ (новые и существующие)
// ============================================================

// ---- Настройки (админ) ----
app.put('/api/admin/settings', (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const updates = req.body;
    Object.entries(updates).forEach(([key, value]) => {
      db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(value, key);
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Админ: логин/выход/статус ----
app.post('/api/admin/login', (req, res) => {
  try {
    const { login, password } = req.body;
    const admin = db.prepare('SELECT * FROM admin WHERE login = ? AND password = ?').get(login, password);
    if (!admin) return res.status(401).json({ error: 'Неверный логин или пароль' });
    req.session.isAdmin = true;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/admin/status', (req, res) => {
  res.json({ isAdmin: !!req.session.isAdmin });
});

// ---- Админ: товары (обновлено с brand_id и volume_id) ----
app.get('/api/admin/products', (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const rows = db.prepare(`
      SELECT p.*, c.name as category_name, b.name as brand_name, v.name as volume_name
      FROM products p
      JOIN categories c ON p.category_id = c.id
      JOIN brands b ON p.brand_id = b.id
      JOIN volumes v ON p.volume_id = v.id
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/products', upload.single('image'), (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { name, price, category_id, brand_id, volume_id, imageUrl, description } = req.body;
    let image = '';
    if (req.file) image = '/uploads/' + req.file.filename;
    else if (imageUrl && imageUrl.trim() !== '') image = imageUrl.trim();
    if (!name || !price || !category_id || !brand_id || !volume_id) {
      return res.status(400).json({ error: 'Заполните все поля (название, цена, категория, бренд, объём)' });
    }
    const info = db.prepare(`
      INSERT INTO products (name, price, category_id, brand_id, volume_id, image, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(name, parseFloat(price), category_id, brand_id, volume_id, image, description || '');
    db.prepare('INSERT INTO notifications (message) VALUES (?)').run('Добавлен новый товар: ' + name);
    res.json({ id: info.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/products/:id', upload.single('image'), (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const id = req.params.id;
    const { name, price, category_id, brand_id, volume_id, imageUrl, description } = req.body;
    let image = '';
    if (req.file) image = '/uploads/' + req.file.filename;
    else if (imageUrl && imageUrl.trim() !== '') image = imageUrl.trim();
    else image = '';
    const info = db.prepare(`
      UPDATE products SET name = ?, price = ?, category_id = ?, brand_id = ?, volume_id = ?, image = ?, description = ?
      WHERE id = ?
    `).run(name, parseFloat(price), category_id, brand_id, volume_id, image, description || '', id);
    if (info.changes === 0) return res.status(404).json({ error: 'Товар не найден' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/products/:id', (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const info = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Товар не найден' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Админ: категории (с фото) ----
app.get('/api/admin/categories', (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const rows = db.prepare('SELECT * FROM categories ORDER BY name').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/categories', upload.single('categoryImage'), (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { name, icon, imageUrl } = req.body;
    let image = '';
    if (req.file) image = '/uploads/categories/' + req.file.filename;
    else if (imageUrl && imageUrl.trim() !== '') image = imageUrl.trim();
    if (!name) return res.status(400).json({ error: 'Введите название категории' });
    const info = db.prepare('INSERT INTO categories (name, icon, image) VALUES (?, ?, ?)')
      .run(name, icon || '', image);
    res.json({ id: info.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/categories/:id', upload.single('categoryImage'), (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const id = req.params.id;
    const { name, icon, imageUrl } = req.body;
    let image = '';
    if (req.file) image = '/uploads/categories/' + req.file.filename;
    else if (imageUrl && imageUrl.trim() !== '') image = imageUrl.trim();
    else image = '';
    const info = db.prepare('UPDATE categories SET name = ?, icon = ?, image = ? WHERE id = ?')
      .run(name, icon || '', image, id);
    if (info.changes === 0) return res.status(404).json({ error: 'Категория не найдена' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/categories/:id', (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const info = db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Категория не найдена' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Админ: бренды ----
app.get('/api/admin/brands', (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const rows = db.prepare(`
      SELECT b.*, c.name as category_name
      FROM brands b
      JOIN categories c ON b.category_id = c.id
      ORDER BY c.name, b.name
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/brands', upload.single('image'), (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { name, description, category_id, imageUrl } = req.body;
    let image = '';
    if (req.file) image = '/uploads/brands/' + req.file.filename;
    else if (imageUrl && imageUrl.trim() !== '') image = imageUrl.trim();
    if (!name || !category_id) return res.status(400).json({ error: 'Заполните название и категорию' });
    const info = db.prepare('INSERT INTO brands (name, description, image, category_id) VALUES (?, ?, ?, ?)')
      .run(name, description || '', image, category_id);
    res.json({ id: info.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/brands/:id', upload.single('image'), (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const id = req.params.id;
    const { name, description, category_id, imageUrl } = req.body;
    let image = '';
    if (req.file) image = '/uploads/brands/' + req.file.filename;
    else if (imageUrl && imageUrl.trim() !== '') image = imageUrl.trim();
    else image = '';
    const info = db.prepare('UPDATE brands SET name = ?, description = ?, image = ?, category_id = ? WHERE id = ?')
      .run(name, description || '', image, category_id, id);
    if (info.changes === 0) return res.status(404).json({ error: 'Бренд не найден' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/brands/:id', (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const info = db.prepare('DELETE FROM brands WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Бренд не найден' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Админ: объёмы ----
app.get('/api/admin/volumes', (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const rows = db.prepare('SELECT * FROM volumes ORDER BY sort_order, name').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/volumes', (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { name, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: 'Введите название объёма' });
    const info = db.prepare('INSERT INTO volumes (name, sort_order) VALUES (?, ?)').run(name, sort_order || 0);
    res.json({ id: info.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/volumes/:id', (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { name, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: 'Введите название объёма' });
    const info = db.prepare('UPDATE volumes SET name = ?, sort_order = ? WHERE id = ?').run(name, sort_order || 0, req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Объём не найден' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/volumes/:id', (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const info = db.prepare('DELETE FROM volumes WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Объём не найден' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Админ: пользователи (без изменений) ----
app.get('/api/admin/users', (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const rows = db.prepare('SELECT id, first_name, last_name, login, is_blocked, created_at FROM users ORDER BY id DESC').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/users/:id/block', (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { block } = req.body;
    const info = db.prepare('UPDATE users SET is_blocked = ? WHERE id = ?').run(block ? 1 : 0, req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/users/:id', (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const info = db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Админ: новости (без изменений) ----
app.get('/api/admin/news', (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const rows = db.prepare('SELECT * FROM news ORDER BY created_at DESC').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/news', (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { title, content, is_active } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Заполните заголовок и текст' });
    const info = db.prepare('INSERT INTO news (title, content, is_active) VALUES (?, ?, ?)')
      .run(title, content, is_active || 1);
    db.prepare('INSERT INTO notifications (message) VALUES (?)').run('📢 Новая новость: ' + title);
    res.json({ id: info.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/news/:id', (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { title, content, is_active } = req.body;
    const info = db.prepare('UPDATE news SET title = ?, content = ?, is_active = ? WHERE id = ?')
      .run(title, content, is_active, req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Новость не найдена' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/news/:id', (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const info = db.prepare('DELETE FROM news WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Новость не найдена' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Админ: заказы (без изменений) ----
app.get('/api/admin/orders', (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const stmt = db.prepare(`
      SELECT orders.*, users.first_name, users.last_name, users.login
      FROM orders
      JOIN users ON orders.user_id = users.id
      ORDER BY orders.created_at DESC
    `);
    res.json(stmt.all());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/orders/:id', (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Укажите статус' });
    const info = db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Заказ не найден' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Админ: фон ----
app.post('/api/admin/upload-background', upload.single('background'), (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
    const filePath = '/uploads/backgrounds/' + req.file.filename;
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(filePath, 'site_background');
    res.json({ success: true, path: filePath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/background', (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { url } = req.body;
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(url || '', 'site_background');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Динамическая карта сайта ----
app.get('/sitemap.xml', (req, res) => {
  try {
    const baseUrl = 'https://sushnykoff.onrender.com';
    const today = new Date().toISOString().split('T')[0];
    const products = db.prepare('SELECT id FROM products').all();

    let urls = `
      <url><loc>${baseUrl}/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>
      <url><loc>${baseUrl}/about.html</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>
      <url><loc>${baseUrl}/contacts.html</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>
      <url><loc>${baseUrl}/map.html</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>
      <url><loc>${baseUrl}/profile.html</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>
    `;
    products.forEach(p => {
      urls += `<url><loc>${baseUrl}/product.html?id=${p.id}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.9</priority></url>`;
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
    res.header('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    console.error('Ошибка генерации sitemap.xml:', err);
    res.status(500).send('Внутренняя ошибка сервера');
  }
});

// ---- ЗАПУСК ----
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на http://localhost:${PORT}`);
});