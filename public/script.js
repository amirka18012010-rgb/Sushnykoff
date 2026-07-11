// ============================================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ============================================================
let products = [], cart = [], currentUser = null, currentPage = 1, totalPages = 1, favorites = [];
let currentBrandId = null, currentVolumeId = null;

// ============================================================
// DOM-ЭЛЕМЕНТЫ
// ============================================================
const productsGrid = document.getElementById('productsGrid');
const categoryFilter = document.getElementById('categoryFilter');
const searchInput = document.getElementById('headerSearchInput');
const resetFilterBtn = document.getElementById('resetFilterBtn');
const pagination = document.getElementById('pagination');
const categoriesGrid = document.getElementById('categoriesGrid');

const cartOverlay = document.getElementById('cartOverlay');
const openCartBtn = document.getElementById('openCartBtn');
const closeCartBtn = document.getElementById('closeCartBtn');
const cartItems = document.getElementById('cartItems');
const cartTotal = document.getElementById('cartTotal');
const cartCount = document.getElementById('cartCount');
const checkoutBtn = document.getElementById('checkoutBtn');

const notifBtn = document.getElementById('notifBtn');
const notifBadge = document.getElementById('notifBadge');
const notifOverlay = document.getElementById('notifOverlay');
const closeNotifBtn = document.getElementById('closeNotifBtn');
const notifList = document.getElementById('notifList');
const markReadBtn = document.getElementById('markReadBtn');

const newsOverlay = document.getElementById('newsOverlay');
const closeNewsBtn = document.getElementById('closeNewsBtn');
const newsCloseBtn = document.getElementById('newsCloseBtn');

// ============================================================
// БУРГЕР-МЕНЮ
// ============================================================
const burgerBtn = document.getElementById('burgerBtn');
const burgerMenu = document.getElementById('burgerMenu');

if (burgerBtn && burgerMenu) {
  burgerBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    this.classList.toggle('active');
    burgerMenu.classList.toggle('open');
  });

  document.addEventListener('click', function(e) {
    const target = e.target;
    if (
      burgerBtn.contains(target) ||
      burgerMenu.contains(target) ||
      target.closest('#headerSearchInput') ||
      target.closest('.header-search')
    ) {
      return;
    }
    burgerBtn.classList.remove('active');
    burgerMenu.classList.remove('open');
  });

  burgerMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', function() {
      burgerBtn.classList.remove('active');
      burgerMenu.classList.remove('open');
    });
  });
}

// ============================================================
// НОВАЯ СТРУКТУРА: КАТЕГОРИИ
// ============================================================

// ---- Загрузка категорий на главную (4 в строку) ----
function loadCategories() {
  if (!categoriesGrid) return;
  fetch('/api/categories')
    .then(res => res.json())
    .then(cats => {
      if (!cats.length) {
        categoriesGrid.innerHTML = '<p>Категории не загружены</p>';
        return;
      }
      categoriesGrid.innerHTML = cats.map(c => {
        const content = c.image
          ? `<img class="category-img" src="${c.image}" alt="${c.name}">`
          : `<div class="category-icon">${c.icon || '📂'}</div>`;
        return `
          <div class="category-card" data-id="${c.id}">
            ${content}
            <div class="category-info">
              <div class="name">${c.name}</div>
            </div>
          </div>
        `;
      }).join('');
      document.querySelectorAll('.category-card').forEach(el => {
        el.addEventListener('click', function() {
          const id = this.dataset.id;
          window.location.href = `/brands.html?category=${id}`;
        });
      });
    })
    .catch(err => console.error('Ошибка загрузки категорий:', err));
}

// ---- Поиск в хедере (перенаправление на страницу поиска или фильтрация) ----
function handleHeaderSearch() {
  const query = document.getElementById('headerSearchInput').value.trim();
  if (query) {
    window.location.href = `/search.html?q=${encodeURIComponent(query)}`;
  }
}

// Если у вас нет отдельной страницы поиска, можно сделать фильтрацию на текущей странице.
// Но для простоты я пока сделаю перенаправление на /search.html (которого нет).
// Можно также сделать переход на brands.html с параметром поиска, но это уже как хотите.
// Я пока оставлю просто alert для демонстрации.
// В реальности вы можете использовать поиск на странице брендов или создать отдельную страницу.
// Поскольку пользователь сказал "поиск засунем как на картинке в хедер", я добавлю обработчик.

// ---- Если на главной, убираем товары ----
if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
  // Убираем фильтр и товары (они уже удалены из HTML)
  // Но если они остались, можно скрыть через CSS или удалить из DOM.
}

