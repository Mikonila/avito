const tg = window.Telegram?.WebApp;
const MAX_IMAGE_COUNT = 4;
const MAX_IMAGE_SIZE_BYTES = 1572864;
const FALLBACK_TELEGRAM_ID_KEY = 'fallback_telegram_id';
const CLOTHING_CATEGORY_ID = 'cat-5';
const SUPPORT_LINK = 'https://t.me/helionstudio';
const PROMOTION_PLANS = {
    day: { label: '1 день', stars: 100 },
    three_days: { label: '3 дня', stars: 150 },
    week: { label: '7 дней', stars: 250 }
};

let state = {
    user: null,
    categories: [],
    cities: [],
    currentListings: [],
    homeListings: [],
    currentServices: [],
    images: [],
    serviceImages: [],
    adImages: [],
    reviewScreenshot: null,
    selectedItem: null,
    viewedProfileId: null,
    promotionListingId: null,
    filters: {
        categoryId: '',
        cityId: '',
        minPrice: '',
        maxPrice: '',
        sort: 'default'
    }
};

const API_BASE = '/api';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        if (tg) {
            tg.ready();
            tg.expand();
        }

        document.getElementById('loading').style.display = 'none';

        await loadReferences();
        const user = await registerUser();

        if (!user) {
            alert('Не удалось загрузить профиль пользователя');
            return;
        }

        state.user = user;
        showMainApp();
        attachEventListeners();
    } catch (error) {
        console.error('Initialization error:', error);
        alert('Ошибка при инициализации');
    }
});

function getTelegramUser() {
    return tg?.initDataUnsafe?.user || null;
}

function getFallbackTelegramId() {
    let fallbackId = localStorage.getItem(FALLBACK_TELEGRAM_ID_KEY);

    if (!fallbackId) {
        fallbackId = `web-user-${Date.now()}`;
        localStorage.setItem(FALLBACK_TELEGRAM_ID_KEY, fallbackId);
    }

    return fallbackId;
}

function getTelegramId() {
    return String(getTelegramUser()?.id || getFallbackTelegramId());
}

function getAuthHeaders(includeJson = true) {
    const headers = {};

    if (includeJson) {
        headers['Content-Type'] = 'application/json';
    }

    if (state.user?.id) {
        headers['x-user-id'] = state.user.id;
    }

    const telegramId = getTelegramId();
    if (telegramId) {
        headers['x-telegram-id'] = telegramId;
    }

    return headers;
}

function getTelegramPayload() {
    const telegramUser = getTelegramUser();

    return {
        telegram_id: getTelegramId(),
        first_name: telegramUser?.first_name || '',
        last_name: telegramUser?.last_name || '',
        username: telegramUser?.username || '',
        avatar_url: telegramUser?.photo_url || ''
    };
}

function getCityName(value) {
    const city = state.cities.find((item) => item.id === value || item.name === value);
    return city?.name || value || 'Не указан';
}

function getCategoryById(categoryId) {
    return state.categories.find((category) => category.id === categoryId) || null;
}

function getCategoryName(categoryId) {
    return getCategoryById(categoryId)?.name || 'Без категории';
}

function getSubcategoryName(categoryId, subcategoryId) {
    if (!subcategoryId) {
        return '';
    }

    const category = getCategoryById(categoryId);
    return category?.subcategories?.find((item) => item.id === subcategoryId)?.name || subcategoryId;
}

function getProfileDisplayName(user) {
    return [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.username || 'Пользователь';
}

function getAvatarMarkup(avatarUrl, fallbackText = '👤') {
    if (avatarUrl) {
        return `<img src="${avatarUrl}" alt="Аватар" class="review-avatar-image">`;
    }

    return `<span class="review-avatar-fallback">${fallbackText}</span>`;
}

function updateSearchTriggerLabel() {
    const cityName = state.filters.cityId ? getCityName(state.filters.cityId) : 'по всей Черногории';
    const categoryName = state.filters.categoryId ? getCategoryName(state.filters.categoryId) : 'во всех категориях';
    const label = `Поиск ${categoryName.toLowerCase()} ${cityName}`;
    const target = document.getElementById('searchTriggerLabel');

    if (target) {
        target.textContent = label;
    }
}

async function registerUser() {
    try {
        const response = await fetch(`${API_BASE}/users/register`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(getTelegramPayload())
        });

        if (!response.ok) {
            throw new Error('Не удалось создать профиль');
        }

        const user = await response.json();
        localStorage.setItem('user_id', user.id);
        return user;
    } catch (error) {
        console.error('Registration error:', error);
        return null;
    }
}

