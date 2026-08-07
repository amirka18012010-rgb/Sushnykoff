require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const { createClient } = require('@supabase/supabase-js');
const sharp = require('sharp'); // Добавили sharp для сжатия

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Подключение к Supabase ----
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Отсутствуют SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY в переменных окружения');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

// ---- Middleware ----
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public', { maxAge: 86400000, immutable: true }));
app.use('/uploads', express.static('uploads'));

// ---- Сессии ----
app.use(session({
  secret: process.env.SESSION_SECRET || 'default_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

// ---- Multer (лимит 5 МБ, как вы хотели) ----
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5 МБ
});

// ---- Вспомогательная функция для сжатия и загрузки в Storage ----
async function uploadToStorage(file, folder) {
  if (!file) return null;
  try {
    // Сжимаем изображение с помощью sharp
    const optimizedBuffer = await sharp(file.buffer)
      .resize(800, null, { // Ширина 800px, высота автоматически
        withoutEnlargement: true
      })
      .webp({ quality: 80 }) // Конвертируем в WebP с качеством 80%
      .toBuffer();

    const fileExt = 'webp'; // Теперь все картинки будут .webp
    const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
    
    const { data, error } = await supabase.storage
      .from('images')
      .upload(fileName, optimizedBuffer, {
        contentType: 'image/webp',
        cacheControl: '3600',
        upsert: false
      });
    if (error) {
      console.error('Ошибка загрузки в Storage:', error);
      return null;
    }
    const { data: publicUrlData } = supabase.storage
      .from('images')
      .getPublicUrl(fileName);
    return publicUrlData.publicUrl;
  } catch (err) {
    console.error('Ошибка при обработке изображения:', err);
    return null;
  }
}

// ---- Вспомогательные функции ----
function isAdmin(req) { return req.session && req.session.isAdmin; }
function isAuthenticated(req) { return req.session && req.session.userId; }
async function isBlocked(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('is_blocked')
    .eq('id', userId)
    .single();
  if (error || !data) return 0;
  return data.is_blocked;
}

// ---- Функции для корзины ----
async function getCartFromDB(userId) {
  const { data, error } = await supabase
    .from('cart_items')
    .select('product_id, quantity, price_type, price')
    .eq('user_id', userId);
  if (error) return [];
  return data.map(row => ({
    productId: row.product_id,
    quantity: row.quantity,
    priceType: row.price_type,
    price: row.price,
  }));
}

async function setCartToDB(userId, cart) {
  await supabase.from('cart_items').delete().eq('user_id', userId);
  if (cart.length === 0) return;
  const items = cart.map(item => ({
    user_id: userId,
    product_id: item.productId,
    quantity: item.quantity,
    price_type: item.priceType,
    price: item.price,
  }));
  await supabase.from('cart_items').insert(items);
}

// ============================================================
// МАРШРУТЫ ДЛЯ ПУБЛИЧНОЙ ЧАСТИ
// ============================================================

app.get('/api/ping', (req, res) => {
  console.log(`✅ Пинг получен в ${new Date().toISOString()}`);
  res.send('ok');
});

// ---- 1. Категории ----
app.get('/api/categories', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 2. Бренды по категории ----
app.get('/api/brands', async (req, res) => {
  try {
    const { categoryId } = req.query;
    let query = supabase.from('brands').select('*');
    if (categoryId) query = query.eq('category_id', categoryId);
    const { data, error } = await query.order('name');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 3. Бренд по ID ----
app.get('/api/brands/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('brands')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error) return res.status(404).json({ error: 'Бренд не найден' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 4. Объёмы для бренда ----
app.get('/api/volumes', async (req, res) => {
  try {
    const { brandId } = req.query;
    if (!brandId) return res.json([]);
    const { data, error } = await supabase
      .from('products')
      .select('volume_id')
      .eq('brand_id', brandId);
    if (error) throw error;
    const volumeIds = data.map(p => p.volume_id).filter(id => id !== null);
    if (!volumeIds.length) return res.json([]);
    const { data: volumes, error: err2 } = await supabase
      .from('volumes')
      .select('*')
      .in('id', volumeIds)
      .order('sort_order', { ascending: true });
    if (err2) throw err2;
    res.json(volumes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 5. Товары ----
app.get('/api/products', async (req, res) => {
  try {
    const { brandId, volumeId, category, search, page = 1, limit = 12, sort = 'newest', ids } = req.query;
    let query = supabase
      .from('products')
      .select(`
        *,
        categories:category_id(name),
        brands:brand_id(name),
        volumes:volume_id(name)
      `);

    if (brandId) query = query.eq('brand_id', brandId);
    if (volumeId) query = query.eq('volume_id', volumeId);
    if (category && category !== 'all') query = query.eq('category_id', category);
    if (search && search.trim() !== '') {
      const words = search.trim().split(/\s+/).filter(w => w.length > 0);
      const conditions = words.map(word => 
        `name.ilike.%${word}%,description.ilike.%${word}%`
      ).join(',');
      query = query.or(conditions);
    }
    if (ids) {
      const idArray = ids.split(',').map(Number).filter(id => !isNaN(id));
      if (idArray.length) query = query.in('id', idArray);
    }

    if (sort === 'random') {
      query = query.order('id', { ascending: false });
    } else {
      query = query.order('id', { ascending: false });
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error } = await query;
    if (error) throw error;

    const items = data.map(p => ({
      ...p,
      category_name: p.categories?.name,
      brand_name: p.brands?.name,
      volume_name: p.volumes?.name,
    }));

    let countQuery = supabase.from('products').select('*', { count: 'exact', head: true });
    if (brandId) countQuery = countQuery.eq('brand_id', brandId);
    if (volumeId) countQuery = countQuery.eq('volume_id', volumeId);
    if (category && category !== 'all') countQuery = countQuery.eq('category_id', category);
    if (search && search.trim() !== '') {
      const words = search.trim().split(/\s+/).filter(w => w.length > 0);
      const conditions = words.map(word => 
        `name.ilike.%${word}%,description.ilike.%${word}%`
      ).join(',');
      countQuery = countQuery.or(conditions);
    }
    const { count, error: countErr } = await countQuery;
    if (countErr) throw countErr;

    res.json({
      items,
      total: count || 0,
      page: parseInt(page),
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 6. Товар по ID ----
app.get('/api/products/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        categories:category_id(name),
        brands:brand_id(name),
        volumes:volume_id(name)
      `)
      .eq('id', req.params.id)
      .single();
    if (error) return res.status(404).json({ error: 'Товар не найден' });
    data.category_name = data.categories?.name;
    data.brand_name = data.brands?.name;
    data.volume_name = data.volumes?.name;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 7. Отзывы ----
app.get('/api/products/:id/reviews', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('product_id', req.params.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/products/:id/reviews', async (req, res) => {
  try {
    const { user_name, rating, comment } = req.body;
    if (!user_name || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Заполните имя и рейтинг' });
    }
    const { data, error } = await supabase
      .from('reviews')
      .insert({ product_id: req.params.id, user_name, rating, comment: comment || '' })
      .select();
    if (error) throw error;
    const { data: avgData } = await supabase
      .from('reviews')
      .select('rating')
      .eq('product_id', req.params.id);
    if (avgData && avgData.length) {
      const avg = avgData.reduce((sum, r) => sum + r.rating, 0) / avgData.length;
      await supabase.from('products').update({ avg_rating: avg }).eq('id', req.params.id);
    }
    res.json({ id: data[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 8. Избранное ----
app.get('/api/favorites', async (req, res) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Необходимо войти' });
  try {
    const { data, error } = await supabase
      .from('favorites')
      .select('product_id')
      .eq('user_id', req.session.userId);
    if (error) throw error;
    res.json(data.map(r => r.product_id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/favorites', async (req, res) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Необходимо войти' });
  const { productId } = req.body;
  if (!productId) return res.status(400).json({ error: 'Не указан товар' });
  try {
    await supabase
      .from('favorites')
      .insert({ user_id: req.session.userId, product_id: productId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.delete('/api/favorites/:productId', async (req, res) => {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Необходимо войти' });
  try {
    await supabase
      .from('favorites')
      .delete()
      .eq('user_id', req.session.userId)
      .eq('product_id', req.params.productId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 9. Новости ----
app.get('/api/news/latest', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('news')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(3);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 10. Настройки ----
app.get('/api/settings', async (req, res) => {
  try {
    const { data, error } = await supabase.from('settings').select('key, value');
    if (error) throw error;
    const settings = {};
    data.forEach(row => settings[row.key] = row.value);
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 11. Уведомления ----
app.get('/api/notifications', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('is_read', 0)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/notifications/read', async (req, res) => {
  try {
    await supabase.from('notifications').update({ is_read: 1 }).eq('is_read', 0);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 12. Фон ----
app.get('/api/background', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'site_background')
      .single();
    if (error) return res.json({ background: '' });
    res.json({ background: data.value || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 13. Аутентификация ----
app.post('/api/auth/register', async (req, res) => {
  try {
    const { firstName, lastName, login, password, phone } = req.body;
    if (!firstName || !lastName || !login || !password) {
      return res.status(400).json({ error: 'Заполните все обязательные поля' });
    }
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('login', login)
      .single();
    if (existing) return res.status(400).json({ error: 'Логин уже занят' });
    const hashed = await bcrypt.hash(password, 10);
    const { data, error } = await supabase
      .from('users')
      .insert({
        first_name: firstName,
        last_name: lastName,
        login,
        password: hashed,
        phone: phone || null,
      })
      .select('id');
    if (error) throw error;
    req.session.userId = data[0].id;
    res.json({ success: true, userId: data[0].id });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка регистрации' });
  }
});
app.post('/api/auth/login', async (req, res) => {
  try {
    const { login, password } = req.body;
    if (!login || !password) return res.status(400).json({ error: 'Введите логин и пароль' });
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('login', login)
      .single();
    if (error || !user) return res.status(401).json({ error: 'Неверный логин или пароль' });
    if (user.is_blocked) return res.status(403).json({ error: 'Ваш аккаунт заблокирован' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Неверный логин или пароль' });
    req.session.userId = user.id;
    res.json({ success: true, userId: user.id, firstName: user.first_name, lastName: user.last_name });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка входа' });
  }
});
app.get('/api/auth/me', async (req, res) => {
  try {
    if (!isAuthenticated(req)) return res.json({ user: null });
    const { data, error } = await supabase
      .from('users')
      .select('id, first_name, last_name, login')
      .eq('id', req.session.userId)
      .single();
    if (error || !data) {
      req.session.destroy();
      return res.json({ user: null });
    }
    res.json({ user: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});
app.post('/api/auth/recover-login', async (req, res) => {
  try {
    const { firstName, lastName } = req.body;
    if (!firstName || !lastName) return res.status(400).json({ error: 'Введите имя и фамилию' });
    const { data, error } = await supabase
      .from('users')
      .select('login')
      .eq('first_name', firstName)
      .eq('last_name', lastName)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json({ login: data.login });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { firstName, lastName, login, newPassword } = req.body;
    if (!firstName || !lastName || !login || !newPassword) return res.status(400).json({ error: 'Заполните все поля' });
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('first_name', firstName)
      .eq('last_name', lastName)
      .eq('login', login)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Пользователь не найден' });
    const hashed = await bcrypt.hash(newPassword, 10);
    await supabase.from('users').update({ password: hashed }).eq('id', data.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 14. Корзина ----
app.get('/api/cart', async (req, res) => {
  try {
    if (isAuthenticated(req)) {
      const cart = await getCartFromDB(req.session.userId);
      res.json(cart);
    } else {
      res.json(req.session.cart || []);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cart', async (req, res) => {
  try {
    const { productId, quantity, priceType = 'retail' } = req.body;
    if (!productId || quantity === undefined) {
      return res.status(400).json({ error: 'Не указан товар или количество' });
    }
    const { data: product, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();
    if (error || !product) return res.status(404).json({ error: 'Товар не найден' });

    let price = product.price;
    if (priceType === 'wholesale' && product.wholesale_price !== null && product.wholesale_price > 0) {
      price = product.wholesale_price;
    }

    if (isAuthenticated(req)) {
      let cart = await getCartFromDB(req.session.userId);
      const existingIndex = cart.findIndex(item => item.productId === productId && item.priceType === priceType);
      if (existingIndex !== -1) {
        if (quantity > 0) {
          cart[existingIndex].quantity = quantity;
          cart[existingIndex].price = price;
        } else {
          cart.splice(existingIndex, 1);
        }
      } else if (quantity > 0) {
        cart.push({ productId, quantity, priceType, price });
      }
      await setCartToDB(req.session.userId, cart);
      res.json(cart);
    } else {
      let cart = req.session.cart || [];
      const existingIndex = cart.findIndex(item => item.productId === productId && item.priceType === priceType);
      if (existingIndex !== -1) {
        if (quantity > 0) {
          cart[existingIndex].quantity = quantity;
          cart[existingIndex].price = price;
        } else {
          cart.splice(existingIndex, 1);
        }
      } else if (quantity > 0) {
        cart.push({ productId, quantity, priceType, price });
      }
      req.session.cart = cart;
      res.json(cart);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/cart/:productId', async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    const priceType = req.query.priceType || 'retail';
    if (isAuthenticated(req)) {
      let cart = await getCartFromDB(req.session.userId);
      cart = cart.filter(item => !(item.productId === productId && item.priceType === priceType));
      await setCartToDB(req.session.userId, cart);
      res.json(cart);
    } else {
      let cart = req.session.cart || [];
      cart = cart.filter(item => !(item.productId === productId && item.priceType === priceType));
      req.session.cart = cart;
      res.json(cart);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cart/sync', async (req, res) => {
  try {
    if (!isAuthenticated(req)) return res.status(401).json({ error: 'Необходимо войти' });
    const sessionCart = req.session.cart || [];
    if (sessionCart.length > 0) {
      await setCartToDB(req.session.userId, sessionCart);
      req.session.cart = [];
    }
    const dbCart = await getCartFromDB(req.session.userId);
    res.json(dbCart);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- 15. Заказы ----
app.post('/api/orders', async (req, res) => {
  try {
    if (!isAuthenticated(req)) return res.status(401).json({ error: 'Необходимо войти' });
    if (await isBlocked(req.session.userId)) return res.status(403).json({ error: 'Ваш аккаунт заблокирован' });

    let cart = await getCartFromDB(req.session.userId);
    if (cart.length === 0) {
      cart = req.session.cart || [];
    }
    if (cart.length === 0) return res.status(400).json({ error: 'Корзина пуста' });

    let total = 0;
    const orderItems = [];
    for (const item of cart) {
      const { data: product, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', item.productId)
        .single();
      if (error || !product) return res.status(404).json({ error: `Товар ${item.productId} не найден` });
      const price = item.price || product.price;
      total += price * item.quantity;
      orderItems.push({
        productId: item.productId,
        name: product.name,
        price: price,
        quantity: item.quantity,
        priceType: item.priceType || 'retail',
      });
    }

    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        user_id: req.session.userId,
        items: JSON.stringify(orderItems),
        total: total,
        status: 'pending',
      })
      .select('id');
    if (error) throw error;

    if (isAuthenticated(req)) {
      await supabase.from('cart_items').delete().eq('user_id', req.session.userId);
    } else {
      req.session.cart = [];
    }

    const orderId = order[0].id;
    const { data: user } = await supabase
      .from('users')
      .select('first_name, last_name')
      .eq('id', req.session.userId)
      .single();
    const message = `🆕 Новый заказ №${orderId} от ${user.first_name} ${user.last_name} на сумму ${total} ₽`;
    await supabase.from('notifications').insert({ message });

    res.json({ orderId, total, message: 'Заказ создан' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/history', async (req, res) => {
  try {
    if (!isAuthenticated(req)) return res.status(401).json({ error: 'Необходимо войти' });
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', req.session.userId)
      .eq('is_deleted', 0)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.delete('/api/orders/history', async (req, res) => {
  try {
    if (!isAuthenticated(req)) return res.status(401).json({ error: 'Необходимо войти' });
    await supabase
      .from('orders')
      .update({ is_deleted: 1 })
      .eq('user_id', req.session.userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// АДМИН-МАРШРУТЫ
// ============================================================

app.put('/api/admin/settings', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      await supabase.from('settings').update({ value }).eq('key', key);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/login', (req, res) => {
  try {
    const { login, password } = req.body;
    const adminLogin = process.env.ADMIN_LOGIN || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    if (login === adminLogin && password === adminPassword) {
      req.session.isAdmin = true;
      res.json({ success: true });
    } else {
      res.status(401).json({ error: 'Неверный логин или пароль' });
    }
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

// ---- Админ: товары ----
app.get('/api/admin/products', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        categories:category_id(name),
        brands:brand_id(name),
        volumes:volume_id(name)
      `)
      .order('id', { ascending: false })
      .limit(250);
    if (error) throw error;
    const items = data.map(p => ({
      ...p,
      category_name: p.categories?.name,
      brand_name: p.brands?.name,
      volume_name: p.volumes?.name,
    }));
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Админ: добавление товара ----
app.post('/api/admin/products', upload.single('image'), async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { name, price, category_id, brand_id, volume_id, imageUrl, description, wholesale_price } = req.body;
    let image = '';
    if (req.file) {
      const publicUrl = await uploadToStorage(req.file, 'products');
      if (publicUrl) image = publicUrl;
    } else if (imageUrl && imageUrl.trim() !== '') {
      image = imageUrl.trim();
    }
    if (!name || !price || !category_id || !brand_id || !volume_id) {
      return res.status(400).json({ error: 'Заполните все поля (название, цена, категория, бренд, объём)' });
    }
    
    const { data, error } = await supabase
      .from('products')
      .insert({
        name,
        price: parseFloat(price),
        category_id,
        brand_id,
        volume_id,
        image,
        description: description || '',
        wholesale_price: wholesale_price ? parseFloat(wholesale_price) : null,
      })
      .select('id');
    
    if (error) {
      console.error('❌ ОШИБКА ПРИ ВСТАВКЕ ТОВАРА В БАЗУ:', error);
      throw error;
    }
    
    // Отправляем уведомление в фоне
    supabase.from('notifications').insert({ message: 'Добавлен новый товар: ' + name })
      .catch(err => console.error('Ошибка отправки уведомления:', err));

    res.json({ id: data[0].id });
  } catch (err) {
    console.error('🔥 Фатальная ошибка при добавлении товара:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/products/:id', upload.single('image'), async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const id = req.params.id;
    const { name, price, category_id, brand_id, volume_id, imageUrl, description, wholesale_price } = req.body;
    let image = '';
    if (req.file) {
      const publicUrl = await uploadToStorage(req.file, 'products');
      if (publicUrl) image = publicUrl;
    } else if (imageUrl && imageUrl.trim() !== '') {
      image = imageUrl.trim();
    } else {
      const { data: old } = await supabase.from('products').select('image').eq('id', id).single();
      if (old) image = old.image;
    }
    const { error } = await supabase
      .from('products')
      .update({
        name,
        price: parseFloat(price),
        category_id,
        brand_id,
        volume_id,
        image,
        description: description || '',
        wholesale_price: wholesale_price ? parseFloat(wholesale_price) : null,
      })
      .eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/products/:id', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { error } = await supabase.from('products').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Админ: категории ----
app.get('/api/admin/categories', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { data, error } = await supabase.from('categories').select('*').order('name');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/categories', upload.single('categoryImage'), async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { name, icon, imageUrl } = req.body;
    let image = '';
    if (req.file) {
      const publicUrl = await uploadToStorage(req.file, 'categories');
      if (publicUrl) image = publicUrl;
    } else if (imageUrl && imageUrl.trim() !== '') {
      image = imageUrl.trim();
    }
    if (!name) return res.status(400).json({ error: 'Введите название категории' });
    const { data, error } = await supabase
      .from('categories')
      .insert({ name, icon: icon || '', image })
      .select('id');
    if (error) throw error;
    res.json({ id: data[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/categories/:id', upload.single('categoryImage'), async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const id = req.params.id;
    const { name, icon, imageUrl } = req.body;
    let image = '';
    if (req.file) {
      const publicUrl = await uploadToStorage(req.file, 'categories');
      if (publicUrl) image = publicUrl;
    } else if (imageUrl && imageUrl.trim() !== '') {
      image = imageUrl.trim();
    } else {
      const { data: old } = await supabase.from('categories').select('image').eq('id', id).single();
      if (old) image = old.image;
    }
    const { error } = await supabase
      .from('categories')
      .update({ name, icon: icon || '', image })
      .eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/categories/:id', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { error } = await supabase.from('categories').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Админ: бренды ----
app.get('/api/admin/brands', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { data, error } = await supabase
      .from('brands')
      .select(`
        *,
        categories:category_id(name)
      `)
      .order('name');
    if (error) throw error;
    const items = data.map(b => ({
      ...b,
      category_name: b.categories?.name,
    }));
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/brands', upload.single('image'), async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { name, description, category_id, imageUrl } = req.body;
    let image = '';
    if (req.file) {
      const publicUrl = await uploadToStorage(req.file, 'brands');
      if (publicUrl) image = publicUrl;
    } else if (imageUrl && imageUrl.trim() !== '') {
      image = imageUrl.trim();
    }
    if (!name || !category_id) return res.status(400).json({ error: 'Заполните название и категорию' });
    const { data, error } = await supabase
      .from('brands')
      .insert({ name, description: description || '', image, category_id })
      .select('id');
    if (error) throw error;
    res.json({ id: data[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/brands/:id', upload.single('image'), async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const id = req.params.id;
    const { name, description, category_id, imageUrl } = req.body;
    let image = '';
    if (req.file) {
      const publicUrl = await uploadToStorage(req.file, 'brands');
      if (publicUrl) image = publicUrl;
    } else if (imageUrl && imageUrl.trim() !== '') {
      image = imageUrl.trim();
    } else {
      const { data: old } = await supabase.from('brands').select('image').eq('id', id).single();
      if (old) image = old.image;
    }
    const { error } = await supabase
      .from('brands')
      .update({ name, description: description || '', image, category_id })
      .eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/brands/:id', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { error } = await supabase.from('brands').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Админ: объёмы ----
app.get('/api/admin/volumes', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { data, error } = await supabase.from('volumes').select('*').order('sort_order', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/volumes', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { name, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: 'Введите название объёма' });
    const { data, error } = await supabase
      .from('volumes')
      .insert({ name, sort_order: sort_order || 0 })
      .select('id');
    if (error) throw error;
    res.json({ id: data[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/volumes/:id', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { name, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: 'Введите название объёма' });
    const { error } = await supabase
      .from('volumes')
      .update({ name, sort_order: sort_order || 0 })
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/volumes/:id', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { error } = await supabase.from('volumes').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Админ: заказы (лимит 250) ----
app.get('/api/admin/orders', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        users:user_id(first_name, last_name, login)
      `)
      .order('created_at', { ascending: false })
      .limit(250);
    if (error) throw error;
    const items = data.map(o => ({
      ...o,
      first_name: o.users?.first_name,
      last_name: o.users?.last_name,
      login: o.users?.login,
    }));
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/orders/:id', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Укажите статус' });
    const { data: order } = await supabase.from('orders').select('user_id').eq('id', req.params.id).single();
    if (!order) return res.status(404).json({ error: 'Заказ не найден' });
    const { error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', req.params.id);
    if (error) throw error;
    const statusMap = {
      pending: 'ожидает подтверждения',
      paid: 'оплачен',
      shipped: 'отправлен',
      delivered: 'доставлен'
    };
    const statusText = statusMap[status] || status;
    const message = `📦 Статус заказа №${req.params.id} изменён на «${statusText}»`;
    await supabase.from('notifications').insert({ message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Админ: пользователи (лимит 250) ----
app.get('/api/admin/users', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { data, error } = await supabase
      .from('users')
      .select('id, first_name, last_name, login, is_blocked, created_at, phone')
      .order('id', { ascending: false })
      .limit(250);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/users/:id/block', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { block } = req.body;
    const { error } = await supabase
      .from('users')
      .update({ is_blocked: block ? 1 : 0 })
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { error } = await supabase.from('users').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Админ: новости (лимит 250) ----
app.get('/api/admin/news', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { data, error } = await supabase.from('news').select('*').order('created_at', { ascending: false }).limit(250);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/news', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { title, content, is_active } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Заполните заголовок и текст' });
    const { data, error } = await supabase
      .from('news')
      .insert({ title, content, is_active: is_active || 1 })
      .select('id');
    if (error) throw error;
    await supabase.from('notifications').insert({ message: '📢 Новая новость: ' + title });
    res.json({ id: data[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/news/:id', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { title, content, is_active } = req.body;
    const { error } = await supabase
      .from('news')
      .update({ title, content, is_active })
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/news/:id', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { error } = await supabase.from('news').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Админ: фон ----
app.post('/api/admin/upload-background', upload.single('background'), async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
    const publicUrl = await uploadToStorage(req.file, 'backgrounds');
    if (!publicUrl) {
      return res.status(500).json({ error: 'Не удалось загрузить изображение' });
    }
    await supabase.from('settings').update({ value: publicUrl }).eq('key', 'site_background');
    res.json({ success: true, path: publicUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/background', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
    const { url } = req.body;
    await supabase.from('settings').update({ value: url || '' }).eq('key', 'site_background');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Запуск ----
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
});