// ---- Страница brands.html ----
if (window.location.pathname.includes('brands.html')) {
  const params = new URLSearchParams(window.location.search);
  const categoryId = params.get('category');
  if (categoryId) {
    document.addEventListener('DOMContentLoaded', function() {
      loadBrands(categoryId);
      loadBrandsCategoryProducts(categoryId);
      const searchInput = document.getElementById('brandsSearchInput');
      const resetBtn = document.getElementById('brandsResetSearchBtn');
      if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
          loadBrandsCategoryProducts(categoryId);
        }, 300));
      }
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          if (searchInput) searchInput.value = '';
          loadBrandsCategoryProducts(categoryId);
        });
      }
    });
  }
}

function loadBrands(categoryId) {
  fetch('/api/categories')
    .then(r => r.json())
    .then(cats => {
      const cat = cats.find(c => c.id == categoryId);
      const titleEl = document.getElementById('categoryTitle');
      if (titleEl) {
        titleEl.textContent = cat ? `Бренды и товары в категории «${cat.name}»` : 'Бренды и товары';
      }
    });
  fetch(`/api/brands?categoryId=${categoryId}`)
    .then(res => res.json())
    .then(brands => {
      const grid = document.getElementById('brandsGrid');
      if (!grid) return;
      if (!brands.length) {
        grid.innerHTML = '<p>Брендов в этой категории пока нет.</p>';
        return;
      }
      grid.innerHTML = brands.map(b => `
        <div class="brand-card" data-id="${b.id}">
          ${b.image ? `<img src="${b.image}" alt="${b.name}">` : '<div class="placeholder">📦</div>'}
          <div class="brand-info">
            <div class="name">${b.name}</div>
          </div>
        </div>
      `).join('');
      document.querySelectorAll('.brand-card').forEach(el => {
        el.addEventListener('click', function() {
          const id = this.dataset.id;
          window.location.href = `/brand.html?id=${id}`;
        });
      });
    });
}

function loadBrandsCategoryProducts(categoryId) {
  const search = document.getElementById('brandsSearchInput') ? document.getElementById('brandsSearchInput').value.trim() : '';
  const url = new URL('/api/products', window.location.origin);
  url.searchParams.append('category', categoryId);
  if (search) url.searchParams.append('search', search);
  url.searchParams.append('page', currentPage);
  url.searchParams.append('limit', 12);
  fetch(url)
    .then(res => res.json())
    .then(data => {
      products = data.items || [];
      totalPages = data.totalPages || 1;
      currentPage = data.page || 1;
      renderProducts();
      renderPagination();
    })
    .catch(err => console.error('Ошибка загрузки товаров категории:', err));
}

// ---- Страница brand.html ----
if (window.location.pathname.includes('brand.html')) {
  const params = new URLSearchParams(window.location.search);
  const brandId = params.get('id');
  if (brandId) {
    currentBrandId = brandId;
    document.addEventListener('DOMContentLoaded', function() {
      loadBrand(brandId);
      loadProductsForBrand(brandId);
      const searchInput = document.getElementById('brandSearchInput');
      const resetBtn = document.getElementById('brandResetSearchBtn');
      if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
          const search = searchInput.value.trim();
          loadProductsForBrand(brandId, currentVolumeId, search);
        }, 300));
      }
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          if (searchInput) searchInput.value = '';
          loadProductsForBrand(brandId, currentVolumeId);
        });
      }
    });
  }
}

function loadBrand(brandId) {
  fetch(`/api/brands/${brandId}`)
    .then(res => res.json())
    .then(brand => {
      document.getElementById('brandName').textContent = brand.name;
      document.getElementById('brandDescription').textContent = brand.description || '';
      document.getElementById('brandImage').src = brand.image || '';
      document.title = brand.name + ' — Sushnykoff';
    });
}

function loadProductsForBrand(brandId, volumeId = null, search = '') {
  currentVolumeId = volumeId;
  const url = new URL('/api/products', window.location.origin);
  url.searchParams.append('brandId', brandId);
  if (volumeId) url.searchParams.append('volumeId', volumeId);
  if (search) url.searchParams.append('search', search);
  url.searchParams.append('page', currentPage);
  url.searchParams.append('limit', 12);
  fetch(url)
    .then(res => res.json())
    .then(data => {
      products = data.items || [];
      totalPages = data.totalPages || 1;
      currentPage = data.page || 1;
      renderProducts();
      renderPagination();
      loadVolumesFilter(brandId);
    })
    .catch(err => console.error('Ошибка загрузки товаров бренда:', err));
}