async function loadReferences() {
    try {
        const [categoriesRes, citiesRes] = await Promise.all([
            fetch(`${API_BASE}/reference/categories`),
            fetch(`${API_BASE}/reference/cities`)
        ]);

        state.categories = await categoriesRes.json();
        state.cities = await citiesRes.json();
        populateSelects();
    } catch (error) {
        console.error('Error loading references:', error);
    }
}

function populateSelectElement(select, options, placeholder) {
    if (!select) {
        return;
    }

    select.innerHTML = '';

    if (placeholder !== null) {
        const placeholderOption = document.createElement('option');
        placeholderOption.value = '';
        placeholderOption.textContent = placeholder;
        select.appendChild(placeholderOption);
    }

    options.forEach((item) => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.name;
        select.appendChild(option);
    });
}

function populateSelects() {
    const productCategorySelect = document.querySelector('#productForm .listing-form .form-row select');
    const serviceCategorySelect = document.querySelector('#serviceForm .listing-form .form-row select');
    const productCitySelect = document.querySelectorAll('#productForm .listing-form .form-row select')[2];
    const serviceCitySelect = document.querySelectorAll('#serviceForm .listing-form .form-row select')[2];

    populateSelectElement(document.getElementById('citySelect'), state.cities, 'Все города');
    populateSelectElement(document.getElementById('profileCitySelect'), state.cities, 'Не указан');

    populateSelectElement(productCategorySelect, state.categories, null);
    populateSelectElement(productCitySelect, state.cities, null);
    populateSelectElement(serviceCategorySelect, state.categories, null);
    populateSelectElement(serviceCitySelect, state.cities, null);

    populateSubcategorySelect('product');
    populateSubcategorySelect('service');
    renderCategoryShowcase();
    renderFilterCategoryChips();
    updateSearchTriggerLabel();
}

function showMainApp() {
    document.getElementById('mainApp').classList.remove('hidden');
    loadRandomListings();
}

window.openSupportChat = function() {
    if (tg?.openTelegramLink) {
        tg.openTelegramLink(SUPPORT_LINK);
        return;
    }

    window.open(SUPPORT_LINK, '_blank', 'noopener,noreferrer');
};

function renderCategoryShowcase() {
    const container = document.getElementById('categoryShowcase');

    if (!container) {
        return;
    }

    container.innerHTML = state.categories.map((category, index) => `
        <button
            type="button"
            class="category-tile category-tile-${(index % 6) + 1} ${state.filters.categoryId === category.id ? 'active' : ''}"
            data-category-tile="${category.id}"
        >
            <div class="category-tile-copy">
                <strong>${category.name}</strong>
                <span>${category.subcategories?.length ? `${category.subcategories.length} раздела` : 'Открыть объявления'}</span>
            </div>
            <div class="category-tile-icon">${category.icon || '📦'}</div>
        </button>
    `).join('');

    container.querySelectorAll('[data-category-tile]').forEach((button) => {
        button.addEventListener('click', () => {
            state.filters.categoryId = button.dataset.categoryTile;
            syncFilterUi();
            closeFiltersModal();
            performSearch();
        });
    });
}

function renderFilterCategoryChips() {
    const container = document.getElementById('filterCategoryChips');

    if (!container) {
        return;
    }

    const allChip = `
        <button type="button" class="filter-chip ${!state.filters.categoryId ? 'active' : ''}" data-filter-category="">
            Все
        </button>
    `;

    const categoryChips = state.categories.map((category) => `
        <button
            type="button"
            class="filter-chip ${state.filters.categoryId === category.id ? 'active' : ''}"
            data-filter-category="${category.id}"
        >
            ${category.name}
        </button>
    `).join('');

    container.innerHTML = allChip + categoryChips;

    container.querySelectorAll('[data-filter-category]').forEach((button) => {
        button.addEventListener('click', () => {
            state.filters.categoryId = button.dataset.filterCategory;
            syncFilterUi();
        });
    });
}

