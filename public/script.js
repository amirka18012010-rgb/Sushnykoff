// ============================================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ============================================================
let products = [], cart = [], currentUser = null, currentPage = 1, totalPages = 1, favorites = [];
let currentBrandId = null, currentVolumeId = null, currentSort = 'newest';
let socket = null;

// ============================================================
// КЕШИРОВАНИЕ В localStorage
// ============================================================
const CACHE_TTL = 5 * 60 * 1000; // 5 минут

function getCached(key) {
  try {
    const item = localStorage.getItem(key);
    if (!item) return null;
    const data = JSON.parse(item);
    if (Date.now() - data.timestamp > CACHE_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return data.value;
  } catch {
    return null;
  }
}

function setCache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify({
      timestamp: Date.now(),
      value: value
    }));
  } catch (err) {
    console.warn('Ошибка сохранения в кеш:', err);
  }
}

function clearCache(key) {
  if (key) {
    localStorage.removeItem(key);
  } else {
    // Очищаем все кеши товаров и категорий
    const keys = Object.keys(localStorage);
    keys.forEach(k => {
      if (k.startsWith('products_') || k === 'categories' || k === 'brands' || k === 'volumes') {
        localStorage.removeItem(k);
      }
    });
  }
}

// Генерируем ключ для кеша на основе URL параметров
function getCacheKey(url) {
  const urlObj = new URL(url);
  const params = new URLSearchParams(urlObj.search);
  params.delete('page');
  params.delete('limit');
  const sortedParams = new URLSearchParams([...params.entries()].sort());
  return `products_${urlObj.pathname}?${sortedParams.toString()}`;
}

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

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
// КАТЕГОРИИ (с кешированием и принудительной очисткой)
// ============================================================
function loadCategories(force = false) {
  if (!categoriesGrid) return;
  
  if (force) {
    clearCache('categories');
  }
  
  const cached = getCached('categories');
  if (cached) {
    renderCategories(cached);
    return;
  }
  
  fetch('/api/categories')
    .then(res => res.json())
    .then(cats => {
      setCache('categories', cats);
      renderCategories(cats);
    })
    .catch(err => console.error('Ошибка загрузки категорий:', err));
}

function renderCategories(cats) {
  if (!cats || !cats.length) {
    categoriesGrid.innerHTML = '<p>Категории не загружены</p>';
    return;
  }
  categoriesGrid.innerHTML = cats.map(c => {
    const content = c.image
      ? `<img class="category-img" src="${c.image}" alt="${c.name}" loading="lazy">`
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
}

function handleHeaderSearch() {
  const query = document.getElementById('headerSearchInput').value.trim();
  if (query) {
    window.location.href = `/brands.html?search=${encodeURIComponent(query)}`;
  }
}

if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
  // Главная — только категории
}

// ---- Страница brands.html ----
if (window.location.pathname.includes('brands.html')) {
  const params = new URLSearchParams(window.location.search);
  const categoryId = params.get('category');
  const searchQuery = params.get('search');

  document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('brandsSearchInput');
    const titleEl = document.getElementById('categoryTitle');
    const sortSelect = document.getElementById('sortSelect');

    if (searchInput && searchQuery) {
      searchInput.value = searchQuery;
    }

    if (categoryId) {
      loadBrands(categoryId);
      loadBrandsCategoryProducts(categoryId);
      if (titleEl) {
        titleEl.textContent = `Товары в категории`;
      }
    } else if (searchQuery) {
      if (titleEl) {
        titleEl.textContent = `Результаты поиска: «${searchQuery}»`;
      }
      const brandsGrid = document.getElementById('brandsGrid');
      if (brandsGrid) brandsGrid.style.display = 'none';
      loadSearchProducts(searchQuery);
    } else {
      if (titleEl) {
        titleEl.textContent = 'Все товары';
      }
      loadSearchProducts('');
    }

    if (searchInput) {
      searchInput.addEventListener('input', debounce(() => {
        const search = searchInput.value.trim();
        if (categoryId) {
          loadBrandsCategoryProducts(categoryId);
        } else {
          loadSearchProducts(search);
          if (titleEl) {
            titleEl.textContent = search ? `Результаты поиска: «${search}»` : 'Все товары';
          }
        }
      }, 300));
    }

    if (sortSelect) {
      sortSelect.addEventListener('change', function() {
        currentSort = this.value;
        clearCache(null);
        if (categoryId) {
          loadBrandsCategoryProducts(categoryId);
        } else {
          const search = searchInput ? searchInput.value.trim() : '';
          loadSearchProducts(search);
        }
      });
    }

    const resetBtn = document.getElementById('brandsResetSearchBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        clearCache(null);
        if (categoryId) {
          loadBrandsCategoryProducts(categoryId);
        } else {
          loadSearchProducts('');
          if (titleEl) titleEl.textContent = 'Все товары';
        }
      });
    }
  });
}