function loadVolumesFilter(brandId) {
  fetch(`/api/volumes?brandId=${brandId}`)
    .then(res => res.json())
    .then(volumes => {
      const container = document.getElementById('volumesFilter');
      if (!container) return;
      if (!volumes.length) { container.innerHTML = ''; return; }
      let html = '<button class="volume-btn active" data-id="all">Все объёмы</button>';
      volumes.forEach(v => {
        html += `<button class="volume-btn" data-id="${v.id}">${v.name}</button>`;
      });
      container.innerHTML = html;
      container.querySelectorAll('.volume-btn').forEach(btn => {
        btn.addEventListener('click', function() {
          container.querySelectorAll('.volume-btn').forEach(b => b.classList.remove('active'));
          this.classList.add('active');
          const vid = this.dataset.id === 'all' ? null : this.dataset.id;
          loadProductsForBrand(currentBrandId, vid);
        });
      });
    });
}

// ---- Универсальный рендер товаров ----
function renderProducts() {
  if (!productsGrid) return;
  if (!products.length) {
    productsGrid.innerHTML = `<p style="grid-column:1/-1; text-align:center; padding:40px; color:#7f8c8d;">Товары не найдены</p>`;
    return;
  }
  productsGrid.innerHTML = products.map(p => {
    const isFav = favorites.includes(p.id);
    return `
    <div class="product-card" data-id="${p.id}">
      <img class="product-img" src="${p.image || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23f0f2f5"/%3E%3Ctext x="50" y="55" text-anchor="middle" font-size="40" dy=".35em"%3E🥤%3C/text%3E%3C/svg%3E'}" alt="${p.name}">
      <div class="product-info">
        <div class="name">${p.name}</div>
        <div class="price">${p.price} ₽</div>
        ${p.volume_name ? `<div class="type">${p.volume_name}</div>` : ''}
        <div class="actions">
          <button class="add-btn" data-id="${p.id}">➕ В корзину</button>
          <button class="fav-btn ${isFav?'active':''}" data-id="${p.id}">${isFav?'❤️':'🤍'}</button>
        </div>
      </div>
    </div>`;
  }).join('');

  document.querySelectorAll('.add-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      addToCart(parseInt(btn.dataset.id));
    });
  });
  document.querySelectorAll('.fav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(parseInt(btn.dataset.id));
    });
  });
  document.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', function(e) {
      if (e.target.closest('button')) return;
      window.location.href = `/product.html?id=${this.dataset.id}`;
    });
  });
}