function syncFilterUi() {
    const citySelect = document.getElementById('citySelect');
    const minPriceInput = document.getElementById('minPriceInput');
    const maxPriceInput = document.getElementById('maxPriceInput');
    const sortInput = document.querySelector(`input[name="sortOption"][value="${state.filters.sort}"]`);

    if (citySelect) {
        citySelect.value = state.filters.cityId;
    }

    if (minPriceInput) {
        minPriceInput.value = state.filters.minPrice;
    }

    if (maxPriceInput) {
        maxPriceInput.value = state.filters.maxPrice;
    }

    if (sortInput) {
        sortInput.checked = true;
    }

    renderCategoryShowcase();
    renderFilterCategoryChips();
    updateSearchTriggerLabel();
}

function openFiltersModal() {
    syncFilterUi();
    document.getElementById('filtersModal').classList.remove('hidden');
}

window.closeFiltersModal = function() {
    document.getElementById('filtersModal').classList.add('hidden');
};

window.resetFilters = function() {
    state.filters = {
        categoryId: '',
        cityId: '',
        minPrice: '',
        maxPrice: '',
        sort: 'default'
    };
    syncFilterUi();
    document.getElementById('searchResultsSection').classList.add('hidden');
    renderListings(state.homeListings, 'randomListings');
};

function getCategorySelect(formType) {
    return document.querySelector(`#${formType}Form .listing-form .form-row select`);
}

function getSubcategorySelect(formType) {
    return document.querySelector(`[data-subcategory-select="${formType}"]`);
}

function getSubcategoryGroup(formType) {
    return getSubcategorySelect(formType)?.closest('.subcategory-group');
}

function populateSubcategorySelect(formType) {
    const categorySelect = getCategorySelect(formType);
    const subcategorySelect = getSubcategorySelect(formType);
    const subcategoryGroup = getSubcategoryGroup(formType);

    if (!categorySelect || !subcategorySelect || !subcategoryGroup) {
        return;
    }

    const category = getCategoryById(categorySelect.value);
    const subcategories = category?.subcategories || [];
    const isVisible = subcategories.length > 0;

    subcategoryGroup.classList.toggle('hidden', !isVisible);

    if (!isVisible) {
        subcategorySelect.innerHTML = '';
        subcategorySelect.value = '';
        return;
    }

    populateSelectElement(subcategorySelect, subcategories, 'Выберите подкатегорию');
}

