const tg = window.Telegram?.WebApp;
const DEFAULT_MAX_IMAGE_COUNT = 5;
const ADMIN_MAX_IMAGE_COUNT = 10;
const MAX_IMAGE_SIZE_BYTES = 1572864;
const DEFAULT_MAX_VIDEO_SIZE_BYTES = 15 * 1024 * 1024;
const ADMIN_MAX_VIDEO_SIZE_BYTES = 30 * 1024 * 1024;
const LISTING_DRAFT_KEY = 'violet_listing_drafts';
const LISTING_DRAFT_VERSION = 1;
const FALLBACK_TELEGRAM_ID_KEY = 'fallback_telegram_id';
const CLOTHING_CATEGORY_ID = 'cat-5';
const SERVICE_CATEGORY_ID = 'cat-8';
const OTHER_SUBCATEGORY = { id: 'other', name: 'Прочее' };
const SUPPORT_LINK = 'https://t.me/helionstudio';
const SERVICE_PUBLICATION_PLAN = { key: 'month', label: '1 месяц', stars: 100, rub: 182 };
const PROMOTION_PLANS = {
    test: { label: 'Тест', stars: 1, rub: 2 },
    three_days: { label: '3 дня', stars: 100, rub: 182 },
    week: { label: '7 дней', stars: 150, rub: 265 },
    month: { label: '1 месяц', stars: 250, rub: 429 }
};
const CATEGORY_IMAGE_MAP = {
    all: 'assets/categories/all.svg',
    'cat-1': 'assets/categories/electronics.svg',
    'cat-2': 'assets/categories/auto.svg',
    'cat-3': 'assets/categories/realty.svg',
    'cat-4': 'assets/categories/home.svg',
    'cat-5': 'assets/categories/clothing.svg',
    'cat-6': 'assets/categories/hobby.svg',
    'cat-7': 'assets/categories/kids.svg',
    'cat-8': 'assets/categories/services.svg',
    'cat-9': 'assets/categories/pets.svg',
    'cat-11': 'assets/categories/work.svg',
    'cat-12': 'assets/categories/free.svg',
    'cat-13': 'assets/categories/afisha.svg',
    'cat-14': 'assets/categories/medicine.svg',
 };