function loadBrands(categoryId) {
  fetch('/api/categories')
    .then(r => r.json())
    .then(cats => {
      const cat = cats.find(c => c.id == categoryId);
      const titleEl = document.getElementById('categoryTitle');
      if (titleEl && cat) {
        titleEl.textContent = `Бренды и товары в категории «${cat.name}»`;
      }
    });
  fetch(`/api/brands?categoryId=${categoryId}`)
    .then(res => res.json())
    .then(brands => {
      const grid = document.getElementById('brandsGrid');
      if (!grid) return;
      if (!brands.length) {
        grid.innerHTML = '<p>Брендов в этой категории пока нет.</p>';
        grid.style.display = 'block';
        return;
      }
      grid.style.display = 'grid';
      grid.innerHTML = brands.map(b => `
        <div class="brand-card" data-id="${b.id}">
          ${b.image ? `<img src="${b.image}" alt="${b.name}" loading="lazy">` : '<div class="placeholder">📦</div>'}
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
  url.searchParams.append('sort', currentSort);
  
  const cacheKey = getCacheKey(url.toString());
  const cached = getCached(cacheKey);
  if (cached) {
    products = cached.items;
    totalPages = cached.totalPages;
    currentPage = cached.page;
    renderProducts();
    renderPagination();
    return;
  }
  
  fetch(url)
    .then(res => res.json())
    .then(data => {
      products = data.items || [];
      totalPages = data.totalPages || 1;
      currentPage = data.page || 1;
      setCache(cacheKey, data);
      renderProducts();
      renderPagination();
    })
    .catch(err => console.error('Ошибка загрузки товаров категории:', err));
}

function loadSearchProducts(search) {
  const url = new URL('/api/products', window.location.origin);
  if (search) url.searchParams.append('search', search);
  url.searchParams.append('page', currentPage);
  url.searchParams.append('limit', 12);
  url.searchParams.append('sort', currentSort);
  
  const cacheKey = getCacheKey(url.toString());
  const cached = getCached(cacheKey);
  if (cached) {
    products = cached.items;
    totalPages = cached.totalPages;
    currentPage = cached.page;
    renderProducts();
    renderPagination();
    return;
  }
  
  fetch(url)
    .then(res => res.json())
    .then(data => {
      products = data.items || [];
      totalPages = data.totalPages || 1;
      currentPage = data.page || 1;
      setCache(cacheKey, data);
      renderProducts();
      renderPagination();
    })
    .catch(err => console.error('Ошибка загрузки товаров по поиску:', err));
}

// ---- Страница brand.html ----
if (window.location.pathname.includes('brand.html')) {
  const params = new URLSearchParams(window.location.search);
  const brandId = params.get('id');
  if (brandId) {
    currentBrandId = brandId;
    document.addEventListener('DOMContentLoaded', function() {
      loadBrand(brandId);
      const searchQuery = params.get('search');
      const searchInput = document.getElementById('brandSearchInput');
      const sortSelect = document.getElementById('sortSelect');
      if (searchInput && searchQuery) {
        searchInput.value = searchQuery;
      }
      loadProductsForBrand(brandId, currentVolumeId, searchQuery || '');
      if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
          const search = searchInput.value.trim();
          clearCache(null);
          loadProductsForBrand(brandId, currentVolumeId, search);
        }, 300));
      }
      if (sortSelect) {
        sortSelect.addEventListener('change', function() {
          currentSort = this.value;
          clearCache(null);
          const search = searchInput ? searchInput.value.trim() : '';
          loadProductsForBrand(brandId, currentVolumeId, search);
        });
      }
      const resetBtn = document.getElementById('brandResetSearchBtn');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          if (searchInput) searchInput.value = '';
          clearCache(null);
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
  url.searchParams.append('sort', currentSort);
  
  const cacheKey = getCacheKey(url.toString());
  const cached = getCached(cacheKey);
  if (cached) {
    products = cached.items;
    totalPages = cached.totalPages;
    currentPage = cached.page;
    renderProducts();
    renderPagination();
    loadVolumesFilter(brandId, volumeId);
    return;
  }
  
  fetch(url)
    .then(res => res.json())
    .then(data => {
      products = data.items || [];
      totalPages = data.totalPages || 1;
      currentPage = data.page || 1;
      setCache(cacheKey, data);
      renderProducts();
      renderPagination();
      loadVolumesFilter(brandId, volumeId);
    })
    .catch(err => console.error('Ошибка загрузки товаров бренда:', err));
}

function loadVolumesFilter(brandId, selectedVolumeId = null) {
  fetch(`/api/volumes?brandId=${brandId}`)
    .then(res => res.json())
    .then(volumes => {
      const container = document.getElementById('volumesFilter');
      if (!container) return;
      if (!volumes.length) { container.innerHTML = ''; return; }
      let html = `<button class="volume-btn ${selectedVolumeId === null ? 'active' : ''}" data-id="all">Все объёмы</button>`;
      volumes.forEach(v => {
        const isActive = (selectedVolumeId !== null && v.id == selectedVolumeId);
        html += `<button class="volume-btn ${isActive ? 'active' : ''}" data-id="${v.id}">${v.name}</button>`;
      });
      container.innerHTML = html;
      container.querySelectorAll('.volume-btn').forEach(btn => {
        btn.addEventListener('click', function() {
          container.querySelectorAll('.volume-btn').forEach(b => b.classList.remove('active'));
          this.classList.add('active');
          const vid = this.dataset.id === 'all' ? null : parseInt(this.dataset.id);
          currentVolumeId = vid;
          clearCache(null);
          const searchInput = document.getElementById('brandSearchInput');
          const search = searchInput ? searchInput.value.trim() : '';
          loadProductsForBrand(currentBrandId, vid, search);
        });
      });
    });
}

// ---- Универсальный рендер товаров (с lazy loading) ----
function renderProducts() {
  if (!productsGrid) return;
  if (!products.length) {
    productsGrid.innerHTML = `<p style="grid-column:1/-1; text-align:center; padding:40px; color:#7f8c8d;">Товары не найдены</p>`;
    return;
  }
  productsGrid.innerHTML = products.map(p => {
    const isFav = favorites.includes(p.id);
    const hasWholesale = p.wholesale_price && p.wholesale_price > 0;
    let priceHtml = `<span class="price">${p.price} ₽</span>`;
    if (hasWholesale) {
      priceHtml += ` <span class="price-separator">/</span> <span class="wholesale-price">${p.wholesale_price} ₽</span>`;
    }
    return `
    <div class="product-card" data-id="${p.id}">
      <img class="product-img" src="${p.image || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23f0f2f5"/%3E%3Ctext x="50" y="55" text-anchor="middle" font-size="40" dy=".35em"%3E🥤%3C/text%3E%3C/svg%3E'}" alt="${p.name}" loading="lazy">
      <div class="product-info">
        <div class="name">${p.name}</div>
        <div class="price-block">${priceHtml}</div>
        ${p.volume_name ? `<div class="type">${p.volume_name}</div>` : ''}
        <div class="actions" style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
          <button class="add-btn retail" data-id="${p.id}" data-price="retail">🛒 Розница</button>
          ${hasWholesale ? `<button class="add-btn wholesale" data-id="${p.id}" data-price="wholesale">📦 Опт</button>` : ''}
          <button class="fav-btn ${isFav?'active':''}" data-id="${p.id}">${isFav?'❤️':'🤍'}</button>
        </div>
      </div>
    </div>`;
  }).join('');

  document.querySelectorAll('.add-btn.retail').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      addToCart(parseInt(btn.dataset.id), 1, 'retail');
    });
  });
  document.querySelectorAll('.add-btn.wholesale').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      addToCart(parseInt(btn.dataset.id), 1, 'wholesale');
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
        const searchInput = document.getElementById('brandSearchInput');
        const search = searchInput ? searchInput.value.trim() : '';
        loadProductsForBrand(currentBrandId, currentVolumeId, search);
      } else if (window.location.pathname.includes('brands.html')) {
        const params = new URLSearchParams(window.location.search);
        const categoryId = params.get('category');
        const search = document.getElementById('brandsSearchInput')?.value?.trim() || '';
        if (categoryId) {
          loadBrandsCategoryProducts(categoryId);
        } else {
          loadSearchProducts(search);
        }
      }
    });
  });
}

// ---- СТРАНИЦА ИЗБРАННОГО ----
if (window.location.pathname.includes('favorites.html')) {
  document.addEventListener('DOMContentLoaded', function() {
    if (!currentUser) {
      document.getElementById('favoritesGrid').innerHTML = '<p style="grid-column:1/-1; text-align:center; padding:40px;">Войдите, чтобы просмотреть избранное ❤️</p>';
      return;
    }
    loadFavoritesPage();
  });
}

function loadFavoritesPage() {
  fetch('/api/favorites')
    .then(res => res.json())
    .then(favIds => {
      if (!favIds.length) {
        document.getElementById('favoritesGrid').innerHTML = '<p style="grid-column:1/-1; text-align:center; padding:40px;">У вас пока нет избранных товаров 💔</p>';
        return;
      }
      const ids = favIds.join(',');
      const url = new URL('/api/products', window.location.origin);
      url.searchParams.append('ids', ids);
      url.searchParams.append('limit', 50);
      
      const cacheKey = getCacheKey(url.toString());
      const cached = getCached(cacheKey);
      if (cached) {
        renderFavoritesProducts(cached.items || cached);
        return;
      }
      
      fetch(url)
        .then(res => res.json())
        .then(data => {
          const favProducts = data.items || data;
          setCache(cacheKey, favProducts);
          renderFavoritesProducts(favProducts);
        });
    })
    .catch(err => console.error('Ошибка загрузки избранного:', err));
}

function renderFavoritesProducts(favProducts) {
  const grid = document.getElementById('favoritesGrid');
  if (!grid) return;
  if (!favProducts.length) {
    grid.innerHTML = '<p style="grid-column:1/-1; text-align:center; padding:40px;">У вас пока нет избранных товаров 💔</p>';
    return;
  }
  grid.innerHTML = favProducts.map(p => {
    const hasWholesale = p.wholesale_price && p.wholesale_price > 0;
    let priceHtml = `<span class="price">${p.price} ₽</span>`;
    if (hasWholesale) {
      priceHtml += ` <span class="price-separator">/</span> <span class="wholesale-price">${p.wholesale_price} ₽</span>`;
    }
    return `
    <div class="product-card" data-id="${p.id}">
      <img class="product-img" src="${p.image || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23f0f2f5"/%3E%3Ctext x="50" y="55" text-anchor="middle" font-size="40" dy=".35em"%3E🥤%3C/text%3E%3C/svg%3E'}" alt="${p.name}" loading="lazy">
      <div class="product-info">
        <div class="name">${p.name}</div>
        <div class="price-block">${priceHtml}</div>
        ${p.volume_name ? `<div class="type">${p.volume_name}</div>` : ''}
        <div class="actions" style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
          <button class="add-btn retail" data-id="${p.id}" data-price="retail">🛒 Розница</button>
          ${hasWholesale ? `<button class="add-btn wholesale" data-id="${p.id}" data-price="wholesale">📦 Опт</button>` : ''}
          <button class="fav-btn active" data-id="${p.id}">❤️</button>
        </div>
      </div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.add-btn.retail').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      addToCart(parseInt(btn.dataset.id), 1, 'retail');
    });
  });
  grid.querySelectorAll('.add-btn.wholesale').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      addToCart(parseInt(btn.dataset.id), 1, 'wholesale');
    });
  });
  grid.querySelectorAll('.fav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(parseInt(btn.dataset.id));
      loadFavoritesPage();
    });
  });
  grid.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', function(e) {
      if (e.target.closest('button')) return;
      window.location.href = `/product.html?id=${this.dataset.id}`;
    });
  });
}

