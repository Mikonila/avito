// Telegram Web App API
const tg = window.Telegram?.WebApp;
const MAX_IMAGE_COUNT = 4;
const MAX_IMAGE_SIZE_BYTES = 1572864;

// Global state
let state = {
    user: null,
    categories: [],
    cities: [],
    currentListings: [],
    currentServices: [],
    images: [],
    serviceImages: [],
    adImages: []
};

// API Base URL
const API_BASE = '/api';

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Initialize Telegram Web App
        if (tg) {
            tg.ready();
            tg.expand();
        }

        // Hide loading, show register modal
        document.getElementById('loading').style.display = 'none';

        // Load references (categories and cities)
        await loadReferences();

        // Register or login user
        const user = await registerUser();
        if (user) {
            state.user = user;
            showMainApp();
            attachEventListeners();
        }
    } catch (error) {
        console.error('Initialization error:', error);
        alert('Greška pri inicijalizaciji');
    }
});

// Register user
async function registerUser() {
    return new Promise((resolve) => {
        document.getElementById('registerModal').classList.remove('hidden');
        document.getElementById('registerBtn').onclick = async () => {
            const phone = document.getElementById('phoneInput').value;
            if (!phone) {
                alert('Molim unesite broj telefona');
                return;
            }

            try {
                const response = await fetch(`${API_BASE}/users/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        telegram_id: tg?.initDataUnsafe?.user?.id || 'web-user-' + Date.now(),
                        first_name: tg?.initDataUnsafe?.user?.first_name || 'User',
                        last_name: tg?.initDataUnsafe?.user?.last_name || '',
                        username: tg?.initDataUnsafe?.user?.username || 'user'
                    })
                });

                const user = await response.json();
                localStorage.setItem('user_id', user.id);
                resolve(user);
            } catch (error) {
                console.error('Registration error:', error);
                alert('Greška pri registraciji');
                resolve(null);
            }
        };
    });
}

// Load categories and cities
async function loadReferences() {
    try {
        const [categoriesRes, citiesRes] = await Promise.all([
            fetch(`${API_BASE}/reference/categories`),
            fetch(`${API_BASE}/reference/cities`)
        ]);

        state.categories = await categoriesRes.json();
        state.cities = await citiesRes.json();

        // Populate select elements
        populateSelects();
    } catch (error) {
        console.error('Error loading references:', error);
    }
}

// Populate select elements
function populateSelects() {
    const categorySelects = document.querySelectorAll('.listing-form select:nth-of-type(1)');
    const citySelects = document.querySelectorAll('.listing-form select:nth-of-type(2)');
    const profileCitySelect = document.getElementById('profileCitySelect');
    const cityFilter = document.getElementById('citySelect');
    const categoryFilter = document.getElementById('categorySelect');

    [categorySelects, [profileCitySelect, cityFilter]].forEach((elements, type) => {
        elements.forEach(el => {
            if (el) {
                const options = type === 0 ? state.categories : state.cities;
                options.forEach(item => {
                    const option = document.createElement('option');
                    option.value = item.id;
                    option.textContent = item.name;
                    el.appendChild(option);
                });
            }
        });
    });

    [citySelects, [profileCitySelect, cityFilter]].forEach((elements, type) => {
        elements.forEach(el => {
            if (el) {
                const options = state.cities;
                options.forEach(item => {
                    const option = document.createElement('option');
                    option.value = item.id;
                    option.textContent = item.name;
                    el.appendChild(option);
                });
            }
        });
    });
}

// Show main app
function showMainApp() {
    document.getElementById('registerModal').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    loadRandomListings();
}

// Attach event listeners
function attachEventListeners() {
    // Tab navigation
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Search
    document.getElementById('searchBtn').addEventListener('click', performSearch);

    // Profile
    document.getElementById('profileBtn').addEventListener('click', showProfileModal);

    // Listing type tabs
    document.querySelectorAll('.listing-type').forEach(btn => {
        btn.addEventListener('click', () => switchListingType(btn.dataset.type));
    });

    // My items type tabs
    document.querySelectorAll('.my-items-type').forEach(btn => {
        btn.addEventListener('click', () => switchMyItemsType(btn.dataset.type));
    });

    // Forms
    document.querySelectorAll('.listing-form').forEach((form, index) => {
        form.addEventListener('submit', (e) => handleListingSubmit(e, index));
    });

    // Image inputs
    document.getElementById('imageInput').addEventListener('change', (e) => handleImageSelect(e, 'images'));
    document.getElementById('serviceImageInput').addEventListener('change', (e) => handleImageSelect(e, 'serviceImages'));
    document.getElementById('adImageInput').addEventListener('change', (e) => handleImageSelect(e, 'adImages'));
}

// Switch tab
function switchTab(tabName) {
    // Update active tab
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update active pane
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.add('hidden'));
    document.getElementById(tabName).classList.remove('hidden');

    // Load my items if switching to that tab
    if (tabName === 'my-items') {
        loadMyItems();
    }
}

// Switch listing type
function switchListingType(type) {
    document.querySelectorAll('.listing-type').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-type="${type}"]`).classList.add('active');

    document.querySelectorAll('.form-section').forEach(section => section.classList.add('hidden'));
    document.getElementById(`${type}Form`).classList.remove('hidden');
}

// Switch my items type
function switchMyItemsType(type) {
    document.querySelectorAll('.my-items-type').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-type="${type}"]`).classList.add('active');

    document.getElementById('myProducts').classList.toggle('hidden', type !== 'products');
    document.getElementById('myServices').classList.toggle('hidden', type !== 'services');
}

// Handle image selection
function handleImageSelect(e, type) {
    const files = Array.from(e.target.files);
    state[type] = state[type] || [];

    if (state[type].length + files.length > MAX_IMAGE_COUNT) {
        alert(`Možete dodati najviše ${MAX_IMAGE_COUNT} slike`);
        e.target.value = '';
        return;
    }

    files.forEach(file => {
        if (file.size > MAX_IMAGE_SIZE_BYTES) {
            alert('Svaka slika mora biti manja od 1.5 MB');
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

// Render image preview
function renderImagePreview(type) {
    const previewId = type === 'images' ? 'imagePreview' : type === 'serviceImages' ? 'serviceImagePreview' : 'adImagePreview';
    const preview = document.getElementById(previewId);
    preview.innerHTML = '';

    state[type].forEach((image, index) => {
        const div = document.createElement('div');
        div.className = 'image-preview-item';
        div.innerHTML = `
            <img src="${image}" alt="preview">
            <button type="button" onclick="removeImage('${type}', ${index})">✕</button>
        `;
        preview.appendChild(div);
    });
}

// Remove image
window.removeImage = function(type, index) {
    state[type].splice(index, 1);
    renderImagePreview(type);
};

// Handle listing submit
async function handleListingSubmit(e, formIndex) {
    e.preventDefault();
    const form = e.target;
    const inputs = form.querySelectorAll('input, textarea, select');
    const [title, description, categoryId, cityId, price] = [inputs[0].value, inputs[1].value, inputs[2].value, inputs[3].value, inputs[4].value];

    if (!title || !categoryId || !cityId || !price) {
        alert('Molim popunite obavezna polja');
        return;
    }

    try {
        let endpoint = '/listings/create';
        let body = {
            user_id: state.user.id,
            title,
            description,
            category_id: categoryId,
            city_id: cityId,
            price: parseFloat(price),
            images: state.images
        };

        // Determine type based on form index
        if (formIndex === 1) {
            endpoint = '/services/create';
            body.images = state.serviceImages;
        } else if (formIndex === 2) {
            // For ads, just show message
            alert('Reklama je plaćena. Kontaktirajte @helionstudio');
            return;
        }

        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const result = await response.json();
        if (result.success || result.listing_id || result.service_id) {
            alert('Oglas je objavljen!');
            form.reset();
            state.images = [];
            state.serviceImages = [];
            state.adImages = [];
            document.getElementById('imagePreview').innerHTML = '';
            document.getElementById('serviceImagePreview').innerHTML = '';
            document.getElementById('adImagePreview').innerHTML = '';
        } else {
            alert(result.error || 'Greška pri objavi');
        }
    } catch (error) {
        console.error('Error submitting listing:', error);
        alert('Greška pri objavi oglasa');
    }
}

// Perform search
async function performSearch() {
    const cityId = document.getElementById('citySelect').value;
    const categoryId = document.getElementById('categorySelect').value;

    try {
        const endpoint = `/listings/search?${cityId ? 'city_id=' + cityId : ''}${categoryId ? '&category_id=' + categoryId : ''}`;
        const response = await fetch(`${API_BASE}${endpoint}`);
        const listings = await response.json();
        state.currentListings = listings;
        renderListings(listings, 'searchResults');
    } catch (error) {
        console.error('Search error:', error);
    }
}

// Load random listings
async function loadRandomListings() {
    try {
        const response = await fetch(`${API_BASE}/listings/random?limit=20`);
        const listings = await response.json();
        renderListings(listings, 'randomListings');
    } catch (error) {
        console.error('Error loading random listings:', error);
    }
}

// Load my items
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

// Render listings
function renderListings(listings, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    if (listings.length === 0) {
        container.innerHTML = '<p style="grid-column: 1/-1; padding: 20px; text-align: center;">Nema dostupnih oglasa</p>';
        return;
    }

    listings.forEach(item => {
        const card = document.createElement('div');
        card.className = 'item-card';
        const image = item.images && item.images[0] ? item.images[0] : '📦';
        const isImage = typeof image === 'string' && (image.startsWith('data:') || image.startsWith('http'));

        let content = `
            <div class="item-image">
                ${isImage ? `<img src="${image}" alt="${item.title}">` : `<span>${image}</span>`}
            </div>
            <div class="item-info">
                <div class="item-title">${item.title}</div>
                <div class="item-price">${item.price} EUR</div>
                <div class="item-meta">${item.city_id || item.city || 'Različiti gradovi'}</div>
            </div>
        `;

        // Add action buttons if in my items
        if (containerId.includes('my')) {
            content += `
                <div class="item-actions">
                    <button onclick="editItem('${item.id}')">Uredi</button>
                    <button class="delete" onclick="deleteItem('${item.id}', '${containerId}')">Obriši</button>
                </div>
            `;
        } else {
            card.onclick = () => showItemDetails(item);
        }

        card.innerHTML = content;
        container.appendChild(card);
    });
}

// Show item details
function showItemDetails(item) {
    const modal = document.getElementById('itemModal');
    const content = document.getElementById('itemContent');

    const gallery = item.images && item.images.length > 0 ? `
        <div class="item-details-gallery">
            ${item.images.map(img => `<img src="${img}" alt="${item.title}">`).join('')}
        </div>
    ` : '';

    content.innerHTML = `
        <h2>${item.title}</h2>
        <div class="item-details-meta">
            <span>📍 ${item.city_id || 'Nepoznat grad'}</span>
            <span>👁️ ${item.views || 0} pregleda</span>
            <span>📅 ${new Date(item.created_at).toLocaleDateString('sr-ME')}</span>
        </div>
        ${gallery}
        <div class="item-details-price">${item.price} EUR</div>
        <div class="item-details-description">${item.description || 'Nema dostupnog opisa'}</div>
        <div class="item-details-contact">
            <strong>Kontaktiranje prodavca</strong>
            <p>Za više informacija kontaktirajte prodavca</p>
        </div>
    `;

    modal.classList.remove('hidden');
}

// Close item modal
window.closeItemModal = function() {
    document.getElementById('itemModal').classList.add('hidden');
};

// Show profile modal
async function showProfileModal() {
    try {
        const response = await fetch(`${API_BASE}/users/profile/${state.user.id}`);
        const user = await response.json();

        document.getElementById('profileInfo').innerHTML = `
            <p><strong>Korisničko ime:</strong> ${user.username || 'N/A'}</p>
            <p><strong>Ime:</strong> ${user.first_name} ${user.last_name || ''}</p>
            <p><strong>Telefon:</strong> ${user.phone || 'Nije postavljeno'}</p>
            <p><strong>Grad:</strong> ${user.city}</p>
        `;

        document.getElementById('profileCitySelect').value = user.city;
        document.getElementById('profilePhone').value = user.phone || '';

        document.getElementById('profileModal').classList.remove('hidden');
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

// Close profile modal
window.closeProfileModal = function() {
    document.getElementById('profileModal').classList.add('hidden');
};

// Update profile
window.updateProfile = async function() {
    try {
        const phone = document.getElementById('profilePhone').value;
        const city = document.getElementById('profileCitySelect').value;

        if (phone) {
            await fetch(`${API_BASE}/users/profile/${state.user.id}/phone`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone })
            });
        }

        if (city) {
            await fetch(`${API_BASE}/users/profile/${state.user.id}/city`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ city })
            });
        }

        alert('Profil je ažuriran');
        closeProfileModal();
    } catch (error) {
        console.error('Error updating profile:', error);
        alert('Greška pri ažuriranju profila');
    }
};

// Delete item
window.deleteItem = async function(itemId, containerId) {
    if (!confirm('Sigurno želite obrisati?')) return;

    try {
        const endpoint = containerId.includes('Products') ? `/listings/${itemId}` : `/services/${itemId}`;
        await fetch(`${API_BASE}${endpoint}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: state.user.id })
        });

        alert('Oglas je obrisan');
        loadMyItems();
    } catch (error) {
        console.error('Error deleting item:', error);
    }
};

// Edit item
window.editItem = function(itemId) {
    alert('Uređivanje je u razvoju');
};

// Logout
window.logout = function() {
    localStorage.removeItem('user_id');
    location.reload();
};