function attachEventListeners() {
    document.querySelectorAll('.tab').forEach((tab) => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    document.getElementById('searchBtn').addEventListener('click', performSearch);
    document.getElementById('profileBtn').addEventListener('click', showProfileModal);
    document.getElementById('openFiltersBtn').addEventListener('click', openFiltersModal);
    document.getElementById('searchOpenBtn').addEventListener('click', openFiltersModal);
    document.querySelector('[data-tab-jump="listings"]').addEventListener('click', () => switchTab('listings'));

    document.querySelectorAll('.listing-type').forEach((btn) => {
        btn.addEventListener('click', () => switchListingType(btn.dataset.type));
    });

    document.querySelectorAll('.my-items-type').forEach((btn) => {
        btn.addEventListener('click', () => switchMyItemsType(btn.dataset.type));
    });

    document.querySelectorAll('.listing-form').forEach((form, index) => {
        form.addEventListener('submit', (e) => handleListingSubmit(e, index));
    });

    ['product', 'service'].forEach((formType) => {
        const categorySelect = getCategorySelect(formType);
        if (categorySelect) {
            categorySelect.addEventListener('change', () => populateSubcategorySelect(formType));
        }
    });

    document.getElementById('citySelect').addEventListener('change', (event) => {
        state.filters.cityId = event.target.value;
        updateSearchTriggerLabel();
    });
    document.getElementById('minPriceInput').addEventListener('input', (event) => {
        state.filters.minPrice = event.target.value;
    });
    document.getElementById('maxPriceInput').addEventListener('input', (event) => {
        state.filters.maxPrice = event.target.value;
    });
    document.querySelectorAll('input[name="sortOption"]').forEach((input) => {
        input.addEventListener('change', (event) => {
            state.filters.sort = event.target.value;
        });
    });

    document.getElementById('imageInput').addEventListener('change', (e) => handleImageSelect(e, 'images'));
    document.getElementById('serviceImageInput').addEventListener('change', (e) => handleImageSelect(e, 'serviceImages'));
    document.getElementById('adImageInput').addEventListener('change', (e) => handleImageSelect(e, 'adImages'));
    document.getElementById('reviewScreenshotInput').addEventListener('change', handleReviewScreenshotSelect);
}

function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach((tab) => tab.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    document.querySelectorAll('.tab-pane').forEach((pane) => {
        pane.classList.remove('active');
        pane.classList.add('hidden');
    });
    const targetPane = document.getElementById(tabName);
    targetPane.classList.remove('hidden');
    targetPane.classList.add('active');

    if (tabName === 'my-items') {
        loadMyItems();
    }
}

function switchListingType(type) {
    document.querySelectorAll('.listing-type').forEach((btn) => btn.classList.remove('active'));
    document.querySelector(`[data-type="${type}"]`).classList.add('active');

    document.querySelectorAll('.form-section').forEach((section) => {
        section.classList.remove('active');
        section.classList.add('hidden');
    });
    const targetSection = document.getElementById(`${type}Form`);
    targetSection.classList.remove('hidden');
    targetSection.classList.add('active');
}

function switchMyItemsType(type) {
    document.querySelectorAll('.my-items-type').forEach((btn) => btn.classList.remove('active'));
    document.querySelector(`[data-type="${type}"]`).classList.add('active');

    document.getElementById('myProducts').classList.toggle('hidden', type !== 'products');
    document.getElementById('myServices').classList.toggle('hidden', type !== 'services');
}

function handleImageSelect(e, type) {
    const files = Array.from(e.target.files);
    state[type] = state[type] || [];

    if (state[type].length + files.length > MAX_IMAGE_COUNT) {
        alert(`Можно добавить не более ${MAX_IMAGE_COUNT} фотографий`);
        e.target.value = '';
        return;
    }

    files.forEach((file) => {
        if (file.size > MAX_IMAGE_SIZE_BYTES) {
            alert('Каждая фотография должна быть меньше 1.5 МБ');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            state[type].push(event.target.result);
            renderImagePreview(type);
        };
        reader.readAsDataURL(file);
    });

    e.target.value = '';
}

function handleReviewScreenshotSelect(e) {
    const file = e.target.files[0];

    if (!file) {
        return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
        alert('Скриншот должен быть меньше 1.5 МБ');
        e.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        state.reviewScreenshot = event.target.result;
        renderImagePreview('reviewScreenshot');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

function renderImagePreview(type) {
    const previewIdMap = {
        images: 'imagePreview',
        serviceImages: 'serviceImagePreview',
        adImages: 'adImagePreview',
        reviewScreenshot: 'reviewScreenshotPreview'
    };

    const preview = document.getElementById(previewIdMap[type]);
    if (!preview) {
        return;
    }

    preview.innerHTML = '';

    const images = type === 'reviewScreenshot' ? (state.reviewScreenshot ? [state.reviewScreenshot] : []) : state[type];

    images.forEach((image, index) => {
        const div = document.createElement('div');
        div.className = 'image-preview-item';
        div.innerHTML = `
            <img src="${image}" alt="preview">
            <button type="button" onclick="removeImage('${type}', ${index})">✕</button>
        `;
        preview.appendChild(div);
    });
}

window.removeImage = function(type, index) {
    if (type === 'reviewScreenshot') {
        state.reviewScreenshot = null;
    } else {
        state[type].splice(index, 1);
    }

    renderImagePreview(type);
};

async function handleListingSubmit(e, formIndex) {
    e.preventDefault();
    const form = e.target;
    const title = form.querySelector('input[type="text"]')?.value.trim() || '';
    const description = form.querySelector('textarea')?.value.trim() || '';
    const selects = form.querySelectorAll('select');
    const isProductOrService = formIndex !== 2;
    const categoryId = isProductOrService ? selects[0]?.value || '' : '';
    const subcategory = isProductOrService ? selects[1]?.value || '' : '';
    const cityId = isProductOrService ? selects[2]?.value || '' : '';
    const priceInput = form.querySelector('input[type="number"]');
    const price = priceInput ? priceInput.value : '';

    if (formIndex === 2) {
        alert('Реклама размещается платно. Свяжитесь с @helionstudio');
        return;
    }

    if (!title || !categoryId || !cityId || !price) {
        alert('Пожалуйста, заполните обязательные поля');
        return;
    }

    if (categoryId === CLOTHING_CATEGORY_ID && !subcategory) {
        alert('Для категории "Одежда и обувь" выберите подкатегорию');
        return;
    }

    try {
        let endpoint = '/listings/create';
        let body = {
            user_id: state.user.id,
            title,
            description,
            category_id: categoryId,
            subcategory,
            city_id: cityId,
            price: parseFloat(price),
            images: state.images
        };

        if (formIndex === 1) {
            endpoint = '/services/create';
            body.images = state.serviceImages;
        }

        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(body)
        });

        const result = await response.json();
        if (result.success || result.listing_id || result.service_id) {
            alert('Объявление опубликовано');
            const createdListingId = result.listing_id || null;
            form.reset();
            state.images = [];
            state.serviceImages = [];
            state.adImages = [];
            renderImagePreview('images');
            renderImagePreview('serviceImages');
            renderImagePreview('adImages');
            populateSubcategorySelect('product');
            populateSubcategorySelect('service');

            if (createdListingId) {
                openPromotionModal(createdListingId, title);
            }
        } else {
            alert(result.error || 'Ошибка при публикации');
        }
    } catch (error) {
        console.error('Error submitting listing:', error);
        alert('Ошибка при публикации объявления');
    }
}

async function performSearch() {
    state.filters.cityId = document.getElementById('citySelect').value;

    try {
        const cityId = state.filters.cityId;
        const categoryId = state.filters.categoryId;
        const endpoint = `/listings/search?${cityId ? `city_id=${cityId}` : ''}${categoryId ? `${cityId ? '&' : ''}category_id=${categoryId}` : ''}`;
        const response = await fetch(`${API_BASE}${endpoint}`);
        const listings = applyListingFilters(await response.json());
        state.currentListings = listings;
        document.getElementById('searchResultsSection').classList.remove('hidden');
        document.getElementById('searchResultsTitle').textContent = categoryId ? `Объявления: ${getCategoryName(categoryId)}` : 'Найденные объявления';
        renderListings(listings, 'searchResults');
        closeFiltersModal();
        switchTab('search');
    } catch (error) {
        console.error('Search error:', error);
    }
}

async function loadRandomListings() {
    try {
        const response = await fetch(`${API_BASE}/listings/random?limit=20`);
        const listings = await response.json();
        state.homeListings = listings;
        renderListings(listings, 'randomListings');
    } catch (error) {
        console.error('Error loading random listings:', error);
    }
}

function applyListingFilters(listings) {
    let filtered = [...listings];

    if (state.filters.minPrice) {
        filtered = filtered.filter((item) => Number(item.price) >= Number(state.filters.minPrice));
    }

    if (state.filters.maxPrice) {
        filtered = filtered.filter((item) => Number(item.price) <= Number(state.filters.maxPrice));
    }

    switch (state.filters.sort) {
        case 'date':
            filtered.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
            break;
        case 'cheap':
            filtered.sort((a, b) => Number(a.price) - Number(b.price));
            break;
        case 'expensive':
            filtered.sort((a, b) => Number(b.price) - Number(a.price));
            break;
        default:
            break;
    }

    return filtered;
}

async function loadMyItems() {
    try {
        const [listingsRes, servicesRes] = await Promise.all([
            fetch(`${API_BASE}/listings/user/${state.user.id}`),
            fetch(`${API_BASE}/services/user/${state.user.id}`)
        ]);

        const listings = await listingsRes.json();
        const services = await servicesRes.json();

        renderListings(listings, 'myProducts');
        renderListings(services, 'myServices');
    } catch (error) {
        console.error('Error loading my items:', error);
    }
}

function renderListings(listings, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    if (listings.length === 0) {
        container.innerHTML = '<div class="empty-state"><strong>Пока пусто</strong><span>Здесь появятся объявления после публикации или поиска.</span></div>';
        return;
    }

    listings.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.onclick = () => showItemDetails(item);
        const image = item.images && item.images[0] ? item.images[0] : '📦';
        const isImage = typeof image === 'string' && (image.startsWith('data:') || image.startsWith('http'));
        const categoryName = getCategoryName(item.category_id);
        const subcategoryName = getSubcategoryName(item.category_id, item.subcategory);
        const badgeText = subcategoryName || categoryName;

        let content = `
            <div class="item-card-media">
                <div class="item-badge">${badgeText}</div>
                <div class="item-image">
                    ${isImage ? `<img src="${image}" alt="${item.title}">` : `<span>${image}</span>`}
                </div>
            </div>
            <div class="item-info">
                <div class="item-category-line">${categoryName}</div>
                <div class="item-title">${item.title}</div>
                <div class="item-price">${item.price} EUR</div>
                <div class="item-meta-row">
                    <div class="item-meta">${getCityName(item.city_id || item.city)}</div>
                    <div class="item-date">${item.created_at ? new Date(item.created_at).toLocaleDateString('ru-RU') : ''}</div>
                </div>
            </div>
        `;

        if (containerId.includes('my')) {
            content += `
                <div class="item-actions">
                    <button onclick="event.stopPropagation(); editItem('${item.id}')">Редактировать</button>
                    <button onclick="event.stopPropagation(); openPromotionModal('${item.id}', '${String(item.title).replace(/'/g, '&#39;')}')">Продвинуть</button>
                    <button class="delete" onclick="event.stopPropagation(); deleteItem('${item.id}', '${containerId}')">Удалить</button>
                </div>
            `;
        }

        card.innerHTML = content;
        container.appendChild(card);
    });
}