// ============================================================
// ИЗБРАННОЕ (общее)
// ============================================================
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

// ============================================================
// КОРЗИНА (с поддержкой БД и синхронизацией)
// ============================================================
function loadCart() {
  return fetch('/api/cart')
    .then(res => res.json())
    .then(data => {
      cart = data;
      updateCartUI();
    })
    .catch(err => console.error('Ошибка загрузки корзины:', err));
}

function addToCart(productId, quantity = 1, priceType = 'retail') {
  const existing = cart.find(item => item.productId === productId && item.priceType === priceType);
  const newQty = existing ? existing.quantity + quantity : quantity;
  fetch('/api/cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId, quantity: newQty, priceType })
  })
    .then(res => res.json())
    .then(updatedCart => {
      cart = updatedCart;
      updateCartUI();
    })
    .catch(err => console.error('Ошибка добавления в корзину:', err));
}

function removeFromCart(productId, priceType = 'retail') {
  fetch(`/api/cart/${productId}?priceType=${priceType}`, { method: 'DELETE' })
    .then(res => res.json())
    .then(updatedCart => {
      cart = updatedCart;
      updateCartUI();
    })
    .catch(err => console.error('Ошибка удаления из корзины:', err));
}

function syncCart() {
  if (!currentUser) return;
  return fetch('/api/cart/sync', { method: 'POST' })
    .then(res => res.json())
    .then(updatedCart => {
      cart = updatedCart;
      updateCartUI();
    })
    .catch(err => console.error('Ошибка синхронизации корзины:', err));
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
        const price = item.price || product.price;
        const subtotal = price * item.quantity;
        total += subtotal;
        const typeLabel = (item.priceType === 'wholesale') ? ' (опт)' : '';
        return `
          <li class="cart-item" data-id="${item.productId}" data-type="${item.priceType}">
            <div class="item-info">
              <span class="item-name">${product.name}${typeLabel}</span>
              <span class="item-price">${price} ₽ × </span>
              <input type="number" class="qty-input" min="1" value="${item.quantity}" data-id="${item.productId}" data-type="${item.priceType}" style="width:60px; padding:4px 8px; border-radius:8px; border:1px solid #ddd;">
            </div>
            <div class="item-qty">
              <button data-id="${item.productId}" data-type="${item.priceType}" data-action="decr">−</button>
              <span class="qty-num">${item.quantity}</span>
              <button data-id="${item.productId}" data-type="${item.priceType}" data-action="incr">+</button>
              <span class="item-total">${subtotal} ₽</span>
              <button class="remove-item" data-id="${item.productId}" data-type="${item.priceType}" style="background:none; border:none; color:#e74c3c; font-size:18px; cursor:pointer;">✖</button>
            </div>
          </li>
        `;
      }).join('');
      cartItems.innerHTML = itemsHtml;
      cartTotal.textContent = total + ' ₽';

      document.querySelectorAll('.cart-item .item-qty button[data-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = parseInt(e.target.dataset.id);
          const type = e.target.dataset.type;
          const action = e.target.dataset.action;
          const current = cart.find(item => item.productId === id && item.priceType === type);
          if (!current) return;
          if (action === 'incr') {
            addToCart(id, 1, type);
          } else if (action === 'decr') {
            if (current.quantity > 1) {
              addToCart(id, -1, type);
            } else {
              removeFromCart(id, type);
            }
          }
        });
      });

      document.querySelectorAll('.qty-input').forEach(input => {
        input.addEventListener('change', function() {
          const id = parseInt(this.dataset.id);
          const type = this.dataset.type;
          const newQty = parseInt(this.value);
          if (isNaN(newQty) || newQty < 1) {
            this.value = 1;
            return;
          }
          const current = cart.find(item => item.productId === id && item.priceType === type);
          if (!current) return;
          const diff = newQty - current.quantity;
          if (diff !== 0) {
            addToCart(id, diff, type);
          }
        });
        input.addEventListener('blur', function() {
          if (this.value === '' || parseInt(this.value) < 1) {
            this.value = 1;
          }
        });
      });

      document.querySelectorAll('.remove-item').forEach(btn => {
        btn.addEventListener('click', function() {
          const id = parseInt(this.dataset.id);
          const type = this.dataset.type;
          if (confirm('Удалить товар из корзины?')) {
            removeFromCart(id, type);
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
        clearCache(null);
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

// ============================================================
// НОВОСТИ (с кешированием)
// ============================================================
function checkNews() {
  const cached = getCached('news');
  if (cached) {
    renderNews(cached);
    return;
  }
  fetch('/api/news/latest')
    .then(res => res.json())
    .then(news => {
      setCache('news', news);
      renderNews(news);
    })
    .catch(err => console.error('Ошибка загрузки новостей:', err));
}

function renderNews(news) {
  if (news.length > 0 && document.getElementById('newsContent')) {
    document.getElementById('newsContent').innerHTML = news.map(n =>
      `<div style="margin-bottom:15px;"><h3>${n.title}</h3><p>${n.content}</p><small>${new Date(n.created_at).toLocaleDateString()}</small></div>`
    ).join('');
    if (newsOverlay) newsOverlay.classList.add('open');
  }
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

// ============================================================
// АУТЕНТИФИКАЦИЯ (с параллельной загрузкой)
// ============================================================
function loadUser() {
  return fetch('/api/auth/me')
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
        initSocket();
        if (socket) {
          socket.emit('register-user', { userId: currentUser.id });
        }
        return syncCart();
      } else {
        currentUser = null;
        const authBtns = document.getElementById('authButtons');
        const userInfoDiv = document.getElementById('userInfo');
        const adminLink = document.getElementById('adminLink');
        if (authBtns) authBtns.style.display = 'flex';
        if (userInfoDiv) userInfoDiv.style.display = 'none';
        if (adminLink) adminLink.style.display = 'none';
        if (socket) {
          socket.disconnect();
          socket = null;
        }
        return loadCart();
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

// ---- Вход (добавлен syncCart) ----
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
          clearCache(null);
          loadUser();
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
        clearCache(null);
        loadUser();
      });
  });
}

// ---- Восстановление (без изменений) ----
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

// ============================================================
// УВЕДОМЛЕНИЯ (тосты и список)
// ============================================================
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

// ---- Фон (с кешированием) ----
function applyBackground() {
  const cached = getCached('background');
  if (cached) {
    applyBackgroundStyle(cached);
    return Promise.resolve();
  }
  return fetch('/api/background')
    .then(res => res.json())
    .then(data => {
      const bg = data.background || '';
      setCache('background', bg);
      applyBackgroundStyle(bg);
    })
    .catch(err => console.error('Ошибка загрузки фона:', err));
}

function applyBackgroundStyle(bg) {
  if (bg) {
    document.body.style.backgroundImage = `url(${bg})`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundAttachment = 'fixed';
    document.body.style.backgroundPosition = 'center';
    document.body.classList.add('has-bg');
  } else {
    document.body.style.backgroundImage = '';
    document.body.classList.remove('has-bg');
  }
}

// ---- Переключение на регистрацию ----
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
// WEBSOCKET (Socket.IO)
// ============================================================
function initSocket() {
  if (!socket) {
    socket = io({ transports: ['websocket'] });
    socket.on('connect', () => {
      console.log('🔌 Сокет подключён');
      if (currentUser) {
        socket.emit('register-user', { userId: currentUser.id });
      }
    });
    socket.on('new-order', (data) => {
      showToast(data.message);
    });
    socket.on('order-status-changed', (data) => {
      showToast(data.message);
    });
  }
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ (с параллельными запросами)
// ============================================================
async function init() {
  console.log('🚀 Загрузка сайта...');
  
  if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
    loadCategories();
  }
  
  await Promise.all([
    loadUser(),
    loadCart(),
    applyBackground(),
    checkAdminStatus()
  ]);
  
  console.log('✅ Все данные загружены');
}

init();