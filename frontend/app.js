const tg = window.Telegram?.WebApp;
const MAX_IMAGE_COUNT = 4;
const MAX_IMAGE_SIZE_BYTES = 1572864;
const FALLBACK_TELEGRAM_ID_KEY = 'fallback_telegram_id';
const CLOTHING_CATEGORY_ID = 'cat-5';

let state = {
    user: null,
    categories: [],
    cities: [],
    currentListings: [],
    currentServices: [],
    images: [],
    serviceImages: [],
    adImages: [],
    reviewScreenshot: null,
    selectedItem: null,
    viewedProfileId: null
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
        username: telegramUser?.username || ''
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
    populateSelectElement(document.getElementById('categorySelect'), state.categories, 'Все категории');
    populateSelectElement(document.getElementById('profileCitySelect'), state.cities, 'Не указан');

    populateSelectElement(productCategorySelect, state.categories, null);
    populateSelectElement(productCitySelect, state.cities, null);
    populateSelectElement(serviceCategorySelect, state.categories, null);
    populateSelectElement(serviceCitySelect, state.cities, null);

    populateSubcategorySelect('product');
    populateSubcategorySelect('service');
}

function showMainApp() {
    document.getElementById('mainApp').classList.remove('hidden');
    loadRandomListings();
}

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

    document.getElementById('imageInput').addEventListener('change', (e) => handleImageSelect(e, 'images'));
    document.getElementById('serviceImageInput').addEventListener('change', (e) => handleImageSelect(e, 'serviceImages'));
    document.getElementById('adImageInput').addEventListener('change', (e) => handleImageSelect(e, 'adImages'));
    document.getElementById('reviewScreenshotInput').addEventListener('change', handleReviewScreenshotSelect);
}

function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach((tab) => tab.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    document.querySelectorAll('.tab-pane').forEach((pane) => pane.classList.add('hidden'));
    document.getElementById(tabName).classList.remove('hidden');

    if (tabName === 'my-items') {
        loadMyItems();
    }
}

function switchListingType(type) {
    document.querySelectorAll('.listing-type').forEach((btn) => btn.classList.remove('active'));
    document.querySelector(`[data-type="${type}"]`).classList.add('active');

    document.querySelectorAll('.form-section').forEach((section) => section.classList.add('hidden'));
    document.getElementById(`${type}Form`).classList.remove('hidden');
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
            form.reset();
            state.images = [];
            state.serviceImages = [];
            state.adImages = [];
            renderImagePreview('images');
            renderImagePreview('serviceImages');
            renderImagePreview('adImages');
            populateSubcategorySelect('product');
            populateSubcategorySelect('service');
        } else {
            alert(result.error || 'Ошибка при публикации');
        }
    } catch (error) {
        console.error('Error submitting listing:', error);
        alert('Ошибка при публикации объявления');
    }
}

async function performSearch() {
    const cityId = document.getElementById('citySelect').value;
    const categoryId = document.getElementById('categorySelect').value;

    try {
        const endpoint = `/listings/search?${cityId ? `city_id=${cityId}` : ''}${categoryId ? `${cityId ? '&' : ''}category_id=${categoryId}` : ''}`;
        const response = await fetch(`${API_BASE}${endpoint}`);
        const listings = await response.json();
        state.currentListings = listings;
        renderListings(listings, 'searchResults');
    } catch (error) {
        console.error('Search error:', error);
    }
}

async function loadRandomListings() {
    try {
        const response = await fetch(`${API_BASE}/listings/random?limit=20`);
        const listings = await response.json();
        renderListings(listings, 'randomListings');
    } catch (error) {
        console.error('Error loading random listings:', error);
    }
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
        const screenshotLink = canModerate && review.screenshot_url
            ? `<a class="review-screenshot-link" href="${review.screenshot_url}" target="_blank" rel="noreferrer">Скриншот</a>`
            : '';
        const deleteButton = canModerate
            ? `<button class="review-delete-btn" onclick="deleteReview('${review.id}')">✕</button>`
            : '';

        return `
            <div class="review-card">
                <div class="review-header">
                    <div>
                        <strong>${review.author_name}</strong>
                        <div class="review-meta">${typeLabel}${review.listing_title ? ` • ${review.listing_title}` : ''} • ${new Date(review.created_at).toLocaleDateString('ru-RU')}</div>
                    </div>
                    <div class="review-actions">
                        ${screenshotLink}
                        ${deleteButton}
                    </div>
                </div>
                <p class="review-text">${review.text}</p>
            </div>
        `;
    }).join('');
}

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
