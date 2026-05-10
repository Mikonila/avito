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

class Listing {
  static async create(user_id, data) {
    const id = uuidv4();
    const { title, description, category_id, city_id, price, images } = data;

    await db.run(
      `INSERT INTO listings (id, user_id, title, description, category_id, city_id, price, images, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')`,
      [id, user_id, title, description, category_id, city_id, price, images || '[]']
    );

    return id;
  }

  static async findById(id) {
    const row = await db.get(`SELECT * FROM listings WHERE id = $1`, [id]);
    return withParsedImages(row);
  }

  static async findByUserId(user_id) {
    const rows = await db.all(
      `SELECT * FROM listings WHERE user_id = $1 ORDER BY created_at DESC`,
      [user_id]
    );

    return rows.map(withParsedImages);
  }

  static async findByCityAndCategory(city_id, category_id) {
    let query = `SELECT * FROM listings WHERE status = 'active'`;
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

  static async getRandomListings(limit = 20) {
    const rows = await db.all(
      `SELECT * FROM listings WHERE status = 'active' ORDER BY RANDOM() LIMIT $1`,
      [limit]
    );

    return rows.map(withParsedImages);
  }

  static async incrementViews(id) {
    const result = await db.run(
      `UPDATE listings SET views = views + 1 WHERE id = $1`,
      [id]
    );

    return result.changes > 0;
  }

  static async delete(id, user_id) {
    const result = await db.run(
      `DELETE FROM listings WHERE id = $1 AND user_id = $2`,
      [id, user_id]
    );

    return result.changes > 0;
  }

  static async update(id, user_id, data) {
    const { title, description, price, category_id, city_id, images } = data;
    const result = await db.run(
      `UPDATE listings
       SET title = $1,
           description = $2,
           price = $3,
           category_id = $4,
           city_id = $5,
           images = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 AND user_id = $8`,
      [title, description, price, category_id, city_id, images || '[]', id, user_id]
    );

    return result.changes > 0;
  }
}

module.exports = Listing;