function showItemDetails(item) {
    state.selectedItem = item;
    const modal = document.getElementById('itemModal');
    const content = document.getElementById('itemContent');
    const categoryName = getCategoryName(item.category_id);
    const subcategoryName = getSubcategoryName(item.category_id, item.subcategory);

    const gallery = item.images && item.images.length > 0 ? `
        <div class="item-details-gallery">
            ${item.images.map((img) => `<img src="${img}" alt="${item.title}">`).join('')}
        </div>
    ` : '';

    content.innerHTML = `
        <div class="item-details-shell">
        <div class="item-details-topline">
            <span class="item-detail-chip">${categoryName}</span>
            ${subcategoryName ? `<span class="item-detail-chip item-detail-chip-muted">${subcategoryName}</span>` : ''}
        </div>
        <h2>${item.title}</h2>
        <div class="item-details-meta">
            <span>📍 ${getCityName(item.city_id || item.city)}</span>
            <span>👁️ ${item.views || 0} просмотров</span>
            <span>📅 ${new Date(item.created_at).toLocaleDateString('ru-RU')}</span>
        </div>
        ${gallery}
        <div class="item-details-price">${item.price} EUR</div>
        ${item.is_premium ? `<div class="promotion-status">В первой линии${item.premium_expires_at ? ` до ${new Date(item.premium_expires_at).toLocaleDateString('ru-RU')}` : ''}</div>` : ''}
        <div class="item-details-description">${item.description || 'Описание отсутствует'}</div>
        <div class="item-details-contact">
            <strong>Продавец</strong>
            <p>Вы можете открыть профиль продавца или оставить отзыв.</p>
        </div>
        <div class="item-details-actions">
            <button class="btn btn-secondary btn-block" onclick="showSellerProfile()">Профиль продавца</button>
            <button class="btn btn-primary btn-block" onclick="openReviewModal()">Оставить отзыв</button>
        </div>
        </div>
    `;

    modal.classList.remove('hidden');
}

