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

    query += ` ORDER BY
      CASE
        WHEN is_premium = TRUE AND (premium_expires_at IS NULL OR premium_expires_at > CURRENT_TIMESTAMP) THEN 0
        ELSE 1
      END,
      created_at DESC
      LIMIT 50`;

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

  static async deleteAny(id) {
    const result = await db.run(
      `DELETE FROM services WHERE id = $1`,
      [id]
    );

    return result.changes > 0;
  }

  static async update(id, user_id, data) {
    const { title, description, price, category_id, subcategory = '', city_id, images } = data;
    const result = await db.run(
      `UPDATE services
       SET title = $1,
           description = $2,
           price = $3,
           category_id = $4,
           subcategory = $5,
           city_id = $6,
           images = $7,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 AND user_id = $9`,
      [title, description, price, category_id, subcategory, city_id, images || '[]', id, user_id]
    );

    return result.changes > 0;
  }

  static async activatePromotion(id, days) {
    const service = await Service.findById(id);

    if (!service) {
      return null;
    }

    const now = new Date();
    const currentExpiry = service.premium_expires_at ? new Date(service.premium_expires_at) : null;
    const startDate = currentExpiry && currentExpiry > now ? currentExpiry : now;
    const nextExpiry = new Date(startDate.getTime() + (days * 24 * 60 * 60 * 1000));

    const result = await db.run(
      `UPDATE services
       SET is_premium = $1,
           premium_expires_at = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [true, nextExpiry.toISOString(), id]
    );

    return result.changes > 0 ? nextExpiry.toISOString() : null;
  }
}

module.exports = Service;