let state = {
    user: null,
    categories: [],
    cities: [],
    currentListings: [],
    homeListings: [],
    myItems: [],
    currentServices: [],
    activeSearchView: 'home',
    activeCategoryId: '',
    lastCategoryId: '',
    sellerReturnView: 'home',
    images: [],
    serviceImages: [],
    adImages: [],
    reviewScreenshot: null,
    selectedItem: null,
    adminModerationItem: null,
    editingItem: null,
    editImages: [],
    adminReviewAvatar: null,
    profileDraft: null,
    viewedProfileId: null,
    promotionListingId: null,
    promotionListingTitle: '',
    promotionTargetType: 'listing',
    servicePublicationRequired: false,
    selectedPromotionPlans: {
        product: '',
        service: ''
    },
    categoryAutoScrollRaf: null,
    categoryAutoScrollLastTime: 0,
    filters: {
        categoryId: '',
        subcategoryId: '',
        query: '',
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

function getCategoryImage(categoryId) {
    return CATEGORY_IMAGE_MAP[categoryId] || CATEGORY_IMAGE_MAP.fallback;
}

function isAdminUser() {
    return state.user?.is_admin === true || state.user?.is_admin === 1;
}

function getMaxImageCount() {
    return isAdminUser() ? ADMIN_MAX_IMAGE_COUNT : DEFAULT_MAX_IMAGE_COUNT;
}

function getMaxVideoSizeBytes() {
    return isAdminUser() ? ADMIN_MAX_VIDEO_SIZE_BYTES : DEFAULT_MAX_VIDEO_SIZE_BYTES;
}

function isMediaVideo(value = '') {
    return typeof value === 'string' && (value.startsWith('data:video/') || value.includes('/video/upload/'));
}

function isPriceInputFilled(value) {
    return value !== undefined && value !== null && String(value).trim() !== '';
}

function formatPrice(value) {
    const price = Number(value);

    if (Number.isFinite(price) && price === 0) {
        return 'Бесплатно';
    }

    return `${value} EUR`;
}

function getMediaLimitText() {
    const maxVideoMb = Math.round(getMaxVideoSizeBytes() / (1024 * 1024));
    return `${getMaxImageCount()} файлов, видео до ${maxVideoMb} МБ`;
}

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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

function normalizePublication(item, type) {
    return {
        ...item,
        item_type: type,
        source_type: type
    };
}

function sortPublications(items, preferredCategoryId = '') {
    const isPreferred = (item) => {
        if (!preferredCategoryId) {
            return false;
        }

        if (preferredCategoryId === SERVICE_CATEGORY_ID && item.item_type === 'service') {
            return true;
        }

        return item.category_id === preferredCategoryId;
    };

    return [...items].sort((a, b) => {
        const aPreferred = isPreferred(a) ? 0 : 1;
        const bPreferred = isPreferred(b) ? 0 : 1;

        if (aPreferred !== bPreferred) {
            return aPreferred - bPreferred;
        }

        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
}

function buildQuery(params) {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
        if (value) {
            searchParams.set(key, value);
        }
    });

    return searchParams.toString();
}

async function fetchPublications({ cityId = '', categoryId = '' } = {}) {
    const listingQuery = buildQuery({ city_id: cityId, category_id: categoryId });
    const serviceCategoryId = categoryId === SERVICE_CATEGORY_ID ? '' : categoryId;
    const serviceQuery = buildQuery({ city_id: cityId, category_id: serviceCategoryId });

    const [listingsResponse, servicesResponse] = await Promise.all([
        fetch(`${API_BASE}/listings/search${listingQuery ? `?${listingQuery}` : ''}`),
        fetch(`${API_BASE}/services/search${serviceQuery ? `?${serviceQuery}` : ''}`)
    ]);

    const [listings, services] = await Promise.all([
        listingsResponse.json(),
        servicesResponse.json()
    ]);

    return [
        ...listings.map((item) => normalizePublication(item, 'listing')),
        ...services.map((item) => normalizePublication(item, 'service'))
    ];
}

function getProfileDisplayName(user) {
    return [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.username || 'Пользователь';
}

function buildProfileInfoRow(label, valueMarkup, fieldKey = '', isOwnProfile = false) {
    const editButton = isOwnProfile && fieldKey
        ? `<button type="button" class="profile-edit-btn" onclick="openProfileFieldEditor('${fieldKey}')" aria-label="Изменить ${escapeHtml(label)}">✏</button>`
        : '';

    return `
        <div class="profile-info-row">
            <div class="profile-info-copy">
                <span class="profile-info-label">${escapeHtml(label)}</span>
                <div class="profile-info-value">${valueMarkup}</div>
            </div>
            ${editButton}
        </div>
    `;
}

function renderProfileInfo(user, isOwnProfile) {
    const profileData = isOwnProfile ? (state.profileDraft || user) : user;
    const usernameMarkup = profileData.username ? getUsernameLink(profileData.username) : 'Не указано';
    const firstName = escapeHtml(profileData.first_name || 'Не указано');
    const lastName = escapeHtml(profileData.last_name || 'Не указано');
    const phone = escapeHtml(profileData.phone || 'Не указан');
    const city = escapeHtml(getCityName(profileData.city));
    const about = escapeHtml(profileData.about || 'Пользователь пока ничего не рассказал о себе');
    const avatarMarkup = getAvatarMarkup(profileData.avatar_url, getAvatarInitial(profileData));

    return `
        <div class="profile-summary-card">
            <div class="profile-summary-avatar">
                ${avatarMarkup}
            </div>
            <div class="profile-summary-meta">
                <h3>${escapeHtml(getProfileDisplayName(profileData))}</h3>
                <div class="profile-summary-subtitle">${profileData.username ? usernameMarkup : 'Профиль пользователя'}</div>
            </div>
        </div>
        <div class="profile-info-list">
            ${buildProfileInfoRow('Имя пользователя', usernameMarkup, 'username', isOwnProfile)}
            ${buildProfileInfoRow('Имя', firstName, 'first_name', isOwnProfile)}
            ${buildProfileInfoRow('Фамилия', lastName, 'last_name', isOwnProfile)}
            ${buildProfileInfoRow('Телефон', phone, 'phone', isOwnProfile)}
            ${buildProfileInfoRow('Город', city, 'city', isOwnProfile)}
            ${buildProfileInfoRow('О себе', about, 'about', isOwnProfile)}
        </div>
    `;
}

function getUsernameLink(username) {
    if (!username) {
        return 'Не указано';
    }

    const safeUsername = String(username).replace(/^@+/, '').trim();
    if (!safeUsername) {
        return 'Не указано';
    }

    return `<button type="button" class="profile-username-link" onclick="openTelegramUsername('${escapeHtml(safeUsername)}')">@${escapeHtml(safeUsername)}</button>`;
}

function getAvatarInitial(user) {
    const source = String(user?.first_name || user?.username || '').trim();
    if (!source) {
        return '';
    }

    return source.charAt(0).toUpperCase();
}

function getAvatarMarkup(avatarUrl, fallbackText = '👤') {
    if (avatarUrl) {
        return `<img src="${avatarUrl}" alt="Аватар" class="review-avatar-image">`;
    }

    return `<span class="review-avatar-fallback">${fallbackText}</span>`;
}

function updateProfileButtonAvatar() {
    const profileBtn = document.getElementById('profileBtn');
    if (!profileBtn) {
        return;
    }

    const avatarUrl = state.user?.avatar_url || '';
    const avatarInitial = getAvatarInitial(state.user);
    const accessibleName = escapeHtml(getProfileDisplayName(state.user || {}));

    profileBtn.setAttribute('aria-label', `Профиль: ${accessibleName}`);
    profileBtn.classList.add('profile-icon-btn');

    if (avatarUrl) {
        profileBtn.innerHTML = `<img src="${avatarUrl}" alt="" class="profile-btn-avatar-image">`;
        return;
    }

    profileBtn.innerHTML = `<span class="profile-btn-avatar-fallback">${escapeHtml(avatarInitial)}</span>`;
}

function updateSearchTriggerLabel() {
    const cityName = state.filters.cityId ? getCityName(state.filters.cityId) : 'по всей Черногории';
    const query = state.filters.query?.trim();
    const categoryName = state.filters.categoryId ? getCategoryName(state.filters.categoryId) : 'во всех категориях';
    const subcategoryName = getSubcategoryName(state.filters.categoryId, state.filters.subcategoryId);
    const placeholder = query
        ? ''
        : `Поиск ${subcategoryName || categoryName.toLowerCase()} ${cityName}`;
    const input = document.getElementById('searchTriggerInput');

    if (input) {
        input.placeholder = placeholder;
    }
}

function updateSearchSubmitVisibility() {
    const submitButton = document.getElementById('searchSubmitInlineBtn');

    if (!submitButton) {
        return;
    }

    submitButton.classList.toggle('hidden', !state.filters.query.trim());
}

function setSearchViewMode(mode) {
    state.activeSearchView = mode;

    document.getElementById('promoBannerSection')?.classList.toggle('hidden', mode !== 'home');
    document.getElementById('categoriesShowcaseSection')?.classList.toggle('hidden', mode !== 'home');
    document.getElementById('homeRecommendationsBlock')?.classList.toggle('hidden', mode !== 'home');
    document.getElementById('categoryLandingSection')?.classList.toggle('hidden', mode !== 'category');
    document.getElementById('sellerProfileSection')?.classList.toggle('hidden', mode !== 'seller');
    document.getElementById('searchResultsSection')?.classList.toggle('hidden', mode !== 'results');
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
    populateSelectElement(document.getElementById('editCategory'), state.categories, null);
    populateSelectElement(document.getElementById('editCity'), state.cities, null);

    populateSubcategorySelect('product');
    populateSubcategorySelect('service');
    renderPromotionOptions('product');
    renderPromotionOptions('service');
    renderCategoryShowcase();
    renderFilterCategoryChips();
    updateSearchTriggerLabel();
    updateSearchSubmitVisibility();
}

function showMainApp() {
    document.getElementById('mainApp').classList.remove('hidden');
    updateProfileButtonAvatar();
    setSearchViewMode('home');
    loadRandomListings();
}

window.openSupportChat = function() {
    if (tg?.openTelegramLink) {
        tg.openTelegramLink(SUPPORT_LINK);
        return;
    }

    window.open(SUPPORT_LINK, '_blank', 'noopener,noreferrer');
};

window.openTelegramUsername = function(username) {
    const safeUsername = String(username || '').replace(/^@+/, '').trim();
    if (!safeUsername) {
        return;
    }

    const telegramLink = `https://t.me/${safeUsername}`;
    if (tg?.openTelegramLink) {
        tg.openTelegramLink(telegramLink);
        return;
    }

    window.open(telegramLink, '_blank', 'noopener,noreferrer');
};

function renderCategoryShowcase() {
    const container = document.getElementById('categoryShowcase');

    if (!container) {
        return;
    }

    const allTile = `
        <button
            type="button"
            class="category-tile category-tile-all ${!state.filters.categoryId ? 'active' : ''}"
            data-category-tile="all"
        >
            <div class="category-tile-copy">
                <strong>Все</strong>
            </div>
        </button>
    `;

    const showcasePriority = ['cat-11', 'cat-13', 'cat-12'];
    const showcaseCategories = [
        ...showcasePriority
            .map((id) => state.categories.find((category) => category.id === id))
            .filter(Boolean),
        ...state.categories.filter((category) => !showcasePriority.includes(category.id))
    ];

    const categoryTiles = showcaseCategories.map((category, index) => `
        <button
            type="button"
            class="category-tile category-tile-${(index % 6) + 1} ${state.filters.categoryId === category.id ? 'active' : ''}"
            data-category-tile="${category.id}"
        >
            <div class="category-tile-copy">
                <strong>${category.name}</strong>
            </div>
        </button>
    `).join('');

    container.innerHTML = allTile + categoryTiles;

    container.querySelectorAll('[data-category-tile]').forEach((button) => {
        button.addEventListener('click', () => {
            if (button.dataset.categoryTile === 'all') {
                openCategoryExplorerModal();
                return;
            }

            openCategoryLanding(button.dataset.categoryTile);
        });
    });

    startCategoryAutoScroll();
}

function startCategoryAutoScroll() {
    const container = document.getElementById('categoryShowcase');

    if (!container) {
        return;
    }

    if (state.categoryAutoScrollRaf) {
        cancelAnimationFrame(state.categoryAutoScrollRaf);
    }

    state.categoryAutoScrollLastTime = 0;

    const scroll = (timestamp) => {
        if (!state.categoryAutoScrollLastTime) {
            state.categoryAutoScrollLastTime = timestamp;
        }

        const delta = timestamp - state.categoryAutoScrollLastTime;
        state.categoryAutoScrollLastTime = timestamp;

        if (container.scrollWidth > container.clientWidth) {
            container.scrollLeft += delta * 0.018;

            if (container.scrollLeft + container.clientWidth >= container.scrollWidth - 1) {
                container.scrollLeft = 0;
            }
        }

        state.categoryAutoScrollRaf = requestAnimationFrame(scroll);
    };

    state.categoryAutoScrollRaf = requestAnimationFrame(scroll);
}

function renderCategoryExplorer() {
    const container = document.getElementById('categoryExplorerContent');

    if (!container) {
        return;
    }

    container.innerHTML = state.categories.map((category) => {
        const subcategories = category.subcategories || [];
        const cards = subcategories.length
            ? subcategories.map((subcategory) => `
                <button
                    type="button"
                    class="category-explorer-card ${state.filters.categoryId === category.id && state.filters.subcategoryId === subcategory.id ? 'active' : ''}"
                    onclick="applyCategorySelection('${category.id}', '${subcategory.id}')"
                >
                    <span>${subcategory.name}</span>
                    <small>${category.name}</small>
                </button>
            `).join('')
            : '';

        return `
            <section class="category-explorer-group">
                <div class="category-explorer-group-header">
                    <div>
                        <h3>${category.name}</h3>
                        <p>${subcategories.length ? `${subcategories.length} подкатегории` : 'Без подкатегорий'}</p>
                    </div>
                    <button
                        type="button"
                        class="category-explorer-open"
                        onclick="applyCategorySelection('${category.id}', '')"
                    >
                        Открыть
                    </button>
                </div>
                <div class="category-explorer-grid ${subcategories.length ? '' : 'hidden'}">
                    ${cards}
                </div>
            </section>
        `;
    }).join('');
}

function openCategoryExplorerModal() {
    renderCategoryExplorer();
    document.getElementById('categoryExplorerModal').classList.remove('hidden');
}

window.closeCategoryExplorerModal = function() {
    document.getElementById('categoryExplorerModal').classList.add('hidden');
};

window.applyCategorySelection = function(categoryId, subcategoryId = '') {
    closeCategoryExplorerModal();
    closeFiltersModal();
    openCategoryLanding(categoryId, subcategoryId);
};

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
            state.filters.subcategoryId = '';
            syncFilterUi();
        });
    });
}

