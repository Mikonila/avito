const db = require('./database');

const CATEGORIES = [
  { id: 'cat-1', name: 'Elektronika' },
  { id: 'cat-2', name: 'Automobili' },
  { id: 'cat-3', name: 'Kuće i Stanovi' },
  { id: 'cat-4', name: 'Namještaj' },
  { id: 'cat-5', name: 'Odjeća i Obuća' },
  { id: 'cat-6', name: 'Knjige' },
  { id: 'cat-7', name: 'Igračke' },
  { id: 'cat-8', name: 'Sport i Rekreacija' },
  { id: 'cat-9', name: 'Domaci Ljubimci' },
  { id: 'cat-10', name: 'Usluge' },
  { id: 'cat-11', name: 'Poslovanje' },
  { id: 'cat-12', name: 'Razni' }
];

const CITIES = [
  { id: 'city-1', name: 'Podgorica' },
  { id: 'city-2', name: 'Bar' },
  { id: 'city-3', name: 'Kotor' },
  { id: 'city-4', name: 'Budva' },
  { id: 'city-5', name: 'Tivat' },
  { id: 'city-6', name: 'Herceg Novi' },
  { id: 'city-7', name: 'Cetinje' },
  { id: 'city-8', name: 'Nikšić' },
  { id: 'city-9', name: 'Pljevlja' },
  { id: 'city-10', name: 'Ulcinj' }
];

function getInsertOrIgnoreQuery(tableName) {
  if (db.getDialect() === 'postgres') {
    return `INSERT INTO ${tableName} (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`;
  }

  return `INSERT OR IGNORE INTO ${tableName} (id, name) VALUES ($1, $2)`;
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
