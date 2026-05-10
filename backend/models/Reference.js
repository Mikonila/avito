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
  { id: 'cat-4', name: 'Для дома', icon: '🪑' },
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
  { id: 'cat-7', name: 'Детское', icon: '🧸' },
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
  { id: 'cat-12', name: 'Бесплатно', icon: '⚙️' },
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

async function syncReferenceItems(tableName, items) {
  const existingRows = await db.all(`SELECT id, name FROM ${tableName}`);
  const rowsById = new Map(existingRows.map((row) => [row.id, row]));
  const renamedIds = new Set();

  for (const item of items) {
    const currentRow = rowsById.get(item.id);
    if (currentRow && currentRow.name !== item.name && !renamedIds.has(currentRow.id)) {
      await db.run(
        `UPDATE ${tableName} SET name = $1 WHERE id = $2`,
        [`__tmp__${tableName}_${currentRow.id}`, currentRow.id]
      );
      renamedIds.add(currentRow.id);
    }

    const conflictingRow = existingRows.find((row) => row.name === item.name && row.id !== item.id);
    if (conflictingRow && !renamedIds.has(conflictingRow.id)) {
      await db.run(
        `UPDATE ${tableName} SET name = $1 WHERE id = $2`,
        [`__tmp__${tableName}_${conflictingRow.id}`, conflictingRow.id]
      );
      renamedIds.add(conflictingRow.id);
    }
  }

  const upsertQuery = getInsertOrIgnoreQuery(tableName);
  for (const item of items) {
    await db.run(upsertQuery, [item.id, item.name]);
  }
}

async function initializeData() {
  await db.initializeDatabase();
  await syncReferenceItems('categories', CATEGORIES);
  await syncReferenceItems('cities', CITIES);
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
