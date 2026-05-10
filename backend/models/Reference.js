const db = require('./database');

const CATEGORIES = [
  { id: 'cat-1', name: 'Электроника' },
  { id: 'cat-2', name: 'Автомобили' },
  { id: 'cat-3', name: 'Жилье' },
  { id: 'cat-4', name: 'Мебель' },
  { id: 'cat-5', name: 'Одежда и обувь' },
  { id: 'cat-6', name: 'Книги' },
  { id: 'cat-7', name: 'Игрушки' },
  { id: 'cat-8', name: 'Спорт и отдых' },
  { id: 'cat-9', name: 'Домашние животные' },
  { id: 'cat-10', name: 'Услуги' },
  { id: 'cat-11', name: 'Бизнес' },
  { id: 'cat-12', name: 'Разное' }
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
  const rows = await db.all(`SELECT * FROM categories ORDER BY name`);
  return rows.length > 0 ? rows : CATEGORIES;
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