function renderPagination() {
  if (!pagination) return;
  if (totalPages <= 1) { pagination.innerHTML = ''; return; }
  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="page-btn ${i===currentPage?'active':''}" data-page="${i}">${i}</button>`;
  }
  pagination.innerHTML = html;
  pagination.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPage = parseInt(btn.dataset.page);
      if (window.location.pathname.includes('brand.html')) {
        loadProductsForBrand(currentBrandId, currentVolumeId);
      } else if (window.location.pathname.includes('brands.html')) {
        const params = new URLSearchParams(window.location.search);
        const categoryId = params.get('category');
        if (categoryId) loadBrandsCategoryProducts(categoryId);
      }
    });
  });
}

// ============================================================
// СТАРЫЕ ФУНКЦИИ (КОРЗИНА, АВТОРИЗАЦИЯ, ИЗБРАННОЕ, УВЕДОМЛЕНИЯ, НОВОСТИ, ФОН)
// ============================================================

// ---- Категории для фильтра (больше не используется на главной, но оставлю для совместимости) ----
function loadCategoriesForFilter() {
  // Можно удалить, но оставим пустым
}

// ---- Избранное ----
function loadFavorites() {
  if (!currentUser) return;
  fetch('/api/favorites')
    .then(res => res.json())
    .then(data => {
      favorites = data;
      renderProducts();
    })
    .catch(err => console.error('Ошибка загрузки избранного:', err));
}

function toggleFavorite(productId) {
  if (!currentUser) {
    alert('Войдите, чтобы добавить в избранное');
    return;
  }
  const isFav = favorites.includes(productId);
  fetch(`/api/favorites/${productId}`, {
    method: isFav ? 'DELETE' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: isFav ? null : JSON.stringify({ productId })
  })
    .then(res => res.json())
    .then(() => {
      loadFavorites();
    })
    .catch(err => console.error('Ошибка избранного:', err));
}

// ---- Новости ----
function checkNews() {
  fetch('/api/news/latest')
    .then(res => res.json())
    .then(news => {
      if (news.length > 0 && document.getElementById('newsContent')) {
        document.getElementById('newsContent').innerHTML = news.map(n =>
          `<div style="margin-bottom:15px;"><h3>${n.title}</h3><p>${n.content}</p><small>${new Date(n.created_at).toLocaleDateString()}</small></div>`
        ).join('');
        if (newsOverlay) newsOverlay.classList.add('open');
      }
    })
    .catch(err => console.error('Ошибка загрузки новостей:', err));
}

function closeNews() {
  if (newsOverlay) newsOverlay.classList.remove('open');
}
if (closeNewsBtn) closeNewsBtn.addEventListener('click', closeNews);
if (newsCloseBtn) newsCloseBtn.addEventListener('click', closeNews);
if (newsOverlay) {
  newsOverlay.addEventListener('click', (e) => {
    if (e.target === newsOverlay) closeNews();
  });
}

// ---- Аутентификация ----
function loadUser() {
  fetch('/api/auth/me')
    .then(res => res.json())
    .then(data => {
      if (data.user) {
        currentUser = data.user;
        const authBtns = document.getElementById('authButtons');
        const userInfoDiv = document.getElementById('userInfo');
        const userNameSpan = document.getElementById('userName');
        if (authBtns) authBtns.style.display = 'none';
        if (userInfoDiv) userInfoDiv.style.display = 'flex';
        if (userNameSpan) userNameSpan.textContent = `${data.user.first_name} ${data.user.last_name}`;
        checkAdminStatus();
        loadFavorites();
        checkNews();
      } else {
        currentUser = null;
        const authBtns = document.getElementById('authButtons');
        const userInfoDiv = document.getElementById('userInfo');
        const adminLink = document.getElementById('adminLink');
        if (authBtns) authBtns.style.display = 'flex';
        if (userInfoDiv) userInfoDiv.style.display = 'none';
        if (adminLink) adminLink.style.display = 'none';
      }
    })
    .catch(err => console.error('Ошибка загрузки пользователя:', err));
}

function checkAdminStatus() {
  fetch('/api/admin/status')
    .then(res => res.json())
    .then(data => {
      const adminLink = document.getElementById('adminLink');
      if (adminLink) {
        if (data.isAdmin) {
          adminLink.style.display = 'flex';
          console.log('✅ Кнопка админки показана');
        } else {
          adminLink.style.display = 'none';
        }
      }
    })
    .catch(() => {
      const adminLink = document.getElementById('adminLink');
      if (adminLink) adminLink.style.display = 'none';
    });
}

// ---- Вход ----
const loginBtn = document.getElementById('loginBtn');
const closeLoginBtn = document.getElementById('closeLoginBtn');
const loginForm = document.getElementById('loginForm');
const loginInput = document.getElementById('loginInput');
const passwordInput = document.getElementById('passwordInput');
const loginError = document.getElementById('loginError');
const loginOverlayElem = document.getElementById('loginOverlay');

if (loginBtn) {
  loginBtn.addEventListener('click', () => {
    if (loginOverlayElem) loginOverlayElem.classList.add('open');
  });
}
if (closeLoginBtn) {
  closeLoginBtn.addEventListener('click', () => {
    if (loginOverlayElem) loginOverlayElem.classList.remove('open');
  });
}
if (loginForm) {
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const login = loginInput.value;
    const password = passwordInput.value;
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          if (loginOverlayElem) loginOverlayElem.classList.remove('open');
          loginForm.reset();
          loadUser();
          loadCart();
        } else {
          if (loginError) loginError.textContent = data.error || 'Ошибка входа';
        }
      })
      .catch(() => {
        if (loginError) loginError.textContent = 'Ошибка соединения';
      });
  });
}

// ---- Регистрация ----
const registerBtn = document.getElementById('registerBtn');
const closeRegisterBtn = document.getElementById('closeRegisterBtn');
const registerForm = document.getElementById('registerForm');
const registerOverlayElem = document.getElementById('registerOverlay');
const regFirstName = document.getElementById('regFirstName');
const regLastName = document.getElementById('regLastName');
const regLogin = document.getElementById('regLogin');
const regPassword = document.getElementById('regPassword');
const registerError = document.getElementById('registerError');

if (registerBtn) {
  registerBtn.addEventListener('click', () => {
    if (registerOverlayElem) registerOverlayElem.classList.add('open');
  });
}
if (closeRegisterBtn) {
  closeRegisterBtn.addEventListener('click', () => {
    if (registerOverlayElem) registerOverlayElem.classList.remove('open');
  });
}
if (registerForm) {
  registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const firstName = regFirstName.value;
    const lastName = regLastName.value;
    const login = regLogin.value;
    const password = regPassword.value;
    fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, lastName, login, password })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          if (registerOverlayElem) registerOverlayElem.classList.remove('open');
          registerForm.reset();
          loadUser();
          loadCart();
        } else {
          if (registerError) registerError.textContent = data.error || 'Ошибка регистрации';
        }
      })
      .catch(() => {
        if (registerError) registerError.textContent = 'Ошибка соединения';
      });
  });
}

// ---- Выход ----
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    fetch('/api/auth/logout', { method: 'POST' })
      .then(() => {
        loadUser();
        loadCart();
      });
  });
}

// ---- Восстановление ----
const forgotLoginBtn = document.getElementById('forgotLoginBtn');
const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
const recoverOverlay = document.getElementById('recoverOverlay');
const closeRecoverBtn = document.getElementById('closeRecoverBtn');
const recoverFirstName = document.getElementById('recoverFirstName');
const recoverLastName = document.getElementById('recoverLastName');
const recoverSearchBtn = document.getElementById('recoverSearchBtn');
const recoverStep1 = document.getElementById('recoverStep1');
const recoverStep2 = document.getElementById('recoverStep2');
const recoveredLogin = document.getElementById('recoveredLogin');
const recoverNewPassword = document.getElementById('recoverNewPassword');
const recoverResetBtn = document.getElementById('recoverResetBtn');
const recoverMessage = document.getElementById('recoverMessage');
const recoverError = document.getElementById('recoverError');

if (forgotLoginBtn) {
  forgotLoginBtn.addEventListener('click', () => {
    if (loginOverlayElem) loginOverlayElem.classList.remove('open');
    if (recoverOverlay) recoverOverlay.classList.add('open');
    if (recoverStep1) recoverStep1.style.display = 'block';
    if (recoverStep2) recoverStep2.style.display = 'none';
    if (recoverMessage) recoverMessage.textContent = '';
    if (recoverError) recoverError.textContent = '';
  });
}
if (forgotPasswordBtn) {
  forgotPasswordBtn.addEventListener('click', () => {
    if (loginOverlayElem) loginOverlayElem.classList.remove('open');
    if (recoverOverlay) recoverOverlay.classList.add('open');
    if (recoverStep1) recoverStep1.style.display = 'block';
    if (recoverStep2) recoverStep2.style.display = 'none';
    if (recoverMessage) recoverMessage.textContent = '';
    if (recoverError) recoverError.textContent = '';
  });
}
if (closeRecoverBtn) {
  closeRecoverBtn.addEventListener('click', () => {
    if (recoverOverlay) recoverOverlay.classList.remove('open');
  });
}
if (recoverSearchBtn) {
  recoverSearchBtn.addEventListener('click', () => {
    const firstName = recoverFirstName.value;
    const lastName = recoverLastName.value;
    if (!firstName || !lastName) {
      if (recoverError) recoverError.textContent = 'Введите имя и фамилию';
      return;
    }
    fetch('/api/auth/recover-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, lastName })
    })
      .then(res => res.json())
      .then(data => {
        if (data.login) {
          if (recoveredLogin) recoveredLogin.textContent = data.login;
          if (recoverStep1) recoverStep1.style.display = 'none';
          if (recoverStep2) recoverStep2.style.display = 'block';
          if (recoverError) recoverError.textContent = '';
          if (recoverMessage) recoverMessage.textContent = '';
        } else {
          if (recoverError) recoverError.textContent = data.error || 'Пользователь не найден';
        }
      })
      .catch(() => {
        if (recoverError) recoverError.textContent = 'Ошибка соединения';
      });
  });
}
if (recoverResetBtn) {
  recoverResetBtn.addEventListener('click', () => {
    const firstName = recoverFirstName.value;
    const lastName = recoverLastName.value;
    const login = recoveredLogin ? recoveredLogin.textContent : '';
    const newPassword = recoverNewPassword.value;
    if (!newPassword) {
      if (recoverError) recoverError.textContent = 'Введите новый пароль';
      return;
    }
    fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, lastName, login, newPassword })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          if (recoverMessage) recoverMessage.textContent = 'Пароль успешно изменён!';
          if (recoverError) recoverError.textContent = '';
          setTimeout(() => {
            if (recoverOverlay) recoverOverlay.classList.remove('open');
            if (recoverStep2) recoverStep2.style.display = 'none';
            if (recoverStep1) recoverStep1.style.display = 'block';
            if (recoverNewPassword) recoverNewPassword.value = '';
            if (recoverMessage) recoverMessage.textContent = '';
          }, 2000);
        } else {
          if (recoverError) recoverError.textContent = data.error || 'Ошибка сброса пароля';
        }
      })
      .catch(() => {
        if (recoverError) recoverError.textContent = 'Ошибка соединения';
      });
  });
}

// ---- Корзина ----
function loadCart() {
  fetch('/api/cart')
    .then(res => res.json())
    .then(data => {
      cart = data;
      updateCartUI();
    })
    .catch(err => console.error('Ошибка загрузки корзины:', err));
}

function addToCart(productId, quantity = 1) {
  const existing = cart.find(item => item.productId === productId);
  const newQty = existing ? existing.quantity + quantity : quantity;
  fetch('/api/cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId, quantity: newQty })
  })
    .then(res => res.json())
    .then(updatedCart => {
      cart = updatedCart;
      updateCartUI();
    })
    .catch(err => console.error('Ошибка добавления в корзину:', err));
}

function removeFromCart(productId) {
  fetch(`/api/cart/${productId}`, { method: 'DELETE' })
    .then(res => res.json())
    .then(updatedCart => {
      cart = updatedCart;
      updateCartUI();
    })
    .catch(err => console.error('Ошибка удаления из корзины:', err));
}

function updateCartUI() {
  if (!cartItems || !cartTotal || !cartCount) {
    console.warn('Элементы корзины не найдены');
    return;
  }
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  cartCount.textContent = count;

  if (cart.length === 0) {
    cartItems.innerHTML = `<li class="cart-empty">Корзина пуста 🛒</li>`;
    cartTotal.textContent = '0 ₽';
    return;
  }

  fetch('/api/products')
    .then(res => res.json())
    .then(data => {
      const allProducts = data.items || data;
      let total = 0;
      const itemsHtml = cart.map(item => {
        const product = allProducts.find(p => p.id === item.productId);
        if (!product) return '';
        const price = product.price;
        const subtotal = price * item.quantity;
        total += subtotal;
        return `
          <li class="cart-item">
            <div class="item-info">
              <span class="item-name">${product.name}</span>
              <span class="item-price">${price} ₽ × ${item.quantity}</span>
            </div>
            <div class="item-qty">
              <button data-id="${product.id}" data-action="decr">−</button>
              <span class="qty-num">${item.quantity}</span>
              <button data-id="${product.id}" data-action="incr">+</button>
              <span class="item-total">${subtotal} ₽</span>
            </div>
          </li>
        `;
      }).join('');
      cartItems.innerHTML = itemsHtml;
      cartTotal.textContent = total + ' ₽';

      document.querySelectorAll('.cart-item .item-qty button').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = parseInt(e.target.dataset.id);
          const action = e.target.dataset.action;
          const current = cart.find(item => item.productId === id);
          if (!current) return;
          if (action === 'incr') {
            addToCart(id, 1);
          } else if (action === 'decr') {
            if (current.quantity > 1) {
              addToCart(id, -1);
            } else {
              removeFromCart(id);
            }
          }
        });
      });
    })
    .catch(err => console.error('Ошибка обновления корзины:', err));
}

// ---- Оформление заказа ----
if (checkoutBtn) {
  checkoutBtn.addEventListener('click', async () => {
    if (cart.length === 0) {
      alert('Корзина пуста');
      return;
    }
    if (!currentUser) {
      const loginOverlay2 = document.getElementById('loginOverlay');
      if (loginOverlay2) loginOverlay2.classList.add('open');
      return;
    }
    try {
      const response = await fetch('/api/orders', { method: 'POST' });
      const data = await response.json();
      if (data.error) {
        alert(data.error);
      } else {
        alert(`Заказ №${data.orderId} создан! Сумма: ${data.total} ₽`);
        loadCart();
        closeCart();
      }
    } catch (err) {
      alert('Ошибка соединения');
    }
  });
}

// ---- Открытие/закрытие корзины ----
function openCart() {
  if (cartOverlay) cartOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  loadCart();
}
function closeCart() {
  if (cartOverlay) cartOverlay.classList.remove('open');
  document.body.style.overflow = '';
}
if (openCartBtn) openCartBtn.addEventListener('click', openCart);
if (closeCartBtn) closeCartBtn.addEventListener('click', closeCart);
if (cartOverlay) {
  cartOverlay.addEventListener('click', (e) => {
    if (e.target === cartOverlay) closeCart();
  });
}

// ---- Поиск в хедере ----
const headerSearchInput = document.getElementById('headerSearchInput');
const headerSearchBtn = document.getElementById('headerSearchBtn');

if (headerSearchInput) {
  headerSearchInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      handleHeaderSearch();
    }
  });
}
if (headerSearchBtn) {
  headerSearchBtn.addEventListener('click', handleHeaderSearch);
}

function handleHeaderSearch() {
  const query = document.getElementById('headerSearchInput').value.trim();
  if (query) {
    // Можно перенаправить на страницу поиска или использовать текущую страницу
    // Для примера перейдём на brands.html с параметром search (если хотите)
    // Но лучше создать отдельную страницу search.html, но для простоты:
    window.location.href = `/brands.html?search=${encodeURIComponent(query)}`;
  }
}

// ---- Закрытие модалок по клику вне ----
[document.getElementById('loginOverlay'), document.getElementById('registerOverlay'), document.getElementById('recoverOverlay'), document.getElementById('notifOverlay')].forEach(overlay => {
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('open');
      }
    });
  }
});

// ---- Уведомления ----
let notifications = [];
let notifInterval = null;

function loadNotifications() {
  fetch('/api/notifications')
    .then(res => res.json())
    .then(data => {
      notifications = data;
      updateNotifBadge();
      if (notifications.length > 0) {
        showToast(notifications[0].message);
      }
    })
    .catch(err => console.error('Ошибка загрузки уведомлений:', err));
}

function updateNotifBadge() {
  if (!notifBadge) return;
  const count = notifications.length;
  if (count > 0) {
    notifBadge.textContent = count;
    notifBadge.style.display = 'inline';
  } else {
    notifBadge.style.display = 'none';
  }
}

function markAllRead() {
  fetch('/api/notifications/read', { method: 'POST' })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        notifications = [];
        updateNotifBadge();
        if (notifOverlay) notifOverlay.classList.remove('open');
        document.querySelectorAll('.toast').forEach(el => el.remove());
      }
    });
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('show');
  }, 100);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

function openNotifModal() {
  if (!notifList) return;
  if (notifications.length === 0) {
    notifList.innerHTML = '<p style="color:#7f8c8d;">Уведомлений нет</p>';
  } else {
    notifList.innerHTML = notifications.map(n =>
      `<div style="border-bottom:1px solid #ecf0f1; padding:8px 0;">
        <div>${n.message}</div>
        <small style="color:#7f8c8d;">${new Date(n.created_at).toLocaleString()}</small>
      </div>`
    ).join('');
  }
  if (notifOverlay) notifOverlay.classList.add('open');
}

function closeNotifModal() {
  if (notifOverlay) notifOverlay.classList.remove('open');
}

if (notifBtn) notifBtn.addEventListener('click', openNotifModal);
if (closeNotifBtn) closeNotifBtn.addEventListener('click', closeNotifModal);
if (notifOverlay) {
  notifOverlay.addEventListener('click', (e) => {
    if (e.target === notifOverlay) closeNotifModal();
  });
}
if (markReadBtn) markReadBtn.addEventListener('click', markAllRead);

function startNotifPolling() {
  loadNotifications();
  notifInterval = setInterval(loadNotifications, 30000);
}
startNotifPolling();

// ---- Фон ----
function applyBackground() {
  fetch('/api/background')
    .then(res => res.json())
    .then(data => {
      if (data.background) {
        document.body.style.backgroundImage = `url(${data.background})`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundAttachment = 'fixed';
        document.body.style.backgroundPosition = 'center';
        document.body.classList.add('has-bg');
      } else {
        document.body.style.backgroundImage = '';
        document.body.classList.remove('has-bg');
      }
    })
    .catch(err => console.error('Ошибка загрузки фона:', err));
}

// Переключение с входа на регистрацию
const switchToRegister = document.getElementById('switchToRegister');
if (switchToRegister) {
  switchToRegister.addEventListener('click', function(e) {
    e.preventDefault();
    const loginOverlay = document.getElementById('loginOverlay');
    const registerOverlay = document.getElementById('registerOverlay');
    if (loginOverlay) loginOverlay.classList.remove('open');
    if (registerOverlay) registerOverlay.classList.add('open');
  });
}

// ============================================================
// ОТЛАДКА: страница brands.html
// ============================================================

// Переопределяем функцию loadBrands для подробных логов
const originalLoadBrands = loadBrands;
loadBrands = function(categoryId) {
  console.log('📡 loadBrands вызвана с categoryId:', categoryId);
  fetch(`/api/brands?categoryId=${categoryId}`)
    .then(res => {
      console.log('📡 Статус /brands:', res.status);
      return res.json();
    })
    .then(brands => {
      console.log('📦 Бренды получены:', brands);
      const grid = document.getElementById('brandsGrid');
      console.log('🔍 Элемент #brandsGrid:', grid);
      if (!grid) {
        console.error('❌ #brandsGrid не найден!');
        return;
      }
      if (!brands.length) {
        grid.innerHTML = '<p style="text-align:center; padding:20px; color:#7f8c8d;">Брендов в этой категории пока нет.</p>';
        return;
      }
      grid.innerHTML = brands.map(b => `
        <div class="brand-card" data-id="${b.id}">
          ${b.image ? `<img src="${b.image}" alt="${b.name}">` : '<div class="placeholder">📦</div>'}
          <div class="brand-info">
            <div class="name">${b.name}</div>
          </div>
        </div>
      `).join('');
      console.log('✅ Бренды отрендерены');
      // Обработчики кликов
      document.querySelectorAll('.brand-card').forEach(el => {
        el.addEventListener('click', function() {
          window.location.href = `/brand.html?id=${this.dataset.id}`;
        });
      });
    })
    .catch(err => console.error('❌ Ошибка загрузки брендов:', err));
};

// Переопределяем функцию loadBrandsCategoryProducts
const originalLoadCategoryProducts = loadBrandsCategoryProducts;
loadBrandsCategoryProducts = function(categoryId) {
  const search = document.getElementById('brandsSearchInput')?.value?.trim() || '';
  const url = new URL('/api/products', window.location.origin);
  url.searchParams.append('category', categoryId);
  if (search) url.searchParams.append('search', search);
  url.searchParams.append('page', currentPage || 1);
  url.searchParams.append('limit', 12);
  console.log('📡 Запрос товаров:', url.toString());
  fetch(url)
    .then(res => {
      console.log('📡 Статус /products:', res.status);
      return res.json();
    })
    .then(data => {
      console.log('📦 Товары получены:', data);
      products = data.items || [];
      totalPages = data.totalPages || 1;
      currentPage = data.page || 1;
      // Проверяем, что productsGrid существует
      const grid = document.getElementById('productsGrid');
      console.log('🔍 Элемент #productsGrid:', grid);
      if (!grid) {
        console.error('❌ #productsGrid не найден!');
        return;
      }
      renderProducts();
      renderPagination();
    })
    .catch(err => console.error('❌ Ошибка загрузки товаров:', err));
};

// Также переопределим renderProducts, чтобы выводить лог
const originalRenderProducts = renderProducts;
renderProducts = function() {
  const grid = document.getElementById('productsGrid');
  console.log('🔍 renderProducts вызвана, #productsGrid:', grid);
  if (!grid) {
    console.error('❌ #productsGrid не найден в renderProducts');
    return;
  }
  if (!products.length) {
    grid.innerHTML = `<p style="grid-column:1/-1; text-align:center; padding:40px; color:#7f8c8d;">Товары не найдены</p>`;
    return;
  }
  grid.innerHTML = products.map(p => {
    const isFav = favorites.includes(p.id);
    return `
    <div class="product-card" data-id="${p.id}">
      <img class="product-img" src="${p.image || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23f0f2f5"/%3E%3Ctext x="50" y="55" text-anchor="middle" font-size="40" dy=".35em"%3E🥤%3C/text%3E%3C/svg%3E'}" alt="${p.name}">
      <div class="product-info">
        <div class="name">${p.name}</div>
        <div class="price">${p.price} ₽</div>
        ${p.volume_name ? `<div class="type">${p.volume_name}</div>` : ''}
        <div class="actions">
          <button class="add-btn" data-id="${p.id}">➕ В корзину</button>
          <button class="fav-btn ${isFav?'active':''}" data-id="${p.id}">${isFav?'❤️':'🤍'}</button>
        </div>
      </div>
    </div>`;
  }).join('');
  console.log('✅ Товары отрендерены, количество:', products.length);
  // Обработчики
  document.querySelectorAll('.add-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      addToCart(parseInt(btn.dataset.id));
    });
  });
  document.querySelectorAll('.fav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(parseInt(btn.dataset.id));
    });
  });
  document.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', function(e) {
      if (e.target.closest('button')) return;
      window.location.href = `/product.html?id=${this.dataset.id}`;
    });
  });
};

// Переопределим renderPagination с логами
const originalRenderPagination = renderPagination;
renderPagination = function() {
  const pag = document.getElementById('pagination');
  console.log('🔍 renderPagination вызвана, #pagination:', pag);
  if (!pag) {
    console.error('❌ #pagination не найден');
    return;
  }
  if (totalPages <= 1) {
    pag.innerHTML = '';
    return;
  }
  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="page-btn ${i===currentPage?'active':''}" data-page="${i}">${i}</button>`;
  }
  pag.innerHTML = html;
  pag.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPage = parseInt(btn.dataset.page);
      if (window.location.pathname.includes('brand.html')) {
        loadProductsForBrand(currentBrandId, currentVolumeId);
      } else if (window.location.pathname.includes('brands.html')) {
        const params = new URLSearchParams(window.location.search);
        const categoryId = params.get('category');
        if (categoryId) loadBrandsCategoryProducts(categoryId);
      }
    });
  });
  console.log('✅ Пагинация отрендерена');
};

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================
function init() {
  // Если главная страница — загружаем категории
  if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
    loadCategories();
  }

  // Загружаем корзину, пользователя, фон
  loadCart();
  loadUser();
  applyBackground();

  // Дополнительная проверка админ-статуса через 2 секунды
  setTimeout(checkAdminStatus, 2000);

  console.log('✅ Скрипт загружен. Главная — только категории.');
}

// Запуск
init();