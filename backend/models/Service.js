const db = require('./database');
const { v4: uuidv4 } = require('uuid');

function parseImages(images) {
  if (!images) {
    return [];
  }

  try {
    return JSON.parse(images);
  } catch (error) {
    return [];
  }
}

function withParsedImages(row) {
  if (!row) {
    return row;
  }

  return {
    ...row,
    images: parseImages(row.images)
  };
}

class Service {
  static async create(user_id, data) {
    const id = uuidv4();
    const { title, description, category_id, subcategory = '', city_id, price, images } = data;

    await db.run(
      `INSERT INTO services (id, user_id, title, description, category_id, subcategory, city_id, price, images, status, service_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', 0)`,
      [id, user_id, title, description, category_id, subcategory, city_id, price, images || '[]']
    );

    return id;
  }

  static async findByUserId(user_id) {
    const rows = await db.all(
      `SELECT * FROM services WHERE user_id = $1 ORDER BY created_at DESC`,
      [user_id]
    );

    return rows.map(withParsedImages);
  }

  static async findById(id) {
    const row = await db.get(`SELECT * FROM services WHERE id = $1`, [id]);
    return withParsedImages(row);
  }

  static async findByCityAndCategory(city_id, category_id) {
    let query = `SELECT * FROM services WHERE status = 'active'`;
    const params = [];

    if (city_id) {
      params.push(city_id);
      query += ` AND city_id = $${params.length}`;
    }

    if (category_id) {
      params.push(category_id);
      query += ` AND category_id = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC LIMIT 50`;

    const rows = await db.all(query, params);
    return rows.map(withParsedImages);
  }

  static async canAddService(user_id) {
    const row = await db.get(
      `SELECT COUNT(*) as count FROM services WHERE user_id = $1 AND is_paid = $2`,
      [user_id, false]
    );

    return Number(row?.count || 0) === 0;
  }

  static async delete(id, user_id) {
    const result = await db.run(
      `DELETE FROM services WHERE id = $1 AND user_id = $2`,
      [id, user_id]
    );

    return result.changes > 0;
  }
}

module.exports = Service;