function syncFilterUi() {
    const citySelect = document.getElementById('citySelect');
    const searchTriggerInput = document.getElementById('searchTriggerInput');
    const minPriceInput = document.getElementById('minPriceInput');
    const maxPriceInput = document.getElementById('maxPriceInput');
    const sortInput = document.querySelector(`input[name="sortOption"][value="${state.filters.sort}"]`);

    if (citySelect) {
        citySelect.value = state.filters.cityId;
    }

    if (searchTriggerInput) {
        searchTriggerInput.value = state.filters.query;
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
    updateSearchSubmitVisibility();
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
        subcategoryId: '',
        query: '',
        cityId: '',
        minPrice: '',
        maxPrice: '',
        sort: 'default'
    };
    state.activeCategoryId = '';
    syncFilterUi();
    setSearchViewMode('home');
    loadRandomListings();
};

function renderCategoryLandingTiles(category) {
    const container = document.getElementById('categorySubcategoryGrid');

    if (!container || !category) {
        return;
    }

    const subcategories = category.subcategories || [];
    const tiles = [
        `
            <button
                type="button"
                class="category-landing-tile ${!state.filters.subcategoryId ? 'active' : ''}"
                onclick="selectCategoryLandingSubcategory('')"
            >
                <strong>Все объявления</strong>
                <span>${category.name}</span>
            </button>
        `,
        ...subcategories.map((subcategory) => `
            <button
                type="button"
                class="category-landing-tile ${state.filters.subcategoryId === subcategory.id ? 'active' : ''}"
                onclick="selectCategoryLandingSubcategory('${subcategory.id}')"
            >
                <strong>${subcategory.name}</strong>
                <span>${category.name}</span>
            </button>
        `)
    ];

    container.innerHTML = tiles.join('');
}

async function openCategoryLanding(categoryId, subcategoryId = '') {
    const category = getCategoryById(categoryId);

    if (!category) {
        return;
    }

    state.activeCategoryId = categoryId;
    state.lastCategoryId = categoryId;
    state.filters.categoryId = categoryId;
    state.filters.subcategoryId = subcategoryId;
    syncFilterUi();
    renderCategoryLandingTiles(category);

    document.getElementById('categoryLandingTitle').textContent = category.name;
    document.getElementById('categoryRecommendationsTitle').textContent = subcategoryId
        ? `Рекомендации: ${getSubcategoryName(categoryId, subcategoryId)}`
        : `Рекомендации: ${category.name}`;

    setSearchViewMode('category');
    switchTab('search');

    try {
        const cityId = state.filters.cityId;
        const publications = await fetchPublications({ cityId, categoryId });
        const listings = sortPublications(applyListingFilters(publications), categoryId);
        state.currentListings = listings;
        renderListings(listings, 'categoryRecommendations');
    } catch (error) {
        console.error('Category landing error:', error);
    }
}

window.selectCategoryLandingSubcategory = function(subcategoryId = '') {
    openCategoryLanding(state.activeCategoryId, subcategoryId);
};

window.closeCategoryLanding = function() {
    state.activeCategoryId = '';
    state.filters.categoryId = '';
    state.filters.subcategoryId = '';
    syncFilterUi();
    setSearchViewMode('home');
};

window.clearSearchQuery = function() {
    state.filters.query = '';
    const input = document.getElementById('searchTriggerInput');
    if (input) {
        input.value = '';
        input.focus();
    }
    updateSearchTriggerLabel();
    updateSearchSubmitVisibility();
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
    const baseSubcategories = category?.subcategories || [];
    const subcategories = baseSubcategories.some((item) => item.id === OTHER_SUBCATEGORY.id)
        ? baseSubcategories
        : [...baseSubcategories, OTHER_SUBCATEGORY];
    const isVisible = subcategories.length > 0;

    subcategoryGroup.classList.toggle('hidden', !isVisible);

    if (!isVisible) {
        subcategorySelect.innerHTML = '';
        subcategorySelect.value = '';
        return;
    }

    populateSelectElement(subcategorySelect, subcategories, 'Выберите подкатегорию');
}

function getSubcategoriesForCategory(categoryId) {
    const category = getCategoryById(categoryId);
    const baseSubcategories = category?.subcategories || [];

    return baseSubcategories.some((item) => item.id === OTHER_SUBCATEGORY.id)
        ? baseSubcategories
        : [...baseSubcategories, OTHER_SUBCATEGORY];
}

function updateEditSubcategorySelect() {
    const categorySelect = document.getElementById('editCategory');
    const subcategorySelect = document.getElementById('editSubcategory');
    const subcategoryGroup = document.getElementById('editSubcategoryGroup');

    if (!categorySelect || !subcategorySelect || !subcategoryGroup) {
        return;
    }

    const subcategories = getSubcategoriesForCategory(categorySelect.value);
    subcategoryGroup.classList.toggle('hidden', subcategories.length === 0);
    populateSelectElement(subcategorySelect, subcategories, 'Выберите подкатегорию');
}

function renderPromotionOptions(formType) {
    const container = document.querySelector(`[data-promotion-options="${formType}"]`);

    if (!container) {
        return;
    }

    container.innerHTML = Object.entries(PROMOTION_PLANS).map(([planKey, plan]) => `
        <button
            type="button"
            class="promotion-plan-card ${state.selectedPromotionPlans[formType] === planKey ? 'active' : ''}"
            onclick="selectPromotionPlan('${formType}', '${planKey}')"
        >
            <strong>${plan.label}</strong>
            <span>${plan.stars} ⭐</span>
            <small>≈ ${plan.rub} ₽</small>
        </button>
    `).join('');
}

window.selectPromotionPlan = function(formType, planKey) {
    state.selectedPromotionPlans[formType] = state.selectedPromotionPlans[formType] === planKey ? '' : planKey;
    renderPromotionOptions(formType);
    saveListingDrafts();
};