window.closeItemModal = function() {
    document.getElementById('itemModal').classList.add('hidden');
};

window.showSellerProfile = async function() {
    if (!state.selectedItem?.user_id) {
        return;
    }

    closeItemModal();
    await showUserProfile(state.selectedItem.user_id);
};

async function showUserProfile(userId) {
    try {
        const response = await fetch(`${API_BASE}/users/profile/${userId}`, {
            headers: getAuthHeaders(false)
        });
        const user = await response.json();

        if (!response.ok) {
            throw new Error(user.error || 'Не удалось загрузить профиль');
        }

        state.viewedProfileId = userId;

        const isOwnProfile = state.user?.id === userId;
        const canModerate = state.user?.is_admin === true;

        document.getElementById('profileViewInfo').innerHTML = `
            <p><strong>Имя пользователя:</strong> ${user.username || 'Не указано'}</p>
            <p><strong>Имя:</strong> ${getProfileDisplayName(user)}</p>
            <p><strong>Телефон:</strong> ${user.phone || 'Не указан'}</p>
            <p><strong>Город:</strong> ${getCityName(user.city)}</p>
            <p><strong>О себе:</strong> ${user.about || 'Пользователь пока ничего не рассказал о себе'}</p>
        `;

        document.getElementById('profileEditForm').classList.toggle('hidden', !isOwnProfile);
        document.getElementById('profileSaveBtn').classList.toggle('hidden', !isOwnProfile);
        document.getElementById('profileLogoutBtn').classList.toggle('hidden', !isOwnProfile);

        document.getElementById('profileFirstName').value = user.first_name || '';
        document.getElementById('profileLastName').value = user.last_name || '';
        document.getElementById('profileUsername').value = user.username || '';
        document.getElementById('profilePhone').value = user.phone || '';
        document.getElementById('profileCitySelect').value = user.city ? (state.cities.find((city) => city.name === user.city || city.id === user.city)?.id || '') : '';
        document.getElementById('profileAbout').value = user.about || '';

        renderReviews(user.reviews || [], canModerate);
        document.getElementById('profileModal').classList.remove('hidden');
    } catch (error) {
        console.error('Error loading profile:', error);
        alert('Ошибка при загрузке профиля');
    }
}

