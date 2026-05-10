const db = require('./database');

const CATEGORIES = [
  { id: 'cat-1', name: 'Электроника', icon: '💻' },
  {
    id: 'cat-2',
    name: 'Авто',
    icon: '🚗',
    subcategories: [
      { id: 'cars', name: 'Автомобили' },
      { id: 'moto', name: 'Мотоциклы' },
      { id: 'rent', name: 'Аренда' }
    ]
  },
  {
    id: 'cat-3',
    name: 'Недвижимость',
    icon: '🏠',
    subcategories: [
      { id: 'rent', name: 'Аренда' },
      { id: 'sale', name: 'Продажа' }
    ]
  },
  { id: 'cat-4', name: 'Для дома и дачи', icon: '🪑' },
  {
    id: 'cat-5',
    name: 'Одежда и обувь',
    icon: '👟',
    subcategories: [
      { id: 'men', name: 'Мужская' },
      { id: 'women', name: 'Женская' }
    ]
  },
  { id: 'cat-6', name: 'Хобби и отдых', icon: '🎣' },
  { id: 'cat-7', name: 'Для детей', icon: '🧸' },
  {
    id: 'cat-8',
    name: 'Услуги',
    icon: '🛠️',
    subcategories: [
      { id: 'visaran', name: 'Визаран' },
      { id: 'building', name: 'Строительные работы' },
      { id: 'cleaning', name: 'Клининг' },
      { id: 'exchange', name: 'Обмен валюты' }
    ]
  },
  { id: 'cat-9', name: 'Животные', icon: '🐾' },
  {
    id: 'cat-10',
    name: 'Бизнес',
    icon: '💼',
    subcategories: [
      { id: 'services', name: 'Услуги' },
      { id: 'accounting', name: 'Бухгалтерия' },
      { id: 'it', name: 'IT' }
    ]
  },
  {
    id: 'cat-11',
    name: 'Работа и подработка',
    icon: '🧑‍💼',
    subcategories: [
      { id: 'no-experience', name: 'Вакансии без опыта' },
      { id: 'specialist-search', name: 'Поиск специалиста' },
      { id: 'restaurants', name: 'Рестораны и заведения' }
    ]
  },
  { id: 'cat-12', name: 'Запчасти и аксессуары', icon: '⚙️' },
  { id: 'cat-13', name: 'Авиша', icon: '🎭' }
];

const CITIES = [
  { id: 'city-1', name: 'Подгорица' },
  { id: 'city-2', name: 'Бар' },
  { id: 'city-3', name: 'Котор' },
  { id: 'city-4', name: 'Будва' },
  { id: 'city-5', name: 'Тиват' },
  { id: 'city-6', name: 'Херцег-Нови' },
  { id: 'city-7', name: 'Цетине' },
  { id: 'city-8', name: 'Никшич' },
  { id: 'city-9', name: 'Плевля' },
  { id: 'city-10', name: 'Улцинь' }
];

function getInsertOrIgnoreQuery(tableName) {
  return `
    INSERT INTO ${tableName} (id, name)
    VALUES ($1, $2)
    ON CONFLICT (id) DO UPDATE SET name = excluded.name
  `;
}

async function initializeData() {
  await db.initializeDatabase();

  const categoryQuery = getInsertOrIgnoreQuery('categories');
  const cityQuery = getInsertOrIgnoreQuery('cities');

  for (const category of CATEGORIES) {
    await db.run(categoryQuery, [category.id, category.name]);
  }

  for (const city of CITIES) {
    await db.run(cityQuery, [city.id, city.name]);
  }
}

async function getCategories() {
  const rows = await db.all(`SELECT * FROM categories`);
  const rowMap = new Map(rows.map((row) => [row.id, row]));

  return CATEGORIES.map((category) => {
    const row = rowMap.get(category.id) || category;
    return {
      ...row,
      name: category.name || row.name,
      icon: category.icon || row.icon || '📦',
      subcategories: category.subcategories || []
    };
  });
}

async function getCities() {
  const rows = await db.all(`SELECT * FROM cities ORDER BY name`);
  return rows.length > 0 ? rows : CITIES;
}

function getCategoryById(id) {
  return db.get(`SELECT * FROM categories WHERE id = $1`, [id]);
}

function getCityById(id) {
  return db.get(`SELECT * FROM cities WHERE id = $1`, [id]);
}

module.exports = {
  CATEGORIES,
  CITIES,
  getCategories,
  getCategoryById,
  getCities,
  getCityById,
  initializeData
};