function renderPromotionModalPlans() {
    const container = document.getElementById('promotionModalPlans');

    if (!container) {
        return;
    }

    container.innerHTML = Object.entries(PROMOTION_PLANS).map(([planKey, plan]) => `
        <button type="button" class="promotion-plan-card" onclick="startPromotionPayment('${planKey}')">
            <strong>${plan.label}</strong>
            <span>${plan.stars} ⭐</span>
            <small>≈ ${plan.rub} ₽</small>
        </button>
    `).join('');
}

async function refreshServicePublicationRequirement() {
    if (!state.user?.id) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/services/user/${state.user.id}`);
        const services = await response.json();
        const hasFreeActiveService = services.some((service) => {
            const isPaid = service.is_paid === true || service.is_paid === 1;
            return !isPaid && ['active', 'pending_payment'].includes(service.status);
        });

        state.servicePublicationRequired = hasFreeActiveService;
        document.getElementById('servicePublicationPanel')?.classList.toggle('hidden', !hasFreeActiveService);
    } catch (error) {
        console.error('Error checking service publication requirement:', error);
    }
}

function attachEventListeners() {
    document.querySelectorAll('.tab').forEach((tab) => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    document.getElementById('searchBtn').addEventListener('click', performSearch);
    document.getElementById('searchSubmitInlineBtn').addEventListener('click', performSearch);
    document.getElementById('profileBtn').addEventListener('click', showProfileModal);
    document.getElementById('openFiltersBtn').addEventListener('click', openFiltersModal);
    document.querySelector('[data-tab-jump="listings"]').addEventListener('click', () => switchTab('listings'));

    document.querySelectorAll('.listing-type').forEach((btn) => {
        btn.addEventListener('click', () => switchListingType(btn.dataset.type));
    });

    document.querySelectorAll('#productForm .listing-form, #serviceForm .listing-form').forEach((form, index) => {
        form.addEventListener('submit', (e) => handleListingSubmit(e, index));
    });

    document.getElementById('editItemForm').addEventListener('submit', handleEditItemSubmit);
    document.getElementById('editCategory').addEventListener('change', updateEditSubcategorySelect);

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
    document.getElementById('searchTriggerInput').addEventListener('input', (event) => {
        state.filters.query = event.target.value;
        updateSearchTriggerLabel();
        updateSearchSubmitVisibility();
    });
    document.getElementById('searchTriggerInput').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            performSearch();
        }
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
    document.getElementById('reviewScreenshotInput').addEventListener('change', handleReviewScreenshotSelect);
    document.getElementById('adminSeedReviewAvatarInput').addEventListener('change', handleAdminReviewAvatarSelect);

    attachListingDraftListeners();
    restoreListingDrafts();
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

    if (tabName === 'listings') {
        refreshServicePublicationRequirement();
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

    if (type === 'service') {
        refreshServicePublicationRequirement();
    }

    saveListingDrafts();
}

function getListingForm(formType) {
    return document.querySelector(`#${formType}Form .listing-form`);
}

function getListingFormFields(formType) {
    const form = getListingForm(formType);

    if (!form) {
        return null;
    }

    const selects = form.querySelectorAll('select');
    return {
        form,
        title: form.querySelector('input[type="text"]'),
        description: form.querySelector('textarea'),
        category: selects[0],
        subcategory: getSubcategorySelect(formType),
        city: selects[2],
        price: form.querySelector('input[type="number"]')
    };
}

function getActiveListingType() {
    return document.querySelector('.listing-type.active')?.dataset.type || 'product';
}

function readListingDraftForm(formType) {
    const fields = getListingFormFields(formType);

    if (!fields) {
        return {};
    }

    return {
        title: fields.title?.value || '',
        description: fields.description?.value || '',
        category_id: fields.category?.value || '',
        subcategory: fields.subcategory?.value || '',
        city_id: fields.city?.value || '',
        price: fields.price?.value || '',
        promotion_plan: state.selectedPromotionPlans[formType] || ''
    };
}

function hasListingDraftContent(draft) {
    return Object.values(draft).some((value) => String(value || '').trim());
}

function saveListingDrafts() {
    const drafts = {
        version: LISTING_DRAFT_VERSION,
        activeType: getActiveListingType(),
        product: readListingDraftForm('product'),
        service: readListingDraftForm('service')
    };

    if (!hasListingDraftContent(drafts.product) && !hasListingDraftContent(drafts.service)) {
        localStorage.removeItem(LISTING_DRAFT_KEY);
        return;
    }

    localStorage.setItem(LISTING_DRAFT_KEY, JSON.stringify(drafts));
}

function getSavedListingDrafts() {
    try {
        const drafts = JSON.parse(localStorage.getItem(LISTING_DRAFT_KEY) || 'null');
        return drafts?.version === LISTING_DRAFT_VERSION ? drafts : null;
    } catch (error) {
        localStorage.removeItem(LISTING_DRAFT_KEY);
        return null;
    }
}

function applyListingDraft(formType, draft) {
    if (!draft) {
        return;
    }

    const fields = getListingFormFields(formType);

    if (!fields) {
        return;
    }

    if (fields.title) fields.title.value = draft.title || '';
    if (fields.description) fields.description.value = draft.description || '';
    if (fields.category) fields.category.value = draft.category_id || '';
    populateSubcategorySelect(formType);
    if (fields.subcategory) fields.subcategory.value = draft.subcategory || '';
    if (fields.city) fields.city.value = draft.city_id || '';
    if (fields.price) fields.price.value = draft.price || '';

    state.selectedPromotionPlans[formType] = draft.promotion_plan || '';
    renderPromotionOptions(formType);
}

function restoreListingDrafts() {
    const drafts = getSavedListingDrafts();

    if (!drafts) {
        return;
    }

    applyListingDraft('product', drafts.product);
    applyListingDraft('service', drafts.service);

    if (['product', 'service'].includes(drafts.activeType)) {
        switchListingType(drafts.activeType);
    }
}

function clearListingDraft(formType) {
    const drafts = getSavedListingDrafts();

    if (!drafts) {
        return;
    }

    drafts[formType] = {};

    if (!hasListingDraftContent(drafts.product || {}) && !hasListingDraftContent(drafts.service || {})) {
        localStorage.removeItem(LISTING_DRAFT_KEY);
        return;
    }

    localStorage.setItem(LISTING_DRAFT_KEY, JSON.stringify(drafts));
}

function attachListingDraftListeners() {
    ['product', 'service'].forEach((formType) => {
        const fields = getListingFormFields(formType);

        if (!fields) {
            return;
        }

        fields.form.addEventListener('input', saveListingDrafts);
        fields.form.addEventListener('change', saveListingDrafts);
    });
}