function renderReviews(reviews, canModerate) {
    const container = document.getElementById('profileReviews');

    if (!reviews.length) {
        container.innerHTML = '<p class="info-text">Пока нет отзывов.</p>';
        return;
    }

    container.innerHTML = reviews.map((review) => {
        const typeLabel = review.review_type === 'product' ? 'Отзыв о товаре' : 'Отзыв о продавце';
        const canDelete = canModerate || review.author_user_id === state.user?.id;
        const screenshotLink = canModerate && review.screenshot_url
            ? `<a class="review-screenshot-link" href="${review.screenshot_url}" target="_blank" rel="noreferrer">Скриншот</a>`
            : '';
        const authorProfileButton = canModerate
            ? `<button class="review-admin-link" onclick="openReviewAuthorProfile('${review.author_user_id}')">Профиль автора</button>`
            : '';
        const deleteButton = canDelete
            ? `<button class="review-delete-btn" onclick="deleteReview('${review.id}')">✕</button>`
            : '';

        return `
            <div class="review-card">
                <div class="review-header">
                    <div class="review-author-block">
                        <div class="review-avatar">
                            ${getAvatarMarkup(review.author_avatar_url)}
                        </div>
                        <div>
                        <div class="review-meta">${typeLabel}${review.listing_title ? ` • ${review.listing_title}` : ''} • ${new Date(review.created_at).toLocaleDateString('ru-RU')}</div>
                        </div>
                    </div>
                    <div class="review-actions">
                        ${screenshotLink}
                        ${authorProfileButton}
                        ${deleteButton}
                    </div>
                </div>
                <p class="review-text">${review.text}</p>
            </div>
        `;
    }).join('');
}

window.openReviewAuthorProfile = async function(userId) {
    if (state.user?.is_admin !== true) {
        return;
    }

    await showUserProfile(userId);
};

window.showProfileModal = async function() {
    await showUserProfile(state.user.id);
};

window.closeProfileModal = function() {
    document.getElementById('profileModal').classList.add('hidden');
};