function handleImageSelect(e, type) {
    const files = Array.from(e.target.files);
    state[type] = state[type] || [];
    const maxImageCount = getMaxImageCount();

    if (state[type].length + files.length > maxImageCount) {
        alert(`Можно добавить не более ${maxImageCount} фотографий`);
        e.target.value = '';
        return;
    }

    files.forEach((file) => {
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
            alert('Можно загрузить только фото или видео');
            return;
        }

        if (file.type.startsWith('image/') && file.size > MAX_IMAGE_SIZE_BYTES) {
            alert('Каждая фотография должна быть меньше 1.5 МБ');
            return;
        }

        if (file.type.startsWith('video/') && file.size > getMaxVideoSizeBytes()) {
            alert(`Видео должно быть меньше ${Math.round(getMaxVideoSizeBytes() / (1024 * 1024))} МБ`);
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

function handleAdminReviewAvatarSelect(e) {
    const file = e.target.files[0];

    if (!file) {
        return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
        alert('Аватарка должна быть меньше 1.5 МБ');
        e.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        state.adminReviewAvatar = event.target.result;
        renderImagePreview('adminReviewAvatar');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

function renderImagePreview(type) {
    const previewIdMap = {
        images: 'imagePreview',
        serviceImages: 'serviceImagePreview',
        adImages: 'adImagePreview',
        editImages: 'editImagePreview',
        reviewScreenshot: 'reviewScreenshotPreview',
        adminReviewAvatar: 'adminSeedReviewAvatarPreview'
    };

    const preview = document.getElementById(previewIdMap[type]);
    if (!preview) {
        return;
    }

    preview.innerHTML = '';

    const singleImageTypes = ['reviewScreenshot', 'adminReviewAvatar'];
    const images = singleImageTypes.includes(type) ? (state[type] ? [state[type]] : []) : state[type];

    images.forEach((image, index) => {
        const div = document.createElement('div');
        div.className = 'image-preview-item';
        div.innerHTML = `
            ${isMediaVideo(image)
                ? `<video src="${image}" muted playsinline controls></video>`
                : `<img src="${image}" alt="preview">`}
            <button type="button" onclick="removeImage('${type}', ${index})">✕</button>
        `;
        preview.appendChild(div);
    });
}

window.removeImage = function(type, index) {
    if (type === 'reviewScreenshot') {
        state.reviewScreenshot = null;
    } else if (type === 'adminReviewAvatar') {
        state.adminReviewAvatar = null;
    } else {
        state[type].splice(index, 1);
    }

    renderImagePreview(type);
};

function showPublishedPromotionPanel(listingId, title) {
    state.promotionListingId = listingId;
    state.promotionListingTitle = title;

    const info = document.getElementById('postPublishPromotionInfo');
    const panel = document.getElementById('postPublishPromotionPanel');

    if (info) {
        info.textContent = `Выберите срок продвижения для товара: ${title}`;
    }

    if (panel) {
        panel.classList.remove('hidden');
    }
}

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
    const formType = formIndex === 1 ? 'service' : 'product';
    const selectedPromotionPlan = state.selectedPromotionPlans[formType];

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
        let itemType = 'listing';
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
            itemType = 'service';
            body.images = state.serviceImages;
            if (state.servicePublicationRequired) {
                body.publication_plan = SERVICE_PUBLICATION_PLAN.key;
            }
        }

        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(body)
        });

        const result = await response.json();
        if (result.success || result.listing_id || result.service_id) {
            alert(result.payment_required ? 'Услуга создана. После оплаты она появится в ленте.' : 'Объявление опубликовано');
            const createdListingId = result.listing_id || result.service_id || null;
            const createdTitle = title;
            form.reset();
            state.images = [];
            state.serviceImages = [];
            state.adImages = [];
            renderImagePreview('images');
            renderImagePreview('serviceImages');
            renderImagePreview('adImages');
            populateSubcategorySelect('product');
            populateSubcategorySelect('service');
            state.selectedPromotionPlans[formType] = '';
            renderPromotionOptions(formType);
            clearListingDraft(formType);
            await refreshServicePublicationRequirement();

            if (result.payment_required && result.invoice_link) {
                openInvoiceLink(result.invoice_link, async (status) => {
                    if (status === 'paid') {
                        alert('Публикация услуги оплачена');
                        await loadMyItems();
                        await loadRandomListings();
                        await refreshServicePublicationRequirement();
                    }
                });
            } else if (createdListingId && selectedPromotionPlan) {
                openPromotionModal(createdListingId, createdTitle, itemType);
                await startPromotionPayment(selectedPromotionPlan);
            } else if (createdListingId && itemType === 'listing') {
                showPublishedPromotionPanel(createdListingId, createdTitle);
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
    const queryInput = document.getElementById('searchTriggerInput');
    state.filters.cityId = document.getElementById('citySelect').value;
    state.filters.query = queryInput ? queryInput.value.trim() : state.filters.query;

    try {
        const cityId = state.filters.cityId;
        const categoryId = state.filters.categoryId;
        if (categoryId) {
            state.lastCategoryId = categoryId;
        }
        const publications = await fetchPublications({ cityId, categoryId });
        const listings = sortPublications(applyListingFilters(publications), categoryId);
        const subcategoryName = getSubcategoryName(categoryId, state.filters.subcategoryId);
        state.currentListings = listings;
        document.getElementById('searchResultsSection').classList.remove('hidden');
        document.getElementById('searchResultsTitle').textContent = subcategoryName
            ? `Объявления: ${subcategoryName}`
            : categoryId
                ? `Объявления: ${getCategoryName(categoryId)}`
                : state.filters.query
                    ? `Результаты: ${state.filters.query}`
                    : 'Найденные объявления';
        document.getElementById('resetSearchResultsBtn')?.classList.toggle('hidden', !state.filters.query);
        renderListings(listings, 'searchResults');
        setSearchViewMode('results');
        closeFiltersModal();
        switchTab('search');
    } catch (error) {
        console.error('Search error:', error);
    }
}

window.resetSearchResults = function() {
    state.filters.query = '';
    const queryInput = document.getElementById('searchTriggerInput');

    if (queryInput) {
        queryInput.value = '';
    }

    updateSearchTriggerLabel();
    updateSearchSubmitVisibility();

    if (state.filters.categoryId || state.filters.cityId || state.filters.minPrice || state.filters.maxPrice || state.filters.subcategoryId || state.filters.sort !== 'default') {
        performSearch();
        return;
    }

    document.getElementById('resetSearchResultsBtn')?.classList.add('hidden');
    setSearchViewMode('home');
    loadRandomListings();
};

async function loadRandomListings() {
    try {
        const publications = await fetchPublications();
        const listings = sortPublications(publications, state.lastCategoryId);
        state.homeListings = listings;
        renderListings(listings, 'randomListings');
    } catch (error) {
        console.error('Error loading random listings:', error);
    }
}

function applyListingFilters(listings) {
    let filtered = [...listings];

    if (state.filters.query) {
        const normalizedQuery = state.filters.query.toLowerCase();
        filtered = filtered.filter((item) =>
            String(item.title || '').toLowerCase().includes(normalizedQuery)
            || String(item.description || '').toLowerCase().includes(normalizedQuery)
        );
    }

    if (state.filters.subcategoryId) {
        filtered = filtered.filter((item) => item.subcategory === state.filters.subcategoryId);
    }

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
        const publications = sortPublications([
            ...listings.map((item) => normalizePublication(item, 'listing')),
            ...services.map((item) => normalizePublication(item, 'service'))
        ]);

        state.myItems = publications;
        renderListings(publications, 'myItems');
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
        const isMedia = typeof image === 'string' && (image.startsWith('data:') || image.startsWith('http'));
        const categoryName = getCategoryName(item.category_id);
        const subcategoryName = getSubcategoryName(item.category_id, item.subcategory);
        const badgeText = subcategoryName || categoryName;
        const itemType = item.item_type || 'listing';
        const promotionBadge = item.is_premium
            ? '<div class="promotion-card-label">Продвигается</div>'
            : '';
        const statusBadge = item.status === 'archived'
            ? '<div class="publication-status publication-status-archived">Архивировано</div>'
            : item.status === 'pending_payment'
                ? '<div class="publication-status publication-status-pending">Ожидает оплаты</div>'
                : '';

        let content = `
            <div class="item-card-media">
                <div class="item-badge">${badgeText}</div>
                ${promotionBadge}
                <div class="item-image">
                    ${isMedia
                        ? isMediaVideo(image)
                            ? `<video src="${image}" muted playsinline></video>`
                            : `<img src="${image}" alt="${escapeHtml(item.title)}">`
                        : `<span>${image}</span>`}
                </div>
            </div>
            <div class="item-info">
                ${statusBadge}
                <div class="item-category-line">${categoryName}</div>
                <div class="item-title">${escapeHtml(item.title)}</div>
            <div class="item-price">${formatPrice(item.price)}</div>
                <div class="item-meta-row">
                    <div class="item-meta">${getCityName(item.city_id || item.city)}</div>
                    <div class="item-date">${item.created_at ? new Date(item.created_at).toLocaleDateString('ru-RU') : ''}</div>
                </div>
            </div>
        `;

        if (containerId.includes('my')) {
            const primaryAction = item.status === 'archived'
                ? `<button onclick="event.stopPropagation(); reactivateItem('${item.id}', '${itemType}')">Активировать</button>`
                : item.status === 'pending_payment'
                    ? `<button onclick="event.stopPropagation(); payServicePublication('${item.id}')">Оплатить публикацию</button>`
                    : `<button onclick="event.stopPropagation(); openPromotionModal('${item.id}', '${String(item.title).replace(/'/g, '&#39;')}', '${itemType}')">Продвинуть</button>`;
            content += `
                <div class="item-actions">
                    <button onclick="event.stopPropagation(); editItem('${item.id}', '${itemType}')">Редактировать</button>
                    ${primaryAction}
                    <button class="delete" onclick="event.stopPropagation(); deleteItem('${item.id}', '${itemType}')">Удалить</button>
                </div>
            `;
        }

        card.innerHTML = content;
        if (isAdminUser()) {
            const adminButton = document.createElement('button');
            adminButton.className = 'admin-remove-btn';
            adminButton.type = 'button';
            adminButton.textContent = '×';
            adminButton.title = 'Модерация объявления';
            adminButton.addEventListener('click', (event) => {
                event.stopPropagation();
                window.openAdminModerationModal(item);
            });
            card.appendChild(adminButton);
        }
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
            ${item.images.map((media) => isMediaVideo(media)
                ? `<video src="${media}" controls playsinline></video>`
                : `<img src="${media}" alt="${escapeHtml(item.title)}">`).join('')}
        </div>
    ` : '';
    const adminAction = isAdminUser()
        ? '<button class="admin-details-menu-btn" type="button" onclick="openAdminModerationModalFromDetails()" aria-label="Действия администратора">⋯</button>'
        : '';
    const statusLine = item.status === 'archived'
        ? '<div class="publication-status publication-status-archived">Архивировано</div>'
        : item.status === 'pending_payment'
            ? '<div class="publication-status publication-status-pending">Ожидает оплаты</div>'
            : '';

    content.innerHTML = `
        <div class="item-details-shell">
        <div class="item-details-topline">
            <span class="item-detail-chip">${categoryName}</span>
            ${subcategoryName ? `<span class="item-detail-chip item-detail-chip-muted">${subcategoryName}</span>` : ''}
        </div>
        ${statusLine}
        <h2>${item.title}</h2>
        <div class="item-details-meta">
            <span>${getCityName(item.city_id || item.city)}</span>
            <span>${new Date(item.created_at).toLocaleDateString('ru-RU')}</span>
        </div>
        ${gallery}
        <div class="item-details-price">${formatPrice(item.price)}</div>
        ${item.expires_at ? `<div class="info-text">Активно до ${new Date(item.expires_at).toLocaleDateString('ru-RU')}</div>` : ''}
        ${item.is_premium ? `<div class="promotion-status">В первой линии${item.premium_expires_at ? ` до ${new Date(item.premium_expires_at).toLocaleDateString('ru-RU')}` : ''}</div>` : ''}
        <div class="item-details-description">${item.description || 'Описание отсутствует'}</div>
        <div class="item-details-actions">
            <button class="btn btn-primary btn-block" onclick="openSellerChat()">Написать</button>
            <button class="btn btn-secondary btn-block" onclick="showSellerProfile()">Профиль продавца</button>
            <button class="btn btn-secondary btn-block" onclick="openReviewModal()">Оставить отзыв</button>
            ${adminAction}
        </div>
        <div class="item-reviews-section">
            <div class="section-divider compact">
                <div>
                    <p class="section-kicker">Отзывы</p>
                    <h3>Отзывы по объявлению</h3>
                </div>
            </div>
            <div id="itemReviewsList" class="reviews-list">
                <p class="info-text">Загрузка отзывов...</p>
            </div>
        </div>
        </div>
    `;

    modal.classList.remove('hidden');
    loadItemReviews(item);
}

window.closeItemModal = function() {
    document.getElementById('itemModal').classList.add('hidden');
};

window.showSellerProfile = async function() {
    if (!state.selectedItem?.user_id) {
        return;
    }

    closeItemModal();
    await showSellerProfilePage(state.selectedItem.user_id);
};

window.openSellerChat = async function() {
    if (!state.selectedItem?.user_id) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/users/profile/${state.selectedItem.user_id}`, {
            headers: getAuthHeaders(false)
        });
        const user = await response.json();

        if (!response.ok) {
            throw new Error(user.error || 'Не удалось загрузить профиль продавца');
        }

        if (!user.username) {
            alert('У этого продавца не указан username в Telegram.');
            return;
        }

        openTelegramUsername(user.username);
    } catch (error) {
        console.error('Error opening seller chat:', error);
        alert(error.message || 'Не удалось открыть чат с продавцом');
    }
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
        state.profileDraft = isOwnProfile
            ? {
                first_name: user.first_name || '',
                last_name: user.last_name || '',
                username: user.username || '',
                phone: user.phone || '',
                city: user.city || '',
                about: user.about || '',
                avatar_url: user.avatar_url || ''
            }
            : null;

        document.getElementById('profileViewInfo').innerHTML = renderProfileInfo(user, isOwnProfile);
        document.getElementById('profileSaveBtn').classList.toggle('hidden', !isOwnProfile);
        document.getElementById('profileLogoutBtn').classList.toggle('hidden', !isOwnProfile);

        renderReviews(user.reviews || [], canModerate);
        document.getElementById('profileModal').classList.remove('hidden');
    } catch (error) {
        console.error('Error loading profile:', error);
        alert('Ошибка при загрузке профиля');
    }
}

function renderReviewsMarkup(reviews, canModerate, emptyText = 'Пока нет отзывов.') {
    if (!reviews.length) {
        return `<p class="info-text">${emptyText}</p>`;
    }

    return reviews.map((review) => {
        const typeLabel = review.review_type === 'product' ? 'Отзыв о товаре' : 'Отзыв о продавце';
        const canDelete = canModerate || review.author_user_id === state.user?.id;
        const screenshotLink = canModerate && review.screenshot_url
            ? `<a class="review-screenshot-link" href="${review.screenshot_url}" target="_blank" rel="noreferrer">Скриншот</a>`
            : '';
        const authorName = review.is_admin_seeded || canModerate
            ? `<div class="review-author-name">${escapeHtml(review.author_name || 'Пользователь')}</div>`
            : '';
        const authorProfileButton = canModerate && !review.is_admin_seeded
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
                            ${authorName}
                            <div class="review-meta">${typeLabel}${review.listing_title ? ` • ${escapeHtml(review.listing_title)}` : ''} • ${new Date(review.created_at).toLocaleDateString('ru-RU')}</div>
                        </div>
                    </div>
                    <div class="review-actions">
                        ${screenshotLink}
                        ${authorProfileButton}
                        ${deleteButton}
                    </div>
                </div>
                <p class="review-text">${escapeHtml(review.text)}</p>
            </div>
        `;
    }).join('');
}

function renderReviews(reviews, canModerate, containerId = 'profileReviews', emptyText = 'Пока нет отзывов.') {
    const container = document.getElementById(containerId);

    if (!container) {
        return;
    }

    container.innerHTML = renderReviewsMarkup(reviews, canModerate, emptyText);
}

async function loadItemReviews(item) {
    const container = document.getElementById('itemReviewsList');

    if (!container || !item?.user_id) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/users/profile/${item.user_id}`, {
            headers: getAuthHeaders(false)
        });
        const user = await response.json();

        if (!response.ok) {
            throw new Error(user.error || 'Не удалось загрузить отзывы');
        }

        const itemReviews = (user.reviews || []).filter((review) => review.listing_id === item.id || review.service_id === item.id);
        renderReviews(itemReviews, state.user?.is_admin === true, 'itemReviewsList', 'По этому объявлению пока нет отзывов.');
    } catch (error) {
        console.error('Error loading item reviews:', error);
        container.innerHTML = '<p class="info-text">Не удалось загрузить отзывы.</p>';
    }
}