window.updateProfile = async function() {
    try {
        const cityId = document.getElementById('profileCitySelect').value;
        const cityName = cityId ? getCityName(cityId) : '';
        const payload = {
            first_name: document.getElementById('profileFirstName').value.trim(),
            last_name: document.getElementById('profileLastName').value.trim(),
            username: document.getElementById('profileUsername').value.trim(),
            phone: document.getElementById('profilePhone').value.trim(),
            city: cityName,
            about: document.getElementById('profileAbout').value.trim()
        };

        const response = await fetch(`${API_BASE}/users/profile/${state.user.id}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Не удалось обновить профиль');
        }

        state.user = result.user;
        alert('Профиль обновлен');
        await showUserProfile(state.user.id);
    } catch (error) {
        console.error('Error updating profile:', error);
        alert('Ошибка при обновлении профиля');
    }
};

window.openReviewModal = function() {
    if (!state.selectedItem) {
        return;
    }

    if (state.selectedItem.user_id === state.user.id) {
        alert('Нельзя оставить отзыв самому себе');
        return;
    }

    document.getElementById('reviewTargetInfo').textContent = `Отзыв будет привязан к продавцу и товару: ${state.selectedItem.title}`;
    document.getElementById('reviewType').value = 'seller';
    document.getElementById('reviewText').value = '';
    state.reviewScreenshot = null;
    renderImagePreview('reviewScreenshot');
    closeItemModal();
    document.getElementById('reviewModal').classList.remove('hidden');
};

window.openPromotionModal = function(listingId, title = 'объявление') {
    state.promotionListingId = listingId;
    document.getElementById('promotionTargetInfo').textContent = `Выберите срок продвижения для объявления: ${title}`;
    document.getElementById('promotionModal').classList.remove('hidden');
};

window.closePromotionModal = function() {
    document.getElementById('promotionModal').classList.add('hidden');
};

window.startPromotionPayment = async function(planKey) {
    if (!state.promotionListingId) {
        return;
    }

    const plan = PROMOTION_PLANS[planKey];
    if (!plan) {
        alert('Неизвестный тариф продвижения');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/listings/${state.promotionListingId}/promotion/invoice`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                user_id: state.user.id,
                plan: planKey
            })
        });

        const result = await response.json();
        if (!response.ok || !result.success || !result.invoice_link) {
            throw new Error(result.error || 'Не удалось подготовить оплату');
        }

        if (tg?.openInvoice) {
            tg.openInvoice(result.invoice_link, async (status) => {
                if (status === 'paid') {
                    closePromotionModal();
                    alert(`Продвижение оплачено: ${plan.label} за ${plan.stars} ⭐`);
                    await loadMyItems();
                    await loadRandomListings();
                }
            });
            return;
        }

        window.open(result.invoice_link, '_blank', 'noopener,noreferrer');
    } catch (error) {
        console.error('Error starting promotion payment:', error);
        alert(error.message || 'Ошибка при создании платежа');
    }
};

window.closeReviewModal = function() {
    document.getElementById('reviewModal').classList.add('hidden');
};

window.submitReview = async function() {
    const reviewType = document.getElementById('reviewType').value;
    const reviewText = document.getElementById('reviewText').value.trim();

    if (!state.selectedItem) {
        alert('Сначала выберите товар');
        return;
    }

    if (!reviewText) {
        alert('Введите текст отзыва');
        return;
    }

    if (!state.reviewScreenshot) {
        alert('Обязательно приложите скриншот переписки');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/reviews`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                user_id: state.user.id,
                telegram_id: getTelegramId(),
                target_user_id: state.selectedItem.user_id,
                listing_id: state.selectedItem.id,
                review_type: reviewType,
                text: reviewText,
                screenshot: state.reviewScreenshot
            })
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Не удалось отправить отзыв');
        }

        alert('Отзыв отправлен');
        closeReviewModal();

        if (state.viewedProfileId === state.selectedItem.user_id) {
            await showUserProfile(state.viewedProfileId);
        }
    } catch (error) {
        console.error('Error creating review:', error);
        alert(error.message || 'Ошибка при отправке отзыва');
    }
};

window.deleteReview = async function(reviewId) {
    if (!confirm('Удалить этот отзыв?')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/reviews/${reviewId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Не удалось удалить отзыв');
        }

        if (state.viewedProfileId) {
            await showUserProfile(state.viewedProfileId);
        }
    } catch (error) {
        console.error('Error deleting review:', error);
        alert(error.message || 'Ошибка при удалении отзыва');
    }
};

window.deleteItem = async function(itemId, containerId) {
    if (!confirm('Вы уверены, что хотите удалить?')) {
        return;
    }

    try {
        const endpoint = containerId.includes('Products') ? `/listings/${itemId}` : `/services/${itemId}`;
        await fetch(`${API_BASE}${endpoint}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
            body: JSON.stringify({ user_id: state.user.id })
        });

        alert('Объявление удалено');
        loadMyItems();
    } catch (error) {
        console.error('Error deleting item:', error);
    }
};

window.editItem = function() {
    alert('Редактирование пока в разработке');
};

window.logout = function() {
    localStorage.removeItem('user_id');
    location.reload();
};