async function showSellerProfilePage(userId) {
    try {
        const response = await fetch(`${API_BASE}/users/profile/${userId}`, {
            headers: getAuthHeaders(false)
        });
        const user = await response.json();

        if (!response.ok) {
            throw new Error(user.error || 'Не удалось загрузить профиль');
        }

        if (state.activeSearchView !== 'seller') {
            state.sellerReturnView = state.activeSearchView || 'home';
        }

        state.viewedProfileId = userId;
        const canModerate = state.user?.is_admin === true;
        document.getElementById('sellerProfileContent').innerHTML = `
            <div class="seller-profile-card">
                <div class="seller-profile-avatar">
                    ${getAvatarMarkup(user.avatar_url)}
                </div>
                <div>
                    <h3>${getProfileDisplayName(user)}</h3>
                    <p>${getUsernameLink(user.username)}</p>
                    <p>${getCityName(user.city)}</p>
                    <p>${user.about || 'Пользователь пока ничего не рассказал о себе'}</p>
                </div>
            </div>
        `;

        renderReviews(user.reviews || [], canModerate, 'sellerProfileReviews');
        setSearchViewMode('seller');
        switchTab('search');
    } catch (error) {
        console.error('Error loading seller profile:', error);
        alert('Ошибка при загрузке профиля продавца');
    }
}

window.closeSellerProfilePage = function() {
    state.viewedProfileId = null;
    setSearchViewMode(state.sellerReturnView || 'home');
};

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
    state.profileDraft = null;
};

window.openProfileFieldEditor = function(fieldKey) {
    if (!state.profileDraft) {
        return;
    }

    const labels = {
        username: 'имя пользователя',
        first_name: 'имя',
        last_name: 'фамилию',
        phone: 'телефон',
        city: 'город',
        about: 'информацию о себе'
    };
    const currentValue = state.profileDraft[fieldKey] || '';
    const nextValue = window.prompt(`Введите ${labels[fieldKey] || 'значение'}`, currentValue);

    if (nextValue === null) {
        return;
    }

    state.profileDraft[fieldKey] = nextValue.trim();
    document.getElementById('profileViewInfo').innerHTML = renderProfileInfo(
        { ...state.user, ...state.profileDraft },
        true
    );
};

window.updateProfile = async function() {
    try {
        if (!state.profileDraft) {
            return;
        }

        const payload = {
            first_name: state.profileDraft.first_name || '',
            last_name: state.profileDraft.last_name || '',
            username: state.profileDraft.username || '',
            phone: state.profileDraft.phone || '',
            city: state.profileDraft.city || '',
            about: state.profileDraft.about || ''
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
        updateProfileButtonAvatar();
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

window.openPromotionModal = function(listingId, title = 'объявление', itemType = 'listing') {
    state.promotionListingId = listingId;
    state.promotionListingTitle = title;
    state.promotionTargetType = itemType;
    document.getElementById('promotionTargetInfo').textContent = `Выберите срок продвижения для объявления: ${title}`;
    renderPromotionModalPlans();
    document.getElementById('promotionModal').classList.remove('hidden');
};

window.closePromotionModal = function() {
    document.getElementById('promotionModal').classList.add('hidden');
};

function openInvoiceLink(invoiceLink, callback) {
    const safeInvoiceLink = String(invoiceLink || '').trim();

    if (!safeInvoiceLink) {
        alert('Не удалось открыть счет: ссылка на оплату не получена');
        if (callback) {
            callback('failed');
        }
        return;
    }

    const handleStatus = (status) => {
        if (status === 'failed') {
            alert('Telegram не смог открыть оплату. Попробуйте еще раз или обновите приложение.');
        }

        if (callback) {
            callback(status);
        }
    };

    if (tg?.openInvoice) {
        try {
            tg.openInvoice(safeInvoiceLink, handleStatus);
            return;
        } catch (error) {
            console.error('Telegram openInvoice failed:', error);
        }
    }

    if (tg?.openTelegramLink) {
        tg.openTelegramLink(safeInvoiceLink);
    } else {
        window.open(safeInvoiceLink, '_blank', 'noopener,noreferrer');
    }

    if (callback) {
        callback('opened');
    }
}

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
        const endpoint = state.promotionTargetType === 'service'
            ? `/services/${state.promotionListingId}/promotion/invoice`
            : `/listings/${state.promotionListingId}/promotion/invoice`;
        const response = await fetch(`${API_BASE}${endpoint}`, {
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

        openInvoiceLink(result.invoice_link, async (status) => {
            if (status === 'paid') {
                closePromotionModal();
                alert(`Продвижение оплачено: ${plan.label} за ${plan.stars} ⭐`);
                await loadMyItems();
                await loadRandomListings();
            }
        });
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
                listing_id: state.selectedItem.item_type === 'service' ? null : state.selectedItem.id,
                service_id: state.selectedItem.item_type === 'service' ? state.selectedItem.id : null,
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
            if (state.activeSearchView === 'seller') {
                await showSellerProfilePage(state.viewedProfileId);
            } else {
                await showUserProfile(state.viewedProfileId);
            }
        }

        await loadItemReviews(state.selectedItem);
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
            if (state.activeSearchView === 'seller') {
                await showSellerProfilePage(state.viewedProfileId);
            } else {
                await showUserProfile(state.viewedProfileId);
            }
        }

        if (state.selectedItem) {
            await loadItemReviews(state.selectedItem);
        }
    } catch (error) {
        console.error('Error deleting review:', error);
        alert(error.message || 'Ошибка при удалении отзыва');
    }
};

window.deleteItem = async function(itemId, itemType = 'listing') {
    if (!confirm('Вы уверены, что хотите удалить?')) {
        return;
    }

    try {
        const endpoint = itemType === 'service' ? `/services/${itemId}` : `/listings/${itemId}`;
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

window.payServicePublication = async function(serviceId) {
    try {
        const response = await fetch(`${API_BASE}/services/${serviceId}/publication/invoice`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                user_id: state.user.id,
                plan: SERVICE_PUBLICATION_PLAN.key
            })
        });
        const result = await response.json();

        if (!response.ok || !result.invoice_link) {
            throw new Error(result.error || 'Не удалось создать счет');
        }

        openInvoiceLink(result.invoice_link, async (status) => {
            if (status === 'paid') {
                alert('Публикация оплачена');
                await loadMyItems();
                await loadRandomListings();
                await refreshServicePublicationRequirement();
            }
        });
    } catch (error) {
        console.error('Error paying service publication:', error);
        alert(error.message || 'Ошибка оплаты публикации');
    }
};

window.reactivateItem = async function(itemId, itemType = 'listing') {
    try {
        const endpoint = itemType === 'service'
            ? `/services/${itemId}/reactivate`
            : `/listings/${itemId}/reactivate`;
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ user_id: state.user.id })
        });
        const result = await response.json();

        if (!response.ok || !result.success) {
            if (result.invoice_link) {
                openInvoiceLink(result.invoice_link, async (status) => {
                    if (status === 'paid') {
                        alert('Публикация активирована');
                        await loadMyItems();
                        await loadRandomListings();
                    }
                });
                return;
            }
            throw new Error(result.error || 'Не удалось активировать публикацию');
        }

        if (result.payment_required && result.invoice_link) {
            openInvoiceLink(result.invoice_link, async (status) => {
                if (status === 'paid') {
                    alert('Публикация активирована');
                    await loadMyItems();
                    await loadRandomListings();
                }
            });
            return;
        }

        alert('Публикация активирована на 1 месяц');
        await loadMyItems();
        await loadRandomListings();
    } catch (error) {
        console.error('Error reactivating item:', error);
        alert(error.message || 'Ошибка активации');
    }
};

window.openAdminModerationModal = function(item) {
    if (!isAdminUser()) {
        return;
    }

    state.adminModerationItem = {
        id: item.id,
        title: item.title || 'Объявление',
        item_type: item.item_type || 'listing',
        user_id: item.user_id
    };

    document.getElementById('adminModerationInfo').textContent =
        `Выберите действие для публикации «${state.adminModerationItem.title}».`;
    document.getElementById('adminModerationModal').classList.remove('hidden');
};

window.openAdminModerationModalFromDetails = function() {
    if (state.selectedItem) {
        window.openAdminModerationModal(state.selectedItem);
    }
};

window.closeAdminModerationModal = function() {
    document.getElementById('adminModerationModal').classList.add('hidden');
    state.adminModerationItem = null;
};

window.openAdminSeedReviewModal = function() {
    if (!isAdminUser()) {
        return;
    }

    const item = state.adminModerationItem || state.selectedItem;
    if (!item) {
        alert('Сначала выберите объявление');
        return;
    }

    state.adminModerationItem = {
        id: item.id,
        title: item.title || 'Объявление',
        item_type: item.item_type || 'listing',
        user_id: item.user_id
    };
    state.adminReviewAvatar = null;

    document.getElementById('adminSeedReviewInfo').textContent =
        `Отзыв будет добавлен к публикации «${state.adminModerationItem.title}».`;
    document.getElementById('adminSeedReviewName').value = '';
    document.getElementById('adminSeedReviewText').value = '';
    renderImagePreview('adminReviewAvatar');
    document.getElementById('adminModerationModal').classList.add('hidden');
    document.getElementById('adminSeedReviewModal').classList.remove('hidden');
};

window.closeAdminSeedReviewModal = function() {
    document.getElementById('adminSeedReviewModal').classList.add('hidden');
    state.adminReviewAvatar = null;
    renderImagePreview('adminReviewAvatar');
};

window.submitAdminSeedReview = async function() {
    const item = state.adminModerationItem;
    const authorName = document.getElementById('adminSeedReviewName').value.trim();
    const reviewText = document.getElementById('adminSeedReviewText').value.trim();

    if (!item) {
        alert('Сначала выберите объявление');
        return;
    }

    if (!authorName) {
        alert('Введите имя автора отзыва');
        return;
    }

    if (!reviewText) {
        alert('Введите текст отзыва');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/reviews/admin-seeded`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                target_user_id: item.user_id,
                listing_id: item.item_type === 'service' ? null : item.id,
                service_id: item.item_type === 'service' ? item.id : null,
                review_type: 'product',
                author_name: authorName,
                text: reviewText,
                avatar: state.adminReviewAvatar
            })
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Не удалось добавить отзыв');
        }

        alert('Отзыв добавлен');
        closeAdminSeedReviewModal();

        if (state.selectedItem?.id === item.id) {
            await loadItemReviews(state.selectedItem);
        }

        if (state.viewedProfileId === item.user_id) {
            if (state.activeSearchView === 'seller') {
                await showSellerProfilePage(item.user_id);
            } else {
                await showUserProfile(item.user_id);
            }
        }

        state.adminModerationItem = null;
    } catch (error) {
        console.error('Error adding admin seeded review:', error);
        alert(error.message || 'Ошибка при добавлении отзыва');
    }
};

async function refreshListingsAfterModeration() {
    await loadRandomListings();

    if (state.user?.id) {
        await loadMyItems();
    }

    if (state.activeSearchView === 'category' && state.activeCategoryId) {
        await openCategoryLanding(state.activeCategoryId, state.filters.subcategoryId);
        return;
    }

    if (state.activeSearchView === 'results') {
        await performSearch();
    }
}

window.adminDeleteSelectedItem = async function(banUser = false) {
    const item = state.adminModerationItem;

    if (!item) {
        return;
    }

    const confirmationText = banUser
        ? 'Удалить объявление и забанить пользователя?'
        : 'Удалить объявление?';

    if (!confirm(confirmationText)) {
        return;
    }

    try {
        const endpoint = item.item_type === 'service'
            ? `/services/${item.id}/admin`
            : `/listings/${item.id}/admin`;
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
            body: JSON.stringify({ ban_user: banUser })
        });
        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Не удалось выполнить действие');
        }

        if (state.selectedItem?.id === item.id) {
            closeItemModal();
            state.selectedItem = null;
        }

        closeAdminModerationModal();
        await refreshListingsAfterModeration();
        alert(banUser ? 'Объявление удалено, пользователь забанен' : 'Объявление удалено');
    } catch (error) {
        console.error('Admin moderation error:', error);
        alert(error.message || 'Ошибка модерации');
    }
};

window.openPlatformRulesModal = function() {
    document.getElementById('platformRulesModal').classList.remove('hidden');
};

window.closePlatformRulesModal = function() {
    document.getElementById('platformRulesModal').classList.add('hidden');
};

window.editItem = function(itemId, itemType = 'listing') {
    const item = state.myItems.find((entry) => entry.id === itemId && entry.item_type === itemType);

    if (!item) {
        alert('Объявление не найдено');
        return;
    }

    state.editingItem = item;
    state.editImages = item.images || [];

    document.getElementById('editTitle').value = item.title || '';
    document.getElementById('editDescription').value = item.description || '';
    document.getElementById('editCategory').value = item.category_id || '';
    updateEditSubcategorySelect();
    document.getElementById('editSubcategory').value = item.subcategory || '';
    document.getElementById('editCity').value = item.city_id || '';
    document.getElementById('editPrice').value = item.price || '';
    renderImagePreview('editImages');
    document.getElementById('editItemModal').classList.remove('hidden');
};

window.closeEditItemModal = function() {
    document.getElementById('editItemModal').classList.add('hidden');
    state.editingItem = null;
    state.editImages = [];
};

async function handleEditItemSubmit(event) {
    event.preventDefault();

    if (!state.editingItem) {
        return;
    }

    const itemType = state.editingItem.item_type || 'listing';
    const endpoint = itemType === 'service'
        ? `/services/${state.editingItem.id}`
        : `/listings/${state.editingItem.id}`;

    const payload = {
        user_id: state.user.id,
        title: document.getElementById('editTitle').value.trim(),
        description: document.getElementById('editDescription').value.trim(),
        category_id: document.getElementById('editCategory').value,
        subcategory: document.getElementById('editSubcategory').value,
        city_id: document.getElementById('editCity').value,
        price: parseFloat(document.getElementById('editPrice').value),
        images: state.editImages
    };

    if (!payload.title || !payload.category_id || !payload.city_id || !payload.price) {
        alert('Пожалуйста, заполните обязательные поля');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Не удалось сохранить изменения');
        }

        alert('Изменения сохранены');
        closeEditItemModal();
        await loadMyItems();
        await loadRandomListings();
    } catch (error) {
        console.error('Error updating item:', error);
        alert(error.message || 'Ошибка при сохранении');
    }
};

window.logout = function() {
    localStorage.removeItem('user_id');
    location.reload();
};